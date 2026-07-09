"""Tests for the CRM email-sequence automation engine.

Mirrors the harness in :mod:`tests.test_crm`: a fresh in-memory SQLite with
StaticPool + shared cache, ``get_db`` overridden at the app level, and only the
tables the CRM + sequence routers touch registered (the three new sequence
tables are added to the ``tables`` list).

Covers the spec's business rules:
  * create a sequence under a campaign; add 2 steps (delay 0 + delay 3).
  * enroll a lead → enrollment active with next_send_at set.
  * process_due_enrollments at/after next_send_at sends step 0 (an email_sent
    activity appears + lead.last_activity_at bumped) and advances to step 1 with
    next_send_at = now + 3d.
  * advancing past the last step completes the enrollment.
  * stop_enrollment halts further sends.
  * cross-workspace access to another workspace's sequence → 404.
  * enrolling the same lead twice skips the second.

``now`` is always passed explicitly into ``process_due_enrollments`` so timing
is deterministic (never the wall clock).
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# --------------------------------------------------------------------------- #
# fixtures                                                                    #
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
    from app.db import models  # noqa: F401 — register models on Base.metadata
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.crm_campaigns import CrmCampaign
    from app.db.models.crm_lead_activities import CrmLeadActivity
    from app.db.models.crm_leads import CrmLead
    from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment
    from app.db.models.crm_sequence_steps import CrmSequenceStep
    from app.db.models.crm_sequences import CrmSequence
    from app.db.models.mailboxes import Mailbox
    from app.db.models.plans import Plan
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)

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
            AuditLog,
            CrmCampaign,
            CrmLead,
            CrmLeadActivity,
            CrmSequence,
            CrmSequenceStep,
            CrmSequenceEnrollment,
            Mailbox,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> (
    AsyncIterator[tuple[object, async_sessionmaker[AsyncSession], object]]
):
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
# factories                                                                   #
# --------------------------------------------------------------------------- #


async def _seed_plan(
    maker: async_sessionmaker[AsyncSession], *, name: str = "Agency"
) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as session:
        plan = Plan(
            name=name,
            price_cents=1500,
            max_mailboxes=5,
            daily_email_cap=50,
            token_cap_per_month=30_000,
            capabilities={},
            is_active=True,
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        return plan.id


async def _make_user(
    maker: async_sessionmaker[AsyncSession],
    *,
    email: str,
    plan_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=workspace_id or uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
            plan_id=plan_id,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


def _auth_header_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


def _client(app: object) -> AsyncClient:
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://testserver")


async def _create_campaign(c: AsyncClient, user: object, name: str) -> dict:
    resp = await c.post(
        "/api/crm/campaigns",
        json={"name": name},
        headers=_auth_header_for(user),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_lead(
    c: AsyncClient, user: object, campaign_id: str, *, name: str, email: str
) -> dict:
    resp = await c.post(
        "/api/crm/leads",
        json={"campaign_id": campaign_id, "name": name, "email": email},
        headers=_auth_header_for(user),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_sequence(
    c: AsyncClient, user: object, campaign_id: str, name: str
) -> dict:
    resp = await c.post(
        "/api/crm/sequences",
        json={"campaign_id": campaign_id, "name": name},
        headers=_auth_header_for(user),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _add_step(
    c: AsyncClient,
    user: object,
    sequence_id: str,
    *,
    delay_days: int,
    subject: str,
    body: str = "Hi there",
) -> dict:
    resp = await c.post(
        f"/api/crm/sequences/{sequence_id}/steps",
        json={"delay_days": delay_days, "subject": subject, "body": body},
        headers=_auth_header_for(user),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed_mailbox(
    maker: async_sessionmaker[AsyncSession],
    *,
    user: object,
    email: str = "sender@acme.com",
) -> object:
    """Seed one active, non-paused SMTP mailbox in the user's workspace."""
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus

    async with maker() as session:
        mb = Mailbox(
            user_id=user.id,
            workspace_id=user.workspace_id,
            email_address=email,
            provider=MailboxProvider.smtp,
            smtp_host="smtp.acme.com",
            smtp_port=587,
            smtp_username=email,
            smtp_password_encrypted=b"unused-in-test",
            warmup_status=WarmupStatus.active,
            is_paused=False,
        )
        session.add(mb)
        await session.commit()
        await session.refresh(mb)
        return mb


