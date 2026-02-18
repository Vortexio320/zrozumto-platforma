from fastapi import APIRouter, Depends, HTTPException, status
from ..dependencies import get_current_user, require_admin
from ..services import get_supabase
from ..schemas import CreateUserRequest
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
    supabase = get_supabase()
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
        return {
            "status": "success",
            "user_id": str(res.user.id),
            "username": req.username,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/users")
async def list_users(admin = Depends(require_admin)):
    supabase = get_supabase()
    try:
        response = supabase.table("profiles").select("id, username, full_name, role, created_at").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/users/{username}")
async def delete_user(username: str, admin = Depends(require_admin)):
    supabase = get_supabase()
    internal_email = f"{username}@{EMAIL_DOMAIN}"

    try:
        users_response = supabase.auth.admin.list_users()
        user_id = None
        for user in users_response:
            if user.email == internal_email:
                user_id = user.id
                break

        if not user_id:
            raise HTTPException(status_code=404, detail=f"User '{username}' not found")

        supabase.auth.admin.delete_user(str(user_id))
        return {"status": "success", "deleted": username}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
