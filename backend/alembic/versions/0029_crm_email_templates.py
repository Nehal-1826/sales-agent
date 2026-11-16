"""add crm_email_templates table

Revision ID: 0029_crm_email_templates
Revises: 0028_add_auto_crm_enabled
Create Date: 2026-06-12

Per-workspace custom CRM email templates (name/subject/body/category). Built-in
templates live in code, not this table.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0029_crm_email_templates"
down_revision: str | None = "0028_add_auto_crm_enabled"


def upgrade() -> None:
    op.create_table(
        "crm_email_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("body", sa.String(length=4000), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_crm_email_templates_workspace_id",
        "crm_email_templates",
        ["workspace_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_crm_email_templates_workspace_id", table_name="crm_email_templates"
    )
    op.drop_table("crm_email_templates")
