# AGENTS.md

Autonomous marketing & sales agent system. React + TypeScript + Vite frontend,
Django + DRF backend, Docker deployment to a Linux VPS. The core concept is the
pipeline: `USER → ORCHESTRATOR → SEARCH (scrape) → PROFILE → COPYWRIGHT →
RESPONDER (chatbot)` running in a continuous loop.

## Layout

- `src/` — frontend: `pages/` (Dashboard · Agents · CRM · Chat · Settings, routed
  from `App.tsx`), `components/`, `lib/` (`api.ts` · `types.ts` · `mockData.ts` · `store.ts`)
- `backend/` — Django project: `agentic/` (settings), `core/` app (models,
  serializers, views, scraper, pipeline, ai, mailer, chat, reports, scheduler,
  management commands), `core/tests/`
- Root: `Dockerfile` + `nginx.conf` (frontend image), `backend/Dockerfile` +
  `entrypoint.sh` (api + worker image), `docker-compose.yml` (db/api/worker/frontend),
  `docker-compose.https.yml` + `Caddyfile` (optional HTTPS)
- Read before touching deployment or API surface: `DEPLOY.md`, `backend/README.md`

## Commands

Frontend (root):

```bash
npm run dev        # Vite on :5173, proxies /api → http://127.0.0.1:8000
npm run build      # tsc --noEmit + vite build — this IS the typecheck
```

No ESLint/Prettier is configured. TypeScript is `strict`; keep it that way.

Backend (`backend/`, Windows venv → use `.venv/Scripts/python`, not `bin/`):

```bash
.venv/Scripts/python -m pip install -r requirements.txt
export DATABASE_URL=sqlite:///db.sqlite3   # local dev DB (Postgres only in docker)
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo   # demo owner + agent configs; idempotent
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
.venv/Scripts/python manage.py test        # Django test runner, tests in core/tests/
```

Other management commands: `pipeline_loop` (auto-cadence loop), `run_worker`
(always-on agent: pipeline cycles + daily 20:00 IST report + heartbeats),
`daily_report` (one-off report email).

Docker (VPS): `docker compose up -d --build`; HTTPS variant adds
`-f docker-compose.https.yml`. Migrations + seed run automatically via
`entrypoint.sh`.

## Architecture rules

- **All** frontend↔backend traffic goes through `src/lib/api.ts`. It probes
  `GET /api/health/` on startup; if the backend is down, every call falls back
  to `src/lib/mockData.ts` so the UI never breaks. Keep that contract when
  adding endpoints: implement API method + mock fallback + types together.
- `backend/core/serializers.py` must match `src/lib/types.ts` 1:1 — change both
  sides together.
- Pipeline internals: `core/pipeline.py` (orchestrator) → `core/scraper.py`
  (DuckDuckGo discovery via `ddgs`, site audit, potential score) → `core/ai.py`
  (OpenAI-compatible LLM; provider + key come from `AppSettings`, never env) →
  `core/mailer.py` (SMTP with console fallback). Responder replies: `core/chat.py`.
  Profile stores a Gemini-written `Lead.description` from the scraped site text
  (`analysis['text_excerpt']`); Copywright drafts merge the user's default
  `EmailTemplate` (Settings page, `/api/templates/`) with that description —
  `{{company}}`-style placeholders in `pipeline.TEMPLATE_VARS` are the no-AI
  fallback. Outbound emails are branded HTML (logo header, inline `cid:` image)
  via `mailer.branded_email_html()`.
- Auth: DRF token auth (`Authorization: Token …`). Only `/api/health/` and
  `/api/auth/*` are open. The frontend has a branded login page — no
  auto-login. Product installs create the owner at first boot via
  `manage.py bootstrap_admin` (entrypoint, `ADMIN_*` env vars, password
  auto-generated + printed in logs when blank); demo installs (`SEED_DEMO=1`)
  seed `operator` / `operator-demo-2026`. With `DJANGO_DEBUG=0` the app
  refuses to start without `DJANGO_SECRET_KEY` and a real `ALLOWED_HOSTS`.
- **DB confusion warning:** `AgentConfig.db_provider` is MongoDB-only by design
  (locked in migration `0006_mongodb_only`; not editable from the UI). That is a
  product-level setting shown on the Agents page — the Django app itself runs on
  PostgreSQL (docker) or SQLite (local) via `DATABASE_URL`. Don't "fix" one into
  the other.
- Secrets (AI key, SMTP) live in the `AppSettings` singleton (editable via
  Settings page/Django admin) and are masked in API responses. VPS-level secrets
  go in `.env` (git-ignored). Never put keys in frontend code.

## Conventions & gotchas

- The workspace path contains a space (`Devesh B`) — always quote paths in
  shell commands.
- Windows dev machine (Git Bash); README quick-start commands use
  `set VAR=...` cmd syntax — in Git Bash use `export VAR=...`.
- Local dev runs SQLite (READMEs say PostgreSQL — that's the docker/VPS setup).
- localStorage keys use the `agentic-ai:` prefix (token: `agentic-ai:token`).
- Daily report and cadence code uses `Asia/Kolkata` (IST); Django otherwise UTC.
- `backend/salem_discovery.py` is a standalone one-off script (fixed Salem/TN
  query set), not part of the pipeline — it calls `django.setup()` itself.
- Cadence changes need no restart: `run_worker`/`pipeline_loop` read the
  Settings FREQUENT RUNS toggle + frequency live.
- `.zcode/` is git-ignored.
