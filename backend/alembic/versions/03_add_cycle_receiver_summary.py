"""Add cycle_receiver_summary for aggregated structured feedback (erase-after-aggregate)

Revision ID: 03_cycle_receiver_summary
Revises: 02_add_password_hash
Create Date: 2026-02-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "03_cycle_receiver_summary"
down_revision: Union[str, None] = "02_add_password_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cycle_receiver_summary",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cycle_id", sa.Integer(), nullable=False),
        sa.Column("receiver_id", sa.Integer(), nullable=False),
        sa.Column("respondent_count", sa.Integer(), nullable=False),
        sa.Column("average_scores", sa.JSON(), nullable=False),
        sa.Column("snippets_helpful", sa.JSON(), nullable=False),
        sa.Column("snippets_improvement", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["cycle_id"], ["feedback_cycles.id"]),
        sa.ForeignKeyConstraint(["receiver_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_cycle_receiver_summary_cycle_id"), "cycle_receiver_summary", ["cycle_id"], unique=False)
    op.create_index(op.f("ix_cycle_receiver_summary_receiver_id"), "cycle_receiver_summary", ["receiver_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_cycle_receiver_summary_receiver_id"), table_name="cycle_receiver_summary")
    op.drop_index(op.f("ix_cycle_receiver_summary_cycle_id"), table_name="cycle_receiver_summary")
    op.drop_table("cycle_receiver_summary")
