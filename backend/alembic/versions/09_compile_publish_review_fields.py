"""Add compile/publish review fields

Revision ID: 09_compile_publish
Revises: 08_rant_segments
Create Date: 2026-03-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "09_compile_publish"
down_revision: Union[str, None] = "08_rant_segments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cycle_insights", sa.Column("dominant_sentiment", sa.String(length=20), nullable=False, server_default="neutral"))
    op.add_column("cycle_insights", sa.Column("strength_score", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("cycle_insights", sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.add_column("cycle_receiver_summary", sa.Column("sentiment", sa.String(length=20), nullable=False, server_default="neutral"))
    op.add_column("cycle_receiver_summary", sa.Column("strength_score", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("cycle_receiver_summary", sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("rant_directed_segments", sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.alter_column("cycle_insights", "dominant_sentiment", server_default=None)
    op.alter_column("cycle_insights", "strength_score", server_default=None)
    op.alter_column("cycle_insights", "is_hidden", server_default=None)
    op.alter_column("cycle_receiver_summary", "sentiment", server_default=None)
    op.alter_column("cycle_receiver_summary", "strength_score", server_default=None)
    op.alter_column("cycle_receiver_summary", "is_hidden", server_default=None)
    op.alter_column("rant_directed_segments", "is_hidden", server_default=None)


def downgrade() -> None:
    op.drop_column("rant_directed_segments", "is_hidden")
    op.drop_column("cycle_receiver_summary", "is_hidden")
    op.drop_column("cycle_receiver_summary", "strength_score")
    op.drop_column("cycle_receiver_summary", "sentiment")
    op.drop_column("cycle_insights", "is_hidden")
    op.drop_column("cycle_insights", "strength_score")
    op.drop_column("cycle_insights", "dominant_sentiment")
