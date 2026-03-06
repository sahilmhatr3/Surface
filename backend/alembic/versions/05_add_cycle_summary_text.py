"""Add summary_text to feedback_cycles (AI-generated cycle summary)

Revision ID: 05_summary_text
Revises: 04_participation_counts
Create Date: 2026-02-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "05_summary_text"
down_revision: Union[str, None] = "04_participation_counts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "feedback_cycles",
        sa.Column("summary_text", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("feedback_cycles", "summary_text")
