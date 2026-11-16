"""crm_sequences + crm_sequence_steps + crm_sequence_enrollments — sequence engine

Revision ID: 0024_crm_sequences
Revises: 0023_crm
Create Date: 2026-05-30

Adds the three tables backing the email-sequence automation feature:
  - crm_sequences:             an ordered follow-up sequence on a campaign.
  - crm_sequence_steps:        the ordered steps (subject/body + delay_days).
  - crm_sequence_enrollments:  a lead's progress through a sequence.

Cross-dialect notes (this migration runs on Postgres in prod and SQLite in the
test harness) mirror sibling migration 0023:
  * UUID columns use ``postgresql.UUID(as_uuid=True).with_variant(String(36),
    "sqlite")``.
  * Enum columns are native Postgres ENUMs created ONCE by ``create_table``
    (``create_type`` left at its default True) — each enum is used by exactly
    one table, so there is no double-creation, and we deliberately do NOT
    pre-create the types via a DO block (that emits a second bare ``CREATE
    TYPE`` which collides and aborts the migration, since ``CREATE TYPE`` has
    no ``IF NOT EXISTS``). Postgres DDL is transactional, so a mid-migration
    failure rolls the types back with the tables; the inspector guard keeps
    re-runs clean.

Idempotent: an inspector pre-check skips the whole upgrade if ``crm_sequences``
already exists so the migration can re-run cleanly.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0024_crm_sequences"
down_revision: str | None = "0023_crm"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_UUID = postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite")

_ENUM_DEFS = [
    ("crm_sequence_status", ("active", "paused", "archived")),
    ("crm_enrollment_status", ("active", "completed", "stopped")),
]


def _enum(name: str) -> sa.types.TypeEngine:
    """Enum column type: native ENUM on Postgres, VARCHAR on SQLite.

    ``create_type`` stays at its default (True) so ``create_table`` emits the
    ``CREATE TYPE`` exactly once per enum — each enum here is used by a single
    table. No DO-block pre-creation (see module docstring).
    """
    values = dict(_ENUM_DEFS)[name]
    return sa.Enum(*values, name=name).with_variant(sa.String(32), "sqlite")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "crm_sequences" in inspector.get_table_names():
        return

    # ---- crm_sequences --------------------------------------------------------
    op.create_table(
        "crm_sequences",
        sa.Column("id", _UUID, primary_key=True),
        sa.Column("workspace_id", _UUID, nullable=False),
        sa.Column(
            "campaign_id",
            _UUID,
            sa.ForeignKey("crm_campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "status",
            _enum("crm_sequence_status"),
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
        "ix_crm_sequences_workspace_id", "crm_sequences", ["workspace_id"]
    )
    op.create_index(
        "ix_crm_sequences_campaign_id", "crm_sequences", ["campaign_id"]
    )

    # ---- crm_sequence_steps ---------------------------------------------------
    op.create_table(
        "crm_sequence_steps",
        sa.Column("id", _UUID, primary_key=True),
        sa.Column("workspace_id", _UUID, nullable=False),
        sa.Column(
            "sequence_id",
            _UUID,
            sa.ForeignKey("crm_sequences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("delay_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("body", sa.String(4000), nullable=False),
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
        "ix_crm_sequence_steps_workspace_id",
        "crm_sequence_steps",
        ["workspace_id"],
    )
    op.create_index(
        "ix_crm_sequence_steps_sequence_id",
        "crm_sequence_steps",
        ["sequence_id"],
    )
    op.create_index(
        "ix_crm_sequence_steps_sequence_order",
        "crm_sequence_steps",
        ["sequence_id", "step_order"],
    )

    # ---- crm_sequence_enrollments ---------------------------------------------
    op.create_table(
        "crm_sequence_enrollments",
        sa.Column("id", _UUID, primary_key=True),
        sa.Column("workspace_id", _UUID, nullable=False),
        sa.Column(
            "sequence_id",
            _UUID,
            sa.ForeignKey("crm_sequences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "lead_id",
            _UUID,
            sa.ForeignKey("crm_leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("current_step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            _enum("crm_enrollment_status"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("next_send_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "enrolled_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_crm_sequence_enrollments_workspace_id",
        "crm_sequence_enrollments",
        ["workspace_id"],
    )
    op.create_index(
        "ix_crm_sequence_enrollments_sequence_id",
        "crm_sequence_enrollments",
        ["sequence_id"],
    )
    op.create_index(
        "ix_crm_sequence_enrollments_lead_id",
        "crm_sequence_enrollments",
        ["lead_id"],
    )
    op.create_index(
        "ix_crm_sequence_enrollments_status",
        "crm_sequence_enrollments",
        ["status"],
    )
    op.create_index(
        "ix_crm_seq_enrollments_status_next",
        "crm_sequence_enrollments",
        ["status", "next_send_at"],
    )
    op.create_index(
        "ix_crm_seq_enrollments_sequence_lead",
        "crm_sequence_enrollments",
        ["sequence_id", "lead_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)
    if "crm_sequences" not in inspector.get_table_names():
        return

    op.drop_index(
        "ix_crm_seq_enrollments_sequence_lead",
        table_name="crm_sequence_enrollments",
    )
    op.drop_index(
        "ix_crm_seq_enrollments_status_next",
        table_name="crm_sequence_enrollments",
    )
    op.drop_index(
        "ix_crm_sequence_enrollments_status",
        table_name="crm_sequence_enrollments",
    )
    op.drop_index(
        "ix_crm_sequence_enrollments_lead_id",
        table_name="crm_sequence_enrollments",
    )
    op.drop_index(
        "ix_crm_sequence_enrollments_sequence_id",
        table_name="crm_sequence_enrollments",
    )
    op.drop_index(
        "ix_crm_sequence_enrollments_workspace_id",
        table_name="crm_sequence_enrollments",
    )
    op.drop_table("crm_sequence_enrollments")

    op.drop_index(
        "ix_crm_sequence_steps_sequence_order", table_name="crm_sequence_steps"
    )
    op.drop_index(
        "ix_crm_sequence_steps_sequence_id", table_name="crm_sequence_steps"
    )
    op.drop_index(
        "ix_crm_sequence_steps_workspace_id", table_name="crm_sequence_steps"
    )
    op.drop_table("crm_sequence_steps")

    op.drop_index("ix_crm_sequences_campaign_id", table_name="crm_sequences")
    op.drop_index("ix_crm_sequences_workspace_id", table_name="crm_sequences")
    op.drop_table("crm_sequences")

    if dialect == "postgresql":
        for name, _values in _ENUM_DEFS:
            op.execute(f"DROP TYPE IF EXISTS {name}")
