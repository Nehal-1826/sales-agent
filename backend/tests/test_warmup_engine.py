"""Integration-ish tests for the warmup engine.

Everything that would touch real SMTP/IMAP is mocked. We never open a real
network connection.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.services.crypto import FernetService
from app.services.warmup.content import StaticTemplateGenerator
from app.services.warmup.metrics import warmth_score

# ---------------- pure function tests ----------------

def test_warmth_score_formula_bounds() -> None:
    # All zeros -> 0.
    assert warmth_score(0, 0, 0, 0, 0, None) == 0.0

    # High engagement + default-100 placement -> comfortably above 50 (strong mailbox).
    # Hand-calc: 0.40*100 + 0.30*30 + 0.15*60 + 0.15*20 = 40 + 9 + 9 + 3 = 61.
    hi = warmth_score(
        emails_sent=100, opens=60, replies=30, spam_rescues=20, bounces=0,
        placement_pct=None,
    )
    assert 55.0 <= hi <= 100.0

    # Perfect signal: 100% placement, 100% reply, 100% open, 100% rescue, 0 bounce.
    perfect = warmth_score(
        emails_sent=100, opens=100, replies=100, spam_rescues=100, bounces=0,
        placement_pct=100.0,
    )
    assert perfect == 100.0

    # High bounce rate depresses the score below "no bounces" case.
    with_bounces = warmth_score(
        emails_sent=100, opens=60, replies=30, spam_rescues=20, bounces=30,
        placement_pct=None,
    )
    without = warmth_score(
        emails_sent=100, opens=60, replies=30, spam_rescues=20, bounces=0,
        placement_pct=None,
    )
    assert with_bounces < without

    # Output is always clamped to [0, 100].
    s = warmth_score(10, 0, 0, 0, 10, 0.0)  # everything bad
    assert 0.0 <= s <= 100.0


@pytest.mark.asyncio
async def test_content_generator_plain_mode() -> None:
    gen = StaticTemplateGenerator()

    a = await gen.generate_thread_message("A", [], "Alex", "Jordan")
    assert a["is_html"] is False
    assert "Alex" in a["body_text"] or "Jordan" in a["body_text"]

    b = await gen.generate_thread_message("B", [], "Alex", "Jordan")
    assert b["is_html"] is True
    assert "<html" in b["body_text"].lower()

    d = await gen.generate_thread_message("D", [], "Alex", "Jordan")
    assert d["is_html"] is False  # mode D currently == A


@pytest.mark.asyncio
async def test_smtp_sender_redacts_on_exception() -> None:
    """Exceptions raised by aiosmtplib must not leak the password."""
    import aiosmtplib

    from app.services.warmup import smtp_sender

    key = Fernet.generate_key()
    fernet = FernetService([key.decode()])
    secret_password = "p@ssw0rd-unique-token"

    class FakeMailbox:
        email_address = "sender@example.com"
        smtp_host = "smtp.example.com"
        smtp_port = 587
        smtp_username = "sender@example.com"
        smtp_password_encrypted = fernet.encrypt(secret_password.encode())

    class FakePeer:
        email_address = "peer@example.com"

    class _FakeSMTP:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def login(self, *a, **kw):
            # Force a 5xx so retries don't mask the leak check.
            raise aiosmtplib.SMTPResponseException(535, "bad creds")

    with patch.object(aiosmtplib, "SMTP", _FakeSMTP), pytest.raises(
        aiosmtplib.SMTPResponseException
    ) as exc_info:
        await smtp_sender.send_email(
            FakeMailbox(), FakePeer(), "subj", "hi", False, fernet
        )

    err_str = str(exc_info.value) + repr(exc_info.value)
    assert secret_password not in err_str
    assert "bad creds" in err_str  # server message is OK, the raw pw is not


@pytest.mark.asyncio
async def test_send_single_warmup_email_happy_path(monkeypatch) -> None:
    """Full outbound cycle with mocked pairing + SMTP. Verify WarmupLog row written."""
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.mailboxes import ContentMode, Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.db.models.users import OnboardingStatus, User, UserRole
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    # Assign synthetic ids to BigInteger-PK rows on SQLite (no autoincrement).
    _id_counter = {"n": 0}

    def _assign_id(mapper, connection, target):
        if getattr(target, "id", None) is None:
            _id_counter["n"] += 1
            target.id = _id_counter["n"]

    event.listen(WarmupLog, "before_insert", _assign_id)

    # Seed a user, a mailbox, a peer.
    async with maker() as db:
        key = Fernet.generate_key()
        fernet = FernetService([key.decode()])

        user = User(email="who@example.com", hashed_password="x",
                    role=UserRole.client, onboarding_status=OnboardingStatus.signed_up)
        db.add(user)
        await db.flush()

        mb = Mailbox(
            user_id=user.id,
            workspace_id=user.workspace_id,
            email_address="sender@example.com",
            provider=MailboxProvider.smtp,
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username="sender@example.com",
            smtp_password_encrypted=fernet.encrypt(b"some-password"),
            warmup_status=WarmupStatus.active,
            daily_target=50,
            current_day=5,
            content_mode=ContentMode.A,
        )
        peer = PeerInbox(
            email_address="peer1@example.com",
            provider=PeerProvider.google_ws,
            reputation_score=0.9,
            daily_capacity=50,
            used_today=0,
            is_active=True,
        )
        db.add_all([mb, peer])
        await db.commit()
        mb_id = mb.id
        peer_id = peer.id

    # Patch SessionLocal + pick_peer_inbox + SMTP send.
    from app.tasks import warmup_send as ws_mod

    monkeypatch.setattr(ws_mod, "SessionLocal", maker)
    monkeypatch.setattr(ws_mod, "get_fernet_service", lambda: fernet)

    async def fake_pick(mailbox_id, db):
        return await db.get(PeerInbox, peer_id)

    async def fake_send(mailbox, peer, subject, body, is_html, fernet=None, **kw):
        return {
            "message_id": "<abc@example.com>",
            "sent_at": datetime.now(UTC),
            "smtp_response": "250 OK",
        }

    monkeypatch.setattr(ws_mod, "pick_peer_inbox", fake_pick)
    monkeypatch.setattr(ws_mod, "send_email", fake_send)

    result = await ws_mod._send_impl(str(mb_id))
    assert result["status"] == "sent"
    # The wire message_id is the warmup_id we now generate up-front and set
    # as X-Warmup-Id; it's a UUID string the peer-side IMAP poller searches
    # for. The fake send_email's "<abc@example.com>" is no longer reflected
    # back into the WarmupLog row by design.
    log_message_id = result["message_id"]
    uuid.UUID(log_message_id)  # raises if not a valid UUID

    async with maker() as db:
        rows = (await db.scalars(select(WarmupLog).where(WarmupLog.mailbox_id == mb_id))).all()
        assert len(rows) == 1
        assert rows[0].direction == WarmupDirection.outbound
        assert rows[0].action == WarmupAction.sent
        # The same warmup_id is stored on the log so the peer poller can
        # later trace any open/reply/spam-rescue back to this row.
        assert rows[0].message_id == log_message_id

    event.remove(WarmupLog, "before_insert", _assign_id)
    await engine.dispose()


async def test_send_single_warmup_email_skips_paused_mailbox(monkeypatch) -> None:
    """A task already on the smtp queue when the user pauses must not send.

    Regression: the scheduler filters paused rows at enqueue time, but the
    per-mailbox task body used to never re-check after dequeue — so queued
    tasks (plus their retry ladder) kept sending for ~15-21 min after pause.
    Covers both pause representations: ``is_paused=True`` and
    ``warmup_status=paused`` (the pause endpoint sets both together).
    """
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.users import OnboardingStatus, User, UserRole
    from app.db.models.warmup_logs import WarmupLog

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    # Seed a user plus two paused mailboxes: one flagged via is_paused, one
    # via warmup_status (the other flag left at its non-paused value so the
    # test proves either flag alone stops the send).
    async with maker() as db:
        key = Fernet.generate_key()
        fernet = FernetService([key.decode()])

        user = User(email="pauser@example.com", hashed_password="x",
                    role=UserRole.client, onboarding_status=OnboardingStatus.signed_up)
        db.add(user)
        await db.flush()

        mb_flag = Mailbox(
            user_id=user.id,
            workspace_id=user.workspace_id,
            email_address="flag-paused@example.com",
            provider=MailboxProvider.smtp,
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username="flag-paused@example.com",
            smtp_password_encrypted=fernet.encrypt(b"some-password"),
            warmup_status=WarmupStatus.active,
            is_paused=True,
        )
        mb_status = Mailbox(
            user_id=user.id,
            workspace_id=user.workspace_id,
            email_address="status-paused@example.com",
            provider=MailboxProvider.smtp,
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username="status-paused@example.com",
            smtp_password_encrypted=fernet.encrypt(b"some-password"),
            warmup_status=WarmupStatus.paused,
            is_paused=False,
        )
        db.add_all([mb_flag, mb_status])
        await db.commit()
        flag_id, status_id = mb_flag.id, mb_status.id

    from app.tasks import warmup_send as ws_mod

    monkeypatch.setattr(ws_mod, "SessionLocal", maker)
    monkeypatch.setattr(ws_mod, "get_fernet_service", lambda: fernet)

    # Recording mocks — the gate must return before pairing or SMTP is touched.
    calls: list[str] = []

    async def fake_pick(mailbox_id, db):
        calls.append("pick_peer_inbox")
        return None

    async def fake_send(*a, **kw):
        calls.append("send_email")
        return {}

    monkeypatch.setattr(ws_mod, "pick_peer_inbox", fake_pick)
    monkeypatch.setattr(ws_mod, "send_email", fake_send)

    assert await ws_mod._send_impl(str(flag_id)) == {"status": "skipped_paused"}
    assert await ws_mod._send_impl(str(status_id)) == {"status": "skipped_paused"}
    assert calls == []  # neither pairing nor SMTP ran

    async with maker() as db:
        rows = (
            await db.scalars(
                select(WarmupLog).where(WarmupLog.mailbox_id.in_([flag_id, status_id]))
            )
        ).all()
        assert rows == []

    await engine.dispose()


async def test_scheduler_excludes_paused_mailboxes(monkeypatch) -> None:
    """Regression: the beat scheduler must not enqueue paused mailboxes.

    Locks in the selection query in ``_schedule_impl`` — both ``is_paused``
    and ``warmup_status != active`` keep a mailbox out of the cycle.
    """
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.users import OnboardingStatus, User, UserRole

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with maker() as db:
        user = User(email="scheduler@example.com", hashed_password="x",
                    role=UserRole.client, onboarding_status=OnboardingStatus.signed_up)
        db.add(user)
        await db.flush()

        def _mb(email: str, status: WarmupStatus, paused: bool) -> Mailbox:
            return Mailbox(
                user_id=user.id,
                workspace_id=user.workspace_id,
                email_address=email,
                provider=MailboxProvider.smtp,
                warmup_status=status,
                is_paused=paused,
                daily_target=50,
                current_day=5,  # ramp_target(5, 50) = 10 > 0, so quota allows a send
            )

        active = _mb("active@example.com", WarmupStatus.active, False)
        flag_paused = _mb("flag@example.com", WarmupStatus.active, True)
        status_paused = _mb("status@example.com", WarmupStatus.paused, False)
        db.add_all([active, flag_paused, status_paused])
        await db.commit()
        active_id, flag_id, status_id = active.id, flag_paused.id, status_paused.id

    from app.tasks import warmup_send as ws_mod

    enqueued: list[str] = []

    class _FakeSendTask:
        def delay(self, mailbox_id: str) -> None:
            enqueued.append(mailbox_id)

    monkeypatch.setattr(ws_mod, "SessionLocal", maker)
    monkeypatch.setattr(ws_mod, "send_single_warmup_email", _FakeSendTask())

    selected = await ws_mod._schedule_impl()

    assert str(active_id) in selected
    assert str(flag_id) not in selected
    assert str(status_id) not in selected
    assert enqueued == [str(active_id)]

    await engine.dispose()
