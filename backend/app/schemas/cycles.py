"""
Cycles: themes, actions, manager summary, employee summary.
"""
from datetime import datetime

from pydantic import BaseModel, Field


class ThemeItem(BaseModel):
    """One theme in a cycle (for manager or employee view)."""

    id: int | None = None
    theme: str
    count: int
    sentiment_summary: str
    dominant_sentiment: str = "neutral"
    strength_score: int = 1
    is_hidden: bool = False
    hidden_example_indices: list[int] = Field(default_factory=list)
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
    """Aggregated structured feedback for one receiver (scores + compiled snippets when a summary row exists)."""

    id: int | None = None
    receiver_id: int | None = None
    cycle_id: int
    average_scores: dict[str, float]
    respondent_count: int | None = None
    sentiment: str = "neutral"
    strength_score: int = 1
    is_hidden: bool = False
    hidden_helpful_indices: list[int] = Field(default_factory=list)
    hidden_improvement_indices: list[int] = Field(default_factory=list)
    comment_snippets_helpful: list[str] = Field(default_factory=list)
    comment_snippets_improvement: list[str] = Field(default_factory=list)
    below_threshold_note: str | None = None


class ManagerReviewUpdateRequest(BaseModel):
    """Manager review controls before publish."""

    hidden_theme_ids: list[int] = Field(default_factory=list)
    hidden_receiver_summary_ids: list[int] = Field(default_factory=list)
    hidden_directed_segment_ids: list[int] = Field(default_factory=list)
    theme_hidden_example_indices: dict[int, list[int]] = Field(default_factory=dict)
    receiver_hidden_helpful_indices: dict[int, list[int]] = Field(default_factory=dict)
    receiver_hidden_improvement_indices: dict[int, list[int]] = Field(default_factory=dict)
    # Actions
    hidden_action_ids: list[int] = Field(default_factory=list)
    action_updates: dict[int, str] = Field(default_factory=dict, description="Map of action_id -> new action_text")


class ActionResponse(BaseModel):
    """One manager action."""

    id: int
    cycle_id: int
    manager_id: int | None = None
    receiver_id: int | None = None
    action_text: str
    theme: str | None = None
    is_ai_generated: bool = False
    is_hidden: bool = False
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ManagerReviewResponse(BaseModel):
    """Manager-only compiled review payload."""

    cycle_id: int
    status: str
    team_published: bool = False
    individuals_published: bool = False
    participation_rants: int
    participation_structured: int
    summary_text: str | None = None
    themes: list[ThemeItem] = Field(default_factory=list)
    receiver_summaries: list[ManagerSummaryResponse] = Field(default_factory=list)
    directed_segments: list[dict] = Field(default_factory=list)
    actions: list[ActionResponse] = Field(default_factory=list)


class ActionCreate(BaseModel):
    """Request to add a manager action."""

    action_text: str = Field(..., min_length=1, max_length=2000)
    theme: str | None = Field(None, max_length=100)
    receiver_id: int | None = Field(None, description="Target user ID for individual actions; null for team-level")


class ActionUpdate(BaseModel):
    """Request to edit an existing action."""

    action_text: str = Field(..., min_length=1, max_length=2000)


class CycleSummaryResponse(BaseModel):
    """Employee (or manager self) view: themes, actions, summarized feedback."""

    cycle_id: int
    themes: list[ThemeItem]
    actions: list[ActionResponse]
    summary_text: str | None = Field(None, description="Summarized anonymized feedback when available.")


class DirectedRantSegmentItem(BaseModel):
    """One anonymized snippet of open feedback directed at the current user."""

    id: int | None = None
    receiver_id: int | None = None
    snippet: str
    theme: str
    sentiment: str
    is_hidden: bool = False


class CycleEventResponse(BaseModel):
    """One entry in a cycle's lifecycle audit log."""

    id: int
    cycle_id: int
    event_type: str
    actor_name: str | None = None
    note: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class IncomingFeedbackResponse(BaseModel):
    """
    All feedback about the current user for a cycle: structured (scores + comments) and directed rant segments.
    Structured compiled insights are always included when present; anonymity threshold applies only to directed rant segments.
    """

    cycle_id: int
    structured: ManagerSummaryResponse | None = Field(
        None,
        description="Compiled structured feedback about you (scores + comments). Present after cycle is published (or manager review).",
    )
    directed_rant_segments: list[DirectedRantSegmentItem] = Field(default_factory=list)
    directed_rant_below_threshold_note: str | None = Field(
        None,
        description="Shown when there are directed open feedback segments but count is below anonymity threshold.",
    )
    individual_actions: list[ActionResponse] = Field(
        default_factory=list,
        description="Individual actions published by the manager specifically for this user.",
    )
