"""Outbound notification dispatch — Slack webhooks, generic webhooks, email.

Best-effort: any failure is logged and swallowed so a hung Slack endpoint
can't take down the alert pipeline. Returns ``True`` when delivery was
attempted successfully, ``False`` otherwise (callers may use that signal
to decide whether to suppress duplicate alerts on retry).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

import httpx

from app.db.models.notification_settings import NotificationChannel, NotificationSetting
from app.db.session import SessionLocal  # re-exported for monkey-patching in tests

logger = logging.getLogger(__name__)

# ─── Event constants ────────────────────────────────────────────────────
# String keys for events that flow through both the in-app notification
# fanout and the outbound webhook dispatcher. Add new constants here so
# routes / tasks reference one canonical spelling.
SPAM_RATE_SPIKE = "spam_rate_spike"
COMPLAINT_RATE_SPIKE = "complaint_rate_spike"
PLACEMENT_TEST_COMPLETED = "placement_test_completed"


async def fire(event: str, payload: dict[str, Any]) -> None:
    """Best-effort top-level event emitter — fans out to workspace webhooks.

    Used by ingest tasks and other system-level emitters that don't have a
    user-context. ``payload`` should include ``workspace_id`` when the
    event is workspace-scoped so the dispatcher can route to the right
    subscribers.
    """
    ws = payload.get("workspace_id")
    if ws is None:
        logger.info("dispatch.fire.no_workspace event=%s payload_keys=%s",
                    event, list(payload.keys()))
        return
    try:
        await fanout_workspace_webhooks(ws, event, payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning("dispatch.fire.failed event=%s err=%s", event, exc)


async def dispatch(setting: NotificationSetting, payload: dict[str, Any]) -> bool:
    """Send ``payload`` to the channel's target. Best-effort; never raises.

    Slack and webhook channels POST JSON. The email channel is stubbed —
    we log and audit but don't actually send mail until the platform's
    transactional sender is wired up. The notification_settings row's
    ``target`` is the destination URL (Slack/webhook) or address (email).
    """
    channel = setting.channel
    target = setting.target

    try:
        if channel in (NotificationChannel.slack, NotificationChannel.webhook):
            # SSRF guard: `target` is a user-supplied URL fired server-side by
            # the alert beat job. Reject non-http(s) schemes and hosts that
            # resolve to loopback / private / link-local ranges (which, under
            # network_mode: host, would reach Postgres/Redis and metadata).
            # Reuse the same check the webhook_dispatcher enforces.
            from app.services.webhook_dispatcher import _ssrf_check

            ssrf_err = _ssrf_check(target)
            if ssrf_err:
                logger.warning("dispatch.blocked channel=%s reason=%s", channel, ssrf_err)
                return False

        if channel == NotificationChannel.slack:
            text = payload.get("text") or _payload_to_text(payload)
            async with httpx.AsyncClient(timeout=8.0) as http:
                resp = await http.post(target, json={"text": text})
                resp.raise_for_status()
            return True

        if channel == NotificationChannel.webhook:
            async with httpx.AsyncClient(timeout=8.0) as http:
                resp = await http.post(target, json=payload)
                resp.raise_for_status()
            return True

        if channel == NotificationChannel.email:
            # Platform "design" mail goes through the shared transactional sender
            # (admin-panel SMTP settings → TRANSACTIONAL_SMTP_* fallback → dry-run),
            # the same path as welcome / 2FA / billing emails. Never the warmup
            # peer network — system mail is platform-originated.
            from app.services import transactional_mail

            title = payload.get("title") or payload.get("event") or "WarmPulse alert"
            summary = payload.get("body") or _payload_to_text(payload)
            details = {
                k: str(v)
                for k, v in payload.items()
                if k not in {"title", "body", "event", "text"} and v is not None
            }
            result = await transactional_mail.send_action_notice(
                to=target, action=str(title), summary=str(summary), details=details or None
            )
            return result.get("status") in {"sent", "dry_run"}

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "notification.dispatch.failed channel=%s target=%s err=%s",
            channel, target, exc,
        )
        return False

    return False


def _payload_to_text(payload: dict[str, Any]) -> str:
    title = payload.get("title") or payload.get("event") or "WarmPulse alert"
    body = payload.get("body") or ""
    return f"*{title}*\n{body}".strip()


async def fanout(
    settings: list[NotificationSetting],
    payload: dict[str, Any],
    *,
    event_type: str,
) -> int:
    """Dispatch to every setting that subscribes to ``event_type``.

    Returns the number of channels delivered to. A setting with an empty
    ``event_types`` list subscribes to all events (caller convenience).
    """
    delivered = 0
    for s in settings:
        types = list(s.event_types or [])
        if types and event_type not in types:
            continue
        ok = await dispatch(s, payload)
        if ok:
            delivered += 1
    return delivered


async def fanout_workspace_webhooks(
    workspace_id: uuid.UUID | str,
    event: str,
    payload: dict[str, Any],
) -> int:
    """Fire-and-forget fan-out to every active webhook in ``workspace_id``
    that subscribes to ``event``. Returns the number of deliveries
    attempted. Failures inside an individual ``send`` are recorded as
    WebhookDelivery rows by the dispatcher itself and never bubble up.

    This is additive to the existing in-app + email notification path —
    the caller is expected to keep firing its normal notifications and
    use this purely as a side-channel.
    """
    # Local imports for the webhook dispatcher to avoid a circular at
    # module-init time. ``SessionLocal`` is imported at module top so tests
    # can monkey-patch it via patch("app.services.notifications_dispatch.SessionLocal").
    from sqlalchemy import select

    from app.db.models.webhooks import Webhook
    from app.services.webhook_dispatcher import send as webhook_send

    session_factory = SessionLocal

    try:
        ws_id = (
            workspace_id if isinstance(workspace_id, uuid.UUID) else uuid.UUID(str(workspace_id))
        )
    except (TypeError, ValueError):
        logger.warning("webhook.fanout.bad_workspace_id ws=%r", workspace_id)
        return 0

    count = 0
    try:
        async with session_factory() as session:
            rows = (
                await session.execute(
                    select(Webhook).where(
                        Webhook.workspace_id == ws_id,
                        Webhook.is_active.is_(True),
                    )
                )
            ).scalars().all()
            for w in rows:
                if event not in (w.events or []):
                    continue
                count += 1
                # Schedule each send as an awaited task so a slow endpoint
                # doesn't block the next one, but don't await long-tail
                # retries inline.
                try:
                    await webhook_send(w, event, payload, attempt=1, session=session)
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "webhook.fanout.send_failed wh=%s event=%s err=%s",
                        w.id, event, exc,
                    )
    except Exception as exc:  # noqa: BLE001
        logger.warning("webhook.fanout.failed ws=%s event=%s err=%s", ws_id, event, exc)

    return count


def fire_and_forget_webhooks(
    workspace_id: uuid.UUID | str,
    event: str,
    payload: dict[str, Any],
) -> None:
    """Sync helper: schedule webhook fanout without awaiting. Useful from
    sync contexts (e.g. Celery task bodies) where the caller doesn't want
    to block on the HTTP round-trip.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(fanout_workspace_webhooks(workspace_id, event, payload))
        else:
            loop.run_until_complete(fanout_workspace_webhooks(workspace_id, event, payload))
    except RuntimeError:
        # No running loop — spin one up just for this dispatch.
        asyncio.run(fanout_workspace_webhooks(workspace_id, event, payload))
    except Exception as exc:  # noqa: BLE001
        logger.warning("webhook.fire_and_forget.failed err=%s", exc)
