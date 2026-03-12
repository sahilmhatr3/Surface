"""Add temporary_password_plaintext to users (admin can reveal after verify)

Revision ID: 07_temporary_password
Revises: 06_must_reset
Create Date: 2026-03-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "07_temporary_password"
down_revision: Union[str, None] = "06_must_reset"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("temporary_password_plaintext", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "temporary_password_plaintext")
