"""Tests for Platform Mail — the full mail system for WarmPulse's own account.

Harness mirrors ``test_admin_mail_viewer`` (in-memory SQLite + StaticPool +
``get_db`` override). The platform account's config comes from
``transactional_mail._resolve_smtp_config`` — monkeypatched here to a canned
``_SmtpConfig`` so both the IMAP and SMTP paths resolve without touching
app_settings. The IMAP layer is faked with an extended FakeImapClient
(select/store/expunge/copy/append/status + FLAGS in FETCH responses) and the
SMTP layer with an async context-manager FakeSMTP recording send args.
"""

from __future__ import annotations

import email.policy
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
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (User, AuditLog)]
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
# Fakes: platform config, IMAP, SMTP                                          #
# --------------------------------------------------------------------------- #


def _install_platform_config(
    monkeypatch: pytest.MonkeyPatch,
    *,
    host: str = "smtp.warmpulse.tech",
    username: str = "hello@warmpulse.tech",
    password: str = "smtp-pw-123",
) -> None:
    """Point transactional_mail._resolve_smtp_config at a canned config.

    One patch covers everything: send_mail resolves SMTP creds through it,
    and _platform_imap_config (IMAP host/port/login for reads/writes/appends)
    resolves through it too.
    """
    from app.services import transactional_mail as tm

    cfg = tm._SmtpConfig(
        host=host,
        port=587,
        username=username,
        password=password,
        from_addr="WarmPulse <hello@warmpulse.tech>",
        starttls=True,
        source="admin",
        imap_host="imap.warmpulse.tech",
        imap_port=993,
    )

    async def _fake():
        return cfg

    monkeypatch.setattr(tm, "_resolve_smtp_config", _fake)


class _Resp:
    def __init__(self, result: str = "OK", lines: list | None = None) -> None:
        self.result = result
        self.lines = lines or []


