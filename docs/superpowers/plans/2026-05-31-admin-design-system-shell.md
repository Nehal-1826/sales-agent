# Admin Design System & Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Aurora Glass" admin design system — a tokenized theme, a collapsible labeled navigation rail (13 sections in 4 clusters), and a reusable primitive kit (page header, stat card, data table, detail drawer, pills/chips/meter, chart theme) — and convert the Users page onto it as the reference implementation.

**Architecture:** A CSS token layer (`admin-theme.css`) drives glass surfaces + aurora within the existing `--wp-*` Shailog-orange palette. A new `AdminRail` (replacing `AdminPillSidebar`) renders grouped nav from a data structure in `nav-config.ts`, with collapse state in a small zustand store. Self-contained presentational primitives live in `components/admin/` and are class-driven so sections compose them without bespoke CSS. The Users page is rewritten to use these primitives as the template every later section copies.

**Tech Stack:** React 18 + TypeScript (strict), Vite, react-router-dom, framer-motion, lucide-react, zustand, TanStack Query (existing data hooks unchanged). Recharts where charts already exist.

**Verification model (no frontend unit-test runner exists):** the only frontend scripts are `pnpm typecheck` (`tsc --noEmit`) and `pnpm build` (`tsc -b && vite build`). So each task's gate is **`cd frontend && pnpm typecheck`** (and `pnpm build` at the end of each phase), plus a **visual check** via the existing admin design-preview harness / running `pnpm dev` and viewing `/admin/*`. There are no `*.test.tsx` to write.

**Branch:** work happens in the current worktree branch `claude/zen-brahmagupta-fc776a` (already checked out). Do NOT push; commit only.

---

## File Structure

**Created:**
- `frontend/src/components/layout/admin-theme.css` — Aurora Glass tokens + shell + rail + primitive classes.
- `frontend/src/components/layout/AdminRail.tsx` — collapsible labeled rail (replaces the pill).
- `frontend/src/stores/adminUi.ts` — zustand store for rail collapse state (persisted).
- `frontend/src/components/admin/index.ts` — barrel export for primitives.
- `frontend/src/components/admin/AdminPageHeader.tsx`
- `frontend/src/components/admin/AdminStatCard.tsx`
- `frontend/src/components/admin/StatusPill.tsx`
- `frontend/src/components/admin/Chip.tsx`
- `frontend/src/components/admin/MeterBar.tsx`
- `frontend/src/components/admin/AdminDataTable.tsx`
- `frontend/src/components/admin/AdminDetailDrawer.tsx`
- `frontend/src/components/admin/chart-theme.ts` — shared recharts/SVG color theme.
- `frontend/src/pages/admin/CrmManagementPage.tsx` — placeholder so the new `/admin/crm` nav item doesn't 404 (real feature is sub-project B).

**Modified:**
- `frontend/src/components/layout/nav-config.ts` — add `ADMIN_NAV_GROUPS` (4 clusters, 13 items incl. CRM + Payments); keep `ADMIN_NAV` as a flat derived export for back-compat.
- `frontend/src/components/layout/AdminLayout.tsx` — render `AdminRail`, reserve rail width, import `admin-theme.css`.
- `frontend/src/components/layout/admin-shell.css` — fix stale "violet" comments (no color change).
- `frontend/src/App.tsx` — add `/admin/crm` route (placeholder page).
- `frontend/src/pages/admin/UsersPage.tsx` — rewrite presentation onto the primitive kit (data hooks/handlers preserved).

**Retired:**
- `frontend/src/components/layout/AdminPillSidebar.tsx` — deleted after `AdminLayout` stops importing it.

---

## PHASE 1 — Shell & tokens

### Task 1: Aurora Glass token layer

**Files:**
- Create: `frontend/src/components/layout/admin-theme.css`
- Modify: `frontend/src/components/layout/admin-shell.css:1-5` (comment only)

- [ ] **Step 1: Create the token + base classes file**

Create `frontend/src/components/layout/admin-theme.css`:

```css
/* =============================================================================
   Aurora Glass — admin design system tokens. Builds on the shared Shailog
   orange brand tokens (var(--wp-*)). No purple/violet/blue/teal: the aurora
   stays warm (orange family) + neutral dark, per the brand palette rule.
============================================================================= */
.admin-shell {
  /* glass surfaces */
  --ag-glass: rgba(255, 255, 255, 0.05);
  --ag-glass-strong: rgba(255, 255, 255, 0.08);
  --ag-border: rgba(255, 255, 255, 0.10);
  --ag-border-strong: rgba(255, 255, 255, 0.16);
  --ag-blur: blur(10px) saturate(160%);
  /* text on glass */
  --ag-text: #ffffff;
  --ag-text-dim: rgba(255, 255, 255, 0.62);
  --ag-text-faint: rgba(255, 255, 255, 0.42);
  /* radii + elevation */
  --ag-radius: 14px;
  --ag-radius-lg: 18px;
  --ag-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
  /* rail widths */
  --ag-rail-w: 212px;
  --ag-rail-w-collapsed: 64px;
}

/* Reusable glass panel */
.ag-panel {
  background: var(--ag-glass);
  border: 1px solid var(--ag-border);
  backdrop-filter: var(--ag-blur);
  -webkit-backdrop-filter: var(--ag-blur);
  border-radius: var(--ag-radius);
}

/* Primary + ghost + danger buttons (class-driven so primitives stay self-contained) */
.ag-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; line-height: 1;
  padding: 8px 14px; border-radius: 10px; cursor: pointer;
  border: 1px solid transparent; text-decoration: none; white-space: nowrap;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.ag-btn--primary {
  color: #fff;
  background: linear-gradient(135deg, var(--wp-accent), var(--wp-accent-2, #FF8A4B));
  box-shadow: 0 4px 14px color-mix(in srgb, var(--wp-accent) 35%, transparent);
}
.ag-btn--primary:hover { transform: translateY(-1px); }
.ag-btn--ghost {
  color: var(--ag-text-dim);
  background: var(--ag-glass);
  border-color: var(--ag-border);
}
.ag-btn--ghost:hover { color: var(--ag-text); border-color: var(--ag-border-strong); }
.ag-btn--danger {
  color: var(--wp-danger, #ff5c7a);
  background: color-mix(in srgb, var(--wp-danger, #ff5c7a) 12%, transparent);
  border-color: color-mix(in srgb, var(--wp-danger, #ff5c7a) 35%, transparent);
}

/* Glass search input */
.ag-search {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--ag-glass); border: 1px solid var(--ag-border);
  border-radius: 10px; padding: 7px 11px; color: var(--ag-text-faint);
}
.ag-search input {
  background: transparent; border: 0; outline: 0; color: var(--ag-text);
  font-size: 12px; width: 160px;
}
.ag-search input::placeholder { color: var(--ag-text-faint); }
```

