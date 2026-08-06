import os
import sys
import json
import uuid

from psycopg2.extras import Json
import shutil
import zipfile
import tempfile
import traceback
import asyncio
import threading
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Form, HTTPException, Depends
from db import get_cursor
from auth import get_current_teacher
from models import UploadConfirmRequest, UploadAsContestRequest
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

ENGINE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "backend", "src", "engine")
if ENGINE_PATH not in sys.path:
    sys.path.insert(0, ENGINE_PATH)

# Ensure IMG_STORAGE_PATH uses an absolute path relative to project root
# in case the server is started from a different working directory.
_default_storage = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage"))
IMG_STORAGE_PATH = os.getenv("IMG_STORAGE_PATH", _default_storage)

router = APIRouter(prefix="/upload", tags=["Upload"])

# In-memory job store
# { job_id: { status, progress, total, result, error } }
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def _set_job(job_id: str, **kwargs):
    with _jobs_lock:
        _jobs[job_id].update(kwargs)


def _progress_cb(job_id: str, done: int, total: int):
    _set_job(job_id, progress=done, total=total)


# Background worker

def _run_job(job_id: str, file_path: str, job_dir: str,
             teacher_id: int, subject: str, grade: str,
             chapter: str, lesson: str, complexity: int):
    """Runs in a daemon thread; never raises — all errors go into _jobs."""
    try:
        # Imports are inside the try so a missing module sets status="error"
        # instead of silently killing the thread and leaving status="processing".
        from doctree.importer import import_docx, import_tex

        fname = os.path.basename(file_path)

        if fname.endswith(".zip"):
            with zipfile.ZipFile(file_path, "r") as zf:
                zf.extractall(job_dir)
            tex_files = [
                os.path.join(root, fn)
                for root, _, files in os.walk(job_dir)
                for fn in files if fn.endswith(".tex")
            ]
            if not tex_files:
                raise ValueError("Không tìm thấy file .tex trong ZIP")
            final_tex = tex_files[0]
            img_dir = IMG_STORAGE_PATH

        elif fname.endswith(".docx"):
            # Đọc thẳng .docx, không đi vòng qua pandoc nữa: bảng giữ được là
            # bảng, công thức Word giữ được là công thức.
            results = import_docx(
                file_path, teacher_id, subject, grade,
                chapter, lesson, complexity, IMG_STORAGE_PATH,
            )
            final_tex = None

        else:  # .tex or .txt
            final_tex = file_path
            img_dir = IMG_STORAGE_PATH

        if final_tex is not None:
            results = import_tex(
                final_tex, teacher_id, subject, grade,
                chapter, lesson, complexity, img_dir,
            )

        # Rewrite image storage paths to relative URLs
        for item in results:
            for img in item.get("table_images", []):
                sp = img.get("storage_path")
                if sp:
                    try:
                        rel = os.path.relpath(sp, IMG_STORAGE_PATH)
                        img["url"] = f"/static/images/{rel.replace(os.sep, '/')}"
                    except Exception:
                        img["url"] = None

        _set_job(job_id, status="done", result=results)

    except Exception as exc:
        tb = traceback.format_exc()
        print(f"[upload job {job_id}] ERROR: {exc}\n{tb}")
        _set_job(job_id, status="error", error=str(exc), traceback=tb)
    finally:
        # job_dir is a temp directory that held the uploaded file and pandoc
        # working files.  Images for successful jobs are now in IMG_STORAGE_PATH,
        # so job_dir can always be removed.
        shutil.rmtree(job_dir, ignore_errors=True)


# Endpoints