class FakeImapClient:
    """Canned aioimaplib.IMAP4_SSL with the mutation ops platform_mail uses.

    Tracks read-write opens (select), UID STORE/COPY calls (with flag-set
    mutation), EXPUNGE, APPEND and STATUS. FETCH responses carry FLAGS so
    the service's ``seen`` parsing is exercised.
    """

    def __init__(
        self,
        *,
        folders: list[str] | None = None,
        messages: dict | None = None,
        unread: dict[str, int] | None = None,
    ):
        self.folders = folders or ["INBOX", "Sent", "Trash"]
        # seq (1-based, ascending = oldest first) -> message dict
        self.messages: dict[int, dict] = messages or {}
        self.unread: dict[str, int] = unread or {}
        self.examine_calls: list[str] = []
        self.select_calls: list[str] = []
        # Mirror aioimaplib's FSM — SEARCH/FETCH require a SELECTED mailbox.
        self.selected = False
        self.select_calls: list[str] = []
        self.store_calls: list[tuple[str, str, str]] = []  # (uid, mode, flags)
        self.copy_calls: list[tuple[str, str]] = []  # (uid, dest folder)
        self.expunge_calls = 0
        self.append_calls: list[tuple[str, str | None, str | None, bytes]] = []
        self.status_calls: list[str] = []
        self.login_args: tuple[str, str] | None = None
        self.logged_out = False

    def _seq_by_uid(self, uid: str) -> int | None:
        for seq, msg in self.messages.items():
            if str(msg["uid"]) == str(uid):
                return seq
        return None

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
        return _Resp()
        if folder in self.folders:
            return _Resp()
        return _Resp(result="NO")

    async def select(self, mailbox: str = "INBOX") -> _Resp:
        self.select_calls.append(mailbox)
        self.selected = True
        self.select_calls.append(mailbox)
        if mailbox in self.folders:
            return _Resp()
        return _Resp(result="NO")

    async def status(self, mailbox: str, names: str) -> _Resp:
        self.status_calls.append(mailbox)
        if mailbox not in self.folders:
            return _Resp(result="NO")
        return _Resp(
            lines=[f'* STATUS "{mailbox}" (UNSEEN {self.unread.get(mailbox, 0)})'.encode()]
        )

    async def search(self, *criteria: str, charset: str | None = None) -> _Resp:
        if not self.selected:
            import aioimaplib as _aio
            raise _aio.Abort("command SEARCH illegal in state AUTH")
        nums = " ".join(str(i) for i in sorted(self.messages))
        return _Resp(lines=[nums.encode()])

    async def fetch(self, message_set: str, message_parts: str) -> _Resp:
        if not self.selected:
            import aioimaplib as _aio
            raise _aio.Abort("command FETCH illegal in state AUTH")
        lines: list = []
        for seq_str in message_set.split(","):
            seq = int(seq_str)
            msg = self.messages[seq]
            headers, text = msg["headers"], msg["text"]
            flags = msg["flags"]
            lines.append(
                f"* {seq} FETCH (UID {msg['uid']} FLAGS ({flags}) "
                f"BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID)] "
                f"{{{len(headers)}}}".encode()
            )
            lines.append(bytearray(headers))
            lines.append(f" BODY[TEXT]<0> {{{len(text)}}}".encode())
            lines.append(bytearray(text))
            lines.append(b")")
        return _Resp(lines=lines)

    async def uid(self, command: str, *criteria: str) -> _Resp:
        cmd = command.lower()
        if cmd == "fetch":
            uid = criteria[0]
            seq = self._seq_by_uid(uid)
            if seq is None:
                return _Resp(lines=[])
            full = self.messages[seq]["full"]
            flags = self.messages[seq]["flags"]
            lines = [
                f"* {seq} FETCH (UID {uid} FLAGS ({flags}) BODY[] {{{len(full)}}}".encode(),
                bytearray(full),
                b")",
            ]
            return _Resp(lines=lines)
        if cmd == "store":
            uid, mode, flags = (str(c) for c in criteria)
            self.store_calls.append((uid, mode, flags))
            seq = self._seq_by_uid(uid)
            if seq is not None:
                for flag in flags.strip("()").split():
                    if mode.startswith("+"):
                        self.messages[seq]["flag_set"].add(flag)
                    else:
                        self.messages[seq]["flag_set"].discard(flag)
            return _Resp()
        if cmd == "copy":
            uid, dest = (str(c) for c in criteria)
            self.copy_calls.append((uid, dest))
            return _Resp()
        raise AssertionError(f"unexpected UID command {command!r}")

    async def expunge(self) -> _Resp:
        self.expunge_calls += 1
        return _Resp()

    async def append(
        self, message_bytes: bytes, mailbox: str = "INBOX", flags: str | None = None, date=None
    ) -> _Resp:
        self.append_calls.append((mailbox, flags, date, bytes(message_bytes)))
        return _Resp()

    async def logout(self) -> _Resp:
        self.logged_out = True
        return _Resp()


def _install_fake_imap(monkeypatch, client: FakeImapClient) -> FakeImapClient:
    from app.services import admin_mail_viewer as amv

    def _factory(**kwargs):
        return client

    # platform_mail uses admin_mail_viewer._connect, whose IMAP4_SSL lookup
    # goes through the shared aioimaplib module — patch it there.
    monkeypatch.setattr(amv.aioimaplib, "IMAP4_SSL", _factory)
    return client


def _canned_messages() -> dict[int, dict]:
    """Two platform mails: seq 1 (uid 201) seen, seq 2 (uid 202) unread."""
    headers_1 = (
        b"From: Vendor Support <support@vendor.example.com>\r\n"
        b"To: hello@warmpulse.tech\r\n"
        b"Subject: Your invoice is ready\r\n"
        b"Date: Mon, 17 Aug 2026 09:00:00 +0000\r\n"
        b"Message-ID: <old-1@vendor.example.com>\r\n"
    )
    text_1 = b"Hello,\r\nYour August invoice is attached to your portal.\r\n"
    headers_2 = (
        b"From: Carol Customer <carol@example.com>\r\n"
        b"To: hello@warmpulse.tech\r\n"
        b"Cc: team@warmpulse.tech\r\n"
        b"Subject: Question about warmup ramp\r\n"
        b"Date: Mon, 24 Aug 2026 10:30:00 +0000\r\n"
        b"Message-ID: <new-2@example.com>\r\n"
    )
    text_2 = b"Hi,\r\nHow fast can we ramp a new mailbox to 40 mails/day?\r\n"
    full_2 = (
        headers_2
        + b"In-Reply-To: <old-1@vendor.example.com>\r\n"
        + b"References: <thread-root@example.com> <old-1@vendor.example.com>\r\n"
        + b"Content-Type: text/plain; charset=utf-8\r\n\r\n"
        + text_2
    )
    return {
        1: {
            "uid": 201,
            "flags": "\\Seen",
            "flag_set": {"\\Seen"},
            "headers": headers_1,
            "text": text_1,
            "full": headers_1 + b"Content-Type: text/plain\r\n\r\n" + text_1,
        },
        2: {
            "uid": 202,
            "flags": "",
            "flag_set": set(),
            "headers": headers_2,
            "text": text_2,
            "full": full_2,
        },
    }


