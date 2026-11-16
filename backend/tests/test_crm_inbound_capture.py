"""CRM inbound capture — INBOX walk turns genuine enquiries into leads.

Uses a fake IMAP client (no network). The INBOX holds four messages:
  uid 1  genuine enquiry from a real prospect      -> becomes a lead
  uid 2  from a warmup peer-network inbox          -> excluded (the moat)
  uid 3  from a no-reply automated address         -> excluded (rule)
  uid 4  from an address already in the CRM        -> excluded (dedup)

The LLM classifier is stubbed so the test is deterministic and offline.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.services import crm_inbound_capture_service as svc
from app.services.crypto import get_fernet_service


class _FakeResp:
    def __init__(self, result: str, lines: list) -> None:
        self.result = result
        self.lines = lines


# uid -> raw header lines returned by a FETCH of (FROM SUBJECT LIST-UNSUBSCRIBE
# AUTO-SUBMITTED PRECEDENCE).
_MESSAGES = {
    "1": [b"From: Loga <logadheenan2005@gmail.com>", b"Subject: Website needed"],
    "2": [b"From: Peer One <peer1@warmpulse.peer>", b"Subject: re: warmup"],
    "3": [
        b"From: BigCorp <no-reply@bigcorp.com>",
        b"Subject: Your receipt",
        b"List-Unsubscribe: <mailto:unsub@bigcorp.com>",
    ],
    "4": [b"From: Known Lead <known@lead.test>", b"Subject: following up"],
}


class _FakeIMAP:
    def __init__(self) -> None:
        self.logged_out = False

    async def uid_search(self, *args: str) -> _FakeResp:
        return _FakeResp("OK", [b"1 2 3 4"])

    async def uid(self, command: str, *args: str) -> _FakeResp:
        if command == "fetch":
            return _FakeResp("OK", _MESSAGES.get(args[0], []))
        return _FakeResp("OK", [])

    async def logout(self) -> None:
        self.logged_out = True


class _UidAwareFakeIMAP(_FakeIMAP):
    """Honours ``UID n:*`` incremental search like a real server (minus the
    trailing-message quirk, which the service filters defensively anyway)."""

    def __init__(self) -> None:
        super().__init__()
        self.searches: list[tuple] = []

    async def uid_search(self, *args: str) -> _FakeResp:
        self.searches.append(args)
        if args and args[0] == "UID":
            lo = int(args[1].split(":", 1)[0])
            hits = [u for u in ("1", "2", "3", "4") if int(u) >= lo]
            return _FakeResp("OK", [(" ".join(hits)).encode()])
        return _FakeResp("OK", [b"1 2 3 4"])


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db.base import Base
    from app.db.models.crm_campaigns import CrmCampaign  # noqa: F401
    from app.db.models.crm_lead_activities import CrmLeadActivity  # noqa: F401
    from app.db.models.crm_leads import CrmLead  # noqa: F401
    from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment  # noqa: F401,E501
    from app.db.models.crm_sequence_steps import CrmSequenceStep  # noqa: F401
    from app.db.models.crm_sequences import CrmSequence  # noqa: F401
    from app.db.models.mailboxes import Mailbox  # noqa: F401
    from app.db.models.peer_inboxes import PeerInbox  # noqa: F401
    from app.db.models.plans import Plan  # noqa: F401
    from app.db.models.users import User  # noqa: F401

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
            Plan,
            User,
            Mailbox,
            PeerInbox,
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


async def _seed(maker, *, plan_name: str = "Pro Plus") -> dict:
    """Create a plan/user/mailbox + one peer inbox + one pre-existing lead."""
    from app.db.models.crm_campaigns import CrmCampaign
    from app.db.models.crm_leads import CrmLead
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.db.models.plans import Plan
    from app.db.models.users import User

    fernet = get_fernet_service()
    ws = uuid.uuid4()
    async with maker() as db:
        plan = Plan(name=plan_name)
        db.add(plan)
        await db.flush()

        user = User(
            email="owner@client.test",
            workspace_id=ws,
            plan_id=plan.id,
            hashed_password="x",
        )
        db.add(user)
        await db.flush()

        mailbox = Mailbox(
            user_id=user.id,
            workspace_id=ws,
            email_address="owner@client.test",
            provider=MailboxProvider.smtp,
            imap_host="imap.client.test",
            imap_port=993,
            smtp_username="owner@client.test",
            smtp_password_encrypted=fernet.encrypt(b"pw"),
            warmup_status=WarmupStatus.active,
        )
        db.add(mailbox)

        db.add(
            PeerInbox(
                email_address="peer1@warmpulse.peer",
                provider=PeerProvider.google_ws,
            )
        )

        camp = CrmCampaign(workspace_id=ws, name="Existing")
        db.add(camp)
        await db.flush()
        db.add(
            CrmLead(
                workspace_id=ws,
                campaign_id=camp.id,
                name="Known Lead",
                email="known@lead.test",
            )
        )
        await db.commit()
        return {"workspace_id": ws, "mailbox_id": mailbox.id}


@pytest.mark.asyncio
async def test_genuine_enquiry_becomes_lead_excluding_peer_noreply_and_dupes(
    monkeypatch,
) -> None:
    from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
    from app.db.models.crm_leads import CrmLead

    maker, engine = await _setup_db()
    try:
        seeded = await _seed(maker)

        async def _fake_connect(*a, **k):
            return _FakeIMAP(), "INBOX", 111

        monkeypatch.setattr(svc, "_connect_inbox", _fake_connect)
        # Classifier says YES to anything that reaches it.
        async def _yes(**kw):
            return True

        monkeypatch.setattr(svc, "classify_inbound_lead", _yes)

        async with maker() as db:
            result = await svc.import_inbound_leads_from_mailbox(
                db, mailbox_id=seeded["mailbox_id"], auto_enroll=False
            )

        assert result["imported"] == 1, result

        async with maker() as db:
            leads = (
                await db.execute(
                    select(CrmLead).where(CrmLead.source == "inbox_capture")
                )
            ).scalars().all()
            assert len(leads) == 1
            lead = leads[0]
            assert lead.email == "logadheenan2005@gmail.com"
            assert lead.name == "Loga"
            assert "inbound" in lead.tags

            # No lead created for the peer / no-reply / duplicate senders.
            all_emails = {
                r[0]
                for r in (
                    await db.execute(select(CrmLead.email))
                ).all()
            }
            assert "peer1@warmpulse.peer" not in all_emails
            assert "no-reply@bigcorp.com" not in all_emails

            acts = (
                await db.execute(
                    select(func.count(CrmLeadActivity.id)).where(
                        CrmLeadActivity.kind == CrmActivityKind.created
                    )
                )
            ).scalar_one()
            assert acts == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_llm_unavailable_creates_no_lead(monkeypatch) -> None:
    from app.db.models.crm_leads import CrmLead

    maker, engine = await _setup_db()
    try:
        seeded = await _seed(maker)

        async def _fake_connect(*a, **k):
            return _FakeIMAP(), "INBOX", 111

        monkeypatch.setattr(svc, "_connect_inbox", _fake_connect)
        # None == classifier could not run (no key / error) -> fail to skip.
        async def _none(**kw):
            return None

        monkeypatch.setattr(svc, "classify_inbound_lead", _none)

        async with maker() as db:
            result = await svc.import_inbound_leads_from_mailbox(
                db, mailbox_id=seeded["mailbox_id"], auto_enroll=False
            )
        assert result["imported"] == 0

        async with maker() as db:
            n = (
                await db.execute(
                    select(func.count(CrmLead.id)).where(
                        CrmLead.source == "inbox_capture"
                    )
                )
            ).scalar_one()
            assert n == 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_ineligible_plan_is_skipped(monkeypatch) -> None:
    maker, engine = await _setup_db()
    try:
        seeded = await _seed(maker, plan_name="Starter")

        async def _fake_connect(*a, **k):
            raise AssertionError("must not connect for ineligible plan")

        monkeypatch.setattr(svc, "_connect_inbox", _fake_connect)

        async with maker() as db:
            result = await svc.import_inbound_leads_from_mailbox(
                db, mailbox_id=seeded["mailbox_id"], auto_enroll=False
            )
        assert "skipped" in result
        assert "plan_not_eligible" in result["skipped"]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_watermark_advances_and_second_run_is_incremental(monkeypatch) -> None:
    from app.db.models.crm_leads import CrmLead
    from app.db.models.mailboxes import Mailbox

    maker, engine = await _setup_db()
    try:
        seeded = await _seed(maker)
        fake = _UidAwareFakeIMAP()

        async def _fake_connect(*a, **k):
            return fake, "INBOX", 111

        monkeypatch.setattr(svc, "_connect_inbox", _fake_connect)

        calls = {"n": 0}

        async def _yes(**kw):
            calls["n"] += 1
            return True

        monkeypatch.setattr(svc, "classify_inbound_lead", _yes)

        # First run: full window, captures the one genuine enquiry, sets the
        # watermark to the highest UID seen (4) for this UIDVALIDITY.
        async with maker() as db:
            r1 = await svc.import_inbound_leads_from_mailbox(
                db, mailbox_id=seeded["mailbox_id"]
            )
        assert r1["imported"] == 1
        first_classifications = calls["n"]
        assert first_classifications >= 1

        async with maker() as db:
            mb = await db.get(Mailbox, seeded["mailbox_id"])
            assert mb.last_inbound_capture_uid == 4
            assert mb.last_inbound_uidvalidity == 111

        # Second run: nothing new past UID 4 -> incremental search, no fetches,
        # no re-classification, no new leads.
        async with maker() as db:
            r2 = await svc.import_inbound_leads_from_mailbox(
                db, mailbox_id=seeded["mailbox_id"]
            )
        assert r2["imported"] == 0
        assert calls["n"] == first_classifications  # classifier not re-invoked
        assert ("UID", "5:*") in fake.searches

        async with maker() as db:
            n = (
                await db.execute(
                    select(func.count(CrmLead.id)).where(
                        CrmLead.source == "inbox_capture"
                    )
                )
            ).scalar_one()
            assert n == 1
    finally:
        await engine.dispose()
