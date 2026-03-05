"""Add participation_rants and participation_structured to feedback_cycles

Revision ID: 04_participation_counts
Revises: 03_cycle_receiver_summary
Create Date: 2026-02-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "04_participation_counts"
down_revision: Union[str, None] = "03_cycle_receiver_summary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "feedback_cycles",
        sa.Column("participation_rants", sa.Integer(), nullable=True),
    )
    op.add_column(
        "feedback_cycles",
        sa.Column("participation_structured", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("feedback_cycles", "participation_structured")
    op.drop_column("feedback_cycles", "participation_rants")
