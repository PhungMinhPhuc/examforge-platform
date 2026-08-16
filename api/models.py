from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List, Any, Literal
from datetime import datetime


# Auth

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


# Questions

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
    # Cây tài liệu (dict) cho mc/tf, chuỗi thường cho sa (chỉ là số) — xem
    # backend/src/engine/doctree/schema.py.
    content: Optional[Any] = None
    is_correct: Optional[bool] = None
    explaination: Optional[Any] = None  # lời giải cho từng ý (câu Đúng/Sai) — cây tài liệu

class QCodingTestcaseCreate(BaseModel):
    id: Optional[int] = None
    input_data: str
    output_data: str
    point_weight: int = 1
    is_public: bool = False   # cho xem chi tiết sau khi nộp
    is_sample: bool = False   # hiện làm ví dụ trên đề
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
    content: Any  # cây tài liệu (mc/tf) hoặc chuỗi (sa)
    is_correct: Optional[bool] = None
    explaination: Optional[Any] = None

class QuestionCreateRequest(BaseModel):
    subject: str
    grade: int
    chapter: Optional[str] = None
    lesson: Optional[str] = None
    question_type: str
    complexity: int
    content: Any  # cây tài liệu — xem backend/src/engine/doctree/schema.py
    solution: Optional[Any] = None
    details: Optional[List[QuestionDetailCreate]] = None
    coding_details: Optional[QCodingDetailsCreate] = None
    coding_testcases: Optional[List[QCodingTestcaseCreate]] = None

class QuestionUpdateRequest(BaseModel):
    subject: Optional[str] = None
    grade: Optional[int] = None
    chapter: Optional[str] = None
    lesson: Optional[str] = None
    complexity: Optional[int] = None
    layout_type: Optional[str] = None  # normal | immini_content — cụm "Bố cục" ảnh trôi ở ô Nội dung đề bài
    content: Optional[Any] = None
    solution: Optional[Any] = None
    details: Optional[List[QuestionDetailUpdate]] = None
    coding_details: Optional[QCodingDetailsCreate] = None
    coding_testcases: Optional[List[QCodingTestcaseCreate]] = None


# Upload

class UploadConfirmRequest(BaseModel):
    teacher_id: int
    subject: str
    grade: int
    data: List[Any]  # danh sách parsed question dicts
    job_id: Optional[str] = None

class UploadAsContestRequest(BaseModel):
    teacher_id: int
    subject: str
    grade: int
    data: List[Any]  # parsed question dicts để lưu ngân hàng + tạo đề
    job_id: Optional[str] = None
    title: str
    time_limit: int = 45  # phút
    scoring_config: dict = {}
    status: str = "inactive"
    class_id: Optional[int] = None


# Classes

class ClassCreateRequest(BaseModel):
    class_name: str
    description: Optional[str] = None

class JoinClassRequest(BaseModel):
    class_public_id: str

class AddStudentRequest(BaseModel):
    identifier: str

class ClassAssignmentRequest(BaseModel):
    assignment_type: str  # contest | coding
    assignment_id: int


# Contests

class ContestCreateRequest(BaseModel):
    class_id: Optional[int] = None
    title: str
    time_limit: int  # phút
    scoring_config: dict
    question_ids: List[int]
    status: str = "inactive"
    available_from: Optional[datetime] = None
    due_at: Optional[datetime] = None
    allow_late_submission: bool = False

class ContestUpdateRequest(BaseModel):
    title: Optional[str] = None
    time_limit: Optional[int] = None
    status: Optional[str] = None
    allow_guest_link: Optional[bool] = None
    available_from: Optional[datetime] = None
    due_at: Optional[datetime] = None
    allow_late_submission: Optional[bool] = None

class RandomContestRequest(BaseModel):
    class_id: Optional[int] = None
    title: str
    time_limit: int  # phút
    scoring_config: dict
    count: int  # số câu muốn bốc ngẫu nhiên
    status: str = "inactive"
    available_from: Optional[datetime] = None
    due_at: Optional[datetime] = None
    allow_late_submission: bool = False
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
    access_mode: str = "account"

class AutosaveAnswerRequest(BaseModel):
    contest_result_id: int
    question_id: int
    student_choice: str = ""
    option_display_order: str = ""

class ContestLayoutRequest(BaseModel):
    contest_result_id: int
    display_order: str
    option_orders: dict[str, str] = {}


# Export

class ExportExamRequest(BaseModel):
    """Cấu hình một lượt xuất đề.

    ``word_equation_format`` là cách nhúng công thức vào DOCX, không phải một
    định dạng tệp độc lập. Mặc định OMML giữ nguyên hành vi của client cũ.
    """

    model_config = ConfigDict(extra="forbid")

    formats: List[Literal["word", "pdf", "latex", "pdf_latex"]] = Field(
        default_factory=lambda: ["word"]
    )
    word_equation_format: Literal["omml", "mathtype"] = "omml"
    num_shuffles: int = Field(default=1, ge=0, le=100)
    shuffle_mode: Literal["order", "options", "both"] = "both"
    exam_title: str = ""
    original_code: str = "000"
    department: str = ""
    exam_type: str = ""
    subject: str = ""
    duration: int = Field(default=50, ge=1, le=1440)
    general_info: str = ""
    code_type: Literal["incremental", "random"] = "incremental"
    starting_code: str = "001"
    code_step: int = Field(default=1, ge=1)
    random_length: int = Field(default=3, ge=1, le=12)
    word_option_layouts: dict[str, Literal[1, 2, 4]] = Field(default_factory=dict)
