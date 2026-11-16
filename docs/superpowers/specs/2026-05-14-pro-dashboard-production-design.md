# Pro Dashboard — production wiring (sub-project 1 of 10)

**Date:** 2026-05-14
**Owner:** Frontend
**Status:** Approved (verbal)
**Scope:** Wire the locked P6 Bento layout into the production `/app/dashboard` route for Pro-tier users, populated with real backend data.

## Context

The Pro client experience for `/app/*` is being built section-by-section as 10 independent sub-projects (see commit history / earlier session — decomposition decided). This spec covers **only the Dashboard slice**, intentionally the vertical slice that proves the per-section pattern (variant + real data hooks + tier dispatch + loading/empty/error states).

The 9 remaining Pro sections (Mailboxes, Activity, Analytics, Reputation, Tools, Reports, Workspace, Billing, Settings) each get their own spec → plan → implementation cycle later.

## Why this sub-project ships first

- The vertical slice. Smallest scope that exercises every layer of the per-section pattern.
- `DashboardPage.tsx` already dispatches by tier (`isStarter → StarterDashboard`, fallback → `LegacyDashboard`). Adding a Pro branch is a 2-line change.
- All required data hooks already exist in `features/dashboard/api.ts` — no backend work.
- Dashboard is the most-visited page, so visible value lands first.

## Goal

When a logged-in user with `plan === 'pro'` visits **`/app/dashboard`**, they see the P6 Bento layout populated with real backend data from existing endpoints, with proper loading / empty / error states.

Starter users continue to see `StarterDashboard`. Agency and unknown plans continue to fall back to `LegacyDashboard` (will be handled in their own sub-projects later).

## Locked design being wired

**P6 Bento Layout** — asymmetric bento grid:
```
┌─────────────────────┬───────────────┬─────────────┐
│       HERO          │  TODAY STATS  │  MAILBOXES  │
│   (workspace        │  (sent +      │  (status +  │
│    warmth)          │   opens)      │   warmth)   │
├─────────────────────┼───────────────┴─────────────┤
│  SENDS 30D (wide)   │       LIVE FEED             │
└─────────────────────┴─────────────────────────────┘
```
Source: `frontend/src/pages/client-design-preview/pro-dashboards/P6Bento.tsx`
Styles: `frontend/src/pages/client-design-preview/pro-dashboards/pro-dashboards.css` (`.pd-bento__*`)

## Architecture

**New file**: `frontend/src/pages/client/dashboards/ProDashboard.tsx`

Located next to the existing `StarterDashboard.tsx` for symmetry. This file rebuilds the P6 Bento JSX with real-data hooks inside, rather than importing `P6Bento` directly — because `P6Bento` is demo-data-driven with no props. The preview file stays untouched so variant comparison at `/client-design-preview/dashboards/pro` keeps working.

**CSS strategy for v1**:
```ts
// ProDashboard.tsx
import '@/pages/client-design-preview/pro-dashboards/pro-dashboards.css';
// TODO: lift styles into pages/client/dashboards/pro-dashboard.css in a follow-up
// cleanup commit (production code shouldn't import from a /client-design-preview/
// folder long-term).
```

**Dispatch update** in `frontend/src/pages/client/DashboardPage.tsx`:

```diff
- if (isStarter) return <StarterDashboard />;
- return <LegacyDashboard />;
+ if (isStarter) return <StarterDashboard />;
+ if (isPro) return <ProDashboard />;
+ return <LegacyDashboard />;  // Agency / unknown
```

`usePlan()` already returns `{ isStarter, isPro, isAgency, isLoading }` so the conditional is a one-liner.

## Data flow

All hooks already exist in `features/dashboard/api.ts` and `features/mailboxes/api.ts`. No new endpoints, no backend work for this sub-project.

