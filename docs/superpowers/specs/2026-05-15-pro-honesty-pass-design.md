# Pro Tier Honesty Pass — Design

**Date:** 2026-05-15
**Owner:** Backend (with small frontend touch)
**Status:** Approved (verbal)
**Scope:** Close all "advertised but not actually working" gaps in the Pro tier marketing claims so the price sheet stops lying. Single ship for the Pro launch.

## Why

The feature audit (`2026-05-15` ship-readiness review) found four Pro-tier marketing claims with no working implementation:

1. **Peer pool reputation-weighted rotation with hourly health-check + auto-deactivate <0.3** — `peer_inboxes.reputation_score` column exists but no recompute task is scheduled.
2. **Webhook alerts** — `NotificationSetting` model supports a `webhook` channel; events queue but never POST.
3. **History retention** — `warmup_logs` never get purged; disk cost grows forever, retention claim is unenforced.
4. **Spam-rescue** — `imap_watcher.py` exposes `mark_seen`, `mark_flagged`, `move_to_inbox` but they are never called by the peer-action pipeline.

Closing these four is a single coherent unit of work — all needed for Pro to launch with honest marketing. Slack and Postmaster + SNDS are deliberately deferred to later sub-projects.

## Deliverables

### D1 · Peer hourly health-check task
New Celery beat task `tasks/peer_health_check.py`. Hourly. For each active peer inbox:
- Compute `score = signal_24h / max(1, signal_24h + bounce_24h)` from `warmup_logs` rows.
- If `score < 0.3` and peer has had ≥6 hours of data, set `is_active=false` and write an audit row.
- Else update `reputation_score` and `reputation_score_updated_at`.
- Day-0 peers (no data yet) are exempt — default score stays 1.0 until 6h of data exist.

### D2 · Webhook dispatcher
- New model `webhooks` (`backend/app/db/models/webhooks.py`): `id`, `workspace_id` (FK), `url`, `secret` (Fernet-encrypted), `events` (JSON array), `is_active`, `created_at`, `last_delivery_at`, `last_status`.
- New service `services/webhook_dispatcher.py`: `send(webhook, event, payload)`. Computes `X-WarmPulse-Signature: sha256=...` HMAC, POSTs JSON, retries with exponential backoff (1m → 5m → 30m → dead-letter).
- SSRF defense: reject URLs resolving to private IP ranges or loopback before each send.
- Rate limit: 1000 deliveries per workspace per hour.
- New `webhook_deliveries` audit table records every attempt (success or dead-lettered).
- Modify `services/notifications_dispatch.py` so when an event fires, the dispatcher fans out to all matching active webhooks.
- API: `GET/POST /api/workspace/webhooks`, `DELETE /api/workspace/webhooks/{id}`, `POST /api/workspace/webhooks/{id}/test`.
- UI: extend the **Settings → Integrations** tab with a "Webhooks" subsection (URL input, event multi-checkbox, copy-secret button, fire-test button).

### D3 · History purge task
New Celery beat task `tasks/history_purge.py`. Daily at 00:30 UTC. For each workspace:
- `cutoff = now - plan.capabilities.retention_days`
- `DELETE FROM warmup_logs WHERE workspace_id = :ws AND created_at < :cutoff`
- Audit row: `"purged N warmup_log rows older than {cutoff}"`.

### D4 · Spam-rescue wiring
Modify `tasks/peer_actions.py` so that when a planned engagement action is `spam_rescued`, the task:
- Opens an IMAP connection to the peer mailbox using `services/crypto.FernetService` to decrypt creds.
- Calls `imap_watcher.find_in_spam(mailbox_email, subject_substr)` to locate the warmup message.
- If found: `mark_flagged(uid)` + `move_to_inbox(uid)`.
- Writes `WarmupLog(direction=inbound, action=spam_rescued, result=ok)` row.
- On failure: log + bump peer's bounce counter (so the health-check picks it up next hour).

## Migration