@router.post("/tex")
async def upload_tex(
    file: UploadFile = File(...),
    teacher_id: int = Form(...),
    subject: str = Form(...),
    grade: str = Form(...),
    chapter: str = Form(""),
    lesson: str = Form(""),
    complexity: int = Form(1),
    current_user: dict = Depends(get_current_teacher),
):
    """
    Accept a .tex, .txt, .zip, or .docx file.

    For .docx files with MathType equations the conversion can take several
    minutes (pix2tex OCR per equation).  The endpoint returns a job_id
    immediately; poll GET /upload/job/{job_id} for progress and result.

    For .tex / .txt / .zip files the response is synchronous (fast).
    """
    if not file.filename.endswith((".tex", ".txt", ".zip", ".docx")):
        raise HTTPException(400, "Chỉ chấp nhận .tex, .txt, .zip hoặc .docx")

    os.makedirs(IMG_STORAGE_PATH, exist_ok=True)

    job_id = str(uuid.uuid4())
    job_dir = tempfile.mkdtemp(prefix=f"job_{job_id[:8]}_")

    raw = await file.read()
    file_path = os.path.join(job_dir, file.filename)
    with open(file_path, "wb") as fh:
        fh.write(raw)

    with _jobs_lock:
        _jobs[job_id] = {
            "status": "processing",
            "progress": 0,
            "total": 0,
            "result": None,
            "error": None,
        }

    t = threading.Thread(
        target=_run_job,
        args=(job_id, file_path, job_dir,
              teacher_id, subject, grade, chapter, lesson, complexity),
        daemon=True,
    )
    t.start()

    # Wait up to 60 s for the job to finish so the response is synchronous
    # for the common case (tex, zip, and docx without many MathType equations).
    # Only MathType-heavy DOCX files (many pix2tex calls) will exceed this and
    # fall through to return a job_id for the frontend to poll.
    try:
        await asyncio.wait_for(asyncio.to_thread(t.join, 60), timeout=60)
    except asyncio.TimeoutError:
        pass

    with _jobs_lock:
        job = dict(_jobs[job_id])

    if job["status"] == "done":
        return {"job_id": job_id, "status": "done",
                "count": len(job["result"]), "data": job["result"]}
    if job["status"] == "error":
        detail = job["error"]
        if job.get("traceback"):
            detail += "\n\n" + job["traceback"]
        raise HTTPException(500, detail=detail)

    # Still processing after 60 s — only happens for MathType-heavy DOCX.
    # The frontend should poll GET /upload/job/{job_id} for the result.
    return {"job_id": job_id, "status": "processing",
            "progress": job["progress"], "total": job["total"]}


@router.get("/job/{job_id}")
async def get_job_status(
    job_id: str,
    current_user: dict = Depends(get_current_teacher),
):
    """Poll conversion progress and retrieve result when done."""
    with _jobs_lock:
        job = _jobs.get(job_id)

    if job is None:
        raise HTTPException(404, "Job không tồn tại hoặc đã hết hạn")

    if job["status"] == "error":
        raise HTTPException(500, detail=job["error"])

    response = {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "total": job["total"],
    }
    if job["status"] == "done":
        response["count"] = len(job["result"])
        response["data"] = job["result"]
    return response


# Confirm (unchanged)

def _doc(value):
    """Bọc cây tài liệu cho cột jsonb.

    psycopg2 không tự biết một `dict` là jsonb, phải nói bằng `Json()`. Giá trị
    `None` để nguyên, vì cột cho phép NULL (câu không có lời giải chẳng hạn).
    """
    return Json(value) if isinstance(value, (dict, list)) else value