# --------------------------------------------------------------------------- #
# Sequence CRUD + steps                                                       #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_sequence_and_add_steps(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="seq@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Outbound")
        seq = await _create_sequence(c, user, campaign["id"], "Follow-up")
        assert seq["status"] == "active"
        assert seq["campaign_id"] == campaign["id"]
        assert seq["step_count"] == 0
        assert seq["active_enrollments"] == 0

        s0 = await _add_step(c, user, seq["id"], delay_days=0, subject="Intro")
        s1 = await _add_step(c, user, seq["id"], delay_days=3, subject="Bump")
        # Auto-appended order: 0 then 1.
        assert s0["step_order"] == 0
        assert s1["step_order"] == 1

        steps = await c.get(
            f"/api/crm/sequences/{seq['id']}/steps",
            headers=_auth_header_for(user),
        )
        assert steps.status_code == 200
        ordered = steps.json()
        assert [s["step_order"] for s in ordered] == [0, 1]
        assert [s["delay_days"] for s in ordered] == [0, 3]

        detail = await c.get(
            f"/api/crm/sequences/{seq['id']}",
            headers=_auth_header_for(user),
        )
    assert detail.json()["step_count"] == 2


# --------------------------------------------------------------------------- #
# Enrollment → next_send_at                                                   #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_enroll_lead_sets_next_send_at(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="enr@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "C")
        seq = await _create_sequence(c, user, campaign["id"], "S")
        await _add_step(c, user, seq["id"], delay_days=0, subject="Intro")
        await _add_step(c, user, seq["id"], delay_days=3, subject="Bump")
        lead = await _create_lead(
            c, user, campaign["id"], name="Jane", email="jane@acme.com"
        )

        enroll = await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )
        assert enroll.status_code == 200, enroll.text
        assert enroll.json() == {"enrolled": 1, "skipped": 0}

        enrollments = await c.get(
            f"/api/crm/sequences/{seq['id']}/enrollments",
            headers=_auth_header_for(user),
        )
    body = enrollments.json()
    assert len(body) == 1
    enr = body[0]
    assert enr["status"] == "active"
    assert enr["current_step"] == 0
    assert enr["lead_name"] == "Jane"
    assert enr["lead_email"] == "jane@acme.com"
    # delay 0 → due immediately (next_send_at is set, not null).
    assert enr["next_send_at"] is not None


@pytest.mark.asyncio
async def test_enroll_same_lead_twice_skips(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="dup@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "C")
        seq = await _create_sequence(c, user, campaign["id"], "S")
        await _add_step(c, user, seq["id"], delay_days=0, subject="Intro")
        lead = await _create_lead(
            c, user, campaign["id"], name="Bob", email="bob@acme.com"
        )

        first = await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )
        assert first.json() == {"enrolled": 1, "skipped": 0}

        # Same lead again → skipped (already actively enrolled).
        second = await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )
        assert second.json() == {"enrolled": 0, "skipped": 1}

        # And a duplicate within the same batch is also skipped once.
        lead2 = await _create_lead(
            c, user, campaign["id"], name="Cara", email="cara@acme.com"
        )
        batch = await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead2["id"], lead2["id"]]},
            headers=_auth_header_for(user),
        )
    assert batch.json() == {"enrolled": 1, "skipped": 1}


