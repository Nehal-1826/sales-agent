# White-Label Branding — Design

**Date:** 2026-05-15
**Sub-project:** 6 of 8 (Agency tier — 1/3)
**Status:** Approved (verbal)
**Effort:** ~3-4 days serial / ~2-3 hours via 2 parallel subagents

## Why

The Agency-tier marketing claim "white-label" needs to actually deliver: agency configures their brand once, every sub-client they manage sees the agency's brand (logo / name / accent color / footer) throughout the app instead of "WarmPulse". This is the core Agency moat — agencies resell WarmPulse as their own product.

The audit found zero scaffolding. This is a full buildout.

## Scope

### Surfaces white-labeled (v1)
- Browser tab title: `{brandName} · Dashboard`
- Sidebar pill: logo + brand name
- Accent color throughout UI (overrides `--wp-accent`)
- Footer text in the app
- Report headers in PDF/CSV exports

### Explicitly NOT in v1
- Transactional email branding (columns added now, templates rewired later)
- Custom font / typography
- Per-sub-client branding overrides (future sub-project — adds `sub_client_branding_override` table)
- Favicon override (defer)
- Localized brand strings

## Effective-branding resolution

```python
def get_effective(workspace):
    # 1. Own branding row → use it (Agency-level config)
    if workspace.branding:
        return workspace.branding
    # 2. Parent workspace's branding → inherit (sub-clients)
    if workspace.parent_workspace_id:
        return get_effective(workspace.parent)
    # 3. Fall back to WarmPulse defaults
    return DEFAULTS
```

Sub-clients automatically inherit their Agency parent's brand. Single source of truth at the Agency-workspace row.

## Architecture

### New backend
- `db/models/workspace_branding.py` — `WorkspaceBranding`:
  - `id uuid_pk`, `workspace_id FK + unique`, `brand_name string nullable`, `logo_blob bytea nullable`, `logo_mime string nullable`, `accent_color string nullable` (hex `#RRGGBB`), `footer_text string nullable`, `email_footer_text string nullable` (added for future email-branding work, not used yet), `created_at`, `updated_at`
- `services/branding_service.py` — `get_effective(workspace_id) -> EffectiveBranding`, `update(workspace_id, **fields)`, `upload_logo(workspace_id, blob, mime)`, `delete_logo(workspace_id)`. All Agency-tier-gated.
- `api/routes/workspace_branding.py`:
  - `GET /api/workspace/branding` — returns effective branding (with parent fallback). Public to any authenticated workspace user.
  - `PATCH /api/workspace/branding` — Agency-only + owner-only. Returns 402 with `{detail: "Upgrade to Agency for white-label branding"}` for lower tiers.
  - `POST /api/workspace/branding/logo` — multipart, max 1MB, MIME validation (PNG/JPEG/SVG), Agency-only.
  - `GET /api/workspace/branding/logo` — serves blob with correct MIME (public read by design; the logo is the public-facing brand).
  - `DELETE /api/workspace/branding/logo` — clears blob. Agency-only.
- `alembic/versions/0019_white_label_branding.py` — `down_revision = '0018_placement_tester'`. Creates `workspace_branding` table.
- `tests/test_branding.py` — at least 5 tests:
  - `test_get_branding_returns_defaults_for_workspace_without_row`
  - `test_get_branding_inherits_from_parent_workspace`
  - `test_patch_branding_requires_agency_tier_returns_402`
  - `test_upload_logo_rejects_oversize_file`
  - `test_upload_logo_accepts_valid_png_and_stores_blob`

### Modified backend
- `db/models/__init__.py` — register new model
- `main.py` — mount `workspace_branding.router`
- `services/reports_service.py` — when generating a PDF/CSV report for a workspace, call `branding_service.get_effective(workspace_id)` and inject `brand_name` + `logo_blob` into the report template header. If reportlab missing → CSV path still injects `brand_name` in the title row.

### New frontend
- `features/branding/api.ts`:
  - Types: `BrandingConfig` (`brand_name`, `logo_url`, `accent_color`, `footer_text`, `is_inherited` bool)
  - Hooks: `useBranding()` (queries `GET /branding`), `useUpdateBranding()` (mutation PATCH), `useUploadLogo()` (multipart POST), `useDeleteLogo()` (DELETE)
