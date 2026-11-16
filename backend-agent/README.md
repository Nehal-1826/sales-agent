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
- **OUTREACH** — drafts wait in the CRM OUTREACH column; **Approve** claims the
  draft and queues it in the outbox (`core/outbox.py`): it leaves 45–180 s after
  the previous one from the mailbox with most room today, inside the sending
  window (default 09–18 IST, weekdays), within each `Mailbox` daily cap (warmup
  ramp 5 → cap over 14 days). `run_worker` drains every ~30 s; or
  `manage.py drain_outbox`. Without any mailbox/SMTP it prints to the console
  (not delivered)
- **REPLIES** (`core/inbox.py`) — `run_worker` reads each active mailbox over
  IMAP every ~3 min (or `manage.py poll_inbox`): read-only (`BODY.PEEK`, never
  deletes/moves), UID high-water mark per mailbox. Replies are matched to our
  sent draft (In-Reply-To/References, else sender address) and classified (LLM
  JSON or keyword heuristic, keyless). Hard bounces suppress the address and
  can auto-pause the mailbox; "stop/unsubscribe" replies suppress and reject
  queued mail; interested/question replies get a suggested answer that a human
  approves (`approve_suggestion` → threaded draft → outbox). Never auto-sent.
- **FOLLOW-UPS** (`core/sequences.py`) — a SENT cold email enrolls its lead in
  the workspace's default `Sequence` (Settings → Follow-ups). run_worker's
  outbox thread ticks it: due steps become threaded `EmailDraft(status=draft)`
  (or queued when "send without asking" is on), LinkedIn / call / wa.me
  `OutreachTask`s, or `WhatsAppMessage` drafts. A reply (OOO only delays),
  bounce, unsubscribe, won/lost, do-not-contact or manual stop ends it and
  rejects every unsent item; `send_draft` re-checks right before sending.
- **WHATSAPP** (`core/whatsapp.py`, opt-in) — sends approved messages through
  the open-wa sidecar (`../whatsapp-sidecar/`) inside the sending window under
  `whatsapp_daily_cap`. Every message needs a human approval, always.

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
| POST | `/api/drafts/bulk_approve/` | approve many → each queued (`{ids}` → `{results, queued, failed}`) |
| POST | `/api/drafts/{id}/approve/` | approve → claim + queue (status `Queued`, `scheduledFor`, `mailbox`) |
| POST | `/api/drafts/{id}/reject/` | discard a draft |
| POST | `/api/drafts/{id}/send/` | retry a failed draft (requeued) |
| GET | `/api/outreach/status/` | draft/queued/sent/failed counts, next send, per-mailbox sent today / cap |
| GET/POST | `/api/mailboxes/` | sending mailboxes (admin writes; password masked) |
| GET/PATCH/DELETE | `/api/mailboxes/{id}/` | one mailbox |
| POST | `/api/mailboxes/{id}/dns_check/` | re-run SPF / DKIM / DMARC / MX check |
| POST | `/api/mailboxes/{id}/resume/` | lift an auto-pause |
| POST | `/api/outbox/drain/` | send due queued email now (best effort) |
| POST | `/api/inbox/poll/` | read replies + bounces from the mailboxes now (admin) |
| GET/PUT | `/api/sequences/`, `/api/sequences/<id>/` | follow-up sequences + steps (admin writes) |
| GET | `/api/enrollments/?lead=<id>` | follow-up progress; POST `…/<id>/stop/` stops it (admin) |
| GET | `/api/tasks/` | open LinkedIn / call / WhatsApp-link tasks; POST `…/<id>/done/` or `/skip/` |
| GET | `/api/whatsapp/messages/?status=draft` | WhatsApp drafts; POST `…/<id>/approve/` or `/reject/` (admin) |
| GET | `/api/whatsapp/status/`, `/api/whatsapp/qr/` | sidecar state + login QR (admin) |
| POST | `/api/whatsapp/test/`, `/api/whatsapp/opt_out/` | test send / never WhatsApp a number (admin) |
| GET | `/api/replies/?attention=1` | prospect replies (classification, suggested answer) |
| POST | `/api/replies/{id}/approve_suggestion/` | `{text?}` → threaded answer queued in the outbox |
| POST | `/api/replies/{id}/mark_handled/` | `{handled?: bool}` |
| POST | `/api/warmpulse/sync/` | pull warmup status from WarmPulse now |
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
