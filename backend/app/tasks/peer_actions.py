"""Peer-side auto-actions: open / reply / star / spam-rescue + hourly health check.

These run on the ``smtp`` queue because they touch real IMAP/SMTP; the
``hourly_peer_health_check`` runs on ``default`` since it's pure DB work.

Actions recorded as WarmupLog rows with direction=inbound so they roll up
into the mailbox's engagement metrics correctly.
"""
from __future__ import annotations

import asyncio
import logging
import random
import uuid
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import bindparam, func, select, text
from sqlalchemy.types import Uuid

from app.celery_app import celery_app
from app.config import get_settings
from app.db.models.audit_logs import AuditLog
from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.session import SessionLocal
from app.services.crypto import get_fernet_service
from app.services.warmup import imap_watcher, smtp_sender
from app.services.warmup.metrics_upsert import bump_daily_counter
from app.services.warmup.sabotage import is_mailbox_sabotaged

logger = logging.getLogger(__name__)

# Redis key prefix for the per-peer "IMAP auth is currently broken" circuit
# breaker. When we hit a login failure for a peer's IMAP creds we set this
# key with a 1-hour TTL so subsequent spam-rescue attempts skip the IMAP
# round-trip until the hourly health-check has a chance to surface the
# bad peer. Without this, every queued rescue task hammers the IMAP
# server with the same broken credentials.
_SPAM_RESCUE_AUTHFAIL_KEY = "warmpulse:spam_rescue:authfail:{peer_id}"
_SPAM_RESCUE_AUTHFAIL_TTL = 3600  # 1 hour

# Minimum reputation score a peer needs to stay active in the hourly sweep.
PEER_REPUTATION_MIN = 0.3
# Don't deactivate a peer until we have at least this many delivery
# opportunities in the last 24 h. Without this floor, a brand-new peer that
# has received outbound mail but hasn't had time to register engagement
# (IMAP polling is on a 3-minute cadence; signal accumulates slowly) gets
# its score crushed to 0 and the peer is killed before it ever sees real
# traffic. 10 is enough to be statistically meaningful while still letting
# us cull genuinely bad peers within a single business day.
PEER_HEALTH_MIN_OPPORTUNITIES = 10
# Skip the cull entirely for the peer's first 72 h of life — gives the
# IMAP watcher and content engine multiple cycles to actually generate
# inbound engagement before reputation gets weighed.
PEER_NEW_GRACE_HOURS = 72


async def _record_peer_action(
    peer_id: str,
    mailbox_id: str | None,
    action: WarmupAction,
    message_id: str | None,
) -> None:
    """Log a peer-side action as an inbound WarmupLog row + bump daily counter."""
    if mailbox_id is None:
        # We can only log if we can tie the action back to a mailbox — caller
        # resolves this via the original outbound log when needed.
        return
    async with SessionLocal() as db:
        mailbox_uuid = uuid.UUID(mailbox_id)
        db.add(
            WarmupLog(
                mailbox_id=mailbox_uuid,
                peer_inbox_id=uuid.UUID(peer_id),
                direction=WarmupDirection.inbound,
                action=action,
                message_id=message_id,
            )
        )
        # Real-time daily counter so the dashboard reflects engagement
        # without waiting for the 00:05 UTC rollup beat.
        await bump_daily_counter(db, mailbox_id=mailbox_uuid, action=action)
        await db.commit()


async def _resolve_mailbox_for_message(
    peer_id: uuid.UUID, message_id: str
) -> uuid.UUID | None:
    """Find the mailbox that originally sent ``message_id`` to ``peer_id``."""
    async with SessionLocal() as db:
        stmt = select(WarmupLog.mailbox_id).where(
            WarmupLog.peer_inbox_id == peer_id,
            WarmupLog.message_id == message_id,
            WarmupLog.direction == WarmupDirection.outbound,
        ).limit(1)
        return cast("uuid.UUID | None", await db.scalar(stmt))


