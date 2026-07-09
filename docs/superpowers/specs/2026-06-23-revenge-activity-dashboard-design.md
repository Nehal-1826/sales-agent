# Revenge Activity Dashboard — Design

**Date:** 2026-06-23
**Status:** Approved (design), pending spec review
**Author:** Shailog + Claude

## Context

WarmPulse has a hidden "revenge" feature: when a user cancels within 2h of paying
(auto) or an admin clicks Sabotage (manual), the user is flagged
`notification_prefs.sabotaged = true` and `revenge.respam_user_emails` moves their
sent warmup mail into the peer network's Spam folders. The warmup engine is now
sabotage-aware (commit `68f41fd`) so the re-spam holds.

Today there is **no visibility** into this: runs are fire-and-forget Celery tasks,
the `moved_count` result dict is discarded, and the only way to know a run happened
is to read worker logs or query `warmup_logs` by hand. We want an admin dashboard
to see who is sabotaged, what each revenge run did, and to re-run / undo.

This is a semester project; all mailboxes are owned by the author. The feature is
intentionally not for release.

## Goal

A new `/admin/revenge` page (super-admin only) that shows:
1. **KPI cards** — total sabotaged users, total revenge runs, total messages moved,
   last run time.
2. **Event feed** — one row per revenge run: when, who, trigger (auto/manual),
   status, candidates / moved / failed counts.
3. **Per-run detail + re-run** — expand a row to see the detail JSON; a button to
   re-trigger the re-spam for that user.
4. **Sabotaged-user roster + undo** — list of currently-sabotaged users with an
   Undo (unsabotage) button.

## Non-goals

- No change to *what* revenge does to mail (placement logic is done and verified).
- No real-world deliverability degradation (out of scope; discussed separately).
- No new auth surface — reuses `require_super_admin`.

## Architecture

Follows the existing strict layering: model → service → thin route → frontend hook.

### 1. Data model — `revenge_events` (migration `0038`)

New table, one row per revenge run (created `pending`, updated to terminal status
when the task finishes).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `uuid_pk()` |
| `user_id` | uuid, FK users(id) ON DELETE SET NULL, nullable | target user |
| `user_email` | str(320) | denormalized snapshot (survives user deletion) |
| `workspace_id` | uuid, nullable | target workspace snapshot |
| `trigger` | enum `revenge_trigger` | `auto_cancel_2h` \| `manual_admin` |
| `actor_user_id` | uuid, nullable | admin who triggered a manual run; null for auto |
| `status` | enum `revenge_status` | `pending` \| `completed` \| `failed` \| `no_candidates` |
| `candidates_count` | int, default 0 | outbound logs found in lookback |
| `moved_count` | int, default 0 | messages successfully moved to spam |
| `failed_count` | int, default 0 | per-message move failures |
| `detail` | JSONB, nullable | `{error?, per_peer_failures?, lookback_days}` |
| `created_at` | timestamptz | `created_at_col()` |
| `completed_at` | timestamptz, nullable | set on terminal status |

Index: `revenge_events(created_at DESC)` for the feed.
Enums created explicitly in the migration (Postgres `CREATE TYPE`), matching the
project's autogenerate-misses-enums convention.

### 2. Task changes — `tasks/revenge.py`

- `_respam_user_emails_impl(user_id, event_id=None)` — when `event_id` is given,
  update that `revenge_events` row at the end: set `status`, `candidates_count`,
  `moved_count`, `failed_count`, `detail`, `completed_at`. Status mapping:
  `no_mailboxes`/`no_recent_emails` → `no_candidates`; otherwise `completed`
  (a run that moved 0 of N still completed); unhandled exception → `failed`.
- `respam_user_emails(user_id, event_id=None)` Celery signature gains the optional
  `event_id` (backward compatible — existing `.delay(user_id)` calls still work).
- Track `failed_count` by counting move failures inside the loop (currently only
  logged).

### 3. Event creation at the two trigger points

A small helper `services/revenge_service.create_revenge_event(db, *, user, trigger,
actor_user_id)` inserts a `pending` row and returns its id. Both triggers create the
event **before** dispatching the task, then pass `event_id` to `.delay(...)`:

- `revenge_service.check_and_trigger_revenge` → `trigger=auto_cancel_2h`,
  `actor_user_id=None`.
