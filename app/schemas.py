from pydantic import BaseModel, Field
from typing import List, Optional, Any
from uuid import UUID
from datetime import datetime

class UserProfile(BaseModel):
    id: UUID
    username: str
    role: str
    full_name: Optional[str] = None

class CreateUserRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    role: str = "student"
    school_type: Optional[str] = None  # "liceum" | "podstawowka"
    class_: Optional[str] = Field(None, alias="class")


class UpdateStudentRequest(BaseModel):
    school_type: Optional[str] = None  # "liceum" | "podstawowka"
    class_: Optional[str] = Field(None, alias="class")

class LessonBase(BaseModel):
    title: str
    description: Optional[str] = None
    lesson_date: Optional[str] = None
    file_url: Optional[str] = None
    transcript: Optional[str] = None

class Lesson(LessonBase):
    id: UUID
    created_at: datetime

class Question(BaseModel):
    pytanie: str
    odpowiedzi: List[str]
    poprawna: str
    wyjasnienie: Optional[str] = None

class QuizBase(BaseModel):
    lesson_id: UUID
    questions_json: List[Question]

class Quiz(QuizBase):
    id: UUID
    created_at: datetime

class GenerateQuizRequest(BaseModel):
    lesson_id: UUID

class SubmitQuizResult(BaseModel):
    answers: List[Optional[str]]

class MoreQuestionsRequest(BaseModel):
    count: int = 10
    difficulty: str = "same"

class Flashcard(BaseModel):
    przod: str
    tyl: str

class AnalysisRequest(BaseModel):
    answers: List[Optional[str]]

class UpdateLessonRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

class OpenAnswerRequest(BaseModel):
    question: str
    image_base64: str
