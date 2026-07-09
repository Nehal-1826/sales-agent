"""notifications inbox table

Revision ID: 0010_notifications_inbox
Revises: 0009_stripe
Create Date: 2026-04-27

In-app notifications surfaced at /app/notifications. Distinct from
``notification_settings`` (per-channel routing config) — this table is
the *inbox*: one row per delivered transactional event, with read state
and a structured payload the UI can deep-link off.

Common ``kind`` values:
    welcome                   — one-shot on signup
    mailbox_disconnected      — IMAP/SMTP creds revoked or mailbox deleted
    warmth_drop               — fired by alert_check beat task
    in_spam                   — fired by alert_check beat task
    peer_unhealthy            — fired by alert_check beat task
    payment_succeeded         — Stripe webhook on checkout.session.completed
    payment_failed            — Stripe webhook on invoice.payment_failed
    weekly_digest             — fired by a future weekly beat task

The ``payload`` JSON is opaque to the inbox; consumers can put whatever
context they want there (mailbox_id, amount_cents, …) and the UI
deep-links via ``payload.url`` if present.
"""
from __future__ import annotations

from typing import Union
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_notifications_inbox"
down_revision: str | None = "0009_stripe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text, nullable=False, server_default=""),
        sa.Column("payload", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    # Inbox queries are always (user_id, created_at desc) plus the unread
    # filter. A composite index covers both list and unread-count paths.
    op.create_index(
        "ix_notifications_user_created",
        "notifications",
        ["user_id", "created_at"],
        postgresql_ops={"created_at": "DESC"},
    )
    op.create_index(
        "ix_notifications_user_unread",
        "notifications",
        ["user_id"],
        postgresql_where=sa.text("read_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_user_unread", table_name="notifications")
    op.drop_index("ix_notifications_user_created", table_name="notifications")
    op.drop_table("notifications")
