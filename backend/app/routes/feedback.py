"""
Feedback routes: rant (anonymous) and structured feedback. Require auth and open cycle.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import FeedbackCycle, Rant, StructuredFeedback, User
from app.schemas.feedback import (
    RantCreate,
    RantResponse,
    StructuredFeedbackBatchCreate,
    StructuredFeedbackCreate,
    StructuredFeedbackResponse,
)
from app.core.config import settings
from app.core.security import get_current_user
from app.services import ai as ai_service

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


def _team_member_names(db: Session, team_id: int) -> list[str]:
    """Return list of team member names for de-identification."""
    users = db.query(User).filter(User.team_id == team_id).all()
    return [u.name for u in users if u.name]


@router.post("/rant", response_model=RantResponse)
def submit_rant(
    body: RantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit an anonymous rant for a cycle. Cycle must be open and belong to your team.
    Text is de-identified and classified (theme/sentiment) via OpenAI; only anonymized result is stored.
    One rant per user per cycle (submitting again overwrites for MVP).
    """
    cycle = _get_open_cycle(db, body.cycle_id, current_user)
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key not configured",
        )
    names = _team_member_names(db, cycle.team_id)
    try:
        anonymized = ai_service.deidentify_text(body.text, names)
        theme, sentiment = ai_service.classify_theme_and_sentiment(anonymized)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI processing failed",
        )
    existing = db.query(Rant).filter(Rant.cycle_id == body.cycle_id, Rant.user_id == current_user.id).first()
    if existing:
        existing.anonymized_text = anonymized
        existing.theme = theme
        existing.sentiment = sentiment
        db.commit()
        db.refresh(existing)
        return existing
    rant = Rant(
        user_id=current_user.id,
        cycle_id=body.cycle_id,
        raw_text=None,
        anonymized_text=anonymized,
        theme=theme,
        sentiment=sentiment,
    )
    db.add(rant)
    db.commit()
    db.refresh(rant)
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
            )
            db.add(sf)
            db.commit()
            db.refresh(sf)
            results.append(sf)
    return results

