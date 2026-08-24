"""Peer inbox business logic (spec §7, §5.2).

Handlers in :mod:`app.api.routes.admin_peer_inboxes` stay thin. All DB
touches, credential encryption/wipe, audit writes, and bulk-CSV parsing
live here so they can be unit-tested without FastAPI in the loop.

Security invariants:
* Plaintext SMTP/IMAP passwords never leave this module — callers hand
  the ``PeerInboxCreate`` in, we encrypt, we wipe the attribute, we
  persist bytes.
* ``smtp_creds_encrypted`` / ``imap_creds_encrypted`` are ``BYTEA``
  columns (spec §8.2). Storage format is JSON:
  ``{"username": ..., "password": ...}`` encrypted as a single Fernet
  token — symmetric encrypt + decrypt; never rotate or re-derive keys.
* Audits are savepointed (mirrors :mod:`app.services.auth_service`).
"""
from __future__ import annotations

import asyncio
import contextlib
import csv
import io
import json
import logging
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import case, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox, PeerProvider
from app.db.models.peer_pools import PeerPool, PeerPoolMember
from app.db.models.users import User
from app.schemas.peer_inboxes import (
    BulkImportResult,
    BulkRowFailure,
    PeerInboxByProviderRow,
    PeerInboxCreate,
    PeerInboxOut,
    PeerInboxStats,
    PeerInboxUpdate,
    PoolMembershipRef,
    TestConnectionResponse,
)
from app.services.crypto import get_fernet_service

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Client-overlap guard (peer-network contamination fix)                        #
# --------------------------------------------------------------------------- #


async def is_client_email(session: AsyncSession, email: str) -> bool:
    """True when the address belongs to a client mailbox or login account.

    The peer network and the client network must stay disjoint: a client
    mailbox used as a "helper" peer makes clients warm up each other (and
    leaks their addresses across tenants). Shared by the pairing engine's
    anti-join, the reverse mailbox-create guard, CRM auto-import, and the
    seeding / purge scripts. Case-insensitive on purpose.
    """
    needle = email.strip().lower()
    mailbox_hit = await session.scalar(
        select(Mailbox.id)
        .where(func.lower(Mailbox.email_address) == needle)
        .limit(1)
    )
    if mailbox_hit is not None:
        return True
    user_hit = await session.scalar(
        select(User.id).where(func.lower(User.email) == needle).limit(1)
    )
    return user_hit is not None


async def _ensure_not_client_email(session: AsyncSession, email: str) -> None:
    if await is_client_email(session, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{email}' is a client mailbox/account and can never be a peer inbox"
            ),
        )


# --------------------------------------------------------------------------- #
# Audit (savepointed)                                                          #
# --------------------------------------------------------------------------- #


