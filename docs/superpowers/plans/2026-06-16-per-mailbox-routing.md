# Plan — Per-mailbox pool routing + OAuth "not sending" flag

## Decisions (from the user)
- **Per-mailbox routing (new):** each mailbox can be pinned to its own pool,
  overriding the workspace-level pin. Rework warmup pairing to honor it.
- **Flag OAuth mailboxes in the UI:** OAuth-only mailboxes can't send (engine is
  SMTP-only) — surface a clear "OAuth · not sending" badge. No engine change for
  sending (XOAUTH2 deferred).

## Routing precedence (new)
mailbox pin (`mailboxes.pool_id`) → workspace pin (`client_pool_assignments`) →
default pool. (Today it's only the last two.)

## Task 1 — Backend
Files: `app/db/models/mailboxes.py`, migration `0034_mailbox_pool_pin.py`
(revision id ≤32 chars; head is `0033_pool_daily_send_limit`),
`app/services/warmup/pairing.py`, `app/services/peer_pool_service.py`,
`app/schemas/peer_pools.py`, `app/api/routes/admin_pool_routing.py`, tests.

1. Add nullable `pool_id` FK column to `mailboxes` (`ForeignKey("peer_pools.id",
   ondelete="SET NULL")`). NULL = inherit workspace routing.
2. `pick_peer_inbox` (pairing.py:~113): resolve the dedicated pool as
   `mailbox.pool_id` if set AND that pool has eligible peers; else fall back to
   the existing workspace `_resolve_assignment`; else default. Keep the
   starved-pool audit behavior.
3. Service `assign_mailbox_to_pool(session, *, actor, mailbox_id, pool_id) ->
   Mailbox`: set/clear `mailbox.pool_id` (None unpins), validate the pool exists
   when not None, write an audit row, commit.
4. Service `list_routing_mailboxes(session) -> list[...]`: every mailbox with
   `id, email, provider, workspace_id, plan_name, pool_id (pin), effective_pool_id
   (pin or workspace or default), sends_last_30d, can_send (smtp_password present),
   is_oauth (oauth token present and no smtp password)`.
5. API (under `/admin/pool-routing`):
   - `GET /mailboxes` → list_routing_mailboxes (super-admin).
   - `POST /mailboxes/{mailbox_id}` body `{pool_id: uuid|null}` → assign/unpin.
   Add the request/response schemas to `app/schemas/peer_pools.py`.
6. Tests: pairing prefers mailbox pin over workspace pin; unpin falls back to
   workspace/default; assign/unpin service writes audit; `list_routing_mailboxes`
   computes effective pool + can_send/is_oauth correctly.

## Task 2 — Frontend
Files: `frontend/src/features/admin/pool-routing/api.ts` (+ `types.ts`),
`frontend/src/pages/admin/PoolRoutingPage.tsx`.

1. Add a hook for `GET /admin/pool-routing/mailboxes` + a mutation for
   `POST /admin/pool-routing/mailboxes/{id}`.
2. In the inspector `DetailWorkspaceRow`, when expanded, list that workspace's
   mailboxes (filter the mailboxes list by `workspace_id`). For each mailbox show:
   the **email** (mail id), a small provider tag, an **"OAuth · not sending"**
   badge when `is_oauth` / `!can_send`, and a **pool dropdown** (Inherit workspace
   / each pool) wired to the assign mutation. Show the effective pool.
3. Keep the existing workspace-level pin too (mailbox pin overrides it).
4. `pnpm typecheck` + `pnpm build` pass.

## Out of scope / notes
- Vessel fill stays workspace-sends based for now (per-mailbox fill is a later
  refinement); note it.
- No XOAUTH2 sending — OAuth mailboxes are flagged, not fixed.
- Per-pool cap remains display-only (not a hard send enforcer).
