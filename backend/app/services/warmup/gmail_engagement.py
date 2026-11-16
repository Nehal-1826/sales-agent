"""Client-mailbox engagement via the Gmail REST API.

The peer-inbox network engages (opens / stars / rescues) warmup mail on its
*own* IMAP inboxes — see ``imap_watcher`` / ``tasks.peer_actions``. This module
is the symmetric counterpart for the **client's own connected Gmail mailbox**:
when a peer sends warmup mail to a client whose mailbox is connected via Google
OAuth, we act on that mail inside the client's mailbox to generate positive
engagement signal on their account:

* **rescue** warmup mail Google filed as Spam back into the Inbox,
* **mark it read** and (sometimes) **star** it, and
* **tag it with a "WarmPulse" label** so the client can see warmup activity.

Scopes used (granted by the mailbox-connect OAuth flow):

* ``gmail.modify`` — ``users.messages.modify`` to add/remove label ids
  (INBOX / SPAM / UNREAD / STARRED and our own WarmPulse label).
* ``gmail.labels`` — ``users.labels.list`` / ``users.labels.create`` to ensure
  the "WarmPulse" user label exists.

We never read message *bodies* — only the metadata headers needed to identify
the sender, and the ``labelIds`` needed to decide the action. All access tokens
are short-lived and are never logged or embedded in exception strings.
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

# The user-visible label WarmPulse applies to warmup mail in the client's inbox.
WARMUP_LABEL_NAME = "WarmPulse"

# System label ids used by the modify calls (these are Gmail's built-ins).
_SPAM = "SPAM"
_INBOX = "INBOX"
_UNREAD = "UNREAD"
_STARRED = "STARRED"
_TRASH = "TRASH"


class GmailScopeError(RuntimeError):
    """Raised when the Gmail API rejects a modify/label call with 403.

    Signals that the mailbox's refresh token was granted only ``gmail.send``
    (e.g. connected before engagement scopes were added) — the caller should
    surface a "reconnect mailbox" hint rather than treat this as a transient
    failure.
    """


async def _get(access_token: str, path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.get(
            f"{_GMAIL_BASE}{path}",
            headers={"Authorization": f"Bearer {access_token}"},
            params=params or {},
        )
    return _handle(resp)


async def _post(access_token: str, path: str, json: dict) -> dict:
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.post(
            f"{_GMAIL_BASE}{path}",
            headers={"Authorization": f"Bearer {access_token}"},
            json=json,
        )
    return _handle(resp)


def _handle(resp) -> dict:
    """Return the JSON body on 2xx; raise (without the token) otherwise."""
    if 200 <= resp.status_code < 300:
        try:
            return resp.json()
        except Exception:
            return {}
    try:
        err = resp.json().get("error", {})
    except Exception:
        err = {}
    message = err.get("message", "")
    if resp.status_code in (401, 403):
        # Insufficient scope / revoked grant — distinct from a transient error
        # so the task can tell the user to reconnect rather than retrying.
        raise GmailScopeError(
            f"Gmail API {resp.status_code}: {message or 'insufficient authorization'}"
        )
    raise RuntimeError(f"Gmail API {resp.status_code}: {message}")


async def ensure_warmup_label(access_token: str) -> str:
    """Return the id of the "WarmPulse" user label, creating it if missing.

    Uses ``users.labels`` (the ``gmail.labels`` scope).
    """
    data = await _get(access_token, "/labels")
    for label in data.get("labels", []):
        if label.get("name") == WARMUP_LABEL_NAME:
            return label["id"]
    created = await _post(
        access_token,
        "/labels",
        {
            "name": WARMUP_LABEL_NAME,
            "labelListVisibility": "labelShow",
            "messageListVisibility": "show",
        },
    )
    return created["id"]


def _build_query(sender_addresses: list[str], *, newer_than_days: int) -> str:
    """Gmail search query matching recent warmup mail from the peer network.

    ``in:anywhere`` widens the search to include Spam (a normal search excludes
    it). ``-label:WarmPulse`` skips messages we already engaged with so each
    cycle only touches fresh mail.
    """
    froms = " OR ".join(f"from:{addr}" for addr in sender_addresses)
    return (
        f"newer_than:{newer_than_days}d in:anywhere "
        f"-label:{WARMUP_LABEL_NAME} ({froms})"
    )


async def list_warmup_message_ids(
    access_token: str,
    sender_addresses: list[str],
    *,
    newer_than_days: int = 2,
    max_results: int = 25,
) -> list[str]:
    """Return Gmail message ids of recent, not-yet-tagged warmup mail.

    Returns ``[]`` when there are no peer addresses to search for.
    """
    if not sender_addresses:
        return []
    data = await _get(
        access_token,
        "/messages",
        {
            "q": _build_query(sender_addresses, newer_than_days=newer_than_days),
            "maxResults": max_results,
        },
    )
    return [m["id"] for m in data.get("messages", []) if m.get("id")]


async def get_message_meta(access_token: str, message_id: str) -> dict:
    """Fetch just the metadata (label ids + From header) for one message.

    ``format=metadata`` with a ``From`` header filter means Google never sends
    us the message body.
    """
    data = await _get(
        access_token,
        f"/messages/{message_id}",
        {"format": "metadata", "metadataHeaders": "From"},
    )
    headers = data.get("payload", {}).get("headers", [])
    from_hdr = next(
        (h.get("value", "") for h in headers if h.get("name", "").lower() == "from"),
        "",
    )
    return {
        "id": data.get("id", message_id),
        "label_ids": data.get("labelIds", []) or [],
        "from": from_hdr,
    }


async def modify_message(
    access_token: str,
    message_id: str,
    *,
    add: list[str] | None = None,
    remove: list[str] | None = None,
) -> None:
    """Add/remove label ids on a message via ``users.messages.modify``.

    Uses the ``gmail.modify`` scope. A no-op (empty add and remove) is skipped.
    """
    add = add or []
    remove = remove or []
    if not add and not remove:
        return
    await _post(
        access_token,
        f"/messages/{message_id}/modify",
        {"addLabelIds": add, "removeLabelIds": remove},
    )
