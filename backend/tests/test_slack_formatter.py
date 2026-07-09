"""Tests for the Slack Block Kit formatter + dispatcher integration."""
from __future__ import annotations

import json
import uuid
from typing import Any
from unittest.mock import patch

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


# --------------------------------------------------------------------------- #
# 1) URL detection                                                             #
# --------------------------------------------------------------------------- #


def test_is_slack_url_matches_real_format():
    from app.services.slack_formatter import is_slack_url

    # Positive — a realistic Slack incoming-webhook URL.
    assert (
        is_slack_url(
            "https://hooks.slack.com/services/T01ABC234/B05XYZ678/abcDEF123ghiJKL456"
        )
        is True
    )

    # Negatives.
    # HTTP (not HTTPS).
    assert (
        is_slack_url(
            "http://hooks.slack.com/services/T01ABC234/B05XYZ678/abcDEF123ghiJKL"
        )
        is False
    )
    # Different domain.
    assert is_slack_url("https://example.com/hook") is False
    # Malformed path.
    assert is_slack_url("https://hooks.slack.com/services/T01ABC234") is False
    # Empty / non-string.
    assert is_slack_url("") is False
    assert is_slack_url("not a url") is False


# --------------------------------------------------------------------------- #
# 2) mailbox_paused — full Block Kit envelope                                  #
# --------------------------------------------------------------------------- #


def test_format_mailbox_paused_produces_valid_block_kit():
    from app.services.slack_formatter import format as slack_format

    body = slack_format(
        "mailbox_paused",
        {
            "mailbox_email": "alex@acme.com",
            "mailbox_id": "abc-123",
            "reason": "Bounce rate exceeded 3%",
        },
    )

    # Top-level shape.
    assert isinstance(body, dict)
    assert "text" in body and isinstance(body["text"], str)
    assert "alex@acme.com" in body["text"]
    assert isinstance(body["blocks"], list) and len(body["blocks"]) >= 3

    blocks = body["blocks"]
    types = [b["type"] for b in blocks]
    assert "header" in types
    assert "section" in types
    assert "context" in types

    header = next(b for b in blocks if b["type"] == "header")
    assert header["text"]["type"] == "plain_text"
    assert "Mailbox paused" in header["text"]["text"]

    section = next(b for b in blocks if b["type"] == "section")
    assert "fields" in section
    assert isinstance(section["fields"], list) and len(section["fields"]) >= 2
    for f in section["fields"]:
        assert f["type"] == "mrkdwn"
        assert "text" in f
    field_text_blob = " ".join(f["text"] for f in section["fields"])
    assert "alex@acme.com" in field_text_blob
    assert "Bounce rate exceeded 3%" in field_text_blob

    context = next(b for b in blocks if b["type"] == "context")
    assert context["elements"][0]["type"] == "mrkdwn"
    ctx_text = context["elements"][0]["text"]
    assert "mailboxes/abc-123" in ctx_text


# --------------------------------------------------------------------------- #
# 3) placement_test_completed — stacked emoji bar                              #
# --------------------------------------------------------------------------- #


def test_format_placement_completed_includes_stacked_emoji_bar():
    from app.services.slack_formatter import format as slack_format

    body = slack_format(
        "placement_test_completed",
        {
            "mailbox_email": "alex@acme.com",
            "results": {
                "inbox": 23,
                "promotions": 5,
                "spam": 2,
                "other": 0,
                "timeout": 0,
            },
        },
    )

    # The emoji bar lives in one of the mrkdwn block texts.
    all_text: list[str] = []
    for b in body["blocks"]:
        if b.get("type") == "section":
            if "text" in b and isinstance(b["text"], dict):
                all_text.append(b["text"].get("text", ""))
            for f in b.get("fields", []) or []:
                all_text.append(f.get("text", ""))
        elif b.get("type") == "context":
            for el in b.get("elements", []) or []:
                all_text.append(el.get("text", ""))

    combined = " ".join(all_text)
    assert "🟢" in combined
    assert "🔴" in combined  # spam > 0 → at least one red emoji


