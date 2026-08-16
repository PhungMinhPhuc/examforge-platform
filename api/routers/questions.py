import os
import sys
import uuid
from datetime import datetime
from fastapi import APIRouter, Query, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks
from typing import Optional
from db import get_cursor
from auth import get_current_teacher
from models import (
    QuestionFilter, QuestionUpdateRequest, QuestionCreateRequest
)
from jsonb_utils import to_jsonb

ENGINE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "backend", "src", "engine")
if ENGINE_PATH not in sys.path:
    sys.path.insert(0, ENGINE_PATH)

from doctree.schema import validate as validate_tree
from doctree.adapt import normalize_figure_ids
from doctree.write.text import doc_to_text, normalize_short_answer
from doctree.figures import (
    InvalidImageStoragePath,
    get_image_storage_root,
    image_file_exists,
    image_path_to_public_url,
    resolve_image_file,
    validate_public_image_path,
)

router = APIRouter(prefix="/questions", tags=["Questions"])


def _public_image_row(row):
    """Tương thích các ảnh import từng bị lưu bằng absolute filesystem path."""
    image = dict(row)
    stored = str(image.get("storage_path") or "")
    normalized = stored.replace("\\", "/")
    if "/static/images/" in normalized:
        image["storage_path"] = "/static/images/" + normalized.split(
            "/static/images/", 1
        )[1]
        image["asset_exists"] = image_file_exists(image["storage_path"])
        return image
    if os.path.isabs(stored):
        root = os.path.realpath(get_image_storage_root())
        target = os.path.realpath(stored)
        try:
            if os.path.commonpath([root, target]) == root:
                image["storage_path"] = "/static/images/" + os.path.relpath(
                    target, root
                ).replace(os.sep, "/")
        except ValueError:
            pass
    image["asset_exists"] = image_file_exists(image.get("storage_path", ""))
    return image


def _check_tree(value, field_name: str):
    """Chặn cây content/solution hỏng trước khi ghi xuống DB — bỏ qua nếu vẫn
    là chuỗi thường (vd đáp án `sa`, không phải cây tài liệu)."""
    if not isinstance(value, dict):
        return
    normalize_figure_ids(value)
    errors = validate_tree(value)
    if errors:
        raise HTTPException(
            status_code=400,
            detail=f"Cây tài liệu ở trường '{field_name}' không hợp lệ: {errors}",
        )


