"""Unit tests for the outbound webhook dispatcher (D2).

Six scenarios:

1. HMAC body signing.
2. SSRF block on loopback URL.
3. SSRF block on RFC1918 URL (10.0.0.0/8).
4. Exponential retry on 5xx → eventual ``dead_letter`` after 4 attempts.
5. Subscription filter — event a webhook didn't subscribe to MUST NOT
   produce a delivery row.
6. Rate-limit — 1001st send in an hour comes back ``rate_limited``.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from typing import Any
from unittest.mock import MagicMock, patch

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest_asyncio.fixture
async def session():
    # Lazy imports so conftest's env-var seeding wins.
    from app.db import models  # noqa: F401  — register models on Base.metadata
    from app.db.base import Base

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


def _make_webhook(
    *,
    url: str,
    events: list[str] | None = None,
    workspace_id: uuid.UUID | None = None,
):
    from app.db.models.webhooks import Webhook
    from app.services.crypto import get_fernet_service

    secret = "whsec_test_secret_value"
    encrypted = get_fernet_service().encrypt(secret.encode("utf-8"))
    return Webhook(
        workspace_id=workspace_id or uuid.uuid4(),
        url=url,
        secret_encrypted=encrypted,
        events=events if events is not None else ["mailbox_paused"],
        is_active=True,
    ), secret


class _FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code


class _FakeClient:
    """Captures the last ``post`` call. ``status_code`` cycles per request."""

    def __init__(self, status_codes: list[int] | int = 200):
        self._codes = (
            [status_codes] if isinstance(status_codes, int) else list(status_codes)
        )
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):  # noqa: D401
        return False

    async def post(self, url: str, *, content: bytes, headers: dict[str, str]):
        self.calls.append(
            {"url": url, "content": content, "headers": dict(headers)}
        )
        code = self._codes.pop(0) if len(self._codes) > 1 else self._codes[0]
        return _FakeResponse(code)


# --------------------------------------------------------------------------- #
# 1) HMAC signing                                                              #
# --------------------------------------------------------------------------- #


async def test_dispatch_signs_body_with_hmac(session):
    from app.services import webhook_dispatcher as wd

    wh, secret = _make_webhook(url="https://example.test/hook")
    session.add(wh)
    await session.commit()
    await session.refresh(wh)

    fake = _FakeClient(status_codes=200)

    # Skip SSRF + rate-limit so we exercise the sign path cleanly.
    with patch.object(wd, "_ssrf_check", return_value=None), patch.object(
        wd, "check_and_increment_rate_limit", return_value=True
    ), patch.object(wd.httpx, "AsyncClient", lambda timeout=None: fake):
        delivery = await wd.send(
            wh,
            "mailbox_paused",
            {"mailbox_id": "abc"},
            session=session,
        )

    assert delivery.status == "ok"
    assert delivery.response_code == 200
    assert len(fake.calls) == 1
    headers = fake.calls[0]["headers"]
    body = fake.calls[0]["content"]
    sig = headers["X-WarmPulse-Signature"]
    assert sig.startswith("sha256=")
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert sig == f"sha256={expected}"
    # And the body really is the JSON we promised.
    decoded = json.loads(body.decode("utf-8"))
    assert decoded == {"event": "mailbox_paused", "payload": {"mailbox_id": "abc"}}


# --------------------------------------------------------------------------- #
# 2) SSRF — loopback                                                           #
# --------------------------------------------------------------------------- #


async def test_dispatch_rejects_loopback_url(session):
    from app.db.models.webhooks import WebhookDelivery
    from app.services import webhook_dispatcher as wd

    wh, _secret = _make_webhook(url="http://127.0.0.1/hook")
    session.add(wh)
    await session.commit()
    await session.refresh(wh)

    http_mock = MagicMock(side_effect=AssertionError("HTTP must not be called"))
    with patch.object(wd, "check_and_increment_rate_limit", return_value=True), patch.object(
        wd.httpx, "AsyncClient", http_mock
    ):
        delivery = await wd.send(
            wh, "mailbox_paused", {"x": 1}, session=session
        )

    assert delivery.status == "ssrf_blocked"
    assert "SSRF" in (delivery.error_text or "")
    rows = (await session.execute(select(WebhookDelivery))).scalars().all()
    assert len(rows) == 1
    http_mock.assert_not_called()


# --------------------------------------------------------------------------- #
# 3) SSRF — private RFC1918                                                    #
# --------------------------------------------------------------------------- #


async def test_dispatch_rejects_private_ip(session):
    from app.services import webhook_dispatcher as wd

    wh, _secret = _make_webhook(url="http://10.0.0.1/hook")
    session.add(wh)
    await session.commit()
    await session.refresh(wh)

    http_mock = MagicMock(side_effect=AssertionError("HTTP must not be called"))
    with patch.object(wd, "check_and_increment_rate_limit", return_value=True), patch.object(
        wd.httpx, "AsyncClient", http_mock
    ):
        delivery = await wd.send(
            wh, "mailbox_paused", {"x": 1}, session=session
        )

    assert delivery.status == "ssrf_blocked"
    assert "10.0.0.1" in (delivery.error_text or "")
    http_mock.assert_not_called()


# --------------------------------------------------------------------------- #
# 4) Retry on 5xx → dead_letter after 4 attempts                                #
# --------------------------------------------------------------------------- #


async def test_dispatch_retries_on_5xx(session):
    from app.db.models.webhooks import WebhookDelivery
    from app.services import webhook_dispatcher as wd

    wh, _secret = _make_webhook(url="https://example.test/hook")
    session.add(wh)
    await session.commit()
    await session.refresh(wh)

    # Track scheduled retries — replace the real Celery dispatcher with a
    # function that immediately re-invokes ``send`` with the next attempt.
    scheduled: list[int] = []

    async def fake_send_chain(initial_attempt: int) -> None:
        # Force a 500 forever; each retry should call _schedule_retry until
        # we hit MAX_ATTEMPTS.
        async def fake_client(timeout=None):
            return _FakeClient(status_codes=500)

        def _capture_retry(*, webhook_id, event, payload, next_attempt):
            scheduled.append(next_attempt)
            # Re-invoke send synchronously in-test rather than going via Celery.

        with patch.object(wd, "_ssrf_check", return_value=None), patch.object(
            wd, "check_and_increment_rate_limit", return_value=True
        ), patch.object(wd.httpx, "AsyncClient", lambda timeout=None: _FakeClient(500)), patch.object(
            wd, "_schedule_retry", side_effect=_capture_retry
        ):
            attempt = initial_attempt
            while attempt <= wd.MAX_ATTEMPTS:
                await wd.send(
                    wh, "mailbox_paused", {"x": 1}, attempt=attempt, session=session
                )
                if scheduled and scheduled[-1] == attempt + 1:
                    attempt = scheduled[-1]
                else:
                    break

    await fake_send_chain(1)

    rows = (
        await session.execute(
            select(WebhookDelivery)
            .where(WebhookDelivery.webhook_id == wh.id)
            .order_by(WebhookDelivery.attempt.asc())
        )
    ).scalars().all()
    assert len(rows) == 4, f"expected 4 attempts, got {len(rows)}"
    assert [r.attempt for r in rows] == [1, 2, 3, 4]
    assert [r.status for r in rows] == ["failed", "failed", "failed", "dead_letter"]
    assert rows[-1].response_code == 500
    # First 3 failures must have scheduled a retry.
    assert scheduled == [2, 3, 4]


# --------------------------------------------------------------------------- #
# 5) Subscription filter — event a webhook didn't subscribe to                #
# --------------------------------------------------------------------------- #


async def test_dispatch_only_fires_for_subscribed_events(session):
    from app.db.models.webhooks import WebhookDelivery
    from app.services.notifications_dispatch import fanout_workspace_webhooks

    ws_id = uuid.uuid4()
    wh, _secret = _make_webhook(
        url="https://example.test/hook",
        events=["mailbox_paused"],
        workspace_id=ws_id,
    )
    session.add(wh)
    await session.commit()

    # Patch SessionLocal so the fan-out helper uses our in-memory session.
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def fake_session_ctx():
        yield session

    fake_factory = MagicMock(side_effect=lambda: fake_session_ctx())
    with patch(
        "app.services.notifications_dispatch.SessionLocal", fake_factory
    ):
        count = await fanout_workspace_webhooks(
            ws_id, "bounce_spike", {"foo": "bar"}
        )

    assert count == 0
    rows = (await session.execute(select(WebhookDelivery))).scalars().all()
    assert rows == []


# --------------------------------------------------------------------------- #
# 6) Rate-limit                                                                #
# --------------------------------------------------------------------------- #


async def test_dispatcher_respects_rate_limit(session):
    from app.services import webhook_dispatcher as wd

    wh, _secret = _make_webhook(url="https://example.test/hook")
    session.add(wh)
    await session.commit()
    await session.refresh(wh)

    # Fake redis: in-memory counter that mirrors INCR / EXPIRE semantics.
    counters: dict[str, int] = {}

    class _FakeRedis:
        def incr(self, key: str) -> int:
            counters[key] = counters.get(key, 0) + 1
            return counters[key]

        def expire(self, key: str, ttl: int) -> bool:  # noqa: ARG002
            return True

    fake_redis = _FakeRedis()
    # Pretend we already burned 999 — the 1000th must pass, the 1001st blocks.
    key = wd._rate_key(wh.workspace_id)
    counters[key] = 999

    with patch.object(wd, "_redis_client", return_value=fake_redis), patch.object(
        wd, "_ssrf_check", return_value=None
    ), patch.object(wd.httpx, "AsyncClient", lambda timeout=None: _FakeClient(200)):
        ok = await wd.send(wh, "mailbox_paused", {"x": 1}, session=session)
        blocked = await wd.send(wh, "mailbox_paused", {"x": 2}, session=session)

    assert ok.status == "ok"
    assert blocked.status == "rate_limited"
    assert "1000" in (blocked.error_text or "") or "hour" in (blocked.error_text or "")
