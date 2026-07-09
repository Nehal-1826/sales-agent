"""seed Pro Plus plan + refresh Pro/Agency prices

Revision ID: 0021_seed_pro_plus_plan
Revises: 0020_custom_domain
Create Date: 2026-05-15

Adds the Pro Plus tier (id slug 'pro_plus', display name 'Pro Plus') so the
onboarding plan picker's 4-tier layout has a backend row to resolve against.
Also brings Pro and Agency price_cents up to date with the published pricing
($60 / $96 / $180 monthly). Starter is already $15 in the seed; left as-is.

Idempotent: uses pre-check by name for portability across Postgres and SQLite
(the test harness).
"""
from __future__ import annotations

import json
import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_seed_pro_plus_plan"
down_revision: str | None = "0020_custom_domain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_PRO_PLUS_SEED = {
    "name": "Pro Plus",
    "price_cents": 9600,  # $96/mo
    "max_mailboxes": 15,
    "daily_email_cap": 75,
    "token_cap_per_month": 250_000,
    "capabilities": {
        "features": [
            "15 mailboxes",
            "75 sends/day per inbox",
            "Everything in Pro",
            "Google Postmaster ingest",
            "Microsoft SNDS ingest",
            "Placement tester (30 seeds)",
            "Priority 4-hr support SLA",
        ],
        "can_invite_team_members": True,
        "can_create_sub_clients": False,
        "can_issue_api_keys": True,
        "can_export_whitelabel_reports": False,
    },
    "is_active": True,
}


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # --- 1. Insert Pro Plus (idempotent) -------------------------------------
    existing = bind.execute(
        sa.text("SELECT 1 FROM plans WHERE name = :name"),
        {"name": _PRO_PLUS_SEED["name"]},
    ).first()
    if not existing:
        params = {
            "id": str(uuid.uuid4()),
            "name": _PRO_PLUS_SEED["name"],
            "price_cents": _PRO_PLUS_SEED["price_cents"],
            "max_mailboxes": _PRO_PLUS_SEED["max_mailboxes"],
            "daily_email_cap": _PRO_PLUS_SEED["daily_email_cap"],
            "token_cap_per_month": _PRO_PLUS_SEED["token_cap_per_month"],
            "capabilities": json.dumps(_PRO_PLUS_SEED["capabilities"]),
            "is_active": _PRO_PLUS_SEED["is_active"],
        }
        if dialect == "postgresql":
            stmt = sa.text(
                """
                INSERT INTO plans
                    (id, name, price_cents, max_mailboxes, daily_email_cap,
                     token_cap_per_month, capabilities, is_active)
                VALUES
                    (:id, :name, :price_cents, :max_mailboxes, :daily_email_cap,
                     :token_cap_per_month, CAST(:capabilities AS JSON), :is_active)
                ON CONFLICT (name) DO NOTHING
                """
            )
        else:
            stmt = sa.text(
                """
                INSERT INTO plans
                    (id, name, price_cents, max_mailboxes, daily_email_cap,
                     token_cap_per_month, capabilities, is_active)
                VALUES
                    (:id, :name, :price_cents, :max_mailboxes, :daily_email_cap,
                     :token_cap_per_month, :capabilities, :is_active)
                """
            )
        bind.execute(stmt, params)

    # --- 2. Refresh Pro / Agency prices to current pricing -------------------
    # We only touch price_cents — names, capabilities, and caps stay the same
    # so admin overrides survive. Migrations that change caps go separately.
    bind.execute(
        sa.text("UPDATE plans SET price_cents = :p WHERE name = :n"),
        {"p": 6000, "n": "Pro"},  # $60
    )
    bind.execute(
        sa.text("UPDATE plans SET price_cents = :p WHERE name = :n"),
        {"p": 18000, "n": "Agency"},  # $180
    )
    bind.execute(
        sa.text("UPDATE plans SET price_cents = :p WHERE name = :n"),
        {"p": 1800, "n": "Starter"},  # $18
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM plans WHERE name = :n"), {"n": "Pro Plus"})
    # Restore prior prices on Pro / Agency / Starter.
    bind.execute(sa.text("UPDATE plans SET price_cents = :p WHERE name = :n"), {"p": 3900, "n": "Pro"})
    bind.execute(sa.text("UPDATE plans SET price_cents = :p WHERE name = :n"), {"p": 9900, "n": "Agency"})
    bind.execute(sa.text("UPDATE plans SET price_cents = :p WHERE name = :n"), {"p": 1500, "n": "Starter"})
