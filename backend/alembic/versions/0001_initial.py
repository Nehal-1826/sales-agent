"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-23

Creates all 22 WarmPulse tables per spec §8 plus the indexes in §8.3.
"""
from __future__ import annotations

from typing import Union
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ---- enum definitions (one per spec, reused across tables where applicable) ----

user_role = postgresql.ENUM("super_admin", "client", name="user_role", create_type=False)
onboarding_status = postgresql.ENUM(
    "signed_up", "plan_selected", "mailbox_pending", "active", name="onboarding_status",
    create_type=False,
)
mailbox_provider = postgresql.ENUM("gmail", "outlook", "yahoo", "smtp", name="mailbox_provider", create_type=False)
warmup_status = postgresql.ENUM("pending", "active", "paused", "completed", name="warmup_status", create_type=False)
zai_content_mode = postgresql.ENUM("A", "B", "C", "D", name="zai_content_mode", create_type=False)
peer_provider = postgresql.ENUM("google_ws", "office365", "yahoo", name="peer_provider", create_type=False)
warmup_direction = postgresql.ENUM("outbound", "inbound", name="warmup_direction", create_type=False)
warmup_action = postgresql.ENUM(
    "sent", "opened", "replied", "starred", "spam_rescued", "marked_important",
    name="warmup_action", create_type=False,
)
payment_status = postgresql.ENUM(
    "pending", "succeeded", "failed", "refunded", name="payment_status", create_type=False,
)
notification_channel = postgresql.ENUM("email", "slack", "webhook", name="notification_channel", create_type=False)


_ENUM_DEFS = [
    ("user_role", ("super_admin", "client")),
    ("onboarding_status", ("signed_up", "plan_selected", "mailbox_pending", "active")),
    ("mailbox_provider", ("gmail", "outlook", "yahoo", "smtp")),
    ("warmup_status", ("pending", "active", "paused", "completed")),
    ("zai_content_mode", ("A", "B", "C", "D")),
    ("peer_provider", ("google_ws", "office365", "yahoo")),
    ("warmup_direction", ("outbound", "inbound")),
    ("warmup_action", ("sent", "opened", "replied", "starred", "spam_rescued", "marked_important")),
    ("payment_status", ("pending", "succeeded", "failed", "refunded")),
    ("notification_channel", ("email", "slack", "webhook")),
]


def _ensure_enums(bind) -> None:
    """Create enum types via idempotent DO block (CREATE TYPE lacks IF NOT EXISTS)."""
    for name, values in _ENUM_DEFS:
        vals_sql = ", ".join(f"'{v}'" for v in values)
        op.execute(
            f"DO $$ BEGIN CREATE TYPE {name} AS ENUM ({vals_sql}); "
            f"EXCEPTION WHEN duplicate_object THEN null; END $$;"
        )


def upgrade() -> None:
    bind = op.get_bind()
    # Create enum types once; the module-level enum objects have create_type=False
    # so SQLAlchemy won't try to re-create them per-column.
    _ensure_enums(bind)

    # ---- plans (referenced by users.plan_id and payments.plan_id) ----
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("price_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_mailboxes", sa.Integer, nullable=False, server_default="1"),
        sa.Column("daily_email_cap", sa.Integer, nullable=False, server_default="50"),
        sa.Column("token_cap_per_month", sa.Integer, nullable=False, server_default="30000"),
        sa.Column("capabilities", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ---- schedule_windows (referenced by mailboxes.schedule_window_id) ----
    op.create_table(
        "schedule_windows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("tz", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("weekday_mask", sa.Integer, nullable=False, server_default="31"),
        sa.Column("start_hour", sa.Integer, nullable=False, server_default="9"),
        sa.Column("end_hour", sa.Integer, nullable=False, server_default="17"),
    )
    op.create_index("ix_schedule_windows_workspace_id", "schedule_windows", ["workspace_id"])

    # ---- users ----
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="client"),
        sa.Column("onboarding_status", onboarding_status, nullable=False, server_default="signed_up"),
        sa.Column("totp_secret_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("totp_enabled", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_workspace_id", "users", ["workspace_id"])

    # ---- mailboxes ----
    op.create_table(
        "mailboxes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email_address", sa.String(320), nullable=False),
        sa.Column("provider", mailbox_provider, nullable=False),
        sa.Column("smtp_host", sa.String(255), nullable=True),
        sa.Column("smtp_port", sa.Integer, nullable=True),
        sa.Column("smtp_username", sa.String(255), nullable=True),
        sa.Column("smtp_password_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("imap_host", sa.String(255), nullable=True),
        sa.Column("imap_port", sa.Integer, nullable=True),
        sa.Column("oauth_token_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("spf_valid", sa.Boolean, nullable=True),
        sa.Column("dkim_valid", sa.Boolean, nullable=True),
        sa.Column("dmarc_valid", sa.Boolean, nullable=True),
        sa.Column("warmup_status", warmup_status, nullable=False, server_default="pending"),
        sa.Column("daily_target", sa.Integer, nullable=False, server_default="5"),
        sa.Column("current_day", sa.Integer, nullable=False, server_default="0"),
        sa.Column("warmth_score", sa.Float, nullable=False, server_default="0"),
        sa.Column("zai_content_mode", zai_content_mode, nullable=False, server_default="A"),
        sa.Column("schedule_window_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("schedule_windows.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_paused", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mailboxes_user_id", "mailboxes", ["user_id"])
    op.create_index("ix_mailboxes_workspace_id", "mailboxes", ["workspace_id"])

    # ---- peer_inboxes ----
    op.create_table(
        "peer_inboxes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email_address", sa.String(320), nullable=False, unique=True),
        sa.Column("provider", peer_provider, nullable=False),
        sa.Column("smtp_creds_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("imap_creds_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("reputation_score", sa.Float, nullable=False, server_default="0"),
        sa.Column("daily_capacity", sa.Integer, nullable=False, server_default="50"),
        sa.Column("used_today", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_peer_inboxes_active",
        "peer_inboxes",
        ["is_active"],
        postgresql_where=sa.text("is_active = true"),
    )

    # ---- peer_pools + peer_pool_members ----
    op.create_table(
        "peer_pools",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "peer_pool_members",
        sa.Column("peer_inbox_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("peer_inboxes.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("pool_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("peer_pools.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_peer_pool_members_pool_id", "peer_pool_members", ["pool_id"])

    # ---- client_pool_assignments ----
    op.create_table(
        "client_pool_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("pool_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("peer_pools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_client_pool_assignments_pool_id", "client_pool_assignments", ["pool_id"])

    # ---- warmup_logs ----
    op.create_table(
        "warmup_logs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("mailbox_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("peer_inbox_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("peer_inboxes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", warmup_direction, nullable=False),
        sa.Column("action", warmup_action, nullable=False),
        sa.Column("message_id", sa.String(255), nullable=True),
        sa.Column("subject_snippet", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_warmup_logs_mailbox_created",
        "warmup_logs",
        ["mailbox_id", sa.text("created_at DESC")],
    )

    # ---- warmup_threads ----
    op.create_table(
        "warmup_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("mailbox_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("peer_inbox_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("peer_inboxes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject", sa.String(512), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_action_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_warmup_threads_mailbox_last_action",
        "warmup_threads",
        ["mailbox_id", sa.text("last_action_at DESC")],
    )

    # ---- daily_metrics ----
    op.create_table(
        "daily_metrics",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("mailbox_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("emails_sent", sa.Integer, nullable=False, server_default="0"),
        sa.Column("emails_received", sa.Integer, nullable=False, server_default="0"),
        sa.Column("opens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("replies", sa.Integer, nullable=False, server_default="0"),
        sa.Column("spam_rescues", sa.Integer, nullable=False, server_default="0"),
        sa.Column("bounce_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("inbox_placement_pct", sa.Float, nullable=False, server_default="0"),
        sa.Column("warmth_score", sa.Float, nullable=False, server_default="0"),
        sa.UniqueConstraint("mailbox_id", "date", name="uq_daily_metrics_mailbox_date"),
    )
    op.create_index("ix_daily_metrics_mailbox_id", "daily_metrics", ["mailbox_id"])

    # ---- payments ----
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("status", payment_status, nullable=False, server_default="pending"),
        sa.Column("dummy_card_last4", sa.String(4), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_payments_user_created",
        "payments",
        ["user_id", sa.text("created_at DESC")],
    )

    # ---- team_members ----
    op.create_table(
        "team_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invited_email", sa.String(320), nullable=False),
        sa.Column("role_in_workspace", sa.String(64), nullable=False, server_default="member"),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_team_members_workspace_id", "team_members", ["workspace_id"])

    # ---- sub_clients ----
    op.create_table(
        "sub_clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("parent_workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("contact_email", sa.String(320), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sub_clients_parent_workspace_id", "sub_clients", ["parent_workspace_id"])

    # ---- audit_logs ----
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_role", sa.String(32), nullable=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("target_type", sa.String(64), nullable=True),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_audit_logs_actor_created",
        "audit_logs",
        ["actor_user_id", sa.text("created_at DESC")],
    )

    # ---- api_keys ----
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_api_keys_workspace_id", "api_keys", ["workspace_id"])
    op.create_index("ix_api_keys_prefix", "api_keys", ["prefix"])

    # ---- placement_tests ----
    op.create_table(
        "placement_tests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("mailbox_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seed_set", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("results", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_placement_tests_mailbox_id", "placement_tests", ["mailbox_id"])

    # ---- spam_scans ----
    op.create_table(
        "spam_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content_snippet", sa.Text, nullable=False),
        sa.Column("score", sa.Float, nullable=False, server_default="0"),
        sa.Column("triggers", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_spam_scans_user_id", "spam_scans", ["user_id"])

    # ---- scheduled_reports ----
    op.create_table(
        "scheduled_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("frequency", sa.String(32), nullable=False, server_default="weekly"),
        sa.Column("recipients", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_scheduled_reports_workspace_id", "scheduled_reports", ["workspace_id"])

    # ---- notification_settings ----
    op.create_table(
        "notification_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", notification_channel, nullable=False),
        sa.Column("target", sa.String(512), nullable=False),
        sa.Column("event_types", sa.JSON, nullable=False, server_default="[]"),
    )
    op.create_index("ix_notification_settings_user_id", "notification_settings", ["user_id"])

    # ---- email_templates ----
    op.create_table(
        "email_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("html", sa.Text, nullable=False),
        sa.Column("thumbnail", sa.String(1024), nullable=True),
        sa.Column("created_with_zai", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_email_templates_workspace_id", "email_templates", ["workspace_id"])

    # ---- zai_usage ----
    op.create_table(
        "zai_usage",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mailbox_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("mailboxes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("mode", zai_content_mode, nullable=False),
        sa.Column("prompt_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cost_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_zai_usage_user_created",
        "zai_usage",
        ["user_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    bind = op.get_bind()

    # Drop tables in reverse dependency order.
    for table in (
        "zai_usage",
        "email_templates",
        "notification_settings",
        "scheduled_reports",
        "spam_scans",
        "placement_tests",
        "api_keys",
        "audit_logs",
        "sub_clients",
        "team_members",
        "payments",
        "daily_metrics",
        "warmup_threads",
        "warmup_logs",
        "client_pool_assignments",
        "peer_pool_members",
        "peer_pools",
        "peer_inboxes",
        "mailboxes",
        "users",
        "schedule_windows",
        "plans",
    ):
        op.drop_table(table)

    for enum in (
        notification_channel, payment_status, warmup_action, warmup_direction,
        peer_provider, zai_content_mode, warmup_status, mailbox_provider,
        onboarding_status, user_role,
    ):
        enum.drop(bind, checkfirst=True)
