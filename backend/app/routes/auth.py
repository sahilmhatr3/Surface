"""
Auth routes.
Login / registration / password management are handled by Supabase Auth on the frontend.
This file exposes only the profile endpoint so the frontend can fetch the app-level
user record (role, team, manager) after Supabase issues a session.
"""
from fastapi import APIRouter, Depends

from app.models import User
from app.schemas.auth import UserResponse
from app.core.security import get_current_user

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """
    Return the app-level profile for the currently authenticated user.
    The caller must supply a valid Supabase JWT as a Bearer token.
    """
    return current_user
