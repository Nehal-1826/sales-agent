"""Tests for the cross-workspace admin CRM backend.

Uses the same in-memory SQLite pattern as test_crm_tracking.py.
Enumerates CRM tables + Users + Plans + AuditLogs; de-dupes any
index name collisions (SQLite doesn't support named indexes across
tables like Postgres does).

pytest-asyncio is in auto mode, so no @pytest.mark.asyncio needed.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


# --------------------------------------------------------------------------- #
# In-memory DB setup                                                          #
# --------------------------------------------------------------------------- #


async def _make_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    """Create an in-memory SQLite DB with only the tables we need."""
    from app.db import models  # noqa: F401 — ensures all models are imported
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.crm_campaigns import CrmCampaign
    from app.db.models.crm_lead_activities import CrmLeadActivity
    from app.db.models.crm_leads import CrmLead
    from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment
    from app.db.models.crm_sequence_steps import CrmSequenceStep
    from app.db.models.crm_sequences import CrmSequence
    from app.db.models.plans import Plan
    from app.db.models.users import User

    # De-dupe index names (SQLite requirement).
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
            AuditLog,
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
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    return maker, engine


# --------------------------------------------------------------------------- #
# Seed helpers                                                                 #
# --------------------------------------------------------------------------- #


async def _seed_workspace(
    maker: async_sessionmaker,
    *,
    email: str,
    plan_name: str | None = None,
) -> tuple[uuid.UUID, uuid.UUID]:
    """Return (workspace_id, user_id).  Optionally creates a Plan row."""
    from app.db.models.plans import Plan
    from app.db.models.users import User

    ws_id = uuid.uuid4()
    async with maker() as db:
        plan_id: uuid.UUID | None = None
        if plan_name:
            plan = Plan(name=plan_name, price_cents=0, max_mailboxes=5, daily_email_cap=50, token_cap_per_month=10_000)
            db.add(plan)
            await db.flush()
            plan_id = plan.id
        user = User(email=email, workspace_id=ws_id, plan_id=plan_id)
        db.add(user)
        await db.commit()
        user_id = user.id
    return ws_id, user_id


async def _seed_crm(
    maker: async_sessionmaker,
    *,
    workspace_id: uuid.UUID,
    n_leads: int = 3,
    n_sent: int = 5,
    n_opened: int = 2,
    n_replied: int = 1,
    sequence_paused: bool = False,
) -> dict:
    """Seed one campaign + one sequence + leads + activities. Returns ids."""
    from app.db.models.crm_campaigns import CrmCampaign
    from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
    from app.db.models.crm_leads import CrmLead
    from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment
    from app.db.models.crm_sequences import CrmSequence, CrmSequenceStatus

    async with maker() as db:
        # Campaign
        campaign = CrmCampaign(workspace_id=workspace_id, name="TestCampaign")
        db.add(campaign)
        await db.flush()

        # Leads
        leads = [
            CrmLead(
                workspace_id=workspace_id,
                campaign_id=campaign.id,
                name=f"Lead {i}",
                email=f"lead{i}@test.example",
            )
            for i in range(n_leads)
        ]
        for l in leads:
            db.add(l)
        await db.flush()

        # Sequence
        seq_status = CrmSequenceStatus.paused if sequence_paused else CrmSequenceStatus.active
        seq = CrmSequence(
            workspace_id=workspace_id,
            campaign_id=campaign.id,
            name="TestSeq",
            status=seq_status,
        )
        db.add(seq)
        await db.flush()

        # Enrollment for first lead
        enr = CrmSequenceEnrollment(
            workspace_id=workspace_id,
            sequence_id=seq.id,
            lead_id=leads[0].id,
        )
        db.add(enr)
        await db.flush()

        # Activities
        def _act(kind: CrmActivityKind, lead_id: uuid.UUID) -> CrmLeadActivity:
            return CrmLeadActivity(
                workspace_id=workspace_id,
                lead_id=lead_id,
                kind=kind,
            )

        acts = (
            [_act(CrmActivityKind.email_sent, leads[0].id) for _ in range(n_sent)]
            + [_act(CrmActivityKind.email_opened, leads[0].id) for _ in range(n_opened)]
            + [_act(CrmActivityKind.email_replied, leads[0].id) for _ in range(n_replied)]
        )
        for a in acts:
            db.add(a)
        await db.commit()

        return {
            "campaign_id": campaign.id,
            "sequence_id": seq.id,
            "enrollment_id": enr.id,
            "lead_ids": [l.id for l in leads],
        }


# --------------------------------------------------------------------------- #
# Tests                                                                        #
# --------------------------------------------------------------------------- #


async def test_overview_totals_and_rates() -> None:
    """Overview sums across both workspaces and computes correct rates."""
    from app.services.admin_crm_service import get_overview

    maker, engine = await _make_db()
    try:
        ws1, _ = await _seed_workspace(maker, email="alpha@test.example", plan_name="Pro")
        ws2, _ = await _seed_workspace(maker, email="beta@test.example", plan_name="Starter")
        await _seed_crm(maker, workspace_id=ws1, n_leads=3, n_sent=10, n_opened=4, n_replied=2)
        await _seed_crm(maker, workspace_id=ws2, n_leads=2, n_sent=6, n_opened=3, n_replied=1, sequence_paused=True)

        async with maker() as db:
            overview = await get_overview(db)

        # Totals
        assert overview.total_campaigns == 2
        assert overview.total_leads == 5
        assert overview.sequences_active == 1
        assert overview.sequences_paused == 1
        assert overview.active_enrollments == 2  # one per workspace

        # Rates (16 sent total, 7 opened, 3 replied)
        assert overview.open_rate == round(7 / 16, 4)
        assert overview.reply_rate == round(3 / 16, 4)

        # Two workspace rows present
        assert len(overview.workspaces) == 2
        ws_ids = {r.workspace_id for r in overview.workspaces}
        assert ws1 in ws_ids and ws2 in ws_ids

        # Workspace isolation in overview rows
        ws1_row = next(r for r in overview.workspaces if r.workspace_id == ws1)
        assert ws1_row.leads == 3
        assert ws1_row.sequences_active == 1
        assert ws1_row.sequences_paused == 0
        assert ws1_row.open_rate == round(4 / 10, 4)
        assert ws1_row.reply_rate == round(2 / 10, 4)
        assert ws1_row.plan == "Pro"
        assert ws1_row.owner_email == "alpha@test.example"

        ws2_row = next(r for r in overview.workspaces if r.workspace_id == ws2)
        assert ws2_row.leads == 2
        assert ws2_row.sequences_paused == 1
    finally:
        await engine.dispose()


async def test_workspace_detail_isolates_data() -> None:
    """get_workspace_detail only returns that workspace's data."""
    from app.services.admin_crm_service import get_workspace_detail

    maker, engine = await _make_db()
    try:
        ws1, _ = await _seed_workspace(maker, email="ws1@test.example")
        ws2, _ = await _seed_workspace(maker, email="ws2@test.example")
        await _seed_crm(maker, workspace_id=ws1, n_leads=4, n_sent=8, n_opened=3, n_replied=2)
        await _seed_crm(maker, workspace_id=ws2, n_leads=1, n_sent=2, n_opened=0, n_replied=0)

        async with maker() as db:
            detail = await get_workspace_detail(db, ws1)

        assert detail is not None
        assert detail.workspace_id == ws1
        assert detail.leads == 4
        assert detail.campaigns == 1
        assert detail.sequences_active == 1
        assert detail.sequences_paused == 0
        assert len(detail.campaign_list) == 1
        assert detail.campaign_list[0].leads == 4
        assert len(detail.sequence_list) == 1
        assert detail.sequence_list[0].paused is False
        # open_rate = 3/8
        assert detail.open_rate == round(3 / 8, 4)
        # reply_rate = 2/8
        assert detail.reply_rate == round(2 / 8, 4)
        # Activities exist
        assert len(detail.recent_activities) > 0
        kinds_seen = {a.kind for a in detail.recent_activities}
        assert "email_sent" in kinds_seen
    finally:
        await engine.dispose()


