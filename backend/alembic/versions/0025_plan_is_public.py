"""plans.is_public — public-visibility flag (hide a plan without soft-deleting it)

Revision ID: 0025_plan_is_public
Revises: 0024_crm_sequences
Create Date: 2026-06-02

Adds ``plans.is_public`` (boolean, NOT NULL, default true). Distinct from
``is_active`` (soft-delete): a plan with ``is_public=False`` stays live for its
existing subscribers and admins, but is hidden from the public pricing page,
sign-up, and the onboarding plan picker — and the backend blocks new purchases
of it. Lets admins quietly retire a tier (e.g. Agency) from self-serve.

Idempotent: skips the ALTER if the column already exists so re-runs are clean.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025_plan_is_public"
down_revision: str | None = "0024_crm_sequences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("plans")}
    if "is_public" in cols:
        return
    op.add_column(
        "plans",
        sa.Column(
            "is_public",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("plans", "is_public")