(Component-specific classes — rail, page header, stat card, table, drawer, pill, chip, meter — are appended to this file in the tasks that introduce them, so each component's styles live with its task.)

- [ ] **Step 2: Fix the stale "violet" comment in admin-shell.css**

In `frontend/src/components/layout/admin-shell.css`, replace the header comment block lines 1–5:

```css
/* =============================================================================
   Admin shell — full-bleed dark canvas + Aurora Glass rail. Uses the shared
   Shailog-orange glass design tokens (var(--wp-*) + var(--ag-*)).
============================================================================= */
```

- [ ] **Step 3: Typecheck (CSS-only so far; just confirm nothing broke)**

Run: `cd frontend && pnpm typecheck`
Expected: PASS (no TS changes yet).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/admin-theme.css frontend/src/components/layout/admin-shell.css
git commit -m "feat(admin): add Aurora Glass token layer; fix stale violet comment"
```

---

### Task 2: Grouped admin navigation config

**Files:**
- Modify: `frontend/src/components/layout/nav-config.ts:44-57`

- [ ] **Step 1: Add the grouped structure (and keep the flat export)**

Replace the `ADMIN_NAV` block (lines 44–57) with:

```ts
/** A cluster of admin nav items shown under one uppercase header. */
export interface NavGroup {
  group: string;
  items: NavItem[];
}

/** Admin navigation — 13 sections in 4 clusters (rebuild). */
export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Platform Analytics', to: '/admin/platform-analytics', icon: LineChart },
      { label: 'System Health', to: '/admin/system-health', icon: HeartPulse },
    ],
  },
  {
    group: 'Warmup network',
    items: [
      { label: 'Peer Inboxes', to: '/admin/peer-inboxes', icon: Network },
      { label: 'Pool Routing', to: '/admin/pool-routing', icon: GitBranch },
      { label: 'LLM Usage', to: '/admin/llm-usage', icon: Sparkles },
    ],
  },
  {
    group: 'Customers & money',
    items: [
      { label: 'Users', to: '/admin/users', icon: Users },
      { label: 'CRM', to: '/admin/crm', icon: Contact },
      { label: 'Plans & Pricing', to: '/admin/plans', icon: CreditCard },
      { label: 'Billing', to: '/admin/billing', icon: Wallet },
      { label: 'Payments', to: '/admin/payments', icon: Wallet },
    ],
  },
  {
    group: 'Governance',
    items: [
      { label: 'Audit Log', to: '/admin/audit-log', icon: ScrollText },
      { label: 'Settings', to: '/admin/settings', icon: Settings },
    ],
  },
];

/** Flat list (back-compat for any consumer that imports ADMIN_NAV). */
export const ADMIN_NAV: NavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
```

> Note: `Contact` is already imported at the top of the file (used by `CLIENT_NAV`); `Wallet` is already imported. No new imports needed.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/nav-config.ts
git commit -m "feat(admin): grouped 13-section nav config (adds CRM + Payments)"
```

---

### Task 3: Rail collapse store

**Files:**
- Create: `frontend/src/stores/adminUi.ts`

- [ ] **Step 1: Create the store (persisted to localStorage)**

Create `frontend/src/stores/adminUi.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminUiState {
  railCollapsed: boolean;
  toggleRail: () => void;
  setRailCollapsed: (v: boolean) => void;
}

/** Admin shell UI prefs. Persisted so the rail's collapsed state survives reloads. */
export const useAdminUi = create<AdminUiState>()(
  persist(
    (set) => ({
      railCollapsed: false,
      toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
      setRailCollapsed: (v: boolean) => set({ railCollapsed: v }),
    }),
    { name: 'wp-admin-ui' },
  ),
);
```

> `zustand` + `zustand/middleware` are already dependencies (the existing `stores/auth.ts` / `stores/theme.ts` use them — match their import style if it differs).

