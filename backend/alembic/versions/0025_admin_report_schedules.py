"""admin_report_schedules — platform-level recurring report schedules

Revision ID: 0025_admin_report_schedules
Revises: 0025_plan_is_public
Create Date: 2026-06-01

Adds ``admin_report_schedules``: a platform-level (not workspace-scoped)
table of recurring admin report jobs, each with a cadence, format, recipient
list, filter blob, and next/last run timestamps.

Cross-dialect notes:
  * UUID columns use postgresql.UUID(as_uuid=True).with_variant(String(36), "sqlite").
  * No Enum types — cadence and format are VARCHAR columns for maximum
    forward-compatibility and SQLite test compatibility.
  * JSON columns use sa.JSON (works on both Postgres and SQLite).

Idempotent: an inspector pre-check skips the upgrade if the table already
exists, so the migration is safe to re-run.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025_admin_report_schedules"
down_revision: str | None = "0025_plan_is_public"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "admin_report_schedules" in inspector.get_table_names():
        return  # idempotent

    op.create_table(
        "admin_report_schedules",
        sa.Column("id", _UUID, primary_key=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("report_type", sa.String(50), nullable=False),
        sa.Column("cadence", sa.String(20), nullable=False),      # daily|weekly|monthly
        sa.Column("recipients", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("format", sa.String(10), nullable=False, server_default="csv"),
        sa.Column("filters", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    # Index for common query: enabled schedules ordered by next_run_at.
    op.create_index(
        "ix_admin_report_schedules_next_run_at",
        "admin_report_schedules",
        ["next_run_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_admin_report_schedules_next_run_at",
        table_name="admin_report_schedules",
    )
    op.drop_table("admin_report_schedules")
