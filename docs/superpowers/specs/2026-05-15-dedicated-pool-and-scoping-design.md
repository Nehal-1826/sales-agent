# Dedicated Peer Pool + Sub-Client Scoping Audit — Design

**Date:** 2026-05-15
**Sub-project:** 8 of 8 — **final Agency feature**
**Status:** Approved (verbal)
**Effort:** ~2-3 hours via 2 parallel subagents

## Why

Two related Agency-tier deliverables flagged 🟡 PARTIAL in the audit:

1. **Dedicated peer pool enforcement** — schema exists (`client_pool_assignments` model + `peer_pool_service.py`), but `pairing.pick_peer_inbox()` does not honor pool assignments. Agency mailboxes that should be using a private peer pool still pull from the shared default.
2. **Sub-client scoping audit** — `parent_workspace_id` schema exists, but no test coverage proving cross-workspace isolation across the dozen-plus workspace-scoped route families. Real risk that a sub-client could read parent Agency data via a missed `WHERE workspace_id = :ws` clause.

Shipping these closes the Agency tier honestly.

## Part A · Dedicated Peer Pool enforcement

### Existing scaffolding
- `db/models/peer_pools.py` (`PeerPool` model)
- `db/models/client_pool_assignments.py` (`ClientPoolAssignment` mapping `workspace_id → peer_pool_id`)
- `services/peer_pool_service.py` (exists, partial)
- `peer_inboxes.pool_id` column — verify if exists; add if missing

