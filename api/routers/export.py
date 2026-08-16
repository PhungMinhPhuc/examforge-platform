import os
import uuid
import threading
import time
import logging
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse
from db import get_cursor
from auth import get_current_teacher
from models import ExportExamRequest
import sys
import re

# Thêm engine parser vào path
ENGINE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "backend", "src", "engine")
if ENGINE_PATH not in sys.path:
    sys.path.insert(0, ENGINE_PATH)

from exporters.export_manager import export_contest_zip
from exporters.pdf_html import render_exam_preview_html
from doctree.write.docx_math import math_export_capabilities
from doctree.figures import image_file_exists

router = APIRouter(prefix="/export", tags=["Export"])

# In-Memory Queue State
executor = ThreadPoolExecutor(max_workers=2)
export_tasks = {}
export_tasks_lock = threading.RLock()
logger = logging.getLogger(__name__)


def _missing_images(images) -> list[dict]:
    missing = []
    for image in images or []:
        row = dict(image)
        storage_path = str(row.get("storage_path") or "")
        if image_file_exists(storage_path):
            continue
        missing.append({
            "image_id": row.get("id"),
            "question_id": row.get("question_id"),
            "filename": os.path.basename(storage_path.replace("\\", "/")),
            "storage_path": storage_path,
        })
    return missing


def _exports_dir() -> str:
    default_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", ".runtime", "exports")
    )
    return os.path.abspath(os.getenv("EXPORT_PATH", default_path))


def _cleanup_stale_export_tasks() -> None:
    """Xóa task/file quá hạn; chỉ xóa tệp nằm đúng trong thư mục exports."""
    ttl_seconds = max(300, int(os.getenv("EXPORT_TASK_TTL_SECONDS", "86400")))
    cutoff = time.time() - ttl_seconds
    exports_dir = _exports_dir()
    stale = []
    with export_tasks_lock:
        for task_id, task in export_tasks.items():
            if task.get("created_at", 0) < cutoff:
                stale.append((task_id, task.get("file_path")))
        for task_id, _path in stale:
            export_tasks.pop(task_id, None)
    for _task_id, file_path in stale:
        if not file_path:
            continue
        resolved = os.path.abspath(file_path)
        if os.path.commonpath([resolved, exports_dir]) != exports_dir:
            logger.error("Từ chối xóa export ngoài thư mục cho phép: %s", resolved)
            continue
        try:
            os.remove(resolved)
        except FileNotFoundError:
            pass
        except OSError:
            logger.warning("Không xóa được export quá hạn: %s", resolved, exc_info=True)


def _normalize_original_code(value) -> str:
    code = str(value or "").strip() or "000"
    code = re.sub(r"[^0-9A-Za-z_-]+", "_", code).strip("_")
    return (code or "000")[:32]


@router.get("/capabilities")
def get_export_capabilities(current_user: dict = Depends(get_current_teacher)):
    """Cho giao diện biết provider nào đang được cấu hình trên máy export."""
    return {"word": math_export_capabilities()}

def update_task_progress(task_id, progress, total, message):
    with export_tasks_lock:
        if task_id in export_tasks:
            export_tasks[task_id]["progress"] = progress
            export_tasks[task_id]["total"] = total
            export_tasks[task_id]["message"] = message

