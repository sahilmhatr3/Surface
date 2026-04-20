"""
Build employee-visible cycle payloads (team summary + per-user incoming feedback)
for publication snapshots and drift detection.
"""
import json
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Action, CycleInsight, CycleReceiverSummary, FeedbackCycle, RantDirectedSegment, User
from app.schemas.cycles import (
    ActionResponse,
    CycleSummaryResponse,
    DirectedRantSegmentItem,
    IncomingFeedbackResponse,
    ManagerSummaryResponse,
    ThemeItem,
)

BELOW_THRESHOLD_NOTE = (
    "Theme expressed but not enough responses to show anonymized example comments."
)
DIRECTED_RANT_BELOW_THRESHOLD_NOTE = (
    "Open feedback was directed at you but there are not enough responses to show anonymized snippets."
)


def json_snapshot_equal(a: Any, b: Any) -> bool:
    return json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)


def employee_team_summary(db: Session, cycle: FeedbackCycle) -> CycleSummaryResponse:
    """Team themes + summary + team-level actions as a non-manager employee would see them."""
    cycle_id = cycle.id
    themes: list[ThemeItem] = []
    insights = db.query(CycleInsight).filter(CycleInsight.cycle_id == cycle_id).all()
    threshold = settings.ANONYMITY_THRESHOLD
    for i in insights:
        if i.is_hidden:
            continue
        below = i.count < threshold
        comments_raw = [] if below else (i.example_comments or [])
        if comments_raw and i.hidden_example_indices:
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
    actions_q = (
        db.query(Action)
        .filter(Action.cycle_id == cycle_id, Action.receiver_id.is_(None), Action.is_hidden == False)  # noqa: E712
    )
    team_actions = actions_q.all()
    return CycleSummaryResponse(
        cycle_id=cycle_id,
        themes=themes,
        actions=[ActionResponse.model_validate(a) for a in team_actions],
        summary_text=cycle.summary_text,
    )


def employee_incoming_feedback(db: Session, cycle: FeedbackCycle, viewer: User) -> IncomingFeedbackResponse:
    """Incoming feedback payload for one user using employee visibility rules (manager_view=False)."""
    cycle_id = cycle.id
    structured: ManagerSummaryResponse | None = None
    can_view = cycle.status in ("compiled", "published") and cycle.individuals_published
    if can_view:
        row = (
            db.query(CycleReceiverSummary)
            .filter(
                CycleReceiverSummary.cycle_id == cycle_id,
                CycleReceiverSummary.receiver_id == viewer.id,
            )
            .first()
        )
        if row and row.is_hidden:
            row = None
        if row:
            helpful = list(row.snippets_helpful or [])
            improvement = list(row.snippets_improvement or [])
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

    segments: list[RantDirectedSegment] = []
    if can_view:
        segments = (
            db.query(RantDirectedSegment)
            .filter(
                RantDirectedSegment.cycle_id == cycle_id,
                RantDirectedSegment.receiver_id == viewer.id,
            )
            .all()
        )
    segments = [s for s in segments if not s.is_hidden]
    threshold = settings.ANONYMITY_THRESHOLD
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
    individual_actions_q = db.query(Action).filter(
        Action.cycle_id == cycle_id,
        Action.receiver_id == viewer.id,
        Action.is_hidden == False,  # noqa: E712
    )
    individual_actions = individual_actions_q.all()
    return IncomingFeedbackResponse(
        cycle_id=cycle_id,
        structured=structured,
        directed_rant_segments=directed_list,
        directed_rant_below_threshold_note=DIRECTED_RANT_BELOW_THRESHOLD_NOTE
        if directed_below and segments
        else None,
        individual_actions=[ActionResponse.model_validate(a) for a in individual_actions],
    )


def all_individual_snapshots(db: Session, cycle: FeedbackCycle) -> dict[str, Any]:
    """Map receiver user id (as string) -> IncomingFeedbackResponse JSON for everyone on the team."""
    members = db.query(User).filter(User.team_id == cycle.team_id).all()
    by_receiver: dict[str, Any] = {}
    for u in members:
        by_receiver[str(u.id)] = employee_incoming_feedback(db, cycle, u).model_dump(mode="json")
    return {"by_receiver": by_receiver}
