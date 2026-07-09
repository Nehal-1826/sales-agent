"""CRM reply scan — IMAP INBOX walk maps replies back to enrollments.

Uses a fake IMAP client (no network): one INBOX message quotes a sequence
Message-Id in In-Reply-To, another is unrelated. The scan must record exactly
one deduped ``email_replied`` activity for the matching enrollment's lead.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.services import crm_reply_scan, crm_tracking
from app.services.crypto import get_fernet_service


class _FakeResp:
    def __init__(self, result: str, lines: list) -> None:
        self.result = result
        self.lines = lines


class _FakeIMAP:
    """Minimal stand-in for aioimaplib.IMAP4_SSL used by the scan loop."""

    def __init__(self, enrollment_id: uuid.UUID) -> None:
        self._enr = enrollment_id
        self.logged_out = False

    async def uid_search(self, *args: str) -> _FakeResp:
        # Mirrors aioimaplib.IMAP4.uid_search — the scan loop switched to this
        # because .uid("search", …) raises Abort in aioimaplib.
        return _FakeResp("OK", [b"1 2"])

    async def uid(self, command: str, *args: str) -> _FakeResp:
        if command == "search":
            return _FakeResp("OK", [b"1 2"])
        if command == "fetch":
            uid = args[0]
            if uid == "1":
                mid = crm_tracking.sequence_message_id(self._enr, 1)
                return _FakeResp("OK", [f"In-Reply-To: {mid}".encode()])
            return _FakeResp("OK", [b"In-Reply-To: <someone-else@example.com>"])
        return _FakeResp("OK", [])

    async def logout(self) -> None:
        self.logged_out = True


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db.base import Base
    from app.db.models.crm_campaigns import CrmCampaign
    from app.db.models.crm_lead_activities import CrmLeadActivity
    from app.db.models.crm_leads import CrmLead
    from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment
    from app.db.models.crm_sequence_steps import CrmSequenceStep
    from app.db.models.crm_sequences import CrmSequence

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
            CrmCampaign,
            CrmLead,
            CrmLeadActivity,
            CrmSequence,
            CrmSequenceStep,
            CrmSequenceEnrollment,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest.mark.asyncio
async def test_scan_records_reply_for_matching_inreplyto(monkeypatch) -> None:
    from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
    from app.db.models.crm_leads import CrmLead
    from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment

    maker, engine = await _setup_db()
    try:
        ws = uuid.uuid4()
        async with maker() as db:
            lead = CrmLead(
                workspace_id=ws,
                campaign_id=uuid.uuid4(),
                name="Replying Prospect",
                email="prospect@reply.test",
            )
            db.add(lead)
            await db.flush()
            enr = CrmSequenceEnrollment(
                workspace_id=ws,
                sequence_id=uuid.uuid4(),
                lead_id=lead.id,
                current_step=1,
            )
            db.add(enr)
            await db.commit()
            enr_id = enr.id

        # The scan opens its own SessionLocal for record_reply — point it at ours.
        monkeypatch.setattr(crm_reply_scan, "SessionLocal", maker)

        async def _fake_open(host, port, username, password):
            return _FakeIMAP(enr_id)

        monkeypatch.setattr(crm_reply_scan, "_open_inbox", _fake_open)

        fernet = get_fernet_service()
        mailbox = type(
            "MB",
            (),
            {
                "id": uuid.uuid4(),
                "imap_host": "imap.client.test",
                "imap_port": 993,
                "smtp_username": "sender@client.test",
                "smtp_password_encrypted": fernet.encrypt(b"pw"),
            },
        )()
        since = datetime.now(UTC) - timedelta(days=14)

        recorded = await crm_reply_scan.scan_mailbox_replies(mailbox, since, fernet)
        assert recorded == 1

        # Re-scan: same thread → dedup → no new activity.
        recorded2 = await crm_reply_scan.scan_mailbox_replies(mailbox, since, fernet)
        assert recorded2 == 0

        async with maker() as db:
            n = await db.scalar(
                select(func.count(CrmLeadActivity.id)).where(
                    CrmLeadActivity.kind == CrmActivityKind.email_replied
                )
            )
            assert n == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_scan_skips_mailbox_without_imap_host() -> None:
    fernet = get_fernet_service()
    mailbox = type(
        "MB",
        (),
        {
            "id": uuid.uuid4(),
            "imap_host": None,
            "imap_port": None,
            "smtp_username": "x@y.test",
            "smtp_password_encrypted": fernet.encrypt(b"pw"),
        },
    )()
    recorded = await crm_reply_scan.scan_mailbox_replies(
        mailbox, datetime.now(UTC), fernet
    )
    assert recorded == 0
