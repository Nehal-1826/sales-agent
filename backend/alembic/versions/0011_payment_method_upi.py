"""payment_method + dummy_upi_vpa on payments

Revision ID: 0011_payment_method_upi
Revises: 0010_notifications_inbox
Create Date: 2026-05-04

We're adding a second dummy gateway path: UPI (India). The existing
``payments`` table assumed every row was a card — ``dummy_card_last4``
stores the masked PAN.

To keep the table polymorphic without splitting it, we add:

* ``payment_method`` — short tag identifying the rail
  (``card_dummy`` / ``upi_dummy`` / ``stripe``). Nullable for
  backwards-compat; existing rows are backfilled to ``card_dummy``.
* ``dummy_upi_vpa`` — the VPA the user paid from
  (e.g. ``name@okaxis``). Nullable, only populated for UPI rows.

We don't touch ``dummy_card_last4`` — it stays where it is, just NULL
for UPI rows.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_payment_method_upi"
down_revision: str | None = "0010_notifications_inbox"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("payment_method", sa.String(32), nullable=True),
    )
    op.add_column(
        "payments",
        sa.Column("dummy_upi_vpa", sa.String(255), nullable=True),
    )
    # Backfill historical rows: anything pre-UPI was a card.
    op.execute(
        "UPDATE payments SET payment_method = 'card_dummy' "
        "WHERE payment_method IS NULL"
    )


def downgrade() -> None:
    op.drop_column("payments", "dummy_upi_vpa")
    op.drop_column("payments", "payment_method")
