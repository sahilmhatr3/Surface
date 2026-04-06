"""Add cycle_events table for lifecycle audit log.

Revision ID: 13_cycle_events
Revises: 12_raw_data_expiry
Create Date: 2026-04-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "13_cycle_events"
down_revision: Union[str, None] = "12_raw_data_expiry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cycle_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("cycle_id", sa.Integer(), sa.ForeignKey("feedback_cycles.id"), nullable=False, index=True),
        # actor_id is nullable (null = system/automated event)
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        # Denormalised so the name is preserved even if the user is later deleted
        sa.Column("actor_name", sa.String(255), nullable=True),
        # e.g. created, closed_manual, closed_auto, reopened, end_date_extended,
        #      compiled, recompiled, published, raw_data_wiped_manual, raw_data_wiped_auto
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("cycle_events")
