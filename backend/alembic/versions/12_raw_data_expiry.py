"""Add raw_data_expires_at to feedback_cycles for deferred raw-data cleanup.

Revision ID: 12_raw_data_expiry
Revises: 11_actions_overhaul
Create Date: 2026-04-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "12_raw_data_expiry"
down_revision: Union[str, None] = "11_actions_overhaul"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # nullable: null means raw data already wiped (or never compiled).
    # When compiled, set to now + 7 days; cleared to null on wipe.
    op.add_column(
        "feedback_cycles",
        sa.Column("raw_data_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("feedback_cycles", "raw_data_expires_at")
