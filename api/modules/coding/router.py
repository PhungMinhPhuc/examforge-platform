from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from auth import get_current_teacher, get_current_user
from db import get_cursor
from .schemas import (
    AssignmentQuestionInput,
    CodingAssignmentCreate,
    CodingAssignmentStatusUpdate,
    CodingAssignmentUpdate,
    CodingSubmissionCreate,
)


router = APIRouter(prefix="/coding", tags=["Coding"])
VALID_LANGUAGES = {"c", "cpp", "java", "python"}


@router.get("/public/{public_id}")
def resolve_public_assignment(public_id: str):
    with get_cursor() as (cur, conn):
        cur.execute(
            "SELECT id,title,status,allow_link_access FROM coding_assignments WHERE public_id=%s",
            (public_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Liên kết bài lập trình không tồn tại")
        return dict(row)


def _assignment_access(cur, assignment_id: int, user: dict, *, for_update: bool = False):
    suffix = " FOR UPDATE OF ca" if for_update else ""
    cur.execute(
        """
        SELECT ca.*, classes.names AS class_name
        FROM coding_assignments ca
        LEFT JOIN LATERAL (
          SELECT string_agg(cl.class_name, ', ' ORDER BY cl.class_name) AS names
          FROM class_coding_assignments cca JOIN classes cl ON cl.id=cca.class_id
          WHERE cca.assignment_id=ca.id
        ) classes ON TRUE
        WHERE ca.id = %s
        """ + suffix,
        (assignment_id,),
    )
    assignment = cur.fetchone()
    if not assignment:
        raise HTTPException(status_code=404, detail="Bài tập lập trình không tồn tại")

    uid, role = user["user_id"], user.get("role")
    if role == "teacher":
        if assignment["teacher_id"] != uid:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập bài tập này")
    else:
        if assignment["status"] != "published":
            raise HTTPException(status_code=404, detail="Bài tập chưa được công bố")
        if assignment["available_from"] is not None:
            cur.execute("SELECT NOW() < %s AS not_open", (assignment["available_from"],))
            if cur.fetchone()["not_open"]:
                raise HTTPException(status_code=403, detail="Bài tập chưa đến thời điểm mở")
        cur.execute("SELECT COUNT(*) AS n FROM class_coding_assignments WHERE assignment_id=%s", (assignment_id,))
        has_assigned_classes = cur.fetchone()["n"] > 0
        if has_assigned_classes and not assignment.get("allow_link_access"):
            cur.execute(
                """SELECT 1 FROM students_classes sc
                   JOIN class_coding_assignments cca ON cca.class_id=sc.class_id
                   WHERE sc.student_id=%s AND cca.assignment_id=%s""",
                (uid, assignment_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Bạn không thuộc lớp được giao bài")
    return assignment


@router.get("/questions")
def list_coding_questions(current_user: dict = Depends(get_current_teacher)):
    with get_cursor() as (cur, conn):
        cur.execute(
            """
            SELECT q.id, q.content, q.subject, q.grade, q.chapter, q.lesson,
                   q.complexity, qcd.max_submissions, qcd.memory_limit
            FROM questions q
            JOIN q_coding_details qcd ON qcd.question_id = q.id
            WHERE q.question_type = 'cd' AND q.deleted_at IS NULL
              AND q.teacher_id = %s
            ORDER BY q.id DESC
            """,
            (current_user["user_id"],),
        )
        return [dict(r) for r in cur.fetchall()]


@router.get("/assignments")
def list_assignments(current_user: dict = Depends(get_current_user)):
    uid, role = current_user["user_id"], current_user.get("role")
    with get_cursor() as (cur, conn):
        if role == "teacher":
            cur.execute(
                """
                SELECT ca.*, string_agg(DISTINCT c.class_name, ', ') AS class_name
                FROM coding_assignments ca
                LEFT JOIN class_coding_assignments cca ON cca.assignment_id=ca.id
                LEFT JOIN classes c ON c.id = cca.class_id
                WHERE ca.teacher_id = %s
                GROUP BY ca.id
                ORDER BY ca.created_at DESC
                """,
                (uid,),
            )
        else:
            cur.execute(
                """
                SELECT ca.*, string_agg(DISTINCT c.class_name, ', ') AS class_name,
                       cas.status AS progress_status, cas.total_score
                FROM coding_assignments ca
                LEFT JOIN class_coding_assignments cca ON cca.assignment_id=ca.id
                LEFT JOIN classes c ON c.id=cca.class_id
                LEFT JOIN coding_assignment_students cas
                  ON cas.assignment_id = ca.id AND cas.student_id = %s
                WHERE ca.status = 'published'
                  AND ((NOT EXISTS (
                        SELECT 1 FROM class_coding_assignments x WHERE x.assignment_id=ca.id
                      )) OR EXISTS (
                      SELECT 1 FROM students_classes sc
                      WHERE sc.student_id = %s AND sc.class_id=cca.class_id
                  ))
                GROUP BY ca.id, cas.status, cas.total_score
                ORDER BY ca.created_at DESC
                """,
                (uid, uid),
            )
        return [dict(r) for r in cur.fetchall()]


@router.post("/assignments")
def create_assignment(body: CodingAssignmentCreate, current_user: dict = Depends(get_current_teacher)):
    if body.status not in {"draft", "published"}:
        raise HTTPException(status_code=400, detail="Trạng thái không hợp lệ")
    if not body.questions:
        raise HTTPException(status_code=400, detail="Bài tập phải có ít nhất một câu lập trình")
    if body.due_at and body.available_from and body.due_at < body.available_from:
        raise HTTPException(status_code=400, detail="Hạn nộp phải sau thời điểm mở bài")

    uid = current_user["user_id"]
    with get_cursor() as (cur, conn):
        if body.class_id is not None:
            cur.execute("SELECT 1 FROM classes WHERE id = %s AND teacher_id = %s", (body.class_id, uid))
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Lớp không thuộc giáo viên hiện tại")

        qids = [q.question_id for q in body.questions]
        cur.execute(
            """
            SELECT q.id FROM questions q JOIN q_coding_details d ON d.question_id = q.id
            WHERE q.id = ANY(%s) AND q.question_type = 'cd' AND q.teacher_id = %s
              AND q.deleted_at IS NULL
            """,
            (qids, uid),
        )
        valid_ids = {r["id"] for r in cur.fetchall()}
        if valid_ids != set(qids):
            raise HTTPException(status_code=400, detail="Danh sách có câu không phải lập trình hoặc không thuộc giáo viên")

        cur.execute(
            """
            INSERT INTO coding_assignments
              (teacher_id, title, description, available_from, due_at,
               time_limit, status, allow_late_submission, question_count)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, public_id
            """,
            (uid, body.title.strip(), body.description, body.available_from,
             body.due_at, body.time_limit, body.status, body.allow_late_submission, len(body.questions)),
        )
        assignment = cur.fetchone()
        if body.class_id is not None:
            cur.execute(
                "INSERT INTO class_coding_assignments(class_id,assignment_id,assigned_by) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (body.class_id, assignment["id"], uid),
            )
            if cur.rowcount:
                cur.execute("UPDATE classes SET contest_count=contest_count+1 WHERE id=%s", (body.class_id,))
        for index, item in enumerate(body.questions):
            cur.execute(
                """
                INSERT INTO coding_assignment_questions
                  (assignment_id, question_id, order_index, point_weight, max_submissions_override)
                VALUES (%s,%s,%s,%s,%s)
                """,
                (assignment["id"], item.question_id, index, item.point_weight,
                 item.max_submissions_override),
            )
        conn.commit()
        return {"id": assignment["id"], "public_id": str(assignment["public_id"])}


@router.get("/assignments/{assignment_id}")
def get_assignment(assignment_id: int, class_id: Optional[int] = None,
                   current_user: dict = Depends(get_current_user)):
    """class_id chỉ dành cho giáo viên, lọc danh sách học sinh theo lớp đó."""
    with get_cursor() as (cur, conn):
        assignment = _assignment_access(cur, assignment_id, current_user)
        is_teacher = current_user.get("role") == "teacher"
        if class_id is not None:
            if not is_teacher:
                raise HTTPException(status_code=403, detail="Không có quyền lọc theo lớp")
            cur.execute("SELECT 1 FROM classes WHERE id=%s AND teacher_id=%s",
                        (class_id, current_user["user_id"]))
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Không có quyền quản lý lớp này")
        solution_columns = ", d.solution_code, d.solution_language" if is_teacher else ""
        cur.execute(
            f"""
            SELECT q.id, q.content, q.subject, q.grade, q.chapter, q.lesson,
                   q.complexity, q.layout_type, caq.order_index, caq.point_weight,
                   COALESCE(caq.max_submissions_override, d.max_submissions) AS max_submissions,
                   d.time_limit_c_cpp, d.time_limit_java, d.time_limit_python,
                   d.memory_limit {solution_columns}
            FROM coding_assignment_questions caq
            JOIN questions q ON q.id = caq.question_id
            JOIN q_coding_details d ON d.question_id = q.id
            WHERE caq.assignment_id = %s ORDER BY caq.order_index, q.id
            """,
            (assignment_id,),
        )
        questions = [dict(r) for r in cur.fetchall()]
        for question in questions:
            cur.execute(
                """
                SELECT id, input_data, output_data, point_weight, is_public, is_sample,
                       description, order_index
                FROM q_coding_testcases WHERE question_id = %s
                  AND (%s OR is_sample = true) ORDER BY order_index, id
                """,
                (question["id"], is_teacher),
            )
            question["coding_testcases"] = [dict(r) for r in cur.fetchall()]
            question["coding_details"] = {
                key: question.pop(key) for key in (
                    "time_limit_c_cpp", "time_limit_java", "time_limit_python",
                    "memory_limit", "max_submissions"
                )
            }

        progress = None
        students = []
        if not is_teacher:
            cur.execute(
                "SELECT * FROM coding_assignment_students WHERE assignment_id = %s AND student_id = %s",
                (assignment_id, current_user["user_id"]),
            )
            row = cur.fetchone()
            progress = dict(row) if row else None
            if row:
                for question in questions:
                    cur.execute(
                        """
                        SELECT COUNT(*) AS used, MAX(score) AS best_score,
                               ARRAY_REMOVE(ARRAY_AGG(DISTINCT status), NULL) AS statuses
                        FROM student_coding_submissions
                        WHERE assignment_student_id = %s AND question_id = %s
                        """,
                        (row["id"], question["id"]),
                    )
                    stats = cur.fetchone()
                    question["submission_count"] = stats["used"]
                    question["best_score"] = stats["best_score"]
                    # Giao diện tự xếp hạng để chỉ có một bảng thứ tự trạng thái
                    question["statuses"] = stats["statuses"] or []
        else:
            cur.execute(
                """
                SELECT cas.id, cas.student_id, a.name AS student_name, a.email,
                       cas.status, cas.started_at, cas.last_activity_at,
                       cas.completed_at, cas.total_score,
                       COUNT(scs.id) AS submission_count,
                       MAX(scs.submitted_at) AS last_submission_at,
                       COALESCE(BOOL_OR(ca.due_at IS NOT NULL AND scs.submitted_at > ca.due_at), false)
                           AS has_late_submission
                FROM coding_assignment_students cas
                JOIN accounts a ON a.id = cas.student_id
                JOIN coding_assignments ca ON ca.id = cas.assignment_id
                LEFT JOIN student_coding_submissions scs ON scs.assignment_student_id = cas.id
                {class_join}
                WHERE cas.assignment_id = %s
                GROUP BY cas.id, a.name, a.email
                ORDER BY a.name
                """.format(class_join=(
                    "JOIN students_classes sc ON sc.student_id = cas.student_id AND sc.class_id = %s"
                    if class_id is not None else ""
                )),
                (class_id, assignment_id) if class_id is not None else (assignment_id,),
            )
            students = [dict(r) for r in cur.fetchall()]

        result = dict(assignment)
        result["public_id"] = str(result["public_id"])
        cur.execute(
            "SELECT class_id FROM class_coding_assignments WHERE assignment_id = %s",
            (assignment_id,),
        )
        assigned_class_ids = {row["class_id"] for row in cur.fetchall()}
        result["assigned_class_ids"] = sorted(assigned_class_ids)
        return {"assignment": result, "questions": questions, "progress": progress, "students": students}


@router.patch("/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    body: CodingAssignmentUpdate,
    current_user: dict = Depends(get_current_teacher),
):
    values = body.dict(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="Không có dữ liệu cập nhật")
    if "title" in values and not (values["title"] or "").strip():
        raise HTTPException(status_code=400, detail="Tên bài tập không được để trống")
    with get_cursor() as (cur, conn):
        current = _assignment_access(cur, assignment_id, current_user, for_update=True)
        if "class_id" in values and values["class_id"] is not None:
            cur.execute(
                "SELECT 1 FROM classes WHERE id=%s AND teacher_id=%s",
                (values["class_id"], current_user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Lớp không thuộc giáo viên")
        available = values.get("available_from", current["available_from"])
        due = values.get("due_at", current["due_at"])
        if due and available and due < available:
            raise HTTPException(status_code=400, detail="Hạn nộp phải sau thời điểm mở bài")
        allowed = {"title", "description", "available_from", "due_at", "time_limit", "allow_late_submission", "allow_link_access"}
        fields = [key for key in values if key in allowed]
        if fields:
            assignments = ", ".join(f"{key}=%s" for key in fields)
            params = [values[key] for key in fields] + [assignment_id]
            cur.execute(
                f"UPDATE coding_assignments SET {assignments}, updated_at=NOW() WHERE id=%s RETURNING *",
                params,
            )
            row = dict(cur.fetchone())
        else:
            row = dict(current)
        if values.get("class_id") is not None:
            cur.execute(
                "INSERT INTO class_coding_assignments(class_id,assignment_id,assigned_by) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (values["class_id"], assignment_id, current_user["user_id"]),
            )
            if cur.rowcount:
                cur.execute("UPDATE classes SET contest_count=contest_count+1 WHERE id=%s", (values["class_id"],))
        conn.commit()
        row["public_id"] = str(row["public_id"])
        return row


@router.get("/assignments/{assignment_id}/classes")
def assignment_class_list(assignment_id: int, current_user: dict = Depends(get_current_teacher)):
    """Dữ liệu cho bảng giao/gỡ lớp: mọi lớp của giáo viên kèm trạng thái giao bài,
    ngày giao, sĩ số và số học sinh đã nộp."""
    uid = current_user["user_id"]
    with get_cursor() as (cur, conn):
        assignment = _assignment_access(cur, assignment_id, current_user)
        cur.execute(
            """
            SELECT c.id, c.class_name, cca.assigned_at,
                   (cca.class_id IS NOT NULL) AS assigned,
                   (SELECT COUNT(*) FROM students_classes sc WHERE sc.class_id = c.id)
                       AS student_count,
                   (SELECT COUNT(DISTINCT cas.student_id)
                      FROM coding_assignment_students cas
                      JOIN students_classes sc2 ON sc2.student_id = cas.student_id
                                               AND sc2.class_id = c.id
                     WHERE cas.assignment_id = %s AND cas.status <> 'not_started')
                       AS submitted_count
            FROM classes c
            LEFT JOIN class_coding_assignments cca
                   ON cca.class_id = c.id AND cca.assignment_id = %s
            WHERE c.teacher_id = %s
            ORDER BY c.create_at DESC
            """,
            (assignment_id, assignment_id, uid),
        )
        classes = [dict(r) for r in cur.fetchall()]
        return {"classes": classes}


@router.put("/assignments/{assignment_id}/classes")
def set_assignment_classes(assignment_id: int, class_ids: List[int] = Body(..., embed=True),
                           current_user: dict = Depends(get_current_teacher)):
    """Đặt lại danh sách lớp được giao bài: lớp mới thì thêm, lớp bỏ ra thì gỡ.
    Bài đã nộp giữ nguyên."""
    uid = current_user["user_id"]
    with get_cursor() as (cur, conn):
        assignment = _assignment_access(cur, assignment_id, current_user, for_update=True)

        cur.execute("SELECT id FROM classes WHERE teacher_id=%s", (uid,))
        own_class_ids = {r["id"] for r in cur.fetchall()}
        wanted = {cid for cid in class_ids if cid in own_class_ids}

        cur.execute(
            "SELECT class_id FROM class_coding_assignments WHERE assignment_id=%s",
            (assignment_id,),
        )
        current = {r["class_id"] for r in cur.fetchall()}

        to_add = wanted - current
        to_remove = current - wanted

        for cid in to_add:
            cur.execute(
                "INSERT INTO class_coding_assignments(class_id,assignment_id,assigned_by) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (cid, assignment_id, uid),
            )
            cur.execute("UPDATE classes SET contest_count = contest_count + 1 WHERE id=%s", (cid,))
        if to_remove:
            cur.execute(
                "DELETE FROM class_coding_assignments WHERE assignment_id=%s AND class_id = ANY(%s)",
                (assignment_id, list(to_remove)),
            )
            cur.execute(
                "UPDATE classes SET contest_count = GREATEST(contest_count - 1, 0) WHERE id = ANY(%s)",
                (list(to_remove),),
            )
        # Cột cũ coding_assignments.class_id cũng cho phép truy cập.
        conn.commit()
    return {"added": len(to_add), "removed": len(to_remove)}


@router.post("/assignments/{assignment_id}/questions")
def add_assignment_question(
    assignment_id: int,
    body: AssignmentQuestionInput,
    current_user: dict = Depends(get_current_teacher),
):
    """Add another coding problem to an existing assignment."""
    with get_cursor() as (cur, conn):
        _assignment_access(cur, assignment_id, current_user, for_update=True)
        cur.execute(
            """
            SELECT 1 FROM questions q
            JOIN q_coding_details d ON d.question_id = q.id
            WHERE q.id = %s AND q.question_type = 'cd' AND q.deleted_at IS NULL
              AND q.teacher_id = %s
            """,
            (body.question_id, current_user["user_id"]),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Câu lập trình không tồn tại hoặc không thuộc giáo viên")
        cur.execute(
            "SELECT 1 FROM coding_assignment_questions WHERE assignment_id=%s AND question_id=%s",
            (assignment_id, body.question_id),
        )
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Câu này đã có trong bài tập")
        cur.execute(
            "SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM coding_assignment_questions WHERE assignment_id=%s",
            (assignment_id,),
        )
        next_order = cur.fetchone()["next_order"]
        cur.execute(
            """
            INSERT INTO coding_assignment_questions
              (assignment_id, question_id, order_index, point_weight, max_submissions_override)
            VALUES (%s,%s,%s,%s,%s)
            RETURNING assignment_id, question_id, order_index
            """,
            (assignment_id, body.question_id, next_order, body.point_weight, body.max_submissions_override),
        )
        row = dict(cur.fetchone())
        cur.execute("UPDATE coding_assignments SET updated_at=NOW(), question_count=question_count+1 WHERE id=%s", (assignment_id,))
        conn.commit()
        return row


@router.delete("/assignments/{assignment_id}/questions/{question_id}")
def remove_assignment_question(
    assignment_id: int,
    question_id: int,
    current_user: dict = Depends(get_current_teacher),
):
    """Remove an unattempted problem from an assignment without deleting it from the bank."""
    with get_cursor() as (cur, conn):
        _assignment_access(cur, assignment_id, current_user, for_update=True)
        cur.execute(
            """
            SELECT COUNT(*) AS submission_count
            FROM student_coding_submissions scs
            JOIN coding_assignment_students cas ON cas.id = scs.assignment_student_id
            WHERE cas.assignment_id = %s AND scs.question_id = %s
            """,
            (assignment_id, question_id),
        )
        if cur.fetchone()["submission_count"] > 0:
            raise HTTPException(
                status_code=409,
                detail="Không thể xóa bài đã có lượt nộp của học sinh",
            )
        cur.execute(
            """
            DELETE FROM coding_assignment_questions
            WHERE assignment_id = %s AND question_id = %s
            RETURNING question_id
            """,
            (assignment_id, question_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Bài không thuộc assignment")
        cur.execute("UPDATE coding_assignments SET updated_at=NOW(), question_count=GREATEST(question_count-1,0) WHERE id=%s", (assignment_id,))
        conn.commit()
        return {"message": "Đã gỡ bài khỏi assignment"}


@router.post("/assignments/{assignment_id}/start")
def start_assignment(assignment_id: int, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Chỉ học sinh mới bắt đầu bài tập")
    with get_cursor() as (cur, conn):
        _assignment_access(cur, assignment_id, current_user)
        cur.execute(
            """
            INSERT INTO coding_assignment_students
              (assignment_id, student_id, started_at, last_activity_at, status)
            VALUES (%s,%s,NOW(),NOW(),'in_progress')
            ON CONFLICT (assignment_id, student_id) DO UPDATE
              SET started_at = COALESCE(coding_assignment_students.started_at, NOW()),
                  last_activity_at = NOW(),
                  status = CASE WHEN coding_assignment_students.status = 'not_started'
                                THEN 'in_progress' ELSE coding_assignment_students.status END
            RETURNING *, (xmax = 0) AS counter_inserted
            """,
            (assignment_id, current_user["user_id"]),
        )
        progress = dict(cur.fetchone())
        if progress.pop("counter_inserted", False):
            cur.execute(
                "UPDATE coding_assignments SET student_count=student_count+1 WHERE id=%s",
                (assignment_id,),
            )
        conn.commit()
        return progress


@router.post("/assignments/{assignment_id}/questions/{question_id}/submit")
def submit_code(
    assignment_id: int,
    question_id: int,
    body: CodingSubmissionCreate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Chỉ học sinh mới nộp code")
    if body.language not in VALID_LANGUAGES:
        raise HTTPException(status_code=400, detail="Ngôn ngữ không được hỗ trợ")
    if not body.source_code.strip():
        raise HTTPException(status_code=400, detail="Mã nguồn không được để trống")

    with get_cursor() as (cur, conn):
        assignment = _assignment_access(cur, assignment_id, current_user, for_update=True)
        if assignment["due_at"] and not assignment["allow_late_submission"]:
            cur.execute("SELECT NOW() > %s AS expired", (assignment["due_at"],))
            if cur.fetchone()["expired"]:
                raise HTTPException(status_code=409, detail="Bài tập đã hết hạn nộp")

        cur.execute(
            """
            SELECT COALESCE(caq.max_submissions_override, d.max_submissions, 10) AS max_submissions
            FROM coding_assignment_questions caq
            JOIN q_coding_details d ON d.question_id = caq.question_id
            WHERE caq.assignment_id = %s AND caq.question_id = %s
            """,
            (assignment_id, question_id),
        )
        config = cur.fetchone()
        if not config:
            raise HTTPException(status_code=404, detail="Câu hỏi không thuộc bài tập")

        cur.execute(
            """
            INSERT INTO coding_assignment_students
              (assignment_id, student_id, started_at, last_activity_at, status)
            VALUES (%s,%s,NOW(),NOW(),'in_progress')
            ON CONFLICT (assignment_id, student_id) DO UPDATE SET last_activity_at = NOW()
            RETURNING id, (xmax = 0) AS counter_inserted
            """,
            (assignment_id, current_user["user_id"]),
        )
        progress_row = cur.fetchone()
        progress_id = progress_row["id"]
        if progress_row["counter_inserted"]:
            cur.execute(
                "UPDATE coding_assignments SET student_count=student_count+1 WHERE id=%s",
                (assignment_id,),
            )
        cur.execute("SELECT id FROM coding_assignment_students WHERE id = %s FOR UPDATE", (progress_id,))
        cur.execute(
            """
            SELECT COALESCE(MAX(attempt_number), 0) AS used
            FROM student_coding_submissions
            WHERE assignment_student_id = %s AND question_id = %s
            """,
            (progress_id, question_id),
        )
        used = cur.fetchone()["used"]
        if used >= config["max_submissions"]:
            raise HTTPException(status_code=409, detail="Bạn đã sử dụng hết số lần nộp")

        attempt = used + 1
        cur.execute(
            """
            INSERT INTO student_coding_submissions
              (assignment_student_id, question_id, source_code, language, status,
               attempt_number, submitted_at)
            VALUES (%s,%s,%s,%s,'Pending',%s,NOW())
            RETURNING id, status, attempt_number, submitted_at
            """,
            (progress_id, question_id, body.source_code, body.language, attempt),
        )
        submission = dict(cur.fetchone())
        cur.execute(
            """INSERT INTO coding_submission_testcase_results
                 (submission_id,testcase_id,order_index,input_data,expected_output,status)
               SELECT %s,id,order_index,input_data,output_data,'Pending'
               FROM q_coding_testcases WHERE question_id=%s ORDER BY order_index
               ON CONFLICT (submission_id,order_index) DO NOTHING""",
            (submission["id"], question_id),
        )
        conn.commit()
        submission["remaining_submissions"] = config["max_submissions"] - attempt
        return submission


@router.get("/assignments/{assignment_id}/questions/{question_id}/submissions")
def submission_history(assignment_id: int, question_id: int, current_user: dict = Depends(get_current_user)):
    with get_cursor() as (cur, conn):
        assignment = _assignment_access(cur, assignment_id, current_user)
        if current_user.get("role") == "teacher":
            cur.execute(
                """
                SELECT scs.*, a.name AS student_name
                FROM student_coding_submissions scs
                JOIN coding_assignment_students cas ON cas.id = scs.assignment_student_id
                JOIN accounts a ON a.id = cas.student_id
                WHERE cas.assignment_id = %s AND scs.question_id = %s
                ORDER BY scs.submitted_at DESC
                """,
                (assignment_id, question_id),
            )
        else:
            cur.execute(
                """
                SELECT scs.* FROM student_coding_submissions scs
                JOIN coding_assignment_students cas ON cas.id = scs.assignment_student_id
                WHERE cas.assignment_id = %s AND cas.student_id = %s
                  AND scs.question_id = %s ORDER BY scs.submitted_at DESC
                """,
                (assignment_id, current_user["user_id"], question_id),
            )
        rows = [dict(r) for r in cur.fetchall()]
        cur.execute(
            "SELECT COALESCE(SUM(point_weight), 0) AS max_score FROM q_coding_testcases WHERE question_id = %s",
            (question_id,),
        )
        max_score = cur.fetchone()["max_score"]
        for row in rows:
            row["max_score"] = max_score
        return rows


@router.get("/assignments/{assignment_id}/submissions/{submission_id}")
def submission_detail(assignment_id: int, submission_id: int,
                      current_user: dict = Depends(get_current_user)):
    """Chi tiết một lượt nộp: kết quả từng test case và mã nguồn. Học sinh chỉ
    xem được input/output của test case bật is_public, giáo viên xem hết."""
    uid = current_user["user_id"]
    is_teacher = current_user.get("role") == "teacher"
    with get_cursor() as (cur, conn):
        _assignment_access(cur, assignment_id, current_user)
        cur.execute(
            """
            SELECT scs.*, cas.student_id, a.name AS student_name
            FROM student_coding_submissions scs
            JOIN coding_assignment_students cas ON cas.id = scs.assignment_student_id
            JOIN accounts a ON a.id = cas.student_id
            WHERE scs.id = %s AND cas.assignment_id = %s
            """,
            (submission_id, assignment_id),
        )
        submission = cur.fetchone()
        if not submission:
            raise HTTPException(status_code=404, detail="Không tìm thấy lượt nộp")
        if not is_teacher and submission["student_id"] != uid:
            raise HTTPException(status_code=403, detail="Không xem được bài của người khác")
        submission = dict(submission)

        cur.execute(
            """
            SELECT r.order_index, r.status, r.runtime_ms, r.memory_kb,
                   r.input_data, r.expected_output, r.actual_output, r.error_message,
                   COALESCE(t.point_weight, 0) AS point_weight,
                   COALESCE(t.is_public, false) AS is_public
            FROM coding_submission_testcase_results r
            LEFT JOIN q_coding_testcases t ON t.id = r.testcase_id
            WHERE r.submission_id = %s ORDER BY r.order_index
            """,
            (submission_id,),
        )
        testcases = []
        for row in cur.fetchall():
            case = dict(row)
            case["hidden"] = not (is_teacher or case["is_public"])
            if case["hidden"]:
                # che ngay ở server, không gửi xuống rồi mới ẩn bằng giao diện
                case["input_data"] = None
                case["expected_output"] = None
                case["actual_output"] = None
                case["error_message"] = None
            testcases.append(case)

        cur.execute(
            "SELECT COALESCE(SUM(point_weight), 0) AS max_score FROM q_coding_testcases WHERE question_id = %s",
            (submission["question_id"],),
        )
        submission["max_score"] = cur.fetchone()["max_score"]
        return {"submission": submission, "testcases": testcases}


@router.get("/assignments/{assignment_id}/students/{student_id}/submissions")
def student_submission_history(
    assignment_id: int,
    student_id: int,
    current_user: dict = Depends(get_current_teacher),
):
    """Teacher view of every attempt made by one student in an assignment."""
    with get_cursor() as (cur, conn):
        _assignment_access(cur, assignment_id, current_user)
        cur.execute(
            """
            SELECT a.id, a.name, a.email, cas.status AS progress_status,
                   cas.total_score, cas.started_at, cas.completed_at
            FROM coding_assignment_students cas
            JOIN accounts a ON a.id = cas.student_id
            WHERE cas.assignment_id = %s AND cas.student_id = %s
            """,
            (assignment_id, student_id),
        )
        student = cur.fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Học sinh chưa bắt đầu bài tập")
        cur.execute(
            """
            SELECT scs.id, scs.question_id, caq.order_index, scs.attempt_number,
                   scs.language, scs.status, scs.runtime_ms, scs.memory_kb,
                   scs.score, scs.submitted_at,
                   (ca.due_at IS NOT NULL AND scs.submitted_at > ca.due_at) AS is_late,
                   scs.source_code,
                   scs.compiler_output, q.content AS question_content,
                   (SELECT COALESCE(SUM(t.point_weight), 0)
                      FROM q_coding_testcases t WHERE t.question_id = scs.question_id)
                       AS max_score
            FROM coding_assignment_students cas
            JOIN student_coding_submissions scs ON scs.assignment_student_id = cas.id
            JOIN coding_assignment_questions caq
              ON caq.assignment_id = cas.assignment_id AND caq.question_id = scs.question_id
            JOIN coding_assignments ca ON ca.id = cas.assignment_id
            JOIN questions q ON q.id = scs.question_id
            WHERE cas.assignment_id = %s AND cas.student_id = %s
            ORDER BY caq.order_index, scs.attempt_number, scs.submitted_at
            """,
            (assignment_id, student_id),
        )
        submissions = [dict(r) for r in cur.fetchall()]
        for submission in submissions:
            cur.execute(
                """SELECT order_index,input_data,expected_output,actual_output,status,
                          runtime_ms,memory_kb,error_message
                   FROM coding_submission_testcase_results
                   WHERE submission_id=%s ORDER BY order_index""",
                (submission["id"],),
            )
            submission["testcase_results"] = [dict(r) for r in cur.fetchall()]
        return {"student": dict(student), "submissions": submissions}


@router.patch("/assignments/{assignment_id}/status")
def update_status(
    assignment_id: int,
    body: CodingAssignmentStatusUpdate,
    current_user: dict = Depends(get_current_teacher),
):
    if body.status not in {"draft", "published", "closed"}:
        raise HTTPException(status_code=400, detail="Trạng thái không hợp lệ")
    with get_cursor() as (cur, conn):
        _assignment_access(cur, assignment_id, current_user)
        cur.execute(
            "UPDATE coding_assignments SET status=%s, updated_at=NOW() WHERE id=%s RETURNING id,status",
            (body.status, assignment_id),
        )
        row = dict(cur.fetchone())
        conn.commit()
        return row
