# AGENTS.md — WarmPulse monorepo (Email-Warmup)

WarmPulse = one product: mailbox warmup network + AI outbound lead agent.
Merged 2026-11-12 from WarmPulse (email warmup SaaS) + Shailog sales-agent
(pipeline: USER → ORCHESTRATOR → SEARCH → PROFILE → COPYWRIGHT → RESPONDER).
Brand: **WarmPulse**, accent theme **orange** (`#f97316` family — restored
2026-11-13; violet was the brief 11-12 experiment). Logos: `frontend/public/warmpulse-*`.

## Layout

- `frontend/` — THE app (React + Vite + TS strict, custom CSS tokens, NO Tailwind).
  Landing/login/signup + workspace shell (Home · Approvals · Replies · Tasks ·
  Leads · Activity · Assistant · Warmup · Settings). Sidebar at all widths
  (bottom tab bar removed). Prerendered marketing build (SSR + `scripts/prerender.mjs`).
- `backend-agent/` — Django + DRF: pipeline, scraper, AI, mailer/outbox, billing,
  workspaces, OTP, WhatsApp approvals, mailbox probe, company scrape. Own AGENTS.md
  (pre-merge doc; paths there are historical).
- `backend/` — FastAPI + SQLAlchemy + Celery: warmup peer network, mailboxes,
  analytics, alerts. Internal API prefix `/api/…`; alembic migrations are
  **Postgres-only** (dev bootstrap: `WARMUP_DEV_BOOTSTRAP=1` on sqlite — Stream B).
- `frontend-warmpulse/` — old WarmPulse frontend: PORTING SOURCE ONLY (client
  dashboards for the Warmup section). Never served.
- `whatsapp-sidecar/` — WhatsApp runtime service (node). `warmpulse-mobile/` — RN app.
- `ops/` — gateway nginx (`/api/`→django:8000, `/wp-api/`→fastapi:8001 rewritten
  to its internal `/api/`), db init. Root `docker-compose.yml` = full stack.
- `scripts/e2e/flow.py` — the Playwright gate (58+ checks; run before every push).
- `docs/superpowers/` — specs + plans (foundation, shell-ux batch, warmup dashboards).

## Commands (local dev, Windows Git Bash — quote paths, space in "Devesh B")

```bash
# 1) Django  (.venv inside backend-agent)
cd backend-agent && export DATABASE_URL=sqlite:///db-agent-e2e.sqlite3 \
  && export WARMUP_JWT_SECRET=$(cat ../.superpowers/sdd/dev-secret.txt) \
  && .venv/Scripts/python manage.py migrate && .venv/Scripts/python manage.py seed_demo \
  && .venv/Scripts/python manage.py runserver 127.0.0.1:8000
#    login: operator / operator-demo-2026

# 2) FastAPI (.venv inside backend)
cd backend && export DATABASE_URL=sqlite+aiosqlite:///db-warmup-e2e.sqlite3 \
  && export JWT_SECRET=$(cat ../.superpowers/sdd/dev-secret.txt) \
  && .venv/Scripts/python -m uvicorn app.main:app --port 8001

# 3) Vite (IPv6 localhost only — probe http://localhost:5173, NOT 127.0.0.1)
cd frontend && npm run dev

# Gates
cd backend-agent && DATABASE_URL=sqlite:///db-agent-test.sqlite3 .venv/Scripts/python manage.py test
cd backend && .venv/Scripts/python -m pytest tests/test_bridge_auth.py tests/test_auth.py tests/test_api_key_auth.py -q
cd frontend && npm run build            # tsc + vite + SSR + prerender
python scripts/e2e/flow.py              # full-stack gate (servers must be up)
```

The shared bridge secret must be **32+ chars** and identical on both backends
(Django mints, FastAPI verifies — both fail loud on weak/placeholder secrets).

## Architecture rules

- One login: Django identity (workspaces, OTP, billing). `POST /api/auth/warmup-token/`
  mints an HS256 `iss=agent-bridge` JWT (12h) — FastAPI auto-provisions passwordless
  users from it (both auth dependencies guard foreign `iss`; kill-switch
  `AGENT_BRIDGE_ENABLED`). Platform admins need a satisfied OTP session to mint
  (`role=super_admin`).
- Frontend↔backend: Django via `lib/` request helpers; warmup via `lib/warmupApi.ts`
  (Bearer JWT, `/wp-api` base, health probe, 401 re-acquire once). Bridge JWT dies
  with the session (all four token-clear sites purge both keys).
- `backend-agent/core/serializers.py` ↔ `frontend/src` types change together.
- Anonymous endpoints: `/api/health/`, `/api/auth/*`, `/api/company/scrape`
  (AllowAny + 10/min scoped throttle, SSRF-guarded, reuses `core/scraper.py`).
- Mailboxes: provider wizard + `POST /api/mailboxes/test` (IMAP+SMTP probe,
  per-leg results, never echoes passwords; username = `smtpUser || fromEmail`).
  Unreachable mailboxes pause 24h with one-click Resume.
- FastAPI docs (`/docs`) are disabled outside dev environments.
- Secrets server-side only (env/.env.docker), masked in API responses, never frontend.

## Gotchas

- Vite binds IPv6 `[::1]` only; zombie Vite processes survive task kills —
  `netstat -ano | grep :5173` + `taskkill //F //PID` before restarts; port
  assignment is ready-order, not start-order.
- Background servers die with the session — see Commands to bring the stack back.
- Alembic (backend/) is Postgres-only; sqlite dev needs the bootstrap flag.
- Branch state: all merged work lives on `merge/agent-foundation`, local-only,
  **no push/deploy without the owner's command**. `main` holds only specs/plans.
- E2E selectors worth knowing: `.side-logout`, `aside.sidebar` full-height rail,
  password-rule `li.pass/.fail` flip on signup.
