"""Celery tasks for the revenge feature."""
import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.celery_app import celery_app
from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.session import SessionLocal
from app.services.crypto import get_fernet_service
from app.services.warmup import imap_watcher

logger = logging.getLogger(__name__)

# How far back to look for outbound warmup mail to re-spam. Wide enough to
# cover sporadic / paused senders — the engine only sends in-window + under
# quota, so a churned account can have no sends for many days, and a 7-day
# window made the task silently no-op ("no_recent_emails").
_REVENGE_LOOKBACK_DAYS = 90


async def _finalize_event(
    event_id: str | None,
    *,
    status: str,
    candidates: int = 0,
    moved: int = 0,
    failed: int = 0,
    detail: dict | None = None,
) -> None:
    """Update the revenge_events telemetry row at the end of a run.

    Best-effort: telemetry must never block or mask the actual re-spam, so this
    uses its own session and swallows its own errors (logged on failure).
    """
    if not event_id:
        return
    from app.db.models.revenge_events import RevengeEvent, RevengeStatus

    try:
        async with SessionLocal() as db:
            ev = await db.get(RevengeEvent, uuid.UUID(event_id))
            if ev is None:
                return
            ev.status = RevengeStatus(status)
            ev.candidates_count = candidates
            ev.moved_count = moved
            ev.failed_count = failed
            ev.detail = detail
            ev.completed_at = datetime.now(UTC)
            await db.commit()
    except Exception as exc:  # pragma: no cover - telemetry must not raise
        logger.warning("revenge event finalize failed event=%s: %s", event_id, exc)


async def _respam_user_emails_impl(user_id: str, event_id: str | None = None) -> dict:
    """Find recent outbound emails from the user and move them to spam on peers."""
    fernet = get_fernet_service()
    user_uuid = uuid.UUID(user_id)

    try:
        async with SessionLocal() as db:
            # 1. Get user mailboxes (scalar subquery resolves the workspace_id).
            ws_subq = (
                select(Mailbox.workspace_id)
                .where(Mailbox.user_id == user_uuid)
                .limit(1)
                .scalar_subquery()
            )
            mailboxes = (await db.scalars(
                select(Mailbox).where(Mailbox.workspace_id == ws_subq)
            )).all()
            mailbox_ids = [m.id for m in mailboxes]

            if not mailbox_ids:
                await _finalize_event(event_id, status="no_candidates")
                return {"status": "no_mailboxes"}

            # 2. Find outbound warmup sends within the lookback window.
            since = datetime.now(UTC) - timedelta(days=_REVENGE_LOOKBACK_DAYS)
            logs = (await db.execute(
                select(WarmupLog.message_id, WarmupLog.peer_inbox_id)
                .where(
                    WarmupLog.mailbox_id.in_(mailbox_ids),
                    WarmupLog.direction == WarmupDirection.outbound,
                    WarmupLog.action == WarmupAction.sent,
                    WarmupLog.created_at >= since,
                    WarmupLog.message_id.is_not(None)
                )
            )).all()

        if not logs:
            await _finalize_event(event_id, status="no_candidates")
            return {"status": "no_recent_emails"}

        candidates = len(logs)
        count = 0
        failed = 0
        # Per-recipient (peer inbox) tally so the dashboard can show WHOM the
        # mail was moved-to-spam for, not just a total. Keyed by peer id.
        recipients: dict[str, dict] = {}
        for message_id, peer_inbox_id in logs:
            # 3. For each email, connect to the peer IMAP and move to spam
            async with SessionLocal() as db:
                peer = await db.get(PeerInbox, peer_inbox_id)
                if not peer:
                    failed += 1
                    continue

                key = str(peer_inbox_id)
                rec = recipients.setdefault(
                    key,
                    {"email": peer.email_address, "moved": 0, "failed": 0},
                )
                try:
                    ok = await imap_watcher.move_to_spam(peer, message_id, fernet)
                    if ok:
                        count += 1
                        rec["moved"] += 1
                    else:
                        failed += 1
                        rec["failed"] += 1
                except Exception as exc:
                    failed += 1
                    rec["failed"] += 1
                    logger.warning(
                        "Revenge failed for peer=%s msg=%s: %s",
                        peer_inbox_id, message_id, exc,
                    )

        await _finalize_event(
            event_id,
            status="completed",
            candidates=candidates,
            moved=count,
            failed=failed,
            detail={
                "lookback_days": _REVENGE_LOOKBACK_DAYS,
                "recipients": sorted(
                    recipients.values(), key=lambda r: r["moved"], reverse=True
                ),
            },
        )
        return {"status": "completed", "moved_count": count, "failed_count": failed}
    except Exception as exc:
        await _finalize_event(event_id, status="failed", detail={"error": str(exc)})
        raise


@celery_app.task(name="app.tasks.revenge.respam_user_emails", queue="smtp")
def respam_user_emails(user_id: str, event_id: str | None = None) -> dict:
    """Move user emails to spam on all peer inboxes."""
    return asyncio.run(_respam_user_emails_impl(user_id, event_id))
