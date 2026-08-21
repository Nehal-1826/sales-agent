"""Client-mailbox engagement loop — act on warmup mail inside the client's own
connected Gmail mailbox via the Gmail REST API.

Symmetric counterpart to ``tasks.warmup_receive`` (which engages on *peer*
inboxes over IMAP). Here, for every active mailbox connected through Google
OAuth, we:

1. mint a short-lived access token from the stored refresh token,
2. ensure the "WarmPulse" label exists (``gmail.labels``),
3. find recent warmup mail the peer network sent to this mailbox,
4. rescue it from Spam, mark it read, sometimes star it, and tag it with the
   WarmPulse label (``gmail.modify``),
5. write inbound ``WarmupLog`` rows + bump the real-time daily counters.

Pipeline (beat → fan-out → per-mailbox):
``schedule_client_engagement_cycle`` enqueues one ``engage_client_gmail_mailbox``
per eligible mailbox so a single slow mailbox can't stall the cycle.

A mailbox connected before the engagement scopes were granted (send-only) will
raise :class:`GmailScopeError` on the first modify call; we catch it, log a
"needs reconnect" line, and move on rather than retrying forever.
"""
from __future__ import annotations

import asyncio
import logging
import random
import uuid
from email.utils import parseaddr

from sqlalchemy import select

from app.celery_app import celery_app
from app.config import get_settings
from app.db.models.mailboxes import Mailbox, MailboxProvider
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.session import SessionLocal
from app.services.crypto import get_fernet_service
from app.services.warmup import gmail_engagement
from app.services.warmup.gmail_engagement import GmailScopeError
from app.services.warmup.metrics_upsert import bump_daily_counter
from app.services.warmup.oauth_token import google_access_token

logger = logging.getLogger(__name__)

# Probability a freshly-engaged message also gets starred — a strong positive
# signal, but starring *everything* looks robotic, so keep it a minority.
_STAR_PROBABILITY = 0.25

# Cap messages processed per mailbox per cycle to bound Gmail API calls.
_MAX_PER_CYCLE = 25


# --------------------------------------------------------------------------- #
# Beat fan-out                                                                #
# --------------------------------------------------------------------------- #


async def _eligible_mailbox_ids() -> list[str]:
    """OAuth-connected Gmail mailboxes that aren't paused."""
    async with SessionLocal() as db:
        rows = (
            await db.scalars(
                select(Mailbox.id).where(
                    Mailbox.provider == MailboxProvider.gmail,
                    Mailbox.oauth_token_encrypted.is_not(None),
                    Mailbox.is_paused.is_(False),
                )
            )
        ).all()
    return [str(r) for r in rows]


async def _schedule_impl() -> dict:
    ids = await _eligible_mailbox_ids()
    for mid in ids:
        engage_client_gmail_mailbox.delay(mid)
    return {"enqueued": len(ids)}


@celery_app.task(
    name="app.tasks.client_engagement.schedule_client_engagement_cycle",
    queue="default",
)
def schedule_client_engagement_cycle() -> dict:
    """Beat-triggered: fan out one engagement task per OAuth Gmail mailbox."""
    return asyncio.run(_schedule_impl())


# --------------------------------------------------------------------------- #
# Per-mailbox engagement                                                      #
# --------------------------------------------------------------------------- #


async def _peer_sender_map() -> dict[str, uuid.UUID]:
    """Map every active peer's email address (lowercased) → peer id."""
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(PeerInbox.email_address, PeerInbox.id).where(
                    PeerInbox.is_active.is_(True)
                )
            )
        ).all()
    return {addr.lower(): pid for addr, pid in rows}


async def _record(
    mailbox_id: uuid.UUID,
    peer_id: uuid.UUID,
    action: WarmupAction,
    message_id: str,
) -> None:
    """Write one inbound WarmupLog row + bump the real-time daily counter."""
    async with SessionLocal() as db:
        db.add(
            WarmupLog(
                mailbox_id=mailbox_id,
                peer_inbox_id=peer_id,
                direction=WarmupDirection.inbound,
                action=action,
                message_id=message_id,
            )
        )
        await bump_daily_counter(db, mailbox_id=mailbox_id, action=action)
        await db.commit()


