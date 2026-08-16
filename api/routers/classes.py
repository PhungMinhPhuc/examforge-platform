from fastapi import APIRouter, HTTPException, Depends
from db import get_cursor
from auth import get_current_teacher, get_current_user
from models import ClassCreateRequest, JoinClassRequest, AddStudentRequest, ClassAssignmentRequest
import uuid

router = APIRouter(prefix="/classes", tags=["Classes"])


@router.get("")
def list_classes(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    uid = current_user["user_id"]

    with get_cursor() as (cur, conn):
        if role == "teacher":
            cur.execute(
                """
                SELECT c.*
                FROM classes c
                WHERE c.teacher_id = %s
                ORDER BY c.create_at DESC
                """,
                (uid,)
            )
        else:
            cur.execute(
                """
                SELECT c.*, t.name as teacher_name
                FROM classes c
                JOIN students_classes sc ON sc.class_id = c.id AND sc.student_id = %s
                LEFT JOIN accounts t ON t.id = c.teacher_id
                ORDER BY c.create_at DESC
                """,
                (uid,)
            )
        return [dict(r) for r in cur.fetchall()]


@router.post("")
def create_class(body: ClassCreateRequest, current_user: dict = Depends(get_current_teacher)):
    with get_cursor() as (cur, conn):
        cur.execute(
            "INSERT INTO classes (teacher_id, class_name, description) VALUES (%s, %s, %s) RETURNING id, public_id",
            (current_user["user_id"], body.class_name, body.description)
        )
        row = cur.fetchone()
        conn.commit()
    return {"id": row["id"], "public_id": str(row["public_id"]), "message": "Tạo lớp thành công"}


@router.get("/{class_id}")
def get_class(class_id: int, current_user: dict = Depends(get_current_user)):
    with get_cursor() as (cur, conn):
        cur.execute(
            """
            SELECT c.*, t.name as teacher_name
            FROM classes c
            LEFT JOIN accounts t ON t.id = c.teacher_id
            WHERE c.id = %s
            """,
            (class_id,)
        )
        cls = cur.fetchone()
        if not cls:
            raise HTTPException(status_code=404, detail="Lớp không tồn tại")

        cur.execute(
            """
            SELECT a.id, a.name, a.email, sc.create_at as joined_at
            FROM students_classes sc
            JOIN accounts a ON a.id = sc.student_id
            WHERE sc.class_id = %s
            """,
            (class_id,)
        )
        students = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """SELECT ct.id, ct.title, ct.status, ct.time_limit, ct.due_at,
                      'contest' AS assignment_type
               FROM contests ct JOIN class_contests cc ON cc.contest_id = ct.id
               WHERE cc.class_id = %s AND NOT EXISTS (
                   SELECT 1 FROM contests_questions cq JOIN questions q ON q.id = cq.question_id
                   WHERE cq.contest_id = ct.id AND q.question_type = 'cd'
               ) ORDER BY ct.id DESC""",
            (class_id,)
        )
        contests = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """SELECT ca.id, ca.title, ca.status, ca.time_limit, ca.due_at,
                      'coding' AS assignment_type
               FROM coding_assignments ca
               JOIN class_coding_assignments cca ON cca.assignment_id = ca.id
               WHERE cca.class_id = %s ORDER BY ca.id DESC""",
            (class_id,),
        )
        contests.extend(dict(r) for r in cur.fetchall())

    result = dict(cls)
    result["students"] = students
    result["contests"] = contests
    return result


@router.get("/{class_id}/available-assignments")
def available_assignments(class_id: int, current_user: dict = Depends(get_current_teacher)):
    uid = current_user["user_id"]
    with get_cursor() as (cur, conn):
        cur.execute("SELECT 1 FROM classes WHERE id=%s AND teacher_id=%s", (class_id, uid))
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Không có quyền quản lý lớp này")
        cur.execute(
            """SELECT ct.id, ct.title, ct.status, ct.time_limit,
                      'contest' AS assignment_type,
                      EXISTS(SELECT 1 FROM class_contests cc WHERE cc.class_id=%s AND cc.contest_id=ct.id) AS assigned
               FROM contests ct
               WHERE ct.teacher_id=%s AND ct.status <> 'deleted'
                 AND NOT EXISTS (
                   SELECT 1 FROM contests_questions cq JOIN questions q ON q.id=cq.question_id
                   WHERE cq.contest_id=ct.id AND q.question_type='cd'
                 )
               ORDER BY ct.id DESC""",
            (class_id, uid),
        )
        regular = [dict(r) for r in cur.fetchall()]
        cur.execute(
            """SELECT ca.id, ca.title, ca.status, NULL::integer AS time_limit,
                      'coding' AS assignment_type,
                      EXISTS(SELECT 1 FROM class_coding_assignments cca WHERE cca.class_id=%s AND cca.assignment_id=ca.id) AS assigned
               FROM coding_assignments ca WHERE ca.teacher_id=%s ORDER BY ca.created_at DESC""",
            (class_id, uid),
        )
        coding = [dict(r) for r in cur.fetchall()]
    return {"contests": regular, "coding": coding}


