"""Add app feedback table.

Revision ID: 20_app_feedback
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "20_app_feedback"
down_revision = "19_user_locale"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_feedback",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("attachments", JSONB, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_app_feedback_user_id", "app_feedback", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_app_feedback_user_id", table_name="app_feedback")
    op.drop_table("app_feedback")
