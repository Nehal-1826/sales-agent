"""revenge_events — telemetry for revenge (re-spam) runs

Revision ID: 0038_revenge_events
Revises: 0037_billing_autopay_addons
Create Date: 2026-06-23

One row per revenge run, created pending at trigger time and updated to a
terminal status by tasks.revenge. Powers the admin Revenge Activity dashboard.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0038_revenge_events"
down_revision: str | None = "0037_billing_autopay_addons"


def upgrade() -> None:
    trigger_enum = sa.Enum(
        "auto_cancel_2h", "manual_admin", name="revenge_trigger"
    )
    status_enum = sa.Enum(
        "pending", "completed", "failed", "no_candidates", name="revenge_status"
    )

    op.create_table(
        "revenge_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("user_email", sa.String(length=320), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=True),
        sa.Column("trigger", trigger_enum, nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status", status_enum, nullable=False, server_default="pending"
        ),
        sa.Column("candidates_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("moved_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detail", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_revenge_events_created", "revenge_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_revenge_events_created", table_name="revenge_events")
    op.drop_table("revenge_events")
    sa.Enum(name="revenge_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="revenge_trigger").drop(op.get_bind(), checkfirst=True)
