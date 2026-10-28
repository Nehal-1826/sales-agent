"""Celery app factory. Two queues: ``default`` and ``smtp``.

Run worker:  celery -A app.celery_app worker -Q default,smtp -l info
Run beat:    celery -A app.celery_app beat -l info
"""
from __future__ import annotations

import asyncio
import sys

# Windows: tasks call asyncio.run() and psycopg async refuses to run on the
# default ProactorEventLoop. Set the policy here so every asyncio.run() inside
# a Celery task creates a SelectorEventLoop instead. Must run before tasks fire.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from celery import Celery
from kombu import Queue

from app.celerybeat_schedule import beat_schedule
from app.config import get_settings


def create_celery_app() -> Celery:
    settings = get_settings()
    app = Celery(
        "warmpulse",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
        include=[
            "app.tasks.ping",
            # Warmup engine modules.
            "app.tasks.warmup_send",
            "app.tasks.warmup_receive",
            "app.tasks.client_engagement",
            "app.tasks.peer_actions",
            "app.tasks.ramp_advance",
            "app.tasks.peer_counter_reset",
            "app.tasks.daily_rollup",
            "app.tasks.beat_heartbeat",
            # Pro Honesty Pass background tasks (D1, D3).
            "app.tasks.peer_health_check",
            "app.tasks.history_purge",
            # Placement Tester (Pro Plus).
            "app.tasks.placement_send",
            "app.tasks.placement_poll",
            # CRM email-sequence automation.
            "app.tasks.crm_sequence_tick",
            "app.tasks.crm_reply_scan",
            "app.tasks.crm_auto_import",
            "app.tasks.crm_inbound_capture",
            # Billing (dummy): renewal reminders + auto-renew charges.
            "app.tasks.billing_reminder",
            "app.tasks.billing_renew",
            # Ops signals — beat schedules these hourly/daily; they were
            # missing from this list, so every fire raised KeyError and the
            # task never ran (alerts, postmaster + SNDS feedback loops).
            "app.tasks.alert_check",
            "app.tasks.postmaster_ingest",
            "app.tasks.snds_ingest",
        ],
    )

    app.conf.update(
        task_default_queue="default",
        task_queues=(
            Queue("default"),
            Queue("smtp"),
        ),
        # Route the per-mailbox SMTP sender to the smtp queue. Scheduler, receiver,
        # ramp, and reputation all stay on default. Wave 3's warmup_send /
        # warmup_receive / peer_actions set queue= per-task at decoration
        # time, so no blanket routes are needed here.
        task_routes={
            "app.tasks.warmup_send.send_single_warmup_email": {"queue": "smtp"},
        },
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=1,
        timezone="UTC",
        enable_utc=True,
        beat_schedule=beat_schedule,
    )

    return app


celery_app = create_celery_app()

# Register Wave 3 engine tasks by importing their modules now that celery_app
# exists (those modules do ``from app.celery_app import celery_app`` at module
# level, so the import order matters).
from app.tasks import (  # noqa: E402, F401
    crm_mailbox_import,
    crm_reply_scan,
    crm_sequence_tick,
    daily_rollup,
    history_purge,
    peer_actions,
    peer_counter_reset,
    peer_health_check,
    placement_poll,
    placement_send,
    ramp_advance,
    warmup_receive,
    warmup_send,
    crm_auto_import,
)
