"""users.avatar_image + avatar_mime columns

Revision ID: 0022_user_avatar
Revises: 0021_seed_pro_plus_plan
Create Date: 2026-05-17

Adds a profile-picture store directly on the users table — raw bytes plus a
MIME string. We follow the same "binary lives in a LargeBinary column"
pattern already used for ``users.totp_secret_encrypted`` rather than
introducing object storage. Avatars are NOT Fernet-encrypted (an avatar is
not a secret); the upload endpoint caps size at ~512KB and restricts the
MIME type to png/jpeg/webp.

Idempotent: a pre-check against the live column list lets the migration
re-run cleanly. LargeBinary maps to BYTEA on Postgres and BLOB on SQLite
(the test harness), so no dialect branching is needed.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_user_avatar"
down_revision: str | None = "0021_seed_pro_plus_plan"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _existing_columns() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns("users")}


def upgrade() -> None:
    cols = _existing_columns()
    if "avatar_image" not in cols:
        op.add_column(
            "users",
            sa.Column("avatar_image", sa.LargeBinary(), nullable=True),
        )
    if "avatar_mime" not in cols:
        op.add_column(
            "users",
            sa.Column("avatar_mime", sa.String(64), nullable=True),
        )


def downgrade() -> None:
    cols = _existing_columns()
    if "avatar_mime" in cols:
        op.drop_column("users", "avatar_mime")
    if "avatar_image" in cols:
        op.drop_column("users", "avatar_image")
