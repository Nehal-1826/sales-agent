"""Tests for the Admin Mail Viewer (super_admin IMAP look-into).

Harness mirrors ``test_peer_contamination`` — in-memory SQLite + StaticPool +
``get_db`` override at the app level. The IMAP layer is faked by monkey-
patching ``aioimaplib.IMAP4_SSL`` in the service module with a canned client
that speaks just the subset the service uses (hello/login/list/examine/
search/fetch/uid-fetch/logout). Literal payloads are returned as
``bytearray`` and protocol lines as ``bytes`` — exactly how the real
aioimaplib ``Response.lines`` mixes types (see imap_watcher's bytearray
note), which is what the service's FETCH parser keys on.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# --------------------------------------------------------------------------- #
# Harness                                                                     #
# --------------------------------------------------------------------------- #


def _dedupe_metadata_indexes(base: object) -> None:
    seen: set[str] = set()
    for table in base.metadata.tables.values():
        to_remove = []
        for idx in list(table.indexes):
            if idx.name in seen:
                to_remove.append(idx)
            else:
                seen.add(idx.name)
        for idx in to_remove:
            table.indexes.discard(idx)


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db import models  # noqa: F401 — register all models
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.peer_pools import PeerPool, PeerPoolMember
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (User, Mailbox, PeerInbox, PeerPool, PeerPoolMember, AuditLog)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> AsyncIterator[tuple[object, async_sessionmaker[AsyncSession], object]]:
    maker, engine = await _setup_db()
    from app.db.session import get_db
    from app.main import create_app

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield app, maker, engine
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Factories                                                                   #
# --------------------------------------------------------------------------- #


async def _make_admin(maker: async_sessionmaker[AsyncSession]) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=f"admin-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.super_admin,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


async def _make_client(maker: async_sessionmaker[AsyncSession]) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email="client-owner@example.com",
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


async def _make_mailbox(
    maker: async_sessionmaker[AsyncSession],
    user: object,
    *,
    email: str,
    provider: str = "smtp",
    imap_host: str | None = "imap.example.com",
    with_password: bool = True,
) -> uuid.UUID:
    from app.db.models.mailboxes import (
        ContentMode,
        Mailbox,
        MailboxProvider,
        WarmupStatus,
    )
    from app.services.crypto import get_fernet_service

    async with maker() as session:
        mbx = Mailbox(
            user_id=user.id,
            workspace_id=user.workspace_id,
            email_address=email,
            provider=MailboxProvider(provider),
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username=email,
            smtp_password_encrypted=(
                get_fernet_service().encrypt(b"pw-secret-123") if with_password else None
            ),
            imap_host=imap_host,
            imap_port=993 if imap_host else None,
            warmup_status=WarmupStatus.active,
            daily_target=5,
            current_day=0,
            warmth_score=0.0,
            content_mode=ContentMode.A,
        )
        session.add(mbx)
        await session.commit()
        await session.refresh(mbx)
        return mbx.id


async def _make_peer(
    maker: async_sessionmaker[AsyncSession],
    *,
    email: str,
    with_imap_creds: bool = True,
) -> uuid.UUID:
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.services.crypto import get_fernet_service

    async with maker() as session:
        blob = None
        if with_imap_creds:
            blob = get_fernet_service().encrypt(
                json.dumps(
                    {
                        "host": "imap.peer.example.com",
                        "port": 993,
                        "username": email,
                        "password": "peer-imap-pw",
                    }
                ).encode()
            )
        peer = PeerInbox(
            email_address=email,
            provider=PeerProvider.google_ws,
            smtp_creds_encrypted=b"x",
            imap_creds_encrypted=blob,
            reputation_score=1.0,
            daily_capacity=50,
            used_today=0,
            is_active=True,
        )
        session.add(peer)
        await session.commit()
        await session.refresh(peer)
        return peer.id


def _auth_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Fake IMAP client                                                            #
# --------------------------------------------------------------------------- #


class _Resp:
    def __init__(self, result: str = "OK", lines: list | None = None) -> None:
        self.result = result
        self.lines = lines or []


class FakeImapClient:
    """Canned aioimaplib.IMAP4_SSL — literal payloads as bytearray."""

    def __init__(self, *, folders: list[str] | None = None, messages: dict | None):
        self.folders = folders or ["INBOX", "Sent"]
        # seq (1-based, ascending = oldest first) -> message dict
        self.messages: dict[int, dict] = messages or {}
        self.examine_calls: list[str] = []
        self.login_args: tuple[str, str] | None = None
        self.logged_out = False

    async def wait_hello_from_server(self) -> None:
        return None

    async def login(self, username: str, password: str) -> _Resp:
        self.login_args = (username, password)
        return _Resp()

    async def list(self, reference: str, pattern: str) -> _Resp:
        lines = [f'(\\HasNoChildren) "/" "{name}"'.encode() for name in self.folders]
        return _Resp(lines=lines)

    async def examine(self, folder: str) -> _Resp:
        self.examine_calls.append(folder)
        if folder in self.folders:
            return _Resp()
        return _Resp(result="NO")

    async def search(self, *criteria: str, charset: str | None = None) -> _Resp:
        nums = " ".join(str(i) for i in sorted(self.messages))
        return _Resp(lines=[nums.encode()])

    async def fetch(self, message_set: str, message_parts: str) -> _Resp:
        lines: list = []
        for seq_str in message_set.split(","):
            seq = int(seq_str)
            msg = self.messages[seq]
            headers, text = msg["headers"], msg["text"]
            lines.append(
                f"* {seq} FETCH (UID {msg['uid']} "
                f"BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID)] "
                f"{{{len(headers)}}}".encode()
            )
            lines.append(bytearray(headers))
            lines.append(f" BODY[TEXT]<0> {{{len(text)}}}".encode())
            lines.append(bytearray(text))
            lines.append(b")")
        return _Resp(lines=lines)

    async def uid(self, command: str, *criteria: str) -> _Resp:
        if command.lower() != "fetch":
            raise AssertionError(f"unexpected UID command {command!r}")
        uid = criteria[0]
        for seq, msg in self.messages.items():
            if str(msg["uid"]) == str(uid):
                full = msg["full"]
                lines = [
                    f"* {seq} FETCH (UID {uid} BODY[] {{{len(full)}}}".encode(),
                    bytearray(full),
                    b")",
                ]
                return _Resp(lines=lines)
        return _Resp(lines=[])

    async def logout(self) -> _Resp:
        self.logged_out = True
        return _Resp()


def _install_fake_imap(monkeypatch, client: FakeImapClient) -> FakeImapClient:
    from app.services import admin_mail_viewer as amv

    def _factory(**kwargs):
        return client

    monkeypatch.setattr(amv.aioimaplib, "IMAP4_SSL", _factory)
    return client


def _canned_messages() -> dict[int, dict]:
    """Two messages: seq 1 older, seq 2 newer (IMAP sequence numbers ascend)."""
    headers_1 = (
        b"From: Alice Old <alice@example.com>\r\n"
        b"To: bob@client.example.com\r\n"
        b"Subject: Monday check-in\r\n"
        b"Date: Mon, 17 Aug 2026 09:00:00 +0000\r\n"
        b"Message-ID: <old-1@example.com>\r\n"
    )
    text_1 = b"Hey Bob,\r\nJust checking in on the project timeline.\r\n"
    headers_2 = (
        b"From: Carol New <carol@example.com>\r\n"
        b"To: bob@client.example.com\r\n"
        b"Subject: =?utf-8?q?R=C3=A9sum=C3=A9_review?=\r\n"
        b"Date: Mon, 24 Aug 2026 10:30:00 +0000\r\n"
        b"Message-ID: <new-2@example.com>\r\n"
    )
    text_2 = b"<html><body>Please review the attached <b>doc</b>.</body></html>"
    full_2 = (
        headers_2
        + b"X-Warmup-Id: wu-abc-123\r\n"
        + b"Content-Type: text/plain; charset=utf-8\r\n\r\n"
        + b"Please review the attached doc.\r\nCheers,\r\nCarol\r\n"
    )
    return {
        1: {
            "uid": 101,
            "headers": headers_1,
            "text": text_1,
            "full": headers_1 + b"Content-Type: text/plain\r\n\r\n" + text_1,
        },
        2: {"uid": 102, "headers": headers_2, "text": text_2, "full": full_2},
    }


# --------------------------------------------------------------------------- #
# 1. accounts list                                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_accounts_list_flags_and_owner(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    client_user = await _make_client(maker)
    await _make_mailbox(maker, client_user, email="smtp-mailbox@acme.com")
    await _make_mailbox(
        maker,
        client_user,
        email="oauth@gmail.com",
        provider="gmail",
        imap_host=None,
        with_password=False,
    )
    await _make_peer(maker, email="helper@peer.example.com")
    await _make_peer(maker, email="bare@peer.example.com", with_imap_creds=False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/admin/mail-viewer/accounts", headers=_auth_for(admin))
    assert resp.status_code == 200, resp.text
    accounts = resp.json()
    by_email = {a["email"]: a for a in accounts}

    smtp_entry = by_email["smtp-mailbox@acme.com"]
    assert smtp_entry["source"] == "mailbox"
    assert smtp_entry["imap_supported"] is True
    assert smtp_entry["owner_email"] == "client-owner@example.com"

    gmail_entry = by_email["oauth@gmail.com"]
    assert gmail_entry["provider"] == "gmail"
    assert gmail_entry["imap_supported"] is False

    peer_entry = by_email["helper@peer.example.com"]
    assert peer_entry["source"] == "peer"
    assert peer_entry["provider"] == "peer"
    assert peer_entry["imap_supported"] is True
    assert peer_entry["owner_email"] is None

    assert by_email["bare@peer.example.com"]["imap_supported"] is False

    # Mailboxes first (by email), then peers (by email).
    sources = [a["source"] for a in accounts]
    assert sources == sorted(sources, key=lambda s: 0 if s == "mailbox" else 1)
    assert accounts.index(smtp_entry) < accounts.index(peer_entry)


# --------------------------------------------------------------------------- #
# 2. list messages for a password-based mailbox (+ audit)                     #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_messages_smtp_mailbox(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.db.models.audit_logs import AuditLog

    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    client_user = await _make_client(maker)
    mailbox_id = await _make_mailbox(maker, client_user, email="viewme@acme.com")

    fake = _install_fake_imap(monkeypatch, FakeImapClient(messages=_canned_messages()))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            f"/api/admin/mail-viewer/mailbox/{mailbox_id}/messages",
            params={"folder": "INBOX", "limit": 50},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["folder"] == "INBOX"
    assert "INBOX" in body["folders"] and "Sent" in body["folders"]

    # Newest first: seq 2 (Carol) then seq 1 (Alice).
    msgs = body["messages"]
    assert len(msgs) == 2
    assert msgs[0]["uid"] == "102"
    assert "carol@example.com" in msgs[0]["from"]
    assert msgs[0]["subject"] == "Résumé review"  # RFC2047-decoded
    assert msgs[0]["date"] == "Mon, 24 Aug 2026 10:30:00 +0000"
    assert "review the attached doc" in msgs[0]["snippet"]  # HTML stripped
    assert len(msgs[0]["snippet"]) <= 500

    assert msgs[1]["uid"] == "101"
    assert "alice@example.com" in msgs[1]["from"]
    assert msgs[1]["subject"] == "Monday check-in"
    assert msgs[1]["snippet"].startswith("Hey Bob,")

    # Connected with the decrypted password + resolved IMAP host/port, and
    # always logged out.
    assert fake.login_args == ("viewme@acme.com", "pw-secret-123")
    assert fake.examine_calls == ["INBOX"]
    assert fake.logged_out is True

    # Folder alias resolution: "Sent" opens the provider's real Sent folder.
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            f"/api/admin/mail-viewer/mailbox/{mailbox_id}/messages",
            params={"folder": "Sent"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["folder"] == "Sent"

    # Audit row recorded the view.
    async with maker() as session:
        rows = (
            (await session.execute(select(AuditLog).where(AuditLog.action == "admin_mail_view")))
            .scalars()
            .all()
        )
    assert len(rows) == 2
    assert rows[0].target_type == "mailbox"
    assert rows[0].actor_user_id == admin.id
    assert rows[0].payload["account_email"] == "viewme@acme.com"
    assert rows[0].payload["folder"] in {"INBOX", "Sent"}


# --------------------------------------------------------------------------- #
# 2b. single message fetch (full body)                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_message_full_body(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    client_user = await _make_client(maker)
    mailbox_id = await _make_mailbox(maker, client_user, email="viewme@acme.com")

    _install_fake_imap(monkeypatch, FakeImapClient(messages=_canned_messages()))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            f"/api/admin/mail-viewer/mailbox/{mailbox_id}/message/102",
            params={"folder": "INBOX"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["uid"] == "102"
    assert body["subject"] == "Résumé review"
    assert "Please review the attached doc." in body["text_body"]
    assert body["headers"]["message_id"] == "<new-2@example.com>"
    assert body["headers"]["x_warmup_id"] == "wu-abc-123"
    assert "pw-secret" not in resp.text  # creds never leak into responses


# --------------------------------------------------------------------------- #
# 3. OAuth mailbox → 400                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_oauth_mailbox_rejected(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    client_user = await _make_client(maker)
    mailbox_id = await _make_mailbox(
        maker,
        client_user,
        email="oauth@gmail.com",
        provider="gmail",
        imap_host=None,
        with_password=False,
    )
    _install_fake_imap(monkeypatch, FakeImapClient(messages={}))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            f"/api/admin/mail-viewer/mailbox/{mailbox_id}/messages",
            headers=_auth_for(admin),
        )
    assert resp.status_code == 400, resp.text
    assert "not supported" in resp.json()["detail"]
    assert "XOAUTH2" in resp.json()["detail"]


# --------------------------------------------------------------------------- #
# 4. password mailbox without imap_host → 400                                 #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_smtp_mailbox_missing_imap_host(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    client_user = await _make_client(maker)
    mailbox_id = await _make_mailbox(maker, client_user, email="nohost@acme.com", imap_host=None)
    _install_fake_imap(monkeypatch, FakeImapClient(messages={}))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            f"/api/admin/mail-viewer/mailbox/{mailbox_id}/messages",
            headers=_auth_for(admin),
        )
    assert resp.status_code == 400, resp.text
    assert "imap_host" in resp.json()["detail"]


# --------------------------------------------------------------------------- #
# 5. peer without IMAP creds → 400                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_peer_without_imap_creds_rejected(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    peer_id = await _make_peer(maker, email="bare@peer.example.com", with_imap_creds=False)
    _install_fake_imap(monkeypatch, FakeImapClient(messages={}))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            f"/api/admin/mail-viewer/peer/{peer_id}/messages",
            headers=_auth_for(admin),
        )
    assert resp.status_code == 400, resp.text
    assert "no IMAP credentials" in resp.json()["detail"]


# --------------------------------------------------------------------------- #
# 5b. peer listing uses the decrypted blob creds                              #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_messages_peer_uses_stored_creds(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    peer_id = await _make_peer(maker, email="helper@peer.example.com")
    fake = _install_fake_imap(monkeypatch, FakeImapClient(messages=_canned_messages()))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            f"/api/admin/mail-viewer/peer/{peer_id}/messages",
            params={"folder": "INBOX"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["messages"]) == 2
    assert fake.login_args == ("helper@peer.example.com", "peer-imap-pw")

    from app.db.models.audit_logs import AuditLog

    async with maker() as session:
        rows = (
            (await session.execute(select(AuditLog).where(AuditLog.action == "admin_mail_view")))
            .scalars()
            .all()
        )
    assert len(rows) == 1
    assert rows[0].target_type == "peer_inbox"
    assert rows[0].payload["account_email"] == "helper@peer.example.com"


# --------------------------------------------------------------------------- #
# 6. super_admin-only                                                         #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_client_token_forbidden(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    client_user = await _make_client(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/admin/mail-viewer/accounts", headers=_auth_for(client_user))
    assert resp.status_code == 403, resp.text