async def _mailbox_pause_gate(db, mailbox_id: uuid.UUID | None) -> bool:
    """True when the origin mailbox is paused (either representation).

    Pause gate (mirrors the outbound gate in warmup_send._send_impl): a
    paused mailbox must not receive peer engagement — this catches tasks
    that were queued before the pause landed. ``mailbox_id=None`` (message
    not tied to any outbound log) does not gate.
    """
    if mailbox_id is None:
        return False
    mailbox = await db.get(Mailbox, mailbox_id)
    if mailbox is None:
        return False
    return mailbox.is_paused or mailbox.warmup_status != WarmupStatus.active


async def _peer_open_impl(peer_id: str, message_id: str) -> dict:
    fernet = get_fernet_service()
    async with SessionLocal() as db:
        peer = await db.get(PeerInbox, uuid.UUID(peer_id))
        if peer is None:
            return {"status": "peer_not_found"}
        mailbox_id = await _resolve_mailbox_for_message(uuid.UUID(peer_id), message_id)
        # Pause gate: a paused mailbox must not accumulate engagement.
        if await _mailbox_pause_gate(db, mailbox_id):
            return {"status": "skipped_paused"}
        ok = await imap_watcher.mark_seen(peer, message_id, fernet)
    if ok:
        await _record_peer_action(peer_id, str(mailbox_id) if mailbox_id else None,
                                   WarmupAction.opened, message_id)
    return {"status": "opened" if ok else "not_found"}


@celery_app.task(name="app.tasks.peer_actions.peer_open_email", queue="smtp")
def peer_open_email(peer_id: str, message_id: str) -> dict:
    return asyncio.run(_peer_open_impl(peer_id, message_id))


async def _peer_star_impl(peer_id: str, message_id: str) -> dict:
    fernet = get_fernet_service()
    async with SessionLocal() as db:
        peer = await db.get(PeerInbox, uuid.UUID(peer_id))
        if peer is None:
            return {"status": "peer_not_found"}
        mailbox_id = await _resolve_mailbox_for_message(uuid.UUID(peer_id), message_id)
        # Pause gate: a paused mailbox must not accumulate engagement.
        if await _mailbox_pause_gate(db, mailbox_id):
            return {"status": "skipped_paused"}
        ok = await imap_watcher.mark_flagged(peer, message_id, fernet)
    if ok:
        await _record_peer_action(peer_id, str(mailbox_id) if mailbox_id else None,
                                   WarmupAction.starred, message_id)
    return {"status": "starred" if ok else "not_found"}


@celery_app.task(name="app.tasks.peer_actions.peer_star_email", queue="smtp")
def peer_star_email(peer_id: str, message_id: str) -> dict:
    return asyncio.run(_peer_star_impl(peer_id, message_id))


def _redis_client_or_none():
    """Best-effort Redis client. Returns ``None`` when Redis is unreachable —
    the spam-rescue path must still function (and just lose the circuit
    breaker) if Redis is down."""
    try:
        import redis  # local import keeps cold-start cheap

        settings = get_settings()
        return redis.Redis.from_url(settings.redis_url, decode_responses=True)
    except Exception as exc:  # noqa: BLE001
        logger.debug("redis_client unavailable: %s", exc)
        return None


def _authfail_key(peer_id: str) -> str:
    return _SPAM_RESCUE_AUTHFAIL_KEY.format(peer_id=peer_id)


def _is_auth_failing(peer_id: str) -> bool:
    client = _redis_client_or_none()
    if client is None:
        return False
    try:
        return bool(client.get(_authfail_key(peer_id)))
    except Exception as exc:  # noqa: BLE001
        logger.debug("redis_get failed peer=%s err=%s", peer_id, exc)
        return False


def _mark_auth_failing(peer_id: str) -> None:
    client = _redis_client_or_none()
    if client is None:
        return
    try:
        client.set(_authfail_key(peer_id), "1", ex=_SPAM_RESCUE_AUTHFAIL_TTL)
    except Exception as exc:  # noqa: BLE001
        logger.debug("redis_set failed peer=%s err=%s", peer_id, exc)