async def _write_audit(
    session: AsyncSession,
    *,
    action: str,
    actor: User,
    target_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor.id,
        actor_role=actor.role.value if hasattr(actor.role, "value") else str(actor.role),
        action=action,
        target_type="peer_inbox",
        target_id=target_id,
        payload=payload,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover — audit never fails the request
        logger.warning("audit write failed action=%s: %s", action, exc)


# --------------------------------------------------------------------------- #
# Credential helpers                                                           #
# --------------------------------------------------------------------------- #


def _encrypt_creds(
    username: str,
    password: str,
    *,
    host: str | None = None,
    port: int | None = None,
) -> bytes:
    """Encrypt ``{host, port, username, password}`` as a single Fernet token.

    ``host`` / ``port`` are persisted so the warmup engine can actually connect
    to the peer's IMAP/SMTP server later. They were previously discarded, which
    broke the entire engagement pipeline — the consumer
    (:func:`imap_watcher._decrypt_imap_creds`) raised ``KeyError: 'host'`` on
    every real peer, and that exception was swallowed by the poll loop so no
    open / star / reply / spam-rescue ever ran.

    Kept optional so any caller that only has username/password still works; the
    consumer falls back to the provider's standard endpoint when host is absent.
    """
    fernet = get_fernet_service()
    payload_dict: dict[str, object] = {"username": username, "password": password}
    if host:
        payload_dict["host"] = host
    if port:
        payload_dict["port"] = int(port)
    payload = json.dumps(payload_dict).encode("utf-8")
    token = fernet.encrypt(payload)
    return token


def _decrypt_creds(token: bytes) -> tuple[str, str]:
    fernet = get_fernet_service()
    raw = fernet.decrypt(token).decode("utf-8")
    data = json.loads(raw)
    return data["username"], data["password"]


# --------------------------------------------------------------------------- #
# Projection                                                                   #
# --------------------------------------------------------------------------- #


async def _load_pool_memberships(
    session: AsyncSession, peer_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[PoolMembershipRef]]:
    """Bulk-load pool memberships for a set of peer ids (avoids N+1)."""
    if not peer_ids:
        return {}
    stmt = (
        select(PeerPoolMember.peer_inbox_id, PeerPool.id, PeerPool.name)
        .join(PeerPool, PeerPool.id == PeerPoolMember.pool_id)
        .where(PeerPoolMember.peer_inbox_id.in_(peer_ids))
    )
    result = await session.execute(stmt)
    out: dict[uuid.UUID, list[PoolMembershipRef]] = {pid: [] for pid in peer_ids}
    for peer_id, pool_id, pool_name in result.all():
        out[peer_id].append(PoolMembershipRef(pool_id=pool_id, pool_name=pool_name))
    return out


def _peer_to_out(peer: PeerInbox, memberships: list[PoolMembershipRef]) -> PeerInboxOut:
    return PeerInboxOut(
        id=peer.id,
        email=peer.email_address,
        provider=(
            peer.provider.value if hasattr(peer.provider, "value") else str(peer.provider)
        ),
        daily_capacity=peer.daily_capacity,
        sends_today=peer.used_today,
        reputation_score=peer.reputation_score,
        is_active=peer.is_active,
        last_used_at=peer.last_used_at,
        pool_memberships=memberships,
        pool_ids=[m.pool_id for m in memberships],
        created_at=peer.created_at,
    )


async def project_peer(session: AsyncSession, peer: PeerInbox) -> PeerInboxOut:
    memberships = await _load_pool_memberships(session, [peer.id])
    return _peer_to_out(peer, memberships.get(peer.id, []))


async def project_peers(
    session: AsyncSession, peers: list[PeerInbox]
) -> list[PeerInboxOut]:
    memberships = await _load_pool_memberships(session, [p.id for p in peers])
    return [_peer_to_out(p, memberships.get(p.id, [])) for p in peers]


# --------------------------------------------------------------------------- #
# Queries                                                                      #
# --------------------------------------------------------------------------- #


async def get_peer_or_404(session: AsyncSession, peer_id: uuid.UUID) -> PeerInbox:
    peer = await session.get(PeerInbox, peer_id)
    if peer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Peer inbox not found"
        )
    return peer


