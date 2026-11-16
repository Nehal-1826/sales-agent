"""seed default plans (Starter / Pro / Agency)

Revision ID: 0002_seed_plans
Revises: 0001_initial
Create Date: 2026-04-23

Data-only migration. Inserts the three public plans referenced by the
landing-page pricing table and the onboarding plan-picker. Uses the
``plans.name`` unique constraint for idempotency: ON CONFLICT DO NOTHING
on Postgres, and a parameterised pre-check on SQLite (which lacks that
clause) so the migration also works under the test harness.
"""
from __future__ import annotations

import json
import uuid
from typing import Union
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_seed_plans"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_PLAN_SEEDS: list[dict] = [
    {
        "name": "Starter",
        "price_cents": 1500,
        "max_mailboxes": 1,
        "daily_email_cap": 50,
        "token_cap_per_month": 30_000,
        "capabilities": {
            "features": [
                "50 warmup emails/day",
                "1 inbox",
                "Basic dashboard",
                "SPF/DKIM/DMARC checker",
                "Gmail + Outlook",
                "Email support",
            ],
            "can_invite_team_members": False,
            "can_create_sub_clients": False,
            "can_issue_api_keys": False,
            "can_export_whitelabel_reports": False,
        },
        "is_active": True,
    },
    {
        "name": "Pro",
        "price_cents": 3900,
        # Pro defaults: 10 mailboxes. Admins can override the cap per-plan via
        # the admin /admin/plans editor (PATCH /admin/plans/{id}) without
        # needing a new migration — this seed is only the initial value for
        # fresh installs.
        "max_mailboxes": 10,
        "daily_email_cap": 100,
        "token_cap_per_month": 150_000,
        "capabilities": {
            "features": [
                "100 warmup emails/day per inbox",
                "10 inboxes",
                "AI-generated content",
                "Warmth Score alerts",
                "Placement testing",
                "Blacklist monitoring",
                "Slack/webhook",
                "Priority support",
            ],
            "can_invite_team_members": True,
            "can_create_sub_clients": False,
            "can_issue_api_keys": False,
            "can_export_whitelabel_reports": False,
        },
        "is_active": True,
    },
    {
        "name": "Agency",
        "price_cents": 9900,
        "max_mailboxes": 9999,
        "daily_email_cap": 200,
        "token_cap_per_month": 500_000,
        "capabilities": {
            "features": [
                "200 warmup emails/day per inbox",
                "Unlimited inboxes",
                "Multi-client workspace",
                "White-label reports",
                "API access",
                "Custom schedules",
                "Dedicated AM",
            ],
            "can_invite_team_members": True,
            "can_create_sub_clients": True,
            "can_issue_api_keys": True,
            "can_export_whitelabel_reports": True,
        },
        "is_active": True,
    },
]


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    for seed in _PLAN_SEEDS:
        # Skip if a plan with this name already exists — makes the migration
        # safe to re-run after partial failures or when seeding existing envs.
        existing = bind.execute(
            sa.text("SELECT 1 FROM plans WHERE name = :name"),
            {"name": seed["name"]},
        ).first()
        if existing:
            continue

        params = {
            "id": str(uuid.uuid4()),
            "name": seed["name"],
            "price_cents": seed["price_cents"],
            "max_mailboxes": seed["max_mailboxes"],
            "daily_email_cap": seed["daily_email_cap"],
            "token_cap_per_month": seed["token_cap_per_month"],
            # Postgres JSON column accepts dicts via asyncpg/psycopg, but the
            # sync Alembic connection prefers a JSON string — serialise to be
            # portable across sqlite + postgres.
            "capabilities": json.dumps(seed["capabilities"]),
            "is_active": seed["is_active"],
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


def downgrade() -> None:
    bind = op.get_bind()
    names = [seed["name"] for seed in _PLAN_SEEDS]
    bind.execute(
        sa.text("DELETE FROM plans WHERE name IN :names").bindparams(
            sa.bindparam("names", expanding=True)
        ),
        {"names": names},
    )
