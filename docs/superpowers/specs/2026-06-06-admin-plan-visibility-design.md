# Admin plan visibility — single source of truth (hero + onboarding + pricing)

- **Date:** 2026-06-06
- **Status:** Approved (inline)

## Problem

The admin can hide a plan via the `is_public` flag (Eye toggle on `/admin/plans` →
`PATCH /api/plans/{id}`). The public `GET /api/plans` endpoint already filters to
`is_active AND is_public`. **Pricing** (`HeroSections`) and **onboarding**
(`PlanPicker`) already consume that endpoint and respect the flag. But the landing
**hero dashboard carousel is hardcoded** (`PLAN_TIERS` = starter / pro / pro_plus;
the Agency tier + its preview were removed when Agency was "held") and ignores
`is_public`.

**Goal:** make the admin `is_public` flag the single source of truth across the
hero, pricing, and onboarding — and preview all four tier dashboards in the hero,
gated by the flag. Hiding a plan in admin removes it from all three surfaces;
showing it brings it back (hero with its dashboard preview).

## Design

1. **Source of truth:** `GET /api/plans` (public, already filtered to
   `is_active AND is_public`). No backend change required — `is_public` is fully
   implemented (model default `true`, public vs `/api/plans/all` admin list,
   `PATCH` toggle, `PlanOut.is_public` exposed).

2. **Hero carousel (`frontend/src/pages/landing/NewHero.tsx`):**
   - Restore `AgencyPreview` + `AGENCY_NODES` + the `AgencyNode` type (the **D3
     Tiered constellation** — the user's locked Agency design) from commit
     `2154da3^` (before Agency was held). Re-add `agency` to `PLAN_TIERS` and the
     `{tier.key === 'agency' && <AgencyPreview tier={tier} />}` render branch.
   - Add a `usePublicPlans()` query (`GET /api/plans`) and **filter `PLAN_TIERS`
     to the tiers whose plan is public**, matching by plan `key` first, then a
     normalized `name`. On loading/error → show all tiers (fail-open; never blank
     the hero).

3. **Onboarding + pricing:** already filter by `/api/plans`. **Verify end-to-end**
   that a hidden plan disappears from all three surfaces; harden the pricing
   section's name-matching (trim + lowercase, fall back to plan `key`) and ensure
   the public-plans query is not served stale after an admin toggle (short
   `staleTime` / invalidate).

4. **Verification:** toggle Agency hidden in admin → confirm it vanishes from hero
   + pricing + onboarding; toggle visible → confirm it returns with the D3 Tiered
   preview.

## Edge cases

- **API loading/error** → hero shows all tiers (fail-open), so a slow/broken API
  never blanks the showcase.
- **Plan key/name mismatch** → match by `key` first, then normalized `name`.
- **Query staleness** → the public-plans query uses a short `staleTime`; admin
  toggle invalidates it so changes show without a hard reload.

## Out of scope

- No backend changes (`is_public` already works end-to-end).
- Agency stays `is_public = true` by default; the admin controls its visibility.
