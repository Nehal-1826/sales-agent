"""stripe_events idempotency table + stripe identifiers on payments

Revision ID: 0009_stripe
Revises: 0008_peer_last_used_at
Create Date: 2026-04-27

The Stripe webhook is at-least-once — Stripe retries until it sees a 2xx,
and a single ``checkout.session.completed`` event can fire multiple times
during partial outages. ``stripe_events`` is the idempotency journal: we
insert by (id) before applying side effects; a duplicate primary-key
collision short-circuits the handler.

The ``payments`` table picks up two opaque correlation columns so admins
can cross-reference rows against the Stripe Dashboard without leaking
customer email addresses through Stripe metadata.
"""
from __future__ import annotations

from typing import Union
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_stripe"
down_revision: str | None = "0008_peer_last_used_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stripe_events",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("type", sa.String(128), nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text, nullable=True),
    )
    op.create_index(
        "ix_stripe_events_received",
        "stripe_events",
        ["received_at"],
        postgresql_ops={"received_at": "DESC"},
    )
    op.add_column(
        "payments",
        sa.Column("stripe_session_id", sa.String(255), nullable=True),
    )
    op.add_column(
        "payments",
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
    )
    op.create_index(
        "ix_payments_stripe_session",
        "payments",
        ["stripe_session_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_payments_stripe_session", table_name="payments")
    op.drop_column("payments", "stripe_subscription_id")
    op.drop_column("payments", "stripe_session_id")
    op.drop_index("ix_stripe_events_received", table_name="stripe_events")
    op.drop_table("stripe_events")