def _is_auth_error(exc: BaseException) -> bool:
    """Best-effort classifier for IMAP authentication failures.

    aioimaplib raises ``Abort`` for protocol-level rejects which include
    bad-credentials; we also catch any exception whose class or message
    mentions auth/login so unit tests can simulate auth failures with
    arbitrary exception types.
    """
    name = type(exc).__name__.lower()
    msg = str(exc).lower()
    return (
        "auth" in name
        or "login" in name
        or "auth" in msg
        or "login" in msg
        or "credential" in msg
    )


async def _record_spam_rescue_error(
    peer_id: str,
    message_id: str,
    error_kind: str,
) -> None:
    """Persist an error WarmupLog row for a failed rescue attempt.

    Also bumps ``daily_metrics.bounce_count`` for the mailbox whose message
    we failed to rescue, so the hourly peer-health sweep can pick up
    chronically-broken peers via the bounce signal even though the rescue
    itself is a no-op.

    Failures are encoded in ``subject_snippet`` as ``"error:<kind>"`` since
    the current ``warmup_logs`` schema has no dedicated ``result`` / ``error``
    columns (Wave-5 migration owned by Sub-A/B). This is intentionally
    backwards-compatible: queries that ignore ``subject_snippet`` continue
    to count the row as a spam_rescued event for headline counters.
    """
    mailbox_id = await _resolve_mailbox_for_message(uuid.UUID(peer_id), message_id)
    if mailbox_id is None:
        # Can't tie the failure back to a mailbox — log and return.
        logger.warning(
            "spam_rescue error with no resolvable mailbox peer=%s message_id=%s kind=%s",
            peer_id,
            message_id,
            error_kind,
        )
        return
    async with SessionLocal() as db:
        db.add(
            WarmupLog(
                mailbox_id=mailbox_id,
                peer_inbox_id=uuid.UUID(peer_id),
                direction=WarmupDirection.inbound,
                action=WarmupAction.spam_rescued,
                message_id=message_id,
                subject_snippet=f"error:{error_kind}",
            )
        )
        # Bump the mailbox's daily bounce_count so peer-health & the
        # admin dashboard reflect chronic rescue failures. Same upsert
        # shape as ``bump_daily_counter`` but targeting bounce_count.
        sql = text(
            """
            INSERT INTO daily_metrics
                (mailbox_id, date, emails_sent, emails_received, opens, replies,
                 spam_rescues, bounce_count, inbox_placement_pct, warmth_score)
            VALUES
                (:mailbox_id, CURRENT_DATE,
                 0, 0, 0, 0, 0, 1, 0, 0)
            ON CONFLICT (mailbox_id, date) DO UPDATE SET
                bounce_count = daily_metrics.bounce_count + 1
            """
        ).bindparams(bindparam("mailbox_id", type_=Uuid()))
        await db.execute(sql, {"mailbox_id": mailbox_id})
        await db.commit()