async def list_peers(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    provider: str | None = None,
    is_active: bool | None = None,
    pool_id: uuid.UUID | None = None,
    min_reputation: float | None = None,
) -> tuple[list[PeerInbox], int]:
    base = select(PeerInbox)
    count_stmt = select(func.count(PeerInbox.id))

    if provider:
        try:
            pv = PeerProvider(provider)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid provider filter: {provider}",
            ) from exc
        base = base.where(PeerInbox.provider == pv)
        count_stmt = count_stmt.where(PeerInbox.provider == pv)

    if is_active is not None:
        base = base.where(PeerInbox.is_active.is_(is_active))
        count_stmt = count_stmt.where(PeerInbox.is_active.is_(is_active))

    if pool_id is not None:
        sub = select(PeerPoolMember.peer_inbox_id).where(PeerPoolMember.pool_id == pool_id)
        base = base.where(PeerInbox.id.in_(sub))
        count_stmt = count_stmt.where(PeerInbox.id.in_(sub))

    if min_reputation is not None:
        base = base.where(PeerInbox.reputation_score >= min_reputation)
        count_stmt = count_stmt.where(PeerInbox.reputation_score >= min_reputation)

    total = int((await session.execute(count_stmt)).scalar_one())
    stmt = (
        base.order_by(PeerInbox.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return rows, total


# --------------------------------------------------------------------------- #
# Default-pool helper                                                          #
# --------------------------------------------------------------------------- #


async def _get_default_pool_id(session: AsyncSession) -> uuid.UUID | None:
    stmt = select(PeerPool.id).where(PeerPool.is_default.is_(True)).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none()


async def _add_to_default_pool(session: AsyncSession, peer_id: uuid.UUID) -> None:
    pool_id = await _get_default_pool_id(session)
    if pool_id is None:
        return
    exists_stmt = select(PeerPoolMember).where(
        PeerPoolMember.peer_inbox_id == peer_id, PeerPoolMember.pool_id == pool_id
    )
    existing = (await session.execute(exists_stmt)).scalar_one_or_none()
    if existing is None:
        session.add(PeerPoolMember(peer_inbox_id=peer_id, pool_id=pool_id))
        await session.flush()


# --------------------------------------------------------------------------- #
# Create                                                                       #
# --------------------------------------------------------------------------- #


async def create_peer(
    session: AsyncSession, *, actor: User, payload: PeerInboxCreate
) -> PeerInbox:
    # Contamination guard — reject before any secret is encrypted or state
    # is touched: an email that belongs to a client mailbox / login account
    # must never enter the peer network.
    await _ensure_not_client_email(session, payload.email_address)

    # Encrypt creds BEFORE touching the session so any crypto failure rolls
    # cleanly without partial state. Host/port are persisted in the blob so the
    # warmup engine can actually connect later (see _encrypt_creds docstring).
    smtp_blob = _encrypt_creds(
        payload.smtp_username, payload.smtp_password,
        host=payload.smtp_host, port=payload.smtp_port,
    )
    imap_blob = _encrypt_creds(
        payload.imap_username, payload.imap_password,
        host=payload.imap_host, port=payload.imap_port,
    )
    # Blank plaintext attributes on the pydantic model — defensive; the
    # instance lifetime is the request but we want to minimize exposure.
    try:
        object.__setattr__(payload, "smtp_password", "")
        object.__setattr__(payload, "imap_password", "")
    except Exception:
        pass

    peer = PeerInbox(
        email_address=payload.email_address.lower(),
        provider=PeerProvider(
            payload.provider.value if hasattr(payload.provider, "value") else str(payload.provider)
        ),
        smtp_creds_encrypted=smtp_blob,
        imap_creds_encrypted=imap_blob,
        daily_capacity=payload.daily_capacity,
        used_today=0,
        reputation_score=0.0,
        is_active=True,
    )
    # Stash hosts/ports as audit metadata (hosts are not secrets).
    audit_payload = {
        "email": peer.email_address,
        "provider": peer.provider.value if hasattr(peer.provider, "value") else str(peer.provider),
        "smtp_host": payload.smtp_host,
        "smtp_port": payload.smtp_port,
        "imap_host": payload.imap_host,
        "imap_port": payload.imap_port,
    }
    session.add(peer)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Peer inbox with email '{payload.email_address}' already exists",
        ) from exc

    await _add_to_default_pool(session, peer.id)

    await _write_audit(
        session,
        action="peer_inbox.created",
        actor=actor,
        target_id=peer.id,
        payload=audit_payload,
    )
    await session.commit()
    await session.refresh(peer)
    return peer


# --------------------------------------------------------------------------- #
# Update                                                                       #
# --------------------------------------------------------------------------- #


async def update_peer(
    session: AsyncSession,
    *,
    actor: User,
    peer_id: uuid.UUID,
    payload: PeerInboxUpdate,
) -> PeerInbox:
    peer = await get_peer_or_404(session, peer_id)
    data = payload.model_dump(exclude_unset=True)
    changes: dict[str, Any] = {}
    if "daily_capacity" in data and data["daily_capacity"] is not None:
        peer.daily_capacity = int(data["daily_capacity"])
        changes["daily_capacity"] = peer.daily_capacity
    if "is_active" in data and data["is_active"] is not None:
        peer.is_active = bool(data["is_active"])
        changes["is_active"] = peer.is_active
    await session.flush()
    await _write_audit(
        session,
        action="peer_inbox.updated",
        actor=actor,
        target_id=peer.id,
        payload={"peer_inbox_id": str(peer.id), "fields": sorted(changes.keys())},
    )
    await session.commit()
    await session.refresh(peer)
    return peer


# --------------------------------------------------------------------------- #
# Capacity reset — zero used_today on demand                                   #
# --------------------------------------------------------------------------- #


async def reset_peer_capacity(
    session: AsyncSession, *, actor: User, peer_id: uuid.UUID
) -> PeerInbox:
    """Zero a single peer's ``used_today`` so it's immediately eligible to send
    again, without waiting for the 00:01 UTC ``peer_counter_reset`` beat job."""
    peer = await get_peer_or_404(session, peer_id)
    prev = peer.used_today
    peer.used_today = 0
    await session.flush()
    await _write_audit(
        session,
        action="peer_inbox.capacity_reset",
        actor=actor,
        target_id=peer.id,
        payload={"peer_inbox_id": str(peer.id), "previous_used_today": int(prev)},
    )
    await session.commit()
    await session.refresh(peer)
    return peer


async def reset_all_capacity(session: AsyncSession, *, actor: User) -> int:
    """Zero ``used_today`` across every peer. Returns the count of peers reset."""
    from sqlalchemy import update as sa_update

    count = (
        await session.scalar(
            select(func.count(PeerInbox.id)).where(PeerInbox.used_today > 0)
        )
    ) or 0
    await session.execute(sa_update(PeerInbox).values(used_today=0))
    await session.flush()
    await _write_audit(
        session,
        action="peer_inbox.capacity_reset_all",
        actor=actor,
        target_id=None,
        payload={"peers_reset": int(count)},
    )
    await session.commit()
    return int(count)


# --------------------------------------------------------------------------- #
# Delete — wipe creds + membership rows                                        #
# --------------------------------------------------------------------------- #


async def delete_peer(
    session: AsyncSession, *, actor: User, peer_id: uuid.UUID
) -> None:
    peer = await get_peer_or_404(session, peer_id)
    email_copy = peer.email_address
    id_copy = peer.id

    # Wipe encrypted columns before delete so WAL/rollback can't resurrect.
    peer.smtp_creds_encrypted = b""
    peer.imap_creds_encrypted = b""
    await session.flush()

    # Remove membership rows explicitly (even though FK has ondelete=CASCADE,
    # sqlite tests don't always honor cascades on declarative FKs).
    await session.execute(
        delete(PeerPoolMember).where(PeerPoolMember.peer_inbox_id == id_copy)
    )

    await session.delete(peer)
    await session.flush()

    await _write_audit(
        session,
        action="peer_inbox.deleted",
        actor=actor,
        target_id=id_copy,
        payload={"peer_inbox_id": str(id_copy), "email": email_copy},
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# Bulk CSV import                                                              #
# --------------------------------------------------------------------------- #


_CSV_MAX_BYTES = 10 * 1024 * 1024  # 10 MiB

_REQUIRED_COLUMNS = {
    "email",
    "provider",
    "smtp_host",
    "smtp_port",
    "smtp_username",
    "smtp_password",
    "imap_host",
    "imap_port",
    "imap_username",
    "imap_password",
    "daily_capacity",
}


def _coerce_int(raw: str, *, field: str) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be int, got: {raw!r}") from exc


async def bulk_import_peers(
    session: AsyncSession,
    *,
    actor: User,
    csv_bytes: bytes,
) -> BulkImportResult:
    if len(csv_bytes) > _CSV_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="CSV too large (10 MiB max)",
        )
    try:
        text = csv_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV must be UTF-8: {exc}",
        ) from exc

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="CSV has no header"
        )
    missing = _REQUIRED_COLUMNS - {(c or "").strip() for c in reader.fieldnames}
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV missing required columns: {sorted(missing)}",
        )

    succeeded = 0
    failures: list[BulkRowFailure] = []
    seen_in_batch: set[str] = set()

    for row_no, raw_row in enumerate(reader, start=2):  # header is row 1
        try:
            row = {k: (v or "").strip() for k, v in raw_row.items() if k is not None}
            smtp_port = _coerce_int(row["smtp_port"], field="smtp_port")
            imap_port = _coerce_int(row["imap_port"], field="imap_port")
            daily_capacity = _coerce_int(row["daily_capacity"], field="daily_capacity")
            if daily_capacity < 1 or daily_capacity > 500:
                raise ValueError("daily_capacity must be 1..500")
            try:
                provider = PeerProvider(row["provider"])
            except ValueError as exc:
                raise ValueError(
                    f"provider must be one of {[p.value for p in PeerProvider]}"
                ) from exc

            payload = PeerInboxCreate(
                email_address=row["email"],
                provider=provider.value,  # type: ignore[arg-type]
                smtp_host=row["smtp_host"],
                smtp_port=smtp_port,
                smtp_username=row["smtp_username"],
                smtp_password=row["smtp_password"],
                imap_host=row["imap_host"],
                imap_port=imap_port,
                imap_username=row["imap_username"],
                imap_password=row["imap_password"],
                daily_capacity=daily_capacity,
            )

            email_lc = payload.email_address.lower()
            if email_lc in seen_in_batch:
                raise ValueError(f"duplicate email '{email_lc}' in CSV")
            existing = await session.execute(
                select(PeerInbox.id).where(PeerInbox.email_address == email_lc)
            )
            if existing.scalar_one_or_none() is not None:
                raise ValueError(f"peer with email '{email_lc}' already exists")
            # Contamination guard — ValueError so the row lands in the
            # per-row failure list instead of failing the whole import.
            if await is_client_email(session, email_lc):
                raise ValueError(
                    f"'{email_lc}' is a client mailbox/account "
                    "and can never be a peer inbox"
                )
            seen_in_batch.add(email_lc)

            smtp_blob = _encrypt_creds(
                payload.smtp_username, payload.smtp_password,
                host=payload.smtp_host, port=payload.smtp_port,
            )
            imap_blob = _encrypt_creds(
                payload.imap_username, payload.imap_password,
                host=payload.imap_host, port=payload.imap_port,
            )
            peer = PeerInbox(
                email_address=email_lc,
                provider=provider,
                smtp_creds_encrypted=smtp_blob,
                imap_creds_encrypted=imap_blob,
                daily_capacity=payload.daily_capacity,
                used_today=0,
                reputation_score=0.0,
                is_active=True,
            )
            session.add(peer)
            await session.flush()

            await _add_to_default_pool(session, peer.id)
            succeeded += 1
        except (ValueError, KeyError) as exc:
            failures.append(BulkRowFailure(row=row_no, error=str(exc)))
        except HTTPException as exc:  # e.g. EmailStr validation propagated
            failures.append(BulkRowFailure(row=row_no, error=str(exc.detail)))
        except Exception as exc:  # noqa: BLE001 — last-ditch per-row isolation
            logger.warning("bulk import row %d failed: %s", row_no, exc)
            failures.append(BulkRowFailure(row=row_no, error=f"{type(exc).__name__}"))

    await _write_audit(
        session,
        action="peer_inbox.bulk_imported",
        actor=actor,
        payload={"succeeded": succeeded, "failed": len(failures)},
    )
    await session.commit()
    return BulkImportResult(succeeded=succeeded, failed=failures)


