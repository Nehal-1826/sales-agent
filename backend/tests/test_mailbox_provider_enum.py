"""DB vs response-schema mailbox provider enums.

``MailboxProvider`` (DB) carries ``self_hosted`` — migration 0044 — but the
``MailboxOut`` response enum historically did not, so any row saved with
that provider 500'd the mailboxes list route at serialization. These tests
pin the fix: the response enum must accept every DB enum value.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.db.models.mailboxes import (
    ContentMode,
    Mailbox,
    MailboxProvider,
    WarmupStatus,
)


def test_self_hosted_provider_exists():
    assert MailboxProvider.self_hosted.value == "self_hosted"


def test_self_hosted_is_distinct_from_smtp():
    assert MailboxProvider.self_hosted != MailboxProvider.smtp


def test_response_enum_covers_every_db_provider_value():
    """MailboxOut.provider must accept the full DB enum — a gap means a 500
    on the list route for rows saved with the missing value."""
    from app.schemas.mailboxes import MailboxProviderEnum

    schema_values = {member.value for member in MailboxProviderEnum}
    db_values = {member.value for member in MailboxProvider}
    assert db_values <= schema_values, (
        f"MailboxOut provider enum is missing: {db_values - schema_values}"
    )


def test_self_hosted_mailbox_serializes_through_mailbox_service():
    """Regression (C5): a saved self_hosted mailbox round-trips its provider
    through the real projection used by every mailboxes route."""
    from app.services.mailbox_service import mailbox_to_out

    mbx = Mailbox(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        email_address="root@mail.shailog.dev",
        provider=MailboxProvider.self_hosted,
        warmup_status=WarmupStatus.active,
        daily_target=20,
        current_day=10,
        warmth_score=55.0,
        content_mode=ContentMode.A,
        is_paused=False,
        created_at=datetime.now(UTC),
    )
    out = mailbox_to_out(mbx)  # ValidationError before the enum fix
    assert out.provider.value == "self_hosted"
    assert out.model_dump()["provider"] == "self_hosted"
