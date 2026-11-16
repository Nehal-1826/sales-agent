"""seed canonical plan values (price/features/limits/order)

Revision ID: 0036_seed_current_plan_values
Revises: 0035_plan_sort_order
Create Date: 2026-06-20

Bakes the current production plan catalogue into a seed so a fresh install
starts with the same tiers (INR pricing, feature lists, mailbox/cap limits,
display order) instead of the stale 0002/0021 values. Idempotent upsert keyed
on the unique ``name`` — runs cleanly on a fresh DB (updates the rows 0002/0021
just created) and on prod (already these values, except Agency is normalised to
₹15,000 + public, replacing the earlier test value).
"""
from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision: str = "0036_seed_current_plan_values"
down_revision: str | None = "0035_plan_sort_order"


PLANS = [
    {
        "name": "Starter",
        "price_cents": 150000,
        "max_mailboxes": 5,
        "daily_email_cap": 50,
        "token_cap_per_month": 30000,
        "sort_order": 10,
        "is_active": True,
        "is_public": True,
        "capabilities": {
            "features": [
                "50 warmup emails/day",
                "1 inbox",
                "Basic dashboard",
                "SPF/DKIM/DMARC checker",
                "Gmail + Outlook",
                "Email support",
            ]
        },
    },
    {
        "name": "Pro",
        "price_cents": 499900,
        "max_mailboxes": 5,
        "daily_email_cap": 100,
        "token_cap_per_month": 150000,
        "sort_order": 20,
        "is_active": True,
        "is_public": True,
        "capabilities": {
            "features": [
                "1000 warmup emails/day per inbox",
                "5 inboxes",
                "AI-generated content",
                "Warmth Score alerts",
                "Placement testing",
                "Blacklist monitoring",
                "Slack/webhook",
                "Priority support",
            ]
        },
    },
    {
        "name": "Pro Plus",
        "price_cents": 799900,
        "max_mailboxes": 15,
        "daily_email_cap": 175,
        "token_cap_per_month": 250000,
        "sort_order": 30,
        "is_active": True,
        "is_public": True,
        "capabilities": {
            "features": [
                "15 mailboxes",
                "75 sends/day per inbox",
                "Everything in Pro",
                "Google Postmaster ingest",
                "Microsoft SNDS ingest",
                "Placement tester (30 seeds)",
                "Priority 4-hr support SLA",
            ]
        },
    },
    {
        "name": "Agency",
        "price_cents": 1500000,
        "max_mailboxes": 9999,
        "daily_email_cap": 200,
        "token_cap_per_month": 500000,
        "sort_order": 40,
        "is_active": True,
        "is_public": True,
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
            "retention_days": 365,
        },
    },
]

UPSERT = sa.text(
    """
    INSERT INTO plans (
        id, name, price_cents, max_mailboxes, daily_email_cap,
        token_cap_per_month, capabilities, is_active, is_public, sort_order
    ) VALUES (
        gen_random_uuid(), :name, :price_cents, :max_mailboxes, :daily_email_cap,
        :token_cap_per_month, CAST(:capabilities AS json), :is_active, :is_public, :sort_order
    )
    ON CONFLICT (name) DO UPDATE SET
        price_cents = EXCLUDED.price_cents,
        max_mailboxes = EXCLUDED.max_mailboxes,
        daily_email_cap = EXCLUDED.daily_email_cap,
        token_cap_per_month = EXCLUDED.token_cap_per_month,
        capabilities = EXCLUDED.capabilities,
        is_active = EXCLUDED.is_active,
        is_public = EXCLUDED.is_public,
        sort_order = EXCLUDED.sort_order
    """
)


def upgrade() -> None:
    conn = op.get_bind()
    for plan in PLANS:
        conn.execute(
            UPSERT,
            {**plan, "capabilities": json.dumps(plan["capabilities"])},
        )


def downgrade() -> None:
    # Seed data only — nothing to roll back (values are not reverted to the
    # historical 0002/0021 figures).
    pass
