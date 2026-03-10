from fastapi import APIRouter, Depends, HTTPException, status
from ..dependencies import require_admin
from ..services import get_admin_supabase
from ..schemas import CreateUserRequest, UpdateLessonRequest, UpdateStudentRequest
import os

EMAIL_DOMAIN = os.environ.get("USER_EMAIL_DOMAIN", "zrozum-to.pl")

router = APIRouter(
    prefix="/admin",
    tags=["admin"]
)


@router.post("/users")
async def create_user(
    req: CreateUserRequest,
    admin = Depends(require_admin),
):
    supabase = get_admin_supabase()
    internal_email = f"{req.username}@{EMAIL_DOMAIN}"

    try:
        res = supabase.auth.admin.create_user({
            "email": internal_email,
            "password": req.password,
            "email_confirm": True,
            "user_metadata": {
                "username": req.username,
                "full_name": req.full_name or req.username,
                "role": req.role,
            }
        })
        user_id = str(res.user.id)
        profile_data = {
            "id": user_id,
            "username": req.username,
            "full_name": req.full_name or req.username,
            "role": req.role,
        }
        if req.school_type is not None:
            profile_data["school_type"] = req.school_type
        if req.class_ is not None:
            profile_data["class"] = req.class_
        # Ensure profile exists with correct username (webhook lookup relies on profiles.username)
        supabase.table("profiles").upsert(profile_data, on_conflict="id").execute()
        return {
            "status": "success",
            "user_id": user_id,
            "username": req.username,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/users")
async def list_users(admin = Depends(require_admin)):
    try:
        supabase = get_admin_supabase()
        response = supabase.table("profiles").select(
            "id, username, full_name, role, school_type, class, created_at"
        ).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/users/{user_id}")
async def update_student(
    user_id: str,
    req: UpdateStudentRequest,
    admin=Depends(require_admin),
):
    supabase = get_admin_supabase()
    # Use exclude_unset so we only update fields that were explicitly sent (including null)
    sent = req.model_dump(exclude_unset=True, by_alias=True)
    update_data = {k: v for k, v in sent.items() if k in ("school_type", "class")}

    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")

    try:
        res = supabase.table("profiles").update(update_data).eq("id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="User not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/users/{username}")
async def delete_user(username: str, admin = Depends(require_admin)):
    supabase = get_admin_supabase()

    try:
        # Look up by profiles table (avoids list_users pagination limit of 50)
        profile = supabase.table("profiles").select("id").eq("username", username).maybe_single().execute()
        if not profile.data:
            raise HTTPException(status_code=404, detail=f"User '{username}' not found")
        user_id = profile.data["id"]

        # Delete dependent rows first (avoids FK constraint when deleting auth user)
        supabase.table("quiz_results").delete().eq("user_id", user_id).execute()
        supabase.table("lesson_assignments").delete().eq("student_id", user_id).execute()
        supabase.table("profiles").delete().eq("id", user_id).execute()

        supabase.auth.admin.delete_user(str(user_id))
        return {"status": "success", "deleted": username}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/students/{student_id}/progress")
async def get_student_progress(student_id: str, admin = Depends(require_admin)):
    supabase = get_admin_supabase()
    try:
        profile = supabase.table("profiles").select(
            "id, username, full_name, role, school_type, class"
        ).eq("id", student_id).single().execute()
        student = profile.data

        assignments = (
            supabase.table("lesson_assignments")
            .select("lesson_id")
            .eq("student_id", student_id)
            .execute()
        )
        lesson_ids = [a["lesson_id"] for a in assignments.data]
        if not lesson_ids:
            return {"student": student, "lessons": []}

        lessons = (
            supabase.table("lessons")
            .select("id, title, description, created_at")
            .in_("id", lesson_ids)
            .execute()
        )

        quizzes = (
            supabase.table("quizzes")
            .select("id, lesson_id, questions_json, created_at")
            .in_("lesson_id", lesson_ids)
            .execute()
        )
        quiz_map = {}
        quiz_ids = []
        for q in quizzes.data:
            quiz_map.setdefault(q["lesson_id"], []).append(q)
            quiz_ids.append(q["id"])

        results_map = {}
        if quiz_ids:
            results = (
                supabase.table("quiz_results")
                .select("id, quiz_id, score, max_score, details_json, completed_at")
                .eq("user_id", student_id)
                .in_("quiz_id", quiz_ids)
                .order("completed_at", desc=True)
                .execute()
            )
            for r in results.data:
                results_map.setdefault(r["quiz_id"], []).append(r)

        output = []
        for lesson in lessons.data:
            lid = lesson["id"]
            lesson_quizzes = quiz_map.get(lid, [])
            enriched_quizzes = []
            for qz in lesson_quizzes:
                enriched_quizzes.append({
                    "id": qz["id"],
                    "questions": qz.get("questions_json") or [],
                    "question_count": len(qz.get("questions_json") or []),
                    "created_at": qz["created_at"],
                    "results": results_map.get(qz["id"], []),
                })
            output.append({
                **lesson,
                "quizzes": enriched_quizzes,
            })

        return {"student": student, "lessons": output}

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/quizzes/{quiz_id}")
async def delete_quiz(quiz_id: str, admin = Depends(require_admin)):
    supabase = get_admin_supabase()
    try:
        supabase.table("quiz_results").delete().eq("quiz_id", quiz_id).execute()
        res = supabase.table("quizzes").delete().eq("id", quiz_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Quiz not found")
        return {"status": "success", "deleted": quiz_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/lessons/{lesson_id}")
async def update_lesson(lesson_id: str, req: UpdateLessonRequest, admin = Depends(require_admin)):
    supabase = get_admin_supabase()
    update_data = {}
    if req.title is not None:
        update_data["title"] = req.title
    if req.description is not None:
        update_data["description"] = req.description

    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")

    try:
        res = supabase.table("lessons").update(update_data).eq("id", lesson_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Lesson not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
