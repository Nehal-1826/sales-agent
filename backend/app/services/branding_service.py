"""Workspace white-label branding service.

Agency / Enterprise tier writes a per-workspace branding row; everyone in
the workspace (and any sub-client workspace that points its
``parent_workspace_id`` here) reads it back through ``get_effective``.

Resolution chain:
    own row  →  parent row (via parent_workspace_id pointer)  →  WarmPulse defaults

Effective dicts are cached in Redis under ``branding:effective:{workspace_id}``
with a 5-minute TTL. Redis being unreachable falls through to the DB on
every call — the cache is an optimisation, never a correctness gate.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.workspace_branding import WorkspaceBranding

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Defaults / constants                                                         #
# --------------------------------------------------------------------------- #

WARMPULSE_DEFAULTS: dict[str, Any] = {
    "brand_name": "WarmPulse",
    "accent_color": "#F26522",
    "footer_text": "Powered by WarmPulse",
    "has_logo": False,
    "is_inherited": False,
}

ALLOWED_LOGO_MIMES = {"image/png", "image/jpeg", "image/svg+xml"}
MAX_LOGO_BYTES = 1 * 1024 * 1024  # 1 MB

_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

_AGENCY_PLAN_SLUGS = {"agency", "enterprise"}


# --------------------------------------------------------------------------- #
# Exceptions                                                                   #
# --------------------------------------------------------------------------- #


class BrandingNotAllowedError(Exception):
    """Raised when a non-Agency plan attempts a branding write."""


class BrandingValidationError(Exception):
    """Raised on bad accent color, oversize logo, bad MIME, SVG-with-script."""


# --------------------------------------------------------------------------- #
# Redis cache                                                                  #
# --------------------------------------------------------------------------- #


_CACHE_TTL_S = 300  # 5 minutes


def _cache_key(workspace_id: uuid.UUID) -> str:
    try:
        from app.config import get_settings
        prefix = get_settings().redis_key_prefix
    except Exception:  # pragma: no cover
        prefix = ""
    return f"{prefix}branding:effective:{workspace_id}"


def _redis_client_or_none():
    try:
        import redis  # type: ignore

        from app.config import get_settings
        settings = get_settings()
        return redis.Redis.from_url(settings.redis_url, decode_responses=True)
    except Exception as exc:  # pragma: no cover
        logger.debug("branding.redis_unavailable err=%s", exc)
        return None


def _cache_get(workspace_id: uuid.UUID) -> dict[str, Any] | None:
    client = _redis_client_or_none()
    if client is None:
        return None
    try:
        import json
        raw = client.get(_cache_key(workspace_id))
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:  # pragma: no cover
        logger.debug("branding.cache_get err=%s", exc)
        return None


def _cache_set(workspace_id: uuid.UUID, value: dict[str, Any]) -> None:
    client = _redis_client_or_none()
    if client is None:
        return
    try:
        import json
        client.setex(_cache_key(workspace_id), _CACHE_TTL_S, json.dumps(value))
    except Exception as exc:  # pragma: no cover
        logger.debug("branding.cache_set err=%s", exc)


async def _invalidate_cache(
    session: AsyncSession, workspace_id: uuid.UUID
) -> None:
    """Drop the cache entry for this workspace AND every sub-client whose
    ``parent_workspace_id`` points here."""
    client = _redis_client_or_none()
    if client is None:
        return
    keys = [_cache_key(workspace_id)]
    try:
        rows = (
            await session.execute(
                select(WorkspaceBranding.workspace_id).where(
                    WorkspaceBranding.parent_workspace_id == workspace_id
                )
            )
        ).scalars().all()
        for child_ws in rows:
            keys.append(_cache_key(child_ws))
    except Exception as exc:  # pragma: no cover
        logger.debug("branding.invalidate_query_failed err=%s", exc)
    try:
        client.delete(*keys)
    except Exception as exc:  # pragma: no cover
        logger.debug("branding.cache_invalidate err=%s", exc)


# --------------------------------------------------------------------------- #
# Plan-tier gate                                                               #
# --------------------------------------------------------------------------- #


async def _require_agency_or_enterprise(
    session: AsyncSession, workspace_id: uuid.UUID
) -> None:
    """Raise ``BrandingNotAllowedError`` unless any user in this workspace
    is on an ``agency``/``enterprise`` plan.

    Workspace tier is derived from the workspace's owning user (the row
    that minted the workspace_id at signup) — same shape every other
    capability check uses.
    """
    from app.db.models.plans import Plan
    from app.db.models.users import User

    stmt = (
        select(Plan.name)
        .join(User, User.plan_id == Plan.id)
        .where(User.workspace_id == workspace_id)
    )
    names = [
        (n or "").strip().lower() for n in (await session.execute(stmt)).scalars().all()
    ]
    if not any(n in _AGENCY_PLAN_SLUGS for n in names):
        raise BrandingNotAllowedError(
            "White-label branding requires the Agency plan."
        )


# --------------------------------------------------------------------------- #
# Projection                                                                   #
# --------------------------------------------------------------------------- #


def _to_effective_dict(
    row: WorkspaceBranding, *, is_inherited: bool
) -> dict[str, Any]:
    # Auto-migrate legacy violet accent stored in older workspaces to the
    # current Shailog orange — old rows had `#7c5cff` and its dark/light
    # neighbours. Treat any of those as "default" so the new brand color
    # flows through without requiring a manual UPDATE.
    LEGACY_VIOLETS = {"#7c5cff", "#6d4dff", "#8d72ff", "#a78bfa", "#5a3aee"}
    raw = (row.accent_color or "").lower()
    accent = (
        WARMPULSE_DEFAULTS["accent_color"]
        if not row.accent_color or raw in LEGACY_VIOLETS
        else row.accent_color
    )
    return {
        "brand_name": row.brand_name or WARMPULSE_DEFAULTS["brand_name"],
        "accent_color": accent,
        "footer_text": (
            row.footer_text
            if row.footer_text is not None
            else WARMPULSE_DEFAULTS["footer_text"]
        ),
        "has_logo": bool(row.logo_blob),
        "is_inherited": is_inherited,
    }


# --------------------------------------------------------------------------- #
# Public API                                                                   #
# --------------------------------------------------------------------------- #


async def _get_row(
    session: AsyncSession, workspace_id: uuid.UUID
) -> WorkspaceBranding | None:
    stmt = select(WorkspaceBranding).where(
        WorkspaceBranding.workspace_id == workspace_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def _row_has_brand_data(row: WorkspaceBranding) -> bool:
    """True when at least one customisable brand field is set.

    A row that only carries a ``parent_workspace_id`` pointer (no brand
    fields of its own) shouldn't be treated as the workspace's "own"
    brand — we want to keep walking up to the parent in that case.
    """
    return any(
        getattr(row, f) is not None
        for f in ("brand_name", "accent_color", "footer_text", "logo_blob")
    )


async def get_effective(
    session: AsyncSession, workspace_id: uuid.UUID
) -> dict[str, Any]:
    """Resolve effective branding for a workspace.

    Returns ``{brand_name, accent_color, footer_text, has_logo, is_inherited}``.
    """
    cached = _cache_get(workspace_id)
    if cached is not None:
        return cached

    own = await _get_row(session, workspace_id)
    if own is not None and _row_has_brand_data(own):
        out = _to_effective_dict(own, is_inherited=False)
        _cache_set(workspace_id, out)
        return out

    # Walk parent chain (one hop — depth-limited to avoid cycles).
    if own is not None and own.parent_workspace_id is not None:
        parent = await _get_row(session, own.parent_workspace_id)
        if parent is not None and _row_has_brand_data(parent):
            out = _to_effective_dict(parent, is_inherited=True)
            _cache_set(workspace_id, out)
            return out

    out = dict(WARMPULSE_DEFAULTS)
    _cache_set(workspace_id, out)
    return out


async def _upsert_row(
    session: AsyncSession, workspace_id: uuid.UUID
) -> WorkspaceBranding:
    row = await _get_row(session, workspace_id)
    if row is None:
        row = WorkspaceBranding(workspace_id=workspace_id)
        session.add(row)
        await session.flush()
    return row


async def update(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    **fields: Any,
) -> None:
    """Upsert branding fields. Requires Agency/Enterprise tier."""
    await _require_agency_or_enterprise(session, workspace_id)

    if "accent_color" in fields and fields["accent_color"] is not None:
        if not _HEX_COLOR_RE.match(fields["accent_color"]):
            raise BrandingValidationError(
                "accent_color must be a 7-char hex string like '#F26522'"
            )

    row = await _upsert_row(session, workspace_id)
    for key in (
        "brand_name",
        "accent_color",
        "footer_text",
        "email_footer_text",
        "parent_workspace_id",
    ):
        if key in fields:
            setattr(row, key, fields[key])
    await session.commit()
    await _invalidate_cache(session, workspace_id)


def _validate_logo_bytes(blob: bytes, mime: str) -> None:
    if len(blob) > MAX_LOGO_BYTES:
        raise BrandingValidationError(
            f"Logo exceeds {MAX_LOGO_BYTES} bytes (got {len(blob)})"
        )
    if mime not in ALLOWED_LOGO_MIMES:
        raise BrandingValidationError(
            f"Logo MIME must be one of {sorted(ALLOWED_LOGO_MIMES)} (got {mime!r})"
        )
    # Magic-byte sniffing (defense in depth — clients can lie about Content-Type).
    if mime == "image/png":
        if not blob.startswith(b"\x89PNG"):
            raise BrandingValidationError("Declared image/png but bytes are not PNG")
    elif mime == "image/jpeg":
        if not blob.startswith(b"\xff\xd8\xff"):
            raise BrandingValidationError("Declared image/jpeg but bytes are not JPEG")
    elif mime == "image/svg+xml":
        # Simple XSS guard — reject any inline <script> tag.
        if b"<script" in blob.lower():
            raise BrandingValidationError("SVG with <script> is not allowed")


async def upload_logo(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    blob: bytes,
    mime: str,
) -> None:
    await _require_agency_or_enterprise(session, workspace_id)
    _validate_logo_bytes(blob, mime)
    row = await _upsert_row(session, workspace_id)
    row.logo_blob = blob
    row.logo_mime = mime
    await session.commit()
    await _invalidate_cache(session, workspace_id)


async def delete_logo(
    session: AsyncSession, workspace_id: uuid.UUID
) -> None:
    await _require_agency_or_enterprise(session, workspace_id)
    row = await _get_row(session, workspace_id)
    if row is None:
        return
    row.logo_blob = None
    row.logo_mime = None
    await session.commit()
    await _invalidate_cache(session, workspace_id)


async def get_logo(
    session: AsyncSession, workspace_id: uuid.UUID
) -> tuple[bytes, str] | None:
    """Resolve logo bytes for the workspace, walking the parent chain like
    ``get_effective`` does. Returns None if no logo anywhere up the chain.
    """
    own = await _get_row(session, workspace_id)
    if own is not None and own.logo_blob and own.logo_mime:
        return own.logo_blob, own.logo_mime
    if own is not None and own.parent_workspace_id is not None:
        parent = await _get_row(session, own.parent_workspace_id)
        if parent is not None and parent.logo_blob and parent.logo_mime:
            return parent.logo_blob, parent.logo_mime
    return None
