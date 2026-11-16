# Plan — Mailbox "Pending until pool assignment"

## Goal
A newly connected mailbox must start **Pending** and only begin warmup once an
admin assigns the owning workspace to a peer pool. The **client must clearly see**
that their mailbox is awaiting pool assignment (not silently idle).

## Decisions (from the user)
- New mailbox → `pending`. **Always pending first**, even if the workspace is
  already assigned to a pool.
- Activation trigger: admin assigns the workspace to a peer pool
  (`peer_pool_service.upsert_assignment`). That sweep flips the workspace's
  `pending` mailboxes → `active`.
- The Gmail/Outlook App-Password UX is **out of scope** (already exists; OAuth
  verification handled separately).

## Context the engine already gives us
- `WarmupStatus` enum already has `pending`. The 15-min `warmup_send` fan-out
  only picks `active`, in-window, under-quota mailboxes, so `pending` is skipped
  with no engine change.
- Frontend already renders `pending` everywhere (`uiStatusFor`,
  `STATUS_LABEL/PILL/DOT` in `AgMbxP1Glass`, the "Pending" filter chip). What's
  missing is **explanatory copy** telling the client *why* it's pending.
- Admin already has the client→pool routing UI (`admin_pool_routing` +
  `peer_pool_service.list_unassigned_clients`) — no new admin UI needed.

## Tasks

### Task 1 — Backend: start mailboxes Pending, activate on pool assignment
Files: `backend/app/services/mailbox_service.py`,
`backend/app/services/peer_pool_service.py`, tests in
`backend/tests/test_mailboxes.py` + `backend/tests/test_peer_pools.py`.

1. In `mailbox_service` create: set `warmup_status=WarmupStatus.pending` and
   `current_day=0` (was `active` / `current_day=1`). Update the now-stale
   comment block that called pending the "silent-stall bug" — it is now an
   intentional, admin-gated, client-visible state.
2. New helper `peer_pool_service.activate_pending_mailboxes(session, *,
   workspace_id, actor)`: set every `pending` mailbox in the workspace to
   `active`, `current_day=1`, `is_paused=False`; write one audit row per
   activation (reuse `_write_audit`). Returns count.
3. Call it inside `upsert_assignment` (after the assignment commit/flush, before
   return) so assigning — or re-saving — a workspace→pool activates its pending
   mailboxes. Do **not** add it to `revert_assignment_to_default`.
4. Tests (TDD): new mailbox is `pending` with `current_day=0`; `upsert_assignment`
   flips pending→active with `current_day=1`; already-`paused`/`completed`/`active`
   mailboxes are untouched; activating with no pending mailboxes is a no-op.
   Update existing mailbox-create tests that assumed `active`.

### Task 2 — Frontend: tell the client they're awaiting pool assignment
Files: `frontend/src/pages/client/agency/AgMbxP1Glass.tsx` (Agency is the live
plan), verify no regression in `MailboxCard.tsx` / `StarterMailboxes.tsx`.

1. In the mailbox **detail drawer**, when `status === 'pending'`, render a clear
   inline notice (use existing tokens, e.g. the `accent2`/pending palette):
   "Pending — awaiting pool assignment. Warmup begins once an admin adds this
   mailbox to a peer pool." Keep copy provider-neutral.
2. On the **card**, add a small one-line hint under the status pill for pending
   mailboxes so it's visible in the list without opening the drawer.
3. Do not change the visual status system (labels/pills/dots already exist).
4. `pnpm typecheck` must pass.

## Out of scope
- Engine changes (pending is already skipped).
- App-Password UX (exists).
- Per-mailbox admin activate button (workspace→pool sweep covers it).

## Risk to flag to the user
Every new mailbox across **all** plans now waits for an admin pool assignment.
For self-serve/trial signups with no admin attention this means warmup won't
start until someone assigns their workspace. The operator (super admin) drives
this via the existing unassigned-clients routing screen.
