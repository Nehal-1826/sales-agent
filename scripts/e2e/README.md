# E2E gate — merged WarmPulse + agent stack

`flow.py` is the push gate for the merged monorepo: one Playwright (Chromium)
pass over the live dev stack — landing rebrand, Django login, sidebar nav,
Leads tabs, the `#/warmup` deep link + live warmup dashboard assertions
(hero score, apex chart canvas, mailbox rows, alerts, activity feed),
logout token purge, console/404 hygiene — plus a browser-less check of the
prerendered `frontend/dist` routes (exactly one `meta[name=description]`,
PNG favicon).

It replaces the ad-hoc out-of-repo flow used before the merge; run it before
every push.

## Prereqs

- System Python with Playwright + Chromium cached:
  `pip install playwright && playwright install chromium`
- `backend-agent/.venv` and `backend/.venv` exist (see repo READMEs)

## Run (3 servers + the script)

```bash
# Terminal 1 — Django (agent API :8000)
cd backend-agent
export DATABASE_URL=sqlite:///db-agent-e2e.sqlite3
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo      # operator / operator-demo-2026
.venv/Scripts/python manage.py runserver 127.0.0.1:8000

# Terminal 2 — FastAPI (warmup API :8001)
cd backend
export DATABASE_URL=sqlite+aiosqlite:///db-warmup-e2e.sqlite3
# one-off: create schema + seed demo warmup data (needed for the dashboard
# checks — an up-but-empty backend fails them, only a down backend skips)
WARMUP_DEV_BOOTSTRAP=1 JWT_SECRET=<same as Django's WARMUP_JWT_SECRET> \
  .venv/Scripts/python -m scripts.dev_bootstrap
.venv/Scripts/python -m uvicorn app.main:app --port 8001

# Terminal 3 — Vite (frontend :5173; the script probes IPv4 and IPv6 itself)
cd frontend
npm run build          # also refreshes dist/ for the prerender checks
npm run dev

# Terminal 4 — the gate
python scripts/e2e/flow.py
```

Exit code 0 = all green. Screenshots land in
`.superpowers/sdd/e2e-shots/` (git-ignored).

## Behavior notes

- **Vite port**: the script probes `127.0.0.1:5173`, `[::1]:5173` (Vite
  sometimes binds IPv6-only) and `localhost:5174` before starting.
- **FastAPI optional**: if `:8001/health` is down, the warmup dashboard
  checks print `SKIP` and the "not reachable" panel is asserted instead —
  the gate still passes. The proxy 500s from the down backend's health
  probes are excluded from the hygiene checks in that mode. With FastAPI
  **up**, the dashboard checks are live assertions and its `/wp-api/` 4xx/5xx
  count as failures like every other route's.
- **Dist checks** need `npm run build` first; without `dist/` they print
  one `SKIP` line.
