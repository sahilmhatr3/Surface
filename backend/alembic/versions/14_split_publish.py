"""Add team_published and individuals_published flags to feedback_cycles.

Revision ID: 14_split_publish
Revises: 13_cycle_events
Create Date: 2026-04-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "14_split_publish"
down_revision: Union[str, None] = "13_cycle_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("feedback_cycles", sa.Column("team_published", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("feedback_cycles", sa.Column("individuals_published", sa.Boolean(), nullable=False, server_default="false"))
    # Back-fill: existing published cycles count as both sections published
    op.execute("UPDATE feedback_cycles SET team_published = true, individuals_published = true WHERE status = 'published'")


def downgrade() -> None:
    op.drop_column("feedback_cycles", "team_published")
    op.drop_column("feedback_cycles", "individuals_published")
