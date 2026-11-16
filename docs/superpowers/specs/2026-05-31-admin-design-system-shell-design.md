# Admin Design System & Shell — Design Spec

**Date:** 2026-05-31
**Status:** Approved (visual direction + shell + primitives validated via brainstorm mockups)
**Sub-project:** A (foundation) of the Admin UI rebuild.

## Context — the larger rebuild

The admin UI is being rebuilt comprehensively. The work is decomposed into three independently-buildable sub-projects, each with its own spec → plan → implementation cycle:

- **A — Admin Design System & Shell** *(this spec)* — the visual language, the navigation shell, and the shared primitive components every section reuses. Foundation; everything else adopts it.
- **B — Admin CRM (Full Management)** — net-new cross-workspace, super-admin-guarded, audited backend + a new frontend section to view and edit/pause any workspace's CRM (campaigns, sequences, enrollments, leads). Separate spec.
- **C — Section rebuilds** — the existing 12 sections re-skinned onto this system, in four cluster waves (Overview · Warmup network · Customers & money · Governance). Separate spec(s).

This spec covers **A only**. It delivers the shell, the tokens, the primitive components, and one fully-converted reference section (Users) that the rest of C follows.

## Goals

1. A single, cohesive admin visual language — "Aurora Glass" — applied through the shell and a set of reusable primitives, so all 13 sections look like one product.
2. A navigation shell that scales to **13 sections** (12 existing + the new CRM) grouped into four clusters, with labels (today's icon-only pill doesn't scale or group well).
3. Remove the legacy **violet** active-state leftover; conform to the Shailog-orange palette only.
4. Make per-section rebuilds (sub-project C) mostly a matter of composing existing primitives, not bespoke layout.

Non-goals: rebuilding each section's content/data (that's C); building Admin CRM (that's B); any backend change.

## Visual direction — "Aurora Glass"

Evolved, refined version of today's dark admin look:

- **Canvas:** dark base (`#0b0d15` → `#1b1430`-tinted radial), a faint fixed grid, and **soft aurora glows**. Aurora stays in the **warm/orange family + neutral dark only — no purple/violet/blue/teal** (honors the established palette rule; the brainstorm mockup's secondary purple glow is replaced with a warm amber/neutral glow).
- **Surfaces:** translucent "glass" panels — `rgba(255,255,255,0.05)` fill, `1px rgba(255,255,255,0.10)` border, `backdrop-filter: blur(10px)`, radius 14–18px.
- **Accent:** Shailog orange `--wp-accent #F26522` → `--wp-accent-2 #FF8A4B` gradient for primary actions, active nav marker, focus.
- **Semantic:** success `#3ddc97`, warning/mid `#FF8A4B`, danger `#ff5c7a`. Neutrals for text: `#fff`, dim `rgba(255,255,255,0.6)`, faint `rgba(255,255,255,0.4)`.
- **Typography:** existing app font stack; tight headings (page title ~22px/700, -0.2px), uppercase micro-labels (9px, 0.8px tracking) for groups and stat-card labels.

### Tokens

Introduce an admin theme stylesheet (extend the existing `admin-shell.css`, or a sibling `admin-theme.css`) that defines glass-surface, aurora, radius, and elevation tokens as CSS custom properties, building on the existing `--wp-*` brand tokens. No raw hex in components — components consume tokens. Avatar/identity colors use a warm/neutral generated palette (no purple).

## The shell — collapsible labeled rail (S3)

Replaces `AdminPillSidebar` (the floating icon-only pill).

- **Default:** full-height glass rail, ~208px, icon **+ label** per item, with **uppercase group headers**:
  - **Overview** — Dashboard, Platform Analytics, System Health
  - **Warmup network** — Peer Inboxes, Pool Routing, LLM Usage
  - **Customers & money** — Users, **CRM** *(new)*, Plans & Pricing, Billing, **Payments** *(now surfaced in nav)*
  - **Governance** — Audit Log, Settings
- **Collapsed:** toggle shrinks it to a slim (~64px) icon rail; hovering a group flies the labels out in a glass popover. Collapse state persists (localStorage via the existing auth/theme store pattern, or a small dedicated store).
- **Active item:** orange left-marker + faint orange-gradient row background. **No violet anywhere.**
- **Header:** brand mark + collapse chevron. **Footer:** identity avatar (initials, warm palette) + email + logout.
- **Layout:** `AdminLayout` reserves the rail's current width (expanded/collapsed) rather than the fixed 76px pill padding; main content fills the rest. Keep the `PageTransition` + `AuthGuard requireRole="super_admin"`.

## Page header pattern

A reusable header for every section: title + a one-line subtitle/count on the left; a right cluster of (optional) search, secondary actions (e.g., Export), and one orange primary action. Consistent spacing above the content grid.

## Shared primitives (the reusable kit)

Built in a new `components/admin/` set, glass-styled from the tokens. Where a client `components/ui` primitive already exists, wrap/extend it rather than fork behavior.

| Primitive | Purpose | Used by |
|-----------|---------|---------|
| `AdminPageHeader` | title + subtitle + actions + search | every section |
| `AdminStatCard` | label + value + delta + optional mini sparkline | Dashboard, Users, Peer Inboxes, CRM, … |
| `AdminDataTable` | glass table shell — header row, hover/selected rows, dividers; column config | Users, Peer Inboxes, Pool Routing, Audit Log, Payments, CRM |
| `AdminDetailDrawer` | right-side glass drawer (overlay + scrim, close, action footer) | Users, Peer Inboxes, CRM |
| `StatusPill` | dot + label, semantic color | tables across sections |
| `Chip` | plan/tag chip | Users, Plans, CRM |
| `MeterBar` | inline progress/warmth bar + value | Users, Peer Inboxes |
| Buttons / search | primary (orange gradient), ghost, danger-ghost; glass search input | everywhere |
| Chart theme | shared recharts theme (axis/grid/tooltip/series colors) | dashboard charts, analytics |
| Empty / loading / error states | glass skeletons + empty placeholders | every async view |

## Reference implementation

Convert the **Users** page (`pages/admin/UsersPage.tsx` + `pages/admin/users/*`) onto the new shell + primitives as the worked example. This proves the kit end-to-end and becomes the template the C-wave section rebuilds copy. No change to the Users data/API — presentation only.

## Files touched / added (indicative)

- **Changed:** `components/layout/AdminLayout.tsx` (width handling), `components/layout/nav-config.ts` (grouped clusters + CRM + Payments), `admin-shell.css` (tokens/aurora), `pages/admin/UsersPage.tsx` (+ `users/*`) as the reference.
- **Added:** `components/layout/AdminRail.tsx` (replaces `AdminPillSidebar`), `components/admin/*` primitives, admin chart theme, collapse-state store.
- **Removed/retired:** `components/layout/AdminPillSidebar.tsx` and the violet active-state styles.

## Verification

- `pnpm typecheck` and `pnpm build` clean (strict TS).
- No `purple|violet|#7c5cff|indigo|cyan|teal` introduced (grep gate, per the established palette rule).
- Users page renders with real data through the new primitives; rail collapse/expand persists; active state is orange; `super_admin` guard intact.
- Visual parity with the approved mockup (rail groups, glass cards, table, drawer).

## Out of scope (separate sub-projects)

- Admin CRM feature — backend + frontend (sub-project B).
- Re-skinning the other 11 sections (sub-project C, four cluster waves).
- Any backend/API change.
