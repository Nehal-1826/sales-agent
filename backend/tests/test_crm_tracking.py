"""CRM open/reply tracking — tokens, dedup, and the public open-pixel route."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.services import crm_tracking

# --------------------------------------------------------------------------- #
# Pure token / message-id helpers (no DB)                                      #
# --------------------------------------------------------------------------- #


def test_open_token_round_trips() -> None:
    lead, enr = uuid.uuid4(), uuid.uuid4()
    token = crm_tracking.make_open_token(lead, enr, 2)
    parsed = crm_tracking.parse_open_token(token)
    assert parsed == {"lead_id": lead, "enrollment_id": enr, "step": 2}


def test_open_token_rejects_tampered_signature() -> None:
    token = crm_tracking.make_open_token(uuid.uuid4(), uuid.uuid4(), 1)
    assert crm_tracking.parse_open_token(token + "x") is None  # corrupt sig
    assert crm_tracking.parse_open_token("garbage") is None
    assert crm_tracking.parse_open_token("") is None


def test_sequence_message_id_round_trips() -> None:
    enr = uuid.uuid4()
    mid = crm_tracking.sequence_message_id(enr, 3)
    assert crm_tracking.parse_sequence_message_id(f"In reply to {mid} thanks") == (enr, 3)
    assert crm_tracking.parse_sequence_message_id("<other@x>") is None
    assert crm_tracking.parse_sequence_message_id(None) is None


def test_build_tracked_html_embeds_pixel_and_escapes_body() -> None:
    html = crm_tracking.build_tracked_html("Hi <b>there</b>\nLine2", "https://x/p.gif")
    assert 'src="https://x/p.gif"' in html
    assert "&lt;b&gt;" in html  # body HTML-escaped, not injected
    assert "<br>" in html       # newline preserved as <br>


# --------------------------------------------------------------------------- #
# DB-backed: record_open / record_reply dedup + pixel route                    #
# --------------------------------------------------------------------------- #


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db import models  # noqa: F401
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


async def _seed_lead(maker, *, workspace_id: uuid.UUID) -> uuid.UUID:
    from app.db.models.crm_leads import CrmLead

    async with maker() as db:
        lead = CrmLead(
            workspace_id=workspace_id,
            campaign_id=uuid.uuid4(),
            name="Jane Prospect",
            email="jane@prospect.test",
        )
        db.add(lead)
        await db.commit()
        return lead.id


@pytest.mark.asyncio
async def test_record_open_is_idempotent_per_step() -> None:
    from sqlalchemy import func, select

    from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity

    maker, engine = await _setup_db()
    try:
        ws = uuid.uuid4()
        lead_id = await _seed_lead(maker, workspace_id=ws)
        enr = uuid.uuid4()

        async with maker() as db:
            assert await crm_tracking.record_open(
                db, lead_id=lead_id, enrollment_id=enr, step=1
            ) == "recorded"
        async with maker() as db:
            # Pixel fires again for the same send → counted once.
            assert await crm_tracking.record_open(
                db, lead_id=lead_id, enrollment_id=enr, step=1
            ) == "duplicate"
        async with maker() as db:
            # A different step (a later sequence email) is a separate open.
            assert await crm_tracking.record_open(
                db, lead_id=lead_id, enrollment_id=enr, step=2
            ) == "recorded"

        async with maker() as db:
            n = await db.scalar(
                select(func.count(CrmLeadActivity.id)).where(
                    CrmLeadActivity.kind == CrmActivityKind.email_opened
                )
            )
            assert n == 2
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_record_reply_is_idempotent_per_enrollment() -> None:
    from sqlalchemy import func, select

    from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
    from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment

    maker, engine = await _setup_db()
    try:
        ws = uuid.uuid4()
        lead_id = await _seed_lead(maker, workspace_id=ws)
        async with maker() as db:
            enr = CrmSequenceEnrollment(
                workspace_id=ws,
                sequence_id=uuid.uuid4(),
                lead_id=lead_id,
                current_step=1,
            )
            db.add(enr)
            await db.commit()
            enr_id = enr.id

        async with maker() as db:
            assert await crm_tracking.record_reply(
                db, enrollment_id=enr_id, step=1
            ) == "recorded"
        async with maker() as db:
            # Replies to a later step in the same thread don't double-count.
            assert await crm_tracking.record_reply(
                db, enrollment_id=enr_id, step=2
            ) == "duplicate"

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
async def test_open_pixel_route_returns_gif_and_records_open() -> None:
    from sqlalchemy import func, select

    from app.api.routes.crm import track_open_pixel
    from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity

    maker, engine = await _setup_db()
    try:
        ws = uuid.uuid4()
        lead_id = await _seed_lead(maker, workspace_id=ws)
        enr = uuid.uuid4()
        token = crm_tracking.make_open_token(lead_id, enr, 1)

        async with maker() as db:
            resp = await track_open_pixel(token, db)
        assert resp.media_type == "image/gif"
        assert resp.body == crm_tracking.TRANSPARENT_GIF
        assert "no-store" in resp.headers["Cache-Control"]

        async with maker() as db:
            n = await db.scalar(
                select(func.count(CrmLeadActivity.id)).where(
                    CrmLeadActivity.kind == CrmActivityKind.email_opened
                )
            )
            assert n == 1

        # A forged token still returns the gif but records nothing more.
        async with maker() as db:
            resp2 = await track_open_pixel("forged-token", db)
        assert resp2.body == crm_tracking.TRANSPARENT_GIF
        async with maker() as db:
            n2 = await db.scalar(
                select(func.count(CrmLeadActivity.id)).where(
                    CrmLeadActivity.kind == CrmActivityKind.email_opened
                )
            )
            assert n2 == 1
    finally:
        await engine.dispose()
