"""
Admin: user/team import and cycle creation.
"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator


class UserImportRow(BaseModel):
    """One row for user import. Use team_id (from dropdown) or team_name (get-or-create)."""

    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    role: str = Field(..., pattern="^(employee|manager|admin)$")
    team_id: int | None = Field(None, description="Existing team ID from dropdown; if set, team_name is ignored.")
    team_name: str | None = Field(None, min_length=1, max_length=255, description="Team name for get-or-create when team_id not set.")
    manager_id: int | None = Field(None, description="ID of this user's manager; omit for managers/admins.")

    @model_validator(mode="after")
    def require_team(self):
        if self.team_id is None and not (self.team_name and self.team_name.strip()):
            raise ValueError("Provide team_id or team_name")
        return self


class UsersImportRequest(BaseModel):
    """Bulk user import. Creates teams by name and assigns users. Admin can choose team names via team_name in each row."""

    users: list[UserImportRow] = Field(..., min_length=1, max_length=500)


class CreatedUserPassword(BaseModel):
    """One created user's id, email, and temporary password (when auto-generated)."""

    user_id: int
    email: str
    temporary_password: str


class UsersImportResponse(BaseModel):
    """Result of user import. Includes temporary passwords for auto-created manager/employee accounts."""

    teams_created: int
    users_created: int
    errors: list[str] = Field(default_factory=list)
    created_user_passwords: list[CreatedUserPassword] = Field(default_factory=list)


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
    participation_rants: int | None = None
    participation_structured: int | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class CycleUpdate(BaseModel):
    """Admin: close early or extend cycle window."""

    status: str | None = Field(None, description="e.g. open, closed")
    end_date: datetime | None = Field(None, description="New end date (e.g. to extend)")


class SetPasswordRequest(BaseModel):
    """Admin: set or reset password for a user, or generate a random one."""

    password: str | None = Field(None, min_length=8, max_length=128)
    generate: bool = Field(False, description="If true, generate random password and return it; ignore password.")

    @model_validator(mode="after")
    def require_password_or_generate(self):
        if not self.generate and not self.password:
            raise ValueError("Provide password or set generate=true")
        if self.generate and self.password:
            raise ValueError("Use either password or generate, not both")
        return self


class SetPasswordResponse(BaseModel):
    """Returned when generate=true; one-time temporary password for admin to share."""

    temporary_password: str


class VerifyPasswordRequest(BaseModel):
    """Admin: verify own password before revealing a generated user password."""

    password: str = Field(..., min_length=1, max_length=128)


class RevealPasswordResponse(BaseModel):
    """Returned when admin verifies and user has a stored temporary password."""

    temporary_password: str


class TeamCreate(BaseModel):
    """Request to create a single team."""

    name: str = Field(..., min_length=1, max_length=255)
