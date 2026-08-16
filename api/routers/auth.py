from fastapi import APIRouter, HTTPException, status
from db import get_cursor
from auth import hash_password, verify_password, create_access_token
from models import LoginRequest, RegisterRequest, TokenResponse, ProfileUpdateRequest

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    with get_cursor() as (cur, conn):
        cur.execute("SELECT * FROM accounts WHERE email = %s AND is_active = true", (body.email,))
        account = cur.fetchone()

    if not account or not verify_password(body.password, account["password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sai email hoặc mật khẩu")

    role = account["role"]
    user_id = account["id"]
    name = account.get("name") or account["email"]

    token = create_access_token({"sub": body.email, "role": role, "user_id": user_id})
    return TokenResponse(access_token=token, role=role, name=name, user_id=user_id, email=account["email"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest):
    if body.role not in ("student", "teacher"):
        raise HTTPException(status_code=400, detail="Role phải là student hoặc teacher")

    with get_cursor() as (cur, conn):
        # Kiểm tra email tồn tại
        cur.execute("SELECT id FROM accounts WHERE email = %s", (body.email,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Email đã được sử dụng")

        hashed = hash_password(body.password)
        cur.execute(
            "INSERT INTO accounts (email, password, role, name) VALUES (%s, %s, %s, %s) RETURNING id",
            (body.email, hashed, body.role, body.name)
        )
        new_id = cur.fetchone()["id"]

        if body.role == "teacher":
            cur.execute(
                "INSERT INTO teachers (id, organization) VALUES (%s, %s)",
                (new_id, body.organization)
            )
        else:
            cur.execute(
                "INSERT INTO students (id, school) VALUES (%s, %s)",
                (new_id, body.school)
            )
        conn.commit()

    return {"message": "Đăng ký thành công", "user_id": new_id}


@router.get("/me")
def get_me(token_data: dict = None):
    """Endpoint để frontend check token còn valid không"""
    from fastapi import Depends
    from auth import get_current_user
    # sẽ được handle bởi dependency, endpoint này chỉ trả data
    return token_data

@router.put("/profile")
def update_profile(
    body: ProfileUpdateRequest, 
    current_user: dict = __import__("fastapi").Depends(__import__("auth").get_current_user)
):
    user_id = current_user["user_id"]
    role = current_user["role"]
    
    with get_cursor() as (cur, conn):
        if body.name is not None:
            cur.execute("UPDATE accounts SET name = %s WHERE id = %s", (body.name, user_id))
        
        if body.organization is not None and role == "teacher":
            cur.execute("UPDATE teachers SET organization = %s WHERE id = %s", (body.organization, user_id))

        if body.school is not None and role == "student":
            cur.execute("UPDATE students SET school = %s WHERE id = %s", (body.school, user_id))
            
        if body.password:
            hashed = hash_password(body.password)
            cur.execute("UPDATE accounts SET password = %s WHERE id = %s", (hashed, user_id))
            
        conn.commit()
    
    return {"message": "Cập nhật hồ sơ thành công"}

@router.get("/dashboard")
def get_dashboard_stats(current_user: dict = __import__("fastapi").Depends(__import__("auth").get_current_user)):
    user_id = current_user["user_id"]
    role = current_user["role"]
    
    with get_cursor() as (cur, conn):
        if role == "teacher":
            # Bộ đếm được backend cập nhật khi thêm/xóa câu hỏi.
            cur.execute("SELECT question_count AS total FROM teachers WHERE id = %s", (user_id,))
            q_total = (cur.fetchone() or {"total": 0})["total"]
            
            # Fast count for classes
            cur.execute("SELECT COUNT(*) as total FROM classes WHERE teacher_id = %s", (user_id,))
            c_total = cur.fetchone()["total"]
            
            # Fast count for contests
            cur.execute("SELECT COUNT(*) as total FROM contests WHERE teacher_id = %s AND status != 'deleted'", (user_id,))
            ct_total = cur.fetchone()["total"]
            
            # 5 recent contests
            cur.execute(
                """
                SELECT ct.id, ct.title, ct.status,
                       (SELECT string_agg(c.class_name, ', ' ORDER BY c.class_name)
                          FROM class_contests cc JOIN classes c ON c.id=cc.class_id
                         WHERE cc.contest_id=ct.id) AS class_name,
                       ct.question_count
                FROM contests ct
                WHERE ct.teacher_id = %s AND ct.status != 'deleted'
                ORDER BY ct.id DESC
                LIMIT 5
                """, (user_id,)
            )
            recent = [dict(row) for row in cur.fetchall()]
        else:
            # For student
            cur.execute("SELECT COUNT(class_id) as total FROM students_classes WHERE student_id = %s", (user_id,))
            c_total = cur.fetchone()["total"]
            
            # Fast count for active contests student is in
            cur.execute("""
                SELECT COUNT(DISTINCT ct.id) as total
                FROM contests ct
                JOIN class_contests cc ON cc.contest_id=ct.id
                JOIN students_classes sc ON sc.class_id=cc.class_id
                WHERE sc.student_id = %s AND ct.status = 'active'
            """, (user_id,))
            ct_total = cur.fetchone()["total"]
            q_total = 0
            
            # 5 recent contests for student
            cur.execute("""
                SELECT DISTINCT ct.id, ct.title, ct.status, cl.class_name, ct.question_count
                FROM contests ct
                JOIN class_contests cc ON cc.contest_id=ct.id
                JOIN students_classes sc ON sc.class_id=cc.class_id
                JOIN classes cl ON cl.id=sc.class_id
                WHERE sc.student_id = %s AND ct.status = 'active'
                ORDER BY ct.id DESC
                LIMIT 5
            """, (user_id,))
            recent = [dict(row) for row in cur.fetchall()]

    return {
        "stats": {
            "questions": q_total,
            "classes": c_total,
            "contests": ct_total,
            "results": 0
        },
        "recent_contests": recent
    }
