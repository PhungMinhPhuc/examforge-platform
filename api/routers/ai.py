import os
# Set before any torch/OpenMP load anywhere in the process to avoid a Windows
# segfault from duplicate OpenMP runtimes when YOLO runs (see layout_analyzer.py).
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("OMP_NUM_THREADS", "1")

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header
from typing import List, Optional
from pydantic import BaseModel
import sys
import re
import uuid
import shutil
import asyncio
import tempfile
import threading
import traceback
from dotenv import load_dotenv

# The engine modules use top-level imports (e.g. `from utils...`, `from doctree...`),
# so the engine root must be on sys.path — mirror the scheme used by upload.py.
# Importing via `backend.src.engine...` instead breaks those internal imports
# (ModuleNotFoundError: No module named 'utils') and surfaces as a "normalization error".
ENGINE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend', 'src', 'engine'))
if ENGINE_PATH not in sys.path:
    sys.path.insert(0, ENGINE_PATH)

from ai.ai_engine import call_ai_normalization, normalize_pages_parallel, call_ai_chat
from doctree import doc_to_text, read_docx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

# Where extracted PDF figures are persisted so they survive between the /ai/normalize
# call and the later /upload/tex call (which resolves \includegraphics paths).
_default_storage = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage"))
IMG_STORAGE_PATH = os.getenv("IMG_STORAGE_PATH", _default_storage)
AI_FIGURE_DIR = os.path.join(IMG_STORAGE_PATH, "_ai_figures")

router = APIRouter(prefix="/ai", tags=["AI"])

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    prompt: str
    history: List[ChatMessage] = []


# Lazily-loaded, process-wide DocLayout-YOLO engine. Loading the .pt weights takes
# a couple of seconds, so we keep one instance instead of reloading per upload.
_layout_engine = None


def _get_layout_engine():
    global _layout_engine
    if _layout_engine is None:
        from ai.visionary.layout_analyzer import DocLayoutEngine
        _layout_engine = DocLayoutEngine()
    return _layout_engine


_INCLUDEGRAPHICS_RE = re.compile(r'\\includegraphics(\s*\[[^\]]*\])?\s*\{([^}]*)\}')


def _rewrite_figure_paths(latex: str, fig_map: dict) -> str:
    """Point every \\includegraphics at the persisted absolute figure path so the
    downstream parser (parse_visuals) can find and copy the real image. Figures are
    matched by basename, so it works whether the model emitted just the filename or a
    relative path prefix."""
    def repl(m):
        opts = m.group(1) or ""
        base = os.path.basename(m.group(2))
        if base in fig_map:
            return f"\\includegraphics{opts}{{{fig_map[base]}}}"
        return m.group(0)
    return _INCLUDEGRAPHICS_RE.sub(repl, latex)

# Async job store
# Normalizing a multi-page PDF (YOLO layout + several Gemini calls) can take tens of
# seconds, which would time out a synchronous request. So the work runs in a daemon
# thread and the client polls GET /ai/normalize/job/{job_id} for progress + result.
_ai_jobs: dict[str, dict] = {}
_ai_jobs_lock = threading.Lock()


def _set_ai_job(job_id: str, **kwargs):
    with _ai_jobs_lock:
        if job_id in _ai_jobs:
            _ai_jobs[job_id].update(kwargs)


