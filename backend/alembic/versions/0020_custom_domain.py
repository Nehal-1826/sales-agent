"""workspace_custom_domains — Agency tier custom-domain registry.

Revision ID: 0020_custom_domain
Revises: 0019_white_label_branding
Create Date: 2026-05-15
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020_custom_domain"
down_revision: str | None = "0019_white_label_branding"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspace_custom_domains",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite"),
            primary_key=True,
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite"),
            nullable=False,
        ),
        sa.Column("domain", sa.String(253), nullable=False),
        sa.Column("verification_code", sa.String(32), nullable=False),
        sa.Column("verification_method", sa.String(10), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("last_check_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_check_error", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_workspace_custom_domains_workspace_id",
        "workspace_custom_domains",
        ["workspace_id"],
        unique=True,
    )
    op.create_index(
        "ix_workspace_custom_domains_domain",
        "workspace_custom_domains",
        ["domain"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_workspace_custom_domains_domain",
        table_name="workspace_custom_domains",
    )
    op.drop_index(
        "ix_workspace_custom_domains_workspace_id",
        table_name="workspace_custom_domains",
    )
    op.drop_table("workspace_custom_domains")
