"""Peer reply action — must send a real threaded SMTP reply, not a scaffold.

Before this, ``peer_actions._peer_reply_impl`` was a no-op that logged a
``replied`` row without sending anything, so warmup mail was never actually
replied to. These tests pin the real behavior:

* the peer sends via its *own* SMTP endpoint/creds (host/port from the blob,
  falling back to the provider default),
* the reply is threaded against the original outbound Message-Id
  (``<warmpulse-{warmup_id}@warmpulse.app>``) with a ``Re:`` subject,
* a ``WarmupLog(direction=inbound, action=replied)`` row is recorded.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.services.crypto import FernetService, get_fernet_service


@pytest.mark.asyncio
async def test_peer_reply_sends_threaded_smtp_and_records_log(monkeypatch) -> None:
    from app.db import models  # noqa: F401 — register all models
    from app.db.base import Base
    from app.db.models.mailboxes import ContentMode, Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.db.models.users import OnboardingStatus, User, UserRole
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
    from app.services.peer_inbox_service import _encrypt_creds
    from app.services.warmup import smtp_sender
    from app.tasks import peer_actions

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    # One consistent Fernet for both encrypt (via _encrypt_creds) and the
    # impl's decrypt — the impl resolves it through the real get_fernet_service.
    fernet = get_fernet_service()

    async with maker() as db:
        user = User(
            email="owner@example.com", hashed_password="x",
            role=UserRole.client, onboarding_status=OnboardingStatus.signed_up,
        )
        db.add(user)
        await db.flush()
        mb = Mailbox(
            user_id=user.id,
            workspace_id=user.workspace_id,
            email_address="client@example.com",
            provider=MailboxProvider.smtp,
            smtp_host="smtp.client.test",
            smtp_port=587,
            smtp_username="client@example.com",
            smtp_password_encrypted=fernet.encrypt(b"pw"),
            warmup_status=WarmupStatus.active,
            daily_target=50,
            current_day=5,
            content_mode=ContentMode.A,
        )
        peer = PeerInbox(
            email_address="peer@example.com",
            provider=PeerProvider.google_ws,
            smtp_creds_encrypted=_encrypt_creds(
                "peeruser", "peerpass", host="smtp.peer.test", port=2525
            ),
            imap_creds_encrypted=_encrypt_creds(
                "peeruser", "peerpass", host="imap.peer.test", port=993
            ),
            reputation_score=0.9,
            daily_capacity=50,
            is_active=True,
        )
        db.add_all([mb, peer])
        await db.commit()
        mb_id, peer_id = mb.id, peer.id

    warmup_id = str(uuid.uuid4())

    monkeypatch.setattr(peer_actions, "SessionLocal", maker)
    fake_send = AsyncMock(return_value={"message_id": "<x>", "smtp_response": "250 OK"})
    monkeypatch.setattr(smtp_sender, "send_peer_reply", fake_send)

    result = await peer_actions._peer_reply_impl(
        str(peer_id), str(mb_id), warmup_id, "Quick question", warmup_id
    )

    assert result["status"] == "replied"
    fake_send.assert_awaited_once()
    kwargs = fake_send.await_args.kwargs
    assert kwargs["from_addr"] == "peer@example.com"
    assert kwargs["to_addr"] == "client@example.com"
    assert kwargs["host"] == "smtp.peer.test"
    assert kwargs["port"] == 2525
    assert kwargs["username"] == "peeruser"
    assert kwargs["in_reply_to"] == f"<warmpulse-{warmup_id}@warmpulse.app>"
    assert kwargs["subject"].lower().startswith("re:")

    async with maker() as db:
        rows = (
            await db.scalars(
                select(WarmupLog).where(WarmupLog.mailbox_id == mb_id)
            )
        ).all()
        assert len(rows) == 1
        assert rows[0].direction == WarmupDirection.inbound
        assert rows[0].action == WarmupAction.replied
        assert rows[0].message_id == warmup_id

    await engine.dispose()


@pytest.mark.asyncio
async def test_peer_reply_skips_when_peer_has_no_smtp_creds(monkeypatch) -> None:
    """A peer without SMTP creds must skip cleanly (no crash, no send)."""
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.mailboxes import ContentMode, Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.db.models.users import OnboardingStatus, User, UserRole
    from app.services.warmup import smtp_sender
    from app.tasks import peer_actions

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    key = Fernet.generate_key()
    fernet = FernetService([key.decode()])

    async with maker() as db:
        user = User(
            email="o2@example.com", hashed_password="x",
            role=UserRole.client, onboarding_status=OnboardingStatus.signed_up,
        )
        db.add(user)
        await db.flush()
        mb = Mailbox(
            user_id=user.id, workspace_id=user.workspace_id,
            email_address="c2@example.com", provider=MailboxProvider.smtp,
            smtp_host="smtp.client.test", smtp_port=587,
            smtp_username="c2@example.com",
            smtp_password_encrypted=fernet.encrypt(b"pw"),
            warmup_status=WarmupStatus.active, daily_target=50,
            current_day=5, content_mode=ContentMode.A,
        )
        peer = PeerInbox(
            email_address="peer2@example.com", provider=PeerProvider.google_ws,
            smtp_creds_encrypted=None, imap_creds_encrypted=None,
            reputation_score=0.9, daily_capacity=50, is_active=True,
        )
        db.add_all([mb, peer])
        await db.commit()
        mb_id, peer_id = mb.id, peer.id

    monkeypatch.setattr(peer_actions, "SessionLocal", maker)
    monkeypatch.setattr(peer_actions, "get_fernet_service", lambda: fernet)
    fake_send = AsyncMock()
    monkeypatch.setattr(smtp_sender, "send_peer_reply", fake_send)

    result = await peer_actions._peer_reply_impl(
        str(peer_id), str(mb_id), str(uuid.uuid4()), "Subj", str(uuid.uuid4())
    )
    assert result["status"] == "no_smtp_creds"
    fake_send.assert_not_awaited()
    await engine.dispose()
