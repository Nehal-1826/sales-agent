# Pro App preview — integrated shell over 10 locked Pro designs

**Date:** 2026-05-14
**Owner:** Frontend
**Status:** Approved (verbal)
**Scope:** Preview-only. No backend wiring, no auth gating, no real data.

## Why

We ran a per-section design-picker process for the Pro tier and locked one variant per section (10 sections in total). Each lives at its own URL under `/client-design-preview/<section>/pro` and uses per-section demo data. That's fine for picking a direction but it doesn't show what the full **Pro client experience** feels like — sidebar, topbar, navigating between sections, identity, breadcrumbs.

This spec composes the 10 locked designs into a single integrated preview accessible at `/client-design-preview/pro-app/*` so we (and stakeholders) can see the whole Pro app as a real user would.

## Locked designs being composed

| Section | Locked variant | Component | File |
|---|---|---|---|
| 1. Dashboard | P6 Bento Layout | `P6Bento` | `pro-dashboards/P6Bento.tsx` |
| 2. Mailboxes | M4 Carousel Stage | `M4Carousel` | `pro-mailboxes/M4Carousel.tsx` |
| 3. Activity | A2 Mailbox Channels | `A2Channels` | `pro-activity/A2Channels.tsx` |
| 4. Analytics | N1 KPI Dashboard | `N1KpiDashboard` | `pro-analytics/N1KpiDashboard.tsx` |
| 5. Reputation | H2 Health Matrix | `H2Matrix` | `pro-reputation/H2Matrix.tsx` |
| 6. Tools | T6 Split Workbench | `T6Workbench` | `pro-tools/T6Workbench.tsx` |
| 7. Reports | R2 Builder Workspace | `R2Builder` | `pro-reports/R2Builder.tsx` |
| 8. Workspace | W7 Hub (W5+W6 fusion) | `W7Hub` | `pro-workspace/W7Hub.tsx` |
| 9. Billing | B6 Bento Hub | `B6BentoHub` | `pro-billing/B6BentoHub.tsx` |
| 10. Settings | S4 Tabs (cards) | `S4Tabs` | `pro-settings/S4Tabs.tsx` |

## Architecture

```
frontend/src/pages/client-design-preview/
├── ProApp.tsx                       # mounts the shell at /pro-app/*
└── pro-app/
    ├── ProAppShell.tsx              # sidebar + topbar + <Outlet />
    ├── ProAppDashboard.tsx          # 10 thin section wrappers, each ~10 lines
    ├── ProAppMailboxes.tsx          #   importing the locked variant and its CSS
    ├── ProAppActivity.tsx           #   (no logic in the wrapper itself)
    ├── ProAppAnalytics.tsx
    ├── ProAppReputation.tsx
    ├── ProAppTools.tsx
    ├── ProAppReports.tsx
    ├── ProAppWorkspace.tsx
    ├── ProAppBilling.tsx
    ├── ProAppSettings.tsx
    └── pro-app.css                  # chrome styling only
```

`ProApp.tsx` is the lazy-loaded route entry from `App.tsx`. It renders `<ProAppShell>` which contains the layout chrome and a react-router `<Outlet />`. The nested child routes each render one of the thin section wrappers, which in turn render the locked variant.

## The shell

**Sidebar** (260px, fixed left, scrollable when overflowing):

- **Top:** Workspace mark "A" (gradient violet square) + name `Acme · WarmPulse` + Pro crown badge.
- **Middle:** 10 nav items (icon + label). React-router `NavLink` — active item gets a violet-tinted pill background with white text. Hover gets a subtle bg.
- **Bottom:** User card — avatar (gradient circle), name `Alex Chen`, email `alex@acme.com`, Pro tier pill.

**Topbar** (60px, sticky):

- **Left:** Breadcrumb derived from active route (`Pro · WarmPulse / Dashboard`). Uses `useLocation()` to find the current section name from a constant map.
- **Right:** Cosmetic search input (`placeholder="Search… ⌘K"`), bell icon (decorative), theme toggle icon (decorative), user avatar dropdown trigger (decorative — no actual menu opens).

**Content area:** Scrollable region. `<Outlet />` renders the active section wrapper, which renders the locked design + its CSS. Each section keeps its own internal layout (P6's bento grid, M4's carousel, etc.).

