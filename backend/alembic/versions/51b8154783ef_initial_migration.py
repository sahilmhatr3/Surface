"""Initial migration

Revision ID: 51b8154783ef
Revises: 
Create Date: 2026-02-07 13:21:00.236472

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '51b8154783ef'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create teams table
    op.create_table(
        'teams',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('team_id', sa.Integer(), nullable=True),
        sa.Column('manager_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ),
        sa.ForeignKeyConstraint(['manager_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_users_team_id'), 'users', ['team_id'], unique=False)
    op.create_index(op.f('ix_users_manager_id'), 'users', ['manager_id'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    
    # Create feedback_cycles table
    op.create_table(
        'feedback_cycles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('team_id', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_feedback_cycles_team_id'), 'feedback_cycles', ['team_id'], unique=False)
    
    # Create rants table
    op.create_table(
        'rants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('cycle_id', sa.Integer(), nullable=False),
        sa.Column('raw_text', sa.Text(), nullable=True),
        sa.Column('anonymized_text', sa.Text(), nullable=False),
        sa.Column('theme', sa.String(length=100), nullable=False),
        sa.Column('sentiment', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['cycle_id'], ['feedback_cycles.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rants_user_id'), 'rants', ['user_id'], unique=False)
    op.create_index(op.f('ix_rants_cycle_id'), 'rants', ['cycle_id'], unique=False)
    
    # Create structured_feedback table
    op.create_table(
        'structured_feedback',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('giver_id', sa.Integer(), nullable=False),
        sa.Column('receiver_id', sa.Integer(), nullable=False),
        sa.Column('cycle_id', sa.Integer(), nullable=False),
        sa.Column('scores', sa.JSON(), nullable=False),
        sa.Column('comments_helpful', sa.Text(), nullable=True),
        sa.Column('comments_improvement', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['cycle_id'], ['feedback_cycles.id'], ),
        sa.ForeignKeyConstraint(['giver_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_structured_feedback_giver_id'), 'structured_feedback', ['giver_id'], unique=False)
    op.create_index(op.f('ix_structured_feedback_receiver_id'), 'structured_feedback', ['receiver_id'], unique=False)
    op.create_index(op.f('ix_structured_feedback_cycle_id'), 'structured_feedback', ['cycle_id'], unique=False)
    
    # Create cycle_insights table
    op.create_table(
        'cycle_insights',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cycle_id', sa.Integer(), nullable=False),
        sa.Column('theme', sa.String(length=100), nullable=False),
        sa.Column('sentiment_summary', sa.String(length=255), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False),
        sa.Column('example_comments', sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(['cycle_id'], ['feedback_cycles.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cycle_insights_cycle_id'), 'cycle_insights', ['cycle_id'], unique=False)
    
    # Create actions table
    op.create_table(
        'actions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cycle_id', sa.Integer(), nullable=False),
        sa.Column('theme', sa.String(length=100), nullable=False),
        sa.Column('manager_id', sa.Integer(), nullable=False),
        sa.Column('action_text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['cycle_id'], ['feedback_cycles.id'], ),
        sa.ForeignKeyConstraint(['manager_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_actions_cycle_id'), 'actions', ['cycle_id'], unique=False)
    op.create_index(op.f('ix_actions_manager_id'), 'actions', ['manager_id'], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index(op.f('ix_actions_manager_id'), table_name='actions')
    op.drop_index(op.f('ix_actions_cycle_id'), table_name='actions')
    op.drop_table('actions')
    
    op.drop_index(op.f('ix_cycle_insights_cycle_id'), table_name='cycle_insights')
    op.drop_table('cycle_insights')
    
    op.drop_index(op.f('ix_structured_feedback_cycle_id'), table_name='structured_feedback')
    op.drop_index(op.f('ix_structured_feedback_receiver_id'), table_name='structured_feedback')
    op.drop_index(op.f('ix_structured_feedback_giver_id'), table_name='structured_feedback')
    op.drop_table('structured_feedback')
    
    op.drop_index(op.f('ix_rants_cycle_id'), table_name='rants')
    op.drop_index(op.f('ix_rants_user_id'), table_name='rants')
    op.drop_table('rants')
    
    op.drop_index(op.f('ix_feedback_cycles_team_id'), table_name='feedback_cycles')
    op.drop_table('feedback_cycles')
    
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_manager_id'), table_name='users')
    op.drop_index(op.f('ix_users_team_id'), table_name='users')
    op.drop_table('users')
    
    op.drop_table('teams')
