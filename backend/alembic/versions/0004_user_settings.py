"""user settings columns: profile + notifications + tour

Revision ID: 0004_user_settings
Revises: 0003_seed_default_pool
Create Date: 2026-04-26

Adds profile/locale/timezone, a JSON ``notification_prefs`` column carrying
the workspace alert preferences (slack webhook, email digest, alert toggles),
and a ``tour_completed_at`` timestamp for the onboarding tour replay flow.

The previous ``notification_settings`` table stays in place — it remains the
authority for per-channel routing (email/Slack/webhook targets per event
type). The new column captures the higher-level user-facing toggles surfaced
in the Settings UI; the two are complementary.
"""
from __future__ import annotations

from typing import Union
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_user_settings"
down_revision: str | None = "0003_seed_default_pool"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("display_name", sa.String(255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
    )
    op.add_column(
        "users",
        sa.Column("locale", sa.String(16), nullable=False, server_default="en-US"),
    )
    op.add_column(
        "users",
        sa.Column(
            "notification_prefs",
            sa.JSON,
            nullable=False,
            server_default=sa.text(
                "'{\"slack_webhook\": null, \"email_digest_enabled\": true, "
                "\"alerts\": {\"warmth_drop\": true, \"bounce_spike\": true, "
                "\"dns_break\": true}}'"
            ),
        ),
    )
    op.add_column(
        "users",
        sa.Column("tour_completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "tour_completed_at")
    op.drop_column("users", "notification_prefs")
    op.drop_column("users", "locale")
    op.drop_column("users", "timezone")
    op.drop_column("users", "display_name")
