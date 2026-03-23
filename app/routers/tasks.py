"""Student-facing exam task endpoints.

Fetches tasks from Neo4j, checks answers via Gemini AI,
and manages the skill-based recommendation engine.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from ..ai import fix_latex_in_structure
from ..dependencies import get_current_user
from ..neo4j import get_neo4j
from ..services import get_admin_supabase
from ..schemas import TaskCheckRequest, TaskHintRequest, TaskWorkedExampleRequest
from ..skill_engine import (
    fetch_dzialy,
    fetch_tasks_by_dzial,
    fetch_all_tasks,
    fetch_random_task,
    fetch_skill_map,
    recommend_task,
    _fetch_zadanie_by_id,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _require_neo4j():
    driver = get_neo4j()
    if not driver:
        raise HTTPException(status_code=503, detail="Neo4j not available")
    return driver


def _get_user_attempts(user_id: str) -> list[dict]:
    supabase = get_admin_supabase()
    res = (
        supabase.table("task_attempts")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def _get_recent_dzial_ids(attempts: list[dict], driver) -> list[int]:
    """Extract dzial IDs from the student's most recent attempts."""
    if not attempts:
        return []
    recent_zids = [a["zadanie_id"] for a in attempts[:5]]
    with driver.session() as session:
        result = session.run(
            """
            MATCH (z:Zadanie)-[:SPRAWDZA]->(u:Umiejetnosc)<-[:ZAWIERA]-(d:Dzial)
            WHERE z.id IN $zids
            RETURN DISTINCT d.id AS did
            """,
            zids=recent_zids,
        )
        return [r["did"] for r in result]


def _get_locked_skill_ids(user_id: str) -> set[str]:
    """Fetch admin-locked skill IDs for a student."""
    supabase = get_admin_supabase()
    try:
        res = (
            supabase.table("student_skill_locks")
            .select("skill_id")
            .eq("user_id", user_id)
            .execute()
        )
        return {r["skill_id"] for r in (res.data or [])}
    except Exception:
        return set()


# --- Endpoints ---


@router.get("/dzialy")
async def list_dzialy(user=Depends(get_current_user)):
    driver = _require_neo4j()
    return fetch_dzialy(driver)


@router.get("/skill-map")
async def get_skill_map(user=Depends(get_current_user)):
    driver = _require_neo4j()
    attempts = _get_user_attempts(str(user.id))
    locked = _get_locked_skill_ids(str(user.id))
    return fetch_skill_map(driver, attempts, locked_skill_ids=locked)


@router.get("/recommended")
async def get_recommended_task(
    skill_id: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    driver = _require_neo4j()
    attempts = _get_user_attempts(str(user.id))
    recent_dzialy = _get_recent_dzial_ids(attempts, driver)
    locked = _get_locked_skill_ids(str(user.id))

    task = recommend_task(
        driver=driver,
        user_id=str(user.id),
        attempts=attempts,
        recent_dzial_ids=recent_dzialy,
        target_skill_id=skill_id,
        locked_skill_ids=locked,
    )
    if not task:
        raise HTTPException(status_code=404, detail="No tasks available")
    return fix_latex_in_structure(task)


@router.get("/random")
async def get_random_task(
    dzial_id: Optional[int] = Query(None),
    user=Depends(get_current_user),
):
    driver = _require_neo4j()
    task = fetch_random_task(driver, dzial_id=dzial_id)
    if not task:
        raise HTTPException(status_code=404, detail="No tasks found")
    return fix_latex_in_structure(task)


@router.get("/dzial/{dzial_id}")
async def list_tasks_in_dzial(
    dzial_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user=Depends(get_current_user),
):
    driver = _require_neo4j()
    tasks = fetch_tasks_by_dzial(driver, dzial_id, skip=skip, limit=limit)
    return fix_latex_in_structure(tasks)


@router.get("/all")
async def list_all_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user=Depends(get_current_user),
):
    """Temporary: list all tasks from Neo4j."""
    driver = _require_neo4j()
    tasks = fetch_all_tasks(driver, skip=skip, limit=limit)
    return fix_latex_in_structure(tasks)


@router.get("/{zadanie_id}")
async def get_task(zadanie_id: str, user=Depends(get_current_user)):
    driver = _require_neo4j()
    task = _fetch_zadanie_by_id(driver, zadanie_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return fix_latex_in_structure(task)


@router.post("/check")
async def check_answer(req: TaskCheckRequest, user=Depends(get_current_user)):
    from ..ai import check_task_answer

    driver = _require_neo4j()
    task = _fetch_zadanie_by_id(driver, req.zadanie_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not req.answer and not req.image_base64:
        raise HTTPException(status_code=400, detail="Provide answer or image_base64")

    try:
        result = check_task_answer(
            zadanie=task,
            answer=req.answer,
            image_base64=req.image_base64,
            confidence=req.confidence,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI check failed: {str(e)}")

    is_correct = result.get("poprawna_odpowiedz", False)

    answer_data = {
        "answer": req.answer,
        "confidence": req.confidence,
        "hints_used": req.hints_used,
        "image_submitted": req.image_base64 is not None and len(req.image_base64 or "") > 100,
    }

    supabase = get_admin_supabase()
    try:
        supabase.table("task_attempts").insert({
            "user_id": str(user.id),
            "zadanie_id": req.zadanie_id,
            "is_correct": is_correct,
            "answer_data": answer_data,
            "ai_feedback": {
                "poprawna_odpowiedz": result.get("poprawna_odpowiedz"),
                "poprawne_rozumowanie": result.get("poprawne_rozumowanie"),
                "uzasadnienie": result.get("uzasadnienie", ""),
            },
        }).execute()
    except Exception as e:
        print(f"Warning: failed to save task_attempt: {e}")

    return result


@router.post("/hint")
async def get_hint(req: TaskHintRequest, user=Depends(get_current_user)):
    from ..ai import generate_task_hints_pair

    driver = _require_neo4j()
    task = _fetch_zadanie_by_id(driver, req.zadanie_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        pair = generate_task_hints_pair(task)
        return {
            "hint": pair.get("hint_1", ""),
            "hint_2": pair.get("hint_2", ""),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hint generation failed: {str(e)}")


@router.post("/worked-example")
async def get_worked_example(req: TaskWorkedExampleRequest, user=Depends(get_current_user)):
    from ..ai import generate_worked_example

    supabase = get_admin_supabase()
    try:
        cached = (
            supabase.table("worked_examples")
            .select("steps")
            .eq("zadanie_id", req.zadanie_id)
            .maybe_single()
            .execute()
        )
        if cached.data:
            return {"steps": cached.data["steps"]}
    except Exception:
        pass

    driver = _require_neo4j()
    task = _fetch_zadanie_by_id(driver, req.zadanie_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        result = generate_worked_example(task)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Worked example generation failed: {str(e)}")

    try:
        supabase.table("worked_examples").upsert({
            "zadanie_id": req.zadanie_id,
            "steps": result.get("steps", ""),
        }).execute()
    except Exception as e:
        print(f"Warning: failed to cache worked example: {e}")

    return result