def run_export_task(task_id, contest_id, contest, questions, num_shuffles, formats, exam_title, general_info, department, exam_type, subject, duration, code_type, starting_code, code_step, random_length, original_code, word_equation_format="omml", word_option_layouts=None, shuffle_order=True, shuffle_options=True):
    try:
        with export_tasks_lock:
            export_tasks[task_id]["status"] = "processing"

        def progress_callback(progress, total, message):
            update_task_progress(task_id, progress, total, message)

        zip_buffer = export_contest_zip(
            contest, questions, num_shuffles, formats,
            exam_title, general_info, department, exam_type, subject, duration,
            code_type, starting_code, code_step, random_length,
            original_code=original_code,
            word_equation_format=word_equation_format,
            word_option_layouts=word_option_layouts,
            progress_callback=progress_callback,
            shuffle_order=shuffle_order, shuffle_options=shuffle_options,
        )
        
        # Save zip to file
        exports_dir = _exports_dir()
        os.makedirs(exports_dir, exist_ok=True)
        
        file_path = os.path.join(exports_dir, f"Export_{task_id}.zip")
        with open(file_path, "wb") as f:
            f.write(zip_buffer.getvalue())
            
        with export_tasks_lock:
            export_tasks[task_id]["status"] = "completed"
            export_tasks[task_id]["file_path"] = file_path
            export_tasks[task_id]["progress"] = 1 + num_shuffles
            export_tasks[task_id]["message"] = "Hoàn tất!"
        
    except Exception as e:
        logger.exception("Export task %s thất bại", task_id)
        with export_tasks_lock:
            if task_id in export_tasks:
                export_tasks[task_id]["status"] = "error"
                export_tasks[task_id]["message"] = "Xuất đề thất bại. Vui lòng thử lại hoặc chọn OMML."


@router.post("/exam/{contest_id}")
def export_exam(
    contest_id: int,
    payload: ExportExamRequest,
    current_user: dict = Depends(get_current_teacher)
):
    _cleanup_stale_export_tasks()
    formats = list(dict.fromkeys(payload.formats))
    if not formats:
        raise HTTPException(status_code=422, detail="Phải chọn ít nhất một định dạng xuất")
    num_shuffles = min(max(payload.num_shuffles, 0), 100)
    exam_title = payload.exam_title
    department = payload.department
    exam_type = payload.exam_type
    subject = payload.subject
    duration = min(max(payload.duration, 1), 1440)
    general_info = payload.general_info
    code_type = payload.code_type
    starting_code = payload.starting_code
    code_step = max(1, payload.code_step)
    random_length = min(max(payload.random_length, 1), 12)
    original_code = _normalize_original_code(payload.original_code)
    word_equation_format = payload.word_equation_format
    raw_word_layouts = payload.word_option_layouts
    word_option_layouts = {
        str(qid): int(cols)
        for qid, cols in raw_word_layouts.items()
        if str(qid).isdigit() and str(cols) in ("1", "2", "4")
    } if isinstance(raw_word_layouts, dict) else {}
    # Chế độ đảo: 'shuffle_mode' = 'order' (đảo đề) | 'options' (đảo câu) | 'both' (đề+câu, mặc định)
    shuffle_mode = payload.shuffle_mode
    shuffle_order = shuffle_mode in ("order", "both")
    shuffle_options = shuffle_mode in ("options", "both")

    with get_cursor() as (cur, conn):
        cur.execute(
            "SELECT * FROM contests WHERE id = %s AND teacher_id = %s",
            (contest_id, current_user["user_id"]),
        )
        contest = cur.fetchone()
        if not contest:
            raise HTTPException(status_code=404, detail="Đề thi không tồn tại")

        cur.execute(
            """
            SELECT q.id, q.question_type, q.layout_type, q.content, q.parent_id, q.solution,
                   q.complexity, q.is_shufflable, cq.original_order
            FROM contests_questions cq
            JOIN questions q ON q.id = cq.question_id
            WHERE cq.contest_id = %s AND q.deleted_at IS NULL
            ORDER BY cq.original_order
            """,
            (contest_id,)
        )
        questions = [dict(r) for r in cur.fetchall()]

        q_ids = tuple(q["id"] for q in questions) if questions else tuple()

        if q_ids:
            cur.execute("SELECT * FROM q_images WHERE question_id IN %s", (q_ids,))
            images = cur.fetchall()
            missing_images = _missing_images(images)
            if missing_images:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "missing_images",
                        "message": "Không thể xuất đề vì một số ảnh không tồn tại",
                        "images": missing_images[:100],
                        "total": len(missing_images),
                    },
                )
            img_map = {}
            for img in images:
                qid = img["question_id"]
                if qid not in img_map: img_map[qid] = []
                img_map[qid].append(dict(img))

            cur.execute("SELECT * FROM q_choice_details WHERE question_id IN %s ORDER BY order_index", (q_ids,))
            mc_opts = cur.fetchall()
            mc_map = {}
            for opt in mc_opts:
                qid = opt["question_id"]
                if qid not in mc_map: mc_map[qid] = []
                mc_map[qid].append(dict(opt))

            cur.execute("SELECT * FROM q_truefalse_details WHERE question_id IN %s ORDER BY order_index", (q_ids,))
            tf_opts = cur.fetchall()
            tf_map = {}
            for opt in tf_opts:
                qid = opt["question_id"]
                if qid not in tf_map: tf_map[qid] = []
                tf_map[qid].append(dict(opt))

            cur.execute("SELECT * FROM q_shortans_details WHERE question_id IN %s", (q_ids,))
            sa_opts = cur.fetchall()
            sa_map = {}
            for opt in sa_opts:
                qid = opt["question_id"]
                if qid not in sa_map: sa_map[qid] = []
                sa_map[qid].append(dict(opt))

            for q in questions:
                qid = q["id"]
                q["images"] = img_map.get(qid, [])
                qtype = q["question_type"]
                if qtype == "mc": q["options"] = mc_map.get(qid, [])
                elif qtype == "tf": q["options"] = tf_map.get(qid, [])
                elif qtype == "sa": q["options"] = sa_map.get(qid, [])
                else: q["options"] = []

        task_id = str(uuid.uuid4())
        task_info = {
            "status": "pending",
            "progress": 0,
            "total": 1 + num_shuffles,
            "message": "Đang xếp hàng chờ...",
            "file_path": None,
            "contest_id": contest_id,
            "owner_user_id": current_user["user_id"],
            "word_equation_format": word_equation_format,
            "exam_title": exam_title,
            "download_title": contest.get('title') or 'Export',
            "created_at": time.time(),
        }
        with export_tasks_lock:
            export_tasks[task_id] = task_info
        
        executor.submit(
            run_export_task,
            task_id, contest_id, dict(contest), questions, num_shuffles, formats,
            exam_title, general_info, department, exam_type, subject, duration,
            code_type, starting_code, code_step, random_length,
            original_code,
            word_equation_format,
            word_option_layouts,
            shuffle_order, shuffle_options,
        )
        
        return {"task_id": task_id, "status": "pending", "message": "Task queued successfully"}

