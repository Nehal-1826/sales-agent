"""add self_hosted to mailboxprovider enum

Revision ID: 0042_self_hosted_provider
Revises: 0039_device_tokens
"""
from alembic import op

revision = "0042_self_hosted_provider"
down_revision = "0039_device_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    op.execute("COMMIT")
    op.execute("ALTER TYPE mailboxprovider ADD VALUE IF NOT EXISTS 'self_hosted'")


def downgrade() -> None:
    # PostgreSQL cannot drop a value from an enum type. Removing it would
    # require recreating the type and rewriting every dependent column, which
    # is not worth it for an additive value. Intentional no-op.
    pass
