import os
import sys
import json
import uuid

import shutil
import zipfile
import tempfile
import traceback
import asyncio
import threading
import time
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import FileResponse
from db import get_cursor
from auth import get_current_teacher
from models import UploadConfirmRequest, UploadAsContestRequest
from jsonb_utils import to_jsonb
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

ENGINE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "backend", "src", "engine")
if ENGINE_PATH not in sys.path:
    sys.path.insert(0, ENGINE_PATH)

from doctree.adapt import remap_figure_ids
from doctree.schema import validate
from doctree.write.text import normalize_short_answer
from doctree.figures import (
    InvalidImageStoragePath,
    get_image_storage_root,
    image_path_to_public_url,
    validate_public_image_path,
)

IMG_STORAGE_PATH = get_image_storage_root()

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


def _cleanup_expired_jobs(max_age_seconds: int = 24 * 3600):
    cutoff = time.time() - max_age_seconds
    with _jobs_lock:
        expired = [
            (job_id, job) for job_id, job in _jobs.items()
            if job.get("created_at", 0) < cutoff
        ]
        for job_id, _job in expired:
            _jobs.pop(job_id, None)
    for _job_id, job in expired:
        shutil.rmtree(job.get("job_dir", ""), ignore_errors=True)


# Background worker

def _run_job(job_id: str, file_path: str, job_dir: str,
             teacher_id: int, subject: str, grade: str,
             chapter: str, lesson: str, complexity: int):
    """Runs in a daemon thread; never raises — all errors go into _jobs."""
    succeeded = False
    try:
        os.makedirs(os.path.join(job_dir, "images"), exist_ok=True)
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
            img_dir = os.path.join(job_dir, "images")

        elif fname.endswith(".docx"):
            # Đọc thẳng .docx, không đi vòng qua pandoc nữa: bảng giữ được là
            # bảng, công thức Word giữ được là công thức.
            results = import_docx(
                file_path, teacher_id, subject, grade,
                chapter, lesson, complexity, os.path.join(job_dir, "images"),
            )
            final_tex = None

        else:  # .tex or .txt
            final_tex = file_path
            img_dir = os.path.join(job_dir, "images")

        if final_tex is not None:
            results = import_tex(
                final_tex, teacher_id, subject, grade,
                chapter, lesson, complexity, img_dir,
            )

        # Rewrite image storage paths to relative URLs
        staging_images = os.path.join(job_dir, "images")
        for item in results:
            for img in item.get("table_images", []):
                sp = img.get("storage_path")
                if sp:
                    try:
                        if str(sp).replace("\\", "/").startswith("/static/images/"):
                            rel = str(sp).replace("\\", "/")[len("/static/images/"):]
                            sp = os.path.join(staging_images, *rel.split("/"))
                            img["storage_path"] = sp
                        else:
                            rel = os.path.relpath(sp, staging_images)
                        img["url"] = f"/upload/job/{job_id}/asset/{rel.replace(os.sep, '/')}"
                    except Exception:
                        img["url"] = None

        _set_job(job_id, status="done", result=results)
        succeeded = True

    except Exception as exc:
        tb = traceback.format_exc()
        print(f"[upload job {job_id}] ERROR: {exc}\n{tb}")
        _set_job(job_id, status="error", error=str(exc), traceback=tb)
    finally:
        # Job thành công phải giữ staging cho tới Confirm/Hủy; job lỗi mới dọn ngay.
        if not succeeded:
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

    _cleanup_expired_jobs()
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
            "job_dir": job_dir,
            "teacher_id": current_user["user_id"],
            "created_at": time.time(),
        }

    t = threading.Thread(
        target=_run_job,
        args=(job_id, file_path, job_dir,
              teacher_id, subject, grade, chapter, lesson, complexity),
        daemon=True,
    )
    t.start()

    # Next.js dev/proxy đóng upstream ở khoảng 30 giây. Chỉ chờ tối đa 20 giây
    # để các file nhẹ vẫn trả kết quả ngay; file nhiều TikZ/MathType phải trả
    # `processing` trước mốc proxy rồi để frontend poll `/upload/job/{id}`.
    # Job vẫn tiếp tục ở background thread, không bị hủy khi trả response này.
    sync_wait_seconds = 20
    try:
        await asyncio.wait_for(
            asyncio.to_thread(t.join, sync_wait_seconds),
            timeout=sync_wait_seconds,
        )
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
    job = _owned_job(job_id, current_user["user_id"])

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


def _owned_job(job_id: str, user_id: int) -> dict:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job or job.get("teacher_id") != user_id:
        raise HTTPException(404, "Phiên import không tồn tại")
    return job


