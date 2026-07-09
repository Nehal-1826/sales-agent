"""One-off backfill: align every workspace's auto_crm_enabled with its plan.

Automated CRM (Sent-folder import + sequence auto-enrol) is a Pro Plus /
Agency / Enterprise capability; below Pro Plus CRM is manual. This walks all
existing workspaces, resolves the owner's plan, and sets auto_crm_enabled to
match — turning auto-CRM ON for qualifying workspaces and OFF for the rest.

Run once in the prod container (avoids the alembic multi-head trap):
    docker compose exec -T api python _backfill_auto_crm.py
Idempotent — safe to re-run.
"""
import asyncio
import sys

from sqlalchemy import select

from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.models.workspace_settings import WorkspaceSetting
from app.db.session import SessionLocal as AsyncSessionLocal
from app.services.crm_service import crm_auto_enabled_for_plan

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


async def main() -> None:
    async with AsyncSessionLocal() as s:
        # Owner per workspace = earliest-created user; carry its plan name.
        rows = (
            await s.execute(
                select(
                    User.workspace_id,
                    Plan.name,
                    User.created_at,
                )
                .outerjoin(Plan, Plan.id == User.plan_id)
                .order_by(User.workspace_id, User.created_at.asc())
            )
        ).all()

        # First row per workspace_id is the owner (created_at ascending).
        owner_plan: dict = {}
        for ws_id, plan_name, _created in rows:
            if ws_id not in owner_plan:
                owner_plan[ws_id] = plan_name

        on = off = created = 0
        for ws_id, plan_name in owner_plan.items():
            enabled = crm_auto_enabled_for_plan(plan_name)
            row = await s.get(WorkspaceSetting, ws_id)
            if row is None:
                s.add(WorkspaceSetting(workspace_id=ws_id, auto_crm_enabled=enabled))
                created += 1
            else:
                row.auto_crm_enabled = enabled
            if enabled:
                on += 1
            else:
                off += 1

        await s.commit()
        print(
            f"backfill_auto_crm: {len(owner_plan)} workspaces — "
            f"auto ON={on}, manual OFF={off}, settings-rows-created={created}"
        )


if __name__ == "__main__":
    asyncio.run(main())
