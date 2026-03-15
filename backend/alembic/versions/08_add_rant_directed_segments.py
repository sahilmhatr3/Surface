"""Add rant_directed_segments for feedback redirected to specific receivers

Revision ID: 08_rant_segments
Revises: 07_temporary_password
Create Date: 2026-03-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "08_rant_segments"
down_revision: Union[str, None] = "07_temporary_password"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rant_directed_segments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("cycle_id", sa.Integer(), nullable=False),
        sa.Column("receiver_id", sa.Integer(), nullable=False),
        sa.Column("snippet", sa.Text(), nullable=False),
        sa.Column("theme", sa.String(100), nullable=False),
        sa.Column("sentiment", sa.String(20), nullable=False),
        sa.Column("source_rant_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["cycle_id"], ["feedback_cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["receiver_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_rant_id"], ["rants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rant_directed_segments_cycle_id", "rant_directed_segments", ["cycle_id"], unique=False)
    op.create_index("ix_rant_directed_segments_receiver_id", "rant_directed_segments", ["receiver_id"], unique=False)
    op.create_index("ix_rant_directed_segments_source_rant_id", "rant_directed_segments", ["source_rant_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_rant_directed_segments_source_rant_id", table_name="rant_directed_segments")
    op.drop_index("ix_rant_directed_segments_receiver_id", table_name="rant_directed_segments")
    op.drop_index("ix_rant_directed_segments_cycle_id", table_name="rant_directed_segments")
    op.drop_table("rant_directed_segments")
