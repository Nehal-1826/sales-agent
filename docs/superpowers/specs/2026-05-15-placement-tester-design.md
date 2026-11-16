# Placement Tester — Design

**Date:** 2026-05-15
**Sub-project:** 4 of 8 (Pro Plus tier — 2/3 done after this)
**Status:** Approved (verbal)
**Effort:** ~5-7 days serial / ~2 h via 2 parallel subagents

## Why

Pro Plus needs a second tent-pole feature alongside Postmaster + SNDS ingest. Placement testing is the obvious second pillar — competitors (GlockApps, MailGenius) charge $79+/mo for it as a standalone product. Bundling it into Pro Plus at ₹7,999/mo total is the differentiator.

The user clicks "Run placement test" on a mailbox → we send a probe email from their mailbox to ~30 seed inboxes we control across Gmail/Outlook/Yahoo → IMAP-poll each seed to see where it landed → return a stacked breakdown (Inbox / Promotions / Spam / Other / Timeout) within ~5-15 minutes.

## Existing scaffolding

The feature audit found `db/models/placement_tests.py` already exists with `mailbox_id`, `seed_set` JSONB, and `results` JSONB columns. No route, no scheduling logic, no seed-mailbox pool provisioned. We're filling in ~60% of the implementation around an existing model.

## Seed-mailbox strategy

**Decision: reuse the peer-inbox network with a new `peer_inboxes.is_seed` flag.** Industry-standard (Mailreach, TrulyInbox do this). A subset of high-reputation peer inboxes get promoted to seed status; placement tests pick from `is_seed=true` peers.

Why not dedicated separate mailboxes:
- Dedicated provisioning = $50-150/mo extra
- Peer inboxes are already real, already paid for, already operating
- Privacy: customer never sees WHICH peer received their test, just the placement counts

