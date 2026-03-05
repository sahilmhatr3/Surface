"""
Cycle routes: themes, manager summary, actions, employee summary.
All require auth; some require manager of the cycle's team.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models import Action, CycleInsight, CycleReceiverSummary, FeedbackCycle, User
from app.schemas.cycles import (
    ActionCreate,
    ActionResponse,
    ActionUpdate,
    ManagerSummaryResponse,
    ThemeItem,
    ThemesResponse,
    CycleSummaryResponse,
)
from app.core.security import get_current_user

router = APIRouter()

BELOW_THRESHOLD_NOTE = "Theme expressed but not enough responses to show anonymized example comments."


def _get_cycle(db: Session, cycle_id: int) -> FeedbackCycle:
    cycle = db.get(FeedbackCycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
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


@router.get("/{cycle_id}/themes", response_model=ThemesResponse)
def get_themes(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Themes for a cycle (participation + theme list). Requires team member or admin.
    Only returns themes when cycle is aggregated; otherwise empty list. Participation counts are 0 until aggregation stores them.
    """
    cycle = _get_cycle(db, cycle_id)
    _require_team_member(cycle, current_user)
    part_rants = cycle.participation_rants if cycle.participation_rants is not None else 0
    part_struct = cycle.participation_structured if cycle.participation_structured is not None else 0
    if cycle.status != "aggregated":
        return ThemesResponse(
            cycle_id=cycle_id,
            participation_rants=part_rants,
            participation_structured=part_struct,
            themes=[],
        )
    insights = db.query(CycleInsight).filter(CycleInsight.cycle_id == cycle_id).all()
    threshold = settings.ANONYMITY_THRESHOLD
    themes = []
    for i in insights:
        below = i.count < threshold
        themes.append(
            ThemeItem(
                theme=i.theme,
                count=i.count,
                sentiment_summary=i.sentiment_summary,
                example_comments=[] if below else (i.example_comments or []),
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
    Only available after cycle is aggregated.
    """
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    if cycle.status != "aggregated":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cycle not yet aggregated")
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
    threshold = settings.ANONYMITY_THRESHOLD
    below = row.respondent_count < threshold
    return ManagerSummaryResponse(
        cycle_id=cycle_id,
        average_scores=row.average_scores or {},
        comment_snippets_helpful=[] if below else (row.snippets_helpful or []),
        comment_snippets_improvement=[] if below else (row.snippets_improvement or []),
        below_threshold_note=BELOW_THRESHOLD_NOTE if below else None,
    )


@router.post("/{cycle_id}/actions", response_model=ActionResponse)
def create_action(
    cycle_id: int,
    body: ActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a manager action for a theme. Requires manager of the cycle's team."""
    cycle = _get_cycle(db, cycle_id)
    _require_cycle_manager(cycle, current_user, db)
    action = Action(
        cycle_id=cycle_id,
        theme=body.theme,
        manager_id=current_user.id,
        action_text=body.action_text,
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


@router.get("/{cycle_id}/summary", response_model=CycleSummaryResponse)
def get_summary(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Employee (and manager self) view: themes, manager's actions, optional summary text.
    Requires team member or admin. Themes/actions only populated after cycle is aggregated.
    """
    cycle = _get_cycle(db, cycle_id)
    _require_team_member(cycle, current_user)
    themes: list[ThemeItem] = []
    if cycle.status == "aggregated":
        insights = db.query(CycleInsight).filter(CycleInsight.cycle_id == cycle_id).all()
        threshold = settings.ANONYMITY_THRESHOLD
        for i in insights:
            below = i.count < threshold
            themes.append(
                ThemeItem(
                    theme=i.theme,
                    count=i.count,
                    sentiment_summary=i.sentiment_summary,
                    example_comments=[] if below else (i.example_comments or []),
                    below_threshold_note=BELOW_THRESHOLD_NOTE if below else None,
                )
            )
    actions = db.query(Action).filter(Action.cycle_id == cycle_id).all()
    return CycleSummaryResponse(
        cycle_id=cycle_id,
        themes=themes,
        actions=[ActionResponse.model_validate(a) for a in actions],
        summary_text=None,
    )
