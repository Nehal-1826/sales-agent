"""workspace_settings + extended notification_prefs events matrix.

Revision ID: 0014_workspace_settings
Revises: 0013_drop_zai_naming
Create Date: 2026-05-15

Adds a ``workspace_settings`` table — one row per workspace_id — holding the
workspace-scoped fields the Pro Settings UI surfaces (name, slug,
default sender, brand color, retention window). There is no dedicated
``workspaces`` table; the workspace identifier remains the UUID stamped on
users / mailboxes, and this row attaches workspace-shaped config to it.

Also nudges the user-level ``notification_prefs`` JSON to carry an
``events`` map — { event_key: { email, in_app, push } } — used by the new
Pro Settings Notifications tab's 8×3 channel matrix. Existing rows are
left untouched and the API merges defaults on read, so this is a pure
additive schema change.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_workspace_settings"
down_revision: str | None = "0013_drop_zai_naming"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspace_settings",
        sa.Column(
            "workspace_id", postgresql.UUID(as_uuid=True), primary_key=True
        ),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("slug", sa.String(64), nullable=True),
        sa.Column("default_sender", sa.String(320), nullable=True),
        sa.Column("brand_color", sa.String(16), nullable=True),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="90"),
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
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("workspace_settings")