Initial seed-tagging done as a one-time data step in the `0018` migration: select 30 top peer inboxes by `reputation_score` (10 Gmail + 10 Outlook + 10 Yahoo at minimum, fallback to whatever's available) and set `is_seed=true`.

## Architecture

### New backend files

- `services/placement_service.py`
  - `async start_test(workspace_id, mailbox_id) -> PlacementTest` — pick seeds, persist test + child seed rows, enqueue probes + poll task. Enforces monthly quota.
  - `async finalize_test(test_id)` — sum landed-folder counts, write `placement_tests.results`, fire `placement_test_completed` webhook event.
  - `get_status(test_id)` — for live polling endpoint.

- `tasks/placement_send.py`
  - Celery task `send_probe(test_id, seed_peer_id)`.
  - Generates unique Message-ID `<placement-{test_id}-{seed_peer_id}@warmpulse.io>`.
  - Calls `content_factory.generate_placement_probe(test_id)` for the body.
  - Sends via the customer's mailbox SMTP to the seed peer's email address.
  - Updates `placement_test_seeds.message_id` + `status=sent`.

- `tasks/placement_poll.py`
  - Celery task `poll(test_id)`. Self-rescheduling every 60s for up to 15 min.
  - For each `placement_test_seeds` row with `status in (sent, pending_check)`: call `imap_watcher.find_message_in_any_folder(seed_peer, message_id)`. If found, set `status` + `landed_folder` + `landed_at`. If 15 min elapsed without finding, set `status=timeout`.
  - When all rows resolved OR timeout elapses: call `placement_service.finalize_test(test_id)`.

- `api/routes/workspace_placement.py`
  - `POST /api/workspace/placement-tests` body `{mailbox_id}` → starts test. Returns `{test_id, seed_count, status}`. Returns 402 if over monthly cap.
  - `GET /api/workspace/placement-tests` → list (paginated, most recent first).
  - `GET /api/workspace/placement-tests/{id}` → status + results + per-seed breakdown.

- `db/models/placement_test_seeds.py` — child table:
  - `id uuid_pk`, `test_id FK`, `seed_peer_id FK`, `message_id string`, `status string` (`pending`, `sent`, `pending_check`, `inbox`, `promotions`, `spam`, `junk`, `other`, `timeout`), `landed_folder string nullable`, `landed_at nullable`, `created_at`.

- `alembic/versions/0018_placement_tester.py`
  - Adds `peer_inboxes.is_seed bool default false`, indexed.
  - Creates `placement_test_seeds` table.
  - Data step: tag up to 30 peer inboxes as seeds (10 per provider where possible, fallback to whatever exists).
  - Adds `placement_tests.status string default 'created'` if not already present.
  - `down_revision = '0017_domain_reputation'`.

- `tests/test_placement_tester.py` — at least 5 tests:
  - `test_start_test_picks_seeds_across_providers` — assert seed_count = min(N, available active seeds), provider-balanced
  - `test_send_probe_writes_message_id_and_seed_row`
  - `test_poll_marks_inbox_when_imap_returns_inbox_folder`
  - `test_finalize_aggregates_counts_and_fires_webhook`
  - `test_start_test_enforces_monthly_cap_with_402` — Pro Plus with 50 already-completed tests this month → POST returns 402

### Modified backend

- `db/models/peer_inboxes.py` — add `is_seed bool default false` column.
- `services/warmup/imap_watcher.py` — add `async find_message_in_any_folder(peer, message_id) -> tuple[str, int] | None` that:
  - Iterates a fixed folder list: `INBOX`, `[Gmail]/Spam`, `Spam`, `Junk`, `[Gmail]/Promotions`, `Promotions`, `[Gmail]/Updates`, `[Gmail]/Forums`, `[Gmail]/Social`, `Bulk Mail`
  - For each: `UID SEARCH HEADER Message-ID "{message_id}"`
  - Returns `(folder_name, uid)` on first hit; `None` if exhausted.
- `services/warmup/content_factory.py` — add `generate_placement_probe(test_id: str) -> tuple[str, str]` returning `(subject, body)`. Subject prefix `[WP-PT-{test_id_short}]` for human/IMAP discovery. Body is intentionally generic: plain-text 3-4 sentences, no images, no links, no marketing phrasing — pure deliverability test text.
- `services/notifications_dispatch.py` — add event constant `PLACEMENT_TEST_COMPLETED = "placement_test_completed"`.
- `main.py` — mount `workspace_placement.router`.

### Folder → bucket mapping (in `placement_service.finalize_test`)

| IMAP folder | Reported bucket |
|---|---|
| `INBOX` | `inbox` |
| `[Gmail]/Spam`, `Spam`, `Junk`, `Bulk Mail` | `spam` |
| `[Gmail]/Promotions`, `Promotions` | `promotions` |
| `[Gmail]/Updates`, `[Gmail]/Forums`, `[Gmail]/Social` | `other` |
| Not found after 15 min | `timeout` |

Per-seed `placement_test_seeds.status` stores granular folder; `placement_tests.results` JSONB stores aggregated:
```json
{
  "inbox": 23, "promotions": 5, "spam": 2, "other": 0, "timeout": 0,
  "total_seeds": 30,
  "by_provider": {
    "gmail": {"inbox": 8, "promotions": 1, "spam": 1, "other": 0, "timeout": 0},
    "outlook": {"inbox": 9, "promotions": 1, "spam": 0, "other": 0, "timeout": 0},
    "yahoo": {"inbox": 6, "promotions": 3, "spam": 1, "other": 0, "timeout": 0}
  }
}
```

### Frontend

- `pages/client/tools/PlacementTester.tsx` — new page rendered at `/app/tools/placement`:
  - Header with breadcrumb + Pro Plus pill
  - Mailbox dropdown (from `useMailboxes()`)
  - Big "Run placement test" CTA — calls `useStartPlacementTest()` mutation
  - On started: live progress card — `12 / 30 seeds reported back` with progress bar, individual seed-folder pills as they resolve
  - On completed: stacked bar (Inbox/Promotions/Spam/Other/Timeout %), per-provider cards (Gmail / Outlook / Yahoo each with mini-stack)
  - History table at the bottom: last 20 tests for this workspace
  - Quota tile: `12 / 50 tests used this month` for Pro Plus

- `features/placement/api.ts` — new hooks:
  - `useStartPlacementTest()` — mutation POST
  - `usePlacementTest(testId)` — `UseQueryResult`, polls every 5s while `status !== 'completed'`
  - `usePlacementTestHistory()` — list endpoint

- `pages/client/ToolsPage.tsx` — currently has a legacy `/app/tools/placement` route. Ensure for Pro Plus users it renders the new `PlacementTester.tsx`. For Free/Starter/Pro: existing tools fallback (or "Upgrade to Pro Plus" CTA).

## Pro Plus gating + capacity

- Free/Starter/Pro see "Upgrade to Pro Plus to run placement tests" CTA on the page (no test creation possible)
- Pro Plus: 50 tests/month
- Agency: 200 tests/month
- Enterprise: unlimited

Quota = count of completed tests this calendar month for the workspace. Enforced server-side in `placement_service.start_test()` — raises HTTP 402.

## Webhook event

`placement_test_completed` fires after `finalize_test` writes results. Payload:
```json
{
  "test_id": "...",
  "mailbox_id": "...",
  "mailbox_email": "alex@acme.com",
  "results": { "inbox": 23, "promotions": 5, "spam": 2, "other": 0, "timeout": 0, "total_seeds": 30 }
}
```
Flows through sub-project 1's webhook dispatcher.

## Out of scope (deferred)

- Multi-test comparison chart over time
- Per-provider auto-diagnostics ("Gmail filtered as Promotions — try moving subject keyword X")
- Auto-scheduled recurring placement tests
- Per-IP / per-domain seed selection
- Webmail screenshot rendering
- Reusing seed pool for cold-mail campaign monitoring

## Risk

| Risk | Mitigation |
|---|---|
| Seed inboxes burning reputation as receive-only accounts | They're already peer-pool inboxes — already do warmup-style activity; placement probes are low additive volume |
| Single seed inbox getting hammered across many concurrent tests | Per-seed daily probe quota of 50; round-robin selection within provider |
| IMAP search across folders slow | UID SEARCH HEADER (indexed by server); cache the folder list per peer; 5s timeout per folder |
| 15-min timeout too short for slow Outlook | Configurable per-test in case we need to bump; default 15min based on industry norm |
| Probe content triggers spam filters | Body is intentionally plain-text, no links, no marketing phrasing |
| Quota race conditions on the cap check | Use `SELECT ... FOR UPDATE` on workspace row when incrementing the monthly counter |

## Verification

- `cd backend && pytest tests/test_placement_tester.py -x` — green
- `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no new errors
- Manual: as Pro Plus user, visit `/app/tools/placement`, run a test on a real mailbox with a real peer pool, see results within 15 min
- Manual: as Pro user (not Pro Plus), visit same URL, see upgrade CTA
- Manual: run 50 tests as Pro Plus, see 51st blocked with 402

## File touch list

**Sub-A (backend):**
- Add: `services/placement_service.py` · 2 tasks · `db/models/placement_test_seeds.py` · `api/routes/workspace_placement.py` · `alembic/versions/0018_placement_tester.py` · `tests/test_placement_tester.py`
- Modify: `db/models/peer_inboxes.py` · `services/warmup/imap_watcher.py` · `services/warmup/content_factory.py` · `services/notifications_dispatch.py` · `main.py` · celerybeat (none — both tasks are user-triggered + self-rescheduling, no beat entries)

**Sub-B (frontend):**
- Add: `pages/client/tools/PlacementTester.tsx` · `features/placement/api.ts`
- Modify: `pages/client/ToolsPage.tsx` (route the placement sub-route to the new page for Pro Plus)
