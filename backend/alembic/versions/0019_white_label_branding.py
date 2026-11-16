"""workspace_branding — Agency white-label branding overrides.

Revision ID: 0019_white_label_branding
Revises: 0018_placement_tester
Create Date: 2026-05-15
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019_white_label_branding"
down_revision: str | None = "0018_placement_tester"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspace_branding",
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
        sa.Column(
            "parent_workspace_id",
            postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite"),
            nullable=True,
        ),
        sa.Column("brand_name", sa.String(120), nullable=True),
        sa.Column("logo_blob", sa.LargeBinary(), nullable=True),
        sa.Column("logo_mime", sa.String(50), nullable=True),
        sa.Column("accent_color", sa.String(7), nullable=True),
        sa.Column("footer_text", sa.String(500), nullable=True),
        sa.Column("email_footer_text", sa.String(500), nullable=True),
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
        "ix_workspace_branding_workspace_id",
        "workspace_branding",
        ["workspace_id"],
        unique=True,
    )
    op.create_index(
        "ix_workspace_branding_parent_workspace_id",
        "workspace_branding",
        ["parent_workspace_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_workspace_branding_parent_workspace_id",
        table_name="workspace_branding",
    )
    op.drop_index(
        "ix_workspace_branding_workspace_id",
        table_name="workspace_branding",
    )
    op.drop_table("workspace_branding")
