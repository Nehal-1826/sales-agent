"""Tests for OAuth (XOAUTH2) warmup sending.

Covers:
  - ``oauth_token.google_access_token`` refresh-token exchange (network mocked).
  - ``smtp_sender.send_email`` OAuth-mode auth selection (network mocked via a
    fake ``_deliver``).
  - the password path regression (still uses ``smtp.login``).
  - ``peer_pool_service.list_routing_mailboxes`` reporting ``can_send`` for an
    OAuth-only gmail mailbox.
"""
from __future__ import annotations

import uuid

import pytest

from app.services.crypto import get_fernet_service


# --------------------------------------------------------------------------- #
# google_access_token                                                          #
# --------------------------------------------------------------------------- #


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    """Records the POST and returns a canned response. Mimics httpx.AsyncClient."""

    last_kwargs: dict | None = None

    def __init__(self, response: _FakeResponse) -> None:
        self._response = response

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, **kwargs):
        type(self).last_kwargs = {"url": url, **kwargs}
        return self._response


@pytest.mark.asyncio
async def test_google_access_token_success(monkeypatch) -> None:
    from app.services.warmup import oauth_token

    fake = _FakeAsyncClient(_FakeResponse(200, {"access_token": "ya29.x"}))
    monkeypatch.setattr(oauth_token.httpx, "AsyncClient", fake)

    class _S:
        google_client_id = "cid"
        google_client_secret = "csecret"

    token = await oauth_token.google_access_token("refresh-secret", settings=_S())
    assert token == "ya29.x"
    # The refresh token must be sent as form data, never logged/leaked elsewhere.
    assert _FakeAsyncClient.last_kwargs["data"]["refresh_token"] == "refresh-secret"
    assert _FakeAsyncClient.last_kwargs["data"]["grant_type"] == "refresh_token"


@pytest.mark.asyncio
async def test_google_access_token_invalid_grant_raises(monkeypatch) -> None:
    from app.services.warmup import oauth_token

    fake = _FakeAsyncClient(
        _FakeResponse(400, {"error": "invalid_grant", "error_description": "bad"})
    )
    monkeypatch.setattr(oauth_token.httpx, "AsyncClient", fake)

    class _S:
        google_client_id = "cid"
        google_client_secret = "csecret"

    with pytest.raises(RuntimeError) as exc:
        await oauth_token.google_access_token("super-secret-refresh", settings=_S())
    msg = str(exc.value)
    assert "invalid_grant" in msg
    assert "super-secret-refresh" not in msg


# --------------------------------------------------------------------------- #
# send_email auth-mode selection                                               #
# --------------------------------------------------------------------------- #


class _FakeMailbox:
    def __init__(self, **kw) -> None:
        for k, v in kw.items():
            setattr(self, k, v)


class _FakePeer:
    email_address = "peer@warmpulse.io"


@pytest.mark.asyncio
async def test_send_email_oauth_gmail_uses_gmail_api(monkeypatch) -> None:
    """OAuth Gmail sends via the Gmail REST API (gmail.send scope), not SMTP."""
    from app.db.models.mailboxes import MailboxProvider
    from app.services.warmup import smtp_sender

    fernet = get_fernet_service()
    mailbox = _FakeMailbox(
        smtp_password_encrypted=None,
        oauth_token_encrypted=fernet.encrypt(b"refresh"),
        provider=MailboxProvider.gmail,
        smtp_host=None,
        smtp_port=None,
        smtp_username=None,
        email_address="x@gmail.com",
    )

    recorded: dict = {}

    async def _fail_deliver(msg, **kwargs):  # must NOT be used for OAuth gmail
        raise AssertionError("SMTP _deliver must not be called for OAuth Gmail")

    monkeypatch.setattr(smtp_sender, "_deliver", _fail_deliver)

    async def _fake_token(refresh_token, *, settings):
        return "ya29.test"

    monkeypatch.setattr(smtp_sender, "google_access_token", _fake_token)

    async def _fake_api_send(access_token, raw_message):
        recorded["access_token"] = access_token
        recorded["raw"] = raw_message
        return "gmail-msg-id-123"

    monkeypatch.setattr(smtp_sender, "gmail_api_send", _fake_api_send)

    result = await smtp_sender.send_email(
        mailbox, _FakePeer(), "subj", "body", False, fernet, warmup_id="w1"
    )

    assert recorded["access_token"] == "ya29.test"
    assert isinstance(recorded["raw"], (bytes, bytearray)) and recorded["raw"]
    assert result["smtp_response"] == "gmail-api:gmail-msg-id-123"
    # The RFC Message-Id header (embeds warmup_id) is preserved for peer-side
    # IMAP correlation — Gmail keeps the header we set.
    assert result["message_id"] == "<warmpulse-w1@warmpulse.app>"


