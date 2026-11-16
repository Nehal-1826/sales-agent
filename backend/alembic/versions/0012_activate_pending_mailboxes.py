"""one-shot: activate any stuck-pending mailboxes

Revision ID: 0012_activate_pending_mailboxes
Revises: 0011_payment_method_upi
Create Date: 2026-05-04

Background: ``services/mailbox_service.create_mailbox`` used to insert new
mailboxes with ``warmup_status='pending'`` even after the SMTP probe had
already verified the credentials. The Celery beat fan-out only sends for
``warmup_status='active'`` mailboxes, so anything that landed in
``pending`` silently stalled — users saw "0 sent today" forever with no
UX path back to active.

The fix in mailbox_service now sets ``active`` directly. This migration
backfills existing rows: every mailbox that has probe-verified credentials
on file (i.e. is in the table at all) should be active.

We deliberately leave ``completed`` / ``paused`` rows untouched — only
``pending`` rows are unblocked.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0012_activate_pending_mailboxes"
down_revision: str | None = "0011_payment_method_upi"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE mailboxes SET warmup_status = 'active' "
        "WHERE warmup_status = 'pending'"
    )


def downgrade() -> None:
    # No-op: reverting wholesale to ``pending`` would re-introduce the stall.
    pass
