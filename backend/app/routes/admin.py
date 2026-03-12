"""
Admin routes: user/team import, create cycle. All require admin role.
"""
import secrets
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import FeedbackCycle, Team, User
from app.schemas.admin import (
    CreatedUserPassword,
    CycleCreate,
    CycleResponse,
    CycleUpdate,
    RevealPasswordResponse,
    SetPasswordRequest,
    SetPasswordResponse,
    TeamCreate,
    TeamResponse,
    UserImportRow,
    UsersImportRequest,
    UsersImportResponse,
    VerifyPasswordRequest,
)
from app.schemas.auth import UserResponse
from app.core.security import get_current_admin_user
from app.services.auth import hash_password, verify_password

router = APIRouter(dependencies=[Depends(get_current_admin_user)])


def _get_or_create_team_by_name(name: str, db: Session) -> Team:
    name = name.strip()
    team = db.query(Team).filter(Team.name == name).first()
    if not team:
        team = Team(name=name)
        db.add(team)
        db.flush()
    return team


@router.post("/users/import", response_model=UsersImportResponse)
def import_users(body: UsersImportRequest, db: Session = Depends(get_db)):
    """
    Import users and teams. Each row may use team_id (existing) or team_name (get-or-create).
    manager_id is required for employees; omit for managers/admins.
    Manager/employee accounts get an auto-generated password (returned in created_user_passwords).
    Admins have no password until set manually.
    """
    errors: list[str] = []
    created_user_passwords: list[CreatedUserPassword] = []
    team_by_name: dict[str, Team] = {}
    teams_created = 0

    # First pass: ensure all teams exist (by name) so we can count teams_created
    for row in body.users:
        if row.team_id is not None:
            continue
        name = (row.team_name or "").strip()
        if not name or name in team_by_name:
            continue
        team = db.query(Team).filter(Team.name == name).first()
        if not team:
            team = Team(name=name)
            db.add(team)
            db.flush()
            teams_created += 1
        team_by_name[name] = team
    db.flush()

    users_created = 0
    for row in body.users:
        email = row.email.lower().strip()
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            errors.append(f"Email already exists: {email}")
            continue
        if row.team_id is not None:
            team = db.get(Team, row.team_id)
            if not team:
                errors.append(f"Team ID not found for {email}: {row.team_id}")
                continue
        else:
            name = (row.team_name or "").strip()
            if not name:
                errors.append(f"Missing team_id/team_name for {email}")
                continue
            team = team_by_name.get(name) or db.query(Team).filter(Team.name == name).first()
            if not team:
                errors.append(f"Unknown team name for {email}: {name}")
                continue
        manager_id = row.manager_id
        if manager_id is not None:
            manager = db.get(User, manager_id)
            if not manager:
                errors.append(f"Manager ID not found for {email}: {manager_id}")
                manager_id = None
        temporary_plaintext = None
        password_hash = None
        if row.role in ("manager", "employee"):
            temporary_plaintext = _generate_temporary_password()
            password_hash = hash_password(temporary_plaintext)
        user = User(
            name=row.name.strip(),
            email=email,
            role=row.role,
            team_id=team.id,
            manager_id=manager_id,
            password_hash=password_hash,
            temporary_password_plaintext=temporary_plaintext,
            must_reset_password=bool(password_hash),
        )
        db.add(user)
        db.flush()
        users_created += 1
        if temporary_plaintext:
            created_user_passwords.append(
                CreatedUserPassword(user_id=user.id, email=user.email, temporary_password=temporary_plaintext)
            )

    db.commit()

    return UsersImportResponse(
        teams_created=teams_created,
        users_created=users_created,
        errors=errors if errors else [],
        created_user_passwords=created_user_passwords,
    )


