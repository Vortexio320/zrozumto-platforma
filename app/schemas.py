from pydantic import BaseModel
from typing import List, Optional, Any
from uuid import UUID
from datetime import datetime

class UserProfile(BaseModel):
    id: UUID
    role: str
    full_name: Optional[str] = None

class LessonBase(BaseModel):
    title: str
    description: Optional[str] = None
    file_url: Optional[str] = None
    transcript: Optional[str] = None

class Lesson(LessonBase):
    id: UUID
    created_at: datetime

class Question(BaseModel):
    pytanie: str
    odpowiedzi: List[str]
    poprawna: str

class QuizBase(BaseModel):
    lesson_id: UUID
    questions_json: List[Question] # or Any if structure varies

class Quiz(QuizBase):
    id: UUID
    created_at: datetime

class GenerateQuizRequest(BaseModel):
    lesson_id: UUID
    # optional: difficulty, count, etc.
