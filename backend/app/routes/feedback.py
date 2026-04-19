"""
Feedback routes: rant (anonymous) and structured feedback. Require auth and open cycle.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import FeedbackCycle, Rant, RantDirectedSegment, StructuredFeedback, User
from app.schemas.feedback import (
    MyRantStatusResponse,
    MyStructuredFeedbackItem,
    RantCreate,
    RantResponse,
    StructuredFeedbackBatchCreate,
    StructuredFeedbackCreate,
    StructuredFeedbackResponse,
    StructuredFeedbackScores,
    TeammateResponse,
)
from app.core.config import settings
from app.core.security import get_current_user
from app.services import ai as ai_service
from app.utils import normalize_content_locale

router = APIRouter()


def _get_open_cycle(db: Session, cycle_id: int, user: User) -> FeedbackCycle:
    """Load cycle, ensure it exists and is open, and user's team matches."""
    cycle = db.get(FeedbackCycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    if cycle.status != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cycle is not open for feedback",
        )
    if user.team_id != cycle.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cycle does not belong to your team")
    return cycle


def _get_cycle_for_team(db: Session, cycle_id: int, user: User) -> FeedbackCycle | None:
    """Load cycle if it exists and belongs to user's team (any status). Returns None if no team."""
    if user.team_id is None:
        return None
    cycle = db.get(FeedbackCycle, cycle_id)
    if not cycle or cycle.team_id != user.team_id:
        return None
    return cycle


def _team_member_names(db: Session, team_id: int) -> list[str]:
    """Return list of team member names for de-identification."""
    users = db.query(User).filter(User.team_id == team_id).all()
    return [u.name for u in users if u.name]


def _teammates_excluding_self(db: Session, team_id: int, exclude_user_id: int) -> list[tuple[str, int]]:
    """Return (name, user_id) for teammates excluding one user. Used for dissection name->id mapping."""
    users = db.query(User).filter(User.team_id == team_id, User.id != exclude_user_id).all()
    return [(u.name, u.id) for u in users if u.name]


@router.get("/teammates", response_model=list[TeammateResponse])
def get_teammates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List teammates (same team, excluding self) for feedback receiver picker.
    Returns id and name only. Users with no team get empty list.
    """
    if current_user.team_id is None:
        return []
    users = (
        db.query(User)
        .filter(User.team_id == current_user.team_id, User.id != current_user.id)
        .order_by(User.name)
        .all()
    )
    return [TeammateResponse(id=u.id, name=u.name) for u in users]


@router.get("/structured", response_model=list[MyStructuredFeedbackItem])
def get_my_structured_feedback(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the current user's saved structured feedback for the given cycle (one per receiver).
    Used to restore progress when returning to the feedback page. Cycle must belong to user's team.
    """
    cycle = _get_cycle_for_team(db, cycle_id, current_user)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    rows = (
        db.query(StructuredFeedback)
        .filter(
            StructuredFeedback.cycle_id == cycle_id,
            StructuredFeedback.giver_id == current_user.id,
        )
        .all()
    )
    return [
        MyStructuredFeedbackItem(
            receiver_id=r.receiver_id,
            scores=StructuredFeedbackScores(**r.scores),
            comments_helpful=r.comments_helpful,
            comments_improvement=r.comments_improvement,
        )
        for r in rows
    ]


