"""Schemas for app feedback widget and admin review."""
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class AppFeedbackAttachmentIn(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=120)
    size_bytes: int = Field(..., ge=1, le=5_000_000)
    data_url: str = Field(..., min_length=16, max_length=7_000_000)


class AppFeedbackCreate(BaseModel):
    category: str | None = Field(None, max_length=50)
    text: str | None = Field(None, max_length=5000)
    attachments: list[AppFeedbackAttachmentIn] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def validate_non_empty(self):
        if not (self.category and self.category.strip()) and not (self.text and self.text.strip()) and len(self.attachments) == 0:
            raise ValueError("Provide at least one of category, text, or attachment")
        return self


class AppFeedbackAttachmentOut(BaseModel):
    filename: str
    mime_type: str
    size_bytes: int
    data_url: str


class AppFeedbackItemResponse(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_email: str
    category: str | None = None
    text: str | None = None
    attachments: list[AppFeedbackAttachmentOut] = Field(default_factory=list)
    created_at: datetime | None = None


class AppFeedbackSubmitResponse(BaseModel):
    id: int
    created_at: datetime | None = None
