"""Outbound webhook dispatcher (Pro Tier — D2).

Workspaces register a URL + a list of subscribed event keys. When one of
those events fires elsewhere in the platform (notifications dispatch,
billing, peer health) we POST a JSON envelope to every subscribed URL,
signed with an HMAC-SHA256 of the body keyed by the per-webhook secret.

Three defensive layers wrap every send:

* **SSRF defense** — the destination host is resolved via ``getaddrinfo``
  and rejected if it lands on loopback / RFC1918 / link-local / unique-
  local / IPv6 loopback ranges. The resolution happens BEFORE the HTTP
  call so we never even open the socket against an internal address.
* **Rate-limit** — Redis INCR with a 1-hour sliding window per
  workspace; the 1001st request in any 60-minute window is rejected with
  ``rate_limited`` status (no HTTP call).
* **Retry policy** — on any non-2xx response (or timeout / network
  error) the delivery is requeued via a Celery task with exponential
  backoff: 60s, 300s, 1800s. After attempt 4 the delivery is marked
  ``dead_letter`` and the webhook's denormalised ``last_status`` reflects
  the failure.

Best-effort by design: every call wraps DB writes in their own commit so
a failure here can't poison the caller's transaction.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import socket
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.webhooks import Webhook, WebhookDelivery
from app.db.session import SessionLocal
from app.services import slack_formatter
from app.services.crypto import get_fernet_service

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Constants                                                                    #
# --------------------------------------------------------------------------- #

SIGNATURE_HEADER = "X-WarmPulse-Signature"
EVENT_HEADER = "X-WarmPulse-Event"
DELIVERY_HEADER = "X-WarmPulse-Delivery"

CONNECT_TIMEOUT_S = 30.0
READ_TIMEOUT_S = 60.0

MAX_ATTEMPTS = 4
RETRY_DELAYS_S = [60, 300, 1800]  # next-attempt countdowns for attempts 2/3/4

RATE_LIMIT_PER_HOUR = 1000
RATE_LIMIT_TTL_S = 3600


# --------------------------------------------------------------------------- #
# SSRF defense                                                                 #
# --------------------------------------------------------------------------- #

# RFC1918 + loopback + link-local + IPv6 ULA + IPv6 link-local + IPv6 loopback.
_BLOCKED_V4_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
]
_BLOCKED_V6_NETS = [
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _is_blocked_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv4Address):
        return any(ip in n for n in _BLOCKED_V4_NETS)
    return any(ip in n for n in _BLOCKED_V6_NETS)


def _ssrf_check(url: str) -> str | None:
    """Return a non-empty reason string if ``url`` is blocked; else None.

    Resolves every A/AAAA the host points at and rejects on the first
    match against an internal range. We bias toward conservative — any
    resolution error rejects rather than failing open.
    """
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return f"SSRF: scheme {parsed.scheme!r} not allowed"
    host = parsed.hostname
    if not host:
        return "SSRF: missing host"

    # Reject literal-IP destinations up front (no DNS round-trip needed).
    try:
        literal = ipaddress.ip_address(host)
        if _is_blocked_ip(str(literal)):
            return f"SSRF: blocked address {literal}"
        return None
    except ValueError:
        pass  # not a literal IP — continue to DNS

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        return f"SSRF: DNS resolution failed: {exc}"

    for family, _, _, _, sockaddr in infos:
        if family == socket.AF_INET:
            ip = sockaddr[0]
        elif family == socket.AF_INET6:
            ip = sockaddr[0]
        else:
            continue
        if _is_blocked_ip(ip):
            return f"SSRF: host {host} resolves to blocked IP {ip}"
    return None


# --------------------------------------------------------------------------- #
# Signing                                                                      #
# --------------------------------------------------------------------------- #


def sign_body(secret: bytes, body: bytes) -> str:
    """Return the ``sha256=<hex>`` HMAC header value for ``body``."""
    mac = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return f"sha256={mac}"


# --------------------------------------------------------------------------- #
# Rate-limit                                                                   #
# --------------------------------------------------------------------------- #


def _redis_client():  # pragma: no cover — thin wrapper over the real client
    import redis

    settings = get_settings()
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _rate_key(workspace_id: uuid.UUID) -> str:
    prefix = get_settings().redis_key_prefix
    return f"{prefix}webhook:rl:{workspace_id}"


def check_and_increment_rate_limit(workspace_id: uuid.UUID) -> bool:
    """Return True if the call is allowed; False if it would exceed the cap.

    We use ``INCR`` + ``EXPIRE`` (only on the first hit each window) so
    bursts inside a single hour share the same TTL. Redis being
    unreachable falls open — the dispatcher would rather over-deliver
    once than silently swallow a real alert.
    """
    try:
        client = _redis_client()
        key = _rate_key(workspace_id)
        n = int(client.incr(key))
        if n == 1:
            client.expire(key, RATE_LIMIT_TTL_S)
        return n <= RATE_LIMIT_PER_HOUR
    except Exception as exc:  # noqa: BLE001
        logger.warning("webhook.rate_limit.redis_unavailable err=%s", exc)
        return True


# --------------------------------------------------------------------------- #
# Persistence helpers                                                          #
# --------------------------------------------------------------------------- #


async def _record_delivery(
    session: AsyncSession,
    *,
    webhook: Webhook,
    event: str,
    payload: dict[str, Any],
    attempt: int,
    status: str,
    response_code: int | None = None,
    error_text: str | None = None,
) -> WebhookDelivery:
    row = WebhookDelivery(
        webhook_id=webhook.id,
        event=event,
        payload=payload,
        attempt=attempt,
        status=status,
        response_code=response_code,
        error_text=error_text,
    )
    session.add(row)
    webhook.last_status = status
    webhook.last_delivery_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return row


async def list_subscribed(
    session: AsyncSession, workspace_id: uuid.UUID, event: str
) -> list[Webhook]:
    """Return active webhooks in ``workspace_id`` that subscribe to ``event``."""
    rows = (
        await session.execute(
            select(Webhook).where(
                Webhook.workspace_id == workspace_id,
                Webhook.is_active.is_(True),
            )
        )
    ).scalars().all()
    return [w for w in rows if event in (w.events or [])]


# --------------------------------------------------------------------------- #
# Send                                                                         #
# --------------------------------------------------------------------------- #


async def send(
    webhook: Webhook,
    event: str,
    payload: dict[str, Any],
    *,
    attempt: int = 1,
    session: AsyncSession | None = None,
) -> WebhookDelivery:
    """POST ``payload`` to ``webhook.url``. Returns the delivery audit row.

    Schedules a Celery retry on transient failure. ``session`` is optional
    — when omitted we open our own session (the common case for fan-out
    from celery tasks); pass an existing session when calling from a
    route handler to keep the work in the request's transaction.
    """
    owns_session = session is None
    if owns_session:
        session = SessionLocal()
    assert session is not None

    try:
        # Re-load the webhook to make sure we have a fresh row (esp. for the
        # last_status / last_delivery_at updates we're about to write).
        wh = await session.get(Webhook, webhook.id) or webhook

        # 1) Rate-limit gate.
        if not check_and_increment_rate_limit(wh.workspace_id):
            return await _record_delivery(
                session,
                webhook=wh,
                event=event,
                payload=payload,
                attempt=attempt,
                status="rate_limited",
                error_text="workspace exceeded 1000 deliveries/hour",
            )

        # 2) SSRF gate.
        ssrf_reason = _ssrf_check(wh.url)
        if ssrf_reason:
            return await _record_delivery(
                session,
                webhook=wh,
                event=event,
                payload=payload,
                attempt=attempt,
                status="ssrf_blocked",
                error_text=ssrf_reason,
            )

        # 3) Build body. Slack incoming-webhook URLs get a Block Kit body so
        # the message renders as a card in-channel; all other destinations
        # keep the canonical ``{event, payload}`` envelope. Both paths are
        # signed identically below — Slack ignores the signature header,
        # but it costs us nothing and proves origin for non-Slack relays.
        if slack_formatter.is_slack_url(wh.url):
            body_dict: dict[str, Any] = slack_formatter.format(event, payload)
        else:
            body_dict = {"event": event, "payload": payload}
        body_bytes = json.dumps(body_dict, separators=(",", ":"), sort_keys=True).encode(
            "utf-8"
        )
        try:
            secret = get_fernet_service().decrypt(wh.secret_encrypted)
        except Exception as exc:  # noqa: BLE001
            return await _record_delivery(
                session,
                webhook=wh,
                event=event,
                payload=payload,
                attempt=attempt,
                status="failed",
                error_text=f"secret decryption failed: {exc}",
            )

        signature = sign_body(secret, body_bytes)
        secret = b"REDACTED"  # noqa: F841 — drop plaintext ASAP
        del secret

        headers = {
            "Content-Type": "application/json",
            SIGNATURE_HEADER: signature,
            EVENT_HEADER: event,
            DELIVERY_HEADER: str(uuid.uuid4()),
            "User-Agent": "WarmPulse-Webhook/1.0",
        }

        timeout = httpx.Timeout(READ_TIMEOUT_S, connect=CONNECT_TIMEOUT_S)
        response_code: int | None = None
        error_text: str | None = None
        try:
            async with httpx.AsyncClient(timeout=timeout) as http:
                resp = await http.post(wh.url, content=body_bytes, headers=headers)
                response_code = resp.status_code
        except httpx.TimeoutException as exc:
            error_text = f"timeout: {exc.__class__.__name__}"
        except httpx.HTTPError as exc:
            error_text = f"http error: {exc}"
        except Exception as exc:  # noqa: BLE001
            error_text = f"unexpected error: {exc}"

        # 4) Classify + write audit row.
        success = response_code is not None and 200 <= response_code < 300
        if success:
            return await _record_delivery(
                session,
                webhook=wh,
                event=event,
                payload=payload,
                attempt=attempt,
                status="ok",
                response_code=response_code,
            )

        if attempt >= MAX_ATTEMPTS:
            return await _record_delivery(
                session,
                webhook=wh,
                event=event,
                payload=payload,
                attempt=attempt,
                status="dead_letter",
                response_code=response_code,
                error_text=error_text or f"HTTP {response_code} after {attempt} attempts",
            )

        # Otherwise schedule a retry.
        row = await _record_delivery(
            session,
            webhook=wh,
            event=event,
            payload=payload,
            attempt=attempt,
            status="failed",
            response_code=response_code,
            error_text=error_text or f"HTTP {response_code}",
        )
        _schedule_retry(
            webhook_id=wh.id,
            event=event,
            payload=payload,
            next_attempt=attempt + 1,
        )
        return row
    finally:
        if owns_session:
            await session.close()


def _schedule_retry(
    *,
    webhook_id: uuid.UUID,
    event: str,
    payload: dict[str, Any],
    next_attempt: int,
) -> None:
    """Dispatch a Celery retry task with the appropriate countdown.

    ``next_attempt`` is 1-indexed (2 = first retry). Delays array is
    0-indexed off attempt-2 so attempt 2 → 60s, 3 → 300s, 4 → 1800s.
    """
    try:
        from app.tasks.webhook_retry import retry_delivery
    except Exception:  # pragma: no cover — celery not importable in some tests
        logger.exception("webhook_retry import failed")
        return

    idx = max(0, min(len(RETRY_DELAYS_S) - 1, next_attempt - 2))
    countdown = RETRY_DELAYS_S[idx]
    try:
        retry_delivery.apply_async(
            kwargs={
                "webhook_id": str(webhook_id),
                "event": event,
                "payload": payload,
                "attempt": next_attempt,
            },
            countdown=countdown,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("webhook.retry.schedule_failed err=%s", exc)
