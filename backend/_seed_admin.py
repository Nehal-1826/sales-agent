import asyncio
import sys
import uuid

from sqlalchemy import select

from app.db.models.users import OnboardingStatus, User, UserRole
from app.db.session import SessionLocal as AsyncSessionLocal
from app.services.security import hash_password

# psycopg async requires SelectorEventLoop on Windows (not the default ProactorEventLoop)
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

EMAIL = "admin@warmpulse.app"
PASSWORD = "Admin@12345"


async def main() -> None:
    async with AsyncSessionLocal() as s:
        existing = (
            await s.execute(select(User).where(User.email == EMAIL))
        ).scalar_one_or_none()
        if existing:
            existing.hashed_password = hash_password(PASSWORD)
            existing.role = UserRole.super_admin
            existing.onboarding_status = OnboardingStatus.active
            existing.is_suspended = False
            action = "updated"
        else:
            s.add(
                User(
                    email=EMAIL,
                    hashed_password=hash_password(PASSWORD),
                    role=UserRole.super_admin,
                    onboarding_status=OnboardingStatus.active,
                    display_name="Admin",
                    workspace_id=uuid.uuid4(),
                )
            )
            action = "created"
        await s.commit()
    print(f"{action} admin: {EMAIL}")
    print(f"password: {PASSWORD}")


asyncio.run(main())
