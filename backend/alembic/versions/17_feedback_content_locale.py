"""Add content_locale to rants and structured_feedback for localized AI output.

Optional column: NULL means legacy English-only submissions; app treats NULL as en.

Revision ID: 17_feedback_content_locale
"""
from alembic import op
import sqlalchemy as sa

revision = "17_feedback_content_locale"
down_revision = "16_supabase_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rants", sa.Column("content_locale", sa.String(5), nullable=True))
    op.add_column("structured_feedback", sa.Column("content_locale", sa.String(5), nullable=True))


def downgrade() -> None:
    op.drop_column("structured_feedback", "content_locale")
    op.drop_column("rants", "content_locale")
