"""Tests for the workspace Tools endpoints (spec §5.1 item 6).

Follows the harness pattern from :mod:`tests.test_mailboxes`: shared
in-memory SQLite with StaticPool, ``get_db`` overridden, only the tables
each test needs are created (to dodge duplicate-index quirks).
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

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
    from app.db import models  # noqa: F401 — register on Base.metadata
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.email_templates import EmailTemplate
    from app.db.models.mailboxes import Mailbox
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.placement_tests import PlacementTest
    from app.db.models.plans import Plan
    from app.db.models.spam_scans import SpamScan
    from app.db.models.users import User
    from app.db.models.llm_usage import LlmUsage

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
            Mailbox,
            PeerInbox,
            PlacementTest,
            SpamScan,
            EmailTemplate,
            AuditLog,
            LlmUsage,
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
# factories                                                                    #
# --------------------------------------------------------------------------- #


async def _seed_plan(
    maker: async_sessionmaker[AsyncSession],
) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as session:
        plan = Plan(
            name="Starter",
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


async def _make_mailbox(
    maker: async_sessionmaker[AsyncSession],
    *,
    user,
    email: str = "mbx@example.com",
) -> object:
    from app.db.models.mailboxes import (
        ContentMode,
        Mailbox,
        MailboxProvider,
        WarmupStatus,
    )

    async with maker() as session:
        m = Mailbox(
            user_id=user.id,
            workspace_id=user.workspace_id,
            email_address=email,
            provider=MailboxProvider.smtp,
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username=email,
            smtp_password_encrypted=b"",
            imap_host="imap.example.com",
            imap_port=993,
            warmup_status=WarmupStatus.active,
            daily_target=50,
            current_day=1,
            warmth_score=0.0,
            content_mode=ContentMode.A,
            is_paused=False,
        )
        session.add(m)
        await session.commit()
        await session.refresh(m)
        return m


async def _seed_peers(maker: async_sessionmaker[AsyncSession], n: int = 24) -> None:
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider

    providers = [PeerProvider.google_ws, PeerProvider.office365, PeerProvider.yahoo]
    async with maker() as session:
        for i in range(n):
            p = PeerInbox(
                email_address=f"peer-{i}@peers.example.com",
                provider=providers[i % 3],
                smtp_creds_encrypted=b"",
                imap_creds_encrypted=b"",
                reputation_score=80.0,
                daily_capacity=50,
                used_today=0,
                is_active=True,
            )
            session.add(p)
        await session.commit()


def _auth_header_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Placement Tester                                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_placement_request_records_row(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.placement_tests import PlacementTest

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="a@example.com", plan_id=plan_id)
    mbx = await _make_mailbox(maker, user=user, email="a-mbx@example.com")
    await _seed_peers(maker, n=24)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/tools/placement",
            json={
                "mailbox_id": str(mbx.id),
                "subject": "Hello",
                "body": "Just a quick hi.",
                "is_html": False,
            },
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 201, resp.text

    async with maker() as session:
        row = (await session.execute(select(PlacementTest))).scalar_one()
        assert row.mailbox_id == mbx.id
        # seed_set is a JSON dict with a 'peers' list of emails.
        seed = row.seed_set or {}
        assert isinstance(seed.get("peers"), list)
        assert len(seed["peers"]) > 0


@pytest.mark.asyncio
async def test_placement_returns_mocked_results_with_per_provider_breakdown(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="b@example.com", plan_id=plan_id)
    mbx = await _make_mailbox(maker, user=user, email="b-mbx@example.com")
    await _seed_peers(maker, n=24)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/tools/placement",
            json={
                "mailbox_id": str(mbx.id),
                "subject": "Test",
                "body": "Body",
                "is_html": False,
            },
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "test_id" in body
    assert body["seed_count"] > 0
    results = body["results"]
    assert {"inbox", "promotions", "spam", "blocked", "per_provider"} <= set(results)
    assert {"gmail", "outlook", "yahoo"} <= set(results["per_provider"])
    for prov in ("gmail", "outlook", "yahoo"):
        assert {"inbox", "promotions", "spam", "blocked"} <= set(results["per_provider"][prov])


# --------------------------------------------------------------------------- #
# Spam Scanner                                                                #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_spam_scan_detects_major_triggers(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="s@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/tools/spam-scan",
            json={
                "subject": "CONGRATULATIONS YOU ARE A WINNER",
                "body": "FREE iPhone!!! Click here to claim your prize now!!!",
                "is_html": False,
            },
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["score"] > 30
    assert body["passed"] is False
    # Should have at least one 'word' trigger.
    types = {t["type"] for t in body["triggers"]}
    assert "word" in types


@pytest.mark.asyncio
async def test_spam_scan_passes_clean_content(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="clean@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/tools/spam-scan",
            json={
                "subject": "Catching up tomorrow",
                "body": "Hey, hope you are well. Let me know when you are around to chat.",
                "is_html": False,
            },
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["score"] < 10
    assert body["passed"] is True


# --------------------------------------------------------------------------- #
# Templates                                                                   #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_template_crud_scoped_by_workspace(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user_a = await _make_user(maker, email="a@example.com", plan_id=plan_id)
    user_b = await _make_user(maker, email="b@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        create = await c.post(
            "/api/workspace/tools/templates",
            json={"name": "A's template", "html": "<p>Hi</p>"},
            headers=_auth_header_for(user_a),
        )
        assert create.status_code == 201, create.text
        tpl_id = create.json()["id"]

        # user A sees it
        list_a = await c.get(
            "/api/workspace/tools/templates", headers=_auth_header_for(user_a)
        )
        assert list_a.status_code == 200
        assert any(t["id"] == tpl_id for t in list_a.json()["items"])

        # user B does NOT see it
        list_b = await c.get(
            "/api/workspace/tools/templates", headers=_auth_header_for(user_b)
        )
        assert list_b.status_code == 200
        assert not any(t["id"] == tpl_id for t in list_b.json()["items"])

        # user B cannot PATCH A's template
        patch_b = await c.patch(
            f"/api/workspace/tools/templates/{tpl_id}",
            json={"name": "hacked"},
            headers=_auth_header_for(user_b),
        )
        assert patch_b.status_code == 404

        # user B cannot DELETE A's template
        del_b = await c.delete(
            f"/api/workspace/tools/templates/{tpl_id}",
            headers=_auth_header_for(user_b),
        )
        assert del_b.status_code == 404


@pytest.mark.asyncio
async def test_template_generate_llm_records_usage(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.llm_usage import LlmUsage
    from app.services.llm.provider import LLMResponse, TokenUsage

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="z@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        create = await c.post(
            "/api/workspace/tools/templates",
            json={"name": "seed", "html": "<p>x</p>"},
            headers=_auth_header_for(user),
        )
        tpl_id = create.json()["id"]

        fake_resp = LLMResponse(
            content="<div>Generated HTML</div>",
            usage=TokenUsage(prompt_tokens=120, completion_tokens=80),
            model="gemini-1.5-flash",
            finish_reason="stop",
        )

        class _FakeSettings:
            gemini_api_key = "k-test"
            gemini_base_url = "https://x"
            gemini_model = "gemini-1.5-flash"
            anthropic_api_key = ""
            llm_price_per_1k_tokens_usd = 0.0005

        # BigInteger autoincrement doesn't work on SQLite, so shim record_usage
        # to insert with an explicit id while preserving the real fields.
        from app.db.models.llm_usage import LlmUsage as _LlmUsage

        async def _recording_usage(
            db, *, user_id, mailbox_id, mode, usage, settings
        ):
            row = _LlmUsage(
                id=1,
                user_id=user_id,
                mailbox_id=mailbox_id,
                mode=mode,
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                cost_cents=0,
            )
            db.add(row)
            await db.flush()
            return row

        with (
            patch(
                "app.api.routes.tools.get_settings",
                return_value=_FakeSettings(),
            ),
            patch(
                "app.services.tools_service.GeminiProvider.complete",
                new=AsyncMock(return_value=fake_resp),
            ),
            patch(
                "app.services.tools_service.record_usage",
                new=AsyncMock(side_effect=_recording_usage),
            ),
        ):
            resp = await c.post(
                f"/api/workspace/tools/templates/{tpl_id}/generate-llm",
                json={"prompt": "Design a minimal welcome email."},
                headers=_auth_header_for(user),
            )
    assert resp.status_code == 200, resp.text
    assert "Generated HTML" in resp.json()["html"]

    async with maker() as session:
        row = (await session.execute(select(LlmUsage))).scalar_one_or_none()
        assert row is not None
        assert row.prompt_tokens == 120
        assert row.completion_tokens == 80
        assert row.user_id == user.id


@pytest.mark.asyncio
async def test_template_preview_strips_script_tags(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="p@example.com", plan_id=plan_id)

    dangerous = (
        "<div>hello</div>"
        "<script>alert('xss')</script>"
        "<img src='https://evil.example.com/pixel.gif' onerror='alert(1)'>"
        "<a href='javascript:alert(1)'>click</a>"
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/tools/templates/preview",
            json={"html": dangerous},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 200, resp.text
    out = resp.json()["html"]
    assert "<script" not in out.lower()
    assert "onerror" not in out.lower()
    assert "javascript:" not in out.lower()
    assert "evil.example.com" not in out


# --------------------------------------------------------------------------- #
# Warmup Preview                                                              #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_warmup_preview_returns_count_samples(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="wp@example.com", plan_id=plan_id)
    mbx = await _make_mailbox(maker, user=user, email="wp-mbx@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/tools/warmup-preview",
            json={"mailbox_id": str(mbx.id), "count": 5, "mode": "A"},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["samples"]) == 5
    for s in body["samples"]:
        assert s["subject"]
        assert s["peer_email_mock"].endswith("@acme-peers.com")


@pytest.mark.asyncio
async def test_warmup_preview_mode_b_returns_html(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="wb@example.com", plan_id=plan_id)
    mbx = await _make_mailbox(maker, user=user, email="wb-mbx@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/tools/warmup-preview",
            json={"mailbox_id": str(mbx.id), "count": 3, "mode": "B"},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 200, resp.text
    samples = resp.json()["samples"]
    assert len(samples) == 3
    assert all(s["is_html"] is True for s in samples)