SMTP_SENDS: list[FakeSMTP] = []


class FakeSMTP:
    """Async context-manager stand-in for aiosmtplib.SMTP."""

    def __init__(self, *, hostname=None, port=None, timeout=None, **kwargs):
        self.hostname = hostname
        self.port = port
        self.timeout = timeout
        self.starttls_called = False
        self.login_args: tuple[str, str] | None = None
        self.sent: list = []
        SMTP_SENDS.append(self)

    async def __aenter__(self) -> FakeSMTP:
        return self

    async def __aexit__(self, *exc_info) -> bool:
        return False

    async def starttls(self) -> None:
        self.starttls_called = True
        if getattr(self, "implicit_tls", False):
            import aiosmtplib as _aio

            raise _aio.SMTPException("Connection already using TLS")

    async def login(self, username, password) -> None:
        self.login_args = (username, password)

    async def send_message(self, message, **kwargs):
        self.sent.append(message)
        return ({}, "queued")


def _install_fake_smtp(monkeypatch) -> list[FakeSMTP]:
    from app.services import platform_mail

    SMTP_SENDS.clear()
    monkeypatch.setattr(platform_mail.aiosmtplib, "SMTP", FakeSMTP)
    return SMTP_SENDS


# --------------------------------------------------------------------------- #
# 1. folders + unread counts                                                  #
# --------------------------------------------------------------------------- #