def _persist_questions(cur, data, teacher_id, grade, subject) -> list[int]:
    """Insert reviewed questions (and their images/details) into the DB.

    Returns the new question ids in the order they appear in `data` (parents and
    children alike) so a contest can be built from them. Must be called inside an
    open cursor/transaction; the caller commits.
    """
    id_map: dict[str, int] = {}
    created_ids: list[int] = []

    for item in data:
        q = item["table_question"]
        q["teacher_id"] = teacher_id
        q["grade"] = grade
        q["subject"] = subject

        internal_parent_id = id_map.get(q.get("parent_id")) if q.get("parent_id") else None

        cur.execute(
            """
            INSERT INTO questions (
                teacher_id, public_id, subject, grade, parent_id,
                question_type, layout_type, content, solution,
                chapter, lesson, complexity, is_shufflable
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
            """,
            (
                q["teacher_id"], q.get("public_id") or str(uuid.uuid4()),
                q["subject"], q["grade"], internal_parent_id,
                q.get("question_type"), q.get("layout_type"),
                _doc(q.get("content")), _doc(q.get("solution")),
                q.get("chapter", ""), q.get("lesson", ""),
                q.get("complexity", 1), q.get("is_shufflable", True),
            ),
        )
        new_id = cur.fetchone()["id"]
        created_ids.append(new_id)
        if q.get("public_id"):
            id_map[q["public_id"]] = new_id

        for img in item.get("table_images", []):
            cur.execute(
                "INSERT INTO q_images (question_id, storage_path, img_type, width, raw_code) VALUES (%s,%s,%s,%s,%s)",
                (new_id, img.get("storage_path"), img.get("img_type"),
                 img.get("width"), img.get("raw_code")),
            )

        details = item.get("table_details", {})
        target = details.get("target_table")
        records = details.get("records", [])

        if target == "q_choice_details":
            for idx, rec in enumerate(records):
                cur.execute(
                    "INSERT INTO q_choice_details (question_id, content, is_correct, order_index, is_shufflable) VALUES (%s,%s,%s,%s,%s)",
                    (new_id, _doc(rec["content"]), rec.get("is_correct", False),
                     rec.get("order_index", idx), rec.get("is_shufflable", True)),
                )
        elif target == "q_truefalse_details":
            for idx, rec in enumerate(records):
                cur.execute(
                    "INSERT INTO q_truefalse_details (question_id, content, is_correct, explaination, order_index, is_shufflable) VALUES (%s,%s,%s,%s,%s,%s)",
                    (new_id, _doc(rec["content"]), rec.get("is_correct", False),
                     _doc(rec.get("explaination") or rec.get("explanation")),
                     rec.get("order_index", idx), rec.get("is_shufflable", True)),
                )
        elif target == "q_shortans_details":
            for rec in records:
                cur.execute(
                    "INSERT INTO q_shortans_details (question_id, content) VALUES (%s,%s)",
                    (new_id, rec["content"]),
                )

    if created_ids:
        cur.execute(
            "UPDATE teachers SET question_count=question_count+%s WHERE id=%s",
            (len(created_ids), teacher_id),
        )
    return created_ids


@router.post("/confirm")
def confirm_upload(body: UploadConfirmRequest,
                   current_user: dict = Depends(get_current_teacher)):
    """Receive reviewed JSON and persist to database."""
    with get_cursor() as (cur, conn):
        ids = _persist_questions(cur, body.data, current_user["user_id"], body.grade, body.subject)
        conn.commit()

    return {"message": f"Đã lưu {len(body.data)} câu hỏi vào database", "ids": ids}


@router.post("/confirm-as-contest")
def confirm_as_contest(body: UploadAsContestRequest,
                       current_user: dict = Depends(get_current_teacher)):
    """Persist reviewed questions to the bank AND create a contest from them.

    Per the current decision the imported questions are always saved to the bank
    (no hidden/exam-only flag yet); the contest simply references them in order.
    """
    if any((item.get("table_question") or {}).get("question_type") == "cd" for item in body.data):
        raise HTTPException(400, "Câu lập trình phải được lưu vào ngân hàng rồi giao bằng module Bài tập lập trình")

    with get_cursor() as (cur, conn):
        ids = _persist_questions(cur, body.data, current_user["user_id"], body.grade, body.subject)
        if not ids:
            raise HTTPException(400, "Không có câu hỏi nào để tạo đề")

        cur.execute(
            """
            INSERT INTO contests (class_id, teacher_id, title, time_limit, scoring_config, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, public_id
            """,
            (
                body.class_id, current_user["user_id"], body.title, body.time_limit,
                json.dumps(body.scoring_config or {}), body.status,
            ),
        )
        contest = cur.fetchone()
        contest_id = contest["id"]
        if body.class_id is not None:
            cur.execute(
                "INSERT INTO class_contests(class_id,contest_id,assigned_by) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (body.class_id, contest_id, current_user["user_id"]),
            )
            if cur.rowcount:
                cur.execute("UPDATE classes SET contest_count=contest_count+1 WHERE id=%s", (body.class_id,))

        for order, q_id in enumerate(ids, 1):
            cur.execute(
                "INSERT INTO contests_questions (contest_id, question_id, original_order, point_weight) VALUES (%s,%s,%s,%s)",
                (contest_id, q_id, order, 1.0),
            )
        question_count = sum(
            (item.get("table_question") or {}).get("question_type") != "st"
            for item in body.data
        )
        cur.execute("UPDATE contests SET question_count=%s WHERE id=%s", (question_count, contest_id))
        conn.commit()

    return {
        "contest_id": contest_id,
        "public_id": str(contest["public_id"]),
        "saved": len(ids),
        "message": f"Đã lưu {len(ids)} câu và tạo đề thi",
    }
