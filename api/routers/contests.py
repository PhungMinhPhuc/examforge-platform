import json
import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Body
from db import get_cursor
from auth import get_current_teacher, get_current_user, optional_user
from models import ContestCreateRequest, ContestSubmitRequest, StartContestRequest, RandomContestRequest, ContestUpdateRequest, AutosaveAnswerRequest, ContestLayoutRequest
from doctree.write.text import doc_to_text

router = APIRouter(prefix="/contests", tags=["Contests"])

# Thang điểm mặc định (theo quy chế thi THPT): TN 0.25/câu, ĐS 1.0/câu,
# TLN 0.5/câu, TL 1.0/câu. Dùng khi đề không lưu scoring_config.
DEFAULT_SCORING = {"mc": 0.25, "tf": 1.0, "sa": 0.5, "oe": 1.0}

# Câu Đúng/Sai (tf) chấm theo số ý đúng: 1 ý = 10%, 2 ý = 25%, 3 ý = 50%,
# 4 ý = 100% số điểm tối đa của câu (quy chế THPT, áp dụng cho câu có 4 ý).
TF_LADDER_4 = {0: 0.0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1.0}


def tf_score_fraction(match_count: int, total: int) -> float:
    """Tỉ lệ điểm (0..1) của một câu Đúng/Sai theo số ý trả lời đúng."""
    if total <= 0:
        return 0.0
    if total == 4:
        return TF_LADDER_4.get(match_count, 0.0)
    # Số ý khác 4: nội suy tuyến tính theo tỉ lệ ý đúng.
    return match_count / total


def weight_for_type(scoring_config: dict, qtype: str) -> float:
    """Số điểm tối đa của một câu theo loại, lấy từ scoring_config của đề."""
    if qtype == "st":
        return 0.0  # câu 'chung giả thiết' không tính điểm, điểm nằm ở câu con
    config = scoring_config or {}
    try:
        return float(config.get(qtype, DEFAULT_SCORING.get(qtype, 1.0)))
    except (TypeError, ValueError):
        return DEFAULT_SCORING.get(qtype, 1.0)