# --------------------------------------------------------------------------- #
# The scheduler core: process_due_enrollments                                 #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_process_due_sends_step0_and_advances(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """now >= next_send_at → step 0 sent (email_sent activity + last_activity
    bump) and the enrollment advances to step 1 with next_send_at = now + 3d."""
    from app.db.models.crm_lead_activities import CrmLeadActivity
    from app.db.models.crm_leads import CrmLead
    from app.db.models.crm_sequence_enrollments import (
        CrmEnrollmentStatus,
        CrmSequenceEnrollment,
    )
    from app.services import crm_sequence_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="tick@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "C")
        seq = await _create_sequence(c, user, campaign["id"], "S")
        await _add_step(c, user, seq["id"], delay_days=0, subject="Intro")
        await _add_step(c, user, seq["id"], delay_days=3, subject="Bump")
        lead = await _create_lead(
            c, user, campaign["id"], name="Jane", email="jane@acme.com"
        )
        await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )

    lead_id = uuid.UUID(lead["id"])
    now = datetime.now(UTC) + timedelta(minutes=1)  # past the delay-0 due time

    async with maker() as db:
        result = await crm_sequence_service.process_due_enrollments(db, now)

    assert result.processed == 1
    assert result.advanced == 1
    assert result.completed == 0

    async with maker() as db:
        # An email_sent activity for step 1 was written.
        acts = (
            await db.execute(
                select(CrmLeadActivity).where(CrmLeadActivity.lead_id == lead_id)
            )
        ).scalars().all()
        kinds = [a.kind.value if hasattr(a.kind, "value") else a.kind for a in acts]
        assert "email_sent" in kinds
        sent = [a for a in acts if (a.kind.value if hasattr(a.kind, "value") else a.kind) == "email_sent"][0]
        assert "Sequence step 1" in (sent.body or "")
        assert "Intro" in (sent.body or "")

        # last_activity_at was bumped to `now`.
        lead_row = await db.get(CrmLead, lead_id)
        assert lead_row.last_activity_at is not None

        # Enrollment advanced to step 1, still active, next_send_at = now + 3d.
        enr = (
            await db.execute(
                select(CrmSequenceEnrollment).where(
                    CrmSequenceEnrollment.lead_id == lead_id
                )
            )
        ).scalar_one()
        assert enr.current_step == 1
        assert enr.status == CrmEnrollmentStatus.active
        assert enr.next_send_at is not None
        expected = now + timedelta(days=3)
        # Tolerate tz-aware/naive round-trips from SQLite.
        actual = enr.next_send_at
        if actual.tzinfo is None:
            actual = actual.replace(tzinfo=UTC)
        assert abs((actual - expected).total_seconds()) < 2


@pytest.mark.asyncio
async def test_process_due_with_mailbox_sends_via_smtp(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch,
) -> None:
    """With an active mailbox in the workspace and probes-dummy OFF, the tick
    calls smtp_sender.send_email once (recipient = lead.email, subject = step
    subject), still logs the email_sent activity, and advances the enrollment."""
    from app.db.models.crm_lead_activities import CrmLeadActivity
    from app.db.models.crm_sequence_enrollments import (
        CrmEnrollmentStatus,
        CrmSequenceEnrollment,
    )
    from app.services import crm_sequence_service
    from app.services.warmup import smtp_sender

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="live@example.com", plan_id=plan_id)
    await _seed_mailbox(maker, user=user, email="sender@acme.com")

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "C")
        seq = await _create_sequence(c, user, campaign["id"], "S")
        await _add_step(c, user, seq["id"], delay_days=0, subject="Intro")
        await _add_step(c, user, seq["id"], delay_days=3, subject="Bump")
        lead = await _create_lead(
            c, user, campaign["id"], name="Jane", email="jane@acme.com"
        )
        await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )

    lead_id = uuid.UUID(lead["id"])
    calls: list[dict] = []

    async def _fake_send(mailbox, peer, subject, body, is_html, fernet, **kw):
        calls.append(
            {
                "to": peer.email_address,
                "subject": subject,
                "body": body,
                "from": mailbox.email_address,
            }
        )
        return {"message_id": "<x@warmpulse>", "smtp_response": "250 OK"}

    # Patch where the service resolves it (it imports smtp_sender locally).
    monkeypatch.setattr(smtp_sender, "send_email", _fake_send)

    now = datetime.now(UTC) + timedelta(minutes=1)
    async with maker() as db:
        result = await crm_sequence_service.process_due_enrollments(db, now)

    assert result.processed == 1
    assert result.advanced == 1

    # send_email called exactly once, with the lead's email + step subject.
    assert len(calls) == 1
    assert calls[0]["to"] == "jane@acme.com"
    assert calls[0]["subject"] == "Intro"
    assert calls[0]["from"] == "sender@acme.com"

    async with maker() as db:
        acts = (
            await db.execute(
                select(CrmLeadActivity).where(CrmLeadActivity.lead_id == lead_id)
            )
        ).scalars().all()
        kinds = [a.kind.value if hasattr(a.kind, "value") else a.kind for a in acts]
        assert "email_sent" in kinds

        enr = (
            await db.execute(
                select(CrmSequenceEnrollment).where(
                    CrmSequenceEnrollment.lead_id == lead_id
                )
            )
        ).scalar_one()
        assert enr.current_step == 1
        assert enr.status == CrmEnrollmentStatus.active
        assert enr.next_send_at is not None


@pytest.mark.asyncio
async def test_process_due_is_idempotent_across_ticks(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch,
) -> None:
    """A due step must be sent EXACTLY ONCE even if the tick runs again.

    Because ``process_due_enrollments`` advances + commits each enrollment
    *before* the SMTP send, the row is no longer "due" by the time a second
    tick runs back-to-back — so the second tick finds nothing and ``send_email``
    is never invoked a second time. This is the resend-storm guard: a crash that
    re-runs the tick can never re-blast the same step to a real prospect.
    """
    from app.db.models.crm_sequence_enrollments import (
        CrmEnrollmentStatus,
        CrmSequenceEnrollment,
    )
    from app.services import crm_sequence_service
    from app.services.warmup import smtp_sender

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="idem@example.com", plan_id=plan_id)
    await _seed_mailbox(maker, user=user, email="sender@acme.com")

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "C")
        seq = await _create_sequence(c, user, campaign["id"], "S")
        # delay 0 → step 0 is due immediately; a second step keeps the
        # enrollment active after the advance (so we'd notice a re-send).
        await _add_step(c, user, seq["id"], delay_days=0, subject="Intro")
        await _add_step(c, user, seq["id"], delay_days=3, subject="Bump")
        lead = await _create_lead(
            c, user, campaign["id"], name="Jane", email="jane@acme.com"
        )
        await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )

    lead_id = uuid.UUID(lead["id"])

    call_count = 0

    async def _counting_send(mailbox, peer, subject, body, is_html, fernet, **kw):
        nonlocal call_count
        call_count += 1
        return {"message_id": "<x@warmpulse>", "smtp_response": "250 OK"}

    monkeypatch.setattr(smtp_sender, "send_email", _counting_send)

    now = datetime.now(UTC) + timedelta(minutes=1)

    # First tick: step 0 is due → sends once and advances to step 1 (now + 3d).
    async with maker() as db:
        r1 = await crm_sequence_service.process_due_enrollments(db, now)
    assert r1.processed == 1
    assert r1.advanced == 1

    # Second tick at the SAME `now`: the enrollment's next_send_at is already
    # now + 3d (committed by the first tick), so it is no longer due → nothing
    # is processed and send_email is NOT called again.
    async with maker() as db:
        r2 = await crm_sequence_service.process_due_enrollments(db, now)
    assert r2.processed == 0
    assert r2.advanced == 0
    assert r2.completed == 0

    # send_email fired exactly once across both ticks — no resend storm.
    assert call_count == 1

    async with maker() as db:
        enr = (
            await db.execute(
                select(CrmSequenceEnrollment).where(
                    CrmSequenceEnrollment.lead_id == lead_id
                )
            )
        ).scalar_one()
        # Advanced exactly one step and still active (not double-advanced).
        assert enr.current_step == 1
        assert enr.status == CrmEnrollmentStatus.active
        assert enr.next_send_at is not None


@pytest.mark.asyncio
async def test_process_due_send_failure_still_advances(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch,
) -> None:
    """A raising send_email must not bubble out of the tick: the enrollment
    still advances and an email_sent activity (noting the failure) is logged."""
    from app.db.models.crm_lead_activities import CrmLeadActivity
    from app.db.models.crm_sequence_enrollments import (
        CrmEnrollmentStatus,
        CrmSequenceEnrollment,
    )
    from app.services import crm_sequence_service
    from app.services.warmup import smtp_sender

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="boom@example.com", plan_id=plan_id)
    await _seed_mailbox(maker, user=user, email="sender@acme.com")

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "C")
        seq = await _create_sequence(c, user, campaign["id"], "S")
        await _add_step(c, user, seq["id"], delay_days=0, subject="Intro")
        await _add_step(c, user, seq["id"], delay_days=3, subject="Bump")
        lead = await _create_lead(
            c, user, campaign["id"], name="Jane", email="jane@acme.com"
        )
        await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )

    lead_id = uuid.UUID(lead["id"])

    async def _boom(*a, **kw):
        raise RuntimeError("smtp exploded")

    monkeypatch.setattr(smtp_sender, "send_email", _boom)

    now = datetime.now(UTC) + timedelta(minutes=1)
    async with maker() as db:
        # Must not raise.
        result = await crm_sequence_service.process_due_enrollments(db, now)

    assert result.processed == 1
    assert result.advanced == 1

    async with maker() as db:
        acts = (
            await db.execute(
                select(CrmLeadActivity).where(CrmLeadActivity.lead_id == lead_id)
            )
        ).scalars().all()
        kinds = [a.kind.value if hasattr(a.kind, "value") else a.kind for a in acts]
        assert "email_sent" in kinds

        enr = (
            await db.execute(
                select(CrmSequenceEnrollment).where(
                    CrmSequenceEnrollment.lead_id == lead_id
                )
            )
        ).scalar_one()
        # Advanced despite the send blowing up — no stuck rows.
        assert enr.current_step == 1
        assert enr.status == CrmEnrollmentStatus.active


@pytest.mark.asyncio
async def test_process_completes_after_last_step(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Advancing past the final step marks the enrollment completed."""
    from app.db.models.crm_sequence_enrollments import (
        CrmEnrollmentStatus,
        CrmSequenceEnrollment,
    )
    from app.services import crm_sequence_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="done@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "C")
        seq = await _create_sequence(c, user, campaign["id"], "S")
        # Two steps, both delay 0, so two ticks drain the whole sequence.
        await _add_step(c, user, seq["id"], delay_days=0, subject="One")
        await _add_step(c, user, seq["id"], delay_days=0, subject="Two")
        lead = await _create_lead(
            c, user, campaign["id"], name="Z", email="z@acme.com"
        )
        await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )

    lead_id = uuid.UUID(lead["id"])

    # Tick 1: send step 0, advance to step 1 (delay 0 → due now).
    async with maker() as db:
        r1 = await crm_sequence_service.process_due_enrollments(
            db, datetime.now(UTC) + timedelta(seconds=30)
        )
    assert r1.processed == 1 and r1.advanced == 1 and r1.completed == 0

    # Tick 2: send step 1 (the last) → enrollment completes.
    async with maker() as db:
        r2 = await crm_sequence_service.process_due_enrollments(
            db, datetime.now(UTC) + timedelta(seconds=60)
        )
    assert r2.processed == 1 and r2.completed == 1 and r2.advanced == 0

    async with maker() as db:
        enr = (
            await db.execute(
                select(CrmSequenceEnrollment).where(
                    CrmSequenceEnrollment.lead_id == lead_id
                )
            )
        ).scalar_one()
        assert enr.status == CrmEnrollmentStatus.completed
        assert enr.completed_at is not None
        assert enr.next_send_at is None
        assert enr.current_step == 2

    # Tick 3: nothing due anymore.
    async with maker() as db:
        r3 = await crm_sequence_service.process_due_enrollments(
            db, datetime.now(UTC) + timedelta(seconds=90)
        )
    assert r3.processed == 0


