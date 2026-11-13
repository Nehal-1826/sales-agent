# Warmup Real Dashboards — Design (Stream B)

Date: 2026-11-13
Status: owner approved ("real dashboards now" + "go")
Base: `merge/agent-foundation` @ `711395e`

## Goal

Replace the Warmup section stub with the real WarmPulse warmup dashboard, running
live against the warmup FastAPI through the existing JWT bridge (`warmupApi`).

## Source of truth

- UI: `frontend-warmpulse/src/pages/client/dashboard/` — WarmthScoreHero,
  Warmth30dArea, TodayStats, PlacementDonut, MailboxSparklineRow,
  LiveActivityFeed, AlertsStack (+ `WarmupActivityPage.tsx` for the activity list).
- API: warmup FastAPI routes — `app/api/routes/activity.py`, `analytics.py`,
  `mailboxes.py` (+ alerts/notifications routes wherever they live — implementer
  traces exact paths from the source pages' service layer).
- Charts: source uses **apexcharts** — the merged frontend adds
  `apexcharts` + `react-apexcharts` (same lib = faithful port, less rework).

## Scope (4 tasks)

1. **Dev bootstrap for the warmup backend** — the alembic migrations are
   Postgres-only, so local dev/CI cannot run authed warmup endpoints on sqlite
   today. Add an env-gated bootstrap (`WARMUP_DEV_BOOTSTRAP=1`, dev only — refuse
   when APP_ENV is production) that runs `Base.metadata.create_all` on a sqlite
   DB and seeds a small demo dataset (mailboxes with warmth history, activity
   events, alerts) so the dashboard renders real data locally. No changes to
   alembic/prod paths. Seed via a small script reusing the existing
   `backend/_seed_*.py` patterns where possible.
2. **warmupApi extensions** — typed methods for the dashboard endpoints the
   source pages consume (today-stats, warmth series, placement breakdown,
   mailbox warmup states, alerts, activity feed). Bearer JWT via existing
   `warmupApi`; explicit error/offline states; no mock-data fallback (offline
   panel stays).
3. **Dashboard page port** — WarmupPage becomes the real dashboard: warmth hero,
   30-day warmth chart, today stats, placement donut, per-mailbox sparkline
   rows, alerts stack, live activity feed (refresh on mount + manual refresh
   button; no aggressive polling). Restyled to the shell's CSS conventions and
   violet tokens (charts read tokens, not source hexes). Reduced-motion
   respected; responsive down to 375px.
4. **E2E + gate** — extend `scripts/e2e/flow.py`: warmup dashboard renders live
   values (bootstrapped backend), charts mount, zero console errors; full gate
   green (Django suite, build, E2E).

## Out of scope (follow-ups)

- Mailbox management inside the Warmup section (add/pause warmup mailboxes) —
  agent Settings wizard owns connect; warmup-side mailbox CRUD comes later.
- DNS onboarding wizard port, peer-inbox admin views, reports/PDF, reputation
  page — later batches.
- Agent-mailbox ↔ warmup-mailbox unification (auto-enroll sending mailboxes
  into warmup) — its own design decision, not this stream.

## Constraints

Same as Stream A: strict TS, no Tailwind, tokens-only, no secrets frontend-side,
branch `merge/agent-foundation`, no push/deploy without owner, servers kept
running for the owner's browser, Windows Git Bash + quoted paths.
