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

## Real-data guarantees (strict mode)

- **AI relevance gate, fail-closed** — Gemini reads every discovered site's own
  text; junk (directories, keyword landing pages, blogs) is deleted and the
  domain is **permanently blacklisted** (`AppSettings.rejected_domains`). If the
  AI can't review a lead (throttle/network), the lead is held unprofiled and
  retried next cycle — unvetted sites never enter the CRM.
- **Contact-first outreach** — Copywright drafts only for leads with a real
  scraped email; placeholder addresses (`you@company.com`, `noreply@…`) are
  blocklisted at extraction.
- **Demo data is opt-in** — `python manage.py seed_demo` no longer inserts the
  fake sample CRM; pass `--demo-crm` explicitly (docker entrypoint does).

## Phone enrichment — 4 sources per lead

Every cycle, leads with an empty phone are retried down this chain
(each source only fills an EMPTY phone — scraped numbers always win;
every phone records its source in `analysis.phone_source`):

```
1. site scrape        tel: links + contact/about/impressum pages found in the nav
2. Scalelist          person/company phone find (work email, else name + domain)
3. Apollo.io          organization enrich (phone, employee count)
4. Google Maps        Apify `compass/google-maps-extractor` — batched actor run,
                      places matched to leads by WEBSITE DOMAIN (never position);
                      India leads are searched first
```

Configure with `SCALELIST_API_KEY`, `APOLLO_API_KEY`, `APIFY_API_KEY` —
all optional, each source is skipped when blank (see `.env.example`).

## India-priority discovery

Slice #0 of every cycle targets an Indian metro (16 metros × 14 industries,
rotating — Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Pune, …), so roughly
⅓ of new leads are Indian with correct state tagging (`GLOBAL_CITY_STATE`);
the remaining slices keep the 120-region worldwide sweep running.

## Product mode vs demo mode

| | Product (default) | Demo (`SEED_DEMO=1`) |
|---|---|---|
| First boot | creates ONE owner from `ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` (auto-generates + prints a strong password if blank — see `docker compose logs api`) | seeds `operator` / `operator-demo-2026` + sample CRM data |
| Login | your own credentials | demo credentials |
| Data | clean CRM (real scraped leads only) | sample leads/drafts |

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
