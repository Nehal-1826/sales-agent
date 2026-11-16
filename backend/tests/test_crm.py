"""Tests for the workspace-scoped CRM feature.

Mirrors the harness in :mod:`tests.test_mailboxes`: a fresh in-memory SQLite
with StaticPool + shared cache, ``get_db`` overridden at the app level, and
only the tables the CRM router touches registered.

Covers the business rules called out in the spec:
  * CRM included for all at Pro Plus level (10 campaigns); Agency unlimited
  * create_lead seeds a ``created`` activity + stamps last_activity_at
  * a stage change writes a ``stage_change`` activity
  * CSV import imported/skipped counts
  * get_limits per tier
  * cross-workspace access → 404
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

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
    from app.db.models.plans import Plan
    from app.db.models.team_members import TeamMember
    from app.db.models.users import User
    from app.db.models.workspace_settings import WorkspaceSetting

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
            TeamMember,
            WorkspaceSetting,
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
    maker: async_sessionmaker[AsyncSession],
    *,
    name: str,
    max_mailboxes: int = 5,
) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as session:
        plan = Plan(
            name=name,
            price_cents=1500,
            max_mailboxes=max_mailboxes,
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


# --------------------------------------------------------------------------- #
# crm_campaign_cap (pure function)                                            #
# --------------------------------------------------------------------------- #


def test_crm_campaign_cap_mapping() -> None:
    from app.services.crm_service import crm_campaign_cap

    # CRM is available to all users at Pro Plus level; Agency/Enterprise stay
    # unlimited. Every other tier (incl. Starter/Pro/unknown) gets 10 campaigns.
    assert crm_campaign_cap(None) == 10
    assert crm_campaign_cap("Starter") == 10
    assert crm_campaign_cap("trial") == 10
    assert crm_campaign_cap("Free") == 10
    assert crm_campaign_cap("Pro") == 10
    assert crm_campaign_cap("Growth") == 10
    assert crm_campaign_cap("Pro Plus") == 10
    assert crm_campaign_cap("pro_plus") == 10
    assert crm_campaign_cap("proplus") == 10
    assert crm_campaign_cap("Agency") is None
    assert crm_campaign_cap("Enterprise") is None


def test_crm_lead_cap_mapping() -> None:
    from app.services.crm_service import crm_lead_cap

    # Mirrors crm_campaign_cap: Agency/Enterprise unlimited, everyone else 25k.
    assert crm_lead_cap(None) == 25_000
    assert crm_lead_cap("Starter") == 25_000
    assert crm_lead_cap("Pro") == 25_000
    assert crm_lead_cap("Pro Plus") == 25_000
    assert crm_lead_cap("proplus") == 25_000
    assert crm_lead_cap("Agency") is None
    assert crm_lead_cap("Enterprise") is None
    assert crm_lead_cap("mystery") == 25_000


def test_crm_auto_enabled_for_plan_mapping() -> None:
    from app.services.crm_service import crm_auto_enabled_for_plan

    # Automated CRM = Pro Plus / Agency / Enterprise only.
    assert crm_auto_enabled_for_plan("Pro Plus") is True
    assert crm_auto_enabled_for_plan("pro_plus") is True
    assert crm_auto_enabled_for_plan("pro-plus") is True
    assert crm_auto_enabled_for_plan("proplus") is True
    assert crm_auto_enabled_for_plan("Agency") is True
    assert crm_auto_enabled_for_plan("Enterprise") is True
    # Below Pro Plus → manual only.
    assert crm_auto_enabled_for_plan("Pro") is False
    assert crm_auto_enabled_for_plan("Growth") is False
    assert crm_auto_enabled_for_plan("Starter") is False
    assert crm_auto_enabled_for_plan("trial") is False
    assert crm_auto_enabled_for_plan(None) is False
    assert crm_auto_enabled_for_plan("") is False
    assert crm_auto_enabled_for_plan("mystery") is False


# --------------------------------------------------------------------------- #
# Auto-CRM plan gate on PATCH /api/workspace                                  #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_patch_workspace_blocks_auto_crm_below_pro_plus(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    starter_id = await _seed_plan(maker, name="Starter")
    user = await _make_user(maker, email="starter@example.com", plan_id=starter_id)

    async with _client(app) as c:
        resp = await c.patch(
            "/api/workspace/settings/workspace",
            json={"auto_crm_enabled": True},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 403, resp.text
    assert "Pro Plus" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_patch_workspace_allows_auto_crm_for_pro_plus(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    pp_id = await _seed_plan(maker, name="Pro Plus")
    user = await _make_user(maker, email="pp@example.com", plan_id=pp_id)

    async with _client(app) as c:
        resp = await c.patch(
            "/api/workspace/settings/workspace",
            json={"auto_crm_enabled": True},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["auto_crm_enabled"] is True


@pytest.mark.asyncio
async def test_patch_workspace_allows_turning_auto_crm_off_below_pro_plus(
    app_and_maker,
) -> None:
    # Disabling must always be permitted, regardless of plan.
    app, maker, _ = app_and_maker
    starter_id = await _seed_plan(maker, name="Starter")
    user = await _make_user(maker, email="starter2@example.com", plan_id=starter_id)

    async with _client(app) as c:
        resp = await c.patch(
            "/api/workspace/settings/workspace",
            json={"auto_crm_enabled": False},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["auto_crm_enabled"] is False


@pytest.mark.asyncio
async def test_sync_workspace_auto_crm_toggles_with_plan(app_and_maker) -> None:
    from app.db.models.workspace_settings import WorkspaceSetting
    from app.services.crm_service import sync_workspace_auto_crm

    _app, maker, _ = app_and_maker
    ws_id = uuid.uuid4()

    async with maker() as s:
        # Upgrade to Pro Plus → auto on, row created.
        enabled = await sync_workspace_auto_crm(s, workspace_id=ws_id, plan_name="Pro Plus")
        await s.commit()
        assert enabled is True
        row = await s.get(WorkspaceSetting, ws_id)
        assert row is not None and row.auto_crm_enabled is True

        # Downgrade to Starter → auto off.
        enabled = await sync_workspace_auto_crm(s, workspace_id=ws_id, plan_name="Starter")
        await s.commit()
        assert enabled is False
        await s.refresh(row)
        assert row.auto_crm_enabled is False


# --------------------------------------------------------------------------- #
# Campaign cap enforcement                                                    #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_eleventh_campaign_409(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    # CRM is included for all at Pro Plus level (10 campaigns); the 11th is 409.
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="pro@example.com", plan_id=plan_id)

    async with _client(app) as c:
        for i in range(10):
            await _create_campaign(c, user, f"Campaign {i}")
        # 11th must be rejected with 409.
        resp = await c.post(
            "/api/crm/campaigns",
            json={"name": "Campaign 11"},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"].lower()
    assert "10" in detail


@pytest.mark.asyncio
async def test_starter_can_create_campaign(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    # CRM is now included for Starter too (Pro Plus level), so the first
    # campaign succeeds rather than hitting a paywall.
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Starter")
    user = await _make_user(maker, email="starter@example.com", plan_id=plan_id)

    async with _client(app) as c:
        resp = await c.post(
            "/api/crm/campaigns",
            json={"name": "First"},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_no_plan_gets_crm(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    # A plan-less workspace still gets the Pro Plus CRM allowance.
    app, maker, _ = app_and_maker
    user = await _make_user(maker, email="noplan@example.com", plan_id=None)

    async with _client(app) as c:
        resp = await c.post(
            "/api/crm/campaigns",
            json={"name": "First"},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_agency_unlimited(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Agency")
    user = await _make_user(maker, email="agency@example.com", plan_id=plan_id)

    async with _client(app) as c:
        # Far past any finite tier cap — every create must succeed.
        for i in range(15):
            resp = await c.post(
                "/api/crm/campaigns",
                json={"name": f"C{i}"},
                headers=_auth_header_for(user),
            )
            assert resp.status_code == 201, resp.text
        listing = await c.get(
            "/api/crm/campaigns", headers=_auth_header_for(user)
        )
    assert listing.status_code == 200
    assert len(listing.json()) == 15


@pytest.mark.asyncio
async def test_archived_campaign_frees_a_slot(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Archiving a campaign drops it below the cap so a new one can be created."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="pro2@example.com", plan_id=plan_id)

    async with _client(app) as c:
        ids = [
            (await _create_campaign(c, user, f"C{i}"))["id"] for i in range(3)
        ]
        # At cap → 409.
        blocked = await c.post(
            "/api/crm/campaigns",
            json={"name": "C4"},
            headers=_auth_header_for(user),
        )
        assert blocked.status_code == 409

        # Archive one → frees a slot.
        arch = await c.patch(
            f"/api/crm/campaigns/{ids[0]}",
            json={"status": "archived"},
            headers=_auth_header_for(user),
        )
        assert arch.status_code == 200, arch.text

        ok = await c.post(
            "/api/crm/campaigns",
            json={"name": "C4"},
            headers=_auth_header_for(user),
        )
    assert ok.status_code == 201, ok.text


# --------------------------------------------------------------------------- #
# Leads + activities                                                          #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_lead_writes_created_activity_and_last_activity(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="leads@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Outbound")
        lead_resp = await c.post(
            "/api/crm/leads",
            json={
                "campaign_id": campaign["id"],
                "name": "Jane Doe",
                "email": "jane@acme.com",
                "value_cents": 5000,
            },
            headers=_auth_header_for(user),
        )
        assert lead_resp.status_code == 201, lead_resp.text
        lead = lead_resp.json()
        assert lead["last_activity_at"] is not None
        assert lead["stage"] == "new"
        assert lead["tags"] == []

        acts = await c.get(
            f"/api/crm/leads/{lead['id']}/activities",
            headers=_auth_header_for(user),
        )
    assert acts.status_code == 200
    kinds = [a["kind"] for a in acts.json()]
    assert "created" in kinds


@pytest.mark.asyncio
async def test_stage_change_writes_stage_change_activity(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="stage@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Pipeline")
        lead = (
            await c.post(
                "/api/crm/leads",
                json={
                    "campaign_id": campaign["id"],
                    "name": "Bob",
                    "email": "bob@acme.com",
                },
                headers=_auth_header_for(user),
            )
        ).json()

        # Move the lead to "won".
        upd = await c.patch(
            f"/api/crm/leads/{lead['id']}",
            json={"stage": "won"},
            headers=_auth_header_for(user),
        )
        assert upd.status_code == 200, upd.text
        assert upd.json()["stage"] == "won"

        acts = await c.get(
            f"/api/crm/leads/{lead['id']}/activities",
            headers=_auth_header_for(user),
        )
    kinds = [a["kind"] for a in acts.json()]
    assert "stage_change" in kinds
    assert "created" in kinds


@pytest.mark.asyncio
async def test_update_without_stage_change_writes_no_stage_activity(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="nostage@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Pipeline")
        lead = (
            await c.post(
                "/api/crm/leads",
                json={
                    "campaign_id": campaign["id"],
                    "name": "Sam",
                    "email": "sam@acme.com",
                },
                headers=_auth_header_for(user),
            )
        ).json()
        # Rename only — same stage → no stage_change activity.
        await c.patch(
            f"/api/crm/leads/{lead['id']}",
            json={"name": "Samuel"},
            headers=_auth_header_for(user),
        )
        acts = await c.get(
            f"/api/crm/leads/{lead['id']}/activities",
            headers=_auth_header_for(user),
        )
    kinds = [a["kind"] for a in acts.json()]
    assert "stage_change" not in kinds


@pytest.mark.asyncio
async def test_add_activity_note(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="note@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Pipeline")
        lead = (
            await c.post(
                "/api/crm/leads",
                json={
                    "campaign_id": campaign["id"],
                    "name": "Nina",
                    "email": "nina@acme.com",
                },
                headers=_auth_header_for(user),
            )
        ).json()
        note = await c.post(
            f"/api/crm/leads/{lead['id']}/activities",
            json={"body": "Called, left voicemail"},
            headers=_auth_header_for(user),
        )
    assert note.status_code == 201, note.text
    assert note.json()["kind"] == "note"
    assert note.json()["body"] == "Called, left voicemail"


# --------------------------------------------------------------------------- #
# CSV import                                                                  #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_csv_import_counts(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="csv@example.com", plan_id=plan_id)

    # 3 valid rows + 1 row missing both name+email (skipped).
    csv_text = (
        "name,email,company,title,phone,value\n"
        "Alice,alice@acme.com,Acme,CEO,555-1,\"$1,200.50\"\n"
        "Bob,bob@acme.com,Beta,CTO,555-2,900\n"
        "Carol,carol@acme.com,,Manager,,\n"
        ",,NoName,,,\n"
    )

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Imported")
        resp = await c.post(
            "/api/crm/leads/import",
            json={"campaign_id": campaign["id"], "csv": csv_text},
            headers=_auth_header_for(user),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"imported": 3, "skipped": 1}

        leads = await c.get(
            f"/api/crm/campaigns/{campaign['id']}/leads",
            headers=_auth_header_for(user),
        )
    rows = {lead["email"]: lead for lead in leads.json()}
    assert set(rows) == {"alice@acme.com", "bob@acme.com", "carol@acme.com"}
    # Lenient money parse: "$1,200.50" → 120050 cents.
    assert rows["alice@acme.com"]["value_cents"] == 120050
    assert rows["bob@acme.com"]["value_cents"] == 90000


# --------------------------------------------------------------------------- #
# Lead-count cap enforcement                                                  #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_lead_cap_blocks_second_lead_409(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With the lead cap pinned to 1, the first lead is created and the second
    is rejected with a 409 mentioning leads. (Seeding the real 500-cap would be
    impractical, so we monkeypatch the pure cap helper.)"""
    monkeypatch.setattr(
        "app.services.crm_service.crm_lead_cap", lambda _name: 1
    )
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="leadcap@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Capped")
        first = await c.post(
            "/api/crm/leads",
            json={
                "campaign_id": campaign["id"],
                "name": "First",
                "email": "first@acme.com",
            },
            headers=_auth_header_for(user),
        )
        assert first.status_code == 201, first.text

        second = await c.post(
            "/api/crm/leads",
            json={
                "campaign_id": campaign["id"],
                "name": "Second",
                "email": "second@acme.com",
            },
            headers=_auth_header_for(user),
        )
    assert second.status_code == 409, second.text
    detail = second.json()["detail"].lower()
    assert "leads" in detail
    assert "upgrade" in detail


