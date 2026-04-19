"""
Feedback: rants and structured feedback.
"""
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.utils import normalize_content_locale

SCORE_MIN, SCORE_MAX = 1, 5


class RantCreate(BaseModel):
    """Request to submit an anonymous rant."""

    cycle_id: int
    text: str = Field(..., min_length=1, max_length=10_000)
    tags: list[str] = Field(default_factory=list, max_length=10)
    content_locale: str | None = Field(None, max_length=10)

    @field_validator("content_locale", mode="before")
    @classmethod
    def _normalize_rant_locale(cls, v: object) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return normalize_content_locale(str(v))


class MyRantStatusResponse(BaseModel):
    """Whether the current user has already submitted a rant for this cycle (restore UI progress)."""

    has_submitted: bool


class RantResponse(BaseModel):
    """
    Rant as returned after submission (no user identity or raw text).
    theme/sentiment are None while background AI processing is in flight.
    """

    id: int
    cycle_id: int
    theme: str | None = None
    sentiment: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class StructuredFeedbackScores(BaseModel):
    """Structured scores (1–5). Keys are legacy: support = Performance, communication = Impact on team."""

    support: int = Field(..., ge=SCORE_MIN, le=SCORE_MAX)
    communication: int = Field(..., ge=SCORE_MIN, le=SCORE_MAX)


class StructuredFeedbackCreate(BaseModel):
    """Request to submit structured feedback for one receiver (single submit)."""

    receiver_id: int
    cycle_id: int
    scores: StructuredFeedbackScores
    comments_helpful: str | None = Field(None, max_length=2000)
    comments_improvement: str | None = Field(None, max_length=2000)
    content_locale: str | None = Field(None, max_length=10)

    @field_validator("content_locale", mode="before")
    @classmethod
    def _normalize_structured_locale(cls, v: object) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return normalize_content_locale(str(v))


class StructuredFeedbackBatchItem(BaseModel):
    """One item in a batch (cycle_id provided at batch level)."""

    receiver_id: int
    scores: StructuredFeedbackScores
    comments_helpful: str | None = Field(None, max_length=2000)
    comments_improvement: str | None = Field(None, max_length=2000)


class StructuredFeedbackBatchCreate(BaseModel):
    """Batch of structured feedback (one per teammate) for a single cycle."""

    cycle_id: int
    feedback: list[StructuredFeedbackBatchItem] = Field(..., min_length=1, max_length=50)
    content_locale: str | None = Field(None, max_length=10)

    @field_validator("content_locale", mode="before")
    @classmethod
    def _normalize_batch_locale(cls, v: object) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return normalize_content_locale(str(v))


class StructuredFeedbackResponse(BaseModel):
    """Confirmation of structured feedback submission (no giver identity)."""

    id: int
    cycle_id: int
    receiver_id: int
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class MyStructuredFeedbackItem(BaseModel):
    """One saved structured feedback (for current user's submissions in a cycle)."""

    receiver_id: int
    scores: StructuredFeedbackScores
    comments_helpful: str | None = None
    comments_improvement: str | None = None

    model_config = {"from_attributes": False}


class TeammateResponse(BaseModel):
    """Teammate (id, name) for feedback receiver picker. Excludes current user."""

    id: int
    name: str
