from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from ..services import get_supabase, Client
from ..dependencies import get_current_user
from ..schemas import Lesson, LessonBase

router = APIRouter(
    prefix="/lessons",
    tags=["lessons"]
)



@router.get("/", response_model=List[Lesson])
async def get_lessons(
    user = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    # Fetch lessons assigned to the current user
    # We use the RLS policies in Supabase, but explicit query helps too.
    # Because of RLS, 'select * from lessons' should only return visible lessons.
    try:
        response = supabase.table("lessons").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{lesson_id}", response_model=Lesson)
async def get_lesson(
    lesson_id: str,
    user = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    try:
        response = supabase.table("lessons").select("*").eq("id", lesson_id).single().execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=404, detail="Lesson not found")

@router.post("/", response_model=Lesson)
async def create_lesson(
    lesson: LessonBase,
    user = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    try:
        # 1. Create Lesson
        lesson_data = lesson.dict()
        res_lesson = supabase.table("lessons").insert(lesson_data).execute()
        new_lesson = res_lesson.data[0]
        
        # 2. Assign to current user (for testing)
        assignment_data = {
            "lesson_id": new_lesson['id'],
            "student_id": user.id  # user is the JWT payload or user object
        }
        supabase.table("lesson_assignments").insert(assignment_data).execute()
        
        return new_lesson
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Backend Error: {str(e)}")
