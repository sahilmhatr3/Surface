"""Add supabase_id to users table for Supabase Auth integration.

Links each app user to their Supabase Auth identity. Nullable so existing
users are not broken; populated when admin creates users via the Admin API.

Revision ID: 16_supabase_id
"""
from alembic import op
import sqlalchemy as sa

revision = "16_supabase_id"
down_revision = "15_remove_temp_password"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("supabase_id", sa.String(255), nullable=True, unique=True),
    )
    op.create_index("ix_users_supabase_id", "users", ["supabase_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_supabase_id", table_name="users")
    op.drop_column("users", "supabase_id")
