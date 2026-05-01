"""
Admin routes: user/team management and cycle operations. All require admin role.
"""
import logging
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response  # used by wipe_cycle_raw_data
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.db import get_db
from app.models import AppFeedback, FeedbackCycle, Rant, StructuredFeedback, Team, User
from app.utils import record_cycle_event
from app.schemas.admin import (
    AdminFeedbackEntryResponse,
    AdminMemberFeedbackStatusResponse,
    AdminRantEntryResponse,
    AdminTeamFeedbackStatusResponse,
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
from app.schemas.app_feedback import AppFeedbackItemResponse
from app.core.security import get_current_admin_user
from app.core.config import settings

router = APIRouter(dependencies=[Depends(get_current_admin_user)])


def _auth_public_base_url() -> str:
    """Browser-reachable SPA origin for Supabase email redirect_to (invite / recovery)."""
    if settings.APP_PUBLIC_URL and settings.APP_PUBLIC_URL.strip():
        return settings.APP_PUBLIC_URL.strip().rstrip("/")
    if settings.CORS_ORIGINS:
        return settings.CORS_ORIGINS[0].rstrip("/")
    return "http://localhost:5173"


def _supabase_auth_headers() -> dict[str, str]:
    key = settings.SUPABASE_SERVICE_ROLE_KEY or ""
    return {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "application/json",
    }


def _parse_user_id_from_auth_json(data: dict) -> str | None:
    user = data.get("user") if isinstance(data.get("user"), dict) else None
    if user and user.get("id"):
        return str(user["id"])
    if data.get("id"):
        return str(data["id"])
    return None


def _find_supabase_auth_user_id_by_email(email: str) -> str | None:
    """Paginate Auth users until we find a matching email (case-insensitive)."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None
    target = email.lower().strip()
    base = settings.SUPABASE_URL.rstrip("/")
    page = 1
    per_page = 200
    max_pages = 50
    while page <= max_pages:
        try:
            r = httpx.get(
                f"{base}/auth/v1/admin/users",
                headers=_supabase_auth_headers(),
                params={"page": str(page), "per_page": str(per_page)},
                timeout=30,
            )
            r.raise_for_status()
            payload = r.json()
            users = payload.get("users") or []
        except Exception as exc:
            logger.error("Failed to list Supabase auth users (page %s): %s", page, exc)
            return None
        for u in users:
            if (u.get("email") or "").lower() == target:
                uid = u.get("id")
                return str(uid) if uid else None
        if len(users) < per_page:
            break
        page += 1
    return None


def _send_password_recovery_email(email: str, redirect_path: str) -> bool:
    """
    Ask Supabase to email a password-reset link (uses anon key; same as client resetPasswordForEmail).
    redirect_path should be a full URL, e.g. https://app.example.com/auth/reset-password
    """
    anon = settings.SUPABASE_ANON_KEY
    if not settings.SUPABASE_URL or not anon:
        return False
    base = settings.SUPABASE_URL.rstrip("/")
    qs = urlencode({"redirect_to": redirect_path})
    try:
        r = httpx.post(
            f"{base}/auth/v1/recover?{qs}",
            headers={
                "Authorization": f"Bearer {anon}",
                "apikey": anon,
                "Content-Type": "application/json",
            },
            json={"email": email},
            timeout=15,
        )
        r.raise_for_status()
        return True
    except Exception as exc:
        logger.error("Failed to send Supabase recovery email for %s: %s", email, exc)
        return False


def _invite_supabase_auth_user(email: str) -> str | None:
    """
    Invite user via Supabase Auth — creates the Auth user and sends the invite email so they can set a password.
    (Admin createUser does not send mail; invite does.)

    If invite fails because the email already exists in Auth, we try to reuse that user id and send a
    password-recovery email instead (requires SUPABASE_ANON_KEY).
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured; skipping auth user creation")
        return None

    base = settings.SUPABASE_URL.rstrip("/")
    public_base = _auth_public_base_url()
    # Invite emails must land on /auth/callback?flow=invite so the SPA sends users to set
    # a password (invite sessions are SIGNED_IN, not PASSWORD_RECOVERY).
    invite_redirect = f"{public_base}/auth/callback?flow=invite"
    recovery_redirect = f"{public_base}/auth/reset-password"

    qs = urlencode({"redirect_to": invite_redirect})
    url = f"{base}/auth/v1/invite?{qs}"

    try:
        r = httpx.post(
            url,
            headers=_supabase_auth_headers(),
            json={"email": email, "data": {}},
            timeout=15,
        )
        r.raise_for_status()
        uid = _parse_user_id_from_auth_json(r.json())
        if not uid:
            logger.error("Supabase invite OK but no user id in body for %s: %s", email, r.text)
            return None
        logger.info("Supabase invite email sent for %s", email)
        return uid
    except httpx.HTTPStatusError as exc:
        resp = exc.response
        code = resp.status_code if resp else 0
        body = resp.text if resp else ""
        logger.warning(
            "Supabase invite HTTP %s for %s: %s",
            code,
            email,
            body[:500],
        )
        # Only treat likely "already exists" / validation responses as duplicate-user fallback
        if code not in (400, 409, 422):
            return None
        existing = _find_supabase_auth_user_id_by_email(email)
        if not existing:
            return None
        if _send_password_recovery_email(email, recovery_redirect):
            logger.info("Sent password-recovery email to existing Auth user %s", email)
        else:
            logger.warning(
                "Auth user %s already exists but recovery email was not sent "
                "(set SUPABASE_ANON_KEY in backend .env to enable).",
                email,
            )
        return existing
    except Exception as exc:
        logger.error("Failed to invite Supabase user %s: %s", email, exc)
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
    Import users and teams. Creates Supabase Auth users via invite (invite email to set password).
    Each row: name, email, role, team_id or team_name, optional manager_id.
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
        # Supabase Auth: invite sends “set password” email; stores UUID for supabase_id
        supabase_uid = _invite_supabase_auth_user(email)
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
            locale=row.locale or "en",
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


@router.get("/app-feedback", response_model=list[AppFeedbackItemResponse])
def list_app_feedback(db: Session = Depends(get_db)):
    """Admin-only list of all app feedback submissions, newest first."""
    rows = db.query(AppFeedback).order_by(AppFeedback.created_at.desc(), AppFeedback.id.desc()).all()
    user_ids = {r.user_id for r in rows}
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    user_map = {u.id: u for u in users}
    return [
        AppFeedbackItemResponse(
            id=r.id,
            user_id=r.user_id,
            user_name=user_map[r.user_id].name if r.user_id in user_map else f"User #{r.user_id}",
            user_email=user_map[r.user_id].email if r.user_id in user_map else "unknown",
            category=r.category,
            text=r.text,
            attachments=r.attachments or [],
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/feedback-status", response_model=list[AdminTeamFeedbackStatusResponse])
def feedback_status(db: Session = Depends(get_db)):
    """
    Admin-only x-ray view:
    - Team-level completion for the most relevant cycle (open first, else latest)
    - Per-member completion
    - Raw submitted entries (structured + rant)
    """
    teams = db.query(Team).order_by(Team.name).all()
    out: list[AdminTeamFeedbackStatusResponse] = []

    for team in teams:
        members = (
            db.query(User)
            .filter(User.team_id == team.id)
            .order_by(User.name, User.id)
            .all()
        )
        member_ids = [m.id for m in members]
        member_name_by_id = {m.id: m.name for m in members}

        cycle = (
            db.query(FeedbackCycle)
            .filter(FeedbackCycle.team_id == team.id)
            .order_by(
                (FeedbackCycle.status == "open").desc(),
                FeedbackCycle.start_date.desc(),
                FeedbackCycle.id.desc(),
            )
            .first()
        )

        if not cycle or not member_ids:
            out.append(
                AdminTeamFeedbackStatusResponse(
                    team_id=team.id,
                    team_name=team.name,
                    member_count=len(members),
                    rant_submissions=0,
                    structured_submissions=0,
                    expected_structured_submissions=max(0, len(members) * (len(members) - 1)),
                    completion_percent=0,
                    members=[
                        AdminMemberFeedbackStatusResponse(
                            user_id=m.id,
                            name=m.name,
                            email=m.email,
                            role=m.role,
                            has_rant=False,
                            structured_given_count=0,
                            structured_expected_count=max(0, len(members) - 1),
                            completion_percent=0,
                            rant_entry=None,
                            structured_entries=[],
                        )
                        for m in members
                    ],
                )
            )
            continue

        rant_rows = (
            db.query(Rant)
            .filter(Rant.cycle_id == cycle.id, Rant.user_id.in_(member_ids))
            .all()
        )
        structured_rows = (
            db.query(StructuredFeedback)
            .filter(StructuredFeedback.cycle_id == cycle.id, StructuredFeedback.giver_id.in_(member_ids))
            .all()
        )

        rant_by_user = {r.user_id: r for r in rant_rows}
        structured_by_giver: dict[int, list[StructuredFeedback]] = {}
        for s in structured_rows:
            structured_by_giver.setdefault(s.giver_id, []).append(s)

        expected_rants = len(members)
        expected_structured = max(0, len(members) * (len(members) - 1))
        actual_rants = len(rant_rows)
        actual_structured = len(structured_rows)
        denom = expected_rants + expected_structured
        team_completion = int(round(((actual_rants + actual_structured) / denom) * 100)) if denom > 0 else 0

        member_statuses: list[AdminMemberFeedbackStatusResponse] = []
        for m in members:
            member_rant = rant_by_user.get(m.id)
            given = structured_by_giver.get(m.id, [])
            expected_for_member = max(0, len(members) - 1)
            member_denom = 1 + expected_for_member
            done = (1 if member_rant else 0) + len(given)
            member_pct = int(round((done / member_denom) * 100)) if member_denom > 0 else 0
            member_statuses.append(
                AdminMemberFeedbackStatusResponse(
                    user_id=m.id,
                    name=m.name,
                    email=m.email,
                    role=m.role,
                    has_rant=member_rant is not None,
                    structured_given_count=len(given),
                    structured_expected_count=expected_for_member,
                    completion_percent=member_pct,
                    rant_entry=(
                        AdminRantEntryResponse(
                            id=member_rant.id,
                            raw_text=member_rant.raw_text,
                            anonymized_text=member_rant.anonymized_text,
                            theme=member_rant.theme,
                            sentiment=member_rant.sentiment,
                            created_at=member_rant.created_at,
                        )
                        if member_rant
                        else None
                    ),
                    structured_entries=[
                        AdminFeedbackEntryResponse(
                            id=s.id,
                            receiver_id=s.receiver_id,
                            receiver_name=member_name_by_id.get(s.receiver_id, f"User #{s.receiver_id}"),
                            scores=s.scores or {},
                            comments_helpful=s.comments_helpful,
                            comments_improvement=s.comments_improvement,
                            created_at=s.created_at,
                        )
                        for s in sorted(given, key=lambda row: (row.created_at is None, row.created_at))
                    ],
                )
            )

        out.append(
            AdminTeamFeedbackStatusResponse(
                team_id=team.id,
                team_name=team.name,
                cycle_id=cycle.id,
                cycle_status=cycle.status,
                cycle_start_date=cycle.start_date,
                cycle_end_date=cycle.end_date,
                member_count=len(members),
                rant_submissions=actual_rants,
                structured_submissions=actual_structured,
                expected_structured_submissions=expected_structured,
                completion_percent=team_completion,
                members=member_statuses,
            )
        )

    return out


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
