# Plan — Plan-based peer pools + auto-routing + per-pool cap

## Decisions (from the user)
- **Auto-route + start warming:** on signup / mailbox-add, the workspace
  auto-assigns to the pool matching its plan and the mailbox starts **active**
  immediately. This OVERRIDES the "Pending until admin assigns" gate for normal
  signups (revert the create default back to `active`/`current_day=1`).
- **Per-pool daily cap:** add a `daily_send_limit` column to peer pools; set each
  plan pool to its plan's cap (Starter 50, Pro 100, Pro Plus 75, Agency 200);
  surface it in the admin vessel viz.
- **Keep `default` + `Shailog`, add 4 plan pools** (Starter / Pro / Pro Plus /
  Agency). Assign existing test workspaces to their plan pool.
- Admin panel must show the **mailbox email (mail id)**, not the domain-derived
  name (which renders `info.shailog@gmail.com` → "Gmail").

## Plans (from DB)
Starter 50/day, Pro 100/day, Pro Plus 75/day, Agency 200/day.

## Tasks

### Task 1 — Backend: per-pool cap + auto-route by plan
Files: `app/db/models/peer_pools.py`, new migration
`app/alembic/versions/0033_pool_daily_send_limit.py` (revision id MUST be ≤32
chars — `alembic_version.version_num` is varchar(32)), `app/schemas/peer_pools.py`,
`app/services/peer_pool_service.py`, `app/services/mailbox_service.py`, tests.

1. Add `daily_send_limit: Mapped[int | None]` (nullable Integer) to `PeerPool`.
   Migration adds the column nullable.
2. Add `daily_send_limit: int | None` to `PoolOut`, `PoolCreate`, `PoolUpdate`;
   thread it through `create_pool`, `update_pool`, and `pool_to_out`.
3. Revert `mailbox_service` create defaults to `warmup_status=active`,
   `current_day=1` (auto-route means no Pending gate). Update the comment.
4. New `peer_pool_service.auto_route_workspace_by_plan(session, *, workspace_id,
   plan_name, actor) -> uuid|None`: if the workspace has NO existing
   `client_pool_assignment`, find the pool whose `name` == plan_name
   (case-insensitive); if found, `upsert_assignment(workspace, pool)` and return
   pool id. If already assigned (manual override) or no matching pool, no-op.
5. Call it from `mailbox_service` create after the mailbox is persisted, using the
   creating user as actor and their plan name. Never let a routing failure break
   mailbox creation (wrap defensively, log).
6. Tests (TDD): pool create/out round-trips `daily_send_limit`; new mailbox is
   `active`; auto-route assigns an unassigned workspace to its plan pool; an
   already-assigned workspace is left untouched; unknown plan / missing pool is a
   safe no-op.
7. Keep `activate_pending_mailboxes` (still used by `upsert_assignment`).

### Task 2 — Data seed (run after Task 1 deploy)
Idempotent script in the api container. Create the 4 plan pools (if absent) with
`daily_send_limit` = plan cap; add ALL existing active peer inboxes as members of
each plan pool (so warmup pairing has helpers); assign each existing test
workspace to its plan pool via `client_pool_assignments`; set
`info.shailog@gmail.com` back to `active`/`current_day=1` (it was set Pending
manually earlier). Keep `default` + `Shailog`.

### Task 3 — Frontend: show email + per-pool cap
File: `frontend/src/pages/admin/PoolRoutingPage.tsx` (+ types if needed).
1. Workspace chip: display `client.email` (the mail id) instead of
   `workspaceNameFromEmail(...)`. Keep avatar initials (first 2 of the local part
   is fine). Truncate gracefully; keep the plan badge.
2. Surface the pool's `daily_send_limit` in the vessel card (e.g. "limit N/day")
   when present, alongside the existing helper-derived cap.
3. `pnpm typecheck` + `pnpm build` pass.

## Out of scope / notes
- The per-pool cap is **displayed/recorded**, not a hard send-enforcer (actual
  send rate stays governed by the per-mailbox ramp/daily_target). Note this.
- Pending status/UI stays in the codebase (harmless) but is no longer the default
  for new mailboxes.
