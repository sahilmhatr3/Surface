"""
Auth routes.
Login / registration / password management are handled by Supabase Auth on the frontend.
This file exposes only the profile endpoint so the frontend can fetch the app-level
user record (role, team, manager) after Supabase issues a session.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.auth import UserLocaleUpdate, UserResponse
from app.core.security import get_current_user

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """
    Return the app-level profile for the currently authenticated user.
    The caller must supply a valid Supabase JWT as a Bearer token.
    """
    return current_user


@router.patch("/me", response_model=UserResponse)
def patch_me(
    body: UserLocaleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update profile fields the user may edit themselves (e.g. UI language)."""
    user = db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.locale = body.locale
    db.commit()
    db.refresh(user)
    return user
