"""add plans.sort_order for admin-controlled display order

Revision ID: 0035_plan_sort_order
Revises: 0034_mailbox_pool_pin
Create Date: 2026-06-20

Plans gain an admin-editable ``sort_order`` (lower shows first on the public
pricing page / onboarding picker; ties broken by price ascending). Existing
rows default to 0; we seed the canonical tier order for the known plans so the
public listing reads Starter → Pro → Pro Plus → Agency out of the box instead
of sorting by the (possibly mis-entered) price.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0035_plan_sort_order"
down_revision: str | None = "0034_mailbox_pool_pin"


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    # Seed canonical tier order for known plans (case-insensitive match).
    seed = [
        ("starter", 10),
        ("pro plus", 30),
        ("pro+", 30),
        ("pro", 20),
        ("agency", 40),
    ]
    for name, order in seed:
        op.execute(
            sa.text("UPDATE plans SET sort_order = :o WHERE lower(name) = :n").bindparams(
                o=order, n=name
            )
        )


def downgrade() -> None:
    op.drop_column("plans", "sort_order")
