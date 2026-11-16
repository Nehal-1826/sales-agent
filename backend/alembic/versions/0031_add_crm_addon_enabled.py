"""add crm_addon_enabled to workspace_settings

Revision ID: 0031_add_crm_addon_enabled
Revises: 0030_crm_step_content_mode
Create Date: 2026-06-14

Adds ``crm_addon_enabled`` boolean to ``workspace_settings``. Starter (and
unknown-plan) workspaces unlock the full CRM by purchasing the CRM add-on;
this flag records that purchase per workspace.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0031_add_crm_addon_enabled"
down_revision: str | None = "0030_crm_step_content_mode"


def upgrade() -> None:
    op.add_column(
        "workspace_settings",
        sa.Column(
            "crm_addon_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("workspace_settings", "crm_addon_enabled")
