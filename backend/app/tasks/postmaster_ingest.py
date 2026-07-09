"""Daily Google Postmaster Tools ingest.

Run at 03:00 UTC by Celery Beat. For every active Postmaster
``DomainCredential``:

1. Decrypt the refresh token (Fernet).
2. Swap for a fresh access token.
3. Fetch yesterday's trafficStats for the domain.
4. Upsert a ``DomainReputationSnapshot`` row (idempotent by the unique
   ``(workspace, domain, provider, date)`` constraint).
5. Update ``last_pulled_at`` + ``last_status`` on the credential row.
6. Fire ``spam_rate_spike`` when the day's spam_rate exceeds Google's Red
   threshold (0.1%).

Failures on a single credential are logged and isolated — one bad token
doesn't poison the rest of the sweep.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.db.models.domain_credentials import DomainCredential
from app.db.models.domain_reputation_snapshots import DomainReputationSnapshot
from app.db.session import SessionLocal
from app.services import notifications_dispatch, postmaster_client
from app.services.crypto import get_fernet_service

logger = logging.getLogger(__name__)

POSTMASTER_PROVIDER = "postmaster"
SPAM_RATE_RED_THRESHOLD = 0.001  # 0.1% — Google's Red band

STATUS_OK = "ok"
STATUS_NO_DATA = "no_data"
STATUS_REFRESH_FAILED = "refresh_failed"
STATUS_FETCH_FAILED = "fetch_failed"
STATUS_ERROR = "error"


async def _upsert_snapshot(
    session: AsyncSession,
    *,
    workspace_id,
    domain: str,
    snapshot_date: dt.date,
    fields: dict[str, Any],
) -> DomainReputationSnapshot:
    """Idempotent upsert on the (workspace, domain, provider, date) unique key.

    We don't use Postgres-specific ``ON CONFLICT`` here because the test
    suite runs on SQLite. A SELECT-then-UPDATE-or-INSERT is fine for daily
    cadence (one row per domain per day).
    """
    existing = (
        await session.execute(
            select(DomainReputationSnapshot).where(
                DomainReputationSnapshot.workspace_id == workspace_id,
                DomainReputationSnapshot.domain == domain,
                DomainReputationSnapshot.provider == POSTMASTER_PROVIDER,
                DomainReputationSnapshot.date == snapshot_date,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        for k, v in fields.items():
            setattr(existing, k, v)
        return existing

    row = DomainReputationSnapshot(
        workspace_id=workspace_id,
        domain=domain,
        provider=POSTMASTER_PROVIDER,
        date=snapshot_date,
        **fields,
    )
    session.add(row)
    return row


async def _process_credential(
    session: AsyncSession,
    cred: DomainCredential,
    snapshot_date: dt.date,
) -> str:
    """Pull + persist one day's stats for one credential. Returns status."""
    if not cred.refresh_token_encrypted:
        return STATUS_REFRESH_FAILED

    fernet = get_fernet_service()

    # Decrypt → bind locally → use → drop.
    try:
        refresh_token = fernet.decrypt(cred.refresh_token_encrypted).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.warning("postmaster.ingest.decrypt_failed cred=%s err=%s", cred.id, exc)
        return STATUS_REFRESH_FAILED

    try:
        access_token = await postmaster_client.refresh_access_token(refresh_token)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "postmaster.ingest.refresh_failed cred=%s domain=%s err=%s",
            cred.id, cred.domain, exc,
        )
        return STATUS_REFRESH_FAILED
    finally:
        refresh_token = "REDACTED"  # noqa: F841
        del refresh_token

    try:
        stats = await postmaster_client.fetch_traffic_stats(
            access_token, cred.domain, snapshot_date
        )
    except httpx.HTTPStatusError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            # Postmaster hasn't produced yesterday's stats yet — common.
            return STATUS_NO_DATA
        logger.warning(
            "postmaster.ingest.fetch_failed cred=%s domain=%s status=%s",
            cred.id, cred.domain,
            exc.response.status_code if exc.response is not None else "?",
        )
        return STATUS_FETCH_FAILED
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "postmaster.ingest.fetch_failed cred=%s domain=%s err=%s",
            cred.id, cred.domain, exc,
        )
        return STATUS_FETCH_FAILED
    finally:
        access_token = "REDACTED"  # noqa: F841
        del access_token

    mapped = postmaster_client.map_traffic_stats_to_snapshot(stats)
    await _upsert_snapshot(
        session,
        workspace_id=cred.workspace_id,
        domain=cred.domain,
        snapshot_date=snapshot_date,
        fields=mapped,
    )

    spam_rate = mapped.get("spam_rate")
    if isinstance(spam_rate, (int, float)) and spam_rate > SPAM_RATE_RED_THRESHOLD:
        try:
            await notifications_dispatch.fire(
                notifications_dispatch.SPAM_RATE_SPIKE,
                {
                    "workspace_id": str(cred.workspace_id),
                    "domain": cred.domain,
                    "rate": float(spam_rate),
                    "source": POSTMASTER_PROVIDER,
                    "date": snapshot_date.isoformat(),
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("postmaster.ingest.spike_dispatch_failed err=%s", exc)

    return STATUS_OK


async def _impl(now: dt.datetime | None = None) -> dict[str, Any]:
    """Async body of the daily tick. Returns a small summary dict."""
    now = now or dt.datetime.now(dt.UTC)
    snapshot_date = (now - dt.timedelta(days=1)).date()

    summary = {"processed": 0, "ok": 0, "skipped": 0, "failed": 0}

    async with SessionLocal() as session:
        creds = (
            await session.execute(
                select(DomainCredential).where(
                    DomainCredential.provider == POSTMASTER_PROVIDER,
                    DomainCredential.is_active.is_(True),
                )
            )
        ).scalars().all()

        for cred in creds:
            summary["processed"] += 1
            try:
                status = await _process_credential(session, cred, snapshot_date)
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "postmaster.ingest.unexpected cred=%s err=%s", cred.id, exc
                )
                status = STATUS_ERROR

            cred.last_pulled_at = now
            cred.last_status = status

            if status == STATUS_OK:
                summary["ok"] += 1
            elif status == STATUS_NO_DATA:
                summary["skipped"] += 1
            else:
                summary["failed"] += 1

        await session.commit()

    logger.info("postmaster.ingest.done summary=%s date=%s", summary, snapshot_date)
    return summary


@celery_app.task(name="app.tasks.postmaster_ingest.tick", queue="default")
def tick() -> dict[str, Any]:
    return asyncio.run(_impl())


__all__ = ["tick", "_impl"]
