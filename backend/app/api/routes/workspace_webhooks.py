"""Workspace outbound webhooks — register URL + events, fire test, revoke.

Same show-once secret pattern as ``api_keys``: the plaintext secret is
returned exactly once at creation, then never readable again. The DB
column stores a Fernet-encrypted ciphertext.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.audit_logs import AuditLog
from app.db.models.users import User
from app.db.models.webhooks import Webhook, WebhookDelivery
from app.db.session import get_db
from app.services.crypto import get_fernet_service
from app.services.webhook_dispatcher import send as webhook_send

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace/webhooks", tags=["workspace-webhooks"])


# Mirror the event matrix from workspace_settings so the UI options stay
# consistent. Future events should be added here AND in the user-level
# notification_prefs default list.
_ALLOWED_EVENTS: set[str] = {
    "mailbox_paused",
    "bounce_spike",
    "peer_failed",
    "weekly_digest",
    "invoice_paid",
    "invoice_failed",
    "member_invited",
    "product_updates",
}


# --------------------------------------------------------------------------- #
# Schemas                                                                      #
# --------------------------------------------------------------------------- #


class WebhookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    events: list[str]
    is_active: bool
    created_at: datetime
    last_delivery_at: datetime | None = None
    last_status: str | None = None


class WebhookCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=2048)
    events: list[str] = Field(min_length=1)


class WebhookCreateResponse(WebhookOut):
    """Same fields as ``WebhookOut`` plus the plaintext secret (shown once)."""

    secret: str


class WebhookDeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    webhook_id: uuid.UUID
    event: str
    attempt: int
    status: str
    response_code: int | None
    error_text: str | None
    created_at: datetime


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


def _to_out(w: Webhook) -> WebhookOut:
    return WebhookOut(
        id=w.id,
        url=w.url,
        events=list(w.events or []),
        is_active=w.is_active,
        created_at=w.created_at,
        last_delivery_at=w.last_delivery_at,
        last_status=w.last_status,
    )


async def _write_audit(
    session: AsyncSession,
    *,
    actor: User,
    action: str,
    target_id: uuid.UUID,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor.id,
        actor_role=actor.role.value if hasattr(actor.role, "value") else str(actor.role),
        action=action,
        target_type="webhook",
        target_id=target_id,
        payload=payload,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover
        logger.warning("webhook audit write failed action=%s: %s", action, exc)


async def _load_or_404(
    session: AsyncSession, webhook_id: uuid.UUID, workspace_id: uuid.UUID
) -> Webhook:
    w = await session.get(Webhook, webhook_id)
    if w is None or w.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return w


# --------------------------------------------------------------------------- #
# Routes                                                                       #
# --------------------------------------------------------------------------- #


@router.get("", response_model=list[WebhookOut])
async def list_webhooks(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[WebhookOut]:
    rows = (
        await session.execute(
            select(Webhook)
            .where(Webhook.workspace_id == user.workspace_id)
            .order_by(Webhook.created_at.desc())
        )
    ).scalars().all()
    return [_to_out(w) for w in rows]


@router.post("", response_model=WebhookCreateResponse, status_code=201)
async def create_webhook(
    payload: WebhookCreatePayload,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WebhookCreateResponse:
    bad = [e for e in payload.events if e not in _ALLOWED_EVENTS]
    if bad:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown event keys: {bad}",
        )

    # Server-generated secret — shown once, encrypted at rest.
    secret = "whsec_" + secrets.token_urlsafe(32)
    fernet = get_fernet_service()
    encrypted = fernet.encrypt(secret.encode("utf-8"))

    webhook = Webhook(
        workspace_id=user.workspace_id,
        url=payload.url,
        secret_encrypted=encrypted,
        events=list(payload.events),
        is_active=True,
    )
    session.add(webhook)
    await session.flush()
    await _write_audit(
        session,
        actor=user,
        action="webhook.created",
        target_id=webhook.id,
        payload={"url": webhook.url, "events": list(webhook.events)},
    )
    await session.commit()
    await session.refresh(webhook)

    out = _to_out(webhook)
    return WebhookCreateResponse(**out.model_dump(), secret=secret)


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    w = await _load_or_404(session, webhook_id, user.workspace_id)
    w.is_active = False
    await _write_audit(
        session,
        actor=user,
        action="webhook.revoked",
        target_id=w.id,
        payload={"url": w.url},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{webhook_id}/test", response_model=WebhookDeliveryOut)
async def fire_test_webhook(
    webhook_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WebhookDeliveryOut:
    w = await _load_or_404(session, webhook_id, user.workspace_id)
    if not w.is_active:
        raise HTTPException(status_code=400, detail="Webhook is revoked")

    delivery = await webhook_send(
        w,
        "test",
        {"ok": True, "fired_by": str(user.id)},
        attempt=1,
        session=session,
    )
    await _write_audit(
        session,
        actor=user,
        action="webhook.test_fired",
        target_id=w.id,
        payload={"delivery_id": str(delivery.id), "status": delivery.status},
    )
    await session.commit()
    return WebhookDeliveryOut.model_validate(delivery)


__all__ = ["router"]