- `admin.sabotage_user` route → moves its sabotage+dispatch logic into a service
  call `revenge_service.trigger_manual_sabotage(db, target, actor)` that sets the
  flag, creates the event (`trigger=manual_admin`, `actor_user_id=actor.id`), and
  dispatches with `event_id`. Keeps the route thin (≤40 lines).

### 4. Read/undo service — `services/revenge_dashboard_service.py`

- `get_kpis(db)` → `{sabotaged_users, total_runs, total_moved, last_run_at}`.
- `list_events(db, limit, offset)` → paginated events, newest first.
- `list_sabotaged_users(db)` → users where `notification_prefs.sabotaged` is true
  (Python-filtered for SQLite/Postgres portability, same as `sabotage.py`).
- `rerun(db, event_id)` → load the event, create a new `pending` event
  (`trigger=manual_admin`, actor = current admin), dispatch with the new id.
  (Re-run creates a fresh event rather than mutating history.)
- Undo reuses the existing `admin.unsabotage_user` route as-is.

### 5. Routes — `routes/admin_revenge.py` (mounted in `main.py`, `require_super_admin`)

| method + path | purpose |
|---|---|
| `GET /admin/revenge/kpis` | KPI cards |
| `GET /admin/revenge/events?limit=&offset=` | event feed |
| `GET /admin/revenge/sabotaged` | sabotaged roster |
| `POST /admin/revenge/events/{event_id}/rerun` | re-run a run |

Undo reuses the **existing** `POST /admin/users/{user_id}/unsabotage` route (no
duplicate); the frontend Undo button calls it and invalidates the roster query.

All handlers thin; logic in the services. Every mutating action writes an
`audit_logs` row via the existing `_write_audit` SAVEPOINT pattern.

### 6. Frontend — `/admin/revenge`

- `features/admin/revenge/api.ts` — TanStack Query hooks: `useRevengeKpis`,
  `useRevengeEvents`, `useSabotagedUsers`, `useRerunRevenge`, `useUnsabotage`.
- `features/admin/revenge/types.ts` — wire types.
- `pages/admin/RevengePage.tsx` — KPI cards (existing Card primitive), event table,
  expandable detail row with Re-run button, sabotaged roster with Undo button.
- Route added to `App.tsx` under `/admin/*`; nav link in the admin sidebar.
- Uses existing theme tokens only (`bg-surface`, `text-text-dim`, `text-accent`,
  `text-accent3` for warning/failed). Mutations invalidate the relevant queries.
- Every control is wired (no coming-soon buttons).

### 7. Backfill

The two historical dvshrdd runs (manual, 168 moved) are inserted as `completed`
`revenge_events` rows via a one-off script so the dashboard isn't empty on launch.
Done as a Python one-off against the prod container DB, not a migration.

## Data flow

```
cancel-within-2h  ─┐
admin Sabotage    ─┼─► create revenge_events(pending) ─► respam_user_emails.delay(user_id, event_id)
                   │                                              │
                   │                                              ▼
                   │                              move mail → spam per peer (IMAP)
                   │                                              │
                   │                          update event: status/counts/completed_at
                   ▼
        GET /admin/revenge/* ◄── RevengePage (KPIs, feed, roster)
```

## Error handling

- Task wraps the body so an exception sets the event `failed` with `detail.error`
  before re-raising/returning.
- Event-row update uses its own session; a dashboard-write failure never blocks the
  actual re-spam (the mail-move is the product behavior, telemetry is secondary).
- Re-run on an already-running user is allowed (idempotent move; creates a new event).

## Testing

- `tests/test_revenge_dashboard_service.py` — KPI aggregation, event listing,
  sabotaged roster, rerun creates a new pending event. SQLite per-file fixture with
  `User`, `Mailbox`, `RevengeEvent` tables (add `RevengeEvent` to any shared fixture
  `tables=[...]` that needs it).
- `tests/test_revenge.py` (extend) — `_respam_user_emails_impl` with `event_id`
  updates the row to the right terminal status for the no-candidates and
  completed paths.
- Frontend: verify with `tsc -b` (strict) before deploy.

## Migration / deploy notes

- New migration `0038_revenge_events` (down_revision `0037_billing_autopay_addons`,
  current single head). Enums created manually.
- Migrate prod via `docker compose run --rm api alembic upgrade head` (container DB
  5433), never the host venv.
- Rebuild `api worker beat frontend`; deploy to live.
