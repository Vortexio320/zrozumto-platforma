from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from ..services import get_supabase, get_admin_supabase, Client
from ..dependencies import get_current_user
from ..ai import generate_quiz_content, generate_more_questions, generate_flashcards, generate_analysis
from ..schemas import SubmitQuizResult, MoreQuestionsRequest, AnalysisRequest
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
    suffix = os.path.splitext(file.filename or "bin")[1]
    fd, temp_filename = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        quiz_text = generate_quiz_content([temp_filename])
        clean_json = quiz_text.replace("```json", "").replace("```", "").strip()
        quiz_data = json.loads(clean_json)

        new_quiz = {"lesson_id": lesson_id, "questions_json": quiz_data}
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


@router.post("/{quiz_id}/results")
async def submit_quiz_results(
    quiz_id: str,
    body: SubmitQuizResult,
    user = Depends(get_current_user),
):
    supabase = get_admin_supabase()
    try:
        quiz_resp = supabase.table("quizzes").select("questions_json").eq("id", quiz_id).single().execute()
        questions = quiz_resp.data["questions_json"]
    except Exception:
        raise HTTPException(status_code=404, detail="Quiz not found")

    score = 0
    max_score = len(questions)
    details = []
    for i, q in enumerate(questions):
        user_ans = body.answers[i] if i < len(body.answers) else None
        correct = q.get("poprawna", "")
        is_correct = user_ans == correct if user_ans else False
        if is_correct:
            score += 1
        details.append({
            "pytanie": q.get("pytanie", ""),
            "odpowiedz_ucznia": user_ans,
            "poprawna": correct,
            "czy_poprawna": is_correct,
        })

    result_data = {
        "user_id": str(user.id),
        "quiz_id": quiz_id,
        "score": score,
        "max_score": max_score,
        "details_json": details,
    }
    supabase.table("quiz_results").insert(result_data).execute()

    return {"score": score, "max_score": max_score, "details": details}


@router.post("/{quiz_id}/more")
async def more_questions(
    quiz_id: str,
    body: MoreQuestionsRequest,
    user = Depends(get_current_user),
):
    supabase = get_admin_supabase()
    try:
        quiz_resp = supabase.table("quizzes").select("questions_json").eq("id", quiz_id).single().execute()
        existing_questions = quiz_resp.data["questions_json"]
    except Exception:
        raise HTTPException(status_code=404, detail="Quiz not found")

    try:
        raw = generate_more_questions(existing_questions, body.count, body.difficulty)
        clean = raw.replace("```json", "").replace("```", "").strip()
        new_questions = json.loads(clean)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")

    merged = existing_questions + new_questions
    supabase.table("quizzes").update({"questions_json": merged}).eq("id", quiz_id).execute()

    return {"status": "success", "new_questions": new_questions, "total": len(merged)}


@router.post("/{quiz_id}/flashcards")
async def quiz_flashcards(
    quiz_id: str,
    user = Depends(get_current_user),
):
    supabase = get_admin_supabase()
    try:
        quiz_resp = supabase.table("quizzes").select("questions_json").eq("id", quiz_id).single().execute()
        questions = quiz_resp.data["questions_json"]
    except Exception:
        raise HTTPException(status_code=404, detail="Quiz not found")

    try:
        raw = generate_flashcards(questions)
        clean = raw.replace("```json", "").replace("```", "").strip()
        cards = json.loads(clean)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")

    return {"flashcards": cards}


@router.post("/{quiz_id}/analysis")
async def quiz_analysis(
    quiz_id: str,
    body: AnalysisRequest,
    user = Depends(get_current_user),
):
    supabase = get_admin_supabase()
    try:
        quiz_resp = supabase.table("quizzes").select("questions_json").eq("id", quiz_id).single().execute()
        questions = quiz_resp.data["questions_json"]
    except Exception:
        raise HTTPException(status_code=404, detail="Quiz not found")

    try:
        raw = generate_analysis(questions, body.answers)
        clean = raw.replace("```json", "").replace("```", "").strip()
        analysis = json.loads(clean)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")

    return analysis
