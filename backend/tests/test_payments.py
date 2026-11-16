"""Tests for the dummy payments flow + admin reporting."""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# ---------- fixtures ----------


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.payments import Payment
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.workspace_settings import WorkspaceSetting

    # See test_plans._dedupe_metadata_indexes for rationale.
    _dedupe_metadata_indexes(Base)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Only create the tables this flow actually touches — other models have
    # duplicate-index quirks on SQLite that aren't mine to fix. Mailbox is
    # included because the dummy-payment transition counts the workspace's
    # mailboxes (payments_service: "skip trial allowance if a mailbox exists").
    # WorkspaceSetting is required because the plan transition
    # (_transition_after_payment → sync_workspace_auto_crm) reads/writes it.
    tables = [t.__table__ for t in (User, Plan, Payment, AuditLog, Mailbox, WorkspaceSetting)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    # autoflush=False matches prod SessionLocal — without it an autoflush
    # between the audit insert failure and subsequent DB touches trips the
    # session into PendingRollback.
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


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


# ---------- factories ----------


async def _seed_plan(
    maker: async_sessionmaker[AsyncSession],
    *,
    name: str,
    price_cents: int,
    public: bool = True,
) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as session:
        plan = Plan(
            name=name,
            price_cents=price_cents,
            max_mailboxes=1,
            daily_email_cap=50,
            token_cap_per_month=30_000,
            capabilities={},
            is_active=True,
            is_public=public,
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        return plan.id


async def _make_client_user(
    maker: async_sessionmaker[AsyncSession], email: str = "client@example.com"
) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.signed_up,
            totp_enabled=False,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


async def _make_super_admin(maker: async_sessionmaker[AsyncSession]) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email="admin@example.com",
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


def _auth_header_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


# ---------- tests ----------


@pytest.mark.asyncio
async def test_dummy_payment_blocked_for_hidden_plan(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """A hidden (is_public=False) plan can't be purchased by a new subscriber."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Agency", price_cents=9900, public=False)
    user = await _make_client_user(maker)

    body = {
        "plan_id": str(plan_id),
        "card_number": "4242424242424242",
        "cvc": "123",
        "expiry_mmyy": "12/29",
        "cardholder_name": "Test User",
        "country": "IN",
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post("/api/payments/dummy", json=body, headers=_auth_header_for(user))

    assert resp.status_code == 403, resp.text

    # No payment row, user untouched.
    from app.db.models.payments import Payment
    from app.db.models.users import User as DBUser

    async with maker() as session:
        refreshed = await session.get(DBUser, user.id)
        assert refreshed is not None
        assert refreshed.plan_id is None
        rows = (
            await session.execute(select(Payment).where(Payment.user_id == user.id))
        ).scalars().all()
        assert rows == []


@pytest.mark.asyncio
async def test_quick_upgrade_sets_plan_and_does_not_unsuspend(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """quick-upgrade switches an ACTIVE user's plan, but must NOT clear
    suspension, and a suspended user is blocked entirely — they cannot use it
    to self-unsuspend or self-upgrade (security fix: removed is_suspended=False
    and the auth layer rejects suspended users)."""
    from app.db.models.users import User as DBUser

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro", price_cents=4900)
    transport = ASGITransport(app=app)

    # 1) A normal (non-suspended) client can switch plan.
    user = await _make_client_user(maker)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            f"/api/payments/quick-upgrade?plan_id={plan_id}",
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 204, resp.text
    async with maker() as session:
        refreshed = await session.get(DBUser, user.id)
        assert refreshed.plan_id == plan_id
        assert refreshed.is_suspended is False

    # 2) A suspended client is rejected and stays suspended (no self-unban).
    suspended = await _make_client_user(maker, email="suspended@example.com")
    async with maker() as session:
        u = await session.get(DBUser, suspended.id)
        u.is_suspended = True
        await session.commit()
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp2 = await c.post(
            f"/api/payments/quick-upgrade?plan_id={plan_id}",
            headers=_auth_header_for(suspended),
        )
    assert resp2.status_code == 403, resp2.text
    async with maker() as session:
        still = await session.get(DBUser, suspended.id)
        assert still.is_suspended is True


@pytest.mark.asyncio
async def test_quick_upgrade_unknown_plan_404(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    import uuid as _uuid

    app, maker, _ = app_and_maker
    user = await _make_client_user(maker)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            f"/api/payments/quick-upgrade?plan_id={_uuid.uuid4()}",
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_dummy_payment_transitions_user_to_plan_selected(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Starter", price_cents=1500)
    user = await _make_client_user(maker)

    body = {
        "plan_id": str(plan_id),
        "card_number": "4242424242424242",
        "cvc": "123",
        "expiry_mmyy": "12/29",
        "cardholder_name": "Test User",
        "country": "IN",
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post("/api/payments/dummy", json=body, headers=_auth_header_for(user))

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["payment"]["status"] == "succeeded"
    assert data["payment"]["dummy_card_last4"] == "4242"
    assert data["user"]["onboarding_status"] == "plan_selected"
    assert data["user"]["plan"] == "Starter"

    # Verify DB state directly.
    from app.db.models.payments import Payment
    from app.db.models.users import User as DBUser

    async with maker() as session:
        refreshed = await session.get(DBUser, user.id)
        assert refreshed is not None
        assert refreshed.plan_id == plan_id
        onboarding = (
            refreshed.onboarding_status.value
            if hasattr(refreshed.onboarding_status, "value")
            else str(refreshed.onboarding_status)
        )
        assert onboarding == "plan_selected"

        payment_rows = (
            await session.execute(select(Payment).where(Payment.user_id == user.id))
        ).scalars().all()
        assert len(payment_rows) == 1
        assert payment_rows[0].dummy_card_last4 == "4242"


@pytest.mark.asyncio
async def test_dummy_payment_does_not_store_full_pan(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Structural guarantee: the payments table has no column wide enough
    to accidentally receive a full PAN or CVC.
    """
    _, _, engine = app_and_maker

    def _inspect(sync_conn: object) -> list[tuple[str, object]]:
        inspector = inspect(sync_conn)
        return [(c["name"], c["type"]) for c in inspector.get_columns("payments")]

    async with engine.begin() as conn:
        cols = await conn.run_sync(_inspect)

    col_map = dict(cols)
    # Only card-adjacent column allowed is dummy_card_last4 (VARCHAR(4)).
    assert "dummy_card_last4" in col_map
    for forbidden in ("card_number", "pan", "cvc", "cvv", "cardholder_name"):
        assert forbidden not in col_map, f"payments table must not have a '{forbidden}' column"

    # dummy_card_last4 must itself be capped at 4 chars.
    last4_type = col_map["dummy_card_last4"]
    length = getattr(last4_type, "length", None)
    assert length == 4, f"dummy_card_last4 should be VARCHAR(4), got length={length}"


@pytest.mark.asyncio
async def test_admin_payments_list_filters_by_status(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Starter", price_cents=1500)
    user = await _make_client_user(maker)
    admin = await _make_super_admin(maker)

    # Seed one succeeded payment via the public endpoint…
    body = {
        "plan_id": str(plan_id),
        "card_number": "4111111111111111",
        "cvc": "999",
        "expiry_mmyy": "01/30",
        "cardholder_name": "Filter Test",
        "country": "US",
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        post_resp = await c.post(
            "/api/payments/dummy", json=body, headers=_auth_header_for(user)
        )
        assert post_resp.status_code == 200

        # …and one 'failed' payment directly so there's something to filter out.
        from app.db.models.payments import Payment, PaymentStatus

        async with maker() as session:
            session.add(
                Payment(
                    user_id=user.id,
                    plan_id=plan_id,
                    amount_cents=1500,
                    status=PaymentStatus.failed,
                    dummy_card_last4="0000",
                )
            )
            await session.commit()

        # With ?status=succeeded we should get exactly the one succeeded row.
        resp = await c.get(
            "/api/admin/payments?status=succeeded",
            headers=_auth_header_for(admin),
        )
    assert resp.status_code == 200, resp.text
    body_resp = resp.json()
    assert body_resp["total"] == 1
    assert len(body_resp["items"]) == 1
    assert body_resp["items"][0]["status"] == "succeeded"
    assert body_resp["items"][0]["plan_name"] == "Starter"
    assert body_resp["items"][0]["user_email"] == "client@example.com"


@pytest.mark.asyncio
async def test_admin_payments_list_rejects_non_admin(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user = await _make_client_user(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/admin/payments", headers=_auth_header_for(user))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_add_payment_method_card_returns_method_row(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """POST /payments/methods with kind=card persists last4, returns method projection."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro", price_cents=7900)
    user = await _make_client_user(maker)

    # User needs a plan_id so the FK on Payment can be satisfied.
    from app.db.models.users import User as DBUser

    async with maker() as session:
        u = await session.get(DBUser, user.id)
        assert u is not None
        u.plan_id = plan_id
        await session.commit()

    body = {
        "kind": "card",
        "card_number": "4111111111111111",
        "cvc": "999",
        "expiry_mmyy": "12/29",
        "cardholder_name": "Method Tester",
        "country": "IN",
        "label": "Personal card",
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/payments/methods", json=body, headers=_auth_header_for(user)
        )

    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["kind"] == "card"
    assert data["id"] == "card:1111"
    assert "1111" in data["label"]

    # The underlying Payment row uses the method_card tag and amount_cents = 0.
    from app.db.models.payments import Payment

    async with maker() as session:
        rows = (
            await session.execute(select(Payment).where(Payment.user_id == user.id))
        ).scalars().all()
        assert any(p.payment_method == "method_card" for p in rows)
        assert all(
            p.amount_cents == 0 for p in rows if p.payment_method == "method_card"
        )


@pytest.mark.asyncio
async def test_add_payment_method_upi_returns_method_row(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """POST /payments/methods with kind=upi persists vpa."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro", price_cents=7900)
    user = await _make_client_user(maker)

    from app.db.models.users import User as DBUser

    async with maker() as session:
        u = await session.get(DBUser, user.id)
        assert u is not None
        u.plan_id = plan_id
        await session.commit()

    body = {"kind": "upi", "upi_vpa": "alice@okaxis"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/payments/methods", json=body, headers=_auth_header_for(user)
        )

    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["kind"] == "upi"
    assert data["id"] == "upi:alice@okaxis"


@pytest.mark.asyncio
async def test_invoice_csv_download(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """GET /payments/{id}/invoice.csv returns a usable per-payment invoice."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Starter", price_cents=1500)
    user = await _make_client_user(maker)

    body = {
        "plan_id": str(plan_id),
        "card_number": "4242424242424242",
        "cvc": "123",
        "expiry_mmyy": "12/29",
        "cardholder_name": "Invoice Tester",
        "country": "IN",
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        post_resp = await c.post(
            "/api/payments/dummy", json=body, headers=_auth_header_for(user)
        )
        assert post_resp.status_code == 200
        payment_id = post_resp.json()["payment"]["id"]

        csv_resp = await c.get(
            f"/api/payments/{payment_id}/invoice.csv",
            headers=_auth_header_for(user),
        )

    assert csv_resp.status_code == 200, csv_resp.text
    assert csv_resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in csv_resp.headers.get("content-disposition", "")
    text = csv_resp.text
    # Invoice metadata + dummy gateway disclaimer.
    assert "WarmPulse" in text
    assert "Starter plan" in text
    assert "Dummy gateway" in text
    # Last-4 may or may not appear but the full PAN must not.
    assert "4242424242424242" not in text


@pytest.mark.asyncio
async def test_invoice_download_404_for_other_users_payment(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Users may only download their own invoices."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Starter", price_cents=1500)
    owner = await _make_client_user(maker, email="owner@example.com")
    other = await _make_client_user(maker, email="other@example.com")

    body = {
        "plan_id": str(plan_id),
        "card_number": "4242424242424242",
        "cvc": "123",
        "expiry_mmyy": "12/29",
        "cardholder_name": "Owner",
        "country": "IN",
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        post_resp = await c.post(
            "/api/payments/dummy", json=body, headers=_auth_header_for(owner)
        )
        assert post_resp.status_code == 200
        payment_id = post_resp.json()["payment"]["id"]

        resp = await c.get(
            f"/api/payments/{payment_id}/invoice.csv",
            headers=_auth_header_for(other),
        )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_admin_payments_export_csv_returns_csv_content_type(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Starter", price_cents=1500)
    user = await _make_client_user(maker)
    admin = await _make_super_admin(maker)

    body = {
        "plan_id": str(plan_id),
        "card_number": "5555444433332222",
        "cvc": "321",
        "expiry_mmyy": "11/28",
        "cardholder_name": "CSV Tester",
        "country": "GB",
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        post_resp = await c.post(
            "/api/payments/dummy", json=body, headers=_auth_header_for(user)
        )
        assert post_resp.status_code == 200

        resp = await c.get(
            "/api/admin/payments/export.csv", headers=_auth_header_for(admin)
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers.get("content-disposition", "")
    text = resp.text
    # Header row + at least one data row.
    assert text.splitlines()[0].startswith(
        "payment_id,user_email,plan_name,amount_cents,status,payment_method,dummy_card_last4,dummy_upi_vpa,created_at"
    )
    # The dummy PAN's last4 should appear; the full PAN should not.
    assert "2222" in text
    assert "5555444433332222" not in text