- `components/BrandingProvider.tsx` — React context:
  - On mount, calls `useBranding()`
  - Sets CSS variables on `document.documentElement`: `--wp-accent` (override if `accent_color` present), `--wp-accent-2` (computed lighter variant), `--wp-accent-hover` (computed darker variant)
  - Sets `document.title` prefix using `brand_name` (default "WarmPulse")
  - Exposes `useBrand()` hook returning resolved branding shape with safe defaults
- `pages/client/workspace/BrandingTab.tsx` — Agency-tier-only tab:
  - **Left:** live preview pane showing mini sidebar + sample button + sample report header + footer
  - **Right:** form
    - Brand name text input
    - Accent color picker with HSL luminance check (warn if contrast too low against background)
    - Logo upload zone (drag-drop or click; PNG/JPEG/SVG; preview thumbnail; "Remove logo" button)
    - Footer text textarea (max 200 chars)
    - "Save changes" button (calls mutations + invalidates query)
  - Pro Plus and below see the tab as disabled with "Upgrade to Agency" CTA

### Modified frontend
- `main.tsx` — wrap `<App />` in `<BrandingProvider>` inside the auth provider tree
- `pages/client/WorkspacePage.tsx` — wire a "Branding" tab in the existing Workspace tabs UI (only show for `usePlan().isAgency`)
- `components/layout/ClientPillSidebar.tsx` — replace hardcoded WarmPulse mark + name with `useBrand().logoUrl` / `useBrand().name` (fall back to defaults)
- `lib/api.ts` — no change needed (branding query auto-invalidates on workspace switch via existing query key)

## Tier gating

| Tier | Branding tab visible? | Can configure? | Sub-clients inherit? |
|---|---|---|---|
| Free / Starter | No | No | n/a |
| Pro / Pro Plus | No | No | n/a |
| Agency | Yes | Yes | Yes |
| Enterprise | Yes | Yes + dedicated peer pool fits in | Yes |

Sub-clients (`parent_workspace_id IS NOT NULL`): see the inherited brand automatically. No tab; they're not the configurer.

## Logo storage

v1: Postgres bytea. Logos <1 MB, infrequent reads, no new infra needed.

Future: lift to Cloudflare R2 / S3 + signed URLs when we have many Agency customers with high logo-read volume.

## Caching

- Backend: cache `get_effective` result in Redis keyed by `branding:effective:{workspace_id}` with 5-min TTL. Invalidate on PATCH / logo upload / logo delete.
- Frontend: TanStack Query `staleTime: 5 * 60_000`. Refetch on window focus. Branding updates require a manual reload (documented in the UI).

## Risk

| Risk | Mitigation |
|---|---|
| Logo bloats Postgres backups | Hard 1MB cap; metric tracking total branding-table size; trivial migration to S3 later |
| Low-contrast color picks | Client-side HSL luminance check warns at config time |
| Stale branding for sub-clients | 5-min Redis TTL + window-focus refetch; documented "reload to see new brand" |
| Branding service latency per page load | Redis cache + single column read; <5ms |
| Agency configures bad SVG (XSS) | Reject SVG with `<script>` tags via simple regex on upload; SVG served with strict Content-Type + CSP |
| Inherited brand confused with own brand | API returns `is_inherited: true` so the BrandingTab can show "Inherited from parent agency" banner for sub-clients |

## Verification

- `cd backend && pytest tests/test_branding.py -x` — green
- `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no new errors
- Manual: as Agency user → Workspace → Branding tab → upload logo + pick color + save → reload → see brand applied across nav, footer, accent color
- Manual: as sub-client user of that Agency → reload → see same brand
- Manual: as Pro user → Branding tab not visible
- Manual: generate a PDF report as Agency user → header shows agency logo + name

## File touch list

**Sub-A (backend):**
- Add: 1 model · 1 service · 1 route · 1 migration · 1 test file
- Modify: `db/models/__init__.py` · `main.py` · `services/reports_service.py`

**Sub-B (frontend):**
- Add: 1 features module · 1 provider component · 1 BrandingTab page
- Modify: `main.tsx` · `WorkspacePage.tsx` · `ClientPillSidebar.tsx`