`backend/alembic/versions/0015_pro_honesty.py`:
- Create `webhooks` table.
- Create `webhook_deliveries` table.
- Update existing `plans.capabilities` JSON for the seeded rows to include `retention_days`:
  - free: 1, starter: 7, pro: 90, pro_plus: 90, agency: 365, enterprise: 365.
- Add `peer_inboxes.reputation_score_updated_at` (timestamp, nullable) for the health-check task.

## Beat schedule changes

In `backend/app/celerybeat_schedule.py` (or `celery_app.py` — wherever the schedule dict lives):
- Add `peer-health-hourly` → `app.tasks.peer_health_check.tick`, crontab `0 * * * *`.
- Add `history-purge-daily` → `app.tasks.history_purge.tick`, crontab `30 0 * * *`.
- (Existing `peer-rotation-hourly` in CLAUDE.md may already be the same task name — implementer should check and either rename or replace cleanly.)

## Data flow summaries

**Webhook dispatch:**
```
event fires → notifications_dispatch.fire(event, payload)
  → query webhooks where ws_id=X and event in webhooks.events and is_active
  → for each: webhook_dispatcher.send(webhook, event, payload)
      POST {url} body=JSON header=X-WarmPulse-Signature: sha256={hmac}
      → 2xx: webhook_deliveries(status=ok, attempt=N)
      → 4xx/5xx/timeout: schedule retry +1m, +5m, +30m
      → after 3 retries: webhook_deliveries(status=dead_letter)
```

**Spam-rescue:**
```
peer_actions.execute(peer, mailbox, action='spam_rescued', subject)
  → creds = FernetService.decrypt(peer.imap_credentials)
  → with imap_watcher.session(creds) as box:
      uid = box.find_in_spam(mailbox.email, subject)
      if uid:
        box.mark_flagged(uid)
        box.move_to_inbox(uid)
        WarmupLog(action=spam_rescued, result=ok)
```

## Out of scope (deferred)

- **Slack-specific delivery** → sub-project 5. The dispatcher is plain HTTP POST. A Slack incoming webhook URL works because Slack accepts plain POST, but no Slack-specific OAuth/channel-picker here.
- **Postmaster + SNDS ingest** → sub-project 3.
- **Per-workspace retention overrides** beyond the plan default → enterprise tier later.
- **Webhook delivery-replay UI** → just the dead-letter table for v1.
- **Visual peer health-score UI** → admin already has peer admin tab; no client-facing view here.

## Verification

- `cd backend && pytest tests/test_pro_honesty_tasks.py tests/test_webhook_dispatcher.py -x` — green.
- `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no new errors.
- Manual: register a webhook against webhook.site, pause a mailbox in the admin panel, confirm a ping with valid HMAC arrives.
- Manual: set a workspace's plan to free (1-day retention), seed a 2-day-old warmup_log row, run the purge task by hand, confirm the row is gone.
- Manual: simulate a peer with 24h of bounce-only history, run the health-check, confirm `is_active=false`.

## Risk

| Risk | Mitigation |
|---|---|
| SSRF via webhook URL | IP-range blocklist check before each send; tested for IPv4 + IPv6 |
| History purge is destructive | Audit row per batch; first run with `--dry-run` flag; monitor row counts in a stat |
| Peer mass-deactivation on first run | Day-0 + 6-hour-data-required guards |
| Webhook secret leak | Stored Fernet-encrypted; never logged; only exposed once at creation via copy button |
| Spam-rescue burns IMAP login attempts on misconfigured peers | Cache failed-auth state per peer for 1 hour, skip until next health-check |

## File touch list

- **Add** (8 files): 2 tasks · 1 service · 1 model · 1 migration · 1 backend test file · 1 frontend webhooks subsection (or inline) · 1 dispatcher test file
- **Modify** (4 files): `tasks/peer_actions.py` · `services/notifications_dispatch.py` · `celerybeat schedule` · `ProSettings.tsx` Integrations tab
- **Frontend** (2 files): `features/settings/api.ts` adds 4 webhook hooks · `ProSettings.tsx` integrations subsection

## Estimated effort
1–1.5 weeks if serial. ~3 hours parallel via 3 focused subagents.
