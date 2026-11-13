# Warmup Real Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real WarmPulse warmup dashboard in the Warmup section, live through the JWT bridge, verifiable locally on sqlite via a dev bootstrap.

**Architecture:** Dev-only `create_all` bootstrap unblocks local authed warmup data; typed `warmupApi` methods feed ported dashboard components (apexcharts) restyled to shell conventions.

**Tech Stack:** React+Vite+TS strict, apexcharts+react-apexcharts (new dep), FastAPI+SQLAlchemy (backend/), Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-11-13-warmup-dashboards-design.md`

## Global Constraints

- Branch `merge/agent-foundation`, no push/deploy (owner gates). Servers stay up for the owner's browser.
- Strict TS; no Tailwind; violet tokens only; reduced-motion respected; no secrets in frontend.
- `backend/` changes dev-only and env-gated (`WARMUP_DEV_BOOTSTRAP=1`); refuse when APP_ENV=production; alembic/prod paths untouched.
- Source pages live in `frontend-warmpulse/src/pages/client/` (read-only reference — do not edit that tree).
- Windows Git Bash; quote paths; zombie-Vite check before server restarts.

---

### Task B1: Warmup dev bootstrap (sqlite create_all + demo seed)

**Files:** Create `backend/scripts/dev_bootstrap.py` (or follow repo's script conventions — check `backend/_seed_*.py` placement), maybe `backend/app/db/bootstrap.py`; Test: `backend/tests/test_dev_bootstrap.py`.

**Interfaces:** Produces: runnable command (documented in backend README quickstart) that, with `WARMUP_DEV_BOOTSTRAP=1` + sqlite DATABASE_URL, creates the schema via `Base.metadata.create_all` and seeds: 2-3 mailboxes with warmth history (30 days), today-stats-compatible activity events, 2 alerts. Idempotent (re-run safe). The bridge user (auto-provisioned on first JWT call) must see the data (seed into the workspace the bridge JWT carries — check how workspace_id scopes queries; seed may need to run AFTER first bridge login or provision a matching user itself; implementer traces and picks).

- [ ] Step 1: Trace how dashboard queries scope by workspace/user (read `activity.py`/`analytics.py`/`mailboxes.py` route bodies). Write the design note in the report.
- [ ] Step 2: TDD — test that bootstrap on sqlite creates tables + seed rows and is idempotent; refuses when APP_ENV=production.
- [ ] Step 3: Implement bootstrap + seed.
- [ ] Step 4: Live verify — restart FastAPI (sqlite) with bootstrap env, mint bridge JWT (Django :8000 up), GET one dashboard endpoint through /wp-api → real seeded data 200.
- [ ] Step 5: Commit: `warmup: dev bootstrap — sqlite create_all + demo warmup data (env-gated, prod-refused)`.

### Task B2: warmupApi typed dashboard methods

**Files:** Modify `frontend/src/lib/warmupApi.ts` (+ types beside it following lib conventions).

**Interfaces:** Produces (names pinned): `warmupTodayStats()`, `warmupWarmthSeries()`, `warmupPlacement()`, `warmupMailboxStates()`, `warmupAlerts()`, `warmupActivity(limit)` — return types matching the ACTUAL FastAPI response shapes (trace from routes/schemas; do not invent fields). All via existing `wpFetch` Bearer path; errors throw typed `WarmupApiError` carrying status+detail.

- [ ] Step 1: Trace exact routes + response schemas (source pages' service layer under `frontend-warmpulse/src` shows the calls).
- [ ] Step 2: Implement methods + TS types; unit-free (no frontend test infra) — validated by B3 usage + B4 E2E; typecheck green.
- [ ] Step 3: Commit: `warmupApi: typed dashboard methods (today/warmth/placement/mailboxes/alerts/activity)`.

### Task B3: Dashboard page port

**Files:** Modify `frontend/src/pages/WarmupPage.tsx`; Create `frontend/src/pages/warmup/` components (WarmthHero, WarmthChart, TodayStats, PlacementDonut, MailboxRows, AlertsStack, ActivityFeed — port from source, restyle); Modify `frontend/package.json` (apexcharts + react-apexcharts), `frontend/src/styles.css` (warmup dashboard styles, tokens only).

**Interfaces:** Consumes B1 data shapes + B2 methods. Layout: hero row (score + today stats) → warmth 30d chart → two-col (placement donut | alerts) → mailbox sparkline rows → activity feed. Refresh on mount + manual button. Offline → existing offline panel. Empty states for no data. Charts read CSS custom properties for colors (apexcharts theming via tokens; verify it can take CSS var values at init — if it can't, resolve computed values in JS from tokens, never hardcode).

- [ ] Step 1: Add deps; scaffold WarmupPage sections; port components one by one (logic from source, styles rewritten to shell conventions).
- [ ] Step 2: Wire B2 methods; loading (LatticeLoader), error, empty, offline states.
- [ ] Step 3: Visual pass — screenshots desktop + 375px, console clean, reduced-motion check.
- [ ] Step 4: Build green. Commit: `warmup: real dashboard — hero, 30d warmth, placement, mailbox rows, alerts, activity (ported)`.

### Task B4: E2E + full gate

**Files:** Modify `scripts/e2e/flow.py`; README quickstart note for the bootstrap command.

**Interfaces:** E2E: after login → Warmup section → assert live values (hero score visible, chart canvas mounts, mailbox rows ≥1, alerts render, zero console errors, no 404/5xx). Gate: Django suite + build + E2E all green; servers left UP.

- [ ] Step 1: Extend flow.py (adapt selectors from B3 code).
- [ ] Step 2: Run full gate; fix fallout.
- [ ] Step 3: Commit: `e2e: warmup dashboard live assertions; README dev bootstrap note — Stream B complete`.
