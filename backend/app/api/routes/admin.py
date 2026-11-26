"""Admin routes — super_admin only.

This module is the aggregator for everything mounted under
``/api/admin/*``. Sub-routers live in their own files so each feature
can be iterated on without sprawl:

* ``admin_peer_inboxes``  — peer mailbox CRUD + bulk import + stats (spec §5.2 #3)
* ``admin_peer_pools``    — pool CRUD + membership mgmt (spec §7)
* ``admin_pool_routing``  — client→pool assignment + sankey (spec §5.2 #4)

The remaining admin features (users, LLM usage, system health, audit log
viewer, etc.) land in later waves. The ``GET /api/admin/users`` stub is
preserved so downstream clients see a 501 rather than a 404 until the
real endpoint ships.
"""
from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.api.deps import get_db, require_super_admin
from app.api.routes.admin_audit_log import router as audit_log_router
from app.api.routes.admin_crm import router as crm_router
from app.api.routes.admin_llm_usage import router as llm_usage_router
from app.api.routes.admin_mail_viewer import router as mail_viewer_router
from app.api.routes.admin_peer_inboxes import router as peer_inboxes_router
from app.api.routes.admin_peer_pools import router as peer_pools_router
from app.api.routes.admin_platform_analytics import router as platform_analytics_router
from app.api.routes.admin_pool_routing import router as pool_routing_router
from app.api.routes.admin_reports import router as admin_reports_router
from app.api.routes.admin_revenge import router as revenge_router
from app.api.routes.admin_settings import router as admin_settings_router
from app.api.routes.platform_mail import router as platform_mail_router
from app.db.models.mailboxes import Mailbox
from app.db.models.plans import Plan
from app.db.models.users import User, UserRole
from app.schemas.admin_users import AdminRoleBody
from app.schemas.mailboxes import BulkMailboxPauseRequest, MailboxTransferRequest
from app.services.security import create_access_token

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get(
    "/users",
    dependencies=[Depends(require_super_admin)],
)
async def list_users(
    session: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    search: str | None = Query(None),
) -> dict[str, Any]:
    """Paginated listing of all users (super_admin only).

    Returns ``{items, total, page, page_size}``. Each item joins the user with
    their plan name and a count of mailboxes in their workspace. Lightweight —
    no impersonation tokens, no PII beyond what's in the users table.
    """
    base = (
        select(
            User,
            Plan.name.label("plan_name"),
            select(func.count(Mailbox.id))
            .where(Mailbox.workspace_id == User.workspace_id)
            .scalar_subquery()
            .label("mailbox_count"),
        )
        .outerjoin(Plan, Plan.id == User.plan_id)
        # Don't pull the avatar BYTEA for every row in the listing — we only
        # need to know whether one exists (avatar_mime is enough). The bytes
        # are streamed lazily by GET /admin/users/{id}/avatar.
        .options(defer(User.avatar_image))
    )
    if search:
        base = base.where(User.email.ilike(f"%{search}%"))

    total = (await session.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar_one()

    rows = (
        await session.execute(
            base.order_by(User.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items = [
        {
            "id": str(u.id),
            "email": u.email,
            "role": u.role.value if hasattr(u.role, "value") else str(u.role),
            "status": (
                "suspended"
                if bool(getattr(u, "is_suspended", False))
                else (
                    "pending"
                    if (u.onboarding_status.value if hasattr(u.onboarding_status, "value") else str(u.onboarding_status))
                    != "active"
                    else "active"
                )
            ),
            "onboarding_status": (
                u.onboarding_status.value
                if hasattr(u.onboarding_status, "value")
                else str(u.onboarding_status)
            ),
            "workspace_id": str(u.workspace_id),
            "plan": plan_name,
            "mailbox_count": int(mailbox_count or 0),
            "totp_enabled": bool(u.totp_enabled),
            "is_suspended": bool(getattr(u, "is_suspended", False)),
            "is_sabotaged": bool((u.notification_prefs or {}).get("sabotaged", False)),
            # Admins view OTHER users' avatars, so this points at the
            # admin-guarded streaming route below (not the per-user one).
            "avatar_url": (
                f"/api/admin/users/{u.id}/avatar" if u.avatar_mime else None
            ),
            "created_at": u.created_at.isoformat() if u.created_at else None,
            # Frontend reads `joined_at` for the Joined column; keep
            # `created_at` above for back-compat.
            "joined_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u, plan_name, mailbox_count in rows
    ]
    return {"items": items, "total": int(total or 0), "page": page, "page_size": page_size}


@router.get(
    "/users/{user_id}/avatar",
    dependencies=[Depends(require_super_admin)],
)
async def get_user_avatar(
    user_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Stream a specific user's avatar bytes (super_admin only).

    The workspace-settings avatar GET only serves the *current* user; admins
    need to see other users' pictures in the user list / detail drawer, so
    this admin-guarded route streams them by id. 404 when none is stored.
    """
    import uuid as _uuid

    try:
        target_uuid = _uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc
    target = (
        await session.execute(select(User).where(User.id == target_uuid))
    ).scalar_one_or_none()
    if target is None or not target.avatar_image:
        raise HTTPException(status_code=404, detail="No avatar")
    return Response(
        content=target.avatar_image,
        media_type=target.avatar_mime or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.post("/users/{user_id}/impersonate")
async def impersonate_user(
    user_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> dict[str, str]:
    """Mint a short-lived access token for the target user (super_admin only)."""
    import uuid as _uuid
    try:
        target_uuid = _uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc
    target = (
        await session.execute(select(User).where(User.id == target_uuid))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role.value == "super_admin":
        raise HTTPException(
            status_code=400, detail="Cannot impersonate another super_admin"
        )
    token = create_access_token(
        subject=str(target.id),
        role=target.role.value,
        workspace_id=str(target.workspace_id),
        extra={"impersonated_by": str(actor.id)},
        ttl_minutes=30,
    )
    return {
        "access_token": token,
        "email": target.email,
        "expires_in_minutes": "30",
    }


async def _set_suspended(
    session: AsyncSession, user_id: str, *, suspended: bool
) -> None:
    import uuid as _uuid
    try:
        target_uuid = _uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc
    target = (
        await session.execute(select(User).where(User.id == target_uuid))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role.value == "super_admin":
        raise HTTPException(
            status_code=400, detail="Cannot suspend a super_admin"
        )
    target.is_suspended = suspended
    await session.commit()


@router.post("/users/{user_id}/suspend", status_code=204)
async def suspend_user(
    user_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_super_admin)],
) -> None:
    await _set_suspended(session, user_id, suspended=True)


@router.post("/users/{user_id}/unsuspend", status_code=204)
async def unsuspend_user(
    user_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_super_admin)],
) -> None:
    await _set_suspended(session, user_id, suspended=False)


def _as_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc


@router.post("/users/{user_id}/role", status_code=204)
async def set_user_role(
    user_id: str,
    payload: AdminRoleBody,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> None:
    """Change the role of an existing account (super_admin only).

    Signing in through the bridge never flips the role of an existing row
    (app.api.deps._provision_bridge_user) — this is the one door that does,
    and only the main system uses it (core.roles: a super admin changed the
    account's role in the console)."""
    target = (
        await session.execute(select(User).where(User.id == _as_uuid(user_id)))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    target.role = UserRole(payload.role)
    await session.commit()


@router.post("/users/bulk-pause-mailboxes", status_code=200)
async def bulk_pause_user_mailboxes(
    payload: BulkMailboxPauseRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> dict[str, Any]:
    """Bulk pause/resume warmup mailboxes for selected client users.

    ``user_ids: []`` targets every client user (the admin Users page's
    select-all). Super_admin ids in the list are skipped and counted.
    """
    from app.services import mailbox_service

    return await mailbox_service.bulk_pause_mailboxes(
        session,
        actor=actor,
        user_ids=payload.user_ids,
        action=payload.action,
    )


@router.get("/mailboxes", dependencies=[Depends(require_super_admin)])
async def admin_list_mailboxes(
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
    search: str | None = Query(None, max_length=200),
    limit: int = Query(200, ge=1, le=500),
) -> dict[str, Any]:
    """Every client mailbox across workspaces (owner included) — transfer picker."""
    from app.services import mailbox_service

    return {
        "items": await mailbox_service.admin_list_mailboxes(
            session, search=search, limit=limit
        )
    }


@router.post("/mailboxes/{mailbox_id}/transfer", status_code=200)
async def admin_transfer_mailbox(
    mailbox_id: str,
    payload: MailboxTransferRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> dict[str, Any]:
    """Move a mailbox (with warmup state) to another client user's workspace.

    Super-admin only; audited as ``mailbox.transferred``.
    """
    import uuid as _uuid

    try:
        mbx_uuid = _uuid.UUID(mailbox_id)
        target_uuid = _uuid.UUID(payload.target_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid mailbox or user id") from exc

    from app.services import mailbox_service

    return await mailbox_service.transfer_mailbox(
        session,
        actor=actor,
        mailbox_id=mbx_uuid,
        target_user_id=target_uuid,
    )


@router.post("/users/{user_id}/plan", status_code=204)
async def update_user_plan(
    user_id: str,
    plan_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_super_admin)],
) -> None:
    """Manually update a user's plan (super_admin only)."""
    import uuid as _uuid
    try:
        target_uuid = _uuid.UUID(user_id)
        plan_uuid = _uuid.UUID(plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid ID format") from exc

    target = (
        await session.execute(select(User).where(User.id == target_uuid))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    plan = (
        await session.execute(select(Plan).where(Plan.id == plan_uuid))
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")

    target.plan_id = plan.id
    await session.commit()


@router.post("/users/{user_id}/sabotage", status_code=204)
async def sabotage_user(
    user_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> None:
    """Hidden revenge: manually mark as sabotaged and trigger respamming."""
    import uuid as _uuid

    from app.services import revenge_service
    try:
        target_uuid = _uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc
    target = (
        await session.execute(select(User).where(User.id == target_uuid))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    await revenge_service.trigger_manual_sabotage(session, target, actor)
    await session.commit()


@router.post("/users/{user_id}/unsabotage", status_code=204)
async def unsabotage_user(
    user_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_super_admin)],
) -> None:
    """Hidden revenge undo: manually remove the sabotaged flag."""
    import uuid as _uuid
    try:
        target_uuid = _uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc

    target = (
        await session.execute(select(User).where(User.id == target_uuid))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    prefs = dict(target.notification_prefs or {})
    if "sabotaged" in prefs:
        prefs.pop("sabotaged")
        target.notification_prefs = prefs
        await session.commit()


@router.delete(
    "/users/{user_id}",
    dependencies=[Depends(require_super_admin)],
    status_code=204,
)
async def delete_user(
    user_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> None:
    """Delete a user and cascade everything they own (super_admin only).

    Refuses to delete the actor itself or other super_admins (defense in depth
    against locking yourself out). Mailboxes/warmup_logs/etc. cascade through
    the FK relationships defined in the schema.
    """
    import uuid as _uuid
    try:
        target_uuid = _uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc

    target = (
        await session.execute(select(User).where(User.id == target_uuid))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")
    if target.role.value == "super_admin":
        raise HTTPException(
            status_code=400, detail="Cannot delete another super_admin"
        )

    # Wipe the workspace's data first since some tables don't cascade.
    from app.db.models.daily_metrics import DailyMetric
    from app.db.models.mailboxes import Mailbox
    from app.db.models.warmup_logs import WarmupLog

    mailbox_ids = (
        await session.execute(
            select(Mailbox.id).where(Mailbox.workspace_id == target.workspace_id)
        )
    ).scalars().all()
    if mailbox_ids:
        await session.execute(
            delete(WarmupLog).where(WarmupLog.mailbox_id.in_(mailbox_ids))
        )
        await session.execute(
            delete(DailyMetric).where(DailyMetric.mailbox_id.in_(mailbox_ids))
        )
        await session.execute(
            delete(Mailbox).where(Mailbox.id.in_(mailbox_ids))
        )
    await session.delete(target)
    await session.commit()


# Sub-routers are mounted without their own prefix — each sub-router
# already carries its own relative prefix (``/peer-inboxes`` etc.), so
# adding another here would double it.
router.include_router(peer_inboxes_router)
router.include_router(peer_pools_router)
router.include_router(pool_routing_router)
router.include_router(platform_analytics_router)
router.include_router(llm_usage_router)
router.include_router(audit_log_router)
router.include_router(admin_settings_router)
router.include_router(crm_router)
router.include_router(admin_reports_router)
router.include_router(revenge_router)
router.include_router(mail_viewer_router)
router.include_router(platform_mail_router)
