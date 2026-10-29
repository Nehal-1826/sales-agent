# Multi-tenant SaaS — design

Date: 2026-10-29. Decisions (owner): operator creates tenants · shared DB with a
workspace FK · each tenant brings its own keys · existing production data is
split by company (Shailog / Supporticon / Shri Fragrance).

## Why
Production ran ONE shared workspace. A second company (Supporticon) completed
the setup wizard as an owner and overwrote the shared company settings; its
leads, drafts and the pipeline now mix with Shailog's. Role gating (done)
limits what a *member* can do; it cannot separate two *companies*. Tenancy must
be structural: no query may return another tenant's rows.

## Model
- `Workspace(name, slug unique, is_active, created_at)` — one company.
- `User.workspace` FK (null only for platform operators). Roles
  (owner/admin/member) now apply INSIDE the user's workspace. Platform
  operator = Django superuser; they use Django admin and `manage.py`, never the
  tenant API.
- Tenant-owned models get `workspace` FK (NOT NULL): Lead, Potential, Reply,
  EmailDraft, EmailTemplate, SearchProfile, AgentConfig, AppSettings,
  PipelineRun, ChatMessage. `HealthBeat` stays global.
- AppSettings: `OneToOne(workspace)` replaces the pk=1 singleton.
  AgentConfig unique (workspace, agent); SearchProfile unique (workspace, name).
- Per-tenant secrets: ai_key/provider, smtp_*, apollo_api_key, plus new
  scalelist_api_key, apify_api_key. Env keys are a fallback ONLY for the tenant
  whose slug equals env DEFAULT_TENANT_SLUG (Shailog) — never for others.

## Enforcement (the safety net)
`core/tenancy.py`:
- `current_workspace()` backed by a ContextVar; `workspace_context(ws)` context
  manager; `set_workspace/reset`.
- `TenantManager` (default `objects` on every tenant model): filters by the
  current workspace; **raises `TenantContextMissing` if none is active** —
  fail loud, never "return everything". `create()`/`save()` stamp the current
  workspace; saving a row whose FK parent is in another workspace raises.
  `all_tenants` is the explicit, greppable unscoped manager (admin, migrations,
  the platform split command, tests of the isolation itself).
- Context is set by: the DRF authentication classes (user.workspace) with a
  middleware that always resets it per request; the worker/scheduler/management
  commands, which loop `for ws in active workspaces: with workspace_context(ws)`.
- `AppSettings.load()` and the run lock resolve the current workspace, so the
  existing ~50 call sites become tenant-correct without edits.
- Cross-tenant ids 404 (the scoped queryset simply doesn't contain them).

## Operations
- Pipeline lock is per workspace. `run_worker` iterates active workspaces,
  each with its own cadence, report and heartbeat sub-state; one tenant's
  failure/backoff never blocks another.
- `manage.py create_workspace --name --slug --owner-username --owner-password`
  (operator). Django admin: Workspace, users with workspace, filter by tenant.
- `manage.py split_tenants --classification file.json [--apply]` moves existing
  rows to their tenants (dry-run by default) and creates the extra workspaces.
- Sign-up stays closed. `me` returns the workspace name; UI shows it.

## Migration (production)
0021 add Workspace + nullable FKs → 0022 data: create default workspace
`shailog`, assign every existing row and user → 0023 NOT NULL + constraints.
Then `split_tenants` moves Supporticon/Shri Fragrance rows (classified from
evidence by a review agent; unknown → stays Shailog and is reported).
Backup first; rollback = restore dump + old images.

## Verification
- Isolation matrix: for every API route and chat/guide action, tenant A's
  token can neither list, read, edit, delete nor trigger tenant B's data; B's
  ids return 404; strict manager raises with no context; worker run for A does
  not touch B's rows; per-tenant settings/keys/SMTP; env-key fallback only for
  the default tenant.
- Full existing suite stays green (tests run inside a workspace context).
