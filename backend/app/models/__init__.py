"""
SQLAlchemy models. Import Base from app.db.
"""
from datetime import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
import enum


class UserRole(str, enum.Enum):
    employee = "employee"
    manager = "manager"
    admin = "admin"


class CycleStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    compiled = "compiled"
    published = "published"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    supabase_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True, index=True)
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    team = relationship("Team", back_populates="users")
    manager = relationship("User", remote_side=[id])


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    users = relationship("User", back_populates="team")
    feedback_cycles = relationship("FeedbackCycle", back_populates="team")


class FeedbackCycle(Base):
    __tablename__ = "feedback_cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # open, closed, compiled, published
    participation_rants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    participation_structured: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # AI-generated from rants + structured feedback
    # Set to now+7d on compile; cleared to null when raw data is wiped (manually or by expiry cleanup)
    raw_data_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Granular publish flags — set independently by the manager
    team_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    individuals_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    team_public_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    team_publication_outdated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    individual_public_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    individual_publication_outdated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    team = relationship("Team", back_populates="feedback_cycles")


class Rant(Base):
    __tablename__ = "rants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id"), nullable=False, index=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # short-lived; optional after processing
    anonymized_text: Mapped[str] = mapped_column(Text, nullable=False)
    theme: Mapped[str] = mapped_column(String(100), nullable=False)
    sentiment: Mapped[str] = mapped_column(String(20), nullable=False)
    content_locale: Mapped[str | None] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class RantDirectedSegment(Base):
    """
    One piece of open feedback directed at a specific person, extracted from a rant.
    No giver/sender stored; source_rant_id is set only until aggregation (then SET NULL when rant is deleted).
    """
    __tablename__ = "rant_directed_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    snippet: Mapped[str] = mapped_column(Text, nullable=False)
    theme: Mapped[str] = mapped_column(String(100), nullable=False)
    sentiment: Mapped[str] = mapped_column(String(20), nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source_rant_id: Mapped[int | None] = mapped_column(ForeignKey("rants.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class StructuredFeedback(Base):
    __tablename__ = "structured_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    giver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id"), nullable=False, index=True)
    scores: Mapped[dict] = mapped_column(JSON, nullable=False)  # {"support": perf 1–5, "communication": impact 1–5}
    comments_helpful: Mapped[str | None] = mapped_column(Text, nullable=True)
    comments_improvement: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_locale: Mapped[str | None] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class CycleInsight(Base):
    __tablename__ = "cycle_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id"), nullable=False, index=True)
    theme: Mapped[str] = mapped_column(String(100), nullable=False)
    sentiment_summary: Mapped[str] = mapped_column(String(255), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    example_comments: Mapped[list] = mapped_column(JSON, nullable=False)  # list of anonymized snippets
    dominant_sentiment: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    strength_score: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # 1..5
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hidden_example_indices: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # manager-hidden key point indices


class CycleReceiverSummary(Base):
    """
    Aggregated structured feedback per receiver per cycle.
    Written during aggregation; allows deletion of raw structured_feedback after aggregate.
    """
    __tablename__ = "cycle_receiver_summary"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id"), nullable=False, index=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    respondent_count: Mapped[int] = mapped_column(Integer, nullable=False)
    average_scores: Mapped[dict] = mapped_column(JSON, nullable=False)
    snippets_helpful: Mapped[list] = mapped_column(JSON, nullable=False)
    snippets_improvement: Mapped[list] = mapped_column(JSON, nullable=False)
    sentiment: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    strength_score: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # 1..5
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hidden_helpful_indices: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    hidden_improvement_indices: Mapped[list] = mapped_column(JSON, nullable=False, default=list)


class CycleEvent(Base):
    """Immutable audit record for a feedback cycle lifecycle event."""
    __tablename__ = "cycle_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id"), nullable=False, index=True)
    # null actor = system / automated event
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # Denormalised: preserved even if user is deleted
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Action(Base):
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id"), nullable=False, index=True)
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    # null = team-level (visible to all after publish); set = individual action (visible only to that user)
    receiver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action_text: Mapped[str] = mapped_column(Text, nullable=False)
    theme: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
