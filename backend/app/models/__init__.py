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
    aggregated = "aggregated"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True, index=True)
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    temporary_password_plaintext: Mapped[str | None] = mapped_column(String(255), nullable=True)
    must_reset_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    team = relationship("Team", back_populates="users")
    manager = relationship("User", remote_side=[id])

    @property
    def has_temporary_password(self) -> bool:
        return bool(self.temporary_password_plaintext)


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
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # open, closed, aggregated
    participation_rants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    participation_structured: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # AI-generated from rants + structured feedback
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class StructuredFeedback(Base):
    __tablename__ = "structured_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    giver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id"), nullable=False, index=True)
    scores: Mapped[dict] = mapped_column(JSON, nullable=False)  # e.g. {"support": 4, "communication": 5}
    comments_helpful: Mapped[str | None] = mapped_column(Text, nullable=True)
    comments_improvement: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class CycleInsight(Base):
    __tablename__ = "cycle_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id"), nullable=False, index=True)
    theme: Mapped[str] = mapped_column(String(100), nullable=False)
    sentiment_summary: Mapped[str] = mapped_column(String(255), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    example_comments: Mapped[list] = mapped_column(JSON, nullable=False)  # list of anonymized snippets


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


class Action(Base):
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("feedback_cycles.id"), nullable=False, index=True)
    theme: Mapped[str] = mapped_column(String(100), nullable=False)
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    action_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
