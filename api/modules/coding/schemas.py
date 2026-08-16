from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class AssignmentQuestionInput(BaseModel):
    question_id: int
    point_weight: float = Field(default=1, ge=0)
    max_submissions_override: Optional[int] = Field(default=None, gt=0)


class CodingAssignmentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    class_id: Optional[int] = None
    available_from: Optional[datetime] = None
    due_at: Optional[datetime] = None
    time_limit: Optional[int] = Field(default=None, gt=0)
    status: str = "draft"
    allow_late_submission: bool = False
    questions: List[AssignmentQuestionInput]


class CodingAssignmentStatusUpdate(BaseModel):
    status: str


class CodingAssignmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    class_id: Optional[int] = None
    available_from: Optional[datetime] = None
    due_at: Optional[datetime] = None
    time_limit: Optional[int] = Field(default=None, gt=0)
    allow_late_submission: Optional[bool] = None
    allow_link_access: Optional[bool] = None


class CodingSubmissionCreate(BaseModel):
    source_code: str
    language: str
