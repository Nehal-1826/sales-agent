"""Celery Beat schedule for the warmup engine.

Five recurring jobs:
    - warmup-outbound-every-15min : schedule_warmup_cycle    (default queue)
    - warmup-inbound-every-15min  : schedule_inbound_cycle   (default queue)
    - peer-rotation-hourly        : hourly_peer_health_check (default queue)
    - ramp-advance-daily          : advance_all_mailboxes    (default queue, 00:00 UTC)
    - daily-rollup                : rollup_yesterday         (default queue, 00:05 UTC)

All beat jobs land on ``default``; the fan-out tasks they enqueue push
per-mailbox SMTP work onto the ``smtp`` queue.
"""
from __future__ import annotations

from celery.schedules import crontab

beat_schedule: dict = {
    "warmup-outbound-every-15min": {
        "task": "app.tasks.warmup_send.schedule_warmup_cycle",
        "schedule": 15 * 60,
    },
    "warmup-inbound-every-3min": {
        "task": "app.tasks.warmup_receive.schedule_inbound_cycle",
        "schedule": 3 * 60,
    },
    # Engage on the client's own connected Gmail mailbox via the Gmail API:
    # rescue peer warmup mail from Spam, mark read, star, apply WarmPulse label.
    # Counterpart to the IMAP-based peer engagement above (uses gmail.modify /
    # gmail.labels). See tasks/client_engagement.
    "client-gmail-engagement-every-10min": {
        "task": "app.tasks.client_engagement.schedule_client_engagement_cycle",
        "schedule": 10 * 60,
    },
    # Replaced by ``peer-health-hourly`` below (Pro Honesty Pass D1).
    # The new task uses the explicit signal/(signal+bounce) ratio and the
    # ``peer_inboxes.reputation_score_updated_at`` sentinel rather than the
    # creation-time grace window used by ``peer_actions.hourly_peer_health_check``.
    "peer-health-hourly": {
        "task": "app.tasks.peer_health_check.tick",
        "schedule": crontab(minute=0),
    },
    "history-purge-daily": {
        "task": "app.tasks.history_purge.tick",
        "schedule": crontab(minute=30, hour=0),
    },
    "ramp-advance-daily": {
        "task": "app.tasks.ramp_advance.advance_all_mailboxes",
        "schedule": crontab(minute=0, hour=0),
    },
    # Reset every peer's per-day send budget. Without this, ``used_today``
    # accumulates as a lifetime total and peers fall out of rotation forever
    # the moment they cross ``daily_capacity`` (see peer_counter_reset docstring).
    "peer-counter-reset-daily": {
        "task": "app.tasks.peer_counter_reset.reset_used_today",
        "schedule": crontab(minute=1, hour=0),
    },
    "daily-rollup": {
        "task": "app.tasks.daily_rollup.rollup_yesterday",
        "schedule": crontab(minute=5, hour=0),
    },
    "alert-check-hourly": {
        "task": "app.tasks.alert_check.scan_and_dispatch",
        "schedule": crontab(minute=10),
    },
    "beat-heartbeat-1min": {
        "task": "app.tasks.beat_heartbeat.tick",
        "schedule": 60.0,
    },
    # ─── CRM email-sequence automation ───────────────────────────────
    "crm-sequences-every-5min": {
        "task": "app.tasks.crm_sequence_tick.tick",
        "schedule": 5 * 60,
    },
    # IMAP-scan sending mailboxes for prospect replies to sequence sends, so
    # reply_rate auto-populates in campaign analytics.
    "crm-reply-scan-every-10min": {
        "task": "app.tasks.crm_reply_scan.tick",
        "schedule": 10 * 60,
    },
    # Auto-import leads for workspaces with auto_crm_enabled=True.
    "crm-auto-import-hourly": {
        "task": "app.tasks.crm_auto_import.tick",
        "schedule": 3600.0,
    },
    # Capture cold inbound enquiries from mailbox INBOXes as CRM leads
    # (auto_crm_enabled workspaces, Pro Plus / Agency). Incremental via a
    # per-mailbox UID watermark, so the 30-min cadence is cheap.
    "crm-inbound-capture-every-30min": {
        "task": "app.tasks.crm_inbound_capture.tick",
        "schedule": 30 * 60,
    },
    # ─── Pro Plus: external reputation ingest ────────────────────────
    "postmaster-ingest-daily": {
        "task": "app.tasks.postmaster_ingest.tick",
        "schedule": crontab(minute=0, hour=3),
    },
    "snds-ingest-daily": {
        "task": "app.tasks.snds_ingest.tick",
        "schedule": crontab(minute=30, hour=3),
    },
    # ─── Billing (dummy gateway) ─────────────────────────────────────
    # Renewal reminder ~3 days before next_billing_date (everyone).
    "billing-reminder-daily": {
        "task": "app.tasks.billing_reminder.tick",
        "schedule": crontab(minute=15, hour=0),
    },
    # Auto-renew: dummy-charge auto_pay users whose plan is due.
    "billing-auto-renew-daily": {
        "task": "app.tasks.billing_renew.tick",
        "schedule": crontab(minute=20, hour=0),
    },
}
