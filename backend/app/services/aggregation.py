"""
Compilation: from rants + structured_feedback for an open/closed cycle,
build cycle_insights and cycle_receiver_summary, run AI summary and action generation,
set participation counts, then schedule raw data for expiry (not immediate deletion).
Supports force-recompile (admin): clears previous compiled output before rebuilding.
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    Action,
    CycleInsight,
    CycleReceiverSummary,
    FeedbackCycle,
    Rant,
    StructuredFeedback,
    User,
)
from app.services.ai import generate_cycle_actions, reword_theme_feedback_to_key_points, summarize_feedback_cycle

RAW_DATA_RETENTION_DAYS = 7


def cleanup_expired_raw_data() -> None:
    """
    Lazy auto-wipe: delete rants and structured feedback for all cycles whose
    raw_data_expires_at has passed. Called as a background task after each compile.
    Opens its own DB session so it can safely run in a thread.
    """
    from app.db import SessionLocal  # local import to avoid circular imports
    from app.utils import record_cycle_event  # local import to avoid circular imports
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        expired = (
            db.query(FeedbackCycle)
            .filter(
                FeedbackCycle.raw_data_expires_at.isnot(None),
                FeedbackCycle.raw_data_expires_at < now,
            )
            .all()
        )
        for cycle in expired:
            db.query(Rant).filter(Rant.cycle_id == cycle.id).delete()
            db.query(StructuredFeedback).filter(StructuredFeedback.cycle_id == cycle.id).delete()
            cycle.raw_data_expires_at = None
            record_cycle_event(db, cycle.id, "raw_data_wiped_auto",
                               note=f"Auto-wiped after {RAW_DATA_RETENTION_DAYS}-day retention period")
        if expired:
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def wipe_raw_data_for_cycle(db: Session, cycle_id: int) -> None:
    """Delete raw rants and structured feedback for a single cycle immediately."""
    db.query(Rant).filter(Rant.cycle_id == cycle_id).delete()
    db.query(StructuredFeedback).filter(StructuredFeedback.cycle_id == cycle_id).delete()
    cycle = db.get(FeedbackCycle, cycle_id)
    if cycle:
        cycle.raw_data_expires_at = None
    db.commit()


def run_aggregation(db: Session, cycle_id: int, force: bool = False) -> None:
    """
    Compile raw feedback into insights, receiver summaries, and an AI summary.
    - Build cycle_insights from rants (group by theme).
    - Build cycle_receiver_summary from structured_feedback (per receiver).
    - Set cycle.participation_rants, participation_structured, status='compiled'.
    - Delete all rants and structured_feedback for this cycle.

    When force=True (admin recompile), any existing compiled data is cleared first
    so the cycle can be recompiled from whatever raw data is currently present.
    """
    cycle = db.get(FeedbackCycle, cycle_id)
    if not cycle:
        raise ValueError("Cycle not found")
    if not force and cycle.status != "closed":
        raise ValueError("Cycle must be open or closed before compilation")

    # Clear previously compiled data so a recompile starts clean.
    # Directed segments are kept — they cannot be regenerated from deleted raw rants.
    db.query(CycleInsight).filter(CycleInsight.cycle_id == cycle_id).delete()
    db.query(CycleReceiverSummary).filter(CycleReceiverSummary.cycle_id == cycle_id).delete()
    # Remove AI-generated actions (will be regenerated); keep manager-created ones.
    db.query(Action).filter(
        Action.cycle_id == cycle_id, Action.is_ai_generated == True  # noqa: E712
    ).delete()
    cycle.summary_text = None
    db.flush()

    rants = db.query(Rant).filter(Rant.cycle_id == cycle_id).all()
    structured = db.query(StructuredFeedback).filter(StructuredFeedback.cycle_id == cycle_id).all()

    # Participation: distinct submitters
    participation_rants = len({r.user_id for r in rants})
    participation_structured = len({s.giver_id for s in structured})

    # --- Themes from rants (group by theme) ---
    by_theme: dict[str, list[Rant]] = defaultdict(list)
    for r in rants:
        by_theme[r.theme].append(r)

    for theme, theme_rants in by_theme.items():
        sentiments_list = [r.sentiment for r in theme_rants]
        pos = sum(1 for s in sentiments_list if s == "positive")
        neg = sum(1 for s in sentiments_list if s == "negative")
        neu = sum(1 for s in sentiments_list if s == "neutral")
        parts = []
        if pos:
            parts.append(f"{pos} positive")
        if neg:
            parts.append(f"{neg} negative")
        if neu:
            parts.append(f"{neu} neutral")
        sentiment_summary = ", ".join(parts) if parts else "neutral"
        dominant_sentiment = "neutral"
        if neg >= pos and neg >= neu and neg > 0:
            dominant_sentiment = "negative"
        elif pos >= neg and pos >= neu and pos > 0:
            dominant_sentiment = "positive"
        # Strength 1..5 based on volume and concentration of non-neutral sentiment.
        total = max(len(theme_rants), 1)
        polarity = max(pos, neg) / total
        strength_score = min(5, max(1, round(1 + min(4, len(theme_rants) / 2) * (0.6 + 0.4 * polarity))))
        texts = [r.anonymized_text for r in theme_rants if r.anonymized_text]
        try:
            example_comments = reword_theme_feedback_to_key_points(
                texts, [r.sentiment for r in theme_rants if r.anonymized_text], theme, max_points=8
            )
        except Exception:
            example_comments = []
        insight = CycleInsight(
            cycle_id=cycle_id,
            theme=theme[:100],
            sentiment_summary=sentiment_summary[:255],
            count=len(theme_rants),
            example_comments=example_comments,
            dominant_sentiment=dominant_sentiment,
            strength_score=int(strength_score),
            is_hidden=False,
        )
        db.add(insight)

    # --- Per-receiver summary from structured_feedback ---
    by_receiver: dict[int, list[StructuredFeedback]] = defaultdict(list)
    for s in structured:
        by_receiver[s.receiver_id].append(s)

    for receiver_id, rows in by_receiver.items():
        respondent_count = len(rows)
        # Average scores (each key in scores)
        score_keys = set()
        for r in rows:
            score_keys.update((r.scores or {}).keys())
        average_scores = {}
        for key in score_keys:
            vals = [r.scores.get(key) for r in rows if r.scores and isinstance(r.scores.get(key), (int, float))]
            if vals:
                average_scores[key] = round(sum(vals) / len(vals), 2)
        snippets_helpful = [r.comments_helpful for r in rows if r.comments_helpful]
        snippets_improvement = [r.comments_improvement for r in rows if r.comments_improvement]
        neg = sum(1 for row in rows if ((row.scores or {}).get("support", 3) + (row.scores or {}).get("communication", 3)) / 2 < 2.5)
        pos = sum(1 for row in rows if ((row.scores or {}).get("support", 3) + (row.scores or {}).get("communication", 3)) / 2 >= 4)
        sentiment = "neutral"
        if neg > pos:
            sentiment = "negative"
        elif pos > neg:
            sentiment = "positive"
        strength_score = min(5, max(1, round(1 + min(4, respondent_count / 2))))
        summary = CycleReceiverSummary(
            cycle_id=cycle_id,
            receiver_id=receiver_id,
            respondent_count=respondent_count,
            average_scores=average_scores,
            snippets_helpful=snippets_helpful,
            snippets_improvement=snippets_improvement,
            sentiment=sentiment,
            strength_score=int(strength_score),
            is_hidden=False,
        )
        db.add(summary)

    # --- Second AI pass: cycle-level summary from all rants + structured comments ---
    rant_texts = [r.anonymized_text for r in rants if r.anonymized_text]
    structured_snippets = []
    for s in structured:
        if s.comments_helpful:
            structured_snippets.append(f"[What helped] {s.comments_helpful}")
        if s.comments_improvement:
            structured_snippets.append(f"[Could improve] {s.comments_improvement}")
    try:
        summary = summarize_feedback_cycle(rant_texts, structured_snippets)
        if summary:
            cycle.summary_text = summary
    except Exception:
        pass  # Leave summary_text null if AI unavailable or fails

    # Update cycle — schedule raw data expiry instead of deleting immediately.
    # This allows recompilation within the retention window.
    cycle.participation_rants = participation_rants
    cycle.participation_structured = participation_structured
    cycle.status = "compiled"
    cycle.raw_data_expires_at = datetime.now(timezone.utc) + timedelta(days=RAW_DATA_RETENTION_DAYS)

    # Flush so insights + summaries get IDs before action generation reads them
    db.flush()

    # --- AI action generation (best-effort, runs after summary is set) ---
    try:
        # Find the team manager to attribute AI-generated actions to
        team_manager = (
            db.query(User)
            .filter(User.team_id == cycle.team_id, User.role.in_(["manager", "admin"]))
            .first()
        )
        if team_manager:
            insights_for_actions = db.query(CycleInsight).filter(CycleInsight.cycle_id == cycle_id).all()
            summaries_for_actions = db.query(CycleReceiverSummary).filter(CycleReceiverSummary.cycle_id == cycle_id).all()

            themes_payload = [
                {"theme": i.theme, "sentiment": i.dominant_sentiment or "neutral", "count": i.count}
                for i in insights_for_actions
            ]
            # Build receiver list with names for individual targeting
            name_by_id: dict[int, str] = {}
            for rs in summaries_for_actions:
                u = db.get(User, rs.receiver_id)
                if u:
                    name_by_id[rs.receiver_id] = u.name
            receivers_payload = [
                {"name": name_by_id[rs.receiver_id], "average_scores": rs.average_scores or {}}
                for rs in summaries_for_actions
                if rs.receiver_id in name_by_id
            ]

            suggested = generate_cycle_actions(
                summary_text=cycle.summary_text or "",
                themes=themes_payload,
                receiver_summaries=receivers_payload,
            )

            # Map receiver names back to IDs
            id_by_name = {v: k for k, v in name_by_id.items()}
            for item in suggested:
                receiver_id = None
                if item["scope"] == "individual" and item.get("receiver_name"):
                    receiver_id = id_by_name.get(item["receiver_name"])
                    if receiver_id is None:
                        continue  # skip if name didn't match any team member
                db.add(Action(
                    cycle_id=cycle_id,
                    manager_id=team_manager.id,
                    receiver_id=receiver_id,
                    action_text=item["action_text"],
                    theme=item.get("theme"),
                    is_ai_generated=True,
                    is_hidden=False,
                ))
    except Exception:
        pass  # Actions are best-effort; compilation succeeds regardless

    # Raw data (rants + structured feedback) is NOT deleted immediately.
    # raw_data_expires_at is set above; the cleanup_expired_raw_data() background task
    # handles the actual delete after the retention window.
    db.commit()