async def _peer_spam_rescue_impl(peer_id: str, message_id: str) -> dict:
    """Spam-rescue wiring (Round 3, D4).

    Flow:
      1. Short-circuit if a recent auth-failure flag is cached in Redis.
      2. Decrypt peer creds and call ``imap_watcher.find_in_spam`` to
         locate the warmup message UID in the right Spam folder.
      3. If found: ``mark_flagged`` + ``move_to_inbox`` and write a
         ``WarmupLog(result=ok)`` row + bump daily spam_rescues.
      4. On failure (auth / not-found / IMAP error): write an error
         ``WarmupLog`` row, bump the peer's bounce counter, and on
         auth errors cache the failed-auth flag for 1 h.
    """
    if _is_auth_failing(peer_id):
        logger.info("spam_rescue skip peer=%s (auth-failing circuit open)", peer_id)
        return {"status": "skipped_auth_circuit"}

    fernet = get_fernet_service()
    async with SessionLocal() as db:
        peer = await db.get(PeerInbox, uuid.UUID(peer_id))
        if peer is None:
            return {"status": "peer_not_found"}

        # Revenge backstop: if this message belongs to a sabotaged mailbox,
        # never rescue it out of Spam — that would undo the re-spam. The
        # dispatch gate (warmup_receive._dispatch_spam_action) normally
        # prevents enqueue; this catches tasks queued before the flag was set.
        rescue_mailbox_id = await _resolve_mailbox_for_message(
            uuid.UUID(peer_id), message_id
        )
        # Pause gate: a paused mailbox must not be rescued out of Spam —
        # engagement on its warmup mail stops when the user pauses.
        if await _mailbox_pause_gate(db, rescue_mailbox_id):
            logger.info(
                "spam_rescue skip peer=%s msg=%s (mailbox paused)",
                peer_id, message_id,
            )
            return {"status": "skipped_paused"}
        if rescue_mailbox_id is not None and await is_mailbox_sabotaged(
            rescue_mailbox_id, db
        ):
            logger.info(
                "spam_rescue skip peer=%s msg=%s (owner sabotaged — holding in spam)",
                peer_id, message_id,
            )
            return {"status": "skipped_sabotaged"}

    # Locate the message in Spam. ``find_in_spam`` opens + closes its own
    # IMAP sessions internally; mark_flagged / move_to_inbox each open new
    # ones too, so we don't need an outer try/finally for connection
    # cleanup — but we DO need it to map exceptions onto error logs.
    try:
        located = await imap_watcher.find_in_spam(peer, message_id, fernet)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "spam_rescue find_in_spam failed peer=%s message_id=%s err=%s",
            peer_id, message_id, exc,
        )
        if _is_auth_error(exc):
            _mark_auth_failing(peer_id)
            await _record_spam_rescue_error(peer_id, message_id, "auth_failure")
            return {"status": "error", "error_kind": "auth_failure"}
        await _record_spam_rescue_error(peer_id, message_id, "imap_error")
        return {"status": "error", "error_kind": "imap_error"}

    if located is None:
        await _record_spam_rescue_error(peer_id, message_id, "not_found")
        return {"status": "error", "error_kind": "not_found"}

    # Found — flag + move. We treat either sub-step failing as an IMAP error
    # rather than a hard not-found; the message exists, the action faltered.
    try:
        await imap_watcher.mark_flagged(peer, message_id, fernet)
        moved = await imap_watcher.move_to_inbox(peer, message_id, fernet)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "spam_rescue move/flag failed peer=%s message_id=%s err=%s",
            peer_id, message_id, exc,
        )
        if _is_auth_error(exc):
            _mark_auth_failing(peer_id)
            await _record_spam_rescue_error(peer_id, message_id, "auth_failure")
            return {"status": "error", "error_kind": "auth_failure"}
        await _record_spam_rescue_error(peer_id, message_id, "imap_error")
        return {"status": "error", "error_kind": "imap_error"}

    if not moved:
        await _record_spam_rescue_error(peer_id, message_id, "move_failed")
        return {"status": "error", "error_kind": "move_failed"}

    mailbox_id = await _resolve_mailbox_for_message(uuid.UUID(peer_id), message_id)
    await _record_peer_action(
        peer_id,
        str(mailbox_id) if mailbox_id else None,
        WarmupAction.spam_rescued,
        message_id,
    )
    return {"status": "rescued"}


@celery_app.task(name="app.tasks.peer_actions.peer_spam_rescue", queue="smtp")
def peer_spam_rescue(peer_id: str, message_id: str) -> dict:
    """Move an inbound message from Junk/Spam to INBOX — highest-signal action."""
    return asyncio.run(_peer_spam_rescue_impl(peer_id, message_id))


