"""
Admin routes: user/team import, create cycle. All require admin role.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import FeedbackCycle, Team, User
from app.schemas.admin import (
    CycleCreate,
    CycleResponse,
    TeamResponse,
    UserImportRow,
    UsersImportRequest,
    UsersImportResponse,
)
from app.core.security import get_current_admin_user

router = APIRouter(dependencies=[Depends(get_current_admin_user)])


@router.post("/users/import", response_model=UsersImportResponse)
def import_users(body: UsersImportRequest, db: Session = Depends(get_db)):
    """
    Import users and teams from JSON. Creates teams by unique team_name, then users.
    manager_email is resolved after all users are created. Duplicate emails are skipped with an error.
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
        user = User(
            name=row.name.strip(),
            email=email,
            role=row.role,
            team_id=team.id,
            manager_id=None,
            password_hash=None,
        )
        db.add(user)
        db.flush()
        user_by_email[email] = user
        users_created += 1

    db.commit()

    # Resolve manager_id by manager_email
    for row in body.users:
        if not row.manager_email:
            continue
        email = row.email.lower().strip()
        user = user_by_email.get(email)
        if not user:
            continue
        manager = db.query(User).filter(User.email == row.manager_email.strip().lower()).first()
        if manager:
            user.manager_id = manager.id
        else:
            errors.append(f"Manager email not found for {email}: {row.manager_email}")

    db.commit()

    return UsersImportResponse(
        teams_created=len(team_names),
        users_created=users_created,
        errors=errors if errors else [],
    )


@router.get("/teams", response_model=list[TeamResponse])
def list_teams(db: Session = Depends(get_db)):
    """List all teams. Admin uses this to pick team_id when creating cycles."""
    teams = db.query(Team).order_by(Team.name).all()
    return teams


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
