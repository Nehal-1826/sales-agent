"""peer_inboxes.last_used_at + ix_peer_inboxes_last_used

Revision ID: 0008_peer_last_used_at
Revises: 0007_app_settings
Create Date: 2026-04-27

The admin /admin/peer-inboxes table reads ``last_used_at`` to show how
recently a peer was consumed. The column was missing — the table rendered
"—" for every row. We backfill nothing (existing peers really don't have
a known last-used time); the warmup_send path now stamps it on every pick.
"""
from __future__ import annotations

from typing import Union
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_peer_last_used_at"
down_revision: str | None = "0007_app_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "peer_inboxes",
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_peer_inboxes_last_used",
        "peer_inboxes",
        ["last_used_at"],
        postgresql_ops={"last_used_at": "DESC NULLS LAST"},
    )


def downgrade() -> None:
    op.drop_index("ix_peer_inboxes_last_used", table_name="peer_inboxes")
    op.drop_column("peer_inboxes", "last_used_at")
