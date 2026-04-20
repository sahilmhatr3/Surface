"""
Cycle routes: themes, manager summary, actions, employee summary.
All require auth; some require manager of the cycle's team.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models import Action, CycleEvent, CycleInsight, CycleReceiverSummary, FeedbackCycle, RantDirectedSegment, User
from app.services.aggregation import cleanup_expired_raw_data, run_aggregation
from app.services import published_display as pubdisp
from app.schemas.cycles import (
    ActionCreate,
    ActionResponse,
    ActionUpdate,
    CycleEventResponse,
    DirectedRantSegmentItem,
    IncomingFeedbackResponse,
    ManagerReviewResponse,
    ManagerReviewUpdateRequest,
    ManagerSummaryResponse,
    ThemeItem,
    ThemesResponse,
    CycleSummaryResponse,
)
from app.schemas.admin import CycleResponse
from app.core.security import get_current_user
from app.utils import normalize_content_locale, record_cycle_event

router = APIRouter()

BELOW_THRESHOLD_NOTE = "Theme expressed but not enough responses to show anonymized example comments."
DIRECTED_RANT_BELOW_THRESHOLD_NOTE = "Open feedback was directed at you but there are not enough responses to show anonymized snippets."

# Per-receiver structured summaries (CycleReceiverSummary) are always returned in full when present:
# compiled snippets are AI-synthesized and non-verbatim. ANONYMITY_THRESHOLD still applies to
# team-level rant themes and directed rant segments only.


def _maybe_auto_close(db: Session, cycle: FeedbackCycle) -> None:
    """If cycle is open and end_date has passed, set status to closed."""
    if cycle.status != "open":
        return
    now = datetime.now(timezone.utc)
    end = cycle.end_date if cycle.end_date.tzinfo else cycle.end_date.replace(tzinfo=timezone.utc)
    if end < now:
        cycle.status = "closed"
        record_cycle_event(db, cycle.id, "closed_auto",
                           note=f"End date {end.strftime('%Y-%m-%d %H:%M UTC')} passed")
        db.commit()


def _get_cycle(db: Session, cycle_id: int) -> FeedbackCycle:
    cycle = db.get(FeedbackCycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    _maybe_auto_close(db, cycle)
    return cycle


def _require_team_member(cycle: FeedbackCycle, user: User) -> None:
    """Raise 403 if user is not in the cycle's team (or admin)."""
    if user.role == "admin":
        return
    if user.team_id != cycle.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not in this cycle's team")


def _get_team_manager_id(db: Session, team_id: int) -> int | None:
    """Return the manager user id for the team, or None."""
    u = db.query(User).filter(User.team_id == team_id, User.role == "manager").first()
    return u.id if u else None


def _require_cycle_manager(cycle: FeedbackCycle, user: User, db: Session) -> None:
    """Raise 403 if user is not the manager of the cycle's team (or admin)."""
    if user.role == "admin":
        return
    manager_id = _get_team_manager_id(db, cycle.team_id)
    if manager_id is None or user.id != manager_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager access required")


def _is_cycle_manager(cycle: FeedbackCycle, user: User, db: Session) -> bool:
    if user.role == "admin":
        return True
    manager_id = _get_team_manager_id(db, cycle.team_id)
    return manager_id is not None and user.id == manager_id