@router.get("")
def list_questions(
    subject: Optional[str] = Query(None),
    grade: Optional[int] = Query(None),
    chapter: Optional[str] = Query(None),
    lesson: Optional[str] = Query(None),
    question_type: Optional[str] = Query(None),
    complexity: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_teacher),
):
    conditions = ["q.deleted_at IS NULL", "q.parent_id IS NULL"]
    params = []

    # Teacher chỉ xem câu hỏi của mình; admin xem tất
    if current_user.get("role") == "teacher":
        conditions.append("q.teacher_id = %s")
        params.append(current_user["user_id"])

    if subject:
        conditions.append("q.subject = %s")
        params.append(subject)
    if grade:
        conditions.append("q.grade = %s")
        params.append(grade)
    if chapter:
        conditions.append("q.chapter = %s")
        params.append(chapter)
    if lesson:
        conditions.append("q.lesson = %s")
        params.append(lesson)
    if question_type:
        if question_type == 'st':
            conditions.append("q.question_type = 'st'")
        else:
            conditions.append("(q.question_type = %s OR (q.question_type = 'st' AND EXISTS (SELECT 1 FROM questions child WHERE child.parent_id = q.id AND child.question_type = %s)))")
            params.extend([question_type, question_type])
    if complexity:
        conditions.append("q.complexity = %s")
        params.append(complexity)
    if search:
        if search.isdigit():
            conditions.append("(q.content ILIKE %s OR q.id = %s OR EXISTS (SELECT 1 FROM questions child WHERE child.parent_id = q.id AND child.content ILIKE %s))")
            params.extend([f"%{search}%", int(search), f"%{search}%"])
        else:
            conditions.append("(q.content ILIKE %s OR EXISTS (SELECT 1 FROM questions child WHERE child.parent_id = q.id AND child.content ILIKE %s))")
            params.extend([f"%{search}%", f"%{search}%"])

    where_clause = " AND ".join(conditions)
    offset = (page - 1) * page_size

    with get_cursor() as (cur, conn):
        # Đếm tổng mục (top-level)
        cur.execute(f"SELECT COUNT(*) as total FROM questions q WHERE {where_clause}", params)
        total = cur.fetchone()["total"]

        # Đếm tổng số câu hỏi thực tế (đếm con nếu là st, đếm 1 nếu là câu đơn)
        cur.execute(f"""
            SELECT COALESCE(SUM(
                CASE 
                    WHEN q.question_type = 'st' THEN (SELECT COUNT(*) FROM questions child WHERE child.parent_id = q.id AND child.deleted_at IS NULL)
                    ELSE 1
                END
            ), 0) as total_questions
            FROM questions q WHERE {where_clause}
        """, params)
        total_questions = cur.fetchone()["total_questions"]

        # Lấy dữ liệu với phân trang
        cur.execute(
            f"""
            SELECT q.id, q.public_id, q.subject, q.grade, q.parent_id,
                   q.question_type, q.layout_type, q.content, q.solution,
                   q.chapter, q.lesson, q.complexity, q.is_shufflable,
                   t.name as teacher_name
            FROM questions q
            LEFT JOIN accounts t ON q.teacher_id = t.id
            WHERE {where_clause}
            ORDER BY q.id DESC
            LIMIT %s OFFSET %s
            """,
            params + [page_size, offset]
        )
        questions = [dict(row) for row in cur.fetchall()]

        if questions:
            q_ids = tuple(q["id"] for q in questions)
            
            # Map id -> object for fast lookup (will include children soon)
            q_map = {q["id"]: q for q in questions}

            # Lấy children cho st
            cur.execute(
                """
                SELECT id, parent_id, question_type, content, solution, complexity, subject, grade, chapter 
                FROM questions 
                WHERE parent_id IN %s
                ORDER BY id ASC
                """, 
                (q_ids,)
            )
            children = cur.fetchall()
            child_ids = []
            for child in children:
                c_dict = dict(child)
                child_ids.append(c_dict["id"])
                q_map[c_dict["id"]] = c_dict
                
                parent = q_map.get(c_dict["parent_id"])
                if parent:
                    if "children" not in parent: parent["children"] = []
                    parent["children"].append(c_dict)

            all_q_ids = tuple(list(q_ids) + child_ids)

            if all_q_ids:
                # Lấy images
                cur.execute("SELECT id, question_id, storage_path, img_type, width FROM q_images WHERE question_id IN %s", (all_q_ids,))
                for img in cur.fetchall():
                    q = q_map.get(img["question_id"])
                    if q:
                        if "images" not in q: q["images"] = []
                        q["images"].append(_public_image_row(img))

                # Lấy mc options
                cur.execute("SELECT id, question_id, content, is_correct FROM q_choice_details WHERE question_id IN %s", (all_q_ids,))
                for opt in cur.fetchall():
                    q = q_map.get(opt["question_id"])
                    if q:
                        if "options" not in q: q["options"] = []
                        q["options"].append(dict(opt))

                # Lấy tf options
                cur.execute("SELECT id, question_id, content, is_correct, order_index, explaination FROM q_truefalse_details WHERE question_id IN %s ORDER BY order_index", (all_q_ids,))
                for opt in cur.fetchall():
                    q = q_map.get(opt["question_id"])
                    if q:
                        if "options" not in q: q["options"] = []
                        q["options"].append(dict(opt))

                # Lấy sa options
                cur.execute("SELECT question_id, content FROM q_shortans_details WHERE question_id IN %s", (all_q_ids,))
                for sa in cur.fetchall():
                    q = q_map.get(sa["question_id"])
                    if q:
                        if "options" not in q: q["options"] = []
                        q["options"].append(dict(sa))

    return {
        "total": total,
        "total_questions": total_questions,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "data": questions
    }