# --------------------------------------------------------------------------- #
# Stats                                                                        #
# --------------------------------------------------------------------------- #


async def peer_stats(session: AsyncSession) -> PeerInboxStats:
    total = int((await session.execute(select(func.count(PeerInbox.id)))).scalar_one())
    active = int(
        (
            await session.execute(
                select(func.count(PeerInbox.id)).where(PeerInbox.is_active.is_(True))
            )
        ).scalar_one()
    )
    inactive = total - active

    # Single query: per-provider total + active counts.
    rows = (
        await session.execute(
            select(
                PeerInbox.provider,
                func.count(PeerInbox.id).label("total"),
                func.sum(
                    case((PeerInbox.is_active.is_(True), 1), else_=0)
                ).label("active"),
            ).group_by(PeerInbox.provider)
        )
    ).all()
    counts: dict[str, dict[str, int]] = {
        p.value: {"count": 0, "active": 0} for p in PeerProvider
    }
    for provider_val, total_count, active_count in rows:
        key = (
            provider_val.value if hasattr(provider_val, "value") else str(provider_val)
        )
        counts[key] = {"count": int(total_count or 0), "active": int(active_count or 0)}
    by_provider = [
        PeerInboxByProviderRow(
            provider=key, count=v["count"], active=v["active"]
        )
        for key, v in counts.items()
    ]

    avg_rep_raw = (
        await session.execute(select(func.avg(PeerInbox.reputation_score)))
    ).scalar_one()
    avg_reputation = float(avg_rep_raw) if avg_rep_raw is not None else 0.0

    cap_total_raw = (
        await session.execute(select(func.sum(PeerInbox.daily_capacity)))
    ).scalar_one()
    cap_used_raw = (
        await session.execute(select(func.sum(PeerInbox.used_today)))
    ).scalar_one()
    total_capacity = int(cap_total_raw or 0)
    used_capacity_today = int(cap_used_raw or 0)
    capacity_used_pct = (
        (used_capacity_today / total_capacity * 100.0) if total_capacity > 0 else 0.0
    )

    return PeerInboxStats(
        total=total,
        active=active,
        inactive=inactive,
        by_provider=by_provider,
        avg_reputation=avg_reputation,
        total_capacity=total_capacity,
        used_capacity_today=used_capacity_today,
        capacity_used_pct=round(capacity_used_pct, 2),
    )


