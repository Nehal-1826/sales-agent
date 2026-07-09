"""crm_campaigns + crm_leads + crm_lead_activities — CRM feature foundation

Revision ID: 0023_crm
Revises: 0022_user_avatar
Create Date: 2026-05-29

Adds the three tables backing the tier-gated CRM feature:
  - crm_campaigns:       one pipeline per workspace (status active/paused/archived).
  - crm_leads:           contacts inside a campaign (stage new→…→won/lost).
  - crm_lead_activities: append-only event timeline per lead.

Cross-dialect notes (this migration runs on Postgres in prod and SQLite in the
test harness):
  * UUID columns use ``postgresql.UUID(as_uuid=True).with_variant(String(36),
    "sqlite")`` — the same shape sibling migration 0018 uses.
  * Enum columns are native Postgres ENUMs (created once via an idempotent DO
    block since ``CREATE TYPE`` lacks ``IF NOT EXISTS``) and plain
    ``VARCHAR`` on SQLite — ``create_type=False`` keeps SQLAlchemy from trying
    to re-emit the type per-column.
  * ``tags`` is JSON; ``server_default`` is dialect-branched ('[]'::jsonb on
    Postgres, '[]' on SQLite).

Idempotent: an inspector pre-check skips the whole upgrade if ``crm_campaigns``
already exists so the migration can re-run cleanly.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023_crm"
down_revision: str | None = "0022_user_avatar"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_UUID = postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite")

_ENUM_DEFS = [
    ("crm_campaign_status", ("active", "paused", "archived")),
    ("crm_lead_stage", ("new", "contacted", "replied", "interested", "won", "lost")),
    (
        "crm_activity_kind",
        ("created", "note", "stage_change", "email_sent", "email_opened", "email_replied"),
    ),
]


def _enum(name: str) -> sa.types.TypeEngine:
    """Enum column type: native ENUM on Postgres, VARCHAR on SQLite.

    ``create_type`` is left at its default (True) so ``create_table`` emits the
    ``CREATE TYPE`` exactly once per enum — each of these three enums is used by
    a single table, so there is no double-creation. We do NOT pre-create the
    types via a separate DO block: that produced a second bare ``CREATE TYPE``
    (the ``create_type=False`` flag is dropped by ``with_variant``), which
    collided with the DO-block type and aborted the migration. Postgres DDL is
    transactional, so a mid-migration failure rolls the types back with the
    tables; the inspector guard in ``upgrade()`` keeps re-runs clean.
    """
    values = dict(_ENUM_DEFS)[name]
    return sa.Enum(*values, name=name).with_variant(sa.String(32), "sqlite")


def _json_default(dialect: str, empty: str) -> sa.sql.elements.TextClause:
    if dialect == "postgresql":
        return sa.text(f"'{empty}'::jsonb")
    return sa.text(f"'{empty}'")


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)
    if "crm_campaigns" in inspector.get_table_names():
        return

    json_type = (
        postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite")
        if dialect == "postgresql"
        else sa.JSON()
    )

    # ---- crm_campaigns --------------------------------------------------------
    op.create_table(
        "crm_campaigns",
        sa.Column("id", _UUID, primary_key=True),
        sa.Column("workspace_id", _UUID, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column(
            "status",
            _enum("crm_campaign_status"),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_crm_campaigns_workspace_id", "crm_campaigns", ["workspace_id"]
    )

    # ---- crm_leads ------------------------------------------------------------
    op.create_table(
        "crm_leads",
        sa.Column("id", _UUID, primary_key=True),
        sa.Column("workspace_id", _UUID, nullable=False),
        sa.Column(
            "campaign_id",
            _UUID,
            sa.ForeignKey("crm_campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("company", sa.String(200), nullable=True),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column(
            "stage",
            _enum("crm_lead_stage"),
            nullable=False,
            server_default="new",
        ),
        sa.Column("value_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("owner_email", sa.String(320), nullable=True),
        sa.Column("source", sa.String(120), nullable=True),
        sa.Column(
            "tags",
            json_type,
            nullable=False,
            server_default=_json_default(dialect, "[]"),
        ),
        sa.Column("notes", sa.String(4000), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_crm_leads_workspace_id", "crm_leads", ["workspace_id"])
    op.create_index("ix_crm_leads_campaign_id", "crm_leads", ["campaign_id"])
    op.create_index("ix_crm_leads_stage", "crm_leads", ["stage"])
    op.create_index(
        "ix_crm_leads_workspace_campaign",
        "crm_leads",
        ["workspace_id", "campaign_id"],
    )
    op.create_index(
        "ix_crm_leads_campaign_stage", "crm_leads", ["campaign_id", "stage"]
    )

    # ---- crm_lead_activities --------------------------------------------------
    op.create_table(
        "crm_lead_activities",
        sa.Column("id", _UUID, primary_key=True),
        sa.Column("workspace_id", _UUID, nullable=False),
        sa.Column(
            "lead_id",
            _UUID,
            sa.ForeignKey("crm_leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "kind",
            _enum("crm_activity_kind"),
            nullable=False,
            server_default="note",
        ),
        sa.Column("body", sa.String(2000), nullable=True),
        sa.Column("actor_email", sa.String(320), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_crm_lead_activities_workspace_id",
        "crm_lead_activities",
        ["workspace_id"],
    )
    op.create_index(
        "ix_crm_lead_activities_lead_id", "crm_lead_activities", ["lead_id"]
    )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)
    if "crm_campaigns" not in inspector.get_table_names():
        return

    op.drop_index(
        "ix_crm_lead_activities_lead_id", table_name="crm_lead_activities"
    )
    op.drop_index(
        "ix_crm_lead_activities_workspace_id", table_name="crm_lead_activities"
    )
    op.drop_table("crm_lead_activities")

    op.drop_index("ix_crm_leads_campaign_stage", table_name="crm_leads")
    op.drop_index("ix_crm_leads_workspace_campaign", table_name="crm_leads")
    op.drop_index("ix_crm_leads_stage", table_name="crm_leads")
    op.drop_index("ix_crm_leads_campaign_id", table_name="crm_leads")
    op.drop_index("ix_crm_leads_workspace_id", table_name="crm_leads")
    op.drop_table("crm_leads")

    op.drop_index("ix_crm_campaigns_workspace_id", table_name="crm_campaigns")
    op.drop_table("crm_campaigns")

    if dialect == "postgresql":
        for name, _values in _ENUM_DEFS:
            op.execute(f"DROP TYPE IF EXISTS {name}")