@pytest.mark.asyncio
async def test_stop_enrollment_halts_sends(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """A stopped enrollment is never picked up by the scheduler again."""
    from app.db.models.crm_sequence_enrollments import (
        CrmEnrollmentStatus,
        CrmSequenceEnrollment,
    )
    from app.services import crm_sequence_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="stop@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "C")
        seq = await _create_sequence(c, user, campaign["id"], "S")
        await _add_step(c, user, seq["id"], delay_days=0, subject="Intro")
        await _add_step(c, user, seq["id"], delay_days=3, subject="Bump")
        lead = await _create_lead(
            c, user, campaign["id"], name="Q", email="q@acme.com"
        )
        await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )
        enrollments = await c.get(
            f"/api/crm/sequences/{seq['id']}/enrollments",
            headers=_auth_header_for(user),
        )
        enr_id = enrollments.json()[0]["id"]

        stop = await c.post(
            f"/api/crm/enrollments/{enr_id}/stop",
            headers=_auth_header_for(user),
        )
        assert stop.status_code == 204, stop.text

    # Even far in the future, a stopped enrollment is never processed.
    async with maker() as db:
        result = await crm_sequence_service.process_due_enrollments(
            db, datetime.now(UTC) + timedelta(days=30)
        )
    assert result.processed == 0

    async with maker() as db:
        enr = (
            await db.execute(
                select(CrmSequenceEnrollment).where(
                    CrmSequenceEnrollment.id == uuid.UUID(enr_id)
                )
            )
        ).scalar_one()
        assert enr.status == CrmEnrollmentStatus.stopped
        assert enr.next_send_at is None
        # Still parked on step 0 — nothing was sent.
        assert enr.current_step == 0


