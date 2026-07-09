"""SNDS daily ingest — beat-scheduled at 03:30 UTC.

For every active ``DomainCredential`` row with ``provider='snds'``:

1. Decrypt the access key (Fernet, at-rest)
2. Pull the CSV from postmaster.live.com
3. Aggregate per-IP rows into a single per-domain daily snapshot
4. UPSERT into ``domain_reputation_snapshots`` (workspace+domain+provider+date unique)
5. Update credential.last_pulled_at + last_status

If the resulting complaint_rate breaches Microsoft's "yellow" threshold
(0.003), fire a ``complaint_rate_spike`` event through ``notifications_dispatch``.

Idempotent: re-running the task on the same UTC day re-aggregates and
overwrites the same snapshot row.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.celery_app import celery_app
from app.db.models.domain_credentials import DomainCredential
from app.db.models.domain_reputation_snapshots import DomainReputationSnapshot
from app.db.session import SessionLocal
from app.services.crypto import get_fernet_service
from app.services.snds_client import get_snds_client

logger = logging.getLogger(__name__)

COMPLAINT_RATE_RED_THRESHOLD = 0.003


def _to_float(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip().rstrip("%")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _to_int(val: Any) -> int:
    if val is None:
        return 0
    s = str(val).strip()
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def aggregate_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Reduce per-IP SNDS rows into a single daily snapshot dict.

    * complaint_rate = max across IPs (worst case)
    * trap_hits      = max across IPs
    * filter result counts (Green/Yellow/Red) for the raw blob
    * worst overall filter-result string (Red > Yellow > Green) → ip_reputation
    * ips list preserved for the raw blob
    """
    worst_complaint = 0.0
    worst_traphits = 0
    counts = {"GREEN": 0, "YELLOW": 0, "RED": 0, "OTHER": 0}
    ips: list[str] = []

    rank = {"RED": 3, "YELLOW": 2, "GREEN": 1}
    worst_filter: str | None = None
    worst_rank = 0

    for r in rows:
        rate = _to_float(r.get("Complaint-Rate"))
        if rate is not None and rate > worst_complaint:
            worst_complaint = rate
        traphits = _to_int(r.get("TrapHits"))
        if traphits > worst_traphits:
            worst_traphits = traphits
        fr_raw = (r.get("Filter-Result") or "").strip().upper()
        if fr_raw in counts:
            counts[fr_raw] += 1
        else:
            counts["OTHER"] += 1
        cur_rank = rank.get(fr_raw, 0)
        if cur_rank > worst_rank:
            worst_rank = cur_rank
            worst_filter = fr_raw
        ip = (r.get("IP") or "").strip()
        if ip:
            ips.append(ip)

    return {
        "complaint_rate": worst_complaint if rows else None,
        "trap_hits": worst_traphits,
        "ip_reputation": worst_filter,
        "filter_result_counts": counts,
        "ips": ips,
        "row_count": len(rows),
    }


async def _upsert_snapshot(
    db,
    *,
    workspace_id,
    domain: str,
    snapshot_date,
    aggregated: dict[str, Any],
    raw_rows: list[dict[str, Any]],
) -> None:
    """Idempotent upsert on (workspace_id, domain, provider, date)."""
    row: dict[str, Any] = {
        "workspace_id": workspace_id,
        "domain": domain,
        "provider": "snds",
        "date": snapshot_date,
        "spam_rate": None,
        "complaint_rate": aggregated.get("complaint_rate"),
        "ip_reputation": aggregated.get("ip_reputation"),
        "domain_reputation": None,
        "auth_pass_pct": None,
        "raw": {
            "ips": aggregated.get("ips", []),
            "trap_hits": aggregated.get("trap_hits", 0),
            "filter_result_counts": aggregated.get("filter_result_counts", {}),
            "row_count": aggregated.get("row_count", 0),
            "rows": raw_rows,
        },
    }

    bind = db.get_bind() if hasattr(db, "get_bind") else None
    dialect = getattr(getattr(bind, "dialect", None), "name", "") if bind else ""
    if dialect == "postgresql":
        stmt = pg_insert(DomainReputationSnapshot).values(**row)
        stmt = stmt.on_conflict_do_update(
            index_elements=["workspace_id", "domain", "provider", "date"],
            set_={k: v for k, v in row.items() if k not in ("workspace_id", "domain", "provider", "date")},
        )
    else:
        stmt = sqlite_insert(DomainReputationSnapshot).values(**row)
        stmt = stmt.on_conflict_do_update(
            index_elements=["workspace_id", "domain", "provider", "date"],
            set_={k: v for k, v in row.items() if k not in ("workspace_id", "domain", "provider", "date")},
        )
    await db.execute(stmt)


