from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..dependencies import get_current_user
from ..services import get_supabase
import os

EMAIL_DOMAIN = os.environ.get("USER_EMAIL_DOMAIN", "zrozum-to.pl")

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(req: LoginRequest):
    """Login with username + password. Converts username to internal email."""
    supabase = get_supabase()
    internal_email = f"{req.username}@{EMAIL_DOMAIN}"

    try:
        res = supabase.auth.sign_in_with_password({
            "email": internal_email,
            "password": req.password,
        })
        return {
            "access_token": res.session.access_token,
            "refresh_token": res.session.refresh_token,
            "user": {
                "id": str(res.user.id),
                "username": (res.user.user_metadata or {}).get("username", req.username),
                "role": (res.user.user_metadata or {}).get("role", "student"),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail="Nieprawidłowa nazwa użytkownika lub hasło")


@router.get("/me")
async def get_my_profile(user = Depends(get_current_user)):
    supabase = get_supabase()
    try:
        profile = supabase.table("profiles").select("*").eq("id", str(user.id)).single().execute()
        return profile.data
    except Exception:
        return {
            "id": str(user.id),
            "username": (user.user_metadata or {}).get("username", ""),
            "role": (user.user_metadata or {}).get("role", "student"),
        }