@pytest.mark.asyncio
async def test_paused_sequence_not_advanced(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Pausing the parent sequence halts its enrollments without losing spot."""
    from app.services import crm_sequence_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="paused@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "C")
        seq = await _create_sequence(c, user, campaign["id"], "S")
        await _add_step(c, user, seq["id"], delay_days=0, subject="Intro")
        lead = await _create_lead(
            c, user, campaign["id"], name="P", email="p@acme.com"
        )
        await c.post(
            f"/api/crm/sequences/{seq['id']}/enroll",
            json={"lead_ids": [lead["id"]]},
            headers=_auth_header_for(user),
        )
        pause = await c.patch(
            f"/api/crm/sequences/{seq['id']}",
            json={"status": "paused"},
            headers=_auth_header_for(user),
        )
        assert pause.status_code == 200, pause.text

    async with maker() as db:
        result = await crm_sequence_service.process_due_enrollments(
            db, datetime.now(UTC) + timedelta(days=1)
        )
    assert result.processed == 0


# --------------------------------------------------------------------------- #
# Cross-workspace isolation                                                   #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_cross_workspace_sequence_404(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user_a = await _make_user(maker, email="wa@example.com", plan_id=plan_id)
    user_b = await _make_user(maker, email="wb@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user_a, "A camp")
        seq = await _create_sequence(c, user_a, campaign["id"], "A seq")
        sid = seq["id"]

        # B cannot read / update / delete / list steps / enroll on A's sequence.
        assert (
            await c.get(
                f"/api/crm/sequences/{sid}", headers=_auth_header_for(user_b)
            )
        ).status_code == 404
        assert (
            await c.patch(
                f"/api/crm/sequences/{sid}",
                json={"name": "hijack"},
                headers=_auth_header_for(user_b),
            )
        ).status_code == 404
        assert (
            await c.delete(
                f"/api/crm/sequences/{sid}", headers=_auth_header_for(user_b)
            )
        ).status_code == 404
        assert (
            await c.get(
                f"/api/crm/sequences/{sid}/steps",
                headers=_auth_header_for(user_b),
            )
        ).status_code == 404
        assert (
            await c.get(
                f"/api/crm/sequences/{sid}/enrollments",
                headers=_auth_header_for(user_b),
            )
        ).status_code == 404
        assert (
            await c.post(
                f"/api/crm/sequences/{sid}/enroll",
                json={"lead_ids": [str(uuid.uuid4())]},
                headers=_auth_header_for(user_b),
            )
        ).status_code == 404


@pytest.mark.asyncio
async def test_create_sequence_cross_workspace_campaign_404(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Creating a sequence under another workspace's campaign 404s."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user_a = await _make_user(maker, email="xa@example.com", plan_id=plan_id)
    user_b = await _make_user(maker, email="xb@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user_a, "A camp")
        resp = await c.post(
            "/api/crm/sequences",
            json={"campaign_id": campaign["id"], "name": "sneaky"},
            headers=_auth_header_for(user_b),
        )
    assert resp.status_code == 404, resp.text
