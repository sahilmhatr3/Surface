"""Actions overhaul: add receiver_id (individual actions), is_ai_generated, is_hidden; make theme nullable.

Revision ID: 11_actions_overhaul
Revises: 10_per_point_hiding
Create Date: 2026-04-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "11_actions_overhaul"
down_revision: Union[str, None] = "10_per_point_hiding"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # receiver_id: null = team-level action, set = individual action for that user
    op.add_column("actions", sa.Column("receiver_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("actions", sa.Column("is_ai_generated", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("actions", sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default="false"))

    # Remove server defaults (let SQLAlchemy handle them)
    op.alter_column("actions", "is_ai_generated", server_default=None)
    op.alter_column("actions", "is_hidden", server_default=None)

    # theme was previously NOT NULL; make nullable so freeform actions don't require a tag
    op.alter_column("actions", "theme", nullable=True)


def downgrade() -> None:
    op.alter_column("actions", "theme", nullable=False)
    op.drop_column("actions", "is_hidden")
    op.drop_column("actions", "is_ai_generated")
    op.drop_column("actions", "receiver_id")
