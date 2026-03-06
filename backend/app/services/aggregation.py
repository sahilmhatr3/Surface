"""
Aggregation: from rants + structured_feedback for a closed cycle,
build cycle_insights and cycle_receiver_summary, run AI summary pass, set participation counts, then erase raw data.
"""
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models import (
    CycleInsight,
    CycleReceiverSummary,
    FeedbackCycle,
    Rant,
    StructuredFeedback,
)
from app.services.ai import summarize_feedback_cycle


def run_aggregation(db: Session, cycle_id: int) -> None:
    """
    Require: cycle exists and status is 'closed'.
    - Build cycle_insights from rants (group by theme).
    - Build cycle_receiver_summary from structured_feedback (per receiver).
    - Set cycle.participation_rants, participation_structured, status='aggregated'.
    - Delete all rants and structured_feedback for this cycle.
    """
    cycle = db.get(FeedbackCycle, cycle_id)
    if not cycle:
        raise ValueError("Cycle not found")
    if cycle.status != "closed":
        raise ValueError("Cycle must be closed before aggregation")

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
        sentiments = [r.sentiment for r in theme_rants]
        pos = sum(1 for s in sentiments if s == "positive")
        neg = sum(1 for s in sentiments if s == "negative")
        neu = sum(1 for s in sentiments if s == "neutral")
        parts = []
        if pos:
            parts.append(f"{pos} positive")
        if neg:
            parts.append(f"{neg} negative")
        if neu:
            parts.append(f"{neu} neutral")
        sentiment_summary = ", ".join(parts) if parts else "neutral"
        example_comments = [r.anonymized_text for r in theme_rants if r.anonymized_text][:20]
        insight = CycleInsight(
            cycle_id=cycle_id,
            theme=theme[:100],
            sentiment_summary=sentiment_summary[:255],
            count=len(theme_rants),
            example_comments=example_comments,
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
        summary = CycleReceiverSummary(
            cycle_id=cycle_id,
            receiver_id=receiver_id,
            respondent_count=respondent_count,
            average_scores=average_scores,
            snippets_helpful=snippets_helpful,
            snippets_improvement=snippets_improvement,
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

    # Update cycle
    cycle.participation_rants = participation_rants
    cycle.participation_structured = participation_structured
    cycle.status = "aggregated"

    # Erase raw data
    db.query(Rant).filter(Rant.cycle_id == cycle_id).delete()
    db.query(StructuredFeedback).filter(StructuredFeedback.cycle_id == cycle_id).delete()

    db.commit()
