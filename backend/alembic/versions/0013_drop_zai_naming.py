"""Rename Z.ai-branded schema objects to provider-neutral names.

Revision ID: 0013_drop_zai_naming
Revises: 0012_activate_pending_mailboxes
Create Date: 2026-05-11

The product is no longer pinned to Z.ai as an LLM provider — Gemini is the
default, Claude is the documented swap target, and the Z.ai integration has
been removed entirely. The DB still carries the legacy naming; this rename
pass aligns schema with code so nothing leaks the dropped vendor name.

Changes:
* ``mailboxes.zai_content_mode`` column -> ``content_mode``
* Enum type ``zai_content_mode`` -> ``content_mode``
* ``email_templates.created_with_zai`` -> ``created_with_llm``
* Table ``zai_usage`` -> ``llm_usage``; its supporting index renamed too

All changes are pure renames — no data loss, no nullability or default
changes.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0013_drop_zai_naming"
down_revision: str | None = "0012_activate_pending_mailboxes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.alter_column("mailboxes", "zai_content_mode", new_column_name="content_mode")
    op.alter_column(
        "email_templates", "created_with_zai", new_column_name="created_with_llm"
    )
    op.rename_table("zai_usage", "llm_usage")

    if is_pg:
        op.execute("ALTER TYPE zai_content_mode RENAME TO content_mode")
        op.execute("ALTER INDEX ix_zai_usage_user_created RENAME TO ix_llm_usage_user_created")
    else:
        # SQLite path (tests). Indexes are recreated by table-rebuild, but the
        # legacy index name may persist; drop + re-create defensively.
        try:
            op.drop_index("ix_zai_usage_user_created", table_name="llm_usage")
        except Exception:
            pass
        op.create_index(
            "ix_llm_usage_user_created",
            "llm_usage",
            ["user_id", "created_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        op.execute("ALTER INDEX ix_llm_usage_user_created RENAME TO ix_zai_usage_user_created")
        op.execute("ALTER TYPE content_mode RENAME TO zai_content_mode")
    else:
        try:
            op.drop_index("ix_llm_usage_user_created", table_name="llm_usage")
        except Exception:
            pass
        op.create_index(
            "ix_zai_usage_user_created",
            "llm_usage",
            ["user_id", "created_at"],
        )

    op.rename_table("llm_usage", "zai_usage")
    op.alter_column(
        "email_templates", "created_with_llm", new_column_name="created_with_zai"
    )
    op.alter_column("mailboxes", "content_mode", new_column_name="zai_content_mode")
