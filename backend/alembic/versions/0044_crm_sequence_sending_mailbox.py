"""crm_sequences.sending_mailbox_id — per-sequence sending mailbox

Revision ID: 0044_crm_seq_send_mbx
Revises: 0043_seed_julex_mail_addon
Create Date: 2026-09-11

Adds a nullable FK so a CRM sequence can pin the mailbox that sends its mail.
NULL (the default for every existing row) keeps the previous behaviour: the
tick auto-picks the workspace's oldest active SMTP-capable mailbox.
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0044_crm_seq_send_mbx"
down_revision: str | None = "0043_seed_julex_mail_addon"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "crm_sequences",
        sa.Column("sending_mailbox_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_crm_sequences_sending_mailbox",
        "crm_sequences",
        "mailboxes",
        ["sending_mailbox_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_crm_sequences_sending_mailbox", "crm_sequences", type_="foreignkey"
    )
    op.drop_column("crm_sequences", "sending_mailbox_id")
