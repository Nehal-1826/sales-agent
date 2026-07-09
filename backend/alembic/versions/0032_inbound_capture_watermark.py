"""add inbound-capture watermark columns to mailboxes

Revision ID: 0032_inbound_capture_watermark
Revises: 0031_add_crm_addon_enabled
Create Date: 2026-06-16

The inbound CRM capture job scans a mailbox INBOX for cold enquiries. To avoid
re-fetching and re-classifying the same messages every run it records a
per-mailbox IMAP UID watermark, scoped by ``UIDVALIDITY`` so a folder reset
forces a clean re-scan. Both columns are nullable — a NULL watermark means
"never scanned", which falls back to the date-bounded initial window.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0032_inbound_capture_watermark"
down_revision: str | None = "0031_add_crm_addon_enabled"


def upgrade() -> None:
    op.add_column(
        "mailboxes",
        sa.Column("last_inbound_capture_uid", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "mailboxes",
        sa.Column("last_inbound_uidvalidity", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mailboxes", "last_inbound_uidvalidity")
    op.drop_column("mailboxes", "last_inbound_capture_uid")
