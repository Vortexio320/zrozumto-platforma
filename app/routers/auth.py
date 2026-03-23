from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from ..services import get_supabase
from ..dependencies import get_current_user
import os

EMAIL_DOMAIN = os.environ.get("USER_EMAIL_DOMAIN", "zrozum-to.pl")
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
ACCESS_TOKEN_MAX_AGE = 3600  # 1 hour
REFRESH_TOKEN_MAX_AGE = 604800  # 7 days


def _cookie_params(max_age: int) -> dict:
    return {
        "httponly": True,
        "secure": COOKIE_SECURE,
        "samesite": "lax",
        "path": "/",
        "max_age": max_age,
    }


router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(req: LoginRequest, response: Response):
    """Login with username + password. Converts username to internal email."""
    supabase = get_supabase()
    internal_email = f"{req.username}@{EMAIL_DOMAIN}"

    try:
        res = supabase.auth.sign_in_with_password({
            "email": internal_email,
            "password": req.password,
        })
        try:
            profile = supabase.table("profiles").select(
                "username, role, full_name, school_type, class"
            ).eq("id", str(res.user.id)).single().execute()
            profile_data = profile.data or {}
        except Exception:
            profile_data = {}
        user_data = {
            "id": str(res.user.id),
            "username": profile_data.get("username", req.username),
            "role": profile_data.get("role", "student"),
            "full_name": profile_data.get("full_name"),
            "school_type": profile_data.get("school_type"),
            "class": profile_data.get("class"),
        }
        response.set_cookie(
            key="access_token",
            value=res.session.access_token,
            **_cookie_params(ACCESS_TOKEN_MAX_AGE),
        )
        response.set_cookie(
            key="refresh_token",
            value=res.session.refresh_token,
            **_cookie_params(REFRESH_TOKEN_MAX_AGE),
        )
        return {
            "access_token": res.session.access_token,
            "refresh_token": res.session.refresh_token,
            "user": user_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail="Nieprawidłowa nazwa użytkownika lub hasło")


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    """Refresh access token using refresh_token from cookie."""
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    supabase = get_supabase()
    try:
        res = supabase.auth.refresh_session(refresh_token)
        response.set_cookie(
            key="access_token",
            value=res.session.access_token,
            **_cookie_params(ACCESS_TOKEN_MAX_AGE),
        )
        response.set_cookie(
            key="refresh_token",
            value=res.session.refresh_token,
            **_cookie_params(REFRESH_TOKEN_MAX_AGE),
        )
        return {"ok": True}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")


@router.post("/logout")
async def logout(response: Response):
    """Clear auth cookies."""
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"ok": True}


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