@router.get("/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    """List all users (id, name, email, role, team_id, manager_id). Use to find user_id for set-password."""
    users = db.query(User).order_by(User.email).all()
    return users


def _generate_temporary_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.patch("/users/{user_id}/password")
def set_user_password(
    user_id: int,
    body: SetPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Set or reset password for a user, or generate a random one.
    Admins cannot generate a password for themselves (would overwrite and log them out).
    When generate=true, stores the temporary password so admin can reveal it later; returns 200 with { temporary_password }.
    When password=..., returns 204 No Content. Admin only.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.generate:
        if current_user.id == user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot generate password for yourself; use Change password to set your own.",
            )
        temporary = _generate_temporary_password()
        user.password_hash = hash_password(temporary)
        user.temporary_password_plaintext = temporary
        user.must_reset_password = True
        db.commit()
        return SetPasswordResponse(temporary_password=temporary)
    else:
        assert body.password
        user.password_hash = hash_password(body.password)
        user.temporary_password_plaintext = None
        user.must_reset_password = True
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/reveal-password", response_model=RevealPasswordResponse)
def reveal_user_password(
    user_id: int,
    body: VerifyPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Verify the admin's password, then return the user's stored temporary password (if any).
    Used so admin can view and share the initial password for a created user.
    """
    if not current_user.password_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No password set")
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.temporary_password_plaintext:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No temporary password stored for this user",
        )
    return RevealPasswordResponse(temporary_password=user.temporary_password_plaintext)


@router.post("/verify-password", status_code=status.HTTP_204_NO_CONTENT)
def verify_admin_password(
    body: VerifyPasswordRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Verify the current admin's password. Use before revealing a generated user password."""
    if not current_user.password_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No password set")
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")


@router.get("/teams", response_model=list[TeamResponse])
def list_teams(db: Session = Depends(get_db)):
    """List all teams. Admin uses this to pick team_id when creating cycles or users."""
    teams = db.query(Team).order_by(Team.name).all()
    return teams


@router.post("/teams", response_model=TeamResponse)
def create_team(body: TeamCreate, db: Session = Depends(get_db)):
    """Create a single team by name. Admin only. Fails if name already exists."""
    existing = db.query(Team).filter(Team.name == body.name.strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A team with this name already exists",
        )
    team = Team(name=body.name.strip())
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.get("/teams/{team_id}/cycles", response_model=list[CycleResponse])
def list_team_cycles(team_id: int, db: Session = Depends(get_db)):
    """List all feedback cycles for a team. Admin only."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    cycles = (
        db.query(FeedbackCycle)
        .filter(FeedbackCycle.team_id == team_id)
        .order_by(FeedbackCycle.start_date.desc())
        .all()
    )
    return cycles


@router.post("/teams/{team_id}/cycles", response_model=CycleResponse)
def create_cycle(
    team_id: int,
    body: CycleCreate,
    db: Session = Depends(get_db),
):
    """Create a new feedback cycle for a team. Status is set to open."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    # Normalize to UTC if naive
    start = body.start_date if body.start_date.tzinfo else body.start_date.replace(tzinfo=timezone.utc)
    end = body.end_date if body.end_date.tzinfo else body.end_date.replace(tzinfo=timezone.utc)
    cycle = FeedbackCycle(
        team_id=team_id,
        start_date=start,
        end_date=end,
        status="open",
    )
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    return cycle


@router.patch("/teams/{team_id}/cycles/{cycle_id}", response_model=CycleResponse)
def update_cycle(
    team_id: int,
    cycle_id: int,
    body: CycleUpdate,
    db: Session = Depends(get_db),
):
    """Admin: close cycle early or extend end_date. Only status and end_date are updatable."""
    cycle = db.get(FeedbackCycle, cycle_id)
    if not cycle or cycle.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    if body.status is not None:
        if body.status not in ("open", "closed", "aggregated"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
        cycle.status = body.status
    if body.end_date is not None:
        end = body.end_date if body.end_date.tzinfo else body.end_date.replace(tzinfo=timezone.utc)
        if end <= cycle.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date must be after start_date")
        cycle.end_date = end
        # Re-open cycle when extending into the future so feedback is allowed again
        now = datetime.now(timezone.utc)
        if end > now and cycle.status == "closed":
            cycle.status = "open"
    db.commit()
    db.refresh(cycle)
    return cycle