- [ ] **Step 2: Typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/adminUi.ts
git commit -m "feat(admin): rail collapse store (persisted)"
```

---

### Task 4: AdminRail component (S3 collapsible labeled rail)

**Files:**
- Create: `frontend/src/components/layout/AdminRail.tsx`
- Modify: `frontend/src/components/layout/admin-theme.css` (append rail styles)

- [ ] **Step 1: Append rail styles to admin-theme.css**

Append to `frontend/src/components/layout/admin-theme.css`:

```css
/* ---------- AdminRail ---------- */
.ag-rail {
  position: fixed; top: 14px; bottom: 14px; left: 14px; z-index: 20;
  width: var(--ag-rail-w);
  display: flex; flex-direction: column; padding: 14px 10px;
  background: var(--ag-glass); border: 1px solid var(--ag-border);
  backdrop-filter: var(--ag-blur); -webkit-backdrop-filter: var(--ag-blur);
  border-radius: var(--ag-radius-lg); box-shadow: var(--ag-shadow);
  transition: width 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.ag-rail--collapsed { width: var(--ag-rail-w-collapsed); }
.ag-rail__top { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 10px; }
.ag-rail__brand { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: var(--ag-text); }
.ag-rail__brand-mark { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg, var(--wp-accent), var(--wp-accent-2, #FF8A4B)); flex-shrink: 0; }
.ag-rail__brand-name { font-weight: 700; font-size: 13px; }
.ag-rail--collapsed .ag-rail__brand-name { display: none; }
.ag-rail__toggle { appearance: none; background: transparent; border: 0; color: var(--ag-text-faint); cursor: pointer; padding: 4px; border-radius: 7px; }
.ag-rail__toggle:hover { color: var(--ag-text); background: var(--ag-glass-strong); }
.ag-rail__nav { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; display: flex; flex-direction: column; gap: 2px; }
.ag-rail__nav::-webkit-scrollbar { display: none; }
.ag-rail__group { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: var(--ag-text-faint); padding: 12px 8px 4px; }
.ag-rail--collapsed .ag-rail__group { text-align: center; padding: 10px 0 4px; opacity: 0.5; }
.ag-rail__item {
  position: relative; display: flex; align-items: center; gap: 10px;
  padding: 8px; border-radius: 9px; color: var(--ag-text-dim);
  text-decoration: none; font-size: 12.5px; transition: background 160ms ease, color 160ms ease;
}
.ag-rail__item:hover { color: var(--ag-text); background: var(--ag-glass-strong); }
.ag-rail__item--active {
  color: #fff; font-weight: 600;
  background: linear-gradient(90deg, color-mix(in srgb, var(--wp-accent) 28%, transparent), transparent);
  box-shadow: inset 2px 0 0 var(--wp-accent);
}
.ag-rail__item svg { flex-shrink: 0; }
.ag-rail--collapsed .ag-rail__label { display: none; }
.ag-rail--collapsed .ag-rail__item { justify-content: center; }
.ag-rail__badge { margin-left: auto; font-size: 8px; background: color-mix(in srgb, var(--wp-accent) 25%, transparent); color: var(--wp-accent-2, #FF8A4B); padding: 1px 6px; border-radius: 6px; }
.ag-rail--collapsed .ag-rail__badge { display: none; }
/* collapsed hover tooltip */
.ag-rail__tip { position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%); white-space: nowrap; padding: 5px 9px; border-radius: 8px; background: rgba(20,18,28,0.95); border: 1px solid var(--ag-border); font-size: 11px; opacity: 0; pointer-events: none; transition: opacity 140ms ease; z-index: 30; }
.ag-rail:not(.ag-rail--collapsed) .ag-rail__tip { display: none; }
.ag-rail--collapsed .ag-rail__item:hover .ag-rail__tip { opacity: 1; }
.ag-rail__footer { display: flex; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px solid var(--ag-border); }
.ag-rail__avatar { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; background: color-mix(in srgb, var(--wp-accent) 22%, transparent); border: 1px solid color-mix(in srgb, var(--wp-accent) 40%, transparent); color: var(--wp-accent); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
.ag-rail__identity { min-width: 0; font-size: 11px; color: var(--ag-text-dim); line-height: 1.2; overflow: hidden; }
.ag-rail--collapsed .ag-rail__identity, .ag-rail--collapsed .ag-rail__logout-label { display: none; }
.ag-rail__logout { margin-left: auto; appearance: none; background: transparent; border: 0; color: var(--ag-text-faint); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 11px; }
.ag-rail__logout:hover { color: var(--wp-danger, #ff5c7a); }
```

- [ ] **Step 2: Create the component**

Create `frontend/src/components/layout/AdminRail.tsx`:

```tsx
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useAdminUi } from '@/stores/adminUi';
import { ADMIN_NAV_GROUPS } from './nav-config';

/**
 * Aurora Glass admin rail (design S3). Full-height glass rail with grouped,
 * labeled nav; collapses to an icon rail (state persisted in useAdminUi).
 * Replaces the old icon-only AdminPillSidebar.
 */
export function AdminRail() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const collapsed = useAdminUi((s) => s.railCollapsed);
  const toggleRail = useAdminUi((s) => s.toggleRail);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = (user?.email ?? 'A').slice(0, 2).toUpperCase();

  return (
    <motion.aside
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`ag-rail ${collapsed ? 'ag-rail--collapsed' : ''}`}
      aria-label="Admin navigation"
    >
      <div className="ag-rail__top">
        <NavLink to="/admin/dashboard" className="ag-rail__brand" aria-label="Admin home">
          <span className="ag-rail__brand-mark" aria-hidden />
          <span className="ag-rail__brand-name">WarmPulse</span>
        </NavLink>
        <button
          type="button"
          className="ag-rail__toggle"
          onClick={toggleRail}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      <nav className="ag-rail__nav">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.group}>
            <div className="ag-rail__group">{collapsed ? '•' : group.group}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `ag-rail__item ${isActive ? 'ag-rail__item--active' : ''}`
                }
              >
                <item.icon size={16} strokeWidth={2.1} />
                <span className="ag-rail__label">{item.label}</span>
                {item.label === 'CRM' && <span className="ag-rail__badge">NEW</span>}
                <span className="ag-rail__tip" role="tooltip">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="ag-rail__footer">
        <span className="ag-rail__avatar" aria-hidden>{initials}</span>
        <span className="ag-rail__identity" title={user?.email ?? 'Admin'}>
          Super Admin<br />{user?.email ?? ''}
        </span>
        <button type="button" className="ag-rail__logout" onClick={handleLogout} aria-label="Log out">
          <LogOut size={14} />
          <span className="ag-rail__logout-label">Logout</span>
        </button>
      </div>
    </motion.aside>
  );
}
```

> Verify `useAuthStore` exposes `user` + `logout` (it does — `AdminPillSidebar` uses both). Match the exact selector style already in that file.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AdminRail.tsx frontend/src/components/layout/admin-theme.css
git commit -m "feat(admin): AdminRail — collapsible grouped glass rail"
```

---

### Task 5: Wire the rail into AdminLayout + retire the pill

**Files:**
- Modify: `frontend/src/components/layout/AdminLayout.tsx`
- Modify: `frontend/src/components/layout/admin-shell.css:56-70` (main padding → use rail width var)
- Modify: `frontend/src/components/layout/admin-theme.css` (append main offset)
- Delete: `frontend/src/components/layout/AdminPillSidebar.tsx`

- [ ] **Step 1: Update AdminLayout to render AdminRail + import the theme**

Replace `frontend/src/components/layout/AdminLayout.tsx` with:

```tsx
import { Outlet, useLocation } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { AdminRail } from './AdminRail';
import { useAdminUi } from '@/stores/adminUi';
import { PageTransition } from '@/components/brand/RouteLoader';
import '@/pages/landing/hero-theme.css';
import './admin-shell.css';
import './admin-theme.css';

/**
 * Admin shell — Aurora Glass canvas with the collapsible labeled rail (S3).
 * The rail is position:fixed; main content reserves its width via a left
 * margin that tracks the collapsed state.
 */
export function AdminLayout() {
  const { pathname } = useLocation();
  const collapsed = useAdminUi((s) => s.railCollapsed);
  return (
    <AuthGuard requireRole="super_admin">
      <div className={`admin-shell ${collapsed ? 'admin-shell--rail-collapsed' : ''}`}>
        <div className="admin-shell__atmosphere" aria-hidden>
          <div className="admin-shell__aurora-1" />
          <div className="admin-shell__aurora-2" />
          <div className="admin-shell__grid" />
        </div>
        <AdminRail />
        <main className="admin-shell__main">
          <PageTransition pathKey={pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Make the main offset track the rail width**

In `frontend/src/components/layout/admin-shell.css`, replace the `.admin-shell__main` padding rule (line ~60) so the left padding uses the rail width:

```css
.admin-shell__main {
  position: relative;
  z-index: 1;
  padding: 32px 28px 80px;
  padding-left: calc(var(--ag-rail-w) + 40px);
  max-width: 1480px;
  margin: 0 auto;
  transition: padding-left 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.admin-shell--rail-collapsed .admin-shell__main {
  padding-left: calc(var(--ag-rail-w-collapsed) + 40px);
}
@media (max-width: 720px) {
  .admin-shell__main { padding: 32px 16px 120px; }
}
```

- [ ] **Step 3: Delete the old pill**

```bash
git rm frontend/src/components/layout/AdminPillSidebar.tsx
```

> Confirm nothing else imports it: `grep -rn "AdminPillSidebar" frontend/src` should return no results after this. If `App.tsx` or anything references it, remove that reference.

- [ ] **Step 4: Typecheck + build + visual check**

Run: `cd frontend && pnpm typecheck && pnpm build`
Expected: PASS (clean `tsc -b` + Vite build).
Visual: `pnpm dev`, open `/admin/dashboard` as a super_admin — the grouped rail renders, collapses/expands (persists across reload), active item is orange, every existing page still renders inside the new shell.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AdminLayout.tsx frontend/src/components/layout/admin-shell.css
git commit -m "feat(admin): mount AdminRail in shell; retire AdminPillSidebar"
```

---

### Task 6: CRM nav placeholder route

**Files:**
- Create: `frontend/src/pages/admin/CrmManagementPage.tsx`
- Modify: `frontend/src/App.tsx` (admin route block ~328-342 + lazy import block ~164-176)

- [ ] **Step 1: Create the placeholder page**

Create `frontend/src/pages/admin/CrmManagementPage.tsx`:

```tsx
/**
 * /admin/crm — placeholder until the full-management Admin CRM ships
 * (sub-project B). Present now so the new rail's CRM item routes cleanly.
 */
export function CrmManagementPage() {
  return (
    <div className="ag-panel" style={{ padding: 28 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>CRM Management</h1>
      <p style={{ marginTop: 8, color: 'var(--ag-text-dim)', fontSize: 13, maxWidth: 560 }}>
        Cross-workspace CRM oversight and management is coming next. This section will
        let you view and edit/pause any workspace's campaigns, sequences, enrollments,
        and leads.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Lazy-import + route it**

In `frontend/src/App.tsx`, add to the admin lazy-import group (near line 175):

```tsx
const AdminCrmPage = lazy(() => import('@/pages/admin/CrmManagementPage').then((m) => ({ default: m.CrmManagementPage })));
```

And add the route inside the `/admin` `<Route>` block (after the `users` route, line ~331):

```tsx
          <Route path="crm" element={<AdminCrmPage />} />
```

- [ ] **Step 3: Typecheck + visual**

Run: `cd frontend && pnpm typecheck`
Expected: PASS. Visual: clicking **CRM** in the rail loads the placeholder (no 404).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/CrmManagementPage.tsx frontend/src/App.tsx
git commit -m "feat(admin): /admin/crm placeholder route for new nav item"
```

---

## PHASE 2 — Primitive kit & Users reference

> Each primitive appends its own styles to `admin-theme.css` and is exported from `components/admin/index.ts`. Components are class-driven and self-contained (no dependency on `components/ui` internals) so they're easy to compose and restyle.

### Task 7: AdminPageHeader

**Files:**
- Create: `frontend/src/components/admin/AdminPageHeader.tsx`
- Create: `frontend/src/components/admin/index.ts`
- Modify: `frontend/src/components/layout/admin-theme.css` (append header styles)

- [ ] **Step 1: Append styles**

Append to `admin-theme.css`:

```css
/* ---------- AdminPageHeader ---------- */
.ag-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
.ag-header__title { font-size: 22px; font-weight: 700; letter-spacing: -0.2px; margin: 0; }
.ag-header__sub { font-size: 12.5px; color: var(--ag-text-dim); margin: 3px 0 0; }
.ag-header__actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
```

- [ ] **Step 2: Create the component**

Create `frontend/src/components/admin/AdminPageHeader.tsx`:

```tsx
import type { ReactNode } from 'react';

export interface AdminPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned action cluster (search, buttons). */
  actions?: ReactNode;
}

/** Standard section header: title + subtitle on the left, actions on the right. */
export function AdminPageHeader({ title, subtitle, actions }: AdminPageHeaderProps) {
  return (
    <header className="ag-header">
      <div>
        <h1 className="ag-header__title">{title}</h1>
        {subtitle != null && <p className="ag-header__sub">{subtitle}</p>}
      </div>
      {actions != null && <div className="ag-header__actions">{actions}</div>}
    </header>
  );
}
```

- [ ] **Step 3: Create the barrel**

Create `frontend/src/components/admin/index.ts`:

```ts
export * from './AdminPageHeader';
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd frontend && pnpm typecheck` → PASS.

```bash
git add frontend/src/components/admin/AdminPageHeader.tsx frontend/src/components/admin/index.ts frontend/src/components/layout/admin-theme.css
git commit -m "feat(admin): AdminPageHeader primitive"
```

---

### Task 8: AdminStatCard (with optional sparkline)

**Files:**
- Create: `frontend/src/components/admin/AdminStatCard.tsx`
- Modify: `frontend/src/components/admin/index.ts`, `admin-theme.css`

- [ ] **Step 1: Append styles**

Append to `admin-theme.css`:

```css
/* ---------- AdminStatCard ---------- */
.ag-stat { background: var(--ag-glass); border: 1px solid var(--ag-border); border-radius: var(--ag-radius); padding: 13px 15px; }
.ag-stat__label { font-size: 9px; letter-spacing: 0.8px; text-transform: uppercase; color: var(--ag-text-faint); }
.ag-stat__value { font-size: 24px; font-weight: 700; margin-top: 4px; }
.ag-stat__delta { font-size: 10px; margin-top: 3px; display: inline-flex; align-items: center; gap: 4px; }
.ag-stat__delta--up { color: var(--wp-success, #3ddc97); }
.ag-stat__delta--down { color: var(--wp-accent-2, #FF8A4B); }
.ag-stat__spark { margin-top: 5px; width: 100%; height: 22px; display: block; }
```

- [ ] **Step 2: Create the component**

Create `frontend/src/components/admin/AdminStatCard.tsx`:

```tsx
export interface AdminStatCardProps {
  label: string;
  value: string | number;
  /** e.g. "+6.2% vs last wk" */
  delta?: string;
  deltaDirection?: 'up' | 'down';
  /** Optional sparkline values; rendered as a normalized polyline. */
  spark?: number[];
}

export function AdminStatCard({ label, value, delta, deltaDirection = 'up', spark }: AdminStatCardProps) {
  return (
    <div className="ag-stat">
      <div className="ag-stat__label">{label}</div>
      <div className="ag-stat__value">{value}</div>
      {delta && (
        <div className={`ag-stat__delta ag-stat__delta--${deltaDirection}`}>
          {deltaDirection === 'up' ? '▲' : '▼'} {delta}
        </div>
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = 100 / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(20 - ((v - min) / range) * 18 - 1).toFixed(1)}`)
    .join(' ');
  return (
    <svg className="ag-stat__spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--wp-accent)" strokeWidth="2" />
    </svg>
  );
}
```

- [ ] **Step 3: Export + typecheck + commit**

Add `export * from './AdminStatCard';` to `components/admin/index.ts`.
Run: `cd frontend && pnpm typecheck` → PASS.

```bash
git add frontend/src/components/admin/AdminStatCard.tsx frontend/src/components/admin/index.ts frontend/src/components/layout/admin-theme.css
git commit -m "feat(admin): AdminStatCard primitive"
```

---

### Task 9: StatusPill, Chip, MeterBar

**Files:**
- Create: `frontend/src/components/admin/StatusPill.tsx`, `Chip.tsx`, `MeterBar.tsx`
- Modify: `frontend/src/components/admin/index.ts`, `admin-theme.css`

- [ ] **Step 1: Append styles**

Append to `admin-theme.css`:

```css
/* ---------- StatusPill / Chip / MeterBar ---------- */
.ag-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; }
.ag-pill__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ag-pill--ok { color: var(--wp-success, #3ddc97); }
.ag-pill--warn { color: var(--wp-accent-2, #FF8A4B); }
.ag-pill--danger { color: var(--wp-danger, #ff5c7a); }
.ag-pill--neutral { color: var(--ag-text-faint); }
.ag-chip { font-size: 9px; padding: 2px 8px; border-radius: 6px; background: var(--ag-glass-strong); color: var(--ag-text-dim); }
.ag-chip--accent { background: color-mix(in srgb, var(--wp-accent) 18%, transparent); color: var(--wp-accent-2, #FF8A4B); }
.ag-meter { display: flex; align-items: center; gap: 6px; }
.ag-meter__track { flex: 1; height: 5px; background: rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden; }
.ag-meter__fill { height: 100%; border-radius: 3px; }
.ag-meter__val { font-size: 9px; color: var(--ag-text-dim); min-width: 18px; text-align: right; }
```

- [ ] **Step 2: StatusPill**

Create `frontend/src/components/admin/StatusPill.tsx`:

```tsx
export type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral';

export interface StatusPillProps {
  label: string;
  tone?: StatusTone;
}

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  return (
    <span className={`ag-pill ag-pill--${tone}`}>
      <span className="ag-pill__dot" aria-hidden />
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Chip**

Create `frontend/src/components/admin/Chip.tsx`:

```tsx
export interface ChipProps {
  label: string;
  variant?: 'default' | 'accent';
}

export function Chip({ label, variant = 'default' }: ChipProps) {
  return <span className={`ag-chip ${variant === 'accent' ? 'ag-chip--accent' : ''}`}>{label}</span>;
}
```

- [ ] **Step 4: MeterBar**

Create `frontend/src/components/admin/MeterBar.tsx`:

```tsx
export interface MeterBarProps {
  /** 0–100 */
  value: number;
  /** Override fill color; defaults to accent, success when >=70, warn when <40. */
  color?: string;
  showValue?: boolean;
}

export function MeterBar({ value, color, showValue = true }: MeterBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = color ?? (pct >= 70 ? 'var(--wp-success, #3ddc97)' : pct < 40 ? 'var(--wp-accent-2, #FF8A4B)' : 'var(--wp-accent)');
  return (
    <span className="ag-meter">
      <span className="ag-meter__track"><span className="ag-meter__fill" style={{ width: `${pct}%`, background: fill }} /></span>
      {showValue && <span className="ag-meter__val">{Math.round(pct)}</span>}
    </span>
  );
}
```

- [ ] **Step 5: Export + typecheck + commit**

Add the three `export * from './StatusPill' | './Chip' | './MeterBar';` lines to `index.ts`.
Run: `cd frontend && pnpm typecheck` → PASS.

```bash
git add frontend/src/components/admin/StatusPill.tsx frontend/src/components/admin/Chip.tsx frontend/src/components/admin/MeterBar.tsx frontend/src/components/admin/index.ts frontend/src/components/layout/admin-theme.css
git commit -m "feat(admin): StatusPill, Chip, MeterBar primitives"
```

---

### Task 10: AdminDataTable (generic, column-config)

**Files:**
- Create: `frontend/src/components/admin/AdminDataTable.tsx`
- Modify: `frontend/src/components/admin/index.ts`, `admin-theme.css`

- [ ] **Step 1: Append styles**

Append to `admin-theme.css`:

```css
/* ---------- AdminDataTable ---------- */
.ag-table { background: var(--ag-glass); border: 1px solid var(--ag-border); border-radius: var(--ag-radius); overflow: hidden; }
.ag-table__row { display: grid; gap: 8px; padding: 11px 16px; align-items: center; font-size: 11.5px; }
.ag-table__row + .ag-table__row { border-top: 1px solid rgba(255,255,255,0.05); }
.ag-table__row--head { font-size: 9px; letter-spacing: 0.7px; text-transform: uppercase; color: var(--ag-text-faint); border-bottom: 1px solid var(--ag-border); }
.ag-table__row--click { cursor: pointer; }
.ag-table__row--click:hover { background: var(--ag-glass-strong); }
.ag-table__row--active { background: color-mix(in srgb, var(--wp-accent) 7%, transparent); }
.ag-table__state { padding: 32px 16px; text-align: center; color: var(--ag-text-faint); font-size: 12px; }
```

- [ ] **Step 2: Create the component**

Create `frontend/src/components/admin/AdminDataTable.tsx`:

```tsx
import type { ReactNode } from 'react';

export interface AdminColumn<T> {
  key: string;
  header: string;
  /** Grid track width, e.g. "2fr" | "120px". */
  width?: string;
  render: (row: T) => ReactNode;
}

export interface AdminDataTableProps<T> {
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyText?: string;
  loadingText?: string;
  onRowClick?: (row: T) => void;
  activeRowKey?: string | null;
}

export function AdminDataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyText = 'Nothing to show.',
  loadingText = 'Loading…',
  onRowClick,
  activeRowKey,
}: AdminDataTableProps<T>) {
  const template = columns.map((c) => c.width ?? '1fr').join(' ');
  return (
    <div className="ag-table">
      <div className="ag-table__row ag-table__row--head" style={{ gridTemplateColumns: template }}>
        {columns.map((c) => (
          <div key={c.key}>{c.header}</div>
        ))}
      </div>
      {loading ? (
        <div className="ag-table__state">{loadingText}</div>
      ) : rows.length === 0 ? (
        <div className="ag-table__state">{emptyText}</div>
      ) : (
        rows.map((row) => {
          const key = rowKey(row);
          return (
            <div
              key={key}
              className={`ag-table__row ${onRowClick ? 'ag-table__row--click' : ''} ${activeRowKey === key ? 'ag-table__row--active' : ''}`}
              style={{ gridTemplateColumns: template }}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <div key={c.key}>{c.render(row)}</div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 3: Export + typecheck + commit**

Add `export * from './AdminDataTable';` to `index.ts`.
Run: `cd frontend && pnpm typecheck` → PASS (generics compile under strict mode).

```bash
git add frontend/src/components/admin/AdminDataTable.tsx frontend/src/components/admin/index.ts frontend/src/components/layout/admin-theme.css
git commit -m "feat(admin): AdminDataTable generic primitive"
```

---

### Task 11: AdminDetailDrawer

**Files:**
- Create: `frontend/src/components/admin/AdminDetailDrawer.tsx`
- Modify: `frontend/src/components/admin/index.ts`, `admin-theme.css`

- [ ] **Step 1: Append styles**

Append to `admin-theme.css`:

```css
/* ---------- AdminDetailDrawer ---------- */
.ag-drawer__scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 40; }
.ag-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 360px; max-width: 92vw; z-index: 41;
  background: rgba(14,12,22,0.92); border-left: 1px solid var(--ag-border-strong);
  backdrop-filter: blur(16px); box-shadow: -20px 0 50px rgba(0,0,0,0.45);
  padding: 18px; display: flex; flex-direction: column; overflow-y: auto; }
.ag-drawer__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.ag-drawer__eyebrow { font-size: 9px; letter-spacing: 0.8px; text-transform: uppercase; color: var(--ag-text-faint); }
.ag-drawer__close { appearance: none; border: 0; width: 24px; height: 24px; border-radius: 7px; background: var(--ag-glass-strong); color: var(--ag-text-dim); cursor: pointer; }
.ag-drawer__footer { display: flex; gap: 8px; margin-top: 16px; }
```

- [ ] **Step 2: Create the component (with Escape-to-close + framer transition)**

Create `frontend/src/components/admin/AdminDetailDrawer.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface AdminDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  /** Sticky action row at the bottom (buttons). */
  footer?: ReactNode;
  children: ReactNode;
}

export function AdminDetailDrawer({ open, onClose, eyebrow = 'Detail', footer, children }: AdminDetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="ag-drawer__scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="ag-drawer"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog" aria-modal="true"
          >
            <div className="ag-drawer__head">
              <span className="ag-drawer__eyebrow">{eyebrow}</span>
              <button type="button" className="ag-drawer__close" onClick={onClose} aria-label="Close"><X size={14} /></button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
            {footer && <div className="ag-drawer__footer">{footer}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Export + typecheck + commit**

Add `export * from './AdminDetailDrawer';` to `index.ts`.
Run: `cd frontend && pnpm typecheck` → PASS.

```bash
git add frontend/src/components/admin/AdminDetailDrawer.tsx frontend/src/components/admin/index.ts frontend/src/components/layout/admin-theme.css
git commit -m "feat(admin): AdminDetailDrawer primitive"
```

---

### Task 12: Shared chart theme

**Files:**
- Create: `frontend/src/components/admin/chart-theme.ts`
- Modify: `frontend/src/components/admin/index.ts`

- [ ] **Step 1: Create the theme constants**

Create `frontend/src/components/admin/chart-theme.ts`:

```ts
/** Shared chart palette + axis/grid/tooltip styles for admin charts.
 *  Warm/orange + neutral only — no purple/blue/teal. */
export const ADMIN_CHART = {
  series: ['#F26522', '#FF8A4B', '#3ddc97', '#ffb066', '#ff5c7a'],
  grid: 'rgba(255,255,255,0.08)',
  axis: 'rgba(255,255,255,0.42)',
  tooltip: {
    background: 'rgba(20,18,28,0.95)',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 12,
  },
} as const;
```

- [ ] **Step 2: Export + typecheck + commit**

Add `export * from './chart-theme';` to `index.ts`.
Run: `cd frontend && pnpm typecheck` → PASS.

```bash
git add frontend/src/components/admin/chart-theme.ts frontend/src/components/admin/index.ts
git commit -m "feat(admin): shared admin chart theme"
```

---

### Task 13: Convert the Users page onto the primitive kit (reference implementation)

**Files:**
- Modify: `frontend/src/pages/admin/UsersPage.tsx`

This is the worked example. **Preserve all data + behavior** — keep the existing hooks (`useAdminUsers`, `useAdminSignupRate`, `useAdminPlanDistribution`, `useSuspendUser`, `useDeleteUser`, `useImpersonateAndEnter`, `useAdminUserAvatar`), the `AdminUserRow` type, and the existing handler functions `handleToggleSuspend`, `handleDelete`, `handleExport` **verbatim**. Only the presentation changes: header/segments/table/drawer now use the primitives. Also fix the off-palette avatar generator.

- [ ] **Step 1: Replace the avatar background generator (palette fix)**

In `UsersPage.tsx`, replace `avatarBg` (currently random-hue HSL that can emit purple/blue) with a warm-palette picker:

```tsx
function avatarBg(email: string): string {
  // Deterministic pick from the warm Shailog palette only (no random hues).
  const palette = [
    'linear-gradient(135deg,#F26522,#FF8A4B)',
    'linear-gradient(135deg,#FF8A4B,#ffb066)',
    'linear-gradient(135deg,#e0552f,#F26522)',
    'linear-gradient(135deg,#c2410c,#FF8A4B)',
  ];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % palette.length;
  return palette[h]!;
}
```

Also change `PLAN_COLORS` (line ~395) to drop the pink/non-palette entries:

```tsx
const PLAN_COLORS = ['var(--wp-accent)', '#FF8A4B', '#ffb066', '#3ddc97', '#e0552f'];
```

- [ ] **Step 2: Rewrite the page body to compose primitives**

Replace the `return (...)` block of `UsersPage` (lines ~159–388) with the composition below. The hooks/`useMemo`/handlers above it stay unchanged. (The inline `UsersDataTable`, `RowMenu`, `SignupChart`, `UserAvatar`, helpers below stay, EXCEPT `UsersDataTable` is replaced by `AdminDataTable` usage — delete the old `UsersDataTable` function and its `TableProps` interface.)

```tsx
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <AdminPageHeader
        title="Users"
        subtitle={
          users.isLoading
            ? 'Fetching users…'
            : `${segmentCounts.all} users · ${segmentCounts.active} active · ${totalSignups} new in ${windowDays}d`
        }
        actions={
          <>
            <div className="ag-search">
              <Search size={13} strokeWidth={2.4} />
              <input
                placeholder="Search email or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="ag-btn ag-btn--ghost" onClick={handleExport}>
              <Download size={13} /> Export
            </button>
          </>
        }
      />

      {/* Segment stat cards (click to filter) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {([
          { key: 'all', label: 'All users', count: segmentCounts.all },
          { key: 'active', label: 'Active', count: segmentCounts.active },
          { key: 'pending', label: 'Pending', count: segmentCounts.pending },
          { key: 'suspended', label: 'Suspended', count: segmentCounts.suspended },
        ] as Array<{ key: SegmentKey; label: string; count: number }>).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSegment(s.key)}
            aria-pressed={segment === s.key}
            style={{ textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}
          >
            <div className="ag-stat" style={segment === s.key ? { outline: '1px solid var(--wp-accent)' } : undefined}>
              <div className="ag-stat__label">{s.label}</div>
              <div className="ag-stat__value">{users.isLoading ? '…' : s.count}</div>
              <div className="ag-stat__delta ag-stat__delta--up">{segment === s.key ? 'Filtering' : 'View'}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Signups + plan mix */}
      <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
        <div className="ag-panel" style={{ padding: 16 }}>
          <div className="ag-stat__label" style={{ marginBottom: 8 }}>Signups · last {windowDays} days</div>
          <SignupChart points={signup.data} loading={signup.isLoading} />
        </div>
        <div className="ag-panel" style={{ padding: 16 }}>
          <div className="ag-stat__label" style={{ marginBottom: 8 }}>Plan mix</div>
          {plans.isLoading ? (
            <div style={{ color: 'var(--ag-text-faint)', fontSize: 12 }}>Loading…</div>
          ) : planMix.length === 0 ? (
            <div style={{ color: 'var(--ag-text-faint)', fontSize: 12 }}>No plan distribution yet.</div>
          ) : (
            planMix.map((p) => (
              <div key={p.plan} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, width: 80, color: 'var(--ag-text-dim)' }}>{p.plan}</span>
                <MeterBar value={p.pct} color={p.color} />
              </div>
            ))
          )}
        </div>
      </section>

      {/* User table */}
      <AdminDataTable<AdminUserRow>
        columns={[
          {
            key: 'user', header: 'User', width: '2fr',
            render: (r) => (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserAvatar row={r} />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>{r.name ?? r.email.split('@')[0]}</span>
                  <span style={{ fontSize: 9, color: 'var(--ag-text-faint)' }}>{r.email}</span>
                </span>
              </span>
            ),
          },
          { key: 'plan', header: 'Plan', render: (r) => <Chip label={r.plan || '—'} variant="accent" /> },
          { key: 'mailboxes', header: 'Mailboxes', render: (r) => r.mailbox_count ?? 0 },
          {
            key: 'status', header: 'Status',
            render: (r) => (
              <StatusPill
                label={r.status}
                tone={r.status === 'active' ? 'ok' : r.status === 'suspended' ? 'danger' : 'warn'}
              />
            ),
          },
          { key: 'joined', header: 'Joined', render: (r) => fmtDate(r.joined_at) },
        ]}
        rows={filteredRows}
        rowKey={(r) => r.id}
        loading={users.isLoading}
        emptyText="No users match the current filter."
        onRowClick={(r) => setDetailId(r.id)}
        activeRowKey={detailId}
      />

      <UserDetailDrawer userId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
```

- [ ] **Step 3: Update imports at the top of the file**

Add to the imports:

```tsx
import { AdminPageHeader, AdminDataTable, StatusPill, Chip, MeterBar } from '@/components/admin';
import type { AdminColumn } from '@/components/admin';
```

Remove now-unused imports (`motion`, `Activity`, `ChevronDown`, `LineChart`, `Loader2`, `MoreHorizontal`, `TrendingDown`, `TrendingUp`, `Users as UsersIcon`) and the `'./users-cohort.css'` import if no remaining classNames reference it. Delete the now-unused `UsersDataTable`/`RowMenu`/`TableProps` (row actions like impersonate/suspend/delete now live in the drawer — confirm `UserDetailDrawer` exposes them; if it doesn't, keep a minimal actions menu using `AdminDataTable`'s last column with a render that calls `onImpersonate`/`handleToggleSuspend`/`handleDelete`). Keep `SignupChart`, `UserAvatar`, `initials`, `avatarBg`, `fmtDate`, `csvEscape`, `cap`, `RETENTION` only if still referenced.

> The `tsc --noEmit` strict flags (`noUnusedLocals`) will FAIL the build on any leftover unused import/function — use that as the checklist: typecheck, delete whatever it flags, repeat.

- [ ] **Step 4: Typecheck + build + visual**

Run: `cd frontend && pnpm typecheck && pnpm build`
Expected: PASS, no unused-symbol errors.
Visual: `/admin/users` renders with the new header, clickable segment stat cards, signups + plan-mix panels, the glass `AdminDataTable`, and the detail drawer opens on row click. Avatars are warm-palette only.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/UsersPage.tsx
git commit -m "feat(admin): convert Users page onto Aurora Glass primitive kit"
```

---

### Task 14: Palette guard for the admin surface

**Files:** none created; verification + fixes only.

- [ ] **Step 1: Grep the admin surface for off-palette colors**

Run: `grep -rniE "violet|purple|indigo|#7c5cff|#8b5cf6|#a78bfa|#f472b6" frontend/src/components/admin frontend/src/components/layout/AdminRail.tsx frontend/src/components/layout/admin-theme.css frontend/src/pages/admin/UsersPage.tsx`
Expected: no matches. If any remain, replace with the warm/neutral token equivalents.

- [ ] **Step 2: Commit (only if fixes were needed)**

```bash
git add -A frontend/src/components/admin frontend/src/components/layout frontend/src/pages/admin
git commit -m "chore(admin): palette guard — warm/neutral only on rebuilt admin surface"
```

---

## Self-Review

**Spec coverage:**
- Aurora Glass tokens → Task 1 ✓
- Collapsible labeled rail, 4 clusters, 13 items incl. CRM + Payments, orange active, no violet → Tasks 2–5 ✓
- CRM nav present (placeholder until B) → Task 6 ✓
- Primitive kit (page header, stat card, table, drawer, status pill, chip, meter, chart theme) → Tasks 7–12 ✓
- Empty/loading states → built into `AdminDataTable` + panels (Task 10/13) ✓
- Users reference implementation → Task 13 ✓
- Palette rule (no purple; warm aurora; avatar fix) → Tasks 1, 13, 14 ✓
- Out of scope (Admin CRM feature = B, other 11 sections = C, backend) → not in this plan ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to". Each component shows full code; the one explicit *preserve* instruction (Task 13 keeping existing handlers) names the exact functions and is a deliberate "don't rewrite working code," not a gap.

**Type consistency:** `ADMIN_NAV_GROUPS` (NavGroup[]) consumed by `AdminRail`; `AdminColumn<T>`/`AdminDataTable<T>` used with `AdminUserRow` in Task 13; `useAdminUi` selectors (`railCollapsed`, `toggleRail`) consistent between store, `AdminRail`, and `AdminLayout`; `StatusTone`/`ChipProps.variant`/`MeterBarProps.value` match their usages in Task 13.

**Known follow-through (called out, not a gap):** Task 13 Step 3 depends on whether `UserDetailDrawer` already exposes impersonate/suspend/delete; the step gives the fallback (an actions column) if not. This is intentional because the current `UserDetailDrawer` internals weren't in scope to rewrite here.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-31-admin-design-system-shell.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session via executing-plans, batch execution with checkpoints.

Which approach?
