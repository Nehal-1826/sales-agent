"""domain_credentials + domain_reputation_snapshots — Pro Plus external signals.

Revision ID: 0017_domain_reputation
Revises: 0016_webhooks
Create Date: 2026-05-15

Adds the two tables backing the Pro Plus "External Signals" feature
(Google Postmaster Tools + Microsoft SNDS). Both providers share the same
storage shape so the UI can treat them uniformly.

``domain_credentials`` stores one row per ``(workspace, domain, provider)``
with the Fernet-encrypted credential (refresh token for Postmaster, access
key for SNDS) plus a denormalised ``last_pulled_at`` / ``last_status``
projection of the most recent ingest run.

``domain_reputation_snapshots`` stores one row per
``(workspace, domain, provider, date)``. The ingest tasks use INSERT … ON
CONFLICT to keep daily reruns idempotent.

``raw`` is JSONB so we can re-derive metrics later without re-pulling.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017_domain_reputation"
down_revision: str | None = "0016_webhooks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "domain_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("refresh_token_encrypted", sa.LargeBinary(), nullable=True),
        sa.Column("access_key_encrypted", sa.LargeBinary(), nullable=True),
        sa.Column("last_pulled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(64), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "domain",
            "provider",
            name="uq_domain_credentials_ws_domain_provider",
        ),
    )
    op.create_index(
        "ix_domain_credentials_workspace_id",
        "domain_credentials",
        ["workspace_id"],
    )

    op.create_table(
        "domain_reputation_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("spam_rate", sa.Numeric(8, 5), nullable=True),
        sa.Column("complaint_rate", sa.Numeric(8, 5), nullable=True),
        sa.Column("ip_reputation", sa.String(64), nullable=True),
        sa.Column("domain_reputation", sa.String(64), nullable=True),
        sa.Column("auth_pass_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column(
            "raw",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "domain",
            "provider",
            "date",
            name="uq_domain_reputation_snapshots_ws_dom_prov_date",
        ),
    )
    op.create_index(
        "ix_domain_reputation_snapshots_workspace_id",
        "domain_reputation_snapshots",
        ["workspace_id"],
    )
    op.create_index(
        "ix_domain_reputation_snapshots_domain_date",
        "domain_reputation_snapshots",
        ["domain", sa.text("date DESC")],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_domain_reputation_snapshots_domain_date",
        table_name="domain_reputation_snapshots",
    )
    op.drop_index(
        "ix_domain_reputation_snapshots_workspace_id",
        table_name="domain_reputation_snapshots",
    )
    op.drop_table("domain_reputation_snapshots")
    op.drop_index(
        "ix_domain_credentials_workspace_id",
        table_name="domain_credentials",
    )
    op.drop_table("domain_credentials")