# --------------------------------------------------------------------------- #
# Test connection                                                              #
# --------------------------------------------------------------------------- #


_PROBE_TIMEOUT = 10.0


def _sanitize_exception(exc: BaseException) -> str:
    name = type(exc).__name__
    lname = name.lower()
    text = str(exc).lower()
    if "timeout" in lname or "timeout" in text:
        hint = "timeout"
    elif "refused" in text:
        hint = "connection_refused"
    elif "auth" in lname or "auth" in text or "login" in text:
        hint = "authentication_failed"
    elif "ssl" in lname or "tls" in text or "ssl" in text:
        hint = "tls_error"
    elif "resolv" in text or "getaddrinfo" in text or "name or service" in text:
        hint = "dns_error"
    else:
        hint = "connection_failed"
    return f"{name}: {hint}"


async def _probe_smtp(host: str, port: int, username: str, password: str) -> tuple[bool, str | None]:
    """TEMPORARY dummy bypass — mirrors mailbox_service._probe_smtp.

    When MAILBOX_PROBES_DUMMY=true (default in dev), peer-inbox SMTP probes
    return success without hitting the network. Flip the env var to false
    before shipping as real SaaS.
    """
    from app.config import get_settings

    if get_settings().mailbox_probes_dummy:
        return True, None

    import aiosmtplib

    try:
        client = aiosmtplib.SMTP(hostname=host, port=port, timeout=_PROBE_TIMEOUT)

        async def _go() -> None:
            await client.connect()
            try:
                await client.login(username, password)
            finally:
                with contextlib.suppress(Exception):
                    await client.quit()

        await asyncio.wait_for(_go(), timeout=_PROBE_TIMEOUT)
        return True, None
    except Exception as exc:  # noqa: BLE001
        return False, _sanitize_exception(exc)


