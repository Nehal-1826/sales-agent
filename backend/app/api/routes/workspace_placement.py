"""Workspace — Placement Tester routes (Pro Plus).

* ``POST   /api/workspace/placement-tests``        — start a test.
* ``GET    /api/workspace/placement-tests``        — paginated history.
* ``GET    /api/workspace/placement-tests/{id}``   — full status + per-seed.

The response models here are the authoritative wire contract for the
frontend ``features/placement/api.ts`` hooks. They deliberately emit the
*rich* shape the Placement Tester UI consumes (per-provider breakdown keyed
by the public provider vocabulary, resolved-seed counts, mailbox email,
pagination echo) so the frontend never has to second-guess the payload.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.mailboxes import Mailbox
from app.db.models.placement_test_seeds import PlacementTestSeed
from app.db.models.placement_tests import PlacementTest
from app.db.models.users import User
from app.db.session import get_db
from app.services import placement_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace/placement-tests", tags=["workspace-placement"])

# Buckets every ``ProviderBreakdown`` must expose (frontend renders all 5).
_BUCKETS = ("inbox", "promotions", "spam", "other", "timeout")

# Backend ``PeerProvider`` value → public provider key the frontend speaks.
# Anything unknown collapses to "smtp" (the frontend catch-all).
_PROVIDER_PUBLIC: dict[str, str] = {
    "google_ws": "gmail",
    "office365": "outlook",
    "yahoo": "yahoo",
    "smtp": "smtp",
    "gmail": "gmail",
    "outlook": "outlook",
}

# Seed statuses that count as "resolved" (a landing was determined). Anything
# else (pending / sent / pending_check) is still in-flight.
_RESOLVED_SEED_STATUSES = {"inbox", "promotions", "spam", "junk", "other", "timeout"}


def _empty_breakdown() -> dict[str, int]:
    return {b: 0 for b in _BUCKETS}


def _normalize_results(results: dict[str, Any] | None) -> dict[str, Any] | None:
    """Reshape stored results into the exact frontend ``PlacementTestResults``.

    * Guarantees the five top-level bucket counts + ``total_seeds`` exist.
    * Re-keys ``by_provider`` from the internal provider vocabulary
      (``google_ws`` / ``office365`` / ...) to the public one
      (``gmail`` / ``outlook`` / ``yahoo`` / ``smtp``) and guarantees every
      provider entry carries the full 5-bucket breakdown.
    """
    if not results:
        return None

    top = {b: int(results.get(b, 0) or 0) for b in _BUCKETS}
    raw_by_provider = results.get("by_provider") or {}

    by_provider: dict[str, dict[str, int]] = {}
    for raw_key, raw_counts in raw_by_provider.items():
        public = _PROVIDER_PUBLIC.get(str(raw_key), "smtp")
        slot = by_provider.setdefault(public, _empty_breakdown())
        counts = raw_counts if isinstance(raw_counts, dict) else {}
        for b in _BUCKETS:
            slot[b] += int(counts.get(b, 0) or 0)

    return {
        **top,
        "total_seeds": int(results.get("total_seeds", 0) or 0),
        "by_provider": by_provider,
    }


def _seeds_resolved(seeds: list[dict[str, Any]]) -> int:
    return sum(1 for s in seeds if s.get("status") in _RESOLVED_SEED_STATUSES)


def _completed_at(status_str: str, seeds: list[dict[str, Any]]) -> str | None:
    """Best-effort completion timestamp.

    The model has no dedicated ``completed_at`` column, so for a completed
    test we surface the latest seed ``landed_at``. Non-completed tests have
    no completion time yet → ``null`` (the UI renders an em-dash).
    """
    if status_str != "completed":
        return None
    landed = [s["landed_at"] for s in seeds if s.get("landed_at")]
    return max(landed) if landed else None


class StartTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mailbox_id: uuid.UUID


class StartTestResponse(BaseModel):
    test_id: uuid.UUID
    seed_count: int
    status: str


class PlacementSeed(BaseModel):
    id: str
    provider: str | None = None
    status: str
    landed_folder: str | None = None


class PlacementTestDetail(BaseModel):
    id: str
    mailbox_id: str
    status: str
    created_at: str | None = None
    completed_at: str | None = None
    seed_count: int
    seeds_resolved: int
    results: dict[str, Any] | None = None
    seeds: list[PlacementSeed] = []
    mailbox_email: str | None = None


class PlacementTestListItem(BaseModel):
    id: str
    mailbox_id: str
    mailbox_email: str | None = None
    status: str
    created_at: str | None = None
    completed_at: str | None = None
    seed_count: int
    seeds_resolved: int
    results: dict[str, Any] | None = None


class PlacementHistoryResponse(BaseModel):
    items: list[PlacementTestListItem]
    total: int
    limit: int
    offset: int


@router.post("", response_model=StartTestResponse, status_code=status.HTTP_201_CREATED)
async def start_placement_test(
    body: StartTestRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> StartTestResponse:
    try:
        test = await placement_service.start_test(
            workspace_id=user.workspace_id,
            mailbox_id=body.mailbox_id,
            user=user,
            session=session,
        )
    except placement_service.PlacementMailboxNotFound as exc:
        raise HTTPException(status_code=404, detail="Mailbox not found") from exc
    except placement_service.PlacementQuotaExceeded as exc:
        raise HTTPException(
            status_code=402,
            detail="Monthly placement-test quota exceeded for your plan",
            headers={"X-Quota-Used": str(exc.used), "X-Quota-Cap": str(exc.cap)},
        ) from exc

    seed_count = int(test.seed_set.get("seed_count", 0)) if test.seed_set else 0
    return StartTestResponse(
        test_id=test.id,
        seed_count=seed_count,
        status=test.status,
    )


async def _mailbox_email(
    session: AsyncSession, mailbox_id: uuid.UUID
) -> str | None:
    mb = await session.get(Mailbox, mailbox_id)
    return mb.email_address if mb else None


@router.get("", response_model=PlacementHistoryResponse)
async def list_placement_tests(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> PlacementHistoryResponse:
    total = int(
        (
            await session.execute(
                select(func.count())
                .select_from(PlacementTest)
                .where(PlacementTest.workspace_id == user.workspace_id)
            )
        ).scalar_one()
        or 0
    )
    rows = (
        await session.execute(
            select(PlacementTest)
            .where(PlacementTest.workspace_id == user.workspace_id)
            .order_by(PlacementTest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    # Resolve seed-row counts + mailbox emails in batch to keep this O(2)
    # queries rather than O(rows).
    test_ids = [r.id for r in rows]
    seeds_by_test: dict[uuid.UUID, list[dict[str, Any]]] = {}
    if test_ids:
        seed_rows = (
            await session.execute(
                select(PlacementTestSeed).where(
                    PlacementTestSeed.test_id.in_(test_ids)
                )
            )
        ).scalars().all()
        for s in seed_rows:
            seeds_by_test.setdefault(s.test_id, []).append(
                {
                    "status": s.status,
                    "landed_at": s.landed_at.isoformat() if s.landed_at else None,
                }
            )

    mailbox_ids = {r.mailbox_id for r in rows}
    email_by_mailbox: dict[uuid.UUID, str] = {}
    if mailbox_ids:
        for mb in (
            await session.execute(
                select(Mailbox).where(Mailbox.id.in_(mailbox_ids))
            )
        ).scalars().all():
            email_by_mailbox[mb.id] = mb.email_address

    items: list[PlacementTestListItem] = []
    for r in rows:
        seeds = seeds_by_test.get(r.id, [])
        seed_count = (
            int(r.seed_set.get("seed_count", 0)) if r.seed_set else len(seeds)
        ) or len(seeds)
        items.append(
            PlacementTestListItem(
                id=str(r.id),
                mailbox_id=str(r.mailbox_id),
                mailbox_email=email_by_mailbox.get(r.mailbox_id),
                status=r.status,
                created_at=r.created_at.isoformat() if r.created_at else None,
                completed_at=_completed_at(r.status, seeds),
                seed_count=seed_count,
                seeds_resolved=_seeds_resolved(seeds),
                results=_normalize_results(r.results),
            )
        )
    return PlacementHistoryResponse(
        items=items, total=total, limit=limit, offset=offset
    )


@router.get("/{test_id}", response_model=PlacementTestDetail)
async def get_placement_test(
    test_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PlacementTestDetail:
    test = await session.get(PlacementTest, test_id)
    if test is None or test.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Placement test not found")
    out = await placement_service.get_status(test_id, session=session)
    if out is None:
        raise HTTPException(status_code=404, detail="Placement test not found")

    seeds = out.get("seeds") or []
    seed_count = (
        int(test.seed_set.get("seed_count", 0)) if test.seed_set else len(seeds)
    ) or len(seeds)
    mailbox_email = await _mailbox_email(session, test.mailbox_id)

    return PlacementTestDetail(
        id=str(out["id"]),
        mailbox_id=str(out["mailbox_id"]),
        status=str(out["status"]),
        created_at=out.get("created_at"),
        completed_at=_completed_at(str(out["status"]), seeds),
        seed_count=seed_count,
        seeds_resolved=_seeds_resolved(seeds),
        results=_normalize_results(out.get("results")),
        seeds=[
            PlacementSeed(
                id=str(s["id"]),
                status=str(s.get("status", "")),
                landed_folder=s.get("landed_folder"),
            )
            for s in seeds
        ],
        mailbox_email=mailbox_email,
    )


__all__ = ["router"]