# Short, human-plausible reply snippets the peer rotates through. Warmup
# replies only need to read like a real person responding in-thread, so we
# vary the wording — a provider scanning the peer's Sent folder sees natural
# language rather than one repeated string.
_REPLY_SNIPPETS = (
    "Thanks for the note — sounds good to me.",
    "Got it, appreciate the update!",
    "Makes sense, thanks for following up.",
    "Perfect, that works on my end.",
    "Thanks for reaching out — I'll take a look shortly.",
    "Appreciate it. Talk soon!",
    "Sounds great, thanks for sending this over.",
    "Noted — thanks, and have a good one.",
)


def _reply_subject(subject: str) -> str:
    """Prefix ``Re:`` once, preserving an existing one."""
    s = (subject or "").strip()
    if s.lower().startswith("re:"):
        return s
    return f"Re: {s}" if s else "Re: (no subject)"


def _build_reply_body(recipient_name: str) -> str:
    snippet = random.choice(_REPLY_SNIPPETS)
    return f"Hi {recipient_name},\n\n{snippet}\n\nBest"


async def _peer_reply_impl(
    peer_id: str, mailbox_id: str, original_message_id: str, subject: str, in_reply_to: str
) -> dict:
    """Send a genuine SMTP reply from the peer back to the user mailbox.

    The peer is the *sender*, so we use the peer's own SMTP endpoint + creds
    (host/port falls back to the provider default for legacy cred blobs that
    predate host persistence). The reply is threaded against the original
    outbound mail's real Message-Id (``<warmpulse-{warmup_id}@warmpulse.app>``,
    reconstructed from the warmup id we were handed) so receiving providers read
    it as a true in-thread human reply — the second-highest-value warmup signal
    after spam-rescue.
    """
    fernet = get_fernet_service()
    async with SessionLocal() as db:
        peer = await db.get(PeerInbox, uuid.UUID(peer_id))
        if peer is None:
            return {"status": "peer_not_found"}
        mailbox = await db.get(Mailbox, uuid.UUID(mailbox_id))
        if mailbox is None:
            return {"status": "mailbox_not_found"}
        # Pause gate (mirrors warmup_send._send_impl): never send a real
        # SMTP reply to a paused mailbox — this catches tasks queued before
        # the pause landed.
        if mailbox.is_paused or mailbox.warmup_status != WarmupStatus.active:
            logger.info(
                "peer_reply skip peer=%s mailbox=%s (mailbox paused)",
                peer_id, mailbox_id,
            )
            return {"status": "skipped_paused"}
        peer_email = peer.email_address
        mailbox_email = mailbox.email_address

        # Resolve the peer's SMTP endpoint + creds while the peer is attached.
        try:
            host, username, password, port = imap_watcher.decrypt_smtp_creds(peer, fernet)
        except ValueError as exc:
            logger.info("peer_reply skip peer=%s: %s", peer_id, exc)
            return {"status": "no_smtp_creds"}

    # The original outbound Message-Id embeds the warmup id (see smtp_sender).
    threaded_id = f"<warmpulse-{original_message_id}@warmpulse.app>"
    body = _build_reply_body(mailbox_email.split("@", 1)[0])
    try:
        await smtp_sender.send_peer_reply(
            host=host,
            port=port,
            username=username,
            password=password,
            from_addr=peer_email,
            to_addr=mailbox_email,
            subject=_reply_subject(subject),
            body=body,
            in_reply_to=threaded_id,
            references=[threaded_id],
        )
    except Exception as exc:  # noqa: BLE001 — one failed reply must not crash the worker
        logger.warning(
            "peer_reply send failed peer=%s mailbox=%s err=%s",
            peer_id, mailbox_id, exc,
        )
        return {"status": "error"}
    finally:
        password = "REDACTED"  # noqa: F841 — scrub plaintext
        del password

    await _record_peer_action(peer_id, mailbox_id, WarmupAction.replied, original_message_id)
    return {"status": "replied"}


@celery_app.task(name="app.tasks.peer_actions.peer_reply_email", queue="smtp")
def peer_reply_email(
    peer_id: str,
    mailbox_id: str,
    original_message_id: str,
    subject: str,
    in_reply_to: str,
) -> dict:
    return asyncio.run(_peer_reply_impl(peer_id, mailbox_id, original_message_id, subject, in_reply_to))