async def _probe_imap(host: str, port: int, username: str, password: str) -> tuple[bool, str | None]:
    """TEMPORARY dummy bypass — see _probe_smtp."""
    from app.config import get_settings

    if get_settings().mailbox_probes_dummy:
        return True, None

    import aioimaplib

    try:
        client = aioimaplib.IMAP4_SSL(host=host, port=port, timeout=_PROBE_TIMEOUT)

        async def _go() -> None:
            await client.wait_hello_from_server()
            resp = await client.login(username, password)
            ok = getattr(resp, "result", None)
            if ok is not None and str(ok).upper() != "OK":
                raise RuntimeError("imap login rejected")
            with contextlib.suppress(Exception):
                await client.logout()

        await asyncio.wait_for(_go(), timeout=_PROBE_TIMEOUT)
        return True, None
    except Exception as exc:  # noqa: BLE001
        return False, _sanitize_exception(exc)


async def test_peer_connection(
    session: AsyncSession,
    *,
    peer_id: uuid.UUID,
    smtp_host: str | None = None,
    smtp_port: int | None = None,
    imap_host: str | None = None,
    imap_port: int | None = None,
) -> TestConnectionResponse:
    """Run SMTP + IMAP AUTH probes. Never leaks raw creds in error strings.

    Host/port are passed by the caller because the peer_inboxes table
    stores creds but not host/port for MVP — those are baked into the
    encrypted blob in production. For MVP we accept them as function
    args; the handler adapts the admin request shape.
    """
    peer = await get_peer_or_404(session, peer_id)
    if peer.smtp_creds_encrypted is None or peer.imap_creds_encrypted is None:
        return TestConnectionResponse(
            smtp_ok=False,
            imap_ok=False,
            smtp_error="ConfigError: missing_smtp_creds",
            imap_error="ConfigError: missing_imap_creds",
        )
    smtp_user, smtp_pass = _decrypt_creds(peer.smtp_creds_encrypted)
    imap_user, imap_pass = _decrypt_creds(peer.imap_creds_encrypted)

    try:
        if smtp_host and smtp_port:
            smtp_ok, smtp_err = await _probe_smtp(smtp_host, smtp_port, smtp_user, smtp_pass)
        else:
            smtp_ok, smtp_err = False, "ConfigError: missing_smtp_host"
        if imap_host and imap_port:
            imap_ok, imap_err = await _probe_imap(imap_host, imap_port, imap_user, imap_pass)
        else:
            imap_ok, imap_err = False, "ConfigError: missing_imap_host"
    finally:
        smtp_pass = ""
        imap_pass = ""
        del smtp_pass, imap_pass

    return TestConnectionResponse(
        smtp_ok=smtp_ok, imap_ok=imap_ok, smtp_error=smtp_err, imap_error=imap_err
    )
