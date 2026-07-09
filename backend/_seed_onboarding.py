"""One-off seed: complete onboarding for every client user.

Run from backend/:  python _seed_onboarding.py

For each of the 4 plan clients it creates:
  * N connected mailboxes (N scaled to the plan), all DNS-valid + warming
  * a shared system peer-inbox network (so warmup_logs can FK to a peer)
  * 30 days of daily_metrics per mailbox (a realistic ramp curve)
  * ~48h of recent warmup_logs per mailbox (sent/opened/replied/starred)

DNS flags are set valid on every mailbox so the app-wide DNS gate does
NOT lock these accounts out. Idempotent-ish: it wipes mailboxes / logs /
metrics for the 4 client workspaces first, then reseeds.
"""
from __future__ import annotations

import asyncio
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text

from app.db.models.daily_metrics import DailyMetric
from app.db.models.mailboxes import (
    ContentMode,
    Mailbox,
    MailboxProvider,
    WarmupStatus,
)
from app.db.models.peer_inboxes import PeerInbox, PeerProvider
from app.db.models.users import User
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.session import SessionLocal as AsyncSessionLocal

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

random.seed(42)

# email -> (mailbox count, daily_target, base provider list)
PLAN_SETUP = {
    "starter@warmpulse.dev": (1, 30, [MailboxProvider.gmail]),
    "pro@warmpulse.dev": (3, 50, [MailboxProvider.gmail, MailboxProvider.outlook, MailboxProvider.smtp]),
    "proplus@warmpulse.dev": (3, 75, [MailboxProvider.gmail, MailboxProvider.outlook, MailboxProvider.smtp]),
    "agency@warmpulse.dev": (5, 100, [
        MailboxProvider.gmail, MailboxProvider.outlook, MailboxProvider.smtp,
        MailboxProvider.yahoo, MailboxProvider.gmail,
    ]),
}

PEERS = [
    ("warmnet-01@gmail.com", PeerProvider.google_ws),
    ("warmnet-02@outlook.com", PeerProvider.office365),
    ("warmnet-03@yahoo.com", PeerProvider.yahoo),
    ("warmnet-04@gmail.com", PeerProvider.google_ws),
    ("warmnet-05@outlook.com", PeerProvider.office365),
]


