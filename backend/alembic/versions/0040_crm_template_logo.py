"""crm_email_templates: logo_image + logo_mime

Adds an optional brand logo to CRM email templates, embedded in outreach
mail through the {{logo}} variable.

Revision ID: 0040_crm_template_logo
Revises: 0039_device_tokens
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0040_crm_template_logo"
down_revision = "0039_device_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_email_templates",
        sa.Column("logo_image", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "crm_email_templates",
        sa.Column("logo_mime", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("crm_email_templates", "logo_mime")
    op.drop_column("crm_email_templates", "logo_image")
