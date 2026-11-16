"""seed default peer pool

Revision ID: 0003_seed_default_pool
Revises: 0002_seed_plans
Create Date: 2026-04-23

Data-only migration. Inserts a single ``peer_pools`` row named 'default'
and flagged ``is_default=true``. Every new peer inbox is added here so
operators can opt specific peers in to alternate pools later.

Idempotent: uses ON CONFLICT on Postgres (``peer_pools.name`` is UNIQUE)
and a pre-check on SQLite (mirrors the pattern in 0002_seed_plans).
"""
from __future__ import annotations

import uuid
from typing import Union
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_seed_default_pool"
down_revision: str | None = "0002_seed_plans"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_POOL_NAME = "default"
_POOL_DESC = "Auto-managed default pool — includes all active peer inboxes."


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    existing = bind.execute(
        sa.text("SELECT 1 FROM peer_pools WHERE name = :name"),
        {"name": _POOL_NAME},
    ).first()
    if existing:
        return

    params = {
        "id": str(uuid.uuid4()),
        "name": _POOL_NAME,
        "description": _POOL_DESC,
        "is_default": True,
    }

    if dialect == "postgresql":
        stmt = sa.text(
            """
            INSERT INTO peer_pools (id, name, description, is_default)
            VALUES (:id, :name, :description, :is_default)
            ON CONFLICT (name) DO NOTHING
            """
        )
    else:
        stmt = sa.text(
            """
            INSERT INTO peer_pools (id, name, description, is_default)
            VALUES (:id, :name, :description, :is_default)
            """
        )
    bind.execute(stmt, params)


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM peer_pools WHERE name = :name"),
        {"name": _POOL_NAME},
    )
