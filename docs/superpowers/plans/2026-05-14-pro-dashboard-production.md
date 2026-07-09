# Pro Dashboard — production wiring · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the locked P6 Bento dashboard into the production `/app/dashboard` route for Pro-tier users, populated with real backend data and proper loading / empty / error states.

**Architecture:** Tier dispatch already exists in `DashboardPage.tsx`. Add one branch (`if (isPro) return <ProDashboard />`) and build the new `ProDashboard.tsx` next to `StarterDashboard.tsx`. ProDashboard rebuilds the P6 Bento JSX inline (the preview `P6Bento` component is demo-data-driven with no props), consuming existing TanStack Query hooks for real data. CSS is imported from the preview folder for v1 with a TODO comment for a follow-up cleanup commit.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, react-router, framer-motion, lucide-react. Styling via existing `.pd-bento__*` class names from `pages/client-design-preview/pro-dashboards/pro-dashboards.css`. No backend changes, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-14-pro-dashboard-production-design.md`

**Commit policy:** Per CLAUDE.md, never commit unless the user explicitly asks. Each task ends with an **Optional** commit step — the executor runs it only when the user has authorized commits for this implementation cycle.

---

## Task 1: Scaffold `ProDashboard.tsx` with hooks + page shell

Create the new file with all data-fetching hooks wired but no tiles yet. Renders a single loading placeholder so the dispatch can be tested in isolation in Task 8.

**Files:**
- Create: `frontend/src/pages/client/dashboards/ProDashboard.tsx`

- [ ] **Step 1: Create the scaffold**

Create `frontend/src/pages/client/dashboards/ProDashboard.tsx` with this content:

```tsx
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMailboxes } from '@/features/mailboxes/api';
import {
  useActivityFeed,
  useDashboardSummary,
  useTodayStats,
} from '@/features/dashboard/api';
// TODO: lift styles into pages/client/dashboards/pro-dashboard.css in a
// follow-up cleanup commit so production code doesn't import from a
// /client-design-preview/ folder long-term.
import '@/pages/client-design-preview/pro-dashboards/pro-dashboards.css';

/**
 * /app/dashboard for Pro-tier users. Locked P6 Bento layout wired to real
 * backend data via existing TanStack Query hooks.
 *
 * Spec: docs/superpowers/specs/2026-05-14-pro-dashboard-production-design.md
 */
