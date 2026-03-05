"""
Cycles: themes, actions, manager summary, employee summary.
"""
from datetime import datetime

from pydantic import BaseModel, Field


class ThemeItem(BaseModel):
    """One theme in a cycle (for manager or employee view)."""

    theme: str
    count: int
    sentiment_summary: str
    example_comments: list[str] = Field(default_factory=list)
    below_threshold_note: str | None = Field(
        None,
        description="e.g. 'Theme expressed but not enough responses to show anonymized example comments.'",
    )


class ThemesResponse(BaseModel):
    """Themes for a cycle (participation + list of themes)."""

    cycle_id: int
    participation_rants: int
    participation_structured: int
    themes: list[ThemeItem]


class ManagerSummaryResponse(BaseModel):
    """Aggregated structured feedback about the manager (only when threshold met)."""

    cycle_id: int
    average_scores: dict[str, float]
    comment_snippets_helpful: list[str] = Field(default_factory=list)
    comment_snippets_improvement: list[str] = Field(default_factory=list)
    below_threshold_note: str | None = None


class ActionCreate(BaseModel):
    """Request to add a manager action for a theme."""

    theme: str = Field(..., min_length=1, max_length=100)
    action_text: str = Field(..., min_length=1, max_length=2000)


class ActionUpdate(BaseModel):
    """Request to edit an existing action."""

    action_text: str = Field(..., min_length=1, max_length=2000)


class ActionResponse(BaseModel):
    """One manager action."""

    id: int
    cycle_id: int
    theme: str
    action_text: str
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class CycleSummaryResponse(BaseModel):
    """Employee (or manager self) view: themes, actions, summarized feedback."""

    cycle_id: int
    themes: list[ThemeItem]
    actions: list[ActionResponse]
    summary_text: str | None = Field(None, description="Summarized anonymized feedback when available.")
