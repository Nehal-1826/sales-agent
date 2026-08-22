"""Tests for the Julex (julex.shop) store-link integration.

Covers:
  - POST /api/workspace/integrations/julex/verify — success / invalid key /
    key embedded in pasted text / duplicate store → 409
  - GET + DELETE /api/workspace/integrations/julex — masked key, disconnect
  - GET /api/integrations/julex/status — public (no auth), mailbox count, plan
  - the "mailbox_connected" webhook fired by the mailbox-create route

Harness mirrors tests/test_workspace_settings.py (in-memory SQLite with an
explicit table list, ``get_db`` overridden at the app level). Julex HTTP is
faked via the _Resp/_RoutingClient pattern from tests/test_gmail_engagement.py.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

KEY = "pk_live_7YcQmZ3vXkD2NwRf"


# --------------------------------------------------------------------------- #
# Fake httpx (adapted from tests/test_gmail_engagement.py)                     #
# --------------------------------------------------------------------------- #


class _Resp:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _RoutingClient:
    """Fake httpx.AsyncClient routing (method, path) → canned _Resp.

    ``routes`` maps a ``"GET /api/public/settings"``-style key (matched by
    suffix on the request path) to a ``_Resp``. Records every call in
    ``calls`` so tests can assert on headers sent to Julex.
    """

    calls: list[dict] = []

    def __init__(self, routes: dict) -> None:
        self._routes = routes

    def __call__(self, *a, **k):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def _match(self, method: str, url: str) -> _Resp:
        for key, resp in self._routes.items():
            m, _, suffix = key.partition(" ")
            if m == method and url.endswith(suffix.split("?")[0]):
                return resp
        raise AssertionError(f"no route for {method} {url}")

    async def get(self, url, **kwargs):
        type(self).calls.append({"method": "GET", "url": url, **kwargs})
        return self._match("GET", url)

    async def post(self, url, **kwargs):
        type(self).calls.append({"method": "POST", "url": url, **kwargs})
        return self._match("POST", url)


def _install(monkeypatch, routes: dict) -> type[_RoutingClient]:
    from app.services import julex_service

    _RoutingClient.calls = []
    monkeypatch.setattr(julex_service.httpx, "AsyncClient", _RoutingClient(routes))
    return _RoutingClient


# --------------------------------------------------------------------------- #
# Harness (mirrors tests/test_workspace_settings.py)                           #
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


async def _setup_db():
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.api_keys import ApiKey
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.notifications import Notification
    from app.db.models.payments import Payment
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.warmup_logs import WarmupLog
    from app.db.models.webhooks import Webhook
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
            ApiKey,
            Mailbox,
            Payment,
            Notification,
            WarmupLog,
            Webhook,
            WorkspaceSetting,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest.fixture(autouse=True)
def _bypass_live_smtp_probe():
    """The mailbox-create test must not open real sockets (see test_mailboxes.py)."""
    from app.services import mailbox_service

    with (
        patch.object(mailbox_service, "_probe_smtp", AsyncMock(return_value=(True, None))),
        patch.object(mailbox_service, "_probe_imap", AsyncMock(return_value=(True, None))),
    ):
        yield


@pytest_asyncio.fixture
async def app_and_maker() -> AsyncIterator[tuple[object, async_sessionmaker[AsyncSession]]]:
    maker, engine = await _setup_db()
    from app.db.session import get_db
    from app.main import create_app

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as s:
            yield s

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield app, maker
    finally:
        await engine.dispose()


async def _seed_plan(maker, *, name: str = "Pro") -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as session:
        plan = Plan(
            name=name,
            price_cents=2900,
            max_mailboxes=10,
            daily_email_cap=200,
            token_cap_per_month=30_000,
            capabilities={},
            is_active=True,
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        return plan.id


async def _make_user(maker, *, email: str, plan_id: uuid.UUID | None = None):
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.plan_selected,
            totp_enabled=False,
            plan_id=plan_id,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


def _auth(user) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    tok = create_access_token(subject=str(user.id), role=role, workspace_id=str(user.workspace_id))
    return {"Authorization": f"Bearer {tok}"}


# --------------------------------------------------------------------------- #
# POST /julex/verify                                                           #
# --------------------------------------------------------------------------- #


async def test_verify_success_persists_link(app_and_maker, monkeypatch) -> None:
    from app.db.models.workspace_settings import WorkspaceSetting

    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    client_cls = _install(
        monkeypatch, {"GET /api/public/settings": _Resp(200, {"storeName": "Aurelia Jewels"})}
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/integrations/julex/verify",
            json={"store_key": KEY},
            headers=_auth(user),
        )
    assert r.status_code == 200, r.text
    assert r.json() == {"connected": True, "store_name": "Aurelia Jewels"}

    # Request to Julex carried the store key header and hit the right path.
    assert len(client_cls.calls) == 1
    assert client_cls.calls[0]["url"].endswith("/api/public/settings")
    assert client_cls.calls[0]["headers"] == {"x-store-key": KEY}

    async with maker() as s:
        row = await s.get(WorkspaceSetting, user.workspace_id)
        assert row is not None
        assert row.julex_store_key == KEY
        assert row.julex_store_name == "Aurelia Jewels"
        assert row.julex_connected_at is not None


async def test_verify_invalid_key_404_nothing_persisted(app_and_maker, monkeypatch) -> None:
    from sqlalchemy import select

    from app.db.models.workspace_settings import WorkspaceSetting

    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    _install(monkeypatch, {"GET /api/public/settings": _Resp(401, {})})
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/integrations/julex/verify",
            json={"store_key": "pk_live_wrongwrongwrong"},
            headers=_auth(user),
        )
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "Julex did not accept this key"
    async with maker() as s:
        rows = (await s.execute(select(WorkspaceSetting))).scalars().all()
        assert rows == []


async def test_verify_extracts_key_embedded_in_pasted_text(app_and_maker, monkeypatch) -> None:
    from app.db.models.workspace_settings import WorkspaceSetting

    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    _install(monkeypatch, {"GET /api/public/settings": _Resp(200, {"store_name": "Alt Spelling"})})
    pasted = f"Your Julex Public API key is:\n{KEY}\n(copy from Settings → API)"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/integrations/julex/verify",
            json={"store_key": pasted},
            headers=_auth(user),
        )
    assert r.status_code == 200, r.text
    assert r.json()["store_name"] == "Alt Spelling"  # snake_case accepted too
    async with maker() as s:
        row = await s.get(WorkspaceSetting, user.workspace_id)
        assert row.julex_store_key == KEY


async def test_verify_rejects_text_without_a_key(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/integrations/julex/verify",
            json={"store_key": "not-a-julex-key-at-all"},
            headers=_auth(user),
        )
    assert r.status_code == 422, r.text
    assert "no valid Julex key" in r.json()["detail"]


async def test_second_workspace_same_key_409(app_and_maker, monkeypatch) -> None:
    app, maker = app_and_maker
    user_a = await _make_user(maker, email="a@acme.com")
    user_b = await _make_user(maker, email="b@shop.com")
    _install(monkeypatch, {"GET /api/public/settings": _Resp(200, {"storeName": "Aurelia"})})
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r1 = await c.post(
            "/api/workspace/integrations/julex/verify",
            json={"store_key": KEY},
            headers=_auth(user_a),
        )
        r2 = await c.post(
            "/api/workspace/integrations/julex/verify",
            json={"store_key": KEY},
            headers=_auth(user_b),
        )
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 409, r2.text
    assert r2.json()["detail"] == ("This Julex store is already linked to another workspace")


# --------------------------------------------------------------------------- #
# GET / DELETE /julex                                                          #
# --------------------------------------------------------------------------- #


async def test_get_masks_key_and_delete_clears_link(app_and_maker, monkeypatch) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    _install(monkeypatch, {"GET /api/public/settings": _Resp(200, {"storeName": "Aurelia Jewels"})})
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/integrations/julex/verify",
            json={"store_key": KEY},
            headers=_auth(user),
        )
        assert r.status_code == 200, r.text

        g1 = await c.get("/api/workspace/integrations/julex", headers=_auth(user))
        assert g1.status_code == 200, g1.text
        body = g1.json()
        assert body["connected"] is True
        assert body["store_key_masked"] == KEY[:8] + "…"
        assert KEY not in body["store_key_masked"]
        assert body["store_name"] == "Aurelia Jewels"
        assert body["connected_at"] is not None

        d = await c.delete("/api/workspace/integrations/julex", headers=_auth(user))
        assert d.status_code == 204, d.text

        g2 = await c.get("/api/workspace/integrations/julex", headers=_auth(user))
    assert g2.status_code == 200, g2.text
    assert g2.json() == {
        "connected": False,
        "store_key_masked": None,
        "store_name": None,
        "connected_at": None,
    }


# --------------------------------------------------------------------------- #
# GET /api/integrations/julex/status (public, no auth)                         #
# --------------------------------------------------------------------------- #


async def test_status_unknown_key_404(app_and_maker) -> None:
    app, maker = app_and_maker
    await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        # Deliberately NO auth header — the endpoint is public.
        r = await c.get(
            "/api/integrations/julex/status", params={"store_key": "pk_live_nope00000000"}
        )
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "not connected"


async def test_status_connected_returns_counts(app_and_maker, monkeypatch) -> None:
    from app.db.models.mailboxes import Mailbox, MailboxProvider

    app, maker = app_and_maker
    plan_id = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="owner@acme.com", plan_id=plan_id)
    _install(monkeypatch, {"GET /api/public/settings": _Resp(200, {"storeName": "Aurelia Jewels"})})
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/integrations/julex/verify",
            json={"store_key": KEY},
            headers=_auth(user),
        )
        assert r.status_code == 200, r.text

    async with maker() as s:
        for addr in ("one@acme.com", "two@acme.com"):
            s.add(
                Mailbox(
                    user_id=user.id,
                    workspace_id=user.workspace_id,
                    email_address=addr,
                    provider=MailboxProvider.smtp,
                )
            )
        await s.commit()

    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(  # NO auth header — Julex polls this anonymously
            "/api/integrations/julex/status", params={"store_key": KEY}
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["connected"] is True
    assert body["store_name"] == "Aurelia Jewels"
    assert body["mailboxes"] == 2
    assert body["plan"] == "Pro"
    assert body["connected_at"] is not None


# --------------------------------------------------------------------------- #
# mailbox_connected webhook                                                    #
# --------------------------------------------------------------------------- #


async def test_mailbox_create_fires_mailbox_connected_webhook(app_and_maker, monkeypatch) -> None:
    from app.api.routes import mailboxes as mailboxes_route
    from app.api.routes import workspace_settings as ws_settings_route
    from app.api.routes import workspace_webhooks as ws_webhooks_route

    # The event must be selectable in both event registries.
    assert "mailbox_connected" in ws_webhooks_route._ALLOWED_EVENTS
    assert "mailbox_connected" in ws_settings_route._DEFAULT_EVENT_KEYS

    app, maker = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="jx@acme.com", plan_id=plan_id)

    recorded: list[tuple] = []

    def _recorder(workspace_id, event, payload):
        recorded.append((workspace_id, event, payload))

    monkeypatch.setattr(mailboxes_route, "fire_and_forget_webhooks", _recorder)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/mailboxes",
            json={
                "email_address": "jx-mbx@example.com",
                "provider": "smtp",
                "smtp_host": "smtp.example.com",
                "smtp_port": 587,
                "smtp_username": "jx-mbx@example.com",
                "smtp_password": "s3cret-p@ss",
                "imap_host": "imap.example.com",
                "imap_port": 993,
                "daily_target": 50,
                "content_mode": "A",
            },
            headers=_auth(user),
        )
    assert r.status_code == 201, r.text
    assert len(recorded) == 1
    workspace_id, event, payload = recorded[0]
    assert workspace_id == user.workspace_id
    assert event == "mailbox_connected"
    assert payload["email_address"] == "jx-mbx@example.com"
    assert payload["provider"] == "smtp"
    assert payload["mailbox_id"] == r.json()["id"]


async def test_webhook_failure_never_breaks_mailbox_creation(app_and_maker, monkeypatch) -> None:
    from app.api.routes import mailboxes as mailboxes_route

    app, maker = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_user(maker, email="boom@acme.com", plan_id=plan_id)

    def _exploder(*a, **k):
        raise RuntimeError("webhook fanout exploded")

    monkeypatch.setattr(mailboxes_route, "fire_and_forget_webhooks", _exploder)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/mailboxes",
            json={
                "email_address": "boom-mbx@example.com",
                "provider": "smtp",
                "smtp_host": "smtp.example.com",
                "smtp_port": 587,
                "smtp_username": "boom-mbx@example.com",
                "smtp_password": "s3cret-p@ss",
                "imap_host": "imap.example.com",
                "imap_port": 993,
                "daily_target": 50,
                "content_mode": "A",
            },
            headers=_auth(user),
        )
    assert r.status_code == 201, r.text
    assert r.json()["email_address"] == "boom-mbx@example.com"
