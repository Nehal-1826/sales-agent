"""add self_hosted to mailboxprovider enum

Revision ID: 0044_self_hosted_provider
Revises: 0043_seed_julex_mail_addon
"""
from alembic import op

revision = "0044_self_hosted_provider"
down_revision = "0043_seed_julex_mail_addon"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    op.execute("COMMIT")
    op.execute("ALTER TYPE mailbox_provider ADD VALUE IF NOT EXISTS 'self_hosted'")


def downgrade() -> None:
    # PostgreSQL cannot drop a value from an enum type. Removing it would
    # require recreating the type and rewriting every dependent column, which
    # is not worth it for an additive value. Intentional no-op.
    pass