@pytest.mark.asyncio
async def test_send_email_password_path_regression(monkeypatch) -> None:
    from app.db.models.mailboxes import MailboxProvider
    from app.services.warmup import smtp_sender

    fernet = get_fernet_service()
    mailbox = _FakeMailbox(
        smtp_password_encrypted=fernet.encrypt(b"hunter2"),
        oauth_token_encrypted=None,
        provider=MailboxProvider.smtp,
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="user@example.com",
        email_address="user@example.com",
    )

    recorded: dict = {}

    async def _fake_deliver(msg, **kwargs):
        recorded.update(kwargs)
        return {"message_id": "<id>", "sent_at": None, "smtp_response": "ok"}

    monkeypatch.setattr(smtp_sender, "_deliver", _fake_deliver)

    await smtp_sender.send_email(
        mailbox, _FakePeer(), "subj", "body", False, fernet
    )

    assert recorded["password"] == "hunter2"
    assert recorded.get("xoauth2_token") is None
    assert recorded["host"] == "smtp.example.com"


@pytest.mark.asyncio
async def test_send_email_no_credentials_raises(monkeypatch) -> None:
    from app.db.models.mailboxes import MailboxProvider
    from app.services.warmup import smtp_sender

    fernet = get_fernet_service()
    mailbox = _FakeMailbox(
        smtp_password_encrypted=None,
        oauth_token_encrypted=None,
        provider=MailboxProvider.smtp,
        smtp_host=None,
        smtp_port=None,
        smtp_username=None,
        email_address="x@example.com",
    )
    with pytest.raises(RuntimeError, match="no usable SMTP credentials"):
        await smtp_sender.send_email(
            mailbox, _FakePeer(), "subj", "body", False, fernet
        )


# --------------------------------------------------------------------------- #
# list_routing_mailboxes — OAuth gmail can_send                                #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_routing_oauth_gmail_can_send() -> None:
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )
    from sqlalchemy.pool import StaticPool

    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.mailboxes import (
        ContentMode,
        Mailbox,
        MailboxProvider,
        WarmupStatus,
    )
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.peer_pools import PeerPool, PeerPoolMember
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.warmup_logs import WarmupLog
    from app.services import peer_pool_service

    # Dedupe indexes the SQLite harness can't tolerate (shared with test_peer_pools).
    seen: set[str] = set()
    for table in Base.metadata.tables.values():
        for idx in list(table.indexes):
            if idx.name in seen:
                table.indexes.discard(idx)
            else:
                seen.add(idx.name)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [
        t.__table__
        for t in (
            User,
            Plan,
            Mailbox,
            PeerInbox,
            PeerPool,
            PeerPoolMember,
            ClientPoolAssignment,
            AuditLog,
            WarmupLog,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )

    workspace_id = uuid.uuid4()
    async with maker() as session:
        session.add(PeerPool(name="default", is_default=True))
        session.add(
            Mailbox(
                user_id=uuid.uuid4(),
                workspace_id=workspace_id,
                email_address="oauth@gmail.com",
                provider=MailboxProvider.gmail,
                oauth_token_encrypted=b"token",
                warmup_status=WarmupStatus.active,
                daily_target=50,
                content_mode=ContentMode.A,
            )
        )
        await session.commit()

    async with maker() as session:
        rows = await peer_pool_service.list_routing_mailboxes(session)

    row = next(r for r in rows if r["email"] == "oauth@gmail.com")
    assert row["can_send"] is True
    assert row["is_oauth"] is True

    await engine.dispose()
