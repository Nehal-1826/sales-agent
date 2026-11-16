"""add content_mode + ai_prompt to crm_sequence_steps

Revision ID: 0030_crm_step_content_mode
Revises: 0029_crm_email_templates
Create Date: 2026-06-12

A sequence step can now be plain text (default), a designer HTML body, or
AI-generated per lead. ``ai_prompt`` holds the instruction for the AI mode.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0030_crm_step_content_mode"
down_revision: str | None = "0029_crm_email_templates"


def upgrade() -> None:
    op.add_column(
        "crm_sequence_steps",
        sa.Column(
            "content_mode",
            sa.String(length=16),
            nullable=False,
            server_default="text",
        ),
    )
    op.add_column(
        "crm_sequence_steps",
        sa.Column("ai_prompt", sa.String(length=2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("crm_sequence_steps", "ai_prompt")
    op.drop_column("crm_sequence_steps", "content_mode")