@router.get("")
def list_contests(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    uid = current_user["user_id"]

    with get_cursor() as (cur, conn):
        if role == "teacher":
            cur.execute(
                """
                SELECT ct.*, string_agg(DISTINCT assigned_cl.class_name, ', ') AS class_name
                FROM contests ct
                LEFT JOIN class_contests cc ON cc.contest_id=ct.id
                LEFT JOIN classes assigned_cl ON assigned_cl.id=cc.class_id
                WHERE ct.teacher_id = %s AND ct.status != 'deleted'
                  AND NOT EXISTS (
                      SELECT 1 FROM contests_questions legacy_cq
                      JOIN questions legacy_q ON legacy_q.id = legacy_cq.question_id
                      WHERE legacy_cq.contest_id = ct.id AND legacy_q.question_type = 'cd'
                  )
                GROUP BY ct.id
                ORDER BY ct.id DESC
                """,
                (uid,)
            )
        else:
            # Student: xem đề thi của lớp mình + đề public
            cur.execute(
                """
                SELECT ct.*, string_agg(DISTINCT assigned_cl.class_name, ', ') AS class_name,
                       (
                           SELECT json_agg(json_build_object(
                               'id', cr.id,
                               'start_time', cr.start_time,
                               'end_time', cr.end_time,
                               'total_score', cr.total_score
                           ) ORDER BY cr.id ASC)
                           FROM contest_results cr 
                           WHERE cr.contest_id = ct.id AND cr.student_id = %s AND cr.end_time IS NOT NULL
                       ) as attempts
                FROM contests ct
                LEFT JOIN class_contests cc ON cc.contest_id=ct.id
                LEFT JOIN classes assigned_cl ON assigned_cl.id=cc.class_id
                WHERE ((NOT EXISTS (SELECT 1 FROM class_contests x WHERE x.contest_id=ct.id))
                   OR EXISTS (
                    SELECT 1 FROM students_classes sc
                    WHERE sc.student_id=%s AND sc.class_id=cc.class_id
                ))
                AND ct.status = 'active'
                AND NOT EXISTS (
                    SELECT 1 FROM contests_questions legacy_cq
                    JOIN questions legacy_q ON legacy_q.id = legacy_cq.question_id
                    WHERE legacy_cq.contest_id = ct.id AND legacy_q.question_type = 'cd'
                )
                GROUP BY ct.id
                ORDER BY ct.id DESC
                """,
                (uid, uid)
            )
        return [dict(r) for r in cur.fetchall()]


@router.post("")
def create_contest(body: ContestCreateRequest, current_user: dict = Depends(get_current_teacher)):
    if body.due_at and body.available_from and body.due_at < body.available_from:
        raise HTTPException(status_code=400, detail="Hạn nộp phải sau thời điểm mở đề")
    with get_cursor() as (cur, conn):
        if body.class_id is not None:
            cur.execute(
                "SELECT 1 FROM classes WHERE id=%s AND teacher_id=%s",
                (body.class_id, current_user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Lớp không thuộc giáo viên")
        cur.execute(
            """
            INSERT INTO contests (teacher_id, title, time_limit, scoring_config, status,
                                  available_from, due_at, allow_late_submission)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, public_id
            """,
            (
                current_user["user_id"], body.title, body.time_limit,
                json.dumps(body.scoring_config), body.status, body.available_from,
                body.due_at, body.allow_late_submission
            )
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

        # Validate ST questions have at least 2 children
        st_parent_ids = []
        child_parent_ids = []
        qtype_map = {}
        if body.question_ids:
            cur.execute("SELECT id, question_type, parent_id FROM questions WHERE id = ANY(%s)", (body.question_ids,))
            qs = cur.fetchall()
            for q in qs:
                qtype_map[q["id"]] = q["question_type"]
                if q["question_type"] == "cd":
                    raise HTTPException(
                        status_code=400,
                        detail="Câu lập trình phải được giao qua module Bài tập lập trình",
                    )
                if q["question_type"] == "st":
                    st_parent_ids.append(q["id"])
                if q["parent_id"] is not None:
                    child_parent_ids.append(q["parent_id"])

            for st_id in st_parent_ids:
                if child_parent_ids.count(st_id) < 2:
                    raise HTTPException(status_code=400, detail="Mỗi câu chung giả thiết phải có ít nhất 2 câu hỏi con đi kèm!")

        # Thêm câu hỏi vào đề — gán điểm tối đa từng câu theo loại + thang điểm
        for order, q_id in enumerate(body.question_ids, 1):
            weight = weight_for_type(body.scoring_config, qtype_map.get(q_id))
            cur.execute(
                """
                INSERT INTO contests_questions (contest_id, question_id, original_order, point_weight)
                VALUES (%s, %s, %s, %s)
                """,
                (contest_id, q_id, order, weight)
            )
        cur.execute(
            "UPDATE contests SET question_count=%s WHERE id=%s",
            (sum(qtype_map.get(q_id) != "st" for q_id in body.question_ids), contest_id),
        )
        conn.commit()

    return {"id": contest_id, "public_id": str(contest["public_id"]), "message": "Tạo đề thi thành công"}


@router.post("/random")
def create_random_contest(body: RandomContestRequest, current_user: dict = Depends(get_current_teacher)):
    """Tự động bốc ngẫu nhiên `count` câu hỏi từ ngân hàng của giáo viên và tạo đề thi.

    Phiên bản đầu (tạm): chỉ bốc các câu đơn (không phải 'st' chung giả thiết) để
    tránh phải kéo theo câu con. Sau này có thể mở rộng theo ma trận đề thi.
    """
    if body.count < 1:
        raise HTTPException(status_code=400, detail="Số câu phải lớn hơn 0")
    if body.due_at and body.available_from and body.due_at < body.available_from:
        raise HTTPException(status_code=400, detail="Hạn nộp phải sau thời điểm mở đề")

    with get_cursor() as (cur, conn):
        if body.class_id is not None:
            cur.execute(
                "SELECT 1 FROM classes WHERE id=%s AND teacher_id=%s",
                (body.class_id, current_user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Lớp không thuộc giáo viên")
        conditions = [
            "teacher_id = %s", "deleted_at IS NULL",
            "parent_id IS NULL", "question_type NOT IN ('st', 'cd')",
        ]
        params = [current_user["user_id"]]
        if body.subject:
            conditions.append("subject = %s"); params.append(body.subject)
        if body.grade:
            conditions.append("grade = %s"); params.append(body.grade)
        if body.question_type:
            if body.question_type == "cd":
                raise HTTPException(status_code=400, detail="Hãy dùng module Bài tập lập trình")
            conditions.append("question_type = %s"); params.append(body.question_type)
        if body.complexity:
            conditions.append("complexity = %s"); params.append(body.complexity)
        where = " AND ".join(conditions)

        # Bốc ngẫu nhiên, rồi sắp xếp theo loại (mc → tf → sa → oe) cho gọn đề
        cur.execute(
            f"""
            SELECT id, question_type
            FROM questions
            WHERE {where}
            ORDER BY RANDOM()
            LIMIT %s
            """,
            params + [body.count],
        )
        picked = cur.fetchall()
        if not picked:
            raise HTTPException(status_code=400, detail="Không có câu hỏi nào phù hợp để tạo đề")

        type_order = {"mc": 1, "tf": 2, "sa": 3, "oe": 4}
        picked = sorted(picked, key=lambda r: type_order.get(r["question_type"], 99))
        question_ids = [r["id"] for r in picked]
        qtype_map = {r["id"]: r["question_type"] for r in picked}

        cur.execute(
            """
            INSERT INTO contests (teacher_id, title, time_limit, scoring_config, status,
                                  available_from, due_at, allow_late_submission)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, public_id
            """,
            (
                current_user["user_id"], body.title, body.time_limit,
                json.dumps(body.scoring_config), body.status, body.available_from,
                body.due_at, body.allow_late_submission,
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

        for order, q_id in enumerate(question_ids, 1):
            weight = weight_for_type(body.scoring_config, qtype_map.get(q_id))
            cur.execute(
                """
                INSERT INTO contests_questions (contest_id, question_id, original_order, point_weight)
                VALUES (%s, %s, %s, %s)
                """,
                (contest_id, q_id, order, weight),
            )
        cur.execute("UPDATE contests SET question_count=%s WHERE id=%s", (len(question_ids), contest_id))
        conn.commit()

    return {
        "id": contest_id,
        "public_id": str(contest["public_id"]),
        "count": len(question_ids),
        "message": f"Đã tạo đề thi ngẫu nhiên với {len(question_ids)} câu",
    }


@router.get("/public/{public_id}")
def resolve_public_contest(public_id: uuid.UUID):
    with get_cursor() as (cur, conn):
        cur.execute(
            "SELECT id,title,time_limit,status,allow_guest_link FROM contests WHERE public_id=%s AND status<>'deleted'",
            (str(public_id),),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Liên kết đề thi không tồn tại")
        return dict(row)


@router.get("/{contest_id}")
def get_contest(contest_id: int, current_user: dict = Depends(optional_user)):
    with get_cursor() as (cur, conn):
        cur.execute("SELECT * FROM contests WHERE id = %s", (contest_id,))
        contest = cur.fetchone()
        if not contest:
            raise HTTPException(status_code=404, detail="Đề thi không tồn tại")

        cur.execute(
            """
            SELECT q.id, q.question_type, q.layout_type, q.content, q.parent_id,
                   q.is_shufflable, cq.original_order, cq.point_weight
            FROM contests_questions cq
            JOIN questions q ON q.id = cq.question_id
            WHERE cq.contest_id = %s AND q.deleted_at IS NULL
            ORDER BY cq.original_order
            """,
            (contest_id,)
        )
        questions = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT class_id FROM class_contests WHERE contest_id = %s", (contest_id,))
        assigned_class_ids = {r["class_id"] for r in cur.fetchall()}

        # Với mỗi câu, lấy thêm images và details (không có đáp án đúng)
        for q in questions:
            cur.execute("SELECT id, storage_path, img_type, width FROM q_images WHERE question_id = %s", (q["id"],))
            q["images"] = [dict(r) for r in cur.fetchall()]

            qtype = q["question_type"]
            if qtype == "mc":
                cur.execute(
                    "SELECT id, content, order_index FROM q_choice_details WHERE question_id = %s ORDER BY order_index",
                    (q["id"],)
                )
                q["options"] = [dict(r) for r in cur.fetchall()]
            elif qtype == "tf":
                cur.execute(
                    "SELECT id, content, order_index FROM q_truefalse_details WHERE question_id = %s ORDER BY order_index",
                    (q["id"],)
                )
                q["options"] = [dict(r) for r in cur.fetchall()]
            else:
                q["options"] = []

    contest_result = dict(contest)
    contest_result["assigned_class_ids"] = sorted(assigned_class_ids)
    return {"contest": contest_result, "questions": questions}


@router.post("/{contest_id}/start")
def start_contest(contest_id: int, body: StartContestRequest, current_user: dict = Depends(optional_user)):
    """Tạo lượt mới cho guest; tài khoản được nối lại lượt còn thời gian."""
    guest_mode = body.access_mode == "guest"
    student_id = None if guest_mode else (
        current_user.get("user_id") if current_user and current_user.get("role") == "student" else None
    )
    if guest_mode and not (body.guest_name or "").strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập tên để bắt đầu")
    if not guest_mode and student_id is None and not (current_user and current_user.get("role") == "teacher"):
        raise HTTPException(status_code=401, detail="Vui lòng đăng nhập")

    with get_cursor() as (cur, conn):
        cur.execute("SELECT * FROM contests WHERE id=%s", (contest_id,))
        contest = cur.fetchone()
        if not contest:
            raise HTTPException(status_code=404, detail="Đề thi không tồn tại hoặc chưa mở")
        if not (current_user and current_user.get("role") == "teacher") and contest["status"] != "active":
            raise HTTPException(status_code=404, detail="Đề thi không tồn tại hoặc chưa mở")
        if guest_mode and not contest.get("allow_guest_link"):
            raise HTTPException(status_code=403, detail="Đề thi không mở link cho thí sinh tự do")
        if not (current_user and current_user.get("role") == "teacher"):
            if contest.get("available_from") is not None:
                cur.execute("SELECT NOW() < %s AS not_open", (contest["available_from"],))
                if cur.fetchone()["not_open"]:
                    raise HTTPException(status_code=403, detail="Đề thi chưa đến thời điểm mở")
            if contest.get("due_at") is not None and not contest.get("allow_late_submission"):
                cur.execute("SELECT NOW() > %s AS expired", (contest["due_at"],))
                if cur.fetchone()["expired"]:
                    raise HTTPException(status_code=409, detail="Đề thi đã hết hạn nộp")

        if student_id is not None:
            cur.execute(
                """SELECT 1 FROM students_classes sc
                   JOIN class_contests cc ON cc.class_id=sc.class_id
                   WHERE sc.student_id=%s AND cc.contest_id=%s""",
                (student_id, contest_id),
            )
            in_assigned_class = bool(cur.fetchone())
            if not in_assigned_class and not contest.get("allow_guest_link"):
                raise HTTPException(status_code=403, detail="Đề chưa được giao cho bạn")

            cur.execute(
                """SELECT cr.id, cr.display_order, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM
                         (cr.start_time + ct.time_limit * INTERVAL '1 minute' - NOW()))))::int AS remaining_seconds
                   FROM contest_results cr JOIN contests ct ON ct.id=cr.contest_id
                   WHERE cr.contest_id=%s AND cr.student_id=%s AND cr.end_time IS NULL
                     AND NOW() < cr.start_time + ct.time_limit * INTERVAL '1 minute'
                   ORDER BY cr.start_time DESC LIMIT 1""",
                (contest_id, student_id),
            )
            active = cur.fetchone()
            if active:
                cur.execute(
                    "SELECT question_id,student_choice,option_display_order FROM student_option_submissions WHERE contest_result_id=%s",
                    (active["id"],),
                )
                return {"contest_result_id": active["id"], "resumed": True,
                        "display_order": active.get("display_order") or "",
                        "remaining_seconds": active["remaining_seconds"],
                        "answers": [dict(r) for r in cur.fetchall()]}

        cur.execute(
            """
            INSERT INTO contest_results (student_id, contest_id, guest_name, start_time)
            VALUES (%s, %s, %s, NOW())
            RETURNING id
            """,
            (student_id, contest_id, (body.guest_name or "").strip() if guest_mode else None)
        )
        result_id = cur.fetchone()["id"]
        conn.commit()

    return {"contest_result_id": result_id, "resumed": False, "display_order": "",
            "remaining_seconds": int(contest["time_limit"] * 60), "answers": []}


@router.put("/{contest_id}/layout")
def initialize_contest_layout(contest_id: int, body: ContestLayoutRequest,
                              current_user: dict = Depends(optional_user)):
    """Ghi bố cục đề đúng một lần; các lần vào lại chỉ đọc bố cục đã chốt."""
    with get_cursor() as (cur, conn):
        cur.execute(
            """SELECT student_id, end_time, display_order
               FROM contest_results WHERE id=%s AND contest_id=%s FOR UPDATE""",
            (body.contest_result_id, contest_id),
        )
        result = cur.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Không tìm thấy lượt làm bài")
        if result["student_id"] is not None:
            if not current_user or current_user.get("user_id") != result["student_id"]:
                raise HTTPException(status_code=403, detail="Không có quyền cập nhật lượt làm này")
        if result["end_time"] is not None:
            raise HTTPException(status_code=409, detail="Bài đã được nộp")

        display_order = result.get("display_order") or ""
        if not display_order:
            try:
                submitted_question_ids = [
                    int(value) for value in body.display_order.split(",") if value.strip()
                ]
            except ValueError:
                raise HTTPException(status_code=400, detail="Thứ tự câu hỏi không hợp lệ")
            cur.execute(
                "SELECT question_id FROM contests_questions WHERE contest_id=%s",
                (contest_id,),
            )
            contest_question_ids = {row["question_id"] for row in cur.fetchall()}
            if (len(submitted_question_ids) != len(contest_question_ids)
                    or set(submitted_question_ids) != contest_question_ids):
                raise HTTPException(status_code=400, detail="Thứ tự câu hỏi không khớp với đề thi")
            display_order = ",".join(str(value) for value in submitted_question_ids)
            cur.execute(
                "UPDATE contest_results SET display_order=%s WHERE id=%s",
                (display_order, body.contest_result_id),
            )

        for question_id_text, option_order in body.option_orders.items():
            try:
                question_id = int(question_id_text)
            except (TypeError, ValueError):
                continue
            cur.execute(
                "SELECT 1 FROM contests_questions WHERE contest_id=%s AND question_id=%s",
                (contest_id, question_id),
            )
            if not cur.fetchone():
                continue
            try:
                submitted_option_ids = [
                    int(value) for value in option_order.split(",") if value.strip()
                ]
            except ValueError:
                raise HTTPException(status_code=400, detail="Thứ tự phương án không hợp lệ")
            cur.execute(
                "SELECT id FROM q_choice_details WHERE question_id=%s",
                (question_id,),
            )
            choice_ids = {row["id"] for row in cur.fetchall()}
            if (len(submitted_option_ids) != len(choice_ids)
                    or set(submitted_option_ids) != choice_ids):
                raise HTTPException(status_code=400, detail="Thứ tự phương án không khớp với câu hỏi")
            canonical_option_order = ",".join(str(value) for value in submitted_option_ids)
            cur.execute(
                """INSERT INTO student_option_submissions
                     (contest_result_id, question_id, student_choice, option_display_order)
                   VALUES (%s, %s, '', %s)
                   ON CONFLICT (contest_result_id, question_id) DO UPDATE SET
                     option_display_order = CASE
                       WHEN COALESCE(student_option_submissions.option_display_order, '') = ''
                       THEN EXCLUDED.option_display_order
                       ELSE student_option_submissions.option_display_order
                     END""",
                (body.contest_result_id, question_id, canonical_option_order),
            )

        cur.execute(
            """SELECT question_id, option_display_order
               FROM student_option_submissions
               WHERE contest_result_id=%s AND COALESCE(option_display_order, '') <> ''""",
            (body.contest_result_id,),
        )
        option_orders = {
            str(row["question_id"]): row["option_display_order"] for row in cur.fetchall()
        }
        conn.commit()
    return {"display_order": display_order, "option_orders": option_orders}


@router.put("/{contest_id}/answers/autosave")
def autosave_answer(contest_id: int, body: AutosaveAnswerRequest,
                    current_user: dict = Depends(optional_user)):
    with get_cursor() as (cur, conn):
        cur.execute(
            """SELECT cr.student_id, cr.end_time, cr.start_time, ct.time_limit
               FROM contest_results cr JOIN contests ct ON ct.id=cr.contest_id
               WHERE cr.id=%s AND cr.contest_id=%s""",
            (body.contest_result_id, contest_id),
        )
        result = cur.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Không tìm thấy lượt làm bài")
        if result["student_id"] is not None:
            if not current_user or current_user.get("user_id") != result["student_id"]:
                raise HTTPException(status_code=403, detail="Không có quyền lưu bài này")
        if result["end_time"] is not None:
            raise HTTPException(status_code=409, detail="Bài đã được nộp")
        cur.execute(
            "SELECT NOW() >= %s + %s * INTERVAL '1 minute' AS expired",
            (result["start_time"], result["time_limit"]),
        )
        if cur.fetchone()["expired"]:
            raise HTTPException(status_code=409, detail="Đã hết thời gian làm bài")
        cur.execute("SELECT 1 FROM contests_questions WHERE contest_id=%s AND question_id=%s", (contest_id, body.question_id))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Câu hỏi không thuộc đề")
        cur.execute(
            """INSERT INTO student_option_submissions
                 (contest_result_id,question_id,student_choice,option_display_order)
               VALUES (%s,%s,%s,%s)
               ON CONFLICT (contest_result_id,question_id) DO UPDATE SET
                 student_choice=EXCLUDED.student_choice,
                 option_display_order=EXCLUDED.option_display_order""",
            (body.contest_result_id, body.question_id, body.student_choice, body.option_display_order),
        )
        conn.commit()
    return {"saved": True}


@router.post("/{contest_id}/submit")
def submit_contest(
    contest_id: int,
    body: ContestSubmitRequest,
    current_user: dict = Depends(optional_user),
):
    """Nộp bài và chấm điểm"""
    with get_cursor() as (cur, conn):
        cur.execute(
            """SELECT cr.student_id, cr.end_time, ct.due_at, ct.allow_late_submission
               FROM contest_results cr JOIN contests ct ON ct.id=cr.contest_id
               WHERE cr.id=%s AND cr.contest_id=%s""",
            (body.contest_result_id, contest_id),
        )
        result = cur.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Không tìm thấy lượt làm bài")
        if result["student_id"] is not None:
            if not current_user or current_user.get("user_id") != result["student_id"]:
                raise HTTPException(status_code=403, detail="Không có quyền nộp bài này")
        if result["end_time"] is not None:
            raise HTTPException(status_code=409, detail="Bài đã được nộp")
        if result["due_at"] is not None and not result["allow_late_submission"]:
            cur.execute("SELECT NOW() > %s AS expired", (result["due_at"],))
            if cur.fetchone()["expired"]:
                raise HTTPException(status_code=409, detail="Đề thi đã hết hạn nộp")

        # Lấy đáp án đúng cho tất cả câu hỏi trong đề
        cur.execute(
            """
            SELECT q.id as question_id, q.question_type,
                   cq.point_weight
            FROM contests_questions cq
            JOIN questions q ON q.id = cq.question_id
            WHERE cq.contest_id = %s
            """,
            (contest_id,)
        )
        questions_meta = {r["question_id"]: dict(r) for r in cur.fetchall()}

        # Điểm tối đa của đề = tổng điểm tối đa từng câu (câu 'st' = 0)
        max_score = round(sum(
            float(m.get("point_weight") or 0.0)
            for m in questions_meta.values()
            if m.get("question_type") != "st"
        ), 2)

        total_score = 0.0
        wrong_count = 0
        section_stats = {}

        for ans in body.answers:
            q_id = ans["question_id"]
            student_choice = ans.get("student_choice", "")
            q_meta = questions_meta.get(q_id, {})
            q_type = q_meta.get("question_type")
            weight = float(q_meta.get("point_weight") or 1.0)
            earned = 0.0
            is_correct = False

            if q_type == "mc":
                # Bài mới lưu ID phương án dưới dạng text. Nếu gặp dữ liệu cũ
                # đang lưu nội dung phương án thì vẫn chấm theo nội dung.
                selected_option = None
                try:
                    selected_option_id = int(student_choice.strip())
                    cur.execute(
                        "SELECT is_correct FROM q_choice_details WHERE id = %s AND question_id = %s",
                        (selected_option_id, q_id),
                    )
                    selected_option = cur.fetchone()
                except (TypeError, ValueError):
                    pass
                if selected_option is not None:
                    is_correct = bool(selected_option["is_correct"])
                else:
                    cur.execute(
                        "SELECT content FROM q_choice_details WHERE question_id = %s AND is_correct = true",
                        (q_id,),
                    )
                    correct_row = cur.fetchone()
                    correct = correct_row["content"] if correct_row else ""
                    # q_choice_details.content là JSONB DocTree. Nhánh này chỉ
                    # dành cho bài cũ lưu nguyên nội dung thay vì option_id.
                    correct_text = doc_to_text(correct)
                    is_correct = (student_choice.strip() == correct_text.strip())
                earned = weight if is_correct else 0.0

            elif q_type == "tf":
                # student_choice = "TTFT" (T=True, F=False cho từng statement)
                cur.execute(
                    "SELECT order_index, is_correct FROM q_truefalse_details WHERE question_id = %s ORDER BY order_index",
                    (q_id,)
                )
                statements = cur.fetchall()
                correct_str = "".join("T" if s["is_correct"] else "F" for s in statements)
                match_count = sum(1 for a, b in zip(student_choice, correct_str) if a == b)
                # Chấm theo số ý đúng: 1 ý=10%, 2 ý=25%, 3 ý=50%, 4 ý=100% (quy chế THPT)
                if len(correct_str) > 0:
                    frac = tf_score_fraction(match_count, len(correct_str))
                    earned = round(weight * frac, 4)
                    is_correct = (match_count == len(correct_str))

            elif q_type == "sa":
                cur.execute(
                    "SELECT content FROM q_shortans_details WHERE question_id = %s",
                    (q_id,)
                )
                correct_row = cur.fetchone()
                correct = correct_row["content"] if correct_row else ""
                is_correct = (student_choice.strip().lower() == correct.strip().lower())
                earned = weight if is_correct else 0.0

            if not is_correct and q_type in ("mc", "tf", "sa"):
                wrong_count += 1
            total_score += earned

            if q_type != "st":
                stats = section_stats.setdefault(q_type or "other", {"total": 0, "correct": 0})
                stats["total"] += 1
                if is_correct:
                    stats["correct"] += 1

            # Lưu submission
            cur.execute(
                """
                INSERT INTO student_option_submissions
                (contest_result_id, question_id, student_choice, option_display_order, is_correct, earned_point)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (contest_result_id, question_id) DO UPDATE SET
                  student_choice=EXCLUDED.student_choice,
                  option_display_order=EXCLUDED.option_display_order,
                  is_correct=EXCLUDED.is_correct,
                  earned_point=EXCLUDED.earned_point
                """,
                (
                    body.contest_result_id, q_id, student_choice,
                    ans.get("option_display_order", ""), is_correct, earned
                )
            )

        # Cập nhật contest_result
        cur.execute(
            """
            UPDATE contest_results
            SET end_time = NOW(), total_score = %s, count_wrong_answers = %s
            WHERE id = %s
            RETURNING start_time, end_time
            """,
            (total_score, wrong_count, body.contest_result_id)
        )
        completed_result = cur.fetchone()
        conn.commit()

    duration_seconds = 0
    if completed_result and completed_result["start_time"] and completed_result["end_time"]:
        duration_seconds = max(0, int(
            (completed_result["end_time"] - completed_result["start_time"]).total_seconds()
        ))

    return {
        "total_score": total_score,
        "max_score": max_score,
        "wrong_count": wrong_count,
        "correct_count": sum(item["correct"] for item in section_stats.values()),
        "question_count": sum(item["total"] for item in section_stats.values()),
        "section_stats": section_stats,
        "duration_seconds": duration_seconds,
        "contest_result_id": body.contest_result_id
    }


@router.get("/results/{result_id}")
def get_result(result_id: int, current_user: dict = Depends(optional_user)):
    with get_cursor() as (cur, conn):
        cur.execute(
            """
            SELECT cr.*, ct.title, ct.scoring_config, ct.time_limit, s.name as student_name
            FROM contest_results cr
            JOIN contests ct ON ct.id = cr.contest_id
            LEFT JOIN accounts s ON s.id = cr.student_id
            WHERE cr.id = %s
            """,
            (result_id,)
        )
        result = cur.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Kết quả không tồn tại")

        cur.execute(
            """
            SELECT sos.*, q.content, q.question_type, q.solution
            FROM student_option_submissions sos
            JOIN questions q ON q.id = sos.question_id
            WHERE sos.contest_result_id = %s
            """,
            (result_id,)
        )
        submissions = [dict(r) for r in cur.fetchall()]

        # Fetch all questions with answers for this contest
        cur.execute(
            """
            SELECT q.id, q.question_type, q.layout_type, q.content, q.parent_id, q.solution,
                   q.is_shufflable, cq.original_order, cq.point_weight
            FROM contests_questions cq
            JOIN questions q ON q.id = cq.question_id
            WHERE cq.contest_id = %s AND q.deleted_at IS NULL
            ORDER BY cq.original_order
            """,
            (result["contest_id"],)
        )
        questions = [dict(r) for r in cur.fetchall()]

        for q in questions:
            cur.execute("SELECT id, storage_path, img_type, width FROM q_images WHERE question_id = %s", (q["id"],))
            q["images"] = [dict(r) for r in cur.fetchall()]

            qtype = q["question_type"]
            if qtype == "mc":
                cur.execute(
                    "SELECT id, content, is_correct, order_index FROM q_choice_details WHERE question_id = %s ORDER BY order_index",
                    (q["id"],)
                )
                q["options"] = [dict(r) for r in cur.fetchall()]
            elif qtype == "tf":
                cur.execute(
                    "SELECT id, content, is_correct, order_index, explaination FROM q_truefalse_details WHERE question_id = %s ORDER BY order_index",
                    (q["id"],)
                )
                q["options"] = [dict(r) for r in cur.fetchall()]
            elif qtype == "sa":
                cur.execute(
                    "SELECT id, content FROM q_shortans_details WHERE question_id = %s",
                    (q["id"],)
                )
                q["options"] = [dict(r) for r in cur.fetchall()]
            else:
                q["options"] = []

        # Điểm tối đa của đề (tổng điểm tối đa từng câu, bỏ câu 'st')
        max_score = round(sum(
            float(q.get("point_weight") or 0.0)
            for q in questions
            if q.get("question_type") != "st"
        ), 2)

    result_data = dict(result)
    result_data["max_score"] = max_score
    return {"result": result_data, "submissions": submissions, "questions": questions}


@router.delete("/results/{result_id}")
def delete_result(result_id: int, current_user: dict = Depends(get_current_teacher)):
    with get_cursor() as (cur, conn):
        cur.execute(
            """
            SELECT cr.id FROM contest_results cr
            JOIN contests ct ON ct.id = cr.contest_id
            WHERE cr.id = %s AND ct.teacher_id = %s
            """,
            (result_id, current_user["user_id"])
        )
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Không có quyền xóa bài thi này")
        
        cur.execute("DELETE FROM student_option_submissions WHERE contest_result_id = %s", (result_id,))
        cur.execute("DELETE FROM contest_results WHERE id = %s", (result_id,))
        conn.commit()
    return {"message": "Đã xóa bài thi"}

@router.get("/{contest_id}/submissions")
def get_contest_submissions(contest_id: int, class_id: Optional[int] = None,
                            current_user: dict = Depends(get_current_teacher)):
    """Có class_id thì chỉ lấy bài của học sinh đang trong lớp đó. Thí sinh tự do
    không có tài khoản nên không lọt vào danh sách này."""
    with get_cursor() as (cur, conn):
        cur.execute("SELECT id FROM contests WHERE id = %s AND teacher_id = %s", (contest_id, current_user["user_id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Không có quyền truy cập đề thi này")

        class_join = ""
        params: list = []
        if class_id is not None:
            cur.execute("SELECT 1 FROM classes WHERE id=%s AND teacher_id=%s", (class_id, current_user["user_id"]))
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Không có quyền quản lý lớp này")
            class_join = ("JOIN students_classes sc ON sc.student_id = cr.student_id "
                          "AND sc.class_id = %s")
            params.append(class_id)
        params.append(contest_id)

        cur.execute(
            f"""
            SELECT cr.id as result_id, cr.student_id, cr.start_time, cr.end_time,
                   cr.total_score, cr.count_wrong_answers,
                   (cr.end_time IS NOT NULL AND ct.due_at IS NOT NULL
                    AND cr.end_time > ct.due_at) AS submitted_late,
                   s.name as student_name, s.email as student_email, cr.guest_name
            FROM contest_results cr
            JOIN contests ct ON ct.id = cr.contest_id
            LEFT JOIN accounts s ON s.id = cr.student_id
            {class_join}
            WHERE cr.contest_id = %s
            ORDER BY cr.id DESC
            """,
            tuple(params),
        )
        results = [dict(r) for r in cur.fetchall()]
        for r in results:
            r["student_name"] = r["student_name"] or r["guest_name"] or "Thí sinh ẩn danh"

        # Điểm tối đa của đề = tổng điểm từng câu, bỏ câu 'st' vì nó chỉ là giả thiết
        cur.execute(
            """
            SELECT COALESCE(SUM(cq.point_weight), 0) AS max_score
            FROM contests_questions cq
            JOIN questions q ON q.id = cq.question_id
            WHERE cq.contest_id = %s AND q.question_type <> 'st'
            """,
            (contest_id,),
        )
        max_score = round(float(cur.fetchone()["max_score"] or 0), 2)
        return {"submissions": results, "max_score": max_score}


@router.get("/{contest_id}/classes")
def contest_class_assignments(contest_id: int, current_user: dict = Depends(get_current_teacher)):
    """Dữ liệu cho bảng giao/gỡ lớp: mọi lớp của giáo viên kèm trạng thái giao đề,
    ngày giao, sĩ số và số học sinh đã nộp."""
    uid = current_user["user_id"]
    with get_cursor() as (cur, conn):
        cur.execute("SELECT 1 FROM contests WHERE id=%s AND teacher_id=%s", (contest_id, uid))
        contest = cur.fetchone()
        if not contest:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập đề thi này")

        cur.execute(
            """
            SELECT c.id, c.class_name, cc.assigned_at,
                   (cc.class_id IS NOT NULL) AS assigned,
                   (SELECT COUNT(*) FROM students_classes sc WHERE sc.class_id = c.id)
                       AS student_count,
                   (SELECT COUNT(DISTINCT cr.student_id)
                      FROM contest_results cr
                      JOIN students_classes sc2 ON sc2.student_id = cr.student_id
                                               AND sc2.class_id = c.id
                     WHERE cr.contest_id = %s AND cr.end_time IS NOT NULL)
                       AS submitted_count
            FROM classes c
            LEFT JOIN class_contests cc ON cc.class_id = c.id AND cc.contest_id = %s
            WHERE c.teacher_id = %s
            ORDER BY c.create_at DESC
            """,
            (contest_id, contest_id, uid),
        )
        classes = [dict(r) for r in cur.fetchall()]
        return {"classes": classes}


@router.put("/{contest_id}/classes")
def set_contest_classes(contest_id: int, class_ids: List[int] = Body(..., embed=True),
                        current_user: dict = Depends(get_current_teacher)):
    """Đặt lại danh sách lớp được giao đề: lớp mới thì thêm, lớp bỏ ra thì gỡ.
    Bài đã nộp không bị đụng tới."""
    uid = current_user["user_id"]
    with get_cursor() as (cur, conn):
        cur.execute("SELECT 1 FROM contests WHERE id=%s AND teacher_id=%s", (contest_id, uid))
        contest = cur.fetchone()
        if not contest:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập đề thi này")

        cur.execute("SELECT id FROM classes WHERE teacher_id=%s", (uid,))
        own_class_ids = {r["id"] for r in cur.fetchall()}
        wanted = {cid for cid in class_ids if cid in own_class_ids}

        cur.execute("SELECT class_id FROM class_contests WHERE contest_id=%s", (contest_id,))
        current = {r["class_id"] for r in cur.fetchall()}

        to_add = wanted - current
        to_remove = current - wanted

        for cid in to_add:
            cur.execute(
                "INSERT INTO class_contests(class_id,contest_id,assigned_by) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (cid, contest_id, uid),
            )
            cur.execute("UPDATE classes SET contest_count = contest_count + 1 WHERE id=%s", (cid,))
        if to_remove:
            cur.execute(
                "DELETE FROM class_contests WHERE contest_id=%s AND class_id = ANY(%s)",
                (contest_id, list(to_remove)),
            )
            cur.execute(
                "UPDATE classes SET contest_count = GREATEST(contest_count - 1, 0) WHERE id = ANY(%s)",
                (list(to_remove),),
            )
        conn.commit()
    return {"added": len(to_add), "removed": len(to_remove)}


@router.patch("/{contest_id}/status")
def update_contest_status(
    contest_id: int,
    status: str,
    current_user: dict = Depends(get_current_teacher),
):
    if status not in ("active", "inactive", "deleted"):
        raise HTTPException(status_code=400, detail="Status phải là active, inactive hoặc deleted")

    with get_cursor() as (cur, conn):
        cur.execute(
            "UPDATE contests SET status = %s WHERE id = %s AND teacher_id = %s RETURNING id",
            (status, contest_id, current_user["user_id"])
        )
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Không có quyền cập nhật đề thi này")
        conn.commit()
    msg = "Đã xóa đề thi" if status == 'deleted' else f"Đề thi đã được {'mở' if status == 'active' else 'đóng'}"
    return {"message": msg}


@router.put("/{contest_id}")
def update_contest(
    contest_id: int,
    body: ContestUpdateRequest,
    current_user: dict = Depends(get_current_teacher),
):
    values = body.dict(exclude_unset=True)
    allowed = {"title", "time_limit", "status", "allow_guest_link", "available_from", "due_at", "allow_late_submission"}
    values = {key: value for key, value in values.items() if key in allowed}
    if not values:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật")

    with get_cursor() as (cur, conn):
        cur.execute("SELECT available_from, due_at FROM contests WHERE id=%s AND teacher_id=%s", (contest_id, current_user["user_id"]))
        current = cur.fetchone()
        if not current:
            raise HTTPException(status_code=403, detail="Không có quyền cập nhật đề thi này hoặc đề thi không tồn tại")
        available = values.get("available_from", current["available_from"])
        due = values.get("due_at", current["due_at"])
        if due and available:
            cur.execute("SELECT %s::timestamp < %s::timestamp AS invalid_window", (due, available))
            if cur.fetchone()["invalid_window"]:
                raise HTTPException(status_code=400, detail="Hạn nộp phải sau thời điểm mở đề")
        updates = ", ".join(f"{key} = %s" for key in values)
        params = list(values.values()) + [contest_id, current_user["user_id"]]
        query = f"UPDATE contests SET {updates} WHERE id = %s AND teacher_id = %s RETURNING id"
        cur.execute(query, params)
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Không có quyền cập nhật đề thi này hoặc đề thi không tồn tại")
        conn.commit()
        
    return {"message": "Cập nhật đề thi thành công"}