@router.get("/job/{job_id}/asset/{asset_path:path}")
def get_staged_asset(job_id: str, asset_path: str):
    """Ảnh preview: job UUID là capability ngẫu nhiên; chỉ cho đọc trong images/."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Phiên import không tồn tại")
    root = os.path.realpath(os.path.join(job["job_dir"], "images"))
    target = os.path.realpath(os.path.join(root, asset_path))
    if os.path.commonpath([root, target]) != root or not os.path.isfile(target):
        raise HTTPException(404, "Ảnh không tồn tại")
    return FileResponse(target)


@router.post("/job/{job_id}/image")
async def upload_staged_image(
    job_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_teacher),
):
    """Chèn ảnh mới khi câu chưa có id CSDL; file chỉ sống trong staging."""
    job = _owned_job(job_id, current_user["user_id"])
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"):
        ext = ".png"
    temp_id = f"new-{uuid.uuid4()}"
    root = os.path.join(job["job_dir"], "images")
    os.makedirs(root, exist_ok=True)
    filename = temp_id + ext
    target = os.path.join(root, filename)
    with open(target, "wb") as output:
        output.write(await file.read())
    return {
        "id": temp_id,
        "storage_path": target,
        "url": f"/upload/job/{job_id}/asset/{filename}",
        "img_type": "graphic",
        "width": None,
        "raw_code": None,
    }


@router.delete("/job/{job_id}")
def cancel_upload_job(
    job_id: str,
    current_user: dict = Depends(get_current_teacher),
):
    job = _owned_job(job_id, current_user["user_id"])
    shutil.rmtree(job.get("job_dir", ""), ignore_errors=True)
    with _jobs_lock:
        _jobs.pop(job_id, None)
    return {"ok": True}


# Confirm (unchanged)

_doc = to_jsonb  # đã chuyển ra api/utils.py, dùng chung với routers/questions.py


def _validate_reviewed_data(data: list):
    errors = []
    for index, item in enumerate(data):
        figure_ids = {img.get("id") for img in item.get("table_images", [])}
        q = item.get("table_question", {})
        trees = [("content", q.get("content")), ("solution", q.get("solution"))]
        for detail_index, detail in enumerate(item.get("table_details", {}).get("records", [])):
            trees.append((f"details[{detail_index}].content", detail.get("content")))
            trees.append((f"details[{detail_index}].explaination", detail.get("explaination")))
        for label, tree in trees:
            if isinstance(tree, dict):
                errors.extend(
                    f"câu {index + 1}.{label}: {message}"
                    for message in validate(tree, figure_ids)
                )
    if errors:
        raise HTTPException(400, detail={"message": "Dữ liệu preview không hợp lệ", "errors": errors[:100]})


def _used_figure_ids(node, found=None):
    found = set() if found is None else found
    if isinstance(node, dict):
        if node.get("type") in ("image", "image_inline"):
            found.add(node.get("figure_id"))
        for key in ("content", "items", "rows", "columns"):
            _used_figure_ids(node.get(key), found)
    elif isinstance(node, list):
        for child in node:
            _used_figure_ids(child, found)
    return found


def _prune_unused_images(data: list):
    """Ảnh bị xóa trong preview không được chèn thành q_images/file mồ côi."""
    for item in data:
        q = item.get("table_question", {})
        details = item.get("table_details", {}).get("records", [])
        used = set()
        for tree in [q.get("content"), q.get("solution")]:
            _used_figure_ids(tree, used)
        for detail in details:
            _used_figure_ids(detail.get("content"), used)
            _used_figure_ids(detail.get("explaination"), used)
        item["table_images"] = [
            image for image in item.get("table_images", []) if image.get("id") in used
        ]


def _materialize_job_images(data: list, job_id: str | None, user_id: int):
    """Copy staging vào kho chung ``storage/YYYY/MM``.

    ``job_id`` chỉ thuộc vòng đời preview, tuyệt đối không xuất hiện trong
    đường dẫn lâu dài. Tên UUID tránh đụng nhau giữa các lô import. Trả danh
    sách file vừa tạo để rollback chỉ xóa đúng file của giao dịch hiện tại.
    """
    if not job_id:
        for item in data:
            for image in item.get("table_images", []):
                try:
                    validate_public_image_path(image.get("storage_path"))
                except InvalidImageStoragePath as exc:
                    raise HTTPException(
                        400,
                        "Dữ liệu ảnh còn ở thư mục tạm; cần xác nhận bằng đúng job upload",
                    ) from exc
        return []
    job = _owned_job(job_id, user_id)
    source_root = os.path.realpath(os.path.join(job["job_dir"], "images"))
    now = time.localtime()
    destination_root = os.path.join(
        IMG_STORAGE_PATH,
        time.strftime("%Y", now),
        time.strftime("%m", now),
    )
    copied = {}
    materialized_paths = []
    for item in data:
        for image in item.get("table_images", []):
            source = os.path.realpath(image.get("storage_path") or "")
            try:
                inside_staging = os.path.commonpath([source_root, source]) == source_root
            except ValueError:
                inside_staging = False
            if not inside_staging or not os.path.isfile(source):
                raise HTTPException(400, f"Ảnh staging không tồn tại: {image.get('id')}")
            if source not in copied:
                original_name = os.path.basename(source)
                destination = os.path.join(
                    destination_root,
                    f"{uuid.uuid4().hex}_{original_name}",
                )
                os.makedirs(destination_root, exist_ok=True)
                shutil.copy2(source, destination)
                copied[source] = destination
                materialized_paths.append(destination)
            public_url = image_path_to_public_url(copied[source])
            # CSDL phải lưu URL web, không lưu đường dẫn tuyệt đối trên máy
            # backend. Preview dùng `url`, còn Ngân hàng đọc `storage_path`;
            # hai trường phải cùng trỏ tới URL công khai sau khi materialize.
            image["storage_path"] = public_url
            image["url"] = public_url
    return materialized_paths


def _rollback_materialized_images(paths):
    """Xóa đúng các file vừa materialize; không bao giờ xóa cả thư mục tháng."""
    storage_root = os.path.realpath(IMG_STORAGE_PATH)
    for path in paths or []:
        target = os.path.realpath(path)
        try:
            inside_storage = os.path.commonpath([storage_root, target]) == storage_root
        except ValueError:
            inside_storage = False
        if inside_storage and os.path.isfile(target):
            os.unlink(target)


def _finish_job(job_id: str | None):
    if not job_id:
        return
    with _jobs_lock:
        job = _jobs.pop(job_id, None)
    if job:
        shutil.rmtree(job.get("job_dir", ""), ignore_errors=True)


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

        # Ảnh phải chèn SAU câu hỏi (khóa ngoại question_id), nên lúc dựng cây
        # ở doctree.importer chỉ có id TẠM (bắt đầu từ 1). Chèn xong mới biết
        # id thật Postgres cấp — phải ánh xạ ngược rồi ghi đè lại content/
        # solution, nếu không figure_id trong cây trỏ sai hình.
        fig_map = {}
        for img in item.get("table_images", []):
            try:
                storage_path = validate_public_image_path(img.get("storage_path"))
            except InvalidImageStoragePath as exc:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "invalid_image_path",
                        "message": str(exc),
                        "image_id": img.get("id"),
                    },
                ) from exc
            cur.execute(
                "INSERT INTO q_images (question_id, storage_path, img_type, width, raw_code) "
                "VALUES (%s,%s,%s,%s,%s) RETURNING id",
                (new_id, storage_path, img.get("img_type"),
                 img.get("width"), img.get("raw_code")),
            )
            real_id = cur.fetchone()["id"]
            if img.get("id") is not None:
                fig_map[img["id"]] = real_id

        if fig_map:
            remap_figure_ids(q.get("content"), fig_map)
            remap_figure_ids(q.get("solution"), fig_map)
            cur.execute(
                "UPDATE questions SET content = %s, solution = %s WHERE id = %s",
                (_doc(q.get("content")), _doc(q.get("solution")), new_id),
            )

        details = item.get("table_details", {})
        target = details.get("target_table")
        records = details.get("records", [])
        if fig_map:
            for rec in records:
                remap_figure_ids(rec.get("content"), fig_map)
                remap_figure_ids(rec.get("explaination"), fig_map)

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
                    (new_id, normalize_short_answer(rec["content"])),
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
    _prune_unused_images(body.data)
    _validate_reviewed_data(body.data)
    materialized_paths = []
    try:
        materialized_paths = _materialize_job_images(
            body.data, body.job_id, current_user["user_id"]
        )
        with get_cursor() as (cur, conn):
            ids = _persist_questions(cur, body.data, current_user["user_id"], body.grade, body.subject)
            conn.commit()
    except Exception:
        _rollback_materialized_images(materialized_paths)
        raise
    _finish_job(body.job_id)

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

    _prune_unused_images(body.data)
    _validate_reviewed_data(body.data)
    materialized_paths = []
    try:
        materialized_paths = _materialize_job_images(
            body.data, body.job_id, current_user["user_id"]
        )
        with get_cursor() as (cur, conn):
            ids = _persist_questions(cur, body.data, current_user["user_id"], body.grade, body.subject)
            if not ids:
                raise HTTPException(400, "Không có câu hỏi nào để tạo đề")

            if body.class_id is not None:
                cur.execute(
                    "SELECT 1 FROM classes WHERE id=%s AND teacher_id=%s",
                    (body.class_id, current_user["user_id"]),
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=403, detail="Lớp không thuộc giáo viên")

            cur.execute(
                """
                INSERT INTO contests (teacher_id, title, time_limit, scoring_config, status)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, public_id
                """,
                (
                    current_user["user_id"], body.title, body.time_limit,
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
    except Exception:
        _rollback_materialized_images(materialized_paths)
        raise
    _finish_job(body.job_id)

    return {
        "contest_id": contest_id,
        "public_id": str(contest["public_id"]),
        "saved": len(ids),
        "message": f"Đã lưu {len(ids)} câu và tạo đề thi",
    }