export function ProDashboard() {
  const mailboxesQuery = useMailboxes();
  const summaryQuery = useDashboardSummary();
  const todayQuery = useTodayStats();
  const activityQuery = useActivityFeed(5);

  const mailboxes = mailboxesQuery.data?.items ?? [];

  // 0-mailbox empty state — same CTA as the Legacy dashboard.
  if (!mailboxesQuery.isLoading && mailboxes.length === 0) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-1"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-text-dim">
            Live warmth, placement and activity once mailboxes are connected.
          </p>
        </motion.div>
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title="No mailboxes connected"
          description="Finish onboarding to connect your first mailbox and start warming up."
          action={
            <Button asChild variant="primary">
              <Link to="/onboarding">Complete onboarding</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Bento grid — tiles wired in Tasks 2-6.
  return (
    <div className="pd-bento">
      {/* HERO — Task 2 */}
      {/* TODAY STATS — Task 3 */}
      {/* MAILBOXES — Task 4 */}
      {/* SENDS 30D — Task 5 */}
      {/* LIVE FEED — Task 6 */}
    </div>
  );
}

export default ProDashboard;

// Suppress unused-var warnings while tiles are TODO — removed in later tasks.
void summaryQuery;
void todayQuery;
void activityQuery;
```

- [ ] **Step 2: Run typecheck**

Run from `frontend/`:
```
pnpm typecheck
```
Expected: passes with no errors.

- [ ] **Step 3: Optional commit**

Only if the user has authorized commits for this cycle:
```bash
git add frontend/src/pages/client/dashboards/ProDashboard.tsx
git commit -m "feat(pro-dashboard): scaffold ProDashboard with hooks + empty state"
```

---

## Task 2: Implement Hero tile (workspace warmth + mailbox pills)

**Files:**
- Modify: `frontend/src/pages/client/dashboards/ProDashboard.tsx`

- [ ] **Step 1: Add Hero tile JSX**

Replace the `{/* HERO — Task 2 */}` placeholder with the hero block. Also remove the `void summaryQuery;` line since the hook is now consumed.

After the `mailboxes` const, add a derived value:
```tsx
  const summary = summaryQuery.data;
  const avgWarmth =
    summary?.warmth_score ??
    (mailboxes.length === 0
      ? 0
      : Math.round(
          mailboxes.reduce((acc, m) => acc + (Number(m.warmth_score) || 0), 0) /
            mailboxes.length,
        ));
  const activeCount = mailboxes.filter((m) => m.status === 'active').length;
```

Replace `{/* HERO — Task 2 */}` with:
```tsx
      <div className="pd-bento__hero">
        <div className="pd-bento__hero-glow" aria-hidden />
        <span className="pd-bento__hero-eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Workspace warmth
        </span>
        <div className="pd-bento__hero-num">
          {summaryQuery.isLoading ? '—' : avgWarmth}
        </div>
        <div className="pd-bento__hero-rule" />
        <span className="pd-bento__hero-sub">
          Avg across {mailboxes.length} mailbox
          {mailboxes.length === 1 ? '' : 'es'} · {activeCount} active
        </span>
        <div className="pd-bento__hero-mini">
          {mailboxes.map((m) => {
            const w = Number(m.warmth_score) || 0;
            return (
              <span
                key={m.id}
                className="pd-bento__hero-pill"
                style={{
                  background: `linear-gradient(135deg, hsl(${260 + w}, 70%, 65%) 0%, hsl(${230 + w}, 60%, 50%) 100%)`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      </div>
```

Add `Sparkles` to the existing `lucide-react` import:
```tsx
import { Mail, Sparkles } from 'lucide-react';
```

Delete this line (no longer needed):
```tsx
void summaryQuery;
```

- [ ] **Step 2: Run typecheck**

```
pnpm typecheck
```
Expected: passes.

- [ ] **Step 3: Visual verify**

In a browser DevTools console for a logged-in user:
```js
localStorage.setItem('WP_PLAN_OVERRIDE', 'pro');
location.reload();
```
Navigate to `/app/dashboard`. (Note: dispatch isn't wired yet — Task 8. To preview the component before then, temporarily render `<ProDashboard />` in `LegacyDashboard`'s return, or skip this verify step until Task 8.)

Expected when wired: hero card shows real warmth number + correct mailbox count + per-mailbox warmth pills.

- [ ] **Step 4: Optional commit**

```bash
git add frontend/src/pages/client/dashboards/ProDashboard.tsx
git commit -m "feat(pro-dashboard): wire hero tile to real warmth data"
```

---

## Task 3: Implement Today stats tiles (sent + opens)

**Files:**
- Modify: `frontend/src/pages/client/dashboards/ProDashboard.tsx`

- [ ] **Step 1: Add stats tiles JSX**

Replace `{/* TODAY STATS — Task 3 */}` with:
```tsx
      <div className="pd-bento__stat pd-bento__stat--sent">
        <span className="pd-bento__stat-icon">
          <Send size={14} strokeWidth={2.4} />
        </span>
        <span className="pd-bento__stat-num">
          {todayQuery.isLoading ? '—' : (todayQuery.data?.sent ?? 0)}
        </span>
        <span className="pd-bento__stat-lbl">sent today</span>
        <span className="pd-bento__stat-bar">
          <span
            style={{
              width: (() => {
                const sent = todayQuery.data?.sent ?? 0;
                // Target ~= mailboxes × 30 sends/day as a soft reference.
                const target = Math.max(1, mailboxes.length * 30);
                return `${Math.min(100, (sent / target) * 100)}%`;
              })(),
            }}
          />
        </span>
      </div>
      <div className="pd-bento__stat pd-bento__stat--opens">
        <span className="pd-bento__stat-icon">
          <MailOpen size={14} strokeWidth={2.4} />
        </span>
        <span className="pd-bento__stat-num">
          {todayQuery.isLoading ? '—' : (todayQuery.data?.opens ?? 0)}
        </span>
        <span className="pd-bento__stat-lbl">opens today</span>
        <span className="pd-bento__stat-delta">
          <ArrowUpRight size={10} strokeWidth={2.6} />
          live
        </span>
      </div>
```

Update the lucide import:
```tsx
import { ArrowUpRight, Mail, MailOpen, Send, Sparkles } from 'lucide-react';
```

Delete `void todayQuery;`.

- [ ] **Step 2: Run typecheck**

```
pnpm typecheck
```
Expected: passes.

- [ ] **Step 3: Optional commit**

```bash
git add frontend/src/pages/client/dashboards/ProDashboard.tsx
git commit -m "feat(pro-dashboard): wire today stats tiles to useTodayStats"
```

---

## Task 4: Implement Mailboxes panel

**Files:**
- Modify: `frontend/src/pages/client/dashboards/ProDashboard.tsx`

- [ ] **Step 1: Add mailboxes panel JSX**

Replace `{/* MAILBOXES — Task 4 */}` with:
```tsx
      <div className="pd-bento__mailboxes">
        <header className="pd-bento__panel-head">
          <span className="pd-bento__panel-title">Mailboxes</span>
          <span className="pd-bento__panel-count">{mailboxes.length}</span>
        </header>
        <ul className="pd-bento__mb-list">
          {mailboxesQuery.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="pd-bento__mb-row">
                  <span className="pd-bento__mb-dot pd-bento__mb-dot--warn" />
                  <span className="pd-bento__mb-email">loading…</span>
                </li>
              ))
            : mailboxes.map((m) => {
                const w = Number(m.warmth_score) || 0;
                const tone =
                  m.status === 'paused' ? 'err' : w >= 80 ? 'ok' : 'warn';
                return (
                  <li key={m.id} className="pd-bento__mb-row">
                    <span
                      className={`pd-bento__mb-dot pd-bento__mb-dot--${tone}`}
                    />
                    <span className="pd-bento__mb-email">
                      {m.email.split('@')[0]}
                    </span>
                    <span className="pd-bento__mb-warmth">{w}</span>
                  </li>
                );
              })}
        </ul>
      </div>
```

- [ ] **Step 2: Run typecheck**

```
pnpm typecheck
```
Expected: passes.

- [ ] **Step 3: Optional commit**

```bash
git add frontend/src/pages/client/dashboards/ProDashboard.tsx
git commit -m "feat(pro-dashboard): wire mailboxes panel to useMailboxes"
```

---

## Task 5: Implement Sends 30-day sparkline

**Files:**
- Modify: `frontend/src/pages/client/dashboards/ProDashboard.tsx`

- [ ] **Step 1: Add sparkline JSX + helper component**

Replace `{/* SENDS 30D — Task 5 */}` with:
```tsx
      <div className="pd-bento__sends">
        <header className="pd-bento__panel-head">
          <span className="pd-bento__panel-title">
            <Activity size={11} strokeWidth={2.4} style={{ marginRight: 4 }} />
            Warmth · last 30 days
          </span>
        </header>
        <SendsBars points={summary?.trend_30d ?? []} />
      </div>
```

Append this helper component below the `ProDashboard` function (above `export default ProDashboard`):
```tsx
function SendsBars({ points }: { points: Array<{ date: string; warmth_score: number }> }) {
  if (points.length === 0) {
    return <div className="pd-bento__sends-bars" />;
  }
  const values = points.map((p) => p.warmth_score);
  const max = Math.max(...values, 1);
  return (
    <div className="pd-bento__sends-bars">
      {values.map((v, i) => (
        <span
          key={i}
          style={{ height: `${(v / max) * 100}%` }}
          className="pd-bento__sends-bar"
        />
      ))}
    </div>
  );
}
```

Add `Activity` to the lucide import:
```tsx
import { Activity, ArrowUpRight, Mail, MailOpen, Send, Sparkles } from 'lucide-react';
```

- [ ] **Step 2: Run typecheck**

```
pnpm typecheck
```
Expected: passes.

- [ ] **Step 3: Optional commit**

```bash
git add frontend/src/pages/client/dashboards/ProDashboard.tsx
git commit -m "feat(pro-dashboard): wire 30d sparkline to summary.trend_30d"
```

---

## Task 6: Implement Live activity feed

**Files:**
- Modify: `frontend/src/pages/client/dashboards/ProDashboard.tsx`

- [ ] **Step 1: Add helper for relative time + activity feed JSX**

Add this helper above the `SendsBars` function:
```tsx
function formatRelTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
```

Replace `{/* LIVE FEED — Task 6 */}` with:
```tsx
      <div className="pd-bento__feed">
        <header className="pd-bento__panel-head">
          <span className="pd-bento__panel-title">Live activity</span>
          <span className="pd-bento__panel-live">
            <span className="pd-bento__panel-live-dot" />
            live
          </span>
        </header>
        <ul className="pd-bento__feed-list">
          {activityQuery.isLoading && (activityQuery.data ?? []).length === 0
            ? Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="pd-bento__feed-row">
                  <span className="pd-bento__feed-icon pd-bento__feed-icon--sent">
                    <Send size={11} strokeWidth={2.4} />
                  </span>
                  <span className="pd-bento__feed-text">loading…</span>
                </li>
              ))
            : (activityQuery.data ?? []).map((e) => {
                const ActIcon =
                  e.action === 'sent'
                    ? Send
                    : e.action === 'opened'
                    ? MailOpen
                    : e.action === 'replied'
                    ? Reply
                    : e.action === 'starred'
                    ? Star
                    : MailOpen;
                return (
                  <li key={e.id} className="pd-bento__feed-row">
                    <span className={`pd-bento__feed-icon pd-bento__feed-icon--${e.action}`}>
                      <ActIcon size={11} strokeWidth={2.4} />
                    </span>
                    <span className="pd-bento__feed-text">
                      <strong>{e.mailbox_email.split('@')[0]}</strong>{' '}
                      {e.action.replace('_', ' ')}{' '}
                      <span className="pd-bento__feed-peer">{e.peer_email}</span>
                    </span>
                    <span className="pd-bento__feed-time">{formatRelTime(e.ts)}</span>
                  </li>
                );
              })}
        </ul>
      </div>
```

Update lucide import:
```tsx
import { Activity, ArrowUpRight, Mail, MailOpen, Reply, Send, Sparkles, Star } from 'lucide-react';
```

Delete `void activityQuery;`.

- [ ] **Step 2: Run typecheck**

```
pnpm typecheck
```
Expected: passes.

- [ ] **Step 3: Optional commit**

```bash
git add frontend/src/pages/client/dashboards/ProDashboard.tsx
git commit -m "feat(pro-dashboard): wire live feed to useActivityFeed(5)"
```

---

## Task 7: Add per-tile error fallback

Each query may throw. Add a small inline error message inside each tile that fails, without breaking the rest of the page.

**Files:**
- Modify: `frontend/src/pages/client/dashboards/ProDashboard.tsx`

- [ ] **Step 1: Add a TileError helper**

Add this helper above `SendsBars`:
```tsx
function TileError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="pd-bento__tile-error">
      <span>Couldn't load.</span>
      <button type="button" onClick={onRetry} className="pd-bento__tile-error-btn">
        Retry
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wrap each tile body with an error check**

For each of the four tile divs (`pd-bento__hero`, `pd-bento__mailboxes`, `pd-bento__sends`, `pd-bento__feed`), insert the error check immediately inside the div, before the rest of the body. The today-stats tiles are simpler — covered below.

Hero example (insert at the top of the `<div className="pd-bento__hero">` body):
```tsx
        {summaryQuery.isError ? (
          <TileError onRetry={() => summaryQuery.refetch()} />
        ) : (
          <>
            <div className="pd-bento__hero-glow" aria-hidden />
            {/* ...existing hero contents... */}
          </>
        )}
```

Repeat the same pattern for:
- `pd-bento__mailboxes` → checks `mailboxesQuery.isError`, retry calls `mailboxesQuery.refetch()`
- `pd-bento__sends` → checks `summaryQuery.isError`, retry calls `summaryQuery.refetch()`
- `pd-bento__feed` → checks `activityQuery.isError`, retry calls `activityQuery.refetch()`

For the today-stats tiles, do **not** add error wrapping — `useTodayStats` falls back to derived values via the 404 handler, so an error simply renders `0`. Acceptable for v1.

- [ ] **Step 3: Add minimal styles for the error tile**

The `pd-bento__tile-error` class doesn't exist in the preview CSS. Append to `frontend/src/pages/client-design-preview/pro-dashboards/pro-dashboards.css`:
```css
.pd-bento__tile-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  font-size: 11px;
  color: var(--wp-text-faint);
  text-align: center;
}
.pd-bento__tile-error-btn {
  background: transparent;
  border: 1px solid var(--wp-border);
  border-radius: 6px;
  padding: 3px 9px;
  color: var(--wp-accent-2);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.pd-bento__tile-error-btn:hover {
  background: color-mix(in srgb, var(--wp-accent) 12%, transparent);
}
```

- [ ] **Step 4: Run typecheck**

```
pnpm typecheck
```
Expected: passes.

- [ ] **Step 5: Optional commit**

```bash
git add frontend/src/pages/client/dashboards/ProDashboard.tsx \
        frontend/src/pages/client-design-preview/pro-dashboards/pro-dashboards.css
git commit -m "feat(pro-dashboard): per-tile error fallback with retry"
```

---

## Task 8: Wire Pro dispatch in `DashboardPage` + final smoke test

**Files:**
- Modify: `frontend/src/pages/client/DashboardPage.tsx`

- [ ] **Step 1: Add `isPro` destructure + dispatch branch**

In `DashboardPage.tsx`, the current code is:
```tsx
const { isStarter, isLoading } = usePlan();
// ...
if (isStarter) {
  return <StarterDashboard />;
}
return <LegacyDashboard />;
```

Change to:
```tsx
const { isStarter, isPro, isLoading } = usePlan();
// ...
if (isStarter) {
  return <StarterDashboard />;
}
if (isPro) {
  return <ProDashboard />;
}
return <LegacyDashboard />;
```

Add the import at the top alongside the existing `StarterDashboard` import:
```tsx
import { StarterDashboard } from './dashboards/StarterDashboard';
import { ProDashboard } from './dashboards/ProDashboard';
```

- [ ] **Step 2: Run typecheck**

```
pnpm typecheck
```
Expected: passes.

- [ ] **Step 3: Visual smoke — Pro user**

1. Start dev server (`make frontend` from repo root, or `pnpm dev` from `frontend/`).
2. Log in as any user.
3. In DevTools console: `localStorage.setItem('WP_PLAN_OVERRIDE', 'pro'); location.reload();`
4. Navigate to `/app/dashboard`.

Expected:
- Bento layout renders (hero card top-left, today stats top-middle, mailboxes panel top-right, sparkline bottom-left, live feed bottom-right)
- Real numbers in hero / stats / mailboxes
- Sparkline shows trend
- Live feed shows recent events (or empty list with "loading…" briefly)
- No console errors

- [ ] **Step 4: Visual smoke — Starter user (regression check)**

In DevTools: `localStorage.setItem('WP_PLAN_OVERRIDE', 'starter'); location.reload();`
Navigate to `/app/dashboard`.

Expected: existing `StarterDashboard` (S1 Focus Card) renders, no Pro bento.

- [ ] **Step 5: Visual smoke — Agency / unknown (regression check)**

In DevTools: `localStorage.setItem('WP_PLAN_OVERRIDE', 'agency'); location.reload();`
Navigate to `/app/dashboard`.

Expected: `LegacyDashboard` (existing multi-widget layout) renders. (Agency will get its own design in a future sub-project.)

- [ ] **Step 6: Visual smoke — empty workspace**

Using a Pro user account with 0 mailboxes connected (or temporarily filter out all mailboxes in DevTools), visit `/app/dashboard`.

Expected: "No mailboxes connected" empty state with "Complete onboarding" CTA. No bento grid rendering.

- [ ] **Step 7: Visual smoke — error tile**

Stop the backend or use DevTools network blocker to fail `/workspace/analytics/dashboard/summary`. Reload `/app/dashboard`.

Expected: hero tile + sparkline tile show "Couldn't load. Retry" inline. Other tiles (today stats, mailboxes, feed) still render normally.

- [ ] **Step 8: Reset dev override**

```js
localStorage.removeItem('WP_PLAN_OVERRIDE');
location.reload();
```

- [ ] **Step 9: Optional commit**

```bash
git add frontend/src/pages/client/DashboardPage.tsx
git commit -m "feat(pro-dashboard): dispatch Pro tier to ProDashboard at /app/dashboard"
```

---

## Final self-review checklist (run after Task 8 is complete)

Walk through the spec's "Verification" section and tick each off:

- [ ] `pnpm typecheck` clean
- [ ] Pro user with mailboxes → P6 Bento rendered with real data
- [ ] Pro user with 0 mailboxes → empty state with onboarding CTA
- [ ] Loading state: each tile shows a graceful placeholder during initial fetch
- [ ] Per-tile error: simulated 500 on summary endpoint → hero + sparkline show retry, others render
- [ ] Starter still renders `StarterDashboard`
- [ ] Agency / unknown still renders `LegacyDashboard`
- [ ] No new console warnings or React errors

If any item fails, return to the relevant task, fix, re-verify, then re-check.

---

## Out of scope (post-shipping cleanup or future sub-projects)

These are explicit deferrals from the spec and should NOT creep into this implementation:

- Lift `pro-dashboards.css` from `pages/client-design-preview/pro-dashboards/` into `pages/client/dashboards/pro-dashboard.css` — follow-up cleanup commit before Pro Mailboxes sub-project ships
- Replace the `useDashboardSummary` synthesized 30d trend fallback with real historical data on day 0
- Pro Mailboxes / Activity / Analytics / Reputation / Tools / Reports / Workspace / Billing / Settings sub-projects
- Agency dashboard
- Mobile-first responsive refinement of the bento grid
