"""Slack Block Kit formatter for webhook payloads.

When a webhook destination is a Slack incoming-webhook URL we reformat the
``{event, payload}`` envelope as a Block Kit message so it renders as a
card instead of raw JSON. Pure functions only — no I/O, no DB.

The dispatcher detects Slack URLs via :func:`is_slack_url` and routes the
payload through :func:`format`. Unknown event types fall through to the
:func:`_generic` handler so we never raise on an unrecognised event.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable

logger = logging.getLogger(__name__)

# Real Slack incoming-webhook URLs look like:
#   https://hooks.slack.com/services/T01ABC234/B05XYZ678/abcDEF123ghiJKL
# T = team ID, B = bot/integration ID, then an opaque token.
SLACK_HOOK_RE = re.compile(
    r"^https://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+$"
)

_DEFAULT_APP_BASE_URL = "https://app.warmpulse.io"


def is_slack_url(url: str) -> bool:
    """Return True if ``url`` is a Slack incoming-webhook URL."""
    if not isinstance(url, str):
        return False
    return bool(SLACK_HOOK_RE.match(url))


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


def _app_base_url() -> str:
    """Read ``settings.app_base_url``, falling back to the prod default.

    The local dev default is ``http://localhost:8001`` which is useless in
    a Slack channel — so any non-https value falls back to the public host.
    """
    try:
        from app.config import get_settings

        url = get_settings().public_base_url
        if url.startswith("https://"):
            return url
    except Exception:  # noqa: BLE001 — never crash a webhook for config issues
        logger.debug("slack_formatter: settings unavailable; using default base url")
    return _DEFAULT_APP_BASE_URL


def _header(emoji: str, text: str) -> dict[str, Any]:
    return {
        "type": "header",
        "text": {"type": "plain_text", "text": f"{emoji} {text}", "emoji": True},
    }


def _section_fields(*pairs: tuple[str, str]) -> dict[str, Any]:
    return {
        "type": "section",
        "fields": [
            {"type": "mrkdwn", "text": f"*{label}*\n{value}"} for label, value in pairs
        ],
    }


def _context(text: str) -> dict[str, Any]:
    return {
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": text}],
    }


def _link_context(label: str, path: str) -> dict[str, Any]:
    base = _app_base_url()
    if path.startswith("http://") or path.startswith("https://"):
        href = path
    else:
        if not path.startswith("/"):
            path = "/" + path
        href = f"{base}{path}"
    return _context(f"WarmPulse · <{href}|{label}>")


def _g(p: dict[str, Any], key: str, default: str = "—") -> str:
    val = p.get(key)
    if val is None or val == "":
        return default
    return str(val)


# --------------------------------------------------------------------------- #
# Per-event handlers                                                           #
# --------------------------------------------------------------------------- #


def _mailbox_paused(p: dict[str, Any]) -> dict[str, Any]:
    email = _g(p, "mailbox_email")
    reason = _g(p, "reason")
    mailbox_id = _g(p, "mailbox_id", "")
    return {
        "text": f"Mailbox paused — {email}",
        "blocks": [
            _header("⚠️", "Mailbox paused"),
            _section_fields(("Mailbox", email), ("Reason", reason)),
            _link_context("View mailbox", f"/app/mailboxes/{mailbox_id}"),
        ],
    }


def _bounce_spike(p: dict[str, Any]) -> dict[str, Any]:
    email = _g(p, "mailbox_email")
    rate = _g(p, "bounce_rate")
    threshold = _g(p, "threshold")
    return {
        "text": f"Bounce-rate spike — {email}",
        "blocks": [
            _header("🔴", "Bounce-rate spike"),
            _section_fields(
                ("Mailbox", email),
                ("Bounce rate", f"{rate}"),
                ("Threshold", f"{threshold}"),
            ),
            _link_context("View reputation", "/app/reputation"),
        ],
    }


def _peer_failed(p: dict[str, Any]) -> dict[str, Any]:
    peer = _g(p, "peer_email")
    score = _g(p, "reputation_score")
    return {
        "text": f"Peer inbox failing — {peer}",
        "blocks": [
            _header("⚠️", "Peer inbox failing"),
            _section_fields(
                ("Peer", peer),
                ("Reputation score", str(score)),
            ),
            _link_context("View reputation", "/app/reputation"),
        ],
    }


def _placement_bar(results: dict[str, Any]) -> str:
    """Build a 30-emoji stacked bar from a placement results dict.

    inbox → 🟢, promotions → 🟡, spam+other+timeout → 🔴
    """
    try:
        inbox = int(results.get("inbox", 0) or 0)
        promotions = int(results.get("promotions", 0) or 0)
        spam = int(results.get("spam", 0) or 0)
        other = int(results.get("other", 0) or 0)
        timeout = int(results.get("timeout", 0) or 0)
    except (TypeError, ValueError):
        return ""
    red = spam + other + timeout
    total = inbox + promotions + red
    if total <= 0:
        return ""
    target = 30
    # Proportional scale to ~30 emoji; round and clamp.
    g_count = round(inbox / total * target)
    y_count = round(promotions / total * target)
    r_count = max(0, target - g_count - y_count)
    return ("🟢" * g_count) + ("🟡" * y_count) + ("🔴" * r_count)


def _placement_test_completed(p: dict[str, Any]) -> dict[str, Any]:
    email = _g(p, "mailbox_email")
    results = p.get("results") or {}
    inbox = results.get("inbox", "—")
    promo = results.get("promotions", "—")
    spam = results.get("spam", "—")
    bar = _placement_bar(results) if isinstance(results, dict) else ""
    blocks: list[dict[str, Any]] = [
        _header("✅", "Placement test complete"),
        _section_fields(
            ("Mailbox", email),
            ("Inbox", str(inbox)),
            ("Promotions", str(promo)),
            ("Spam", str(spam)),
        ),
    ]
    if bar:
        blocks.append(
            {"type": "section", "text": {"type": "mrkdwn", "text": bar}}
        )
    blocks.append(_link_context("View placement", "/app/tools/placement"))
    return {
        "text": f"Placement test complete — {email}",
        "blocks": blocks,
    }


def _spam_rate_spike(p: dict[str, Any]) -> dict[str, Any]:
    email = _g(p, "mailbox_email")
    rate = _g(p, "spam_rate")
    return {
        "text": f"Spam-rate spike — {email}",
        "blocks": [
            _header("🔴", "Spam-rate spike (Postmaster)"),
            _section_fields(("Mailbox", email), ("Spam rate", str(rate))),
            _link_context("View reputation", "/app/reputation"),
        ],
    }


def _complaint_rate_spike(p: dict[str, Any]) -> dict[str, Any]:
    email = _g(p, "mailbox_email")
    rate = _g(p, "complaint_rate")
    return {
        "text": f"Complaint-rate spike — {email}",
        "blocks": [
            _header("🔴", "Complaint-rate spike (SNDS)"),
            _section_fields(("Mailbox", email), ("Complaint rate", str(rate))),
            _link_context("View reputation", "/app/reputation"),
        ],
    }


def _weekly_digest(p: dict[str, Any]) -> dict[str, Any]:
    sent = _g(p, "emails_sent")
    inbox_rate = _g(p, "inbox_placement_rate")
    warmth = _g(p, "warmth_score")
    return {
        "text": "Weekly warmth digest",
        "blocks": [
            _header("📊", "Weekly warmth digest"),
            _section_fields(
                ("Emails sent", str(sent)),
                ("Inbox placement", str(inbox_rate)),
                ("Warmth score", str(warmth)),
            ),
            _link_context("Open dashboard", "/app/dashboard"),
        ],
    }


def _invoice_paid(p: dict[str, Any]) -> dict[str, Any]:
    amount = _g(p, "amount")
    invoice = _g(p, "invoice_number")
    return {
        "text": f"Invoice paid — {invoice}",
        "blocks": [
            _header("✅", "Invoice paid"),
            _section_fields(("Invoice", invoice), ("Amount", str(amount))),
            _link_context("View billing", "/app/billing"),
        ],
    }


def _invoice_failed(p: dict[str, Any]) -> dict[str, Any]:
    invoice = _g(p, "invoice_number")
    reason = _g(p, "reason")
    return {
        "text": f"Payment failed — {invoice}",
        "blocks": [
            _header("🔴", "Payment failed"),
            _section_fields(("Invoice", invoice), ("Reason", reason)),
            _link_context("Update billing", "/app/billing"),
        ],
    }


def _member_invited(p: dict[str, Any]) -> dict[str, Any]:
    email = _g(p, "member_email")
    role = _g(p, "role")
    return {
        "text": f"Member joined — {email}",
        "blocks": [
            _header("✨", "Member joined"),
            _section_fields(("Member", email), ("Role", role)),
            _link_context("View workspace", "/app/workspace"),
        ],
    }


def _product_updates(p: dict[str, Any]) -> dict[str, Any]:
    title = _g(p, "title", "What's new")
    summary = _g(p, "summary", "")
    url = p.get("url") or "https://warmpulse.io/changelog"
    blocks: list[dict[str, Any]] = [_header("✨", "WarmPulse update")]
    if summary:
        blocks.append(
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*{title}*\n{summary}"}}
        )
    else:
        blocks.append(_section_fields(("Update", title)))
    blocks.append(_link_context("Read more", url))
    return {
        "text": f"WarmPulse update — {title}",
        "blocks": blocks,
    }


def _generic(event: str, p: dict[str, Any]) -> dict[str, Any]:
    """Fallback for unknown events — header + dump first few fields."""
    display = event.replace("_", " ").strip() or "event"
    # Show up to 4 top-level scalar fields as a section block.
    pairs: list[tuple[str, str]] = []
    for k, v in (p or {}).items():
        if len(pairs) >= 4:
            break
        if isinstance(v, (str, int, float, bool)):
            pairs.append((str(k), str(v)))
    blocks: list[dict[str, Any]] = [_header("🔔", display)]
    if pairs:
        blocks.append(_section_fields(*pairs))
    blocks.append(_link_context("Open dashboard", "/app/dashboard"))
    return {
        "text": display,
        "blocks": blocks,
    }


HANDLERS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "mailbox_paused": _mailbox_paused,
    "bounce_spike": _bounce_spike,
    "peer_failed": _peer_failed,
    "placement_test_completed": _placement_test_completed,
    "spam_rate_spike": _spam_rate_spike,
    "complaint_rate_spike": _complaint_rate_spike,
    "weekly_digest": _weekly_digest,
    "invoice_paid": _invoice_paid,
    "invoice_failed": _invoice_failed,
    "member_invited": _member_invited,
    "product_updates": _product_updates,
}


def format(event: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Return the Slack Block Kit body for ``event``.

    Unknown events fall back to a generic 🔔 envelope so the dispatcher
    never raises on a payload it has no specific handler for.
    """
    payload = payload or {}
    handler = HANDLERS.get(event)
    if handler is None:
        return _generic(event, payload)
    try:
        return handler(payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "slack_formatter.handler_failed event=%s err=%s", event, exc
        )
        return _generic(event, payload)