### Implementation
**Modify `services/warmup/pairing.py`** — in `pick_peer_inbox(mailbox, session)`:
1. Look up the mailbox's `workspace_id` → query `ClientPoolAssignment` for that workspace
2. If assigned + active: `SELECT * FROM peer_inboxes WHERE pool_id = :pool_id AND is_active = true ...` (rest of selection logic unchanged — reputation weighting, dedup, etc.)
3. Else: existing default-pool behavior (no pool_id filter, or filter to `pool_id IS NULL`)
4. Safety: if dedicated pool has zero active peers, fall back to default pool + log a warning audit row (don't starve the customer)

**Possibly migrate** `peer_inboxes` to add `pool_id` FK column nullable. Sub-A reads the existing model first; if already there with compatible semantics, no migration needed.

**Add** `services/peer_pool_service.get_status_for_workspace(workspace_id) -> dict`:
- Returns `{is_dedicated: bool, pool_id, pool_name, member_count, provider_mix: {gmail: N, outlook: N, yahoo: N, smtp: N}}`
- If no assignment: `{is_dedicated: false}` plus empty fields.

**Add** route `GET /api/workspace/dedicated-pool` (Agency/Enterprise only; 402 otherwise) — returns the status dict.

**Add UI card** on Workspace page (Agency-only): "Dedicated peer pool · ACTIVE · 30 peers across Gmail/Outlook/Yahoo" OR "No dedicated pool · contact support for Enterprise tier" when unassigned. Read-only — admin assigns pools.

### Out of scope (Part A)
- Self-serve pool creation (admin still owns provisioning)
- Per-mailbox pool override (workspace-level only)
- Pool reputation thresholds different from default

## Part B · Sub-Client Scoping Audit

### Goal
Add cross-workspace isolation test coverage across every workspace-scoped route family. Fix anything that leaks.

### Routes to audit (one parameterized test per family)
| Family | Sample route | Owns risk? |
|---|---|---|
| Mailboxes | `GET /workspace/mailboxes/{id}` | High |
| Activity | `GET /workspace/warmup-activity` | High |
| Analytics | `GET /workspace/analytics/dashboard/summary` | Medium |
| Reputation | `GET /workspace/reputation` | Low |
| Reports | `GET /workspace/reports`, `POST /workspace/reports/generate` | High |
| Workspace settings | `PATCH /workspace/settings` | Medium |
| Team | `GET /workspace/team`, `POST /workspace/team/invite` | High |
| API keys | `GET /workspace/api-keys`, `POST /workspace/api-keys` | High |
| Billing | `GET /payments/me`, invoice download | High |
| Webhooks (sub-1) | `GET /workspace/webhooks`, fire test | High |
| Postmaster (sub-3) | `GET /workspace/postmaster/domains` | High |
| SNDS (sub-3) | `GET /workspace/snds/domains` | High |
| Placement (sub-4) | `GET /workspace/placement-tests/{id}` | High |
| Branding (sub-6) | `PATCH /workspace/branding` | Medium |
| Custom domain (sub-7) | `GET /workspace/custom-domain` | Medium |

### Test pattern (one per family)
```python
async def test_workspace_a_cannot_read_workspace_b_<family>(client, db_session):
    ws_a, user_a, jwt_a = await _make_workspace_with_user(...)
    ws_b, user_b, jwt_b = await _make_workspace_with_user(...)
    # User B creates a resource in workspace B
    resource_b = await _create_<resource>(db_session, ws_b)
    # User A authenticates as workspace A and tries to access B's resource
    resp = await client.get(f"/api/workspace/<route>/{resource_b.id}", headers=_auth(jwt_a))
    assert resp.status_code in (403, 404)  # never 200 with B's data
```

### Audit deliverable
- New file `tests/test_cross_workspace_isolation.py` with 10-15 parameterized tests (one per family)
- For each leak found: surgical fix to the route/service to add the missing scope clause
- Audit summary at end of the subagent's report listing which routes were already correctly scoped vs which needed fixes

### Out of scope (Part B)
- Agency cross-workspace context switching (separate sub-project)
- Audit log forensics improvements
- Role / permission model overhaul (keep owner/admin/member)
- Sub-client billing aggregation for the Agency owner

## Architecture summary

**New backend (Part A):**
- `api/routes/workspace_dedicated_pool.py` (new route)
- `tests/test_dedicated_pool.py` (new test file, 4 tests)

**Modified backend (Part A):**
- `services/warmup/pairing.py` (pool-filter logic)
- `services/peer_pool_service.py` (add `get_status_for_workspace`)
- `main.py` (mount route)
- Possibly `db/models/peer_inboxes.py` + `alembic/versions/0021_peer_pool_id.py` (if `pool_id` column doesn't exist)

**New backend (Part B):**
- `tests/test_cross_workspace_isolation.py` (10-15 parameterized tests)
- Plus surgical fixes for any leaks found

**New frontend (Part A):**
- `features/dedicated-pool/api.ts` (hook)
- `pages/client/workspace/DedicatedPoolCard.tsx` (status card)

**Modified frontend (Part A):**
- `pages/client/workspace/ProWorkspace.tsx` (render card next to Plan card for Agency/Enterprise)

## Verification

- `cd backend && pytest tests/test_dedicated_pool.py tests/test_cross_workspace_isolation.py -x` — green
- `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no new errors
- Manual: as Agency user with pool assignment → see dedicated-pool card with member count
- Manual: as Agency user without assignment → see "no dedicated pool" empty state
- Manual: cross-workspace leak test by hitting a workspace-B resource ID with a workspace-A JWT → 403/404

## File touch list

**Sub-A (backend, both parts):**
- Add: `api/routes/workspace_dedicated_pool.py` · `tests/test_dedicated_pool.py` · `tests/test_cross_workspace_isolation.py`
- Modify: `services/warmup/pairing.py` · `services/peer_pool_service.py` · `main.py`
- Possibly: `db/models/peer_inboxes.py` + `alembic/versions/0021_peer_pool_id.py`
- Surgical leak fixes (TBD by audit)

**Sub-B (frontend, Part A UI only):**
- Add: `features/dedicated-pool/api.ts` · `pages/client/workspace/DedicatedPoolCard.tsx`
- Modify: `pages/client/workspace/ProWorkspace.tsx`
