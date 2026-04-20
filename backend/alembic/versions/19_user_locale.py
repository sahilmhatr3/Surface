"""Add UI locale preference on users.

Revision ID: 19_user_locale
"""
from alembic import op
import sqlalchemy as sa

revision = "19_user_locale"
down_revision = "18_publication_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("locale", sa.String(length=10), nullable=False, server_default="en"),
    )


def downgrade() -> None:
    op.drop_column("users", "locale")