@router.post("/{class_id}/assignments")
def assign_existing(class_id: int, body: ClassAssignmentRequest,
                    current_user: dict = Depends(get_current_teacher)):
    uid = current_user["user_id"]
    with get_cursor() as (cur, conn):
        cur.execute("SELECT 1 FROM classes WHERE id=%s AND teacher_id=%s", (class_id, uid))
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Không có quyền quản lý lớp này")
        if body.assignment_type == "contest":
            cur.execute("SELECT 1 FROM contests WHERE id=%s AND teacher_id=%s AND status<>'deleted'", (body.assignment_id, uid))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Không tìm thấy đề thi")
            cur.execute(
                "INSERT INTO class_contests(class_id,contest_id,assigned_by) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (class_id, body.assignment_id, uid),
            )
        elif body.assignment_type == "coding":
            cur.execute("SELECT 1 FROM coding_assignments WHERE id=%s AND teacher_id=%s", (body.assignment_id, uid))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Không tìm thấy bài lập trình")
            cur.execute(
                "INSERT INTO class_coding_assignments(class_id,assignment_id,assigned_by) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (class_id, body.assignment_id, uid),
            )
        else:
            raise HTTPException(status_code=400, detail="Loại bài tập không hợp lệ")
        if cur.rowcount:
            cur.execute("UPDATE classes SET contest_count = contest_count + 1 WHERE id=%s", (class_id,))
        conn.commit()
    return {"message": "Đã giao bài cho lớp"}