| P6 tile | Hook | Field consumed | Server endpoint |
|---|---|---|---|
| Workspace warmth hero number | `useDashboardSummary()` | `warmth_score` | `GET /workspace/analytics/dashboard/summary` |
| Hero per-mailbox warmth pills | `useMailboxes()` | `items[].warmth_score` | `GET /workspace/mailboxes` |
| "X sent today" | `useTodayStats()` | `sent` | `GET /workspace/warmup-activity/today-stats` |
| "X opens today" | `useTodayStats()` | `opens` | `GET /workspace/warmup-activity/today-stats` |
| Mailboxes panel rows | `useMailboxes()` | `items[]` (status + warmth) | `GET /workspace/mailboxes` |
| 30-day sends sparkline | `useDashboardSummary()` | `trend_30d[].warmth_score` | `GET /workspace/analytics/dashboard/summary` |
| Live activity feed (5 rows) | `useActivityFeed(5)` | top 5 events | `GET /workspace/warmup-activity?limit=5` |

All hooks 404-fallback to derived values from the mailbox list, so the page renders even on a fresh install before all endpoints land.

## State coverage

**Loading** — per-tile skeletons using the existing `animate-pulse rounded bg-surface-2/60` pattern (already used in `DashboardPage`):
- Hero card: rectangle skeleton matching hero's height
- Mailboxes list: 5 pulse rows
- Sparkline: full-width pulse bar
- Today stats: two square pulses
- Live feed: 5 pulse rows

Plan-resolving skeleton (`isLoading` from `usePlan()`) renders briefly until tier is known — already present in current `DashboardPage`.

**Empty (0 mailboxes connected)** — same as Legacy fallback. Render the existing `<EmptyState>` component with:
- Title: "No mailboxes connected"
- Description: "Finish onboarding to connect your first mailbox and start warming up."
- CTA: "Complete onboarding" → `/onboarding`

**Partial (<5 mailboxes)** — P6's grid renders fewer rows / fewer hero pills naturally. No special handling needed. We expect Pro users to have up to 5 mailboxes per `PLAN_CAPS` (`pro: 5`).

**Per-tile error** — if any query throws (non-404), that tile shows:
```
<div class="pd-bento__tile-error">
  Couldn't load — <button>retry</button>
</div>
```
Other tiles keep rendering. The retry button calls `query.refetch()`.

## What's NOT in this sub-project

Explicit deferrals to future sub-projects:

- The 9 other Pro sections (each their own spec)
- New backend endpoints (none needed)
- Agency dashboard (separate sub-project, will use the same dispatch pattern)
- Mobile-first responsive pass (P6 is desktop-primary; will degrade gracefully)
- Lifting `pro-dashboards.css` from the preview folder into a production location (follow-up cleanup commit)
- Visual refinement of P6 (locked in)
- The `useDashboardSummary` 30d trend fallback synthesizing fake history when endpoint 404s — not pretty on day 0, but out of scope here

## Verification

- `pnpm typecheck` passes
- Manual dev test: set `localStorage.WP_PLAN_OVERRIDE='pro'`, log in, visit `/app/dashboard` → see P6 populated with real data
- Empty test: Pro user with 0 mailboxes → "No mailboxes connected" empty state with onboarding CTA
- Loading test: Chrome DevTools network throttle → per-tile pulse skeletons visible
- Error test: stop backend → per-tile error messages, page still renders the rest
- No regression in Starter (`isStarter=true` still shows S1 Focus Card)
- No regression in Legacy fallback (Agency / unknown still shows LegacyDashboard)

## Risk

1. **Cross-folder CSS import** (preview → production): structurally weird. Mitigation: TODO comment in `ProDashboard.tsx`, cleanup commit before Pro Mailboxes ships so we don't compound the smell across 10 sections.
2. **Hardcoded 30d sparkline in P6Bento**: the preview hardcodes a sparkline data array. Production must replace this with `summary.trend_30d.map(p => p.warmth_score)`. Bug risk if mapping forgotten — covered by manual test step that compares the chart shape against API response.
3. **`isPro` is true for several plan strings** (`pro`, `scale`, `enterprise` based on the `usePlan()` normalization). Scale and Enterprise will fall into `<ProDashboard />` — is this desired? **Assumption: yes**, since they're Pro-or-higher tiers. Call out for confirmation during user review.

## File touch list

- **Modified** (1 file): `frontend/src/pages/client/DashboardPage.tsx` — add 1 line to dispatch
- **Added** (1 file): `frontend/src/pages/client/dashboards/ProDashboard.tsx` — the new production component, ~180 lines

No backend file changes, no migration, no new dependency, no new route.