All admin tokens: `--wp-bg`, `--wp-surface`, `--wp-surface-2`, `--wp-border`, `--wp-text*`, `--wp-accent*`, `--wp-success/warning/danger`. No new colors.

## Routes

Mounted at `/client-design-preview/pro-app/*` with nested children:

```
/client-design-preview/pro-app                → index redirect to /dashboard
/client-design-preview/pro-app/dashboard      → ProAppDashboard      → P6Bento
/client-design-preview/pro-app/mailboxes      → ProAppMailboxes      → M4Carousel
/client-design-preview/pro-app/activity       → ProAppActivity       → A2Channels
/client-design-preview/pro-app/analytics      → ProAppAnalytics      → N1KpiDashboard
/client-design-preview/pro-app/reputation     → ProAppReputation     → H2Matrix
/client-design-preview/pro-app/tools          → ProAppTools          → T6Workbench
/client-design-preview/pro-app/reports        → ProAppReports        → R2Builder
/client-design-preview/pro-app/workspace      → ProAppWorkspace      → W7Hub
/client-design-preview/pro-app/billing        → ProAppBilling        → B6BentoHub
/client-design-preview/pro-app/settings       → ProAppSettings       → S4Tabs
```

Existing per-section picker URLs (`/client-design-preview/dashboard/pro`, `/mailboxes/pro`, etc.) **are not touched** — they remain reachable for variant comparison.

## Data flow

Each section keeps its existing per-section demo data file. No consolidation:

- `pro-dashboards/demoData.ts` (also used by activity, mailboxes, reputation, analytics, workspace)
- `pro-tools/demoTools.ts`
- `pro-reports/demoReports.ts`
- `pro-billing/demoBilling.ts`
- `pro-settings/demoSettings.ts`
- etc.

The wrapper components don't pass props down — they just import the locked variant and render it. The variant pulls from its demo file. If we ever want to swap a variant (e.g. "try N3 for analytics"), it's a 1-line import change in `ProAppAnalytics.tsx`.

## Styling

- **New:** `pro-app/pro-app.css` for shell only (`.pa__shell`, `.pa__sidebar`, `.pa__topbar`, `.pa__content`, etc.). ~200 lines.
- **Reused:** Each per-section CSS file (e.g. `pro-workspace.css`, `pro-billing.css`) is imported by its corresponding wrapper component, so the locked design renders identically to its picker URL.
- **No changes** to existing per-section CSS, demo data, or variant components.

## Out of scope for v1

- Real backend wiring (no TanStack Query, no `/api` calls)
- Auth / tier gating (anyone can hit the URL)
- Working search (cosmetic input only)
- Working notifications panel (bell icon is decorative)
- Theme toggle actually toggling (decorative)
- User dropdown menu actually opening (decorative)
- Settings persisting (S4's form values are still cosmetic)
- Mobile-first responsive layout (desktop-primary, will degrade gracefully but not optimized for phones)

These are explicit deferrals — each becomes its own future spec if/when the Pro app becomes production-targeted.

## Verification

- `pnpm typecheck` passes
- All 11 routes resolve (1 redirect + 10 section routes)
- Sidebar `NavLink` active state highlights the current section
- Each section renders identically to its existing standalone picker URL
- No new console warnings
- No new lucide-icon runtime mismatches (verify icons used in shell)

## Risks

| Risk | Mitigation |
|---|---|
| Lucide icon runtime mismatch (we've hit this before in v0.447.0) | Run icon verification node script before writing shell code |
| Locked variant CSS uses high-level selectors that conflict in the shared shell layout | All variant CSS is namespaced under per-variant prefixes (`p6__`, `m4__`, `a2__`, etc.) — no conflicts expected |
| Adding 10 new lazy routes inflates bundle | Each section is lazy-loaded individually via `React.lazy` |

## Future work (explicitly NOT in this spec)

- Promote locked designs into a clean `/pages/client/pro/` folder (production layout)
- Wire to real `/api` endpoints
- Add tier gating (Pro users see Pro pages, Starter users see Starter pages, Agency users see Agency pages)
- Build the Agency-tier equivalent (10 more sections)
- Mobile-first responsive pass
