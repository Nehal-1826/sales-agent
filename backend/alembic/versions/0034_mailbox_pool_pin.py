"""per-mailbox peer-pool pin

Revision ID: 0034_mailbox_pool_pin
Revises: 0033_pool_daily_send_limit
Create Date: 2026-06-16

A mailbox can be pinned to its own peer pool, overriding its workspace's
``ClientPoolAssignment`` during pairing. NULL = inherit the workspace
assignment (existing behaviour), so the column is nullable with no backfill.
``ondelete=SET NULL`` so deleting a pool simply unpins affected mailboxes.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0034_mailbox_pool_pin"
down_revision: str | None = "0033_pool_daily_send_limit"


def upgrade() -> None:
    op.add_column(
        "mailboxes",
        sa.Column("pool_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_mailboxes_pool_id_peer_pools",
        "mailboxes",
        "peer_pools",
        ["pool_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_mailboxes_pool_id", "mailboxes", ["pool_id"])


def downgrade() -> None:
    op.drop_index("ix_mailboxes_pool_id", table_name="mailboxes")
    op.drop_constraint(
        "fk_mailboxes_pool_id_peer_pools", "mailboxes", type_="foreignkey"
    )
    op.drop_column("mailboxes", "pool_id")
