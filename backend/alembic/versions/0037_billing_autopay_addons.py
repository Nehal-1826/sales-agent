"""billing: auto-pay columns + add-ons catalogue/ownership

Revision ID: 0037_billing_autopay_addons
Revises: 0036_seed_current_plan_values
Create Date: 2026-06-22

Adds the dummy auto-pay state to ``users`` (auto_pay_enabled, next_billing_date),
a generic ``addons`` catalogue (admin-managed like plans), and a
``workspace_addons`` ownership table. Seeds three add-ons; the ``crm`` one
mirrors the existing workspace_settings.crm_addon_enabled flag on purchase.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0037_billing_autopay_addons"
down_revision: str | None = "0036_seed_current_plan_values"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("auto_pay_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("next_billing_date", sa.Date(), nullable=True))

    op.create_table(
        "addons",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("key", name="uq_addons_key"),
    )
    op.create_index("ix_addons_key", "addons", ["key"])

    op.create_table(
        "workspace_addons",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("addon_id", sa.Uuid(), nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["addon_id"], ["addons.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("workspace_id", "addon_id", name="uq_workspace_addon"),
    )
    op.create_index("ix_workspace_addons_workspace_id", "workspace_addons", ["workspace_id"])

    seed = [
        ("crm", "CRM Automation", "Auto-import replies into a Kanban pipeline + sequence auto-enrolment.", 49900, 10),
        ("mailbox_pack", "Extra Mailbox Pack", "Add 5 more warmup mailboxes on top of your plan.", 29900, 20),
        ("priority_support", "Priority Support", "Jump the queue — priority email + chat support.", 19900, 30),
    ]
    for key, name, desc, price, order in seed:
        op.execute(
            sa.text(
                "INSERT INTO addons (id, key, name, description, price_cents, is_active, sort_order) "
                "VALUES (gen_random_uuid(), :k, :n, :d, :p, true, :o) ON CONFLICT (key) DO NOTHING"
            ).bindparams(k=key, n=name, d=desc, p=price, o=order)
        )


def downgrade() -> None:
    op.drop_table("workspace_addons")
    op.drop_index("ix_addons_key", table_name="addons")
    op.drop_table("addons")
    op.drop_column("users", "next_billing_date")
    op.drop_column("users", "auto_pay_enabled")
