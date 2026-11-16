"""One-off seed: wipe all users and recreate 4 plan-specific clients + 1 admin.

Run from backend/:  python _seed_users.py

Deletes every user and their workspace-scoped dependent rows (mailboxes,
warmup_logs, daily_metrics, payments, audit_logs), then creates:

  starter@warmpulse.dev   → Starter plan
  pro@warmpulse.dev       → Pro plan
  proplus@warmpulse.dev   → Pro Plus plan
  agency@warmpulse.dev    → Agency plan
  admin@warmpulse.app     → super_admin (no plan)

All client accounts land at onboarding_status=active so they log straight
into /app with their tier's dashboard. Password is the same for all.
"""
from __future__ import annotations

import asyncio
import sys
import uuid

from sqlalchemy import delete, select, text

from app.db.models.plans import Plan
from app.db.models.users import OnboardingStatus, User, UserRole
from app.db.session import SessionLocal as AsyncSessionLocal
from app.services.security import hash_password

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

CLIENT_PASSWORD = "Test@12345"
ADMIN_PASSWORD = "Admin@12345"

# (email, display_name, plan-name-in-DB)
CLIENTS = [
    ("starter@warmpulse.dev", "Starter User", "Starter"),
    ("pro@warmpulse.dev", "Pro User", "Pro"),
    ("proplus@warmpulse.dev", "Pro Plus User", "Pro Plus"),
    ("agency@warmpulse.dev", "Agency User", "Agency"),
]
ADMIN_EMAIL = "admin@warmpulse.app"


async def main() -> None:
    async with AsyncSessionLocal() as s:
        # --- 1. Wipe every user + dependent rows ----------------------------
        # Order matters: child rows first, then users. We delete by raw SQL
        # for the tables that may not have ORM cascade wired.
        for tbl in (
            "warmup_logs",
            "daily_metrics",
            "mailboxes",
            "payments",
            "audit_logs",
        ):
            await s.execute(text(f"DELETE FROM {tbl}"))
        await s.execute(delete(User))
        await s.flush()

        # --- 2. Resolve plan ids by name ------------------------------------
        plans = (await s.execute(select(Plan))).scalars().all()
        plan_by_name = {p.name.lower(): p for p in plans}

        # --- 3. Create the 4 plan-specific clients --------------------------
        created: list[tuple[str, str]] = []
        for email, display, plan_name in CLIENTS:
            plan = plan_by_name.get(plan_name.lower())
            if plan is None:
                print(f"!! plan '{plan_name}' not found in DB — skipping {email}")
                continue
            s.add(
                User(
                    email=email,
                    hashed_password=hash_password(CLIENT_PASSWORD),
                    role=UserRole.client,
                    onboarding_status=OnboardingStatus.active,
                    display_name=display,
                    workspace_id=uuid.uuid4(),
                    plan_id=plan.id,
                )
            )
            created.append((email, plan_name))

        # --- 4. Create the admin -------------------------------------------
        s.add(
            User(
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                role=UserRole.super_admin,
                onboarding_status=OnboardingStatus.active,
                display_name="Admin",
                workspace_id=uuid.uuid4(),
            )
        )

        await s.commit()

    print("=== Seeded users ===")
    for email, plan_name in created:
        print(f"  {email:28s} plan={plan_name:10s} pw={CLIENT_PASSWORD}")
    print(f"  {ADMIN_EMAIL:28s} role=super_admin  pw={ADMIN_PASSWORD}")


asyncio.run(main())
