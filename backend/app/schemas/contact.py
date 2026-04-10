"""Public contact / pilot request payloads."""

from pydantic import BaseModel, EmailStr, Field


class ContactRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    subject: str | None = Field(default=None, max_length=500)
    message: str = Field(..., min_length=1, max_length=20_000)