@router.post("/exam/{contest_id}/preview")
def preview_exam(
    contest_id: int,
    payload: dict,
    current_user: dict = Depends(get_current_teacher)
):
    exam_title = payload.get("exam_title", "")
    department = payload.get("department", "")
    exam_type = payload.get("exam_type", "")
    subject = payload.get("subject", "")
    duration = payload.get("duration", 50)
    general_info = payload.get("general_info", "")
    original_code = _normalize_original_code(payload.get("original_code"))

    with get_cursor() as (cur, conn):
        cur.execute(
            "SELECT * FROM contests WHERE id = %s AND teacher_id = %s",
            (contest_id, current_user["user_id"]),
        )
        contest = cur.fetchone()
        if not contest:
            raise HTTPException(status_code=404, detail="Đề thi không tồn tại")

        cur.execute(
            """
            SELECT q.id, q.question_type, q.layout_type, q.content, q.parent_id, q.solution,
                   q.complexity, q.is_shufflable, cq.original_order
            FROM contests_questions cq
            JOIN questions q ON q.id = cq.question_id
            WHERE cq.contest_id = %s AND q.deleted_at IS NULL
            ORDER BY cq.original_order
            """,
            (contest_id,)
        )
        questions = [dict(r) for r in cur.fetchall()]

        q_ids = tuple(q["id"] for q in questions) if questions else tuple()

        if q_ids:
            cur.execute("SELECT * FROM q_images WHERE question_id IN %s", (q_ids,))
            images = cur.fetchall()
            missing_images = _missing_images(images)
            if missing_images:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "missing_images",
                        "message": "Không thể xem trước vì một số ảnh không tồn tại",
                        "images": missing_images[:100],
                        "total": len(missing_images),
                    },
                )
            img_map = {}
            for img in images:
                qid = img["question_id"]
                if qid not in img_map: img_map[qid] = []
                img_map[qid].append(dict(img))

            cur.execute("SELECT * FROM q_choice_details WHERE question_id IN %s ORDER BY order_index", (q_ids,))
            mc_opts = cur.fetchall()
            mc_map = {}
            for opt in mc_opts:
                qid = opt["question_id"]
                if qid not in mc_map: mc_map[qid] = []
                mc_map[qid].append(dict(opt))

            cur.execute("SELECT * FROM q_truefalse_details WHERE question_id IN %s ORDER BY order_index", (q_ids,))
            tf_opts = cur.fetchall()
            tf_map = {}
            for opt in tf_opts:
                qid = opt["question_id"]
                if qid not in tf_map: tf_map[qid] = []
                tf_map[qid].append(dict(opt))

            cur.execute("SELECT * FROM q_shortans_details WHERE question_id IN %s", (q_ids,))
            sa_opts = cur.fetchall()
            sa_map = {}
            for opt in sa_opts:
                qid = opt["question_id"]
                if qid not in sa_map: sa_map[qid] = []
                sa_map[qid].append(dict(opt))

            for q in questions:
                qid = q["id"]
                q["images"] = img_map.get(qid, [])
                qtype = q["question_type"]
                if qtype == "mc": q["options"] = mc_map.get(qid, [])
                elif qtype == "tf": q["options"] = tf_map.get(qid, [])
                elif qtype == "sa": q["options"] = sa_map.get(qid, [])
                else: q["options"] = []

    # Preview trong trình duyệt dùng Paged.js (client-side, không tốn server) —
    # phân trang riêng với bản PDF thật (Chromium, `render_exam_pdf`, dùng lúc
    # xuất file thật ở export_manager.py); mỗi bên tự dò-mồ-côi/tự sửa theo cơ
    # chế riêng phù hợp với thư viện phân trang của chính nó (xem
    # docs/phan-trang-anh-troi.md mục 3.2).
    html = render_exam_preview_html(
        dict(contest), questions, exam_title=exam_title, department=department,
        exam_type=exam_type, subject=subject, duration=duration,
        general_info=general_info, code=original_code, paginate_client=True,
    )
    return {"html": html}

