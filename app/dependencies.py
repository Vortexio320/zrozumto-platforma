from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client
from .services import get_supabase
import os

security = HTTPBearer(auto_error=False)


def _get_token(request: Request, auth: HTTPAuthorizationCredentials | None) -> str | None:
    """Get token from cookie (preferred) or Authorization header."""
    token = request.cookies.get("access_token")
    if token:
        return token
    if auth:
        return auth.credentials
    return None


def get_current_user(
    request: Request,
    auth: HTTPAuthorizationCredentials | None = Depends(security),
    supabase: Client = Depends(get_supabase),
):
    token = _get_token(request, auth)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user = supabase.auth.get_user(token)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user.user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_admin(user = Depends(get_current_user)):
    role = (user.user_metadata or {}).get("role", "student")
    if role != "admin":
        supabase = get_supabase()
        try:
            profile = supabase.table("profiles").select("role").eq("id", str(user.id)).single().execute()
            role = profile.data.get("role", "student")
        except Exception:
            pass
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
