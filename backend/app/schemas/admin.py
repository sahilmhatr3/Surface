"""
Admin: user/team import and cycle creation.
"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator


class UserImportRow(BaseModel):
    """One row for user import. Password is not set here — users authenticate via Supabase Auth."""

    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    role: str = Field(..., pattern="^(employee|manager|admin)$")
    team_id: int | None = Field(None, description="Existing team ID; if set, team_name is ignored.")
    team_name: str | None = Field(None, min_length=1, max_length=255, description="Team name for get-or-create when team_id is not set.")
    manager_id: int | None = Field(None, description="Manager's user ID; required for employees.")
    locale: str | None = Field(
        None,
        description="UI language for invitee (en or de). Defaults to en when omitted.",
        pattern="^(en|de)$",
    )

    @model_validator(mode="after")
    def require_team(self):
        if self.team_id is None and not (self.team_name and self.team_name.strip()):
            raise ValueError("Provide team_id or team_name")
        return self


class UsersImportRequest(BaseModel):
    """Bulk user import. Creates teams by name and assigns users."""

    users: list[UserImportRow] = Field(..., min_length=1, max_length=500)


class UsersImportResponse(BaseModel):
    """Result of user import."""

    teams_created: int
    users_created: int
    errors: list[str] = Field(default_factory=list)


class TeamResponse(BaseModel):
    """Team as returned in API responses."""

    id: int
    name: str

    model_config = {"from_attributes": True}


class CycleCreate(BaseModel):
    """Request to create a new feedback cycle for a team."""

    start_date: datetime
    end_date: datetime

    @model_validator(mode="after")
    def end_after_start(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class CycleResponse(BaseModel):
    """Feedback cycle as returned in API responses."""

    id: int
    team_id: int
    start_date: datetime
    end_date: datetime
    status: str
    team_published: bool = False
    individuals_published: bool = False
    team_publication_outdated: bool = False
    individual_publication_outdated: bool = False
    participation_rants: int | None = None
    participation_structured: int | None = None
    raw_data_expires_at: datetime | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class CycleUpdate(BaseModel):
    """Admin: close early or extend cycle window."""

    status: str | None = Field(None, description="e.g. open, closed")
    end_date: datetime | None = Field(None, description="New end date (e.g. to extend)")


class TeamCreate(BaseModel):
    """Request to create a single team."""

    name: str = Field(..., min_length=1, max_length=255)


class AdminFeedbackEntryResponse(BaseModel):
    """One structured entry submitted by a giver (admin x-ray view)."""

    id: int
    receiver_id: int
    receiver_name: str
    scores: dict
    comments_helpful: str | None = None
    comments_improvement: str | None = None
    created_at: datetime | None = None


class AdminRantEntryResponse(BaseModel):
    """One rant submitted by a giver (raw + processed forms)."""

    id: int
    raw_text: str | None = None
    anonymized_text: str | None = None
    theme: str | None = None
    sentiment: str | None = None
    created_at: datetime | None = None


class AdminMemberFeedbackStatusResponse(BaseModel):
    """Per-user completion and submitted entries for a cycle."""

    user_id: int
    name: str
    email: str
    role: str
    has_rant: bool
    structured_given_count: int
    structured_expected_count: int
    completion_percent: int
    rant_entry: AdminRantEntryResponse | None = None
    structured_entries: list[AdminFeedbackEntryResponse] = Field(default_factory=list)


class AdminTeamFeedbackStatusResponse(BaseModel):
    """Per-team feedback completion summary with optional per-member drill-down."""

    team_id: int
    team_name: str
    cycle_id: int | None = None
    cycle_status: str | None = None
    cycle_start_date: datetime | None = None
    cycle_end_date: datetime | None = None
    member_count: int
    rant_submissions: int
    structured_submissions: int
    expected_structured_submissions: int
    completion_percent: int
    members: list[AdminMemberFeedbackStatusResponse] = Field(default_factory=list)
