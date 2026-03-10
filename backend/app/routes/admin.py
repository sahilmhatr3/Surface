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
    CycleCreate,
    CycleResponse,
    CycleUpdate,
    SetPasswordRequest,
    SetPasswordResponse,
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


@router.post("/users/import", response_model=UsersImportResponse)
def import_users(body: UsersImportRequest, db: Session = Depends(get_db)):
    """
    Import users and teams from JSON. Creates teams by unique team_name, then users.
    manager_id is the ID of an existing user (manager); omit for managers/admins or top-level.
    Duplicate emails are skipped with an error.
    Imported users have no password (password_hash null) until they set one or are invited.
    """
    errors: list[str] = []
    team_by_name: dict[str, Team] = {}
    user_by_email: dict[str, User] = {}

    # Unique team names; get or create teams
    team_names = {row.team_name.strip() for row in body.users}
    teams_created = 0
    for name in team_names:
        team = db.query(Team).filter(Team.name == name).first()
        if not team:
            team = Team(name=name)
            db.add(team)
            db.flush()
            teams_created += 1
        team_by_name[name] = team
    db.commit()
    # Reload teams to have committed IDs
    team_by_name = {name: db.query(Team).filter(Team.name == name).one() for name in team_names}

    users_created = 0
    for row in body.users:
        email = row.email.lower().strip()
        if email in user_by_email:
            errors.append(f"Duplicate email in request: {email}")
            continue
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            errors.append(f"Email already exists: {email}")
            continue
        team = team_by_name.get(row.team_name.strip())
        if not team:
            errors.append(f"Unknown team name: {row.team_name}")
            continue
        manager_id = row.manager_id
        if manager_id is not None:
            manager = db.get(User, manager_id)
            if not manager:
                errors.append(f"Manager ID not found for {email}: {manager_id}")
                manager_id = None
        user = User(
            name=row.name.strip(),
            email=email,
            role=row.role,
            team_id=team.id,
            manager_id=manager_id,
            password_hash=None,
        )
        db.add(user)
        db.flush()
        user_by_email[email] = user
        users_created += 1

    db.commit()

    return UsersImportResponse(
        teams_created=len(team_names),
        users_created=users_created,
        errors=errors if errors else [],
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
):
    """
    Set or reset password for a user, or generate a random one.
    When generate=true, returns 200 with { temporary_password } for the admin to share.
    When password=..., returns 204 No Content.
    Admin only.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.generate:
        temporary = _generate_temporary_password()
        user.password_hash = hash_password(temporary)
        user.must_reset_password = True
        db.commit()
        return SetPasswordResponse(temporary_password=temporary)
    else:
        assert body.password
        user.password_hash = hash_password(body.password)
        user.must_reset_password = True
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    """List all teams. Admin uses this to pick team_id when creating cycles."""
    teams = db.query(Team).order_by(Team.name).all()
    return teams


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