def _process_normalize(raw_files, text, api_key, model, report, ai_provider='gemini', ai_base_url=None) -> dict:
    """Do the actual normalization. `report(stage, progress, total)` updates job
    progress. Returns {"questions": [...]}. Runs in a worker thread."""
    file_bytes_list = []      # standalone images + docx-derived images (single-shot path)
    file_mime_types = []
    final_text = text or ""

    pdf_questions = []        # questions produced by the multi-page parallel PDF path
    fig_map = {}              # figure basename -> persisted absolute path (for rewriting)

    for filename, mime, contents in raw_files:
        if mime and mime.startswith("image/"):
            file_bytes_list.append(contents)
            file_mime_types.append(mime)
        elif filename.endswith(".docx"):
            # Handle DOCX via Pandoc
            tmp_dir = tempfile.mkdtemp()
            try:
                docx_path = os.path.join(tmp_dir, f"temp_{uuid.uuid4().hex}.docx")
                media_dir = os.path.join(tmp_dir, "media")
                os.makedirs(media_dir, exist_ok=True)
                with open(docx_path, "wb") as out_f:
                    out_f.write(contents)

                # Đọc thẳng .docx: AI chỉ cần chữ, mà đi qua pandoc thì chữ dính
                # đầy \textbackslash, \{ \} và \pandocbounded{...}.
                tree, _figs = read_docx(docx_path, media_dir=media_dir)
                final_text += "\n" + doc_to_text(tree)

                persist_dir = os.path.join(AI_FIGURE_DIR, uuid.uuid4().hex)
                os.makedirs(persist_dir, exist_ok=True)

                for root, _, mfiles in os.walk(media_dir):
                    for mf in mfiles:
                        if mf.lower().endswith(('.png', '.jpg', '.jpeg', '.emf', '.wmf')):
                            mpath = os.path.join(root, mf)
                            dst = os.path.join(persist_dir, mf)
                            shutil.copy2(mpath, dst)
                            fig_map[mf] = dst.replace(os.sep, "/")
                            with open(dst, "rb") as mf_in:
                                file_bytes_list.append(mf_in.read())
                                file_mime_types.append("image/png")  # Fallback to image/png for API
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)
        elif filename.endswith(".pdf"):
            # Handle PDF via YOLO (layout) + batched parallel Gemini inference.
            tmp_dir = tempfile.mkdtemp()
            try:
                pdf_path = os.path.join(tmp_dir, f"temp_{uuid.uuid4().hex}.pdf")
                with open(pdf_path, "wb") as out_f:
                    out_f.write(contents)

                analyzer = _get_layout_engine()
                page_images, figure_coords = analyzer.process_layout_engine(
                    pdf_path, tmp_dir,
                    progress_cb=lambda d, t: report("layout", d, t),
                )

                # Persist each cropped figure so it survives until /upload/tex,
                # and build the manifest the model uses to reference it by name.
                persist_dir = os.path.join(AI_FIGURE_DIR, uuid.uuid4().hex)
                os.makedirs(persist_dir, exist_ok=True)
                manifest = []
                for fig in figure_coords:
                    src = str(fig["path"])
                    base = os.path.basename(src)
                    dst = os.path.join(persist_dir, base)
                    shutil.copy2(src, dst)
                    fig_map[base] = dst.replace(os.sep, "/")
                    manifest.append({
                        "page": fig.get("page"),
                        "path": dst,
                        "filename": base,
                        "horizontal_scale": fig.get("horizontal_scale"),
                        "vertical_position": fig.get("vertical_position"),
                    })

                result = normalize_pages_parallel(
                    api_key,
                    [str(p) for p in page_images],
                    manifest,
                    model_name=model, ai_provider=ai_provider, ai_base_url=ai_base_url,
                    progress_cb=lambda d, t: report("ai", d, t),
                )
                pdf_questions.extend(result.get("questions", []))
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)
        else:
            # Unsupported file, just attach as binary (may fail)
            file_bytes_list.append(contents)
            file_mime_types.append(mime or "application/octet-stream")

    if not final_text and not file_bytes_list and not pdf_questions:
        raise ValueError("Must provide text or files to normalize")

    # Single-shot path for pasted text, standalone images and docx content.
    other_questions = []
    if file_bytes_list and not final_text and len(file_bytes_list) > 3:
        # If there are many discrete images, route through parallel batching to avoid long-context bias
        tmp_dir_img = tempfile.mkdtemp()
        try:
            page_images_tmp = []
            for i, fb in enumerate(file_bytes_list):
                img_path = os.path.join(tmp_dir_img, f"img_page_{i}.png")
                with open(img_path, "wb") as f:
                    f.write(fb)
                page_images_tmp.append(img_path)
                
            result = normalize_pages_parallel(
                api_key,
                page_images_tmp,
                [], # No layout analyzer for raw images currently
                model_name=model, ai_provider=ai_provider, ai_base_url=ai_base_url,
                progress_cb=lambda d, t: report("ai", d, t),
            )
            other_questions.extend(result.get("questions", []))
        finally:
            shutil.rmtree(tmp_dir_img, ignore_errors=True)
            
    elif final_text or file_bytes_list:
        report("ai", 0, 1)
        single = call_ai_normalization(
            api_key, file_bytes_list, file_mime_types,
            text_content=final_text, model_name=model, ai_provider=ai_provider, ai_base_url=ai_base_url,
        )
        other_questions = single.get("questions", []) if isinstance(single, dict) else []
        report("ai", 1, 1)

    questions = pdf_questions + other_questions

    # Point every \includegraphics at the persisted figure file and renumber.
    if fig_map:
        for q in questions:
            if q.get("latex_code"):
                q["latex_code"] = _rewrite_figure_paths(q["latex_code"], fig_map)
    for n, q in enumerate(questions, 1):
        q["id"] = n

    return {"questions": questions}


def _run_normalize_job(job_id, raw_files, text, api_key, model, ai_provider='gemini', ai_base_url=None):
    """Daemon-thread worker; never raises — all outcomes go into the job store."""
    def report(stage, progress, total):
        _set_ai_job(job_id, stage=stage, progress=progress, total=total)

    try:
        result = _process_normalize(raw_files, text, api_key, model, report, ai_provider, ai_base_url)
        _set_ai_job(job_id, status="done", result=result)
    except Exception as e:
        traceback.print_exc()
        _set_ai_job(job_id, status="error", error=f"{type(e).__name__}: {e}")


