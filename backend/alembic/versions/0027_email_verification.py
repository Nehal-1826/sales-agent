"""email verification — add email_verified + token columns to users

Revision ID: 0027_email_verification
Revises: 0026_razorpay
Create Date: 2026-06-06

Adds three columns to ``users``:
  * ``email_verified`` — bool, default False for new rows, True for existing rows
    (we don't want to lock out existing users on deploy).
  * ``email_verification_token`` — nullable VARCHAR(64), the URL-safe token
    mailed to the user.
  * ``email_verification_sent_at`` — nullable TIMESTAMPTZ, used to rate-limit
    resend requests and check token expiry (24h window).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0027_email_verification"
down_revision: str | None = "0026_razorpay"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),  # existing users auto-verified
        ),
    )
    op.add_column(
        "users",
        sa.Column("email_verification_token", sa.String(64), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "email_verification_sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    # New signups start unverified — override the server_default to False
    # via application code; the default stays True so existing rows stay open.


def downgrade() -> None:
    op.drop_column("users", "email_verification_sent_at")
    op.drop_column("users", "email_verification_token")
    op.drop_column("users", "email_verified")