async def test_folders_and_unread_counts(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_platform_config(monkeypatch)
    fake = _install_fake_imap(
        monkeypatch,
        FakeImapClient(
            folders=["INBOX", "Sent", "Archive"],
            unread={"INBOX": 3, "Sent": 0, "Archive": 9},
        ),
    )
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/admin/platform-mail/folders", headers=_auth_for(admin))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["folders"] == ["INBOX", "Sent", "Archive"]
    # STATUS only for the INBOX/Sent/Junk/Trash aliases that exist — Archive
    # isn't polled, Junk/Trash don't exist here so they're skipped entirely.
    assert fake.status_calls == ["INBOX", "Sent"]
    assert body["unread"] == {"INBOX": 3, "Sent": 0}

    # Connected with the platform account's creds and logged out cleanly.
    assert fake.login_args == ("hello@warmpulse.tech", "smtp-pw-123")
    assert fake.logged_out is True


async def test_folders_junk_and_trash_polled_when_present(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_platform_config(monkeypatch)
    fake = _install_fake_imap(
        monkeypatch,
        FakeImapClient(
            folders=["INBOX", "Sent", "Junk", "Trash", "Drafts"],
            unread={"INBOX": 1, "Junk": 4, "Trash": 2},
        ),
    )
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/admin/platform-mail/folders", headers=_auth_for(admin))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert fake.status_calls == ["INBOX", "Sent", "Junk", "Trash"]
    assert body["unread"] == {"INBOX": 1, "Sent": 0, "Junk": 4, "Trash": 2}


# --------------------------------------------------------------------------- #
# 2. message listing includes the seen state                                  #
# --------------------------------------------------------------------------- #


async def test_messages_list_includes_seen(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_platform_config(monkeypatch)
    fake = _install_fake_imap(monkeypatch, FakeImapClient(messages=_canned_messages()))
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/admin/platform-mail/messages",
            params={"folder": "INBOX", "limit": 50},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["folder"] == "INBOX"

    # Newest first: seq 2 (Carol, unread) then seq 1 (Vendor, already read).
    msgs = body["messages"]
    assert len(msgs) == 2
    assert msgs[0]["uid"] == "202"
    assert msgs[0]["seen"] is False
    assert msgs[0]["subject"] == "Question about warmup ramp"
    assert "hello@warmpulse.tech" in msgs[0]["to"]
    assert msgs[0]["snippet"].startswith("Hi,")
    assert msgs[1]["uid"] == "201"
    assert msgs[1]["seen"] is True

    # Listing is read-only — EXAMINE, no flag writes.
    assert "INBOX" in fake.select_calls
    assert fake.store_calls == []


# --------------------------------------------------------------------------- #
# 3. full-message open marks seen (the key difference from the viewer)        #
# --------------------------------------------------------------------------- #


async def test_get_message_marks_seen(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.db.models.audit_logs import AuditLog

    _install_platform_config(monkeypatch)
    fake = _install_fake_imap(monkeypatch, FakeImapClient(messages=_canned_messages()))
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/admin/platform-mail/message/202",
            params={"folder": "INBOX"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["uid"] == "202"
    assert body["subject"] == "Question about warmup ramp"
    assert "ramp a new mailbox" in body["text_body"]
    assert body["headers"]["message_id"] == "<new-2@example.com>"
    assert body["headers"]["in_reply_to"] == "<old-1@vendor.example.com>"
    # State as it was on open — the STORE below is what made it read.
    assert body["seen"] is False

    # THE difference from the read-only viewer: read-write SELECT + silent
    # \Seen STORE on open.
    assert "INBOX" in fake.select_calls
    assert fake.store_calls == [("202", "+FLAGS.SILENT", "(\\Seen)")]
    assert "\\Seen" in fake.messages[2]["flag_set"]
    assert fake.logged_out is True
    assert "smtp-pw" not in resp.text  # creds never leak into responses

    # Full-message opens are audited.
    async with maker() as session:
        rows = (
            (await session.execute(select(AuditLog).where(AuditLog.action == "platform_mail_read")))
            .scalars()
            .all()
        )
    assert len(rows) == 1
    assert rows[0].target_type == "platform"
    assert rows[0].target_id is None
    assert rows[0].actor_user_id == admin.id
    assert rows[0].payload["uid"] == "202"


# --------------------------------------------------------------------------- #
# 4. set_seen / clear-seen                                                    #
# --------------------------------------------------------------------------- #


async def test_set_seen_true_and_false(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.db.models.audit_logs import AuditLog

    _install_platform_config(monkeypatch)
    fake = _install_fake_imap(monkeypatch, FakeImapClient(messages=_canned_messages()))
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/platform-mail/202/seen",
            params={"folder": "INBOX", "seen": True},
            headers=_auth_for(admin),
        )
        assert resp.status_code == 204, resp.text
        resp = await c.post(
            "/api/admin/platform-mail/201/seen",
            params={"folder": "INBOX", "seen": False},
            headers=_auth_for(admin),
        )
        assert resp.status_code == 204, resp.text

    assert fake.store_calls == [
        ("202", "+FLAGS.SILENT", "(\\Seen)"),
        ("201", "-FLAGS.SILENT", "(\\Seen)"),
    ]
    assert fake.messages[2]["flag_set"] == {"\\Seen"}
    assert fake.messages[1]["flag_set"] == set()

    async with maker() as session:
        rows = (
            (await session.execute(select(AuditLog).where(AuditLog.action == "platform_mail_flag")))
            .scalars()
            .all()
        )
    assert len(rows) == 2
    assert {r.payload["seen"] for r in rows} == {True, False}


# --------------------------------------------------------------------------- #
# 5. send: SMTP + Sent APPEND + audit                                         #
# --------------------------------------------------------------------------- #


async def test_send_mail_smtp_and_sent_append(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.db.models.audit_logs import AuditLog

    _install_platform_config(monkeypatch)
    sends = _install_fake_smtp(monkeypatch)
    fake = _install_fake_imap(monkeypatch, FakeImapClient(messages={}))
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/platform-mail/send",
            json={
                "to": "customer@example.com",
                "cc": "boss@example.com",
                "subject": "Welcome to WarmPulse",
                "body_text": "Hello,\r\nwelcome aboard.\r\n",
                "body_html": "<p>Hello, <b>welcome aboard</b>.</p>",
            },
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "sent"
    assert body["to"] == "customer@example.com"
    assert body["message_id"].startswith("<warmpulse-")
    assert body["message_id"].endswith("@warmpulse.tech>")

    # SMTP: single connection, STARTTLS + login with the configured creds,
    # message carries From (display-name form), To, Cc and Subject.
    assert len(sends) == 1
    smtp = sends[0]
    assert smtp.hostname == "smtp.warmpulse.tech"
    assert smtp.starttls_called is True
    assert smtp.login_args == ("hello@warmpulse.tech", "smtp-pw-123")
    assert len(smtp.sent) == 1
    msg = smtp.sent[0]
    assert str(msg["From"]) == "WarmPulse <hello@warmpulse.tech>"
    assert str(msg["To"]) == "customer@example.com"
    assert str(msg["Cc"]) == "boss@example.com"
    assert str(msg["Subject"]) == "Welcome to WarmPulse"
    assert msg["Date"] is not None
    assert str(msg["Message-ID"]) == body["message_id"]
    # text + html alternative parts both present
    assert "welcome aboard" in msg.get_body(preferencelist=("plain",)).get_content()
    assert "welcome aboard" in msg.get_body(preferencelist=("html",)).get_content()

    # IMAP: the sent mail is APPENDed into the Sent folder flagged \Seen,
    # as CRLF-terminated RFC822 bytes.
    from app.services import platform_mail as pm

    await pm.wait_for_appends()
    assert len(fake.append_calls) == 1
    sent_folder, sent_flags, _sent_date, sent_bytes = fake.append_calls[0]
    assert sent_folder == "Sent"
    assert "\\Seen" in (sent_flags or "")
    assert sent_bytes == msg.as_bytes(policy=email.policy.SMTP)
    assert b"\r\nSubject: Welcome to WarmPulse\r\n" in sent_bytes
    assert fake.logged_out is True

    async with maker() as session:
        rows = (
            (await session.execute(select(AuditLog).where(AuditLog.action == "platform_mail_send")))
            .scalars()
            .all()
        )
    assert len(rows) == 1
    assert rows[0].payload["to"] == "customer@example.com"
    assert rows[0].payload["message_id"] == body["message_id"]


# --------------------------------------------------------------------------- #
# 6. send with reply headers                                                  #
# --------------------------------------------------------------------------- #


async def test_send_reply_headers(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_platform_config(monkeypatch)
    sends = _install_fake_smtp(monkeypatch)
    _install_fake_imap(monkeypatch, FakeImapClient(messages={}))
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/platform-mail/send",
            json={
                "to": "carol@example.com",
                "subject": "Re: Question about warmup ramp",
                "body_text": "About two weeks with safe ramp defaults.",
                "in_reply_to": "<new-2@example.com>",
                "references": "<thread-root@example.com> <new-2@example.com>",
            },
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    msg = sends[0].sent[0]
    assert str(msg["In-Reply-To"]) == "<new-2@example.com>"
    refs = str(msg["References"])
    assert refs.startswith("<thread-root@example.com>")
    assert refs.endswith("<new-2@example.com>")


# --------------------------------------------------------------------------- #
# 7. delete: COPY to Trash + \Deleted + EXPUNGE                               #
# --------------------------------------------------------------------------- #


async def test_delete_message_copies_to_trash_then_expunges(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.db.models.audit_logs import AuditLog

    _install_platform_config(monkeypatch)
    fake = _install_fake_imap(monkeypatch, FakeImapClient(messages=_canned_messages()))
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.delete(
            "/api/admin/platform-mail/202",
            params={"folder": "INBOX"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 204, resp.text
    assert "INBOX" in fake.select_calls
    assert fake.copy_calls == [("202", "Trash")]
    assert fake.store_calls == [("202", "+FLAGS.SILENT", "(\\Deleted)")]
    assert fake.expunge_calls == 1
    assert fake.logged_out is True

    async with maker() as session:
        rows = (
            (
                await session.execute(
                    select(AuditLog).where(AuditLog.action == "platform_mail_delete")
                )
            )
            .scalars()
            .all()
        )
    assert len(rows) == 1
    assert rows[0].payload == {
        "account_email": "hello@warmpulse.tech",
        "folder": "INBOX",
        "uid": "202",
    }


async def test_delete_from_trash_skips_self_copy(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_platform_config(monkeypatch)
    fake = _install_fake_imap(monkeypatch, FakeImapClient(messages=_canned_messages()))
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.delete(
            "/api/admin/platform-mail/201",
            params={"folder": "Trash"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 204, resp.text
    # Deleting from Trash itself must not copy the mail onto itself.
    assert fake.copy_calls == []
    assert "Trash" in fake.select_calls
    assert fake.expunge_calls == 1


# --------------------------------------------------------------------------- #
# 8. auth + unconfigured server                                               #
# --------------------------------------------------------------------------- #


async def test_client_token_forbidden(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    client_user = await _make_client(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/admin/platform-mail/messages", headers=_auth_for(client_user))
    assert resp.status_code == 403, resp.text


async def test_unconfigured_platform_400(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_platform_config(monkeypatch, host="", username="", password="")
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/admin/platform-mail/folders", headers=_auth_for(admin))
        assert resp.status_code == 400, resp.text
        assert "not configured" in resp.json()["detail"]
        resp = await c.post(
            "/api/admin/platform-mail/send",
            json={"to": "x@example.com", "subject": "hi", "body_text": "hello"},
            headers=_auth_for(admin),
        )
        assert resp.status_code == 400, resp.text
        assert "not configured" in resp.json()["detail"]


async def test_transactional_send_also_lands_in_sent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Automated mail (signup/2FA/billing) APPENDs to the platform Sent
    folder via the shared background scheduler — service-level test."""
    from email.message import EmailMessage

    import types as _types

    from app.services import platform_mail as pm
    from app.services import transactional_mail as tm

    cfg = _types.SimpleNamespace(
        host="smtp.warmpulse.tech",
        port=587,
        username="hello@warmpulse.tech",
        password="smtp-pw-123",
        from_addr="WarmPulse <hello@warmpulse.tech>",
        starttls=True,
        source="admin",
        imap_host="imap.warmpulse.tech",
        imap_port=993,
    )

    async def _fake_cfg():
        return cfg

    sent_msgs: list[EmailMessage] = []

    class _RecordingSmtp:
        def __init__(self, *, hostname=None, port=None, timeout=None, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def starttls(self):
            pass

        async def login(self, u, p):
            pass

        async def send_message(self, message, **kwargs):
            sent_msgs.append(message)

    monkeypatch.setattr(tm, "_resolve_smtp_config", _fake_cfg)
    monkeypatch.setattr(tm.aiosmtplib, "SMTP", _RecordingSmtp)
    monkeypatch.setattr(tm, "get_settings", lambda: _types.SimpleNamespace(
        transactional_test_mode=False))

    fake = _install_fake_imap(monkeypatch, FakeImapClient(messages={}))

    result = await tm.send_transactional(
        to="newuser@example.com",
        subject="Welcome to WarmPulse!",
        body_text="Your account is ready.",
        body_html="<p>Your account is ready.</p>",
    )
    assert result == {"status": "sent"}
    assert len(sent_msgs) == 1

    # Background append drained → Sent folder copy with the real headers.
    await pm.wait_for_appends()
    assert len(fake.append_calls) == 1
    sent_folder, sent_flags, _date, sent_bytes = fake.append_calls[0]
    assert sent_folder == "Sent"
    assert "\Seen" in (sent_flags or "")
    assert b"newuser@example.com" in sent_bytes
    assert b"Welcome to WarmPulse!" in sent_bytes
    assert b"Message-ID:" in sent_bytes


async def test_send_tolerates_implicit_tls_relay(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression (live prod bug): mail.warmpulse.tech:587 presents implicit
    TLS, so STARTTLS raises "Connection already using TLS". The send must
    proceed — authenticate on the already-encrypted socket."""
    import aiosmtplib as real_aiosmtplib

    _install_platform_config(monkeypatch)

    class ImplicitTlsFake(FakeSMTP):
        implicit_tls = True

    from app.services import platform_mail as pm

    monkeypatch.setattr(pm.aiosmtplib, "SMTP", ImplicitTlsFake)
    fake_imap = _install_fake_imap(monkeypatch, FakeImapClient(messages={}))
    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/platform-mail/send",
            json={"to": "customer@example.com", "subject": "tls", "body_text": "hi"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "sent"
    smtp = SMTP_SENDS[-1]
    assert smtp.starttls_called is True  # attempted…
    assert smtp.login_args is not None  # …and auth proceeded anyway
    assert len(smtp.sent) == 1
    await pm.wait_for_appends()
    assert len(fake_imap.append_calls) == 1