@router.get("/metadata/filters")
def get_metadata_filters(current_user: dict = Depends(get_current_teacher)):
    """Lấy danh sách chapter, lesson hiện có của giáo viên để làm gợi ý tự động điền"""
    with get_cursor() as (cur, conn):
        cur.execute(
            "SELECT DISTINCT chapter FROM questions WHERE teacher_id = %s AND deleted_at IS NULL AND chapter IS NOT NULL AND chapter != ''",
            (current_user["user_id"],)
        )
        chapters = [r["chapter"] for r in cur.fetchall()]
        
        cur.execute(
            "SELECT DISTINCT lesson FROM questions WHERE teacher_id = %s AND deleted_at IS NULL AND lesson IS NOT NULL AND lesson != ''",
            (current_user["user_id"],)
        )
        lessons = [r["lesson"] for r in cur.fetchall()]
        
    return {"chapters": chapters, "lessons": lessons}

@router.get("/subjects/list")
def get_subjects():
    """Trả danh sách môn học & chương/bài từ curriculum.py"""
    import sys, os
    engine_path = os.path.join(os.path.dirname(__file__), "..", "..", "backend", "src", "engine")
    if engine_path not in sys.path:
        sys.path.insert(0, engine_path)
    from data.curriculum import DATA
    return DATA

@router.get("/{question_id}")
def get_question(question_id: int, current_user: dict = Depends(get_current_teacher)):
    with get_cursor() as (cur, conn):
        cur.execute(
            """
            SELECT q.*, t.name as teacher_name
            FROM questions q
            LEFT JOIN accounts t ON q.teacher_id = t.id
            WHERE q.id = %s AND q.teacher_id = %s AND q.deleted_at IS NULL
            """,
            (question_id, current_user["user_id"])
        )
        question = cur.fetchone()
        if not question:
            raise HTTPException(status_code=404, detail="Câu hỏi không tồn tại")

        question = dict(question)

        # Lấy images
        cur.execute("SELECT * FROM q_images WHERE question_id = %s", (question_id,))
        question["images"] = [_public_image_row(r) for r in cur.fetchall()]

        # Lấy details theo loại
        q_type = question["question_type"]
        if q_type == "mc":
            cur.execute(
                "SELECT * FROM q_choice_details WHERE question_id = %s ORDER BY order_index",
                (question_id,)
            )
            question["details"] = [dict(r) for r in cur.fetchall()]
        elif q_type == "tf":
            cur.execute(
                "SELECT * FROM q_truefalse_details WHERE question_id = %s ORDER BY order_index",
                (question_id,)
            )
            question["details"] = [dict(r) for r in cur.fetchall()]
        elif q_type == "sa":
            cur.execute(
                "SELECT * FROM q_shortans_details WHERE question_id = %s",
                (question_id,)
            )
            question["details"] = [dict(r) for r in cur.fetchall()]
        elif q_type == "cd":
            cur.execute("SELECT * FROM q_coding_details WHERE question_id = %s", (question_id,))
            cd_row = cur.fetchone()
            if cd_row:
                question["coding_details"] = dict(cd_row)
            cur.execute("SELECT * FROM q_coding_testcases WHERE question_id = %s ORDER BY order_index", (question_id,))
            question["coding_testcases"] = [dict(r) for r in cur.fetchall()]
        else:
            question["details"] = []

        # Nếu là câu stimulus, lấy câu con
        if q_type == "st":
            cur.execute(
                "SELECT * FROM questions WHERE parent_id = %s AND deleted_at IS NULL ORDER BY id ASC",
                (question_id,)
            )
            children = [dict(r) for r in cur.fetchall()]
            
            if children:
                c_ids = tuple(c["id"] for c in children)
                
                # Hàm lấy details cho children
                def attach_details(c_list, c_ids_tuple):
                    # MC
                    cur.execute("SELECT * FROM q_choice_details WHERE question_id IN %s ORDER BY order_index", (c_ids_tuple,))
                    for opt in cur.fetchall():
                        c = next((x for x in c_list if x["id"] == opt["question_id"]), None)
                        if c:
                            if "details" not in c: c["details"] = []
                            c["details"].append(dict(opt))
                    
                    # TF
                    cur.execute("SELECT * FROM q_truefalse_details WHERE question_id IN %s ORDER BY order_index", (c_ids_tuple,))
                    for opt in cur.fetchall():
                        c = next((x for x in c_list if x["id"] == opt["question_id"]), None)
                        if c:
                            if "details" not in c: c["details"] = []
                            c["details"].append(dict(opt))
                    
                    # SA
                    cur.execute("SELECT * FROM q_shortans_details WHERE question_id IN %s", (c_ids_tuple,))
                    for opt in cur.fetchall():
                        c = next((x for x in c_list if x["id"] == opt["question_id"]), None)
                        if c:
                            if "details" not in c: c["details"] = []
                            c["details"].append(dict(opt))
                
                attach_details(children, c_ids)

            question["children"] = children

    return question


