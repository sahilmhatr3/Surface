"""
Auth-related Pydantic schemas.
Passwords are never included in responses.
"""
from pydantic import BaseModel, EmailStr, Field


# Minimum length per common security guidance; cap to limit DoS via huge inputs
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


class UserCreate(BaseModel):
    """Request body for registering a new user."""

    email: EmailStr
    password: str = Field(..., min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(..., pattern="^(employee|manager|admin)$")
    team_id: int | None = None
    manager_id: int | None = None


class LoginRequest(BaseModel):
    """Request body for login."""

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=PASSWORD_MAX_LENGTH)


class Token(BaseModel):
    """JWT token returned after successful login or register."""

    access_token: str
    token_type: str = "bearer"
    password_reset_required: bool = False


class UserResponse(BaseModel):
    """User as returned in API responses; never includes password or password_hash."""

    id: int
    name: str
    email: str
    role: str
    team_id: int | None
    manager_id: int | None
    must_reset_password: bool = False
    has_temporary_password: bool = False

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    """Current password + new password for first-time or voluntary reset."""

    current_password: str = Field(..., min_length=1, max_length=PASSWORD_MAX_LENGTH)
    new_password: str = Field(
        ..., min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH
    )


class RegisterResponse(BaseModel):
    """Response after successful registration: user plus token so client can stay logged in."""

    user: UserResponse
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    """Request OTP for password reset. Always returns success to avoid leaking account existence."""

    email: EmailStr


class VerifyResetOtpRequest(BaseModel):
    """Verify OTP sent to email; returns short-lived reset token."""

    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern="^[0-9]{6}$")


class ResetPasswordRequest(BaseModel):
    """Set new password using the token from verify-reset-otp."""

    reset_token: str = Field(..., min_length=1)
    new_password: str = Field(
        ..., min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH
    )
