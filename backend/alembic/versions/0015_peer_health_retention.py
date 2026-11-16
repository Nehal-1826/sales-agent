"""peer_inboxes.reputation_score_updated_at + plans.capabilities.retention_days

Revision ID: 0015_peer_health_retention
Revises: 0014_workspace_settings
Create Date: 2026-05-15

Adds the sentinel column the new ``peer_health_check.tick`` beat task uses to
decide whether a peer has had enough data to be culled. Also augments the
seeded ``plans.capabilities`` JSON with a ``retention_days`` key so the new
``history_purge.tick`` beat task knows how far back each workspace's
``warmup_logs`` rows should live.

Defaults: free=1, starter=7, pro=90, pro_plus=90, agency=365, enterprise=365.
"""
from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_peer_health_retention"
down_revision: str | None = "0014_workspace_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_RETENTION_DEFAULTS: dict[str, int] = {
    "free": 1,
    "starter": 7,
    "pro": 90,
    "pro_plus": 90,
    "agency": 365,
    "enterprise": 365,
}


def _plan_lookup_key(name: str) -> str:
    """Case-insensitive normaliser matching the seed names to spec keys."""
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def upgrade() -> None:
    # 1) New nullable timestamp on peer_inboxes.
    op.add_column(
        "peer_inboxes",
        sa.Column(
            "reputation_score_updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # 2) Patch existing plans.capabilities JSON to include retention_days.
    # We read-modify-write each row so this works on both Postgres (JSON column)
    # and SQLite (TEXT-stored JSON). Match how 0002_seed_plans wrote it.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, name, capabilities FROM plans")
    ).fetchall()

    for row in rows:
        plan_id, name, capabilities = row[0], row[1], row[2]
        if capabilities is None:
            caps: dict = {}
        elif isinstance(capabilities, str):
            try:
                caps = json.loads(capabilities)
            except (TypeError, ValueError):
                caps = {}
        elif isinstance(capabilities, dict):
            caps = dict(capabilities)
        else:
            caps = {}

        if "retention_days" in caps and isinstance(caps["retention_days"], int):
            # Don't stomp values an admin may have already customised.
            continue

        key = _plan_lookup_key(name or "")
        retention = _RETENTION_DEFAULTS.get(key, 90)
        caps["retention_days"] = retention

        new_caps = json.dumps(caps)
        dialect = bind.dialect.name
        if dialect == "postgresql":
            stmt = sa.text(
                "UPDATE plans SET capabilities = CAST(:caps AS JSON) WHERE id = :id"
            )
        else:
            stmt = sa.text("UPDATE plans SET capabilities = :caps WHERE id = :id")
        bind.execute(stmt, {"caps": new_caps, "id": plan_id})


def downgrade() -> None:
    op.drop_column("peer_inboxes", "reputation_score_updated_at")

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, capabilities FROM plans")).fetchall()
    for row in rows:
        plan_id, capabilities = row[0], row[1]
        if capabilities is None:
            continue
        if isinstance(capabilities, str):
            try:
                caps = json.loads(capabilities)
            except (TypeError, ValueError):
                continue
        elif isinstance(capabilities, dict):
            caps = dict(capabilities)
        else:
            continue
        caps.pop("retention_days", None)
        new_caps = json.dumps(caps)
        dialect = bind.dialect.name
        if dialect == "postgresql":
            stmt = sa.text(
                "UPDATE plans SET capabilities = CAST(:caps AS JSON) WHERE id = :id"
            )
        else:
            stmt = sa.text("UPDATE plans SET capabilities = :caps WHERE id = :id")
        bind.execute(stmt, {"caps": new_caps, "id": plan_id})