def regrade_question_submissions(question_id: int):
    """
    Chấm lại điểm cho tất cả bài làm liên quan đến câu hỏi này
    do đáp án/nội dung có thể đã thay đổi.
    """
    with get_cursor() as (cur, conn):
        # 1. Lấy thông tin cơ bản và đáp án đúng mới của câu hỏi
        cur.execute("SELECT question_type FROM questions WHERE id = %s", (question_id,))
        row = cur.fetchone()
        if not row:
            return
        q_type = row["question_type"]

        correct_content = ""
        correct_option_id = None
        valid_option_ids = set()
        correct_tf_str = ""
        
        if q_type == "mc":
            cur.execute("SELECT id, content, is_correct FROM q_choice_details WHERE question_id = %s", (question_id,))
            options = cur.fetchall()
            valid_option_ids = {option["id"] for option in options}
            correct_row = next((option for option in options if option["is_correct"]), None)
            if correct_row:
                correct_option_id = correct_row["id"]
                correct_content = correct_row["content"]
        elif q_type == "tf":
            cur.execute("SELECT order_index, is_correct FROM q_truefalse_details WHERE question_id = %s ORDER BY order_index", (question_id,))
            statements = cur.fetchall()
            correct_tf_str = "".join("T" if s["is_correct"] else "F" for s in statements)
        elif q_type == "sa":
            cur.execute("SELECT content FROM q_shortans_details WHERE question_id = %s", (question_id,))
            correct_row = cur.fetchone()
            correct_content = correct_row["content"] if correct_row else ""

        # 2. Tìm tất cả các submissions liên quan đến câu hỏi này
        cur.execute(
            """
            SELECT sos.id as submission_id, sos.student_choice, sos.contest_result_id,
                   cq.point_weight
            FROM student_option_submissions sos
            JOIN contest_results cr ON cr.id = sos.contest_result_id
            JOIN contests_questions cq ON cq.contest_id = cr.contest_id AND cq.question_id = sos.question_id
            WHERE sos.question_id = %s
            """,
            (question_id,)
        )
        submissions = cur.fetchall()

        affected_result_ids = set()

        # 3. Đánh giá lại điểm cho từng submission
        for sub in submissions:
            sub_id = sub["submission_id"]
            student_choice = sub["student_choice"] or ""
            weight = float(sub["point_weight"] or 1.0)
            earned = 0.0
            is_correct = False

            if q_type == "mc":
                selected_option_id = None
                try:
                    parsed_id = int(student_choice.strip())
                    if parsed_id in valid_option_ids:
                        selected_option_id = parsed_id
                except (TypeError, ValueError):
                    pass
                if selected_option_id is not None:
                    is_correct = selected_option_id == correct_option_id
                else:
                    # Tương thích các bài cũ đang lưu nội dung phương án.
                    # Nội dung lựa chọn là JSONB DocTree; bài làm cũ có thể
                    # lưu chữ hiển thị thay vì ID phương án.
                    is_correct = (
                        student_choice.strip() == doc_to_text(correct_content).strip()
                    )
                earned = weight if is_correct else 0.0
            elif q_type == "tf":
                match_count = sum(1 for a, b in zip(student_choice, correct_tf_str) if a == b)
                if len(correct_tf_str) > 0:
                    ratio = match_count / len(correct_tf_str)
                    earned = round(weight * ratio, 4)
                    is_correct = (match_count == len(correct_tf_str))
            elif q_type == "sa":
                is_correct = (student_choice.strip().lower() == correct_content.strip().lower())
                earned = weight if is_correct else 0.0

            cur.execute(
                """
                UPDATE student_option_submissions
                SET is_correct = %s, earned_point = %s
                WHERE id = %s
                """,
                (is_correct, earned, sub_id)
            )
            affected_result_ids.add(sub["contest_result_id"])

        # 4. Tính toán lại tổng điểm cho các bài làm bị ảnh hưởng
        if affected_result_ids:
            for result_id in affected_result_ids:
                cur.execute(
                    """
                    SELECT 
                        COALESCE(SUM(sos.earned_point), 0) as new_total,
                        COUNT(CASE WHEN sos.is_correct = false AND q.question_type IN ('mc', 'tf', 'sa') THEN 1 END) as new_wrong
                    FROM student_option_submissions sos
                    JOIN questions q ON q.id = sos.question_id
                    WHERE sos.contest_result_id = %s
                    """,
                    (result_id,)
                )
                agg = cur.fetchone()
                cur.execute(
                    """
                    UPDATE contest_results
                    SET total_score = %s, count_wrong_answers = %s
                    WHERE id = %s
                    """,
                    (agg["new_total"], agg["new_wrong"], result_id)
                )

        conn.commit()


