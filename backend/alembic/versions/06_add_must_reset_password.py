"""Add must_reset_password to users (force reset on first login after admin sets password)

Revision ID: 06_must_reset
Revises: 05_summary_text
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "06_must_reset"
down_revision: Union[str, None] = "05_summary_text"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_reset_password", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "must_reset_password")