async def test_workspace_detail_returns_none_for_missing() -> None:
    """get_workspace_detail returns None for an unknown workspace."""
    from app.services.admin_crm_service import get_workspace_detail

    maker, engine = await _make_db()
    try:
        async with maker() as db:
            result = await get_workspace_detail(db, uuid.uuid4())
        assert result is None
    finally:
        await engine.dispose()


async def test_set_sequence_status_pause_and_audit() -> None:
    """set_sequence_status toggles CrmSequence.status and writes an audit row."""
    from sqlalchemy import func, select

    from app.db.models.audit_logs import AuditLog
    from app.db.models.crm_sequences import CrmSequenceStatus
    from app.db.models.users import User, UserRole
    from app.services.admin_crm_service import set_sequence_status

    maker, engine = await _make_db()
    try:
        ws1, uid1 = await _seed_workspace(maker, email="admin@test.example")
        ids = await _seed_crm(maker, workspace_id=ws1)
        seq_id = ids["sequence_id"]

        # Build a minimal User object to act as the admin
        async with maker() as db:
            actor = await db.get(User, uid1)
            assert actor is not None
            actor.role = UserRole.super_admin
            await db.commit()

        # Pause the sequence
        async with maker() as db:
            actor = await db.get(User, uid1)
            seq = await set_sequence_status(db, sequence_id=seq_id, paused=True, actor=actor)
        status_val = seq.status.value if hasattr(seq.status, "value") else str(seq.status)
        assert status_val == "paused"

        # Check audit row was written
        async with maker() as db:
            n_audit = await db.scalar(
                select(func.count(AuditLog.id)).where(
                    AuditLog.action == "admin_crm.sequence_status_changed"
                )
            )
        assert n_audit == 1

        # Resume the sequence
        async with maker() as db:
            actor = await db.get(User, uid1)
            seq2 = await set_sequence_status(db, sequence_id=seq_id, paused=False, actor=actor)
        status_val2 = seq2.status.value if hasattr(seq2.status, "value") else str(seq2.status)
        assert status_val2 == "active"

        # Now two audit rows
        async with maker() as db:
            n_audit2 = await db.scalar(
                select(func.count(AuditLog.id)).where(
                    AuditLog.action == "admin_crm.sequence_status_changed"
                )
            )
        assert n_audit2 == 2
    finally:
        await engine.dispose()


async def test_zero_division_guard_for_rates() -> None:
    """open_rate and reply_rate return 0.0 when no emails have been sent."""
    from app.services.admin_crm_service import get_workspace_detail

    maker, engine = await _make_db()
    try:
        ws, _ = await _seed_workspace(maker, email="zero@test.example")
        await _seed_crm(maker, workspace_id=ws, n_sent=0, n_opened=0, n_replied=0)

        async with maker() as db:
            detail = await get_workspace_detail(db, ws)

        assert detail is not None
        assert detail.open_rate == 0.0
        assert detail.reply_rate == 0.0
    finally:
        await engine.dispose()