@router.get("/rant", response_model=MyRantStatusResponse)
def get_my_rant_status(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return whether the current user has a rant row for this cycle (submitted at least once).
    Used to restore the feedback UI after reload. Cycle must belong to the user's team.
    """
    cycle = _get_cycle_for_team(db, cycle_id, current_user)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    exists = (
        db.query(Rant)
        .filter(Rant.cycle_id == cycle_id, Rant.user_id == current_user.id)
        .first()
    )
    return MyRantStatusResponse(has_submitted=exists is not None)


def _process_rant_async(
    rant_id: int,
    raw_text: str,
    names: list[str],
    teammates_name_id: list[tuple[str, int]],
    cycle_id: int,
    content_locale: str | None = None,
) -> None:
    """
    AI enrichment for a submitted rant — runs after the HTTP response is already sent.
    Opens its own DB session so the request-scoped session is not referenced.
    Steps: de-identify → classify theme/sentiment → dissect into directed segments.
    All steps are best-effort; a failure in one does not abort the others.
    """
    from app.db import SessionLocal  # local import avoids circular import at module level

    db = SessionLocal()
    try:
        rant = db.get(Rant, rant_id)
        if not rant:
            return

        out_loc = normalize_content_locale(content_locale)

        # Step 1: de-identify raw text and classify theme + sentiment
        try:
            anonymized = ai_service.deidentify_text(raw_text, names, output_locale=out_loc)
            theme, sentiment = ai_service.classify_theme_and_sentiment(anonymized, output_locale=out_loc)
        except Exception:
            # Fall back to storing the raw text anonymized as-is rather than losing the rant
            anonymized = raw_text
            theme, sentiment = "general", "neutral"

        rant.anonymized_text = anonymized
        rant.theme = theme
        rant.sentiment = sentiment
        db.commit()

        # Step 2: dissect into per-person directed segments (best-effort)
        if teammates_name_id:
            try:
                db.query(RantDirectedSegment).filter(
                    RantDirectedSegment.source_rant_id == rant_id
                ).delete(synchronize_session=False)

                segments_data = ai_service.dissect_rant_to_directed_segments(
                    raw_text,
                    [n for n, _ in teammates_name_id],
                    output_locale=out_loc,
                )
                name_to_id = {name: uid for name, uid in teammates_name_id}
                for seg in segments_data:
                    receiver_id = name_to_id.get(seg["receiver_name"])
                    if receiver_id is None:
                        continue
                    safe_snippet = ai_service.deidentify_text(
                        seg["snippet"], names, output_locale=out_loc
                    )
                    db.add(
                        RantDirectedSegment(
                            cycle_id=cycle_id,
                            receiver_id=receiver_id,
                            snippet=safe_snippet[:300],
                            theme=seg["theme"],
                            sentiment=seg["sentiment"],
                            source_rant_id=rant_id,
                            is_hidden=False,
                        )
                    )
                db.commit()
            except Exception:
                db.rollback()
    finally:
        db.close()


@router.post("/rant", response_model=RantResponse)
def submit_rant(
    body: RantCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit an anonymous rant for a cycle. Cycle must be open and belong to your team.
    The rant is persisted immediately; AI enrichment (de-identification, theme/sentiment
    classification, directed-segment dissection) happens in the background after the
    response is returned, so the user never waits for OpenAI.
    One rant per user per cycle — re-submitting overwrites the previous entry.
    """
    cycle = _get_open_cycle(db, body.cycle_id, current_user)
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key not configured",
        )

    # Gather context for the background task before closing the request session
    names = _team_member_names(db, cycle.team_id)
    teammates_name_id = _teammates_excluding_self(db, cycle.team_id, current_user.id)
    raw_text = body.text
    stored_locale = body.content_locale

    # Persist the rant immediately with placeholder values so the user gets
    # an instant response. The background task will overwrite these shortly.
    existing = db.query(Rant).filter(
        Rant.cycle_id == body.cycle_id, Rant.user_id == current_user.id
    ).first()
    if existing:
        existing.anonymized_text = ""
        existing.theme = "processing"
        existing.sentiment = "processing"
        if stored_locale is not None:
            existing.content_locale = stored_locale
        rant = existing
    else:
        rant = Rant(
            user_id=current_user.id,
            cycle_id=body.cycle_id,
            raw_text=None,
            anonymized_text="",
            theme="processing",
            sentiment="processing",
            content_locale=stored_locale,
        )
        db.add(rant)

    db.commit()
    db.refresh(rant)

    background_tasks.add_task(
        _process_rant_async,
        rant_id=rant.id,
        raw_text=raw_text,
        names=names,
        teammates_name_id=teammates_name_id,
        cycle_id=body.cycle_id,
        content_locale=rant.content_locale,
    )

    return rant


def _receiver_in_team_and_not_self(db: Session, cycle: FeedbackCycle, current_user: User, receiver_id: int) -> bool:
    """Receiver must be same team and not self."""
    if receiver_id == current_user.id:
        return False
    rec = db.get(User, receiver_id)
    return rec is not None and rec.team_id == cycle.team_id


@router.post("/structured", response_model=StructuredFeedbackResponse)
def submit_structured(
    body: StructuredFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit structured feedback for one receiver. Cycle must be open; receiver must be a teammate (not self).
    """
    cycle = _get_open_cycle(db, body.cycle_id, current_user)
    if not _receiver_in_team_and_not_self(db, cycle, current_user, body.receiver_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receiver must be another team member (not yourself)",
        )
    scores_dict = body.scores.model_dump()
    existing = (
        db.query(StructuredFeedback)
        .filter(
            StructuredFeedback.cycle_id == body.cycle_id,
            StructuredFeedback.giver_id == current_user.id,
            StructuredFeedback.receiver_id == body.receiver_id,
        )
        .first()
    )
    if existing:
        existing.scores = scores_dict
        existing.comments_helpful = body.comments_helpful
        existing.comments_improvement = body.comments_improvement
        if body.content_locale is not None:
            existing.content_locale = body.content_locale
        db.commit()
        db.refresh(existing)
        return existing
    sf = StructuredFeedback(
        giver_id=current_user.id,
        receiver_id=body.receiver_id,
        cycle_id=body.cycle_id,
        scores=scores_dict,
        comments_helpful=body.comments_helpful,
        comments_improvement=body.comments_improvement,
        content_locale=body.content_locale,
    )
    db.add(sf)
    db.commit()
    db.refresh(sf)
    return sf


@router.post("/structured/batch", response_model=list[StructuredFeedbackResponse])
def submit_structured_batch(
    body: StructuredFeedbackBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit structured feedback for multiple receivers in one cycle. Each receiver must be a teammate (not self).
    """
    cycle = _get_open_cycle(db, body.cycle_id, current_user)
    results = []
    for item in body.feedback:
        if not _receiver_in_team_and_not_self(db, cycle, current_user, item.receiver_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Receiver {item.receiver_id} must be another team member (not yourself)",
            )
        scores_dict = item.scores.model_dump()
        existing = (
            db.query(StructuredFeedback)
            .filter(
                StructuredFeedback.cycle_id == body.cycle_id,
                StructuredFeedback.giver_id == current_user.id,
                StructuredFeedback.receiver_id == item.receiver_id,
            )
            .first()
        )
        if existing:
            existing.scores = scores_dict
            existing.comments_helpful = item.comments_helpful
            existing.comments_improvement = item.comments_improvement
            if body.content_locale is not None:
                existing.content_locale = body.content_locale
            db.commit()
            db.refresh(existing)
            results.append(existing)
        else:
            sf = StructuredFeedback(
                giver_id=current_user.id,
                receiver_id=item.receiver_id,
                cycle_id=body.cycle_id,
                scores=scores_dict,
                comments_helpful=item.comments_helpful,
                comments_improvement=item.comments_improvement,
                content_locale=body.content_locale,
            )
            db.add(sf)
            db.commit()
            db.refresh(sf)
            results.append(sf)
    return results

