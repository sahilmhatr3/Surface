"""User-submitted product feedback (app UX feedback)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db import get_db
from app.models import AppFeedback, User
from app.schemas.app_feedback import AppFeedbackCreate, AppFeedbackSubmitResponse

router = APIRouter()


@router.post("", response_model=AppFeedbackSubmitResponse)
def submit_app_feedback(
    body: AppFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    feedback = AppFeedback(
        user_id=current_user.id,
        category=body.category.strip() if body.category else None,
        text=body.text.strip() if body.text else None,
        attachments=[a.model_dump() for a in body.attachments],
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return AppFeedbackSubmitResponse(id=feedback.id, created_at=feedback.created_at)
