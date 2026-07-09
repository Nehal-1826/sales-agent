"""add auto_crm_enabled to workspace_settings

Revision ID: 0028_add_auto_crm_enabled
Revises: dc67c2bf39e0
Create Date: 2026-06-10

Adds ``auto_crm_enabled`` boolean to ``workspace_settings``.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0028_add_auto_crm_enabled"
down_revision: str | None = "dc67c2bf39e0"


def upgrade() -> None:
    op.add_column(
        "workspace_settings",
        sa.Column(
            "auto_crm_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("workspace_settings", "auto_crm_enabled")