async def _fire_complaint_spike(domain: str, rate: float) -> None:
    """Call ``notifications_dispatch.fire`` if the helper exists.

    Sub-A adds the ``fire`` entry-point + ``complaint_rate_spike`` event
    constant in the shared infra patch. We import lazily and tolerate its
    absence so this task degrades gracefully until Sub-A's helper lands.
    """
    try:
        from app.services import notifications_dispatch  # local import for laziness

        fire = getattr(notifications_dispatch, "fire", None)
        if fire is None:
            logger.info(
                "snds.ingest.complaint_spike.skipped_no_fire domain=%s rate=%s",
                domain, rate,
            )
            return
        payload = {"domain": domain, "rate": rate, "source": "snds"}
        result = fire("complaint_rate_spike", payload)
        if asyncio.iscoroutine(result):
            await result
    except Exception as exc:  # noqa: BLE001
        logger.warning("snds.ingest.complaint_spike.failed domain=%s err=%s", domain, exc)


async def _ingest_one(db, cred: DomainCredential) -> dict[str, Any]:
    """Pull + write one credential. Returns a small audit dict."""
    fernet = get_fernet_service()
    if not cred.access_key_encrypted:
        cred.last_status = "missing_key"
        cred.last_pulled_at = datetime.now(UTC)
        return {"domain": cred.domain, "status": "missing_key"}

    try:
        access_key = fernet.decrypt(cred.access_key_encrypted).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.warning("snds.ingest.decrypt_failed cred=%s err=%s", cred.id, exc)
        cred.last_status = "decrypt_failed"
        cred.last_pulled_at = datetime.now(UTC)
        return {"domain": cred.domain, "status": "decrypt_failed"}

    client = get_snds_client()
    try:
        rows = await client.fetch_csv(access_key, domain=cred.domain)
    except Exception as exc:  # noqa: BLE001
        logger.warning("snds.ingest.fetch_failed cred=%s err=%s", cred.id, exc)
        cred.last_status = f"fetch_error: {type(exc).__name__}"
        cred.last_pulled_at = datetime.now(UTC)
        # Redact the local plaintext key as soon as we're done with it.
        access_key = "REDACTED"  # noqa: F841
        del access_key
        return {"domain": cred.domain, "status": "fetch_error"}

    # Redact the plaintext key as soon as we're done with it.
    access_key = "REDACTED"  # noqa: F841
    del access_key

    today = datetime.now(UTC).date()
    aggregated = aggregate_rows(rows)
    await _upsert_snapshot(
        db,
        workspace_id=cred.workspace_id,
        domain=cred.domain,
        snapshot_date=today,
        aggregated=aggregated,
        raw_rows=rows,
    )
    cred.last_status = "ok"
    cred.last_pulled_at = datetime.now(UTC)

    rate = aggregated.get("complaint_rate") or 0.0
    if rate and rate > COMPLAINT_RATE_RED_THRESHOLD:
        await _fire_complaint_spike(cred.domain, float(rate))

    return {
        "domain": cred.domain,
        "status": "ok",
        "rows": len(rows),
        "complaint_rate": rate,
    }


async def _tick_impl() -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    async with SessionLocal() as db:
        creds = (
            await db.scalars(
                select(DomainCredential).where(
                    DomainCredential.provider == "snds",
                    DomainCredential.is_active.is_(True),
                )
            )
        ).all()
        for cred in creds:
            try:
                res = await _ingest_one(db, cred)
                results.append(res)
            except Exception as exc:  # noqa: BLE001
                logger.exception("snds.ingest.cred_failed cred=%s err=%s", cred.id, exc)
                results.append({"domain": cred.domain, "status": "exception"})
        await db.commit()

    return {"count": len(results), "results": results}


@celery_app.task(name="app.tasks.snds_ingest.tick", queue="default")
def tick() -> dict[str, Any]:
    """03:30 UTC daily: pull SNDS CSV for every active credential."""
    return asyncio.run(_tick_impl())
