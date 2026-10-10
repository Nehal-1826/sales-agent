# Agentic AI Backend — Django + DRF + PostgreSQL

Python backend for the Marketing & Sales Agentic AI frontend, implementing the
architecture from the design notes:

```
PYTHON → DJANGO → DATA SCHEMA → JSON → DB (POSTGRESQL)
       → API ENDPOINTS → CORS → USERS / ROLES
```

The agent pipeline (`USER → ORCHESTRATOR → SEARCH (SCRAPE) → PROFILE →
COPYWRIGHT → RESPONDER (CHATBOT) → LOOP`) is **real** (`core/pipeline.py`):

- **SEARCH** — live DuckDuckGo discovery (`ddgs`), worldwide industry × region
  rotation **with an India-priority slice every cycle** (16 metros × 14
  industries), platform/job-board/directory blocklist, deep-link filtering
- **PROFILE** — scrapes each lead's site (`requests` + `bs4`), categorizes
  **website / no website**, extracts contact emails **and phone numbers**
  (tel: links + contact/about/impressum pages found in the site's own nav),
  audits HTTPS, speed, SEO, mobile, content, contact reachability → flaw
  findings + potential score (more fixable flaws = higher potential;
  no website ≈ 90–95). Gemini vets every lead against its own site text —
  junk is deleted and its domain permanently blacklisted; unreviewable
  leads are held and retried next cycle (fail-closed)
- **PHONE ENRICHMENT** — leads still missing a phone are retried down a
  4-source chain (`core/scalelist.py`, `core/enrichment.py`,
  `core/apify_maps.py`): Scalelist → Apollo.io → Apify Google Maps
  (places matched to leads by website domain, India leads first). Capped
  per cycle, env-keyed (`SCALELIST_API_KEY`, `APOLLO_API_KEY`,
  `APIFY_API_KEY`), never overwrites a scraped number — the source is
  recorded in `analysis.phone_source`
- **COPYWRIGHT** — drafts a personalized cold email per lead from the real
  audit findings; uses the LLM when an AI key is set in Settings
  (`core/ai.py`, OpenAI-compatible: OpenAI/Gemini/GLM/DeepSeek/Groq/Ollama),
  strong template otherwise. Only leads with a real scraped email get a
  draft — nothing is written to a missing address
- **OUTREACH** — drafts wait in the CRM OUTREACH column; **Approve & send**
  delivers immediately via the SMTP account from Settings (`core/mailer.py`),
  or prints to the server console when SMTP is not configured

Automatic cadence: `python manage.py pipeline_loop` honors Settings →
FREQUENT RUNS (toggle + frequency) without restarts.

## Quick start (PostgreSQL)

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows (use .venv/bin/python on macOS/Linux)

# point DATABASE_URL at your Postgres instance (see .env.example)
set DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/agentic_ai

.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
```

Create the empty database first: `CREATE DATABASE agentic_ai;`

### Smoke test without Postgres

The app code is database-agnostic — for a quick local run:

```bash
set DATABASE_URL=sqlite:///db.sqlite3
python manage.py migrate && python manage.py seed_demo && python manage.py runserver
```

(This is how the current dev machine runs it — PostgreSQL is not installed here.)

## Demo account

`seed_demo` creates the workspace owner and prints an API token:

- username: `operator` · password: `operator-demo-2026` (role: **owner**)
- Roles: **owner / admin / member** (`core.User.role`)

The frontend auto-logs in with this account when it detects the backend.

## API endpoints (`/api/…`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health/` | liveness + DB check (open; used by the frontend status strip) |
| POST | `/api/auth/register/` `/api/auth/login/` | token auth |
| GET | `/api/auth/me/` · POST `/api/auth/password/` | current user · change password |
| CRUD | `/api/leads/` `/api/potential/` `/api/replies/` | CRM — LEADS / POTENTIAL / REPLY |
| GET | `/api/drafts/` | OUTREACH — cold-email drafts with findings |
| PUT | `/api/drafts/{id}/` | edit subject/body/recipient while still a draft |
| POST | `/api/drafts/{id}/approve/` | approve → send immediately (SMTP or console) |
| POST | `/api/drafts/{id}/reject/` | discard a draft |
| POST | `/api/drafts/{id}/send/` | retry an approved/failed draft |
| GET | `/api/outreach/status/` | draft/sent/failed counts + SMTP configured? |
| GET | `/api/agents/` | pipeline cards with live stats |
| GET/PUT | `/api/agents/{search\|profile\|copywright\|responder}/config/` | DB · API · SYSTEM PROMPTS · NEGATIVE · MODEL |
| GET/PUT | `/api/settings/` | COMPANY PROFILE · AI KEY (masked) · FREQUENT RUNS |
| GET/POST | `/api/chat/` | Responder (Chatbot) history + reply |
| GET | `/api/pipeline/status/` | loop state, cadence, next run |
| POST | `/api/pipeline/run/` | trigger one orchestrator cycle |
| GET | `/api/pipeline/runs/` | run history |

All endpoints except `/health/` and auth require an `Authorization: Token …`
header (DRF token auth). CORS is pre-configured for `http://localhost:5173`.

## Layout

```
agentic/   project settings (DB via DATABASE_URL, CORS, DRF, token auth)
core/
  models.py       User+roles · Lead (+findings) · EmailDraft · Potential · Reply ·
                  AgentConfig · AppSettings (AI key + SMTP, singleton) ·
                  ChatMessage · PipelineRun
  serializers.py  JSON shapes matching the frontend types 1:1
  views.py        CRM viewsets, drafts/approve/send, agents, settings, chat, auth, pipeline
  scraper.py      DuckDuckGo discovery · site scraping · contact-email extraction ·
                  heuristic website audit (findings + potential score)
  ai.py           OpenAI-compatible LLM client (provider + key from Settings)
  mailer.py       SMTP delivery with console fallback
  pipeline.py     orchestrator: search → profile → copywright → responder
  chat.py         Responder reply generation (swap in a real LLM here)
  management/commands/seed_demo.py · pipeline_loop.py
```

## Going to production (checklist)

- set `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`, real `DATABASE_URL`
- serve behind gunicorn/uvicorn + a reverse proxy
- rotate the demo operator token, add real users via `/api/auth/register/`
- implement real agent logic in `pipeline.py` / `chat.py` using the stored
  AI provider key and per-agent prompts/model