async def main() -> None:
    async with AsyncSessionLocal() as s:
        users = (
            await s.execute(select(User).where(User.email.in_(PLAN_SETUP.keys())))
        ).scalars().all()
        if not users:
            print("!! no client users found — run _seed_users.py first")
            return
        ws_ids = [u.workspace_id for u in users]

        # --- wipe prior data for these workspaces --------------------------
        await s.execute(
            text(
                "DELETE FROM warmup_logs WHERE mailbox_id IN "
                "(SELECT id FROM mailboxes WHERE workspace_id = ANY(:w))"
            ).bindparams(w=ws_ids)
        )
        await s.execute(
            text(
                "DELETE FROM daily_metrics WHERE mailbox_id IN "
                "(SELECT id FROM mailboxes WHERE workspace_id = ANY(:w))"
            ).bindparams(w=ws_ids)
        )
        await s.execute(
            text("DELETE FROM mailboxes WHERE workspace_id = ANY(:w)").bindparams(w=ws_ids)
        )
        await s.flush()

        # --- ensure the peer network exists --------------------------------
        existing_peers = (await s.execute(select(PeerInbox))).scalars().all()
        if not existing_peers:
            peer_rows = []
            for email, prov in PEERS:
                p = PeerInbox(
                    email_address=email,
                    provider=prov,
                    reputation_score=round(random.uniform(0.78, 0.97), 3),
                    daily_capacity=80,
                    used_today=random.randint(5, 40),
                    is_active=True,
                    is_seed=True,
                    last_used_at=datetime.now(UTC) - timedelta(minutes=random.randint(2, 90)),
                    reputation_score_updated_at=datetime.now(UTC),
                )
                s.add(p)
                peer_rows.append(p)
            await s.flush()
        else:
            peer_rows = existing_peers
        peer_ids = [p.id for p in peer_rows]

        today = datetime.now(UTC).date()
        total_mb = 0
        total_logs = 0

        for u in users:
            count, target, providers = PLAN_SETUP[u.email]
            local = u.email.split("@")[0]
            for i in range(count):
                prov = providers[i % len(providers)]
                domain = (
                    "gmail.com" if prov == MailboxProvider.gmail
                    else "outlook.com" if prov == MailboxProvider.outlook
                    else "yahoo.com" if prov == MailboxProvider.yahoo
                    else f"{local}corp.com"
                )
                addr = f"{local}{'' if i == 0 else f'+{i}'}@{domain}"
                # mid-ramp: day ~22, warmth high-but-climbing
                current_day = random.randint(18, 28)
                warmth = round(random.uniform(68, 91), 1)
                mb = Mailbox(
                    user_id=u.id,
                    workspace_id=u.workspace_id,
                    email_address=addr,
                    provider=prov,
                    smtp_host=None if prov in (MailboxProvider.gmail,) else "smtp.example.com",
                    smtp_port=None if prov in (MailboxProvider.gmail,) else 587,
                    smtp_username=None if prov in (MailboxProvider.gmail,) else addr,
                    spf_valid=True,
                    dkim_valid=True,
                    dmarc_valid=True,
                    warmup_status=WarmupStatus.active,
                    daily_target=target,
                    current_day=current_day,
                    warmth_score=warmth,
                    content_mode=ContentMode.A,
                    is_paused=False,
                )
                s.add(mb)
                await s.flush()  # need mb.id
                total_mb += 1

                # --- 30 days of daily_metrics (ramp curve) -----------------
                for d in range(30, 0, -1):
                    day = today - timedelta(days=d)
                    ramp_day = max(1, current_day - d + 5)
                    sent = min(target, 5 + ramp_day * 2 + random.randint(-3, 3))
                    sent = max(3, sent)
                    received = int(sent * random.uniform(0.85, 1.0))
                    opens = int(received * random.uniform(0.55, 0.8))
                    replies = int(received * random.uniform(0.15, 0.35))
                    rescues = random.randint(0, 2)
                    bounces = random.randint(0, 1)
                    placement = round(random.uniform(82, 97), 1)
                    w = round(min(95, 45 + (30 - d) * 1.4 + random.uniform(-3, 3)), 1)
                    s.add(
                        DailyMetric(
                            mailbox_id=mb.id,
                            date=day,
                            emails_sent=sent,
                            emails_received=received,
                            opens=opens,
                            replies=replies,
                            spam_rescues=rescues,
                            bounce_count=bounces,
                            inbox_placement_pct=placement,
                            warmth_score=w,
                        )
                    )

                # --- recent warmup_logs (last 48h) -------------------------
                now = datetime.now(UTC)
                for _ in range(random.randint(30, 60)):
                    ts = now - timedelta(minutes=random.randint(1, 60 * 48))
                    action = random.choices(
                        [
                            WarmupAction.sent,
                            WarmupAction.opened,
                            WarmupAction.replied,
                            WarmupAction.starred,
                            WarmupAction.spam_rescued,
                        ],
                        weights=[40, 30, 15, 10, 5],
                    )[0]
                    direction = (
                        WarmupDirection.outbound
                        if action == WarmupAction.sent
                        else WarmupDirection.inbound
                    )
                    log = WarmupLog(
                        mailbox_id=mb.id,
                        peer_inbox_id=random.choice(peer_ids),
                        direction=direction,
                        action=action,
                        message_id=f"<{uuid.uuid4()}@warmpulse>",
                        subject_snippet=random.choice([
                            "Quick question about your roadmap",
                            "Following up on last week",
                            "Re: intro + next steps",
                            "Thoughts on the proposal?",
                            "Checking in",
                        ]),
                    )
                    log.created_at = ts
                    s.add(log)
                    total_logs += 1

        await s.commit()

    print("=== Onboarding completed for all clients ===")
    print(f"  mailboxes created : {total_mb}")
    print(f"  warmup_logs seeded: {total_logs}")
    print(f"  peer inboxes      : {len(peer_ids)}")
    for email, (n, tgt, _) in PLAN_SETUP.items():
        print(f"  {email:26s} {n} mailbox(es) · {tgt}/day target · DNS valid · warming")


asyncio.run(main())