@router.delete("/{class_id}/assignments/{assignment_type}/{assignment_id}")
def unassign_from_class(class_id: int, assignment_type: str, assignment_id: int,
                        current_user: dict = Depends(get_current_teacher)):
    """Gỡ đề thi / bài lập trình khỏi lớp. Bài đã nộp vẫn giữ vì kết quả gắn với
    đề chứ không gắn với lớp."""
    uid = current_user["user_id"]
    with get_cursor() as (cur, conn):
        cur.execute("SELECT 1 FROM classes WHERE id=%s AND teacher_id=%s", (class_id, uid))
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Không có quyền quản lý lớp này")

        if assignment_type == "contest":
            link_table, owner_table, link_column = "class_contests", "contests", "contest_id"
        elif assignment_type == "coding":
            link_table, owner_table, link_column = "class_coding_assignments", "coding_assignments", "assignment_id"
        else:
            raise HTTPException(status_code=400, detail="Loại bài tập không hợp lệ")

        cur.execute(
            f"SELECT 1 FROM {owner_table} WHERE id=%s AND teacher_id=%s",
            (assignment_id, uid),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy bài được giao")

        cur.execute(
            f"DELETE FROM {link_table} WHERE class_id=%s AND {link_column}=%s",
            (class_id, assignment_id),
        )
        removed = cur.rowcount
        # Đề tạo kèm lớp còn giữ cột class_id cũ, không xóa thì học sinh vẫn vào được
        if not removed:
            raise HTTPException(status_code=404, detail="Đề này không nằm trong lớp")

        cur.execute(
            "UPDATE classes SET contest_count = GREATEST(contest_count - 1, 0) WHERE id=%s",
            (class_id,),
        )
        conn.commit()
    return {"message": "Đã gỡ khỏi lớp"}


@router.delete("/{class_id}")
def delete_class(class_id: int, current_user: dict = Depends(get_current_teacher)):
    """Xóa lớp của giáo viên. Gỡ thành viên và tách các đề thi (giữ lại đề + kết quả,
    chỉ bỏ gán lớp) để không vướng khóa ngoại."""
    with get_cursor() as (cur, conn):
        cur.execute(
            "SELECT 1 FROM classes WHERE id = %s AND teacher_id = %s",
            (class_id, current_user["user_id"]),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Không có quyền xóa lớp này")

        cur.execute("DELETE FROM students_classes WHERE class_id = %s", (class_id,))
        cur.execute("DELETE FROM classes WHERE id = %s", (class_id,))
        conn.commit()
    return {"message": "Đã xóa lớp"}


@router.post("/join")
def join_class(body: JoinClassRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Chỉ học sinh mới có thể tham gia lớp")

    with get_cursor() as (cur, conn):
        cur.execute("SELECT id FROM classes WHERE public_id = %s", (body.class_public_id,))
        cls = cur.fetchone()
        if not cls:
            raise HTTPException(status_code=404, detail="Mã lớp không hợp lệ")

        class_id = cls["id"]
        student_id = current_user["user_id"]

        # Kiểm tra đã vào lớp chưa
        cur.execute(
            "SELECT 1 FROM students_classes WHERE student_id = %s AND class_id = %s",
            (student_id, class_id)
        )
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Bạn đã tham gia lớp này rồi")

        cur.execute(
            "INSERT INTO students_classes (student_id, class_id) VALUES (%s, %s)",
            (student_id, class_id)
        )
        cur.execute("UPDATE classes SET student_count = student_count + 1 WHERE id=%s", (class_id,))
        conn.commit()

    return {"message": "Tham gia lớp thành công"}


@router.delete("/{class_id}/students/{student_id}")
def remove_student(class_id: int, student_id: int, current_user: dict = Depends(get_current_teacher)):
    with get_cursor() as (cur, conn):
        cur.execute(
            "DELETE FROM students_classes WHERE student_id = %s AND class_id = %s",
            (student_id, class_id)
        )
        if cur.rowcount:
            cur.execute("UPDATE classes SET student_count = GREATEST(student_count - 1, 0) WHERE id=%s", (class_id,))
        conn.commit()
    return {"message": "Đã xóa học sinh khỏi lớp"}


@router.post("/{class_id}/students")
def add_student(class_id: int, body: AddStudentRequest, current_user: dict = Depends(get_current_teacher)):
    with get_cursor() as (cur, conn):
        # Kiểm tra quyền sở hữu lớp
        cur.execute("SELECT 1 FROM classes WHERE id = %s AND teacher_id = %s", (class_id, current_user["user_id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Không có quyền quản lý lớp này")

        # Tìm học sinh
        student_id = None
        ident = body.identifier.strip()
        
        if "@" in ident:
            cur.execute("SELECT id FROM accounts WHERE email = %s AND role = 'student'", (ident,))
            acc = cur.fetchone()
            if acc:
                student_id = acc["id"]
        elif ident.isdigit():
            cur.execute("SELECT id FROM accounts WHERE id = %s AND role = 'student'", (int(ident),))
            acc = cur.fetchone()
            if acc:
                student_id = acc["id"]

        if not student_id:
            raise HTTPException(status_code=404, detail="Không tìm thấy học sinh (ID hoặc Email không hợp lệ)")

        # Kiểm tra xem học sinh đã có trong lớp chưa
        cur.execute("SELECT 1 FROM students_classes WHERE student_id = %s AND class_id = %s", (student_id, class_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Học sinh này đã tham gia lớp")

        # Thêm vào lớp
        cur.execute("INSERT INTO students_classes (student_id, class_id) VALUES (%s, %s)", (student_id, class_id))
        cur.execute("UPDATE classes SET student_count = student_count + 1 WHERE id=%s", (class_id,))
        conn.commit()

    return {"message": "Đã thêm học sinh vào lớp thành công"}


@router.get("/students/search")
def search_students(q: str, current_user: dict = Depends(get_current_teacher)):
    q_str = f"%{q}%"
    with get_cursor() as (cur, conn):
        cur.execute(
            """
            SELECT a.id, a.name, a.email
            FROM accounts a
            WHERE a.role = 'student'
              AND (CAST(a.id AS TEXT) LIKE %s OR a.email ILIKE %s OR a.name ILIKE %s)
            LIMIT 10
            """,
            (q_str, q_str, q_str)
        )
        return [dict(r) for r in cur.fetchall()]
