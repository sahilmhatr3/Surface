"""Store frozen employee-visible snapshots when published content is edited.

Revision ID: 18_publication_snapshots
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "18_publication_snapshots"
down_revision = "17_feedback_content_locale"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "feedback_cycles",
        sa.Column("team_public_snapshot", JSONB, nullable=True),
    )
    op.add_column(
        "feedback_cycles",
        sa.Column("team_publication_outdated", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "feedback_cycles",
        sa.Column("individual_public_snapshot", JSONB, nullable=True),
    )
    op.add_column(
        "feedback_cycles",
        sa.Column("individual_publication_outdated", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.alter_column("feedback_cycles", "team_publication_outdated", server_default=None)
    op.alter_column("feedback_cycles", "individual_publication_outdated", server_default=None)


def downgrade() -> None:
    op.drop_column("feedback_cycles", "individual_publication_outdated")
    op.drop_column("feedback_cycles", "individual_public_snapshot")
    op.drop_column("feedback_cycles", "team_publication_outdated")
    op.drop_column("feedback_cycles", "team_public_snapshot")
