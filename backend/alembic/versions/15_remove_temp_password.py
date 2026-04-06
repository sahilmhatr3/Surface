"""Remove temporary_password_plaintext and must_reset_password from users table.

These columns supported the old admin-generates-temp-password flow, which is
replaced by the admin explicitly setting a password at user creation time.
The OTP/forgot-password flow is also removed in preparation for Supabase Auth.

Revision ID: 15_remove_temp_password
"""
from alembic import op
import sqlalchemy as sa

revision = "15_remove_temp_password"
down_revision = "14_split_publish"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("users", "temporary_password_plaintext")
    op.drop_column("users", "must_reset_password")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_reset_password", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "users",
        sa.Column("temporary_password_plaintext", sa.String(255), nullable=True),
    )
