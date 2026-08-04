from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime


# ── Auth ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str  # "student" | "teacher"
    organization: Optional[str] = None  # chỉ dành cho teacher
    school: Optional[str] = None  # chỉ dành cho student

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str
    user_id: int
    email: str

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    organization: Optional[str] = None
    school: Optional[str] = None
    password: Optional[str] = None


# ── Questions ────────────────────────────────────────────────────────────────

class QuestionFilter(BaseModel):
    subject: Optional[str] = None
    grade: Optional[int] = None
    chapter: Optional[str] = None
    lesson: Optional[str] = None
    question_type: Optional[str] = None  # mc, tf, sa, oe, st
    complexity: Optional[int] = None
    search: Optional[str] = None
    page: int = 1
    page_size: int = 20

class QuestionDetailUpdate(BaseModel):
    id: int
    content: Optional[str] = None
    is_correct: Optional[bool] = None
    explaination: Optional[str] = None  # lời giải cho từng ý (câu Đúng/Sai)

class QCodingTestcaseCreate(BaseModel):
    id: Optional[int] = None
    input_data: str
    output_data: str
    point_weight: int = 1
    is_public: bool = False
    description: Optional[str] = None
    order_index: Optional[int] = None

class QCodingDetailsCreate(BaseModel):
    time_limit_c_cpp: Optional[float] = 1.0
    time_limit_java: Optional[float] = 2.0
    time_limit_python: Optional[float] = 2.0
    memory_limit: Optional[int] = 256
    max_submissions: Optional[int] = 10
    solution_code: Optional[str] = None
    solution_language: Optional[str] = None

class QuestionDetailCreate(BaseModel):
    content: str
    is_correct: Optional[bool] = None
    explaination: Optional[str] = None

class QuestionCreateRequest(BaseModel):
    subject: str
    grade: int
    chapter: Optional[str] = None
    lesson: Optional[str] = None
    question_type: str
    complexity: int
    content: str
    solution: Optional[str] = None
    details: Optional[List[QuestionDetailCreate]] = None
    coding_details: Optional[QCodingDetailsCreate] = None
    coding_testcases: Optional[List[QCodingTestcaseCreate]] = None

class QuestionUpdateRequest(BaseModel):
    subject: Optional[str] = None
    grade: Optional[int] = None
    chapter: Optional[str] = None
    lesson: Optional[str] = None
    complexity: Optional[int] = None
    content: Optional[str] = None
    solution: Optional[str] = None
    details: Optional[List[QuestionDetailUpdate]] = None
    coding_details: Optional[QCodingDetailsCreate] = None
    coding_testcases: Optional[List[QCodingTestcaseCreate]] = None


# ── Upload ───────────────────────────────────────────────────────────────────

class UploadConfirmRequest(BaseModel):
    teacher_id: int
    subject: str
    grade: int
    data: List[Any]  # danh sách parsed question dicts

class UploadAsContestRequest(BaseModel):
    teacher_id: int
    subject: str
    grade: int
    data: List[Any]  # parsed question dicts để lưu ngân hàng + tạo đề
    title: str
    time_limit: int = 45  # phút
    scoring_config: dict = {}
    status: str = "inactive"
    class_id: Optional[int] = None


# ── Classes ──────────────────────────────────────────────────────────────────

class ClassCreateRequest(BaseModel):
    class_name: str
    description: Optional[str] = None

class JoinClassRequest(BaseModel):
    class_public_id: str

class AddStudentRequest(BaseModel):
    identifier: str


# ── Contests ─────────────────────────────────────────────────────────────────

class ContestCreateRequest(BaseModel):
    class_id: Optional[int] = None
    title: str
    time_limit: int  # phút
    scoring_config: dict
    question_ids: List[int]
    status: str = "inactive"

class ContestUpdateRequest(BaseModel):
    title: Optional[str] = None
    time_limit: Optional[int] = None
    status: Optional[str] = None

class RandomContestRequest(BaseModel):
    class_id: Optional[int] = None
    title: str
    time_limit: int  # phút
    scoring_config: dict
    count: int  # số câu muốn bốc ngẫu nhiên
    status: str = "inactive"
    # Bộ lọc tùy chọn để giới hạn nguồn bốc câu
    subject: Optional[str] = None
    grade: Optional[int] = None
    question_type: Optional[str] = None  # mc, tf, sa, oe
    complexity: Optional[int] = None

class ContestSubmitRequest(BaseModel):
    contest_result_id: int
    answers: List[dict]  # [{question_id, student_choice, option_display_order}]

class StartContestRequest(BaseModel):
    student_id: Optional[int] = None  # None nếu thi không cần đăng nhập
    guest_name: Optional[str] = None