@router.get("", response_model=list[CycleResponse])
def list_cycles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List feedback cycles for the current user's team. Returns empty list if user has no team (e.g. admin).
    """
    if current_user.team_id is None:
        return []
    cycles = (
        db.query(FeedbackCycle)
        .filter(FeedbackCycle.team_id == current_user.team_id)
        .order_by(FeedbackCycle.start_date.desc())
        .all()
    )
    for c in cycles:
        _maybe_auto_close(db, c)
    return cycles


@router.get("/score-history")
def get_score_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Historical average structured scores per cycle.
    - Employees: their own scores from CycleReceiverSummary.
    - Managers/admins: team-wide average across all receiver summaries per cycle.
    Only cycles where individuals_published=True are included.
    """
    if not current_user.team_id:
        return []
    cycles_q = (
        db.query(FeedbackCycle)
        .filter(
            FeedbackCycle.team_id == current_user.team_id,
            FeedbackCycle.individuals_published == True,  # noqa: E712
        )
        .order_by(FeedbackCycle.start_date)
        .all()
    )
    is_manager = current_user.role in ("manager", "admin")
    result = []
    for cycle in cycles_q:
        if is_manager:
            rows = db.query(CycleReceiverSummary).filter(CycleReceiverSummary.cycle_id == cycle.id).all()
            if not rows:
                continue
            all_keys: set[str] = set()
            for r in rows:
                if r.average_scores:
                    all_keys.update(r.average_scores.keys())
            if not all_keys:
                continue
            agg: dict[str, float] = {}
            for k in sorted(all_keys):
                vals = [r.average_scores[k] for r in rows if r.average_scores and k in r.average_scores]
                agg[k] = round(sum(vals) / len(vals), 2) if vals else 0.0
        else:
            row = (
                db.query(CycleReceiverSummary)
                .filter(
                    CycleReceiverSummary.cycle_id == cycle.id,
                    CycleReceiverSummary.receiver_id == current_user.id,
                    CycleReceiverSummary.is_hidden == False,  # noqa: E712
                )
                .first()
            )
            if not row or not row.average_scores:
                continue
            agg = row.average_scores
        result.append({
            "cycle_id": cycle.id,
            "cycle_label": cycle.start_date.strftime("%b %Y") if cycle.start_date else f"#{cycle.id}",
            "start_date": cycle.start_date.isoformat() if cycle.start_date else None,
            "average_scores": agg,
        })
    return result