@router.patch("/{question_id}")
def update_question(
    question_id: int,
    body: QuestionUpdateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_teacher),
):
    # Nested payloads belong to their dedicated coding/detail tables.  Passing
    # them into the generic questions UPDATE makes psycopg2 try to adapt a
    # Python dict/list as a scalar column value ("can't adapt type 'dict'").
    updates = {
        k: v
        for k, v in body.dict(
            exclude={"details", "coding_details", "coding_testcases"}
        ).items()
        if v is not None
    }

    with get_cursor() as (cur, conn):
        cur.execute("SELECT question_type FROM questions WHERE id = %s AND teacher_id = %s", (question_id, current_user["user_id"]))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Câu hỏi không tồn tại hoặc không có quyền")
        q_type = row["question_type"]

        if updates:
            for field in ("content", "solution"):
                if field in updates:
                    _check_tree(updates[field], field)
            set_clause = ", ".join(f"{k} = %s" for k in updates)
            values = [to_jsonb(v) for v in updates.values()] + [question_id]
            cur.execute(
                f"UPDATE questions SET {set_clause} WHERE id = %s",
                values
            )

        if body.details:
            table_name = None
            if q_type == "mc": table_name = "q_choice_details"
            elif q_type == "tf": table_name = "q_truefalse_details"
            elif q_type == "sa": table_name = "q_shortans_details"

            if table_name:
                for det in body.details:
                    det_updates = {k: v for k, v in det.dict(exclude={"id"}).items() if v is not None}
                    if q_type == "sa" and "content" in det_updates:
                        det_updates["content"] = normalize_short_answer(det_updates["content"])
                    if det_updates:
                        for field in ("content", "explaination"):
                            if field in det_updates:
                                _check_tree(det_updates[field], field)
                        d_set_clause = ", ".join(f"{k} = %s" for k in det_updates)
                        d_values = [to_jsonb(v) for v in det_updates.values()] + [det.id, question_id]
                        cur.execute(
                            f"UPDATE {table_name} SET {d_set_clause} WHERE id = %s AND question_id = %s",
                            d_values
                        )

        if q_type == "cd":
            if body.coding_details:
                cd_updates = {k: v for k, v in body.coding_details.dict().items() if v is not None}
                if cd_updates:
                    cur.execute("SELECT 1 FROM q_coding_details WHERE question_id = %s", (question_id,))
                    if cur.fetchone():
                        cd_set = ", ".join(f"{k} = %s" for k in cd_updates)
                        cd_vals = list(cd_updates.values()) + [question_id]
                        cur.execute(f"UPDATE q_coding_details SET {cd_set} WHERE question_id = %s", cd_vals)
                    else:
                        cd_cols = ["question_id"] + list(cd_updates.keys())
                        cd_vals = [question_id] + list(cd_updates.values())
                        placeholders = ", ".join(["%s"] * len(cd_vals))
                        cur.execute(f"INSERT INTO q_coding_details ({', '.join(cd_cols)}) VALUES ({placeholders})", cd_vals)

            if body.coding_testcases is not None:
                # To simplify, we delete existing and recreate
                cur.execute("DELETE FROM q_coding_testcases WHERE question_id = %s", (question_id,))
                for i, tc in enumerate(body.coding_testcases):
                    cur.execute(
                        """
                        INSERT INTO q_coding_testcases (question_id, input_data, output_data, point_weight, is_public, is_sample, description, order_index)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (question_id, tc.input_data, tc.output_data, tc.point_weight, tc.is_public, tc.is_sample, tc.description, i)
                    )

        conn.commit()

    background_tasks.add_task(regrade_question_submissions, question_id)

    return {"message": "Cập nhật thành công"}

@router.post("")
def create_question(
    body: QuestionCreateRequest,
    current_user: dict = Depends(get_current_teacher),
):
    if body.question_type == "cd":
        if body.coding_details is None:
            raise HTTPException(status_code=400, detail="Thiếu cấu hình câu lập trình")
        if (body.coding_details.max_submissions or 0) < 1:
            raise HTTPException(status_code=400, detail="Số lượt nộp phải lớn hơn 0")
        if not body.coding_testcases:
            raise HTTPException(status_code=400, detail="Câu lập trình phải có ít nhất một testcase")

    _check_tree(body.content, "content")
    _check_tree(body.solution, "solution")

    with get_cursor() as (cur, conn):
        cur.execute(
            """
            INSERT INTO questions (subject, grade, chapter, lesson, question_type, complexity, content, solution, teacher_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (body.subject, body.grade, body.chapter, body.lesson, body.question_type, body.complexity, to_jsonb(body.content), to_jsonb(body.solution), current_user["user_id"])
        )
        q_id = cur.fetchone()["id"]

        q_type = body.question_type
        if body.details:
            if q_type == "mc":
                for i, det in enumerate(body.details):
                    _check_tree(det.content, "content")
                    cur.execute(
                        "INSERT INTO q_choice_details (question_id, content, is_correct, order_index) VALUES (%s, %s, %s, %s)",
                        (q_id, to_jsonb(det.content), det.is_correct, i)
                    )
            elif q_type == "tf":
                for i, det in enumerate(body.details):
                    _check_tree(det.content, "content")
                    _check_tree(det.explaination, "explaination")
                    cur.execute(
                        "INSERT INTO q_truefalse_details (question_id, content, explaination, order_index) VALUES (%s, %s, %s, %s)",
                        (q_id, to_jsonb(det.content), to_jsonb(det.explaination), i)
                    )
            elif q_type == "sa":
                for i, det in enumerate(body.details):
                    cur.execute(
                        "INSERT INTO q_shortans_details (question_id, content) VALUES (%s, %s)",
                        (q_id, normalize_short_answer(det.content))
                    )

        if q_type == "cd":
            if body.coding_details:
                cd_updates = body.coding_details.dict(exclude_none=True)
                if cd_updates:
                    cd_cols = ["question_id"] + list(cd_updates.keys())
                    cd_vals = [q_id] + list(cd_updates.values())
                    placeholders = ", ".join(["%s"] * len(cd_vals))
                    cur.execute(f"INSERT INTO q_coding_details ({', '.join(cd_cols)}) VALUES ({placeholders})", cd_vals)

            if body.coding_testcases:
                for i, tc in enumerate(body.coding_testcases):
                    cur.execute(
                        """
                        INSERT INTO q_coding_testcases (question_id, input_data, output_data, point_weight, is_public, is_sample, description, order_index)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (q_id, tc.input_data, tc.output_data, tc.point_weight, tc.is_public, tc.is_sample, tc.description, i)
                    )

        cur.execute(
            "UPDATE teachers SET question_count=question_count+1 WHERE id=%s",
            (current_user["user_id"],),
        )
        conn.commit()

    return {"message": "Tạo câu hỏi thành công", "id": q_id}

@router.delete("/all")
def delete_all_questions(
    current_user: dict = Depends(get_current_teacher),
):
    """Soft-delete every question owned by the current teacher (parents and children).

    Declared BEFORE the /{question_id} route on purpose: FastAPI matches routes in
    order, and "all" would otherwise be captured by /{question_id} and fail int
    validation. Uses the same soft-delete (deleted_at) as single deletion so existing
    contests keep working and nothing is physically removed.
    """
    with get_cursor() as (cur, conn):
        cur.execute(
            "UPDATE questions SET deleted_at = NOW() WHERE teacher_id = %s AND deleted_at IS NULL",
            (current_user["user_id"],),
        )
        count = cur.rowcount
        if count:
            cur.execute(
                "UPDATE teachers SET question_count=GREATEST(question_count-%s,0) WHERE id=%s",
                (count, current_user["user_id"]),
            )
        conn.commit()
    return {"message": f"Đã xóa {count} câu hỏi", "count": count}


@router.delete("/{question_id}")
def delete_question(
    question_id: int,
    current_user: dict = Depends(get_current_teacher),
):
    with get_cursor() as (cur, conn):
        cur.execute(
            "UPDATE questions SET deleted_at = NOW() WHERE id = %s AND teacher_id = %s AND deleted_at IS NULL",
            (question_id, current_user["user_id"])
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Câu hỏi không tồn tại hoặc không có quyền")
        cur.execute(
            "UPDATE teachers SET question_count=GREATEST(question_count-1,0) WHERE id=%s",
            (current_user["user_id"],),
        )
        conn.commit()
    return {"message": "Đã xóa câu hỏi"}


@router.post("/images/edit")
async def edit_image(
    img_path: str = Form(...),
    file: UploadFile = File(...),
    current_user=Depends(get_current_teacher),
):
    try:
        public_path = validate_public_image_path(img_path)
        dest, _ = resolve_image_file(public_path)
    except (InvalidImageStoragePath, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # Ảnh SVG không được rasterize-ghi đè (sẽ làm hỏng file). Chỉ chỉnh tỉ lệ qua width.
    if dest.lower().endswith(".svg"):
        raise HTTPException(status_code=400, detail="Ảnh SVG được thay đổi bằng tỉ lệ, không ghi đè file")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    data = await file.read()
    with open(dest, "wb") as f:
        f.write(data)
    return {"ok": True}


@router.post("/images/scale")
def update_image_scale(
    img_path: str = Form(...),
    scale: float = Form(...),
    current_user=Depends(get_current_teacher),
):
    # Ảnh SVG: chỉ lưu tỉ lệ hiển thị vào DB, không đụng tới file.
    base = os.path.basename(img_path.replace("\\", "/"))
    if not base:
        raise HTTPException(status_code=400, detail="Invalid path")
    with get_cursor() as (cur, conn):
        cur.execute(
            "UPDATE q_images SET width = %s WHERE storage_path LIKE %s",
            (scale, f"%{base}"),
        )
        conn.commit()
    return {"ok": True}


_ALLOWED_UPLOAD_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB — chèn ảnh chụp/paste, không phải file thiết kế nặng


@router.post("/images/upload")
async def upload_image(
    question_id: int = Form(...),
    file: UploadFile = File(...),
    current_user=Depends(get_current_teacher),
):
    """Chèn MỘT ảnh MỚI (nút "Chèn ảnh" / Ctrl+V dán ảnh trong ô soạn) — khác
    /images/edit (cắt ảnh có sẵn) và /images/scale (đổi cỡ hiển thị): đây là
    ảnh CHƯA từng có q_images row, phải tạo mới rồi trả figure_id cho frontend
    gắn vào cây ngay (không đợi tải lại trang)."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_UPLOAD_EXT:
        raise HTTPException(status_code=400, detail="Chỉ nhận ảnh PNG/JPG/GIF/WEBP")
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Ảnh vượt quá 10MB")

    with get_cursor() as (cur, conn):
        cur.execute(
            "SELECT id FROM questions WHERE id = %s AND teacher_id = %s",
            (question_id, current_user["user_id"]),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Câu hỏi không tồn tại hoặc không có quyền")

        img_storage = get_image_storage_root()
        now = datetime.now()
        rel_dir = os.path.join(str(now.year), f"{now.month:02d}")
        dest_dir = os.path.join(img_storage, rel_dir)
        os.makedirs(dest_dir, exist_ok=True)
        fname = f"{uuid.uuid4()}_upload{ext}"
        with open(os.path.join(dest_dir, fname), "wb") as f:
            f.write(data)
        url_path = image_path_to_public_url(os.path.join(dest_dir, fname))

        cur.execute(
            "INSERT INTO q_images (question_id, storage_path, img_type, width) "
            "VALUES (%s, %s, 'graphic', NULL) RETURNING id, storage_path, img_type, width",
            (question_id, url_path),
        )
        row = dict(cur.fetchone())
        conn.commit()
    return row
