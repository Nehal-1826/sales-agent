"""add Julex integration fields to workspace_settings

Revision ID: 0040_add_julex_integration_fields
Revises: 0039_device_tokens
Create Date: 2026-08-21

Adds ``julex_store_key`` (UNIQUE-indexed — one Julex store maps to at most
one workspace; NULL for unlinked workspaces is allowed on SQLite + Postgres),
``julex_store_name``, and ``julex_connected_at``.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0042_julex_integration_fields"
down_revision: str | None = "0041_crm_body_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspace_settings",
        sa.Column("julex_store_key", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "workspace_settings",
        sa.Column("julex_store_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "workspace_settings",
        sa.Column("julex_connected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_workspace_settings_julex_store_key",
        "workspace_settings",
        ["julex_store_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_settings_julex_store_key", table_name="workspace_settings")
    op.drop_column("workspace_settings", "julex_connected_at")
    op.drop_column("workspace_settings", "julex_store_name")
    op.drop_column("workspace_settings", "julex_store_key")