def _plan_actions(label_ids: list[str]) -> tuple[list[str], list[str], WarmupAction]:
    """Decide label add/remove sets + the primary WarmupLog action.

    Returns ``(add, remove, primary_action)``. Always marks read; rescues from
    Spam when present; the primary action reflects the highest-value signal.
    """
    add: list[str] = [gmail_engagement.WARMUP_LABEL_NAME]  # placeholder; replaced with id by caller
    remove: list[str] = []
    if gmail_engagement._UNREAD in label_ids:
        remove.append(gmail_engagement._UNREAD)
    if gmail_engagement._SPAM in label_ids:
        remove.append(gmail_engagement._SPAM)
        add.append(gmail_engagement._INBOX)
        primary = WarmupAction.spam_rescued
    else:
        primary = WarmupAction.opened
    return add, remove, primary


async def _engage_impl(mailbox_id: str) -> dict:
    fernet = get_fernet_service()
    settings = get_settings()

    async with SessionLocal() as db:
        mailbox = await db.get(Mailbox, uuid.UUID(mailbox_id))
        if mailbox is None:
            return {"status": "mailbox_not_found"}
        # Pause gate. The beat fan-out filters paused rows at enqueue time,
        # but a task already sitting on the smtp queue (or in its retry
        # ladder) must re-check here or engagement actions keep landing on a
        # mailbox the user has since paused. Mirrors the scheduler's own
        # eligibility filter (`_eligible_mailbox_ids`).
        if mailbox.is_paused:
            return {"status": "skipped_paused"}
        if mailbox.provider != MailboxProvider.gmail or not mailbox.oauth_token_encrypted:
            return {"status": "not_oauth_gmail"}
        refresh_token = fernet.decrypt(mailbox.oauth_token_encrypted).decode()

    access_token = ""
    try:
        access_token = await google_access_token(refresh_token, settings=settings)
    finally:
        refresh_token = "REDACTED"  # noqa: F841 — defensive overwrite
        del refresh_token

    senders = await _peer_sender_map()

    try:
        label_id = await gmail_engagement.ensure_warmup_label(access_token)
        msg_ids = await gmail_engagement.list_warmup_message_ids(
            access_token, list(senders.keys()), max_results=_MAX_PER_CYCLE
        )

        actions: dict[str, int] = {}
        for msg_id in msg_ids:
            meta = await gmail_engagement.get_message_meta(access_token, msg_id)
            if gmail_engagement._TRASH in meta["label_ids"]:
                continue  # never resurrect trashed mail
            sender = parseaddr(meta["from"])[1].lower()
            peer_id = senders.get(sender)
            if peer_id is None:
                continue  # not from a known peer — leave it alone

            add, remove, primary = _plan_actions(meta["label_ids"])
            # Swap the label-name placeholder for the resolved label id.
            add = [label_id if a == gmail_engagement.WARMUP_LABEL_NAME else a for a in add]
            do_star = random.random() < _STAR_PROBABILITY
            if do_star and gmail_engagement._STARRED not in meta["label_ids"]:
                add.append(gmail_engagement._STARRED)

            await gmail_engagement.modify_message(
                access_token, msg_id, add=add, remove=remove
            )
            await _record(uuid.UUID(mailbox_id), peer_id, primary, msg_id)
            actions[primary.value] = actions.get(primary.value, 0) + 1
            if do_star:
                await _record(uuid.UUID(mailbox_id), peer_id, WarmupAction.starred, msg_id)
                actions["starred"] = actions.get("starred", 0) + 1
    except GmailScopeError as exc:
        logger.warning(
            "client_engagement: mailbox=%s needs reconnect (insufficient Gmail "
            "scope): %s",
            mailbox_id,
            exc,
        )
        return {"status": "needs_reconnect"}
    finally:
        access_token = "REDACTED"  # noqa: F841 — defensive overwrite
        del access_token

    return {"status": "ok", "mailbox_id": mailbox_id, "actions": actions}


@celery_app.task(
    name="app.tasks.client_engagement.engage_client_gmail_mailbox",
    queue="smtp",
    bind=True,
    max_retries=2,
)
def engage_client_gmail_mailbox(self, mailbox_id: str) -> dict:
    """Engage on one client's connected Gmail mailbox via the Gmail API."""
    try:
        return asyncio.run(_engage_impl(mailbox_id))
    except GmailScopeError:
        # Terminal (bad grant) — already handled inside _engage_impl, but guard
        # here too so a scope error never triggers a retry storm.
        return {"status": "needs_reconnect"}
    except Exception as exc:  # noqa: BLE001
        logger.warning("engage_client_gmail_mailbox failed mailbox=%s: %s", mailbox_id, exc)
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1)) from exc