@pytest.mark.asyncio
async def test_import_respects_lead_cap_partial(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Import never 409s — valid rows beyond the cap are skipped, not refused.
    With the cap pinned to 1, a 3-valid-row CSV imports 1 and skips 2."""
    monkeypatch.setattr(
        "app.services.crm_service.crm_lead_cap", lambda _name: 1
    )
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="importcap@example.com", plan_id=plan_id)

    csv_text = (
        "name,email,company,title,phone,value\n"
        "Alice,alice@acme.com,Acme,CEO,,\n"
        "Bob,bob@acme.com,Beta,CTO,,\n"
        "Carol,carol@acme.com,Gamma,Manager,,\n"
    )

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Imported")
        resp = await c.post(
            "/api/crm/leads/import",
            json={"campaign_id": campaign["id"], "csv": csv_text},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"imported": 1, "skipped": 2}


# --------------------------------------------------------------------------- #
# Aggregates                                                                  #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_campaign_aggregates_lead_count_and_won_value(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="agg@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Revenue")
        cid = campaign["id"]
        # Two leads; one won (value counts), one new (does not).
        won = await c.post(
            "/api/crm/leads",
            json={
                "campaign_id": cid,
                "name": "Won",
                "email": "won@acme.com",
                "value_cents": 7500,
            },
            headers=_auth_header_for(user),
        )
        await c.patch(
            f"/api/crm/leads/{won.json()['id']}",
            json={"stage": "won"},
            headers=_auth_header_for(user),
        )
        await c.post(
            "/api/crm/leads",
            json={
                "campaign_id": cid,
                "name": "Open",
                "email": "open@acme.com",
                "value_cents": 9999,
            },
            headers=_auth_header_for(user),
        )
        detail = await c.get(
            f"/api/crm/campaigns/{cid}", headers=_auth_header_for(user)
        )
    body = detail.json()
    assert body["lead_count"] == 2
    assert body["won_value_cents"] == 7500


@pytest.mark.asyncio
async def test_summary_shape(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Agency")
    user = await _make_user(maker, email="sum@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "S")
        await c.post(
            "/api/crm/leads",
            json={"campaign_id": campaign["id"], "name": "A", "email": "a@x.com"},
            headers=_auth_header_for(user),
        )
        summary = await c.get("/api/crm/summary", headers=_auth_header_for(user))
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["campaigns"] == 1
    assert body["leads"] == 1
    assert body["won_value_cents"] == 0
    # by_stage carries an entry for every stage, including zeros.
    assert body["by_stage"]["new"] == 1
    assert body["by_stage"]["won"] == 0
    assert set(body["by_stage"]) == {
        "new",
        "contacted",
        "replied",
        "interested",
        "won",
        "lost",
    }


@pytest.mark.asyncio
async def test_campaign_out_carries_stage_counts(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """GET a campaign returns ``stage_counts`` with all six stages (0-filled)
    and the right per-stage counts for that campaign's leads."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="stagecounts@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Pipeline")
        cid = campaign["id"]
        # Two leads stay "new", one is moved to "won".
        for nm, em in (("A", "a@x.com"), ("B", "b@x.com")):
            await c.post(
                "/api/crm/leads",
                json={"campaign_id": cid, "name": nm, "email": em},
                headers=_auth_header_for(user),
            )
        won = await c.post(
            "/api/crm/leads",
            json={"campaign_id": cid, "name": "W", "email": "w@x.com"},
            headers=_auth_header_for(user),
        )
        await c.patch(
            f"/api/crm/leads/{won.json()['id']}",
            json={"stage": "won"},
            headers=_auth_header_for(user),
        )

        detail = await c.get(
            f"/api/crm/campaigns/{cid}", headers=_auth_header_for(user)
        )
    assert detail.status_code == 200, detail.text
    stage_counts = detail.json()["stage_counts"]
    # All six stages present, including zeros.
    assert set(stage_counts) == {
        "new",
        "contacted",
        "replied",
        "interested",
        "won",
        "lost",
    }
    assert stage_counts["new"] == 2
    assert stage_counts["won"] == 1
    assert stage_counts["contacted"] == 0
    assert stage_counts["lost"] == 0


# --------------------------------------------------------------------------- #
# Recent activity feed                                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_recent_activity_includes_note_with_lead_name(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """A note added to a lead surfaces in GET /api/crm/activity with the joined
    lead name."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="feed@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "Pipeline")
        lead = (
            await c.post(
                "/api/crm/leads",
                json={
                    "campaign_id": campaign["id"],
                    "name": "Nina",
                    "email": "nina@acme.com",
                },
                headers=_auth_header_for(user),
            )
        ).json()
        note = await c.post(
            f"/api/crm/leads/{lead['id']}/activities",
            json={"body": "Called, left voicemail"},
            headers=_auth_header_for(user),
        )
        assert note.status_code == 201, note.text

        resp = await c.get("/api/crm/activity", headers=_auth_header_for(user))

    assert resp.status_code == 200, resp.text
    feed = resp.json()
    # The note we added surfaces in the feed, carrying the joined lead name.
    notes = [row for row in feed if row["kind"] == "note"]
    assert len(notes) == 1
    assert notes[0]["body"] == "Called, left voicemail"
    assert notes[0]["lead_name"] == "Nina"
    assert notes[0]["lead_id"] == lead["id"]
    # The lead's "created" activity is also in the feed.
    kinds = {row["kind"] for row in feed}
    assert "created" in kinds
    # Every row carries the joined lead name.
    assert all(row["lead_name"] == "Nina" for row in feed)