@router.get("/{cycle_id}/themes", response_model=ThemesResponse)
def get_themes(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Themes for a cycle (participation + theme list). Requires team member or admin.
    Returns themes after compile/publish.
    Employees see only published and non-hidden themes; manager/admin can review compiled themes.
    """
    cycle = _get_cycle(db, cycle_id)
    _require_team_member(cycle, current_user)
    part_rants = cycle.participation_rants if cycle.participation_rants is not None else 0
    part_struct = cycle.participation_structured if cycle.participation_structured is not None else 0
    manager_view = _is_cycle_manager(cycle, current_user, db)
    if cycle.status not in ("compiled", "published"):
        return ThemesResponse(
            cycle_id=cycle_id,
            participation_rants=part_rants,
            participation_structured=part_struct,
            themes=[],
        )
    # Employees only see team insights after team_published is set
    if not manager_view and not cycle.team_published:
        return ThemesResponse(
            cycle_id=cycle_id,
            participation_rants=part_rants,
            participation_structured=part_struct,
            themes=[],
        )
    if (
        not manager_view
        and cycle.team_published
        and cycle.team_publication_outdated
        and cycle.team_public_snapshot
    ):
        snap = cycle.team_public_snapshot
        themes_data = snap.get("themes") or []
        return ThemesResponse(
            cycle_id=cycle_id,
            participation_rants=part_rants,
            participation_structured=part_struct,
            themes=[ThemeItem.model_validate(x) for x in themes_data],
        )
    insights = db.query(CycleInsight).filter(CycleInsight.cycle_id == cycle_id).all()
    threshold = settings.ANONYMITY_THRESHOLD
    themes = []
    for i in insights:
        if not manager_view and i.is_hidden:
            continue
        below = i.count < threshold
        comments_raw = [] if below else (i.example_comments or [])
        if not manager_view and comments_raw and i.hidden_example_indices:
            hidden_idx = set(i.hidden_example_indices)
            comments_raw = [c for idx, c in enumerate(comments_raw) if idx not in hidden_idx]
        themes.append(
            ThemeItem(
                id=i.id,
                theme=i.theme,
                count=i.count,
                sentiment_summary=i.sentiment_summary,
                dominant_sentiment=i.dominant_sentiment,
                strength_score=i.strength_score,
                is_hidden=i.is_hidden,
                hidden_example_indices=list(i.hidden_example_indices or []),
                example_comments=comments_raw,
                below_threshold_note=BELOW_THRESHOLD_NOTE if below else None,
            )
        )
    return ThemesResponse(
        cycle_id=cycle_id,
        participation_rants=part_rants,
        participation_structured=part_struct,
        themes=themes,
    )


@router.get("/{cycle_id}/manager-summary", response_model=ManagerSummaryResponse)
def get_manager_summary(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Aggregated structured feedback about the current user (as manager). Requires manager of the cycle's team or admin.
    Only available after cycle is compiled/published.
    """
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    if cycle.status not in ("compiled", "published"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cycle not yet compiled")
    row = (
        db.query(CycleReceiverSummary)
        .filter(
            CycleReceiverSummary.cycle_id == cycle_id,
            CycleReceiverSummary.receiver_id == current_user.id,
        )
        .first()
    )
    if not row:
        return ManagerSummaryResponse(
            cycle_id=cycle_id,
            average_scores={},
            comment_snippets_helpful=[],
            comment_snippets_improvement=[],
            below_threshold_note="No summary available for this cycle.",
        )
    return ManagerSummaryResponse(
        id=row.id,
        receiver_id=row.receiver_id,
        cycle_id=cycle_id,
        average_scores=row.average_scores or {},
        respondent_count=row.respondent_count,
        sentiment=row.sentiment,
        strength_score=row.strength_score,
        is_hidden=row.is_hidden,
        comment_snippets_helpful=list(row.snippets_helpful or []),
        comment_snippets_improvement=list(row.snippets_improvement or []),
        below_threshold_note=None,
    )


@router.get("/{cycle_id}/incoming-feedback", response_model=IncomingFeedbackResponse)
def get_incoming_feedback(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    All feedback about the current user for this cycle: structured (scores + comments) and directed open feedback.
    After compile, feedback is manager-only until publish. Employees only see after publish.
    Structured compiled insights are always shown when present. Anonymity threshold applies only to directed rant segments.
    """
    cycle = _get_cycle(db, cycle_id)
    _require_team_member(cycle, current_user)

    structured: ManagerSummaryResponse | None = None
    manager_view = _is_cycle_manager(cycle, current_user, db)
    if (
        not manager_view
        and cycle.individuals_published
        and cycle.individual_publication_outdated
        and cycle.individual_public_snapshot
    ):
        by = (cycle.individual_public_snapshot or {}).get("by_receiver") or {}
        payload = by.get(str(current_user.id)) or by.get(current_user.id)
        if payload:
            return IncomingFeedbackResponse.model_validate(payload)
    # Employees only see individual feedback after individuals_published is set
    can_view = (cycle.status in ("compiled", "published") and cycle.individuals_published) or manager_view
    if cycle.status in ("compiled", "published") and can_view:
        row = (
            db.query(CycleReceiverSummary)
            .filter(
                CycleReceiverSummary.cycle_id == cycle_id,
                CycleReceiverSummary.receiver_id == current_user.id,
            )
            .first()
        )
        if row:
            if (not manager_view) and row.is_hidden:
                row = None
        if row:
            helpful = list(row.snippets_helpful or [])
            improvement = list(row.snippets_improvement or [])
            # Filter per-point indices hidden by manager for non-manager viewers
            if not manager_view:
                if helpful and row.hidden_helpful_indices:
                    hidden_h = set(row.hidden_helpful_indices)
                    helpful = [s for i, s in enumerate(helpful) if i not in hidden_h]
                if improvement and row.hidden_improvement_indices:
                    hidden_i = set(row.hidden_improvement_indices)
                    improvement = [s for i, s in enumerate(improvement) if i not in hidden_i]
            structured = ManagerSummaryResponse(
                id=row.id,
                receiver_id=row.receiver_id,
                cycle_id=cycle_id,
                average_scores=row.average_scores or {},
                respondent_count=row.respondent_count,
                sentiment=row.sentiment,
                strength_score=row.strength_score,
                is_hidden=row.is_hidden,
                comment_snippets_helpful=helpful,
                comment_snippets_improvement=improvement,
                below_threshold_note=None,
            )
        else:
            structured = ManagerSummaryResponse(
                cycle_id=cycle_id,
                average_scores={},
                comment_snippets_helpful=[],
                comment_snippets_improvement=[],
                below_threshold_note="No structured feedback for this cycle.",
            )

    segments = []
    if can_view:
        segments = (
            db.query(RantDirectedSegment)
            .filter(
                RantDirectedSegment.cycle_id == cycle_id,
                RantDirectedSegment.receiver_id == current_user.id,
            )
            .all()
        )
    threshold = settings.ANONYMITY_THRESHOLD
    if not manager_view:
        segments = [s for s in segments if not s.is_hidden]
    directed_below = len(segments) < threshold
    directed_list = [] if directed_below else [
        DirectedRantSegmentItem(
            id=s.id,
            receiver_id=s.receiver_id,
            snippet=s.snippet,
            theme=s.theme,
            sentiment=s.sentiment,
            is_hidden=s.is_hidden,
        )
        for s in segments
    ]

    # Individual actions published for this specific user
    individual_actions_q = db.query(Action).filter(
        Action.cycle_id == cycle_id,
        Action.receiver_id == current_user.id,
    )
    if not manager_view:
        individual_actions_q = individual_actions_q.filter(Action.is_hidden == False)  # noqa: E712
    individual_actions = individual_actions_q.all()

    return IncomingFeedbackResponse(
        cycle_id=cycle_id,
        structured=structured,
        directed_rant_segments=directed_list,
        directed_rant_below_threshold_note=DIRECTED_RANT_BELOW_THRESHOLD_NOTE if directed_below and segments else None,
        individual_actions=[ActionResponse.model_validate(a) for a in individual_actions],
    )


@router.get("/{cycle_id}/events", response_model=list[CycleEventResponse])
def get_cycle_events(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cycle lifecycle audit log.
    - Managers / admins: full history.
    - Employees: only the 'published' event (so they can see when results went live).
    """
    cycle = _get_cycle(db, cycle_id)
    _require_team_member(cycle, current_user)
    manager_view = _is_cycle_manager(cycle, current_user, db)
    events = (
        db.query(CycleEvent)
        .filter(CycleEvent.cycle_id == cycle_id)
        .order_by(CycleEvent.created_at)
        .all()
    )
    if not manager_view:
        events = [e for e in events if e.event_type in ("published", "published_team", "published_individuals")]
    return [CycleEventResponse.model_validate(e) for e in events]


@router.post("/{cycle_id}/actions", response_model=ActionResponse)
def create_action(
    cycle_id: int,
    body: ActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a manager action (team-level or individual). Requires manager of the cycle's team."""
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    # Validate individual target belongs to the same team
    if body.receiver_id is not None:
        target = db.get(User, body.receiver_id)
        if not target or target.team_id != cycle.team_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid receiver for this cycle's team")
    action = Action(
        cycle_id=cycle_id,
        manager_id=current_user.id,
        receiver_id=body.receiver_id,
        action_text=body.action_text,
        theme=body.theme,
        is_ai_generated=False,
        is_hidden=False,
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


@router.patch("/{cycle_id}/actions/{action_id}", response_model=ActionResponse)
def update_action(
    cycle_id: int,
    action_id: int,
    body: ActionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an action. Only the manager who created it (or admin) can update."""
    cycle = _get_cycle(db, cycle_id)
    action = db.get(Action, action_id)
    if not action or action.cycle_id != cycle_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    if current_user.role != "admin" and action.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your action")
    action.action_text = body.action_text
    db.commit()
    db.refresh(action)
    return action


@router.post("/{cycle_id}/compile", response_model=CycleResponse)
def compile_cycle(
    cycle_id: int,
    background_tasks: BackgroundTasks,
    output_locale: str | None = Query(
        None,
        max_length=10,
        description="Force AI output language for this compile: en or de (overrides majority from submissions).",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Compile feedback into themes, per-receiver summaries, and an AI brief.
    - Managers: cycle must be 'closed'.
    - Admins: can force-recompile from any status (open/closed/compiled/published).
      Recompile clears previous compiled data and rebuilds from current raw data.
    Requires manager of the cycle's team or admin.
    """
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    is_admin = current_user.role == "admin"
    if cycle.status != "closed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cycle must be closed before compiling.",
        )
    # Determine if this is a recompile (already has compiled data) before running aggregation
    is_recompile = cycle.status in ("compiled", "published")
    loc_override = (
        normalize_content_locale(output_locale)
        if output_locale is not None and str(output_locale).strip()
        else None
    )
    try:
        run_aggregation(db, cycle_id, force=is_admin, output_locale=loc_override)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    # Record the event (run_aggregation commits, so we need a fresh record + commit)
    event_type = "recompiled" if is_recompile else "compiled"
    record_cycle_event(db, cycle_id, event_type, actor=current_user)
    db.commit()
    # Lazily clean up expired raw data from other cycles in the background
    background_tasks.add_task(cleanup_expired_raw_data)
    cycle = _get_cycle(db, cycle_id)
    return cycle


@router.post("/{cycle_id}/aggregate", response_model=CycleResponse)
def aggregate_cycle_legacy(
    cycle_id: int,
    background_tasks: BackgroundTasks,
    output_locale: str | None = Query(None, max_length=10),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Backward-compatible alias for /compile."""
    return compile_cycle(
        cycle_id=cycle_id,
        background_tasks=background_tasks,
        output_locale=output_locale,
        db=db,
        current_user=current_user,
    )


@router.get("/{cycle_id}/manager-review", response_model=ManagerReviewResponse)
def get_manager_review(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Manager-only review view after compile, before/after publish.
    Shows all compiled items with sentiment + strength and hidden flags.
    """
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    if cycle.status not in ("compiled", "published"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cycle not yet compiled")
    part_rants = cycle.participation_rants if cycle.participation_rants is not None else 0
    part_struct = cycle.participation_structured if cycle.participation_structured is not None else 0
    insights = db.query(CycleInsight).filter(CycleInsight.cycle_id == cycle_id).all()
    receiver_rows = db.query(CycleReceiverSummary).filter(CycleReceiverSummary.cycle_id == cycle_id).all()
    threshold = settings.ANONYMITY_THRESHOLD
    themes = [
        ThemeItem(
            id=i.id,
            theme=i.theme,
            count=i.count,
            sentiment_summary=i.sentiment_summary,
            dominant_sentiment=i.dominant_sentiment,
            strength_score=i.strength_score,
            is_hidden=i.is_hidden,
            hidden_example_indices=list(i.hidden_example_indices or []),
            example_comments=[] if i.count < threshold else (i.example_comments or []),
            below_threshold_note=BELOW_THRESHOLD_NOTE if i.count < threshold else None,
        )
        for i in insights
    ]
    receiver_summaries = [
        ManagerSummaryResponse(
            id=r.id,
            receiver_id=r.receiver_id,
            cycle_id=cycle_id,
            average_scores=r.average_scores or {},
            respondent_count=r.respondent_count,
            sentiment=r.sentiment,
            strength_score=r.strength_score,
            is_hidden=r.is_hidden,
            hidden_helpful_indices=list(r.hidden_helpful_indices or []),
            hidden_improvement_indices=list(r.hidden_improvement_indices or []),
            comment_snippets_helpful=list(r.snippets_helpful or []),
            comment_snippets_improvement=list(r.snippets_improvement or []),
            below_threshold_note=None,
        )
        for r in receiver_rows
    ]
    directed_segments = db.query(RantDirectedSegment).filter(RantDirectedSegment.cycle_id == cycle_id).all()
    all_actions = db.query(Action).filter(Action.cycle_id == cycle_id).all()
    return ManagerReviewResponse(
        cycle_id=cycle_id,
        status=cycle.status,
        team_published=cycle.team_published,
        individuals_published=cycle.individuals_published,
        team_publication_outdated=cycle.team_publication_outdated,
        individual_publication_outdated=cycle.individual_publication_outdated,
        participation_rants=part_rants,
        participation_structured=part_struct,
        summary_text=cycle.summary_text,
        themes=themes,
        receiver_summaries=receiver_summaries,
        directed_segments=[
            {
                "id": s.id,
                "receiver_id": s.receiver_id,
                "snippet": s.snippet,
                "theme": s.theme,
                "sentiment": s.sentiment,
                "is_hidden": s.is_hidden,
            }
            for s in directed_segments
        ],
        actions=[ActionResponse.model_validate(a) for a in all_actions],
    )


@router.patch("/{cycle_id}/manager-review", response_model=ManagerReviewResponse)
def update_manager_review(
    cycle_id: int,
    body: ManagerReviewUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manager can hide/unhide compiled items before publishing."""
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    if cycle.status not in ("compiled", "published"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cycle not yet compiled")
    if cycle.team_published and cycle.team_public_snapshot is None:
        cycle.team_public_snapshot = pubdisp.employee_team_summary(db, cycle).model_dump(mode="json")
    if cycle.individuals_published and cycle.individual_public_snapshot is None:
        cycle.individual_public_snapshot = pubdisp.all_individual_snapshots(db, cycle)
    hidden_theme_ids = set(body.hidden_theme_ids)
    hidden_receiver_ids = set(body.hidden_receiver_summary_ids)
    insights = db.query(CycleInsight).filter(CycleInsight.cycle_id == cycle_id).all()
    for i in insights:
        i.is_hidden = i.id in hidden_theme_ids
        if i.id in body.theme_hidden_example_indices:
            i.hidden_example_indices = body.theme_hidden_example_indices[i.id]
        elif i.id not in hidden_theme_ids:
            # preserve existing if not sent
            pass
    receiver_rows = db.query(CycleReceiverSummary).filter(CycleReceiverSummary.cycle_id == cycle_id).all()
    for r in receiver_rows:
        r.is_hidden = r.id in hidden_receiver_ids
        if r.id in body.receiver_hidden_helpful_indices:
            r.hidden_helpful_indices = body.receiver_hidden_helpful_indices[r.id]
        if r.id in body.receiver_hidden_improvement_indices:
            r.hidden_improvement_indices = body.receiver_hidden_improvement_indices[r.id]
    hidden_segment_ids = set(body.hidden_directed_segment_ids)
    segments = db.query(RantDirectedSegment).filter(RantDirectedSegment.cycle_id == cycle_id).all()
    for s in segments:
        s.is_hidden = s.id in hidden_segment_ids
    # Actions: hide/show + text edits
    hidden_action_ids = set(body.hidden_action_ids)
    all_actions = db.query(Action).filter(Action.cycle_id == cycle_id).all()
    for a in all_actions:
        a.is_hidden = a.id in hidden_action_ids
        if a.id in body.action_updates:
            new_text = body.action_updates[a.id].strip()
            if new_text:
                a.action_text = new_text[:2000]
    db.flush()
    if cycle.team_published:
        live_team = pubdisp.employee_team_summary(db, cycle).model_dump(mode="json")
        if cycle.team_public_snapshot is None:
            cycle.team_public_snapshot = live_team
        elif not pubdisp.json_snapshot_equal(cycle.team_public_snapshot, live_team):
            cycle.team_publication_outdated = True
    if cycle.individuals_published:
        live_ind = pubdisp.all_individual_snapshots(db, cycle)
        if cycle.individual_public_snapshot is None:
            cycle.individual_public_snapshot = live_ind
        elif not pubdisp.json_snapshot_equal(cycle.individual_public_snapshot, live_ind):
            cycle.individual_publication_outdated = True
    db.commit()
    return get_manager_review(cycle_id=cycle_id, db=db, current_user=current_user)


@router.post("/{cycle_id}/publish", response_model=CycleResponse)
def publish_cycle(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Publish both team and individual sections at once (convenience endpoint)."""
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    if cycle.status not in ("compiled", "published"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cycle must be compiled before publishing")
    cycle.team_published = True
    cycle.individuals_published = True
    cycle.status = "published"
    cycle.team_public_snapshot = pubdisp.employee_team_summary(db, cycle).model_dump(mode="json")
    cycle.team_publication_outdated = False
    cycle.individual_public_snapshot = pubdisp.all_individual_snapshots(db, cycle)
    cycle.individual_publication_outdated = False
    record_cycle_event(db, cycle_id, "published", actor=current_user)
    db.commit()
    db.refresh(cycle)
    return cycle


@router.post("/{cycle_id}/publish-team", response_model=CycleResponse)
def publish_team(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Publish only the team section (brief, themes, team actions) to employees."""
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    if cycle.status not in ("compiled", "published"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cycle must be compiled before publishing")
    already = cycle.team_published
    cycle.team_published = True
    if cycle.status == "compiled":
        cycle.status = "published"
    cycle.team_public_snapshot = pubdisp.employee_team_summary(db, cycle).model_dump(mode="json")
    cycle.team_publication_outdated = False
    if not already:
        record_cycle_event(db, cycle_id, "published_team", actor=current_user)
    else:
        record_cycle_event(db, cycle_id, "published_team", actor=current_user, note="Republished team insights")
    db.commit()
    db.refresh(cycle)
    return cycle


@router.post("/{cycle_id}/publish-individuals", response_model=CycleResponse)
def publish_individuals(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Publish only the individual section (structured feedback, directed rants, individual actions) to each recipient."""
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    if cycle.status not in ("compiled", "published"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cycle must be compiled before publishing")
    already = cycle.individuals_published
    cycle.individuals_published = True
    if cycle.status == "compiled":
        cycle.status = "published"
    cycle.individual_public_snapshot = pubdisp.all_individual_snapshots(db, cycle)
    cycle.individual_publication_outdated = False
    if not already:
        record_cycle_event(db, cycle_id, "published_individuals", actor=current_user)
    else:
        record_cycle_event(db, cycle_id, "published_individuals", actor=current_user, note="Republished individual feedback")
    db.commit()
    db.refresh(cycle)
    return cycle


@router.get("/{cycle_id}/summary", response_model=CycleSummaryResponse)
def get_summary(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Team view: themes, manager's actions, compiled summary text.
    Employees only after publish; manager/admin can preview during compiled.
    """
    cycle = _get_cycle(db, cycle_id)
    _require_team_member(cycle, current_user)
    themes: list[ThemeItem] = []
    manager_view = _is_cycle_manager(cycle, current_user, db)
    # Employees only see team content after team_published; managers can always preview after compile
    can_see_team = manager_view or cycle.team_published
    if (
        not manager_view
        and cycle.team_published
        and cycle.team_publication_outdated
        and cycle.team_public_snapshot
    ):
        return CycleSummaryResponse.model_validate(cycle.team_public_snapshot)
    if cycle.status in ("compiled", "published") and can_see_team:
        insights = db.query(CycleInsight).filter(CycleInsight.cycle_id == cycle_id).all()
        threshold = settings.ANONYMITY_THRESHOLD
        for i in insights:
            if not manager_view and i.is_hidden:
                continue
            below = i.count < threshold
            comments_raw = [] if below else (i.example_comments or [])
            if not manager_view and comments_raw and i.hidden_example_indices:
                hidden_idx = set(i.hidden_example_indices)
                comments_raw = [c for idx, c in enumerate(comments_raw) if idx not in hidden_idx]
            themes.append(
                ThemeItem(
                    id=i.id,
                    theme=i.theme,
                    count=i.count,
                    sentiment_summary=i.sentiment_summary,
                    dominant_sentiment=i.dominant_sentiment,
                    strength_score=i.strength_score,
                    is_hidden=i.is_hidden,
                    hidden_example_indices=list(i.hidden_example_indices or []),
                    example_comments=comments_raw,
                    below_threshold_note=BELOW_THRESHOLD_NOTE if below else None,
                )
            )
    can_see_actions = can_see_team and cycle.status in ("compiled", "published")
    if can_see_actions:
        actions_q = db.query(Action).filter(Action.cycle_id == cycle_id, Action.receiver_id.is_(None))
        if not manager_view:
            actions_q = actions_q.filter(Action.is_hidden == False)  # noqa: E712
        team_actions = actions_q.all()
    else:
        team_actions = []
    return CycleSummaryResponse(
        cycle_id=cycle_id,
        themes=themes,
        actions=[ActionResponse.model_validate(a) for a in team_actions],
        summary_text=cycle.summary_text if can_see_team else None,
    )
