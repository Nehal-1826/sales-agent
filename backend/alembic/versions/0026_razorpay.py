"""razorpay — Orders/Subscriptions columns + webhook idempotency journal

Revision ID: 0026_razorpay
Revises: 0025_admin_report_schedules
Create Date: 2026-06-06

Adds the Razorpay integration's persistence:
  * ``payments.razorpay_order_id`` / ``razorpay_payment_id`` /
    ``razorpay_subscription_id`` — correlate a Payment row back to the
    Razorpay Order / Payment / Subscription that produced it.
  * ``plans.razorpay_plan_id`` — cached Razorpay Plan id, created lazily on
    the first subscription for a tier so we don't re-create it each checkout.
  * ``razorpay_events`` — webhook idempotency journal (PK = Razorpay event id),
    mirroring ``stripe_events``.

Cross-dialect notes:
  * JSON columns use sa.JSON (works on both Postgres and SQLite).
  * No Enum types — everything is VARCHAR / JSON for SQLite test compatibility.

Idempotent: column adds and the table create are each guarded by an inspector
pre-check so the migration is safe to re-run.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026_razorpay"
down_revision: str | None = "0025_admin_report_schedules"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    payment_cols = {c["name"] for c in inspector.get_columns("payments")}
    if "razorpay_order_id" not in payment_cols:
        op.add_column(
            "payments",
            sa.Column("razorpay_order_id", sa.String(255), nullable=True),
        )
    if "razorpay_payment_id" not in payment_cols:
        op.add_column(
            "payments",
            sa.Column("razorpay_payment_id", sa.String(255), nullable=True),
        )
    if "razorpay_subscription_id" not in payment_cols:
        op.add_column(
            "payments",
            sa.Column("razorpay_subscription_id", sa.String(255), nullable=True),
        )

    plan_cols = {c["name"] for c in inspector.get_columns("plans")}
    if "razorpay_plan_id" not in plan_cols:
        op.add_column(
            "plans",
            sa.Column("razorpay_plan_id", sa.String(255), nullable=True),
        )

    if "razorpay_events" not in inspector.get_table_names():
        op.create_table(
            "razorpay_events",
            sa.Column("id", sa.String(255), primary_key=True, nullable=False),
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


def downgrade() -> None:
    op.drop_table("razorpay_events")
    op.drop_column("plans", "razorpay_plan_id")
    op.drop_column("payments", "razorpay_subscription_id")
    op.drop_column("payments", "razorpay_payment_id")
    op.drop_column("payments", "razorpay_order_id")