@router.post("/normalize")
async def normalize_text_or_image(
    x_ai_provider: Optional[str] = Header(None),
    x_ai_base_url: Optional[str] = Header(None),
    x_ai_api_key: Optional[str] = Header(None),
    x_ai_model: Optional[str] = Header(None),
    x_gemini_api_key: Optional[str] = Header(None),
    x_gemini_model: Optional[str] = Header(None),
    text: Optional[str] = Form(None),
    files: List[UploadFile] = File(None)
):
    provider = x_ai_provider or "gemini"
    api_key = x_ai_api_key if x_ai_api_key else x_gemini_api_key
    if not api_key and provider == "gemini":
        raise HTTPException(status_code=400, detail="Missing API Key")
    model = x_ai_model or x_gemini_model or "gemini-3.5-flash"
    base_url = x_ai_base_url
    """
    Normalize raw text, images, docx or pdf into structured JSON questions.

    Returns a job_id immediately (status "processing"); poll
    GET /ai/normalize/job/{job_id} for progress and the result. Small inputs that
    finish within a few seconds are returned inline (status "done").
    """
    # Read uploaded files here (UploadFile.read is async); the heavy work runs in a thread.
    raw_files = []
    if files:
        # Sort files by filename to ensure pages are in order (e.g. page_1, page_2)
        sorted_files = sorted(files, key=lambda f: f.filename)
        for f in sorted_files:
            contents = await f.read()
            raw_files.append((f.filename or "", f.content_type or "", contents))

    if not (text and text.strip()) and not raw_files:
        raise HTTPException(status_code=400, detail="Must provide text or files to normalize")

    job_id = str(uuid.uuid4())
    with _ai_jobs_lock:
        _ai_jobs[job_id] = {
            "status": "processing", "stage": "queued",
            "progress": 0, "total": 0, "result": None, "error": None,
        }

    t = threading.Thread(
        target=_run_normalize_job,
        args=(job_id, raw_files, text, api_key, model, provider, base_url),
        daemon=True,
    )
    t.start()

    # Let quick jobs (pasted text, single image) return inline so the UI doesn't
    # have to poll for the common fast case.
    try:
        await asyncio.wait_for(asyncio.to_thread(t.join, 8), timeout=8)
    except asyncio.TimeoutError:
        pass

    with _ai_jobs_lock:
        job = dict(_ai_jobs[job_id])

    if job["status"] == "done":
        return {"job_id": job_id, "status": "done", "data": job["result"]}
    if job["status"] == "error":
        raise HTTPException(status_code=500, detail=job["error"])

    return {"job_id": job_id, "status": "processing",
            "stage": job["stage"], "progress": job["progress"], "total": job["total"]}


@router.get("/normalize/job/{job_id}")
async def get_normalize_job(job_id: str):
    """Poll normalization progress and retrieve the result when done."""
    with _ai_jobs_lock:
        job = _ai_jobs.get(job_id)
        job = dict(job) if job else None

    if job is None:
        raise HTTPException(status_code=404, detail="Job không tồn tại hoặc đã hết hạn")
    if job["status"] == "error":
        raise HTTPException(status_code=500, detail=job["error"])

    resp = {
        "job_id": job_id, "status": job["status"], "stage": job["stage"],
        "progress": job["progress"], "total": job["total"],
    }
    if job["status"] == "done":
        resp["data"] = job["result"]
    return resp

@router.post("/chat")
async def chat_with_ai(
    request: ChatRequest,
    x_ai_provider: Optional[str] = Header(None),
    x_ai_base_url: Optional[str] = Header(None),
    x_ai_api_key: Optional[str] = Header(None),
    x_ai_model: Optional[str] = Header(None),
    x_gemini_api_key: Optional[str] = Header(None),
    x_gemini_model: Optional[str] = Header(None)
):
    provider = x_ai_provider or "gemini"
    api_key = x_ai_api_key if x_ai_api_key else x_gemini_api_key
    if not api_key and provider == "gemini":
        raise HTTPException(status_code=400, detail="Missing API Key")
    model = x_ai_model or x_gemini_model or "gemini-3.5-flash"
    base_url = x_ai_base_url
    """
    Conversational endpoint for generating questions or explaining concepts.
    """
    try:
        history_dict = [{"role": m.role, "content": m.content} for m in request.history]
        response_text = call_ai_chat(api_key, request.prompt, history_dict, model_name=model, ai_provider=provider, ai_base_url=base_url)
        return {"response": response_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
