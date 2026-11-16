"""add per-pool daily send limit

Revision ID: 0033_pool_daily_send_limit
Revises: 0032_inbound_capture_watermark
Create Date: 2026-06-16

A peer pool can carry an optional ``daily_send_limit`` — a per-pool cap on
warmup sends. NULL means "no pool-level cap" (the existing behaviour), so the
column is nullable with no backfill.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0033_pool_daily_send_limit"
down_revision: str | None = "0032_inbound_capture_watermark"


def upgrade() -> None:
    op.add_column(
        "peer_pools",
        sa.Column("daily_send_limit", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("peer_pools", "daily_send_limit")