async def _hourly_health_impl() -> dict:
    """Recompute reputation for each active peer; deactivate those below floor.

    Reputation = (engagement actions FROM the peer) / (delivery opportunities
    sent TO the peer) across the last 24 h.

    Two safeguards prevent the cull from killing newly-onboarded peers
    before the IMAP watcher has had time to surface engagement signal:

    1. Peers younger than ``PEER_NEW_GRACE_HOURS`` are skipped entirely.
    2. Peers with fewer than ``PEER_HEALTH_MIN_OPPORTUNITIES`` outbound
       deliveries in-window keep their existing score and stay active.

    Without these, the warmup engine self-extincts: every peer accumulates
    ``sent`` outbound logs but no ``opened``/``replied`` inbound logs (the
    IMAP loop runs every 3 min and engagement is rate-limited per the
    spec's human-timing distribution), so score = 0/N → deactivated → no
    sends possible → no signal will ever accumulate.
    """
    deactivated: list[str] = []
    skipped_low_signal: list[str] = []
    skipped_in_grace: list[str] = []
    async with SessionLocal() as db:
        active_peers = (await db.scalars(select(PeerInbox).where(PeerInbox.is_active.is_(True)))).all()
        now = datetime.now(UTC)
        since = now - timedelta(hours=24)
        grace_cutoff = now - timedelta(hours=PEER_NEW_GRACE_HOURS)

        for peer in active_peers:
            # Grace period for fresh peers — never deactivate within first 72 h.
            if peer.created_at and peer.created_at >= grace_cutoff:
                skipped_in_grace.append(str(peer.id))
                continue

            # Opportunities = outbound mail sent to this peer (the peer was
            # the recipient and was expected to engage).
            opp_stmt = select(func.count()).select_from(WarmupLog).where(
                WarmupLog.peer_inbox_id == peer.id,
                WarmupLog.created_at >= since,
                WarmupLog.direction == WarmupDirection.outbound,
                WarmupLog.action == WarmupAction.sent,
            )
            # Engagement = peer-side actions (opened/replied/starred/spam-rescued)
            # logged with direction=inbound by the peer-action tasks.
            eng_stmt = select(func.count()).select_from(WarmupLog).where(
                WarmupLog.peer_inbox_id == peer.id,
                WarmupLog.created_at >= since,
                WarmupLog.direction == WarmupDirection.inbound,
                WarmupLog.action.in_(
                    [WarmupAction.opened, WarmupAction.replied,
                     WarmupAction.starred, WarmupAction.spam_rescued,
                     WarmupAction.marked_important]
                ),
            )
            opportunities = await db.scalar(opp_stmt) or 0
            engagement = await db.scalar(eng_stmt) or 0

            if opportunities < PEER_HEALTH_MIN_OPPORTUNITIES:
                # Not enough signal to judge — leave the peer alone.
                skipped_low_signal.append(str(peer.id))
                continue

            score = engagement / opportunities
            peer.reputation_score = float(score)

            if score < PEER_REPUTATION_MIN:
                peer.is_active = False
                deactivated.append(str(peer.id))
                db.add(
                    AuditLog(
                        actor_user_id=None,
                        actor_role="system",
                        action="peer_deactivated_low_reputation",
                        target_type="peer_inbox",
                        target_id=peer.id,
                        payload={
                            "reputation_score": score,
                            "threshold": PEER_REPUTATION_MIN,
                            "opportunities_24h": opportunities,
                            "engagement_24h": engagement,
                        },
                    )
                )
        await db.commit()
    return {
        "deactivated": deactivated,
        "skipped_low_signal": skipped_low_signal,
        "skipped_in_grace": skipped_in_grace,
    }


@celery_app.task(name="app.tasks.peer_actions.hourly_peer_health_check", queue="default")
def hourly_peer_health_check() -> dict:
    """Every hour: refresh reputation scores and deactivate unhealthy peers."""
    return asyncio.run(_hourly_health_impl())
