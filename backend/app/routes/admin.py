"""
Admin routes: user/team management and cycle operations. All require admin role.
"""
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response  # used by wipe_cycle_raw_data
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.db import get_db
from app.models import FeedbackCycle, Rant, StructuredFeedback, Team, User
from app.utils import record_cycle_event
from app.schemas.admin import (
    CycleCreate,
    CycleResponse,
    CycleUpdate,
    TeamCreate,
    TeamResponse,
    UserImportRow,
    UsersImportRequest,
    UsersImportResponse,
)
from app.schemas.auth import UserResponse
from app.core.security import get_current_admin_user
from app.core.config import settings

router = APIRouter(dependencies=[Depends(get_current_admin_user)])


def _create_supabase_auth_user(email: str) -> str | None:
    """
    Create a user in Supabase Auth via the Admin API.
    Returns the Supabase user UUID (stored as supabase_id) or None on failure.
    The user is created with email_confirm=True so they are active immediately.
    They must use the password-reset / invite flow to set their own password.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured; skipping auth user creation")
        return None
    try:
        r = httpx.post(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "application/json",
            },
            json={"email": email, "email_confirm": True},
            timeout=10,
        )
        r.raise_for_status()
        return r.json().get("id")
    except Exception as exc:
        logger.error("Failed to create Supabase auth user for %s: %s", email, exc)
        return None


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
    Import users and teams. Each row requires: name, email, password, role, and
    either team_id (existing) or team_name (get-or-create). manager_id is
    required for employees. The admin provides the initial password for each user.
    """
    errors: list[str] = []
    team_by_name: dict[str, Team] = {}
    teams_created = 0

    # First pass: ensure all teams exist
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
        # Create the user in Supabase Auth first so we can store the UUID
        supabase_uid = _create_supabase_auth_user(email)
        if supabase_uid is None:
            errors.append(f"Failed to create Supabase auth account for {email}; skipping")
            continue

        user = User(
            name=row.name.strip(),
            email=email,
            role=row.role,
            team_id=team.id,
            manager_id=manager_id,
            supabase_id=supabase_uid,
        )
        db.add(user)
        users_created += 1

    db.commit()

    return UsersImportResponse(
        teams_created=teams_created,
        users_created=users_created,
        errors=errors if errors else [],
    )


@router.get("/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    """List all users. Admin only."""
    users = db.query(User).order_by(User.email).all()
    return users


@router.get("/teams", response_model=list[TeamResponse])
def list_teams(db: Session = Depends(get_db)):
    """List all teams. Admin only."""
    teams = db.query(Team).order_by(Team.name).all()
    return teams


@router.post("/teams", response_model=TeamResponse)
def create_team(body: TeamCreate, db: Session = Depends(get_db)):
    """Create a single team by name. Admin only."""
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
    current_user: User = Depends(get_current_admin_user),
):
    """Create a new feedback cycle for a team. Status starts as open."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    start = body.start_date if body.start_date.tzinfo else body.start_date.replace(tzinfo=timezone.utc)
    end = body.end_date if body.end_date.tzinfo else body.end_date.replace(tzinfo=timezone.utc)
    cycle = FeedbackCycle(
        team_id=team_id,
        start_date=start,
        end_date=end,
        status="open",
    )
    db.add(cycle)
    db.flush()
    record_cycle_event(db, cycle.id, "created", actor=current_user)
    db.commit()
    db.refresh(cycle)
    return cycle


@router.patch("/teams/{team_id}/cycles/{cycle_id}", response_model=CycleResponse)
def update_cycle(
    team_id: int,
    cycle_id: int,
    body: CycleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Admin: close cycle early or extend end_date."""
    cycle = db.get(FeedbackCycle, cycle_id)
    if not cycle or cycle.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    if body.status is not None:
        if body.status not in ("open", "closed", "compiled", "published"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
        prev_status = cycle.status
        cycle.status = body.status
        if body.status == "closed" and prev_status != "closed":
            record_cycle_event(db, cycle.id, "closed_manual", actor=current_user)
        elif body.status == "open" and prev_status != "open":
            record_cycle_event(db, cycle.id, "reopened", actor=current_user)
    if body.end_date is not None:
        end = body.end_date if body.end_date.tzinfo else body.end_date.replace(tzinfo=timezone.utc)
        if end <= cycle.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date must be after start_date")
        old_end = cycle.end_date
        cycle.end_date = end
        now = datetime.now(timezone.utc)
        if end > now and cycle.status == "closed":
            cycle.status = "open"
            record_cycle_event(db, cycle.id, "reopened", actor=current_user,
                               note="Auto-reopened: end date extended into the future")
        if end != old_end:
            record_cycle_event(db, cycle.id, "end_date_extended", actor=current_user,
                               note=f"New end date: {end.strftime('%Y-%m-%d %H:%M UTC')}")
    db.commit()
    db.refresh(cycle)
    return cycle


@router.delete("/teams/{team_id}/cycles/{cycle_id}/raw-data", status_code=204)
def wipe_cycle_raw_data(
    team_id: int,
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Admin: immediately delete all raw rants and structured feedback for a compiled cycle.
    Irreversible — the cycle cannot be recompiled afterwards.
    """
    cycle = db.get(FeedbackCycle, cycle_id)
    if not cycle or cycle.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    if cycle.status not in ("compiled", "published"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Raw data can only be wiped from compiled or published cycles.",
        )
    db.query(Rant).filter(Rant.cycle_id == cycle_id).delete()
    db.query(StructuredFeedback).filter(StructuredFeedback.cycle_id == cycle_id).delete()
    cycle.raw_data_expires_at = None
    record_cycle_event(db, cycle.id, "raw_data_wiped_manual", actor=current_user)
    db.commit()
    return Response(status_code=204)
