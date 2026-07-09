"""One-shot controlled warmup send for manual auto-open/reply testing.

Mirrors tasks.warmup_send._send_impl exactly, but PINS the peer instead of
letting pick_peer_inbox choose. Sender + recipient are passed by email address.

Usage (inside the worker/api container):
    python scripts/test_send_one.py noreply@ijrnexus.com dvshrdd@gmail.com
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.config import get_settings
from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.users import User
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.session import SessionLocal
from app.services.crypto import get_fernet_service
from app.services.warmup.content_factory import get_content_generator
from app.services.warmup.smtp_sender import send_email


async def main(sender_email: str, recipient_email: str) -> None:
    fernet = get_fernet_service()
    async with SessionLocal() as db:
        mailbox = (
            await db.scalars(
                select(Mailbox).where(Mailbox.email_address == sender_email)
            )
        ).first()
        if mailbox is None:
            print(f"FAIL: sender mailbox {sender_email!r} not found")
            return

        peer = (
            await db.scalars(
                select(PeerInbox).where(PeerInbox.email_address == recipient_email)
            )
        ).first()
        if peer is None:
            print(f"FAIL: peer {recipient_email!r} not found")
            return

        owner = (
            await db.scalars(
                select(User).where(User.workspace_id == mailbox.workspace_id).limit(1)
            )
        ).first()

        from app.services.llm.provider import LLMError as _LLMError
        from app.services.warmup.content import StaticTemplateGenerator as _Static

        generator = get_content_generator(get_settings())
        try:
            content = await generator.generate_thread_message(
                mode=mailbox.content_mode.value,
                prior_messages=[],
                sender_name=mailbox.email_address.split("@", 1)[0],
                recipient_name=peer.email_address.split("@", 1)[0],
                db=db,
                user_id=(owner.id if owner is not None else None),
                mailbox_id=mailbox.id,
            )
            gen = "llm"
        except _LLMError:
            content = await _Static().generate_thread_message(
                mode=mailbox.content_mode.value,
                prior_messages=[],
                sender_name=mailbox.email_address.split("@", 1)[0],
                recipient_name=peer.email_address.split("@", 1)[0],
            )
            gen = "static-fallback"

        warmup_id = str(uuid.uuid4())
        await send_email(
            mailbox=mailbox,
            peer=peer,
            subject=content["subject"],
            body=content["body_text"],
            is_html=content["is_html"],
            fernet=fernet,
            warmup_id=warmup_id,
        )

        db.add(
            WarmupLog(
                mailbox_id=mailbox.id,
                peer_inbox_id=peer.id,
                direction=WarmupDirection.outbound,
                action=WarmupAction.sent,
                message_id=warmup_id,
                subject_snippet=content["subject"][:512],
            )
        )
        peer.used_today = (peer.used_today or 0) + 1
        peer.last_used_at = datetime.now(UTC)
        await db.commit()

        print("SENT OK")
        print(f"  from        : {mailbox.email_address}  (mailbox {mailbox.id})")
        print(f"  to (peer)   : {peer.email_address}  (peer {peer.id})")
        print(f"  warmup_id   : {warmup_id}")
        print(f"  subject     : {content['subject']}")
        print(f"  content gen : {gen}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
