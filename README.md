# Shailog Technologies — Marketing & Sales AI

Full-stack autonomous marketing & sales agent product:

```
USER → ORCHESTRATOR → SEARCH (SCRAPE) → PROFILE → COPYWRIGHT → RESPONDER (CHATBOT)
                        ▲                                              │
                        └────────────── continuous LOOP ◄──────────────┘
```

- **Frontend (`/`)** — React + TypeScript + Vite, dark SaaS theme, branded
  login (no shipped credentials)
- **Backend (`/backend`)** — Django + DRF + PostgreSQL; real pipeline:
  live DuckDuckGo discovery → Gemini reads each site and writes the company
  description → site audit (flaws + potential score) → cold-email drafts from
  your template (Settings → Email Templates) → human **Approve & send** via
  SMTP with the branded designer email layout

## Product mode vs demo mode

| | Product (default) | Demo (`SEED_DEMO=1`) |
|---|---|---|
| First boot | creates ONE owner from `ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` (auto-generates + prints a strong password if blank — see `docker compose logs api`) | seeds `operator` / `operator-demo-2026` + sample CRM data |
| Login | your own credentials | demo credentials |
| Data | clean CRM | sample leads/drafts |

Production refuses to boot with insecure defaults: `DJANGO_DEBUG=0` requires
`DJANGO_SECRET_KEY` and a real `ALLOWED_HOSTS` (see `backend/agentic/settings.py`).

## Run the full stack

```bash
# 1) backend
cd backend
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt
set DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/agentic_ai   # or sqlite:///db.sqlite3
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo
.venv/Scripts/python manage.py runserver 127.0.0.1:8000

# 2) frontend (new terminal)
npm install
npm run dev      # http://localhost:5173 — /api is proxied to Django
```

The frontend auto-detects the backend: live data, real token auth
(demo owner `operator` / `operator-demo-2026`) and a **Run cycle** button that
triggers one orchestrator loop. When Django is off, everything falls back to
bundled mock data — the UI never breaks.

## Pages (navigation: Dashboard · Agents · CRM · Chat · Settings)

| Page | What's on it |
|---|---|
| **Dashboard** | USER → ORCHESTRATOR pipeline diagram with animated agent chain + continuous loop rail, backend-readiness strip, CRM overview (LEADS / POTENTIAL / REPLY), chat preview |
| **Agents** | One configuration UI for Search / Profile / Copywright / Responder with the five sections from the notes: **DB · API · SYSTEM PROMPTS · NEGATIVE · MODEL** |
| **CRM** | Three columns: **LEADS** (discovered by Search), **POTENTIAL** (opportunities), **REPLY** (handled by Responder) — mock data |
| **Chat** | Conversation with the Responder (Chatbot): message list, input, send button, mock AI responses |
| **Settings** | **COMPANY PROFILE · AI KEY · PASSWORD · FREQUENT RUNS** (15 min / hourly / 6 hours / daily) — frontend controls only |

## Backend connection

The frontend probes `GET /api/health/` on startup (Vite proxies `/api` →
`127.0.0.1:8000`). Live → real data + token auth; offline → mock fallback.
All calls live in **`src/lib/api.ts`**.

Agent configs and settings persist server-side when live (`/api/agents/…/config/`,
`/api/settings/`), with a localStorage copy for offline use. See
`backend/README.md` for the full API surface.

## Structure

```
src/          frontend — pages, components, lib (api · types · mock data · store)
backend/      Django — core app (models · serializers · views · pipeline · chat · seed)
```