@pytest.mark.asyncio
async def test_recent_activity_scoped_to_workspace(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Another workspace's activity never leaks into the feed."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Agency")
    user_a = await _make_user(maker, email="fa@example.com", plan_id=plan_id)
    user_b = await _make_user(maker, email="fb@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user_a, "A camp")
        await c.post(
            "/api/crm/leads",
            json={
                "campaign_id": campaign["id"],
                "name": "A Lead",
                "email": "alead@a.com",
            },
            headers=_auth_header_for(user_a),
        )
        # B's feed must be empty — A's activity belongs to A's workspace.
        resp_b = await c.get("/api/crm/activity", headers=_auth_header_for(user_b))

    assert resp_b.status_code == 200, resp_b.text
    assert resp_b.json() == []


# --------------------------------------------------------------------------- #
# LinkedIn import                                                             #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_linkedin_import_maps_columns_and_strips_preamble(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="li@example.com", plan_id=plan_id)

    # Real LinkedIn "Connections.csv" shape: a few preamble lines, then the
    # First Name / Last Name / Email Address / Company / Position / URL header.
    csv_text = (
        "Notes:\n"
        '"When exporting your connection data, you may notice..."\n'
        "\n"
        "First Name,Last Name,Email Address,Company,Position,Connected On,URL\n"
        "Jane,Cooper,jane@acme.com,Acme Inc.,VP Sales,01 Jan 2026,https://linkedin.com/in/janecooper\n"
        "Mark,,,,Founder,02 Jan 2026,https://linkedin.com/in/markx\n"
        ",,,,,,\n"
    )

    async with _client(app) as c:
        campaign = await _create_campaign(c, user, "LinkedIn")
        resp = await c.post(
            "/api/crm/leads/import",
            json={
                "campaign_id": campaign["id"],
                "csv": csv_text,
                "source": "linkedin",
            },
            headers=_auth_header_for(user),
        )
        assert resp.status_code == 200, resp.text
        # Jane + Mark import; the empty row is skipped.
        assert resp.json() == {"imported": 2, "skipped": 1}

        leads = (
            await c.get(
                f"/api/crm/campaigns/{campaign['id']}/leads",
                headers=_auth_header_for(user),
            )
        ).json()

    by_name = {lead["name"]: lead for lead in leads}
    assert "Jane Cooper" in by_name
    jane = by_name["Jane Cooper"]
    assert jane["email"] == "jane@acme.com"
    assert jane["company"] == "Acme Inc."
    assert jane["title"] == "VP Sales"  # mapped from "Position"
    assert jane["source"] == "linkedin"
    assert "linkedin" in jane["tags"]
    assert "linkedin.com/in/janecooper" in (jane["notes"] or "")
    # Mark has no email but a name → still imported (LinkedIn often hides emails).
    assert "Mark" in by_name
    assert by_name["Mark"]["email"] == ""


# --------------------------------------------------------------------------- #
# Team members (owner assignment)                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_members_lists_workspace_users_and_invites_scoped(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.team_members import TeamMember

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Agency")
    ws = uuid.uuid4()
    caller = await _make_user(
        maker, email="owner@acme.com", plan_id=plan_id, workspace_id=ws
    )
    # A second seat in the same workspace + an invited (not-yet-user) email.
    await _make_user(maker, email="seat@acme.com", plan_id=plan_id, workspace_id=ws)
    # A user in a DIFFERENT workspace must never leak into the list.
    await _make_user(maker, email="stranger@other.com", plan_id=plan_id)

    async with maker() as session:
        session.add(
            TeamMember(workspace_id=ws, invited_email="invitee@acme.com", role_in_workspace="member")
        )
        await session.commit()

    async with _client(app) as c:
        resp = await c.get("/api/crm/members", headers=_auth_header_for(caller))

    assert resp.status_code == 200, resp.text
    emails = {m["email"] for m in resp.json()}
    assert emails == {"owner@acme.com", "seat@acme.com", "invitee@acme.com"}
    assert "stranger@other.com" not in emails


# --------------------------------------------------------------------------- #
# Per-campaign analytics                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_campaign_analytics_rates_and_owner_breakdown(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="ana@example.com", plan_id=plan_id)

    async with _client(app) as c:
        hdr = _auth_header_for(user)
        campaign = await _create_campaign(c, user, "Analytics")
        cid = campaign["id"]

        async def _lead(name: str, email: str, owner: str | None, value: int) -> dict:
            body = {
                "campaign_id": cid,
                "name": name,
                "email": email,
                "value_cents": value,
            }
            if owner:
                body["owner_email"] = owner
            return (await c.post("/api/crm/leads", json=body, headers=hdr)).json()

        won = await _lead("Won", "won@x.com", "alice@acme.com", 10000)
        await c.patch(f"/api/crm/leads/{won['id']}", json={"stage": "won"}, headers=hdr)
        lost = await _lead("Lost", "lost@x.com", None, 5000)
        await c.patch(f"/api/crm/leads/{lost['id']}", json={"stage": "lost"}, headers=hdr)
        await _lead("Open", "open@x.com", "alice@acme.com", 3000)

        # Email engagement on the won lead: 2 sent, 1 opened, 1 replied.
        for kind in ("email_sent", "email_sent", "email_opened", "email_replied"):
            await c.post(
                f"/api/crm/leads/{won['id']}/activities",
                json={"kind": kind, "body": kind},
                headers=hdr,
            )

        resp = await c.get(f"/api/crm/campaigns/{cid}/analytics", headers=hdr)

    assert resp.status_code == 200, resp.text
    a = resp.json()
    assert a["total_leads"] == 3
    assert a["won_count"] == 1
    assert a["won_value_cents"] == 10000
    # pipeline = non-won/non-lost value = the single "Open" lead (3000).
    assert a["pipeline_value_cents"] == 3000
    assert a["conversion_rate"] == 33.3  # 1/3
    assert a["emails_sent"] == 2
    assert a["emails_opened"] == 1
    assert a["emails_replied"] == 1
    assert a["open_rate"] == 50.0
    assert a["reply_rate"] == 50.0
    assert a["by_stage"]["won"] == 1
    assert a["by_stage"]["lost"] == 1
    assert a["by_stage"]["new"] == 1
    # Owner breakdown: alice owns 2 leads (1 won, $130 total), sorted first.
    owners = {o["owner_email"]: o for o in a["by_owner"]}
    assert owners["alice@acme.com"]["leads"] == 2
    assert owners["alice@acme.com"]["won"] == 1
    assert owners["alice@acme.com"]["value_cents"] == 13000
    # The lost lead had no owner → appears under the null key.
    assert None in owners
    assert owners[None]["leads"] == 1


# --------------------------------------------------------------------------- #
# Limits per tier                                                             #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("plan_name", "expected_cap"),
    [
        ("Starter", 10),
        ("Pro", 10),
        ("Pro Plus", 10),
        ("Agency", None),
    ],
)
async def test_get_limits_per_tier(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    plan_name: str,
    expected_cap: int | None,
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name=plan_name)
    user = await _make_user(
        maker, email=f"{plan_name.replace(' ', '')}@example.com", plan_id=plan_id
    )

    async with _client(app) as c:
        resp = await c.get("/api/crm/limits", headers=_auth_header_for(user))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tier"] == plan_name
    assert body["cap"] == expected_cap
    assert body["used"] == 0


# --------------------------------------------------------------------------- #
# Cross-workspace isolation                                                   #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_cross_workspace_campaign_404(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Agency")
    user_a = await _make_user(maker, email="a@example.com", plan_id=plan_id)
    user_b = await _make_user(maker, email="b@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user_a, "A's campaign")
        cid = campaign["id"]

        # User B cannot read, update, delete, or list leads on A's campaign.
        assert (
            await c.get(
                f"/api/crm/campaigns/{cid}", headers=_auth_header_for(user_b)
            )
        ).status_code == 404
        assert (
            await c.patch(
                f"/api/crm/campaigns/{cid}",
                json={"name": "hijack"},
                headers=_auth_header_for(user_b),
            )
        ).status_code == 404
        assert (
            await c.delete(
                f"/api/crm/campaigns/{cid}", headers=_auth_header_for(user_b)
            )
        ).status_code == 404
        assert (
            await c.get(
                f"/api/crm/campaigns/{cid}/leads",
                headers=_auth_header_for(user_b),
            )
        ).status_code == 404
        # And B cannot create a lead under A's campaign.
        assert (
            await c.post(
                "/api/crm/leads",
                json={"campaign_id": cid, "name": "x", "email": "x@x.com"},
                headers=_auth_header_for(user_b),
            )
        ).status_code == 404


@pytest.mark.asyncio
async def test_cross_workspace_lead_404(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Agency")
    user_a = await _make_user(maker, email="la@example.com", plan_id=plan_id)
    user_b = await _make_user(maker, email="lb@example.com", plan_id=plan_id)

    async with _client(app) as c:
        campaign = await _create_campaign(c, user_a, "A camp")
        lead = (
            await c.post(
                "/api/crm/leads",
                json={
                    "campaign_id": campaign["id"],
                    "name": "Lead",
                    "email": "lead@a.com",
                },
                headers=_auth_header_for(user_a),
            )
        ).json()
        lid = lead["id"]

        assert (
            await c.patch(
                f"/api/crm/leads/{lid}",
                json={"stage": "won"},
                headers=_auth_header_for(user_b),
            )
        ).status_code == 404
        assert (
            await c.delete(
                f"/api/crm/leads/{lid}", headers=_auth_header_for(user_b)
            )
        ).status_code == 404
        assert (
            await c.get(
                f"/api/crm/leads/{lid}/activities",
                headers=_auth_header_for(user_b),
            )
        ).status_code == 404


# --------------------------------------------------------------------------- #
# Audit trail                                                                 #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_mutations_write_audit_rows(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.audit_logs import AuditLog

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="audit@example.com", plan_id=plan_id)

    async with _client(app) as c:
        await _create_campaign(c, user, "Audited")

    async with maker() as session:
        rows = (await session.execute(select(AuditLog))).scalars().all()
    actions = {r.action for r in rows}
    assert "crm.campaign_created" in actions
