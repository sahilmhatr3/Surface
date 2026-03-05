"""
Admin: user/team import and cycle creation.
"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator


class UserImportRow(BaseModel):
    """One row for user import (CSV or JSON)."""

    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    role: str = Field(..., pattern="^(employee|manager|admin)$")
    team_name: str = Field(..., min_length=1, max_length=255)
    manager_email: str | None = Field(None, description="Email of this user's manager; omit for managers/admins or top-level.")


class UsersImportRequest(BaseModel):
    """Bulk user import. Creates teams by name and assigns users. Admin can choose team names via team_name in each row."""

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
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
