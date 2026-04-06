"""Add per-point hidden indices for manager review

Revision ID: 10_per_point_hiding
Revises: 09_compile_publish
Create Date: 2026-03-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "10_per_point_hiding"
down_revision: Union[str, None] = "09_compile_publish"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cycle_insights", sa.Column("hidden_example_indices", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("cycle_receiver_summary", sa.Column("hidden_helpful_indices", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("cycle_receiver_summary", sa.Column("hidden_improvement_indices", sa.JSON(), nullable=False, server_default="[]"))

    op.alter_column("cycle_insights", "hidden_example_indices", server_default=None)
    op.alter_column("cycle_receiver_summary", "hidden_helpful_indices", server_default=None)
    op.alter_column("cycle_receiver_summary", "hidden_improvement_indices", server_default=None)


def downgrade() -> None:
    op.drop_column("cycle_receiver_summary", "hidden_improvement_indices")
    op.drop_column("cycle_receiver_summary", "hidden_helpful_indices")
    op.drop_column("cycle_insights", "hidden_example_indices")
