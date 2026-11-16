"""Cross-workspace isolation audit.

Each test creates two independent workspaces (A, B) with their own
Agency/Pro user + JWT and tries to read or mutate workspace B's
resource using workspace A's bearer token. Every workspace-scoped
route must respond with 403 or 404 — never 200 with B's data.

Routes covered (one per family):
* Mailboxes              — GET /api/workspace/mailboxes/{id}
* Activity (mailbox)     — GET /api/workspace/warmup-activity?mailbox_id=…
* Reports (generated)    — GET /api/workspace/reports/generated/{id}/download
* API keys               — DELETE /api/workspace/api-keys/{id}
* Webhooks               — GET (impl via DELETE) + POST /api/workspace/webhooks/{id}/test
* Postmaster             — DELETE /api/workspace/postmaster/domains/{id}
* SNDS                   — DELETE /api/workspace/snds/domains/{id}
* Placement              — GET /api/workspace/placement-tests/{id}
* Branding               — PATCH /api/workspace/branding (ws_a write should not affect ws_b row)
* Custom domain          — GET /api/workspace/custom-domain (ws_a sees only its own)
* Billing usage          — GET /api/workspace/billing/usage (counts only ws_a mailboxes)
* Team                   — DELETE /api/workspace/team/{member_id} (member belongs to ws_b)
* Webhook test fire      — POST /api/workspace/webhooks/{id}/test (cross-ws)
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


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
async def app_and_maker() -> AsyncIterator[
    tuple[object, async_sessionmaker[AsyncSession]]
]:
    """Full-schema in-memory DB + FastAPI app override."""
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.session import get_db
    from app.main import create_app

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as s:
            yield s

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield app, maker
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Test helpers                                                                 #
# --------------------------------------------------------------------------- #


async def _seed_plan(maker, *, name: str, capabilities: dict | None = None) -> uuid.UUID:
    """Idempotent — returns the existing plan id when a row with this name
    already exists. Tests share one Plan row between ws_a and ws_b so the
    capability gate ("agency" lowercased) matches.
    """
    from sqlalchemy import select as _sel

    from app.db.models.plans import Plan

    async with maker() as s:
        existing = (
            await s.execute(_sel(Plan).where(Plan.name == name))
        ).scalar_one_or_none()
        if existing is not None:
            return existing.id
        plan = Plan(
            name=name,
            price_cents=0,
            max_mailboxes=10,
            daily_email_cap=100,
            token_cap_per_month=0,
            capabilities=capabilities or {
                "can_issue_api_keys": True,
                "can_invite_team_members": True,
            },
            is_active=True,
        )
        s.add(plan)
        await s.commit()
        await s.refresh(plan)
        return plan.id


async def _make_workspace_with_user(
    maker, *, email: str, plan_name: str = "Agency"
) -> tuple[uuid.UUID, object, dict[str, str]]:
    """Returns (workspace_id, user, auth_headers).

    Plan capabilities are open by default so feature-gated routes don't
    short-circuit ahead of the scoping check we're trying to test. The
    Plan row is idempotent — ws_a and ws_b share the same plan.
    """
    from app.db.models.users import OnboardingStatus, User, UserRole

    plan_id = await _seed_plan(maker, name=plan_name)
    ws_id = uuid.uuid4()
    async with maker() as s:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=ws_id,
            plan_id=plan_id,
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)

    from app.services.security import create_access_token

    role = u.role.value if hasattr(u.role, "value") else str(u.role)
    tok = create_access_token(subject=str(u.id), role=role, workspace_id=str(ws_id))
    return ws_id, u, {"Authorization": f"Bearer {tok}"}


async def _make_mailbox(maker, *, workspace_id: uuid.UUID, user_id: uuid.UUID):
    from app.db.models.mailboxes import (
        ContentMode,
        Mailbox,
        MailboxProvider,
        WarmupStatus,
    )

    async with maker() as s:
        mb = Mailbox(
            user_id=user_id,
            workspace_id=workspace_id,
            email_address=f"mb+{uuid.uuid4().hex[:6]}@example.com",
            provider=MailboxProvider.smtp,
            warmup_status=WarmupStatus.active,
            daily_target=10,
            current_day=1,
            content_mode=ContentMode.A,
        )
        s.add(mb)
        await s.commit()
        await s.refresh(mb)
        return mb


# --------------------------------------------------------------------------- #
# Mailboxes                                                                    #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_cannot_read_ws_b_mailbox(app_and_maker):
    app, maker = app_and_maker
    _ws_a, user_a, auth_a = await _make_workspace_with_user(maker, email="a1@x.io")
    ws_b, user_b, _auth_b = await _make_workspace_with_user(maker, email="b1@x.io")
    mb_b = await _make_mailbox(maker, workspace_id=ws_b, user_id=user_b.id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(f"/api/workspace/mailboxes/{mb_b.id}", headers=auth_a)
    assert r.status_code in (403, 404), f"LEAK: ws_a got ws_b mailbox · {r.status_code} {r.text}"


# --------------------------------------------------------------------------- #
# Activity                                                                     #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_cannot_filter_activity_by_ws_b_mailbox(app_and_maker):
    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a2@x.io")
    ws_b, user_b, _auth_b = await _make_workspace_with_user(maker, email="b2@x.io")
    mb_b = await _make_mailbox(maker, workspace_id=ws_b, user_id=user_b.id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(
            f"/api/workspace/warmup-activity?mailbox_id={mb_b.id}", headers=auth_a
        )
    # Activity service returns 200 with empty items when scoping rejects the
    # mailbox — that's still a non-leak. The contract is "no data".
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("items") == [], f"LEAK: activity for ws_b mailbox returned items: {body}"


# --------------------------------------------------------------------------- #
# Reports                                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_cannot_download_ws_b_generated_report(app_and_maker):
    from datetime import date

    from app.db.models.generated_reports import GeneratedReport

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a3@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b3@x.io")

    async with maker() as s:
        row = GeneratedReport(
            workspace_id=ws_b,
            type="warmth",
            format="csv",
            range_label="2026-01-01 → 2026-01-31",
            from_date=date(2026, 1, 1),
            to_date=date(2026, 1, 31),
            body=b"secret,data\n",
            content_type="text/csv",
            filename="warmth.csv",
        )
        s.add(row)
        await s.commit()
        await s.refresh(row)
        report_id = row.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(
            f"/api/workspace/reports/generated/{report_id}/download", headers=auth_a
        )
    assert r.status_code in (403, 404), (
        f"LEAK: ws_a downloaded ws_b report · status {r.status_code}"
    )


@pytest.mark.asyncio
async def test_ws_a_cannot_delete_ws_b_generated_report(app_and_maker):
    from datetime import date

    from app.db.models.generated_reports import GeneratedReport

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a4@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b4@x.io")

    async with maker() as s:
        row = GeneratedReport(
            workspace_id=ws_b,
            type="warmth",
            format="csv",
            range_label="R",
            from_date=date(2026, 1, 1),
            to_date=date(2026, 1, 31),
            body=b"x",
            content_type="text/csv",
            filename="x.csv",
        )
        s.add(row)
        await s.commit()
        await s.refresh(row)
        rid = row.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.delete(f"/api/workspace/reports/generated/{rid}", headers=auth_a)
    assert r.status_code in (403, 404), f"LEAK: ws_a deleted ws_b report · {r.status_code}"


# --------------------------------------------------------------------------- #
# API keys                                                                     #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_cannot_revoke_ws_b_api_key(app_and_maker):
    from app.db.models.api_keys import ApiKey

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a5@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b5@x.io")

    async with maker() as s:
        k = ApiKey(
            workspace_id=ws_b,
            key_hash="$2b$12$" + "x" * 53,
            prefix="wp_live_xxx",
            name="ws_b key",
        )
        s.add(k)
        await s.commit()
        await s.refresh(k)
        key_id = k.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.delete(f"/api/workspace/api-keys/{key_id}", headers=auth_a)
    assert r.status_code in (403, 404), f"LEAK: ws_a revoked ws_b key · {r.status_code}"


# --------------------------------------------------------------------------- #
# Webhooks                                                                     #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_cannot_delete_ws_b_webhook(app_and_maker):
    from app.db.models.webhooks import Webhook

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a6@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b6@x.io")

    async with maker() as s:
        w = Webhook(
            workspace_id=ws_b,
            url="https://ws-b.example.com/hook",
            secret_encrypted=b"x" * 32,
            events=["mailbox_paused"],
            is_active=True,
        )
        s.add(w)
        await s.commit()
        await s.refresh(w)
        wid = w.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.delete(f"/api/workspace/webhooks/{wid}", headers=auth_a)
    assert r.status_code in (403, 404), f"LEAK: ws_a deleted ws_b webhook · {r.status_code}"


@pytest.mark.asyncio
async def test_ws_a_cannot_fire_test_ws_b_webhook(app_and_maker):
    from app.db.models.webhooks import Webhook

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a7@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b7@x.io")

    async with maker() as s:
        w = Webhook(
            workspace_id=ws_b,
            url="https://ws-b.example.com/hook",
            secret_encrypted=b"x" * 32,
            events=["mailbox_paused"],
            is_active=True,
        )
        s.add(w)
        await s.commit()
        await s.refresh(w)
        wid = w.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(f"/api/workspace/webhooks/{wid}/test", headers=auth_a)
    assert r.status_code in (403, 404), (
        f"LEAK: ws_a fired ws_b webhook test · {r.status_code}"
    )


# --------------------------------------------------------------------------- #
# Postmaster                                                                   #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_cannot_disconnect_ws_b_postmaster_domain(app_and_maker):
    from app.db.models.domain_credentials import DomainCredential

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a8@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b8@x.io")

    async with maker() as s:
        c = DomainCredential(
            workspace_id=ws_b,
            domain="ws-b.example.com",
            provider="postmaster",
            refresh_token_encrypted=b"x" * 32,
            is_active=True,
            last_status="connected",
        )
        s.add(c)
        await s.commit()
        await s.refresh(c)
        cid = c.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as ac:
        r = await ac.delete(f"/api/workspace/postmaster/domains/{cid}", headers=auth_a)
    assert r.status_code in (403, 404), (
        f"LEAK: ws_a disconnected ws_b postmaster · {r.status_code}"
    )


# --------------------------------------------------------------------------- #
# SNDS                                                                         #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_cannot_disconnect_ws_b_snds_domain(app_and_maker):
    from app.db.models.domain_credentials import DomainCredential

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a9@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b9@x.io")

    async with maker() as s:
        c = DomainCredential(
            workspace_id=ws_b,
            domain="ws-b-snds.example.com",
            provider="snds",
            access_key_encrypted=b"x" * 32,
            is_active=True,
            last_status="connected",
        )
        s.add(c)
        await s.commit()
        await s.refresh(c)
        cid = c.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as ac:
        r = await ac.delete(f"/api/workspace/snds/domains/{cid}", headers=auth_a)
    assert r.status_code in (403, 404), (
        f"LEAK: ws_a disconnected ws_b snds · {r.status_code}"
    )


# --------------------------------------------------------------------------- #
# Placement                                                                    #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_cannot_read_ws_b_placement_test(app_and_maker):
    from app.db.models.placement_tests import PlacementTest

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a10@x.io")
    ws_b, user_b, _auth_b = await _make_workspace_with_user(maker, email="b10@x.io")
    mb_b = await _make_mailbox(maker, workspace_id=ws_b, user_id=user_b.id)

    async with maker() as s:
        t = PlacementTest(
            mailbox_id=mb_b.id,
            workspace_id=ws_b,
            seed_set={"seed_count": 5},
            status="created",
        )
        s.add(t)
        await s.commit()
        await s.refresh(t)
        tid = t.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as ac:
        r = await ac.get(f"/api/workspace/placement-tests/{tid}", headers=auth_a)
    assert r.status_code in (403, 404), (
        f"LEAK: ws_a got ws_b placement test · {r.status_code}"
    )


# --------------------------------------------------------------------------- #
# Branding                                                                     #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_patch_branding_does_not_affect_ws_b(app_and_maker):
    """Patching branding while authed as ws_a must only write the ws_a row."""
    from sqlalchemy import select

    from app.db.models.workspace_branding import WorkspaceBranding

    app, maker = app_and_maker
    ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a11@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b11@x.io")

    # Seed ws_b's branding with a recognisable value.
    async with maker() as s:
        s.add(
            WorkspaceBranding(
                workspace_id=ws_b,
                brand_name="WS_B_BRAND",
                accent_color="#ff0000",
            )
        )
        await s.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as ac:
        r = await ac.patch(
            "/api/workspace/branding",
            json={"brand_name": "WS_A_BRAND"},
            headers=auth_a,
        )
    assert r.status_code == 200, r.text

    # ws_b's row must be untouched.
    async with maker() as s:
        b_row = (
            await s.execute(
                select(WorkspaceBranding).where(
                    WorkspaceBranding.workspace_id == ws_b
                )
            )
        ).scalar_one()
        a_row = (
            await s.execute(
                select(WorkspaceBranding).where(
                    WorkspaceBranding.workspace_id == ws_a
                )
            )
        ).scalar_one()
    assert b_row.brand_name == "WS_B_BRAND", (
        f"LEAK: ws_a's PATCH wrote into ws_b row, got {b_row.brand_name!r}"
    )
    assert a_row.brand_name == "WS_A_BRAND"


# --------------------------------------------------------------------------- #
# Custom domain                                                                #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_custom_domain_get_returns_only_own_or_404(app_and_maker):
    from app.db.models.workspace_custom_domains import WorkspaceCustomDomain

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a12@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b12@x.io")

    async with maker() as s:
        s.add(
            WorkspaceCustomDomain(
                workspace_id=ws_b,
                domain="ws-b-only.example.com",
                verification_code="vcode-b",
                status="verified",
            )
        )
        await s.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as ac:
        r = await ac.get("/api/workspace/custom-domain", headers=auth_a)
    # ws_a has no row → 404. The critical assertion is that ws_b's domain
    # never appears in ws_a's response.
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        body = r.json()
        assert body.get("domain") != "ws-b-only.example.com", (
            f"LEAK: ws_a saw ws_b custom domain: {body}"
        )


# --------------------------------------------------------------------------- #
# Billing usage                                                                #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_billing_usage_only_counts_own_mailboxes(app_and_maker):
    app, maker = app_and_maker
    ws_a, user_a, auth_a = await _make_workspace_with_user(maker, email="a13@x.io")
    ws_b, user_b, _auth_b = await _make_workspace_with_user(maker, email="b13@x.io")

    # 1 mailbox in ws_a, 3 in ws_b.
    await _make_mailbox(maker, workspace_id=ws_a, user_id=user_a.id)
    for _ in range(3):
        await _make_mailbox(maker, workspace_id=ws_b, user_id=user_b.id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as ac:
        r = await ac.get("/api/workspace/billing/usage", headers=auth_a)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mailboxes_used"] == 1, (
        f"LEAK: ws_a billing saw {body['mailboxes_used']} mailboxes (expected 1)"
    )


# --------------------------------------------------------------------------- #
# Team                                                                         #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ws_a_cannot_revoke_ws_b_team_member(app_and_maker):
    from app.db.models.team_members import TeamMember

    app, maker = app_and_maker
    _ws_a, _user_a, auth_a = await _make_workspace_with_user(maker, email="a14@x.io")
    ws_b, _user_b, _auth_b = await _make_workspace_with_user(maker, email="b14@x.io")

    async with maker() as s:
        m = TeamMember(
            workspace_id=ws_b,
            invited_email="invitee@ws-b.example.com",
            role_in_workspace="member",
        )
        s.add(m)
        await s.commit()
        await s.refresh(m)
        mid = m.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as ac:
        r = await ac.delete(f"/api/workspace/team-members/{mid}", headers=auth_a)
    assert r.status_code in (403, 404), (
        f"LEAK: ws_a revoked ws_b team member · {r.status_code}"
    )


# --------------------------------------------------------------------------- #
# Payments (user-scoped, not workspace-scoped — sanity test)                   #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_payments_me_returns_only_own_payments(app_and_maker):
    """user_a's /payments/me must not surface user_b's payment history.

    Payments are scoped on ``user_id``, not ``workspace_id`` — but the
    isolation invariant still holds: A never sees B's rows.
    """
    from app.db.models.payments import Payment, PaymentStatus

    app, maker = app_and_maker
    _ws_a, user_a, auth_a = await _make_workspace_with_user(maker, email="a15@x.io")
    _ws_b, user_b, _auth_b = await _make_workspace_with_user(maker, email="b15@x.io")

    async with maker() as s:
        # Use whatever plan user_b is on (any plan row works for the FK).
        from app.db.models.plans import Plan
        from sqlalchemy import select as _sel

        plan_row = (await s.execute(_sel(Plan).limit(1))).scalar_one()
        s.add(
            Payment(
                user_id=user_b.id,
                plan_id=plan_row.id,
                amount_cents=1999,
                status=PaymentStatus.succeeded,
                payment_method="card",
                dummy_card_last4="4242",
            )
        )
        await s.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as ac:
        r = await ac.get("/api/payments/me", headers=auth_a)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert all(row["user_id"] == str(user_a.id) for row in rows), (
        f"LEAK: ws_a saw ws_b payments: {rows}"
    )