# --------------------------------------------------------------------------- #
# 4) Unknown event → generic fallback                                          #
# --------------------------------------------------------------------------- #


def test_unknown_event_falls_back_to_generic_format():
    from app.services.slack_formatter import format as slack_format

    body = slack_format("not_a_real_event", {"foo": "bar"})

    assert "blocks" in body
    types = [b["type"] for b in body["blocks"]]
    assert "header" in types
    header = next(b for b in body["blocks"] if b["type"] == "header")
    assert "🔔" in header["text"]["text"]
    # Event name surfaces somewhere in the header text.
    assert "not a real event" in header["text"]["text"]


# --------------------------------------------------------------------------- #
# 5) Dispatcher integration — Slack URL routes through formatter                #
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def session():
    from app.db import models  # noqa: F401 — register models
    from app.db.base import Base

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


class _FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code


class _FakeClient:
    def __init__(self):
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url: str, *, content: bytes, headers: dict[str, str]):
        self.calls.append(
            {"url": url, "content": content, "headers": dict(headers)}
        )
        return _FakeResponse(200)


def _make_webhook(url: str):
    from app.db.models.webhooks import Webhook
    from app.services.crypto import get_fernet_service

    secret = "whsec_test"
    encrypted = get_fernet_service().encrypt(secret.encode("utf-8"))
    return Webhook(
        workspace_id=uuid.uuid4(),
        url=url,
        secret_encrypted=encrypted,
        events=["mailbox_paused"],
        is_active=True,
    )


async def test_dispatcher_routes_slack_urls_to_slack_formatter(session):
    from app.services import webhook_dispatcher as wd

    slack_url = "https://hooks.slack.com/services/T01ABC234/B05XYZ678/abcDEF123ghiJKL"
    wh = _make_webhook(slack_url)
    session.add(wh)
    await session.commit()
    await session.refresh(wh)

    fake = _FakeClient()
    with patch.object(wd, "_ssrf_check", return_value=None), patch.object(
        wd, "check_and_increment_rate_limit", return_value=True
    ), patch.object(wd.httpx, "AsyncClient", lambda timeout=None: fake):
        delivery = await wd.send(
            wh,
            "mailbox_paused",
            {
                "mailbox_email": "alex@acme.com",
                "mailbox_id": "abc-123",
                "reason": "Bounce rate exceeded 3%",
            },
            session=session,
        )

    assert delivery.status == "ok"
    assert len(fake.calls) == 1
    body = json.loads(fake.calls[0]["content"].decode("utf-8"))
    # Slack body: has blocks, NOT the {event, payload} envelope.
    assert "blocks" in body
    assert "event" not in body
    assert "payload" not in body
    # HMAC signature still present.
    assert fake.calls[0]["headers"]["X-WarmPulse-Signature"].startswith("sha256=")


async def test_dispatcher_keeps_envelope_for_non_slack_urls(session):
    """Sanity: non-Slack URLs still get the original ``{event, payload}`` body."""
    from app.services import webhook_dispatcher as wd

    wh = _make_webhook("https://example.test/hook")
    session.add(wh)
    await session.commit()
    await session.refresh(wh)

    fake = _FakeClient()
    with patch.object(wd, "_ssrf_check", return_value=None), patch.object(
        wd, "check_and_increment_rate_limit", return_value=True
    ), patch.object(wd.httpx, "AsyncClient", lambda timeout=None: fake):
        await wd.send(
            wh,
            "mailbox_paused",
            {"mailbox_id": "abc"},
            session=session,
        )

    body = json.loads(fake.calls[0]["content"].decode("utf-8"))
    assert body == {"event": "mailbox_paused", "payload": {"mailbox_id": "abc"}}
