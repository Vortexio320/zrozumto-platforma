from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from ..services import get_supabase, Client
from ..dependencies import get_current_user
from ..ai import generate_quiz_content
import shutil
import os
import json
import tempfile

router = APIRouter(
    prefix="/quizzes",
    tags=["quizzes"]
)

@router.post("/generate")
async def generate_quiz(
    lesson_id: str,
    file: UploadFile = File(...),
    user = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    # 1. Save temp file (safe path, no collision)
    suffix = os.path.splitext(file.filename or "bin")[1]
    fd, temp_filename = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 2. Generate Quiz via Gemini (using new multimodal function)
        quiz_text = generate_quiz_content([temp_filename])

        # 3. Clean JSON
        clean_json = quiz_text.replace("```json", "").replace("```", "").strip()
        quiz_data = json.loads(clean_json)

        # 4. Save to Supabase
        new_quiz = {
            "lesson_id": lesson_id,
            "questions_json": quiz_data
        }
        res = supabase.table("quizzes").insert(new_quiz).execute()

        return {"status": "success", "quiz": quiz_data, "id": res.data[0]['id']}

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_filename):
            try:
                os.remove(temp_filename)
            except OSError:
                pass

@router.get("/{lesson_id}")
async def get_quiz(
    lesson_id: str,
    user = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    try:
        response = supabase.table("quizzes").select("*").eq("lesson_id", lesson_id).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=404, detail="Quiz not found")