@router.get("/status/{task_id}")
def get_export_status(task_id: str, current_user: dict = Depends(get_current_teacher)):
    _cleanup_stale_export_tasks()
    with export_tasks_lock:
        task_info = export_tasks.get(task_id)
        if not task_info or task_info.get("owner_user_id") != current_user["user_id"]:
            raise HTTPException(status_code=404, detail="Task not found")
        return {
            "status": task_info["status"],
            "progress": task_info["progress"],
            "total": task_info["total"],
            "message": task_info["message"],
            "contest_id": task_info["contest_id"],
            "word_equation_format": task_info["word_equation_format"],
        }

@router.get("/download/{task_id}")
def download_export(task_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_teacher)):
    _cleanup_stale_export_tasks()
    with export_tasks_lock:
        task_info = export_tasks.get(task_id)
        if not task_info or task_info.get("owner_user_id") != current_user["user_id"]:
            raise HTTPException(status_code=404, detail="Task not found")
    if task_info["status"] != "completed" or not task_info["file_path"]:
        raise HTTPException(status_code=400, detail="Task is not completed yet")
        
    file_path = task_info["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    def cleanup():
        try:
            os.remove(file_path)
            with export_tasks_lock:
                export_tasks.pop(task_id, None)
        except Exception:
            pass

    background_tasks.add_task(cleanup)

    import urllib.parse
    safe_filename = urllib.parse.quote(f"{task_info.get('download_title') or 'Export'}.zip")

    return FileResponse(
        path=file_path,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}"}
    )
