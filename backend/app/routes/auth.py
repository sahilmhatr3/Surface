"""
Auth routes: register, login, current user.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterResponse,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserResponse,
    VerifyResetOtpRequest,
)
from app.core.security import get_current_user
from app.core.otp_store import set_otp, verify_otp
from app.services.auth import (
    create_reset_token,
    decode_reset_token,
    hash_password,
    verify_password,
    create_access_token,
)

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
    return Token(
        access_token=create_access_token(user.id),
        token_type="bearer",
        password_reset_required=getattr(user, "must_reset_password", False),
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Set a new password (e.g. after first login when admin set a temporary password).
    Requires current password. Clears must_reset_password when successful.
    """
    if not current_user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No password set for this account",
        )
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.password_hash = hash_password(body.new_password)
    current_user.must_reset_password = False
    db.commit()


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user. Requires valid Bearer token."""
    return current_user


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Request a 6-digit OTP for password reset. If the email exists, store OTP (for now 123456; email later).
    Always returns success to avoid leaking account existence.
    """
    email = body.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if user:
        set_otp(email)
    return {"message": "If an account exists with that email, we sent a code."}


@router.post("/verify-reset-otp")
def verify_reset_otp(body: VerifyResetOtpRequest):
    """
    Verify the 6-digit OTP. Returns a short-lived reset_token to use in POST /auth/reset-password.
    """
    if not verify_otp(body.email.lower().strip(), body.otp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired code",
        )
    reset_token = create_reset_token(body.email)
    return {"reset_token": reset_token}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Set new password using the reset_token from verify-reset-otp. No auth required.
    """
    email = decode_reset_token(body.reset_token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )
    user.password_hash = hash_password(body.new_password)
    user.must_reset_password = False
    db.commit()
