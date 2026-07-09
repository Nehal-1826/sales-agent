"""users.is_suspended flag

Revision ID: 0006_user_suspended
Revises: 0005_generated_reports
Create Date: 2026-04-26
"""
from __future__ import annotations

from typing import Union
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_user_suspended"
down_revision: str | None = "0005_generated_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_suspended",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "is_suspended")
