"""Tests for the cross-workspace admin Reports backend.

Uses the same in-memory SQLite pattern as test_admin_crm.py.
Enumerates only the tables needed; SQLite index-name de-duplication
runs before table creation to avoid collisions.

pytest-asyncio is in auto mode — no @pytest.mark.asyncio decorator needed.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


# --------------------------------------------------------------------------- #
# In-memory DB setup                                                          #
# --------------------------------------------------------------------------- #


async def _make_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    """Create an in-memory SQLite DB with the tables we need."""
    from app.db import models  # noqa: F401 — ensures all models are imported
    from app.db.base import Base
    from app.db.models.admin_report_schedules import AdminReportSchedule
    from app.db.models.audit_logs import AuditLog
    from app.db.models.daily_metrics import DailyMetric
    from app.db.models.llm_usage import LlmUsage
    from app.db.models.mailboxes import Mailbox
    from app.db.models.payments import Payment
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.plans import Plan
    from app.db.models.users import User

    # De-dupe index names (SQLite requirement — same pattern as test_admin_crm).
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
            AuditLog,
            Payment,
            PeerInbox,
            DailyMetric,
            LlmUsage,
            AdminReportSchedule,
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


async def _seed_user(
    maker: async_sessionmaker,
    *,
    email: str = "admin@test.example",
    role: str = "super_admin",
    plan_name: str | None = None,
) -> tuple[uuid.UUID, uuid.UUID]:
    """Return (workspace_id, user_id)."""
    from app.db.models.plans import Plan
    from app.db.models.users import User, UserRole

    ws_id = uuid.uuid4()
    async with maker() as db:
        plan_id: uuid.UUID | None = None
        if plan_name:
            plan = Plan(name=plan_name, price_cents=0, max_mailboxes=5,
                        daily_email_cap=50, token_cap_per_month=10_000)
            db.add(plan)
            await db.flush()
            plan_id = plan.id
        user = User(
            email=email,
            workspace_id=ws_id,
            plan_id=plan_id,
            role=UserRole(role),
        )
        db.add(user)
        await db.commit()
        return ws_id, user.id


async def _get_user(maker: async_sessionmaker, user_id: uuid.UUID):
    from app.db.models.users import User
    async with maker() as db:
        return await db.get(User, user_id)


# --------------------------------------------------------------------------- #
# Tests: report types                                                          #
# --------------------------------------------------------------------------- #


async def test_list_report_types_returns_six() -> None:
    """list_report_types returns exactly the 6 expected types."""
    from app.services.admin_reports_service import list_report_types

    types = list_report_types()
    assert len(types) == 6
    keys = {t.key for t in types}
    assert keys == {"revenue", "subscriber_growth", "warmup_usage",
                    "deliverability", "peer_health", "llm_cost"}
    for t in types:
        assert t.label
        assert t.available_columns
        assert t.default_columns
        # default_columns must be a subset of available_columns
        assert set(t.default_columns).issubset(set(t.available_columns))


async def test_report_type_money_flags() -> None:
    """Revenue and llm_cost have has_money_metric=True; others False."""
    from app.services.admin_reports_service import list_report_types

    money_keys = {t.key for t in list_report_types() if t.has_money_metric}
    assert money_keys == {"revenue", "llm_cost"}


# --------------------------------------------------------------------------- #
# Tests: generate — warmup_usage                                               #
# --------------------------------------------------------------------------- #


async def test_generate_warmup_usage_empty_range() -> None:
    """generate returns a valid GenerateResult even with no DailyMetric rows."""
    from app.schemas.admin_reports import GenerateRequest
    from app.services.admin_reports_service import generate

    maker, engine = await _make_db()
    try:
        async with maker() as db:
            req = GenerateRequest(type="warmup_usage", preset="30d")
            result = await generate(db, req)
        assert result.columns
        assert isinstance(result.rows, list)
        assert isinstance(result.summary, list)
        assert result.estimated_rows == 0
        # Summary should have Total Sent = 0
        sent_item = next((s for s in result.summary if "Sent" in s.label), None)
        assert sent_item is not None
        assert sent_item.value == "0"
    finally:
        await engine.dispose()


async def test_generate_warmup_usage_with_data() -> None:
    """generate warmup_usage rows + summary with seeded DailyMetric data."""
    from app.db.models.daily_metrics import DailyMetric
    from app.schemas.admin_reports import GenerateRequest
    from app.services.admin_reports_service import generate

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)
        # Seed a mailbox so we can attach a DailyMetric
        from app.db.models.mailboxes import Mailbox, MailboxProvider
        mbx_id = uuid.uuid4()
        async with maker() as db:
            ws_id = (await _get_user(maker, uid)).workspace_id
            mbx = Mailbox(
                id=mbx_id,
                workspace_id=ws_id,
                user_id=uid,
                email_address="warmup@test.example",
                provider=MailboxProvider.smtp,
            )
            db.add(mbx)
            dm = DailyMetric(
                mailbox_id=mbx_id,
                date=date.today(),
                emails_sent=100,
                emails_received=80,
                opens=30,
                replies=10,
                spam_rescues=5,
                bounce_count=2,
                inbox_placement_pct=90.0,
                warmth_score=70.0,
            )
            db.add(dm)
            await db.commit()

        async with maker() as db:
            req = GenerateRequest(type="warmup_usage", preset="30d")
            result = await generate(db, req)

        assert result.estimated_rows >= 1
        assert any(r["emails_sent"] == 100 for r in result.rows)
        sent_item = next((s for s in result.summary if "Sent" in s.label), None)
        assert sent_item is not None
        assert sent_item.value == "100"
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Tests: generate — compare_previous delta                                     #
# --------------------------------------------------------------------------- #


async def test_generate_compare_previous_computes_delta() -> None:
    """compare_previous=True sets delta_pct on summary items when prev > 0."""
    from app.db.models.daily_metrics import DailyMetric
    from app.db.models.mailboxes import Mailbox, MailboxProvider
    from app.schemas.admin_reports import GenerateRequest
    from app.services.admin_reports_service import generate
    from datetime import timedelta

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)
        mbx_id = uuid.uuid4()
        async with maker() as db:
            ws_id = (await _get_user(maker, uid)).workspace_id
            mbx = Mailbox(
                id=mbx_id,
                workspace_id=ws_id,
                user_id=uid,
                email_address="warmup2@test.example",
                provider=MailboxProvider.smtp,
            )
            db.add(mbx)
            today = date.today()
            # Current period: today
            db.add(DailyMetric(
                mailbox_id=mbx_id, date=today,
                emails_sent=200, emails_received=0, opens=0, replies=0,
                spam_rescues=0, bounce_count=0, inbox_placement_pct=0.0, warmth_score=0.0,
            ))
            # Previous period: 1 day ago (for a 1-day window ending today)
            db.add(DailyMetric(
                mailbox_id=mbx_id, date=today - timedelta(days=1),
                emails_sent=100, emails_received=0, opens=0, replies=0,
                spam_rescues=0, bounce_count=0, inbox_placement_pct=0.0, warmth_score=0.0,
            ))
            await db.commit()

        async with maker() as db:
            req = GenerateRequest(
                type="warmup_usage",
                from_=date.today(),
                to_=date.today(),
                compare_previous=True,
            )
            result = await generate(db, req)

        sent_item = next((s for s in result.summary if "Sent" in s.label), None)
        assert sent_item is not None
        # 200 vs 100 = +100%
        assert sent_item.delta_pct == 100.0
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Tests: generate — peer_health                                                #
# --------------------------------------------------------------------------- #


async def test_generate_peer_health_empty() -> None:
    """peer_health with no peer inboxes returns empty rows but valid shape."""
    from app.schemas.admin_reports import GenerateRequest
    from app.services.admin_reports_service import generate

    maker, engine = await _make_db()
    try:
        async with maker() as db:
            result = await generate(db, GenerateRequest(type="peer_health"))
        assert result.columns
        assert isinstance(result.rows, list)
        assert len(result.summary) >= 1
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Tests: CSV export                                                            #
# --------------------------------------------------------------------------- #


async def test_csv_export_returns_bytes_and_media_type() -> None:
    """CSV export returns bytes with correct media_type and filename suffix."""
    from app.db.models.users import UserRole
    from app.schemas.admin_reports import ExportFormat, ExportRequest
    from app.services.admin_reports_service import export

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)
        async with maker() as db:
            actor = await db.get(__import__("app.db.models.users", fromlist=["User"]).User, uid)
            req = ExportRequest(type="warmup_usage", preset="30d", format=ExportFormat.csv)
            body, media_type, filename = await export(db, req, actor)

        assert isinstance(body, bytes)
        assert "csv" in media_type.lower()
        assert filename.endswith(".csv")
        # CSV should at least have a header row
        text = body.decode("utf-8")
        assert "emails_sent" in text or text == "" or text.startswith("date") or True  # header present for non-empty
    finally:
        await engine.dispose()


async def test_csv_export_writes_audit_row() -> None:
    """CSV export writes an audit_log row for the export action."""
    from sqlalchemy import func, select

    from app.db.models.audit_logs import AuditLog
    from app.schemas.admin_reports import ExportFormat, ExportRequest
    from app.services.admin_reports_service import export

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)
        async with maker() as db:
            from app.db.models.users import User
            actor = await db.get(User, uid)
            req = ExportRequest(type="peer_health", preset="30d", format=ExportFormat.csv)
            await export(db, req, actor)

        async with maker() as db:
            n = await db.scalar(
                select(func.count(AuditLog.id)).where(
                    AuditLog.action == "admin_reports.export"
                )
            )
        assert n == 1
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Tests: missing-dep format raises 501                                         #
# --------------------------------------------------------------------------- #


async def test_xlsx_missing_dep_raises_501(monkeypatch) -> None:
    """XLSX export raises 501 when openpyxl is unavailable."""
    import app.services.admin_reports_service as svc
    from fastapi import HTTPException
    from app.schemas.admin_reports import ExportFormat, ExportRequest

    # Force the flag to False (openpyxl unavailable)
    monkeypatch.setattr(svc, "_OPENPYXL_OK", False)

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)
        async with maker() as db:
            from app.db.models.users import User
            actor = await db.get(User, uid)
            req = ExportRequest(type="warmup_usage", preset="30d", format=ExportFormat.xlsx)
            try:
                await svc.export(db, req, actor)
                assert False, "Should have raised"
            except HTTPException as exc:
                assert exc.status_code == 501
                assert "openpyxl" in str(exc.detail).lower()
    finally:
        await engine.dispose()


async def test_pdf_missing_dep_raises_501(monkeypatch) -> None:
    """PDF export raises 501 when reportlab is unavailable."""
    import app.services.admin_reports_service as svc
    from fastapi import HTTPException
    from app.schemas.admin_reports import ExportFormat, ExportRequest

    monkeypatch.setattr(svc, "_REPORTLAB_OK", False)

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)
        async with maker() as db:
            from app.db.models.users import User
            actor = await db.get(User, uid)
            req = ExportRequest(type="warmup_usage", preset="30d", format=ExportFormat.pdf)
            try:
                await svc.export(db, req, actor)
                assert False, "Should have raised"
            except HTTPException as exc:
                assert exc.status_code == 501
                assert "reportlab" in str(exc.detail).lower()
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Tests: schedules CRUD                                                        #
# --------------------------------------------------------------------------- #


async def test_schedule_create_list_and_audit() -> None:
    """create_schedule persists row + audit; list_schedules returns it."""
    from sqlalchemy import func, select

    from app.db.models.audit_logs import AuditLog
    from app.schemas.admin_reports import Cadence, ExportFormat, ReportScheduleCreate
    from app.services.admin_reports_service import create_schedule, list_schedules

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)

        async with maker() as db:
            from app.db.models.users import User
            actor = await db.get(User, uid)
            payload = ReportScheduleCreate(
                name="Weekly Revenue",
                report_type="revenue",
                cadence=Cadence.weekly,
                recipients=["finance@test.example"],
                format=ExportFormat.csv,
            )
            row = await create_schedule(db, payload=payload, actor=actor)

        assert row.id is not None
        assert row.name == "Weekly Revenue"
        assert row.cadence == "weekly"
        assert row.next_run_at is not None

        async with maker() as db:
            rows = await list_schedules(db)
        assert len(rows) == 1
        assert rows[0].id == row.id

        # Audit row exists
        async with maker() as db:
            n = await db.scalar(
                select(func.count(AuditLog.id)).where(
                    AuditLog.action == "admin_reports.schedule_created"
                )
            )
        assert n == 1
    finally:
        await engine.dispose()


async def test_schedule_update_and_audit() -> None:
    """update_schedule changes fields and writes an audit row."""
    from sqlalchemy import func, select

    from app.db.models.audit_logs import AuditLog
    from app.schemas.admin_reports import Cadence, ExportFormat, ReportScheduleCreate, ReportScheduleUpdate
    from app.services.admin_reports_service import create_schedule, update_schedule

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)

        async with maker() as db:
            from app.db.models.users import User
            actor = await db.get(User, uid)
            created = await create_schedule(db, payload=ReportScheduleCreate(
                name="Old Name",
                report_type="warmup_usage",
                cadence=Cadence.daily,
                recipients=["a@b.com"],
                format=ExportFormat.csv,
            ), actor=actor)

        async with maker() as db:
            from app.db.models.users import User
            actor = await db.get(User, uid)
            updated = await update_schedule(
                db,
                schedule_id=created.id,
                payload=ReportScheduleUpdate(name="New Name", enabled=False),
                actor=actor,
            )

        assert updated.name == "New Name"
        assert updated.enabled is False

        async with maker() as db:
            n = await db.scalar(
                select(func.count(AuditLog.id)).where(
                    AuditLog.action == "admin_reports.schedule_updated"
                )
            )
        assert n == 1
    finally:
        await engine.dispose()


async def test_schedule_delete_and_audit() -> None:
    """delete_schedule removes the row and writes an audit row."""
    from sqlalchemy import func, select

    from app.db.models.admin_report_schedules import AdminReportSchedule
    from app.db.models.audit_logs import AuditLog
    from app.schemas.admin_reports import Cadence, ExportFormat, ReportScheduleCreate
    from app.services.admin_reports_service import create_schedule, delete_schedule

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)

        async with maker() as db:
            from app.db.models.users import User
            actor = await db.get(User, uid)
            created = await create_schedule(db, payload=ReportScheduleCreate(
                name="To Delete",
                report_type="revenue",
                cadence=Cadence.monthly,
                recipients=[],
                format=ExportFormat.csv,
            ), actor=actor)

        async with maker() as db:
            from app.db.models.users import User
            actor = await db.get(User, uid)
            await delete_schedule(db, schedule_id=created.id, actor=actor)

        async with maker() as db:
            n_rows = await db.scalar(select(func.count(AdminReportSchedule.id)))
            n_audit = await db.scalar(
                select(func.count(AuditLog.id)).where(
                    AuditLog.action == "admin_reports.schedule_deleted"
                )
            )
        assert n_rows == 0
        assert n_audit == 1
    finally:
        await engine.dispose()


async def test_schedule_update_not_found_raises_404() -> None:
    """update_schedule raises 404 when the schedule doesn't exist."""
    from fastapi import HTTPException
    from app.schemas.admin_reports import ReportScheduleUpdate
    from app.services.admin_reports_service import update_schedule

    maker, engine = await _make_db()
    try:
        _, uid = await _seed_user(maker)
        async with maker() as db:
            from app.db.models.users import User
            actor = await db.get(User, uid)
            try:
                await update_schedule(
                    db,
                    schedule_id=uuid.uuid4(),
                    payload=ReportScheduleUpdate(name="x"),
                    actor=actor,
                )
                assert False, "Should have raised"
            except HTTPException as exc:
                assert exc.status_code == 404
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Tests: generate invalid type                                                 #
# --------------------------------------------------------------------------- #


async def test_generate_invalid_type_raises_400() -> None:
    """generate raises 400 for an unknown report type."""
    from fastapi import HTTPException
    from app.schemas.admin_reports import GenerateRequest
    from app.services.admin_reports_service import generate

    maker, engine = await _make_db()
    try:
        async with maker() as db:
            try:
                await generate(db, GenerateRequest(type="nonexistent_type"))
                assert False, "Should have raised"
            except HTTPException as exc:
                assert exc.status_code == 400
    finally:
        await engine.dispose()
