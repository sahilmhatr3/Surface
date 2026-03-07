"""
Auth routes: register, login, current user.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.auth import LoginRequest, RegisterResponse, Token, UserCreate, UserResponse
from app.core.security import get_current_user
from app.services.auth import hash_password, verify_password, create_access_token

router = APIRouter()


@router.post("/register", response_model=RegisterResponse)
def register(body: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user. For MVP used for seeding or admin-created accounts.
    Returns the created user and an access token so the client can stay logged in.
    """
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )
    # Treat 0 as "no team / no manager" so FK constraints are not violated (no id=0)
    team_id = body.team_id if body.team_id else None
    manager_id = body.manager_id if body.manager_id else None
    user = User(
        email=body.email.lower(),
        name=body.name.strip(),
        role=body.role,
        team_id=team_id,
        manager_id=manager_id,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return RegisterResponse(
        user=UserResponse.model_validate(user),
        access_token=create_access_token(user.id),
        token_type="bearer",
    )


@router.post("/login", response_model=Token)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate with email and password. Returns a JWT access token.
    Use the same generic message for invalid email or password to avoid leaking account existence.
    """
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user.id), token_type="bearer")


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user. Requires valid Bearer token."""
    return current_user
