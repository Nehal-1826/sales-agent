"""crm bodies: VARCHAR(4000) -> TEXT

Real HTML email templates run tens of KB. The 4000-char cap rejected them with
a 422 ("String should have at most 4000 characters"), which made the
"Upload .html / .txt" button unusable for anything but plain text.

Both tables move together: picking a template COPIES its body into a sequence
step, so a step must be able to hold anything a template can.

Revision ID: 0041_crm_body_text
Revises: 0040_crm_template_logo
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0041_crm_body_text"
down_revision = "0040_crm_template_logo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "crm_email_templates",
        "body",
        existing_type=sa.String(length=4000),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "crm_sequence_steps",
        "body",
        existing_type=sa.String(length=4000),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    # Lossy by nature: any row longer than 4000 chars cannot fit back into the
    # old type. Truncate explicitly rather than letting the ALTER fail.
    op.execute("UPDATE crm_email_templates SET body = left(body, 4000)")
    op.execute("UPDATE crm_sequence_steps SET body = left(body, 4000)")
    op.alter_column(
        "crm_email_templates",
        "body",
        existing_type=sa.Text(),
        type_=sa.String(length=4000),
        existing_nullable=False,
    )
    op.alter_column(
        "crm_sequence_steps",
        "body",
        existing_type=sa.Text(),
        type_=sa.String(length=4000),
        existing_nullable=False,
    )
