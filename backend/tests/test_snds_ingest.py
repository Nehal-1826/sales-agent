"""Tests for the SNDS client + ingest task.

Four scenarios:

1. ``test_csv_parser_handles_normal_format`` — well-formed CSV parses cleanly.
2. ``test_csv_parser_tolerates_unknown_columns`` — extra column is preserved
   in the row dict rather than dropping the entire fetch.
3. ``test_ingest_aggregates_per_domain_per_day`` — three rows for the same
   IP/domain on the same date collapse into one snapshot row.
4. ``test_validate_key_returns_false_on_empty_csv`` — empty body → False.

Uses the in-memory SQLite fixture from ``conftest.db_session`` so the test
suite is independent of Postgres migrations.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.db.models.domain_credentials import DomainCredential
from app.db.models.domain_reputation_snapshots import DomainReputationSnapshot
from app.services import snds_client as snds_client_module
from app.services.crypto import get_fernet_service
from app.services.snds_client import SndsClient


# --------------------------------------------------------------------------- #
# CSV parser tests                                                             #
# --------------------------------------------------------------------------- #

NORMAL_CSV = (
    "IP,Activity-Start,Activity-End,RCPT-Commands,Data-Commands,"
    "MessageRecipients,Filter-Result,Complaint-Rate,TrapHits,"
    "Sample-Helo,Sample-From,Comments\n"
    "203.0.113.1,2026-05-14 00:00:00,2026-05-14 23:59:59,120,118,118,"
    "GREEN,0.0001,0,helo.example,from@example.com,\n"
    "203.0.113.2,2026-05-14 00:00:00,2026-05-14 23:59:59,80,80,80,"
    "YELLOW,0.0020,1,helo2.example,from2@example.com,\n"
)


async def test_csv_parser_handles_normal_format() -> None:
    client = SndsClient()
    rows = client._parse_csv(NORMAL_CSV)
    assert len(rows) == 2
    assert rows[0]["IP"] == "203.0.113.1"
    assert rows[0]["Filter-Result"] == "GREEN"
    assert rows[0]["Complaint-Rate"] == "0.0001"
    assert rows[1]["IP"] == "203.0.113.2"
    assert rows[1]["TrapHits"] == "1"


async def test_csv_parser_tolerates_unknown_columns() -> None:
    csv_with_extra = (
        "IP,Activity-Start,Filter-Result,Complaint-Rate,TrapHits,Mystery-Col\n"
        "203.0.113.7,2026-05-14 00:00:00,RED,0.0050,3,future-value\n"
    )
    client = SndsClient()
    rows = client._parse_csv(csv_with_extra)
    assert len(rows) == 1
    assert rows[0]["IP"] == "203.0.113.7"
    # Unknown column flows through verbatim — that's the contract that lets
    # the ingest task store the full row into ``raw`` for later forensics.
    assert rows[0]["Mystery-Col"] == "future-value"
    assert rows[0]["Filter-Result"] == "RED"


# --------------------------------------------------------------------------- #
# validate_key                                                                 #
# --------------------------------------------------------------------------- #


async def test_validate_key_returns_false_on_empty_csv(monkeypatch) -> None:
    client = SndsClient()

    async def _fake_fetch(self, access_key, domain=None):  # noqa: ANN001
        return ""

    monkeypatch.setattr(SndsClient, "_fetch_raw", _fake_fetch)
    assert (await client.validate_key("dummy-key-123")) is False


# --------------------------------------------------------------------------- #
# Ingest aggregation                                                           #
# --------------------------------------------------------------------------- #


async def test_ingest_aggregates_per_domain_per_day(db_session, monkeypatch) -> None:
    """3 SNDS rows for the same domain on the same day → 1 snapshot row,
    complaint_rate = worst, trap_hits = worst, filter_result_counts reflects all."""
    # Seed a workspace + an active SNDS credential.
    workspace_id = uuid.uuid4()
    fernet = get_fernet_service()
    enc = fernet.encrypt(b"fake-snds-key-xyz")
    cred = DomainCredential(
        workspace_id=workspace_id,
        domain="acme.com",
        provider="snds",
        access_key_encrypted=enc,
        is_active=True,
        last_status="connected",
    )
    db_session.add(cred)
    await db_session.commit()

    # Stub the SNDS client so the task uses our mock rows.
    fake_rows: list[dict[str, Any]] = [
        {
            "IP": "203.0.113.10",
            "Activity-Start": "2026-05-14",
            "Filter-Result": "GREEN",
            "Complaint-Rate": "0.0001",
            "TrapHits": "0",
        },
        {
            "IP": "203.0.113.11",
            "Activity-Start": "2026-05-14",
            "Filter-Result": "YELLOW",
            "Complaint-Rate": "0.0020",
            "TrapHits": "1",
        },
        {
            "IP": "203.0.113.12",
            "Activity-Start": "2026-05-14",
            "Filter-Result": "RED",
            "Complaint-Rate": "0.0099",  # ← worst — should land in the snapshot
            "TrapHits": "4",
        },
    ]

    stub_client = SndsClient()
    stub_client.fetch_csv = AsyncMock(return_value=fake_rows)  # type: ignore[method-assign]
    monkeypatch.setattr(snds_client_module, "get_snds_client", lambda: stub_client)
    # Belt-and-suspenders: also patch the task's import path.
    from app.tasks import snds_ingest as ingest_mod

    monkeypatch.setattr(ingest_mod, "get_snds_client", lambda: stub_client)

    # Patch SessionLocal to use the test session so the task writes into
    # the same SQLite DB the assertions read from.
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _session_factory():
        yield db_session

    monkeypatch.setattr(ingest_mod, "SessionLocal", _session_factory)

    # Run the task body.
    result = await ingest_mod._tick_impl()
    assert result["count"] == 1
    assert result["results"][0]["status"] == "ok"

    # Exactly one snapshot row landed.
    snaps = (
        await db_session.execute(
            select(DomainReputationSnapshot).where(
                DomainReputationSnapshot.workspace_id == workspace_id,
                DomainReputationSnapshot.domain == "acme.com",
                DomainReputationSnapshot.provider == "snds",
            )
        )
    ).scalars().all()
    assert len(snaps) == 1, f"expected 1 snapshot row, got {len(snaps)}"
    snap = snaps[0]
    # Worst complaint_rate from the three rows.
    assert float(snap.complaint_rate) == pytest.approx(0.0099, rel=1e-3)
    # Worst filter result (RED beats YELLOW/GREEN).
    assert snap.ip_reputation == "RED"
    raw = snap.raw or {}
    assert raw.get("trap_hits") == 4
    counts = raw.get("filter_result_counts") or {}
    assert counts.get("GREEN") == 1
    assert counts.get("YELLOW") == 1
    assert counts.get("RED") == 1
    assert raw.get("row_count") == 3
    ips = raw.get("ips") or []
    assert set(ips) == {"203.0.113.10", "203.0.113.11", "203.0.113.12"}

    # Credential bookkeeping updated.
    await db_session.refresh(cred)
    assert cred.last_status == "ok"
    assert cred.last_pulled_at is not None
    # SQLite may strip tz info — compare in a tz-agnostic way.
    pulled = cred.last_pulled_at
    if pulled.tzinfo is None:
        pulled = pulled.replace(tzinfo=UTC)
    assert pulled <= datetime.now(UTC)
