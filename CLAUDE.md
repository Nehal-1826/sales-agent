# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Shailog Technologies — Marketing & Sales AI. An autonomous lead machine:
React 18 + TypeScript + Vite frontend (repo root), Django 5 + DRF backend
(`backend/`). `AGENTS.md` holds the long-form architecture notes; this file is
the working summary.

## Commands

Frontend (repo root):

```bash
npm run dev      # Vite on :5173, proxies /api → http://127.0.0.1:8000
npm run build    # tsc --noEmit (strict) + vite build — this IS the typecheck/lint
```

No ESLint/Prettier and no frontend test runner. TypeScript is `strict`.

Backend (`backend/`, Windows venv → `.venv/Scripts/python`, Git Bash → `export`, not `set`):

```bash
export DATABASE_URL=sqlite:///db.sqlite3          # local dev; Postgres only in docker
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo           # agent configs + profiles; --demo-crm adds fake CRM rows
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
.venv/Scripts/python manage.py test                                  # whole suite (core/tests/)
.venv/Scripts/python manage.py test core.tests.test_views            # one module
.venv/Scripts/python manage.py test core.tests.test_views.DraftViewTests       # one class (append .test_name for one test)
.venv/Scripts/python manage.py makemigrations --check --dry-run      # CI gate: no missing migrations
```

Background processes: `run_worker` (pipeline on the Settings cadence + 20:00 IST
report thread + heartbeats — the VPS worker), `pipeline_loop` (cadence only),
`daily_report [--loop]`, `bootstrap_admin`, `backfill_phones`.

CI (`.github/workflows/ci.yml`) = `makemigrations --check` + `migrate` + `manage.py test`
on Python 3.12, and `npm run build` on Node 20.

## Deployment boundary

The production instance is already live behind a Cloudflare tunnel / Docker on a
VPS. Local work runs only via `npm run dev` + `runserver`; do not run
`docker compose`, touch `.env`, `Caddyfile`, `nginx.conf` or tunnel config
unless explicitly asked.

## Architecture

### The pipeline (`backend/core/pipeline.py::run_pipeline`)

One cycle = SEARCH → PROFILE → ENRICH → COPYWRIGHT → RESPONDER, writing one
`PipelineRun` row at the end (its `started_at` is back-filled to the real start).
It only ever reads targeting from the `AppSettings` singleton (pk=1,
`AppSettings.load()`).

Only one cycle runs at a time: `core/runlock.py` holds an atomic lock in
`AppSettings.pipeline_running_since` (stale after 45 min). `run_pipeline()`
raises `PipelineBusy` when locked; `start_pipeline_async()` (API Run button,
chat "run a cycle") returns False. `POST /api/pipeline/run/` → 202 (background
thread) or 409; `?wait=1` runs synchronously. Never `save()` the AppSettings
row without `update_fields` — a full-row save can clobber the lock.

- **Search** — `scraper.search_queries_for_cycle()` builds industry × region
  queries (target cities beat countries; empty = worldwide rotation with an
  India-metro slice), DuckDuckGo via `ddgs`, 8 s pause between queries. Known
  domains, company names and `AppSettings.rejected_domains` are skipped. In
  buyer mode a free Google Maps scrape (`gmaps.py`) adds no-website businesses.
- **Profile** — `scraper.analyze_website()` audits the site (contact
  email/phone, findings, 0–100 score). Then two gates, both of which **delete
  the lead and blacklist its domain**: `icp.looks_like_competitor()` (heuristic,
  works keyless) and `_ai_review()` (LLM relevance verdict + description).
  `_ai_review` returning `None` (LLM configured but failed) **holds** the lead
  unprofiled for the next cycle — strict "unvetted sites never enter the CRM".
  Score ≥ 65 creates a `Potential`.
- **Enrich** — phone chain, each source only fills an EMPTY phone: site scrape
  → Scalelist → Apollo → free Google Maps (`gmaps.py`) → Apify actor
  (`apify_maps.py`, paid, last resort). Matching is by website domain, never
  by result position.
- **Copywright** — `_draft_email()` drafts only for leads with a real scraped
  `contact_email` (max 3/cycle). Personalization order: LLM merging the default
  `EmailTemplate` + `Lead.description` → `{{placeholder}}` substitution
  (`TEMPLATE_VARS`) → built-in pitch. Drafts land as `EmailDraft(status=draft)`;
  **nothing sends without human approval** (`/api/drafts/<id>/approve/` →
  `mailer.send_draft`, SMTP or console fallback, branded HTML via
  `mailer.branded_email_html()`).
- **ICP mode** (`core/icp.py`): `buyer` (default) searches businesses that buy
  our services and rejects peer agencies; `agency` flips both (partnership
  outreach). `SearchProfile.apply()` (`/api/profiles/<id>/activate/`) copies a
  preset into `AppSettings` — takes effect next cycle, no restart.

### LLM access (`core/ai.py`)

OpenAI-compatible `/chat/completions` for every provider (Gemini via its
OpenAI dialect, GLM, OpenAI, DeepSeek, Groq, Mistral, Ollama). Provider + key
come from `AppSettings` (env `AI_*` vars are absorbed into empty DB fields once
by `AppSettings._absorb_env_secrets`, provider and key together). Every caller
must degrade gracefully when `llm_available()` is false — the whole product
works keyless.

**A key only ever goes to its own provider.** `resolve_provider()` returns
`None` for anything unrecognised and `llm_complete()` then returns `None`
*without making a request* — never fall back to OpenAI. `model_for()` replaces
a model that doesn't belong to the provider's family with that provider's
default (a `GLM-4.6` id sent to Gemini fails every call and silently drops the
product into template mode). Anthropic is deliberately not offered: it needs
the official SDK, not an OpenAI-compatible shim.

### Outreach safety rules (do not weaken)

These exist because each one was a real bug that reached a prospect's inbox or
a user's screen:

- **Never invent a recipient.** `mailer.valid_recipient()` gates every send;
  `send_draft` fails the draft rather than guessing `contact@<domain>`.
- **Never send twice.** `mailer.claim_draft_for_send()` is an atomic
  conditional UPDATE — every send path (API, bulk, admin, chat) goes through
  it. Don't add a path that calls `send_draft` without claiming first.
- **Never send without approval.** Drafts only leave on an explicit user
  action; `sent_via='console'` means logged, **not delivered** — the UI must
  say so.
- **Questions are not commands.** `actions.is_question_or_negation()` runs
  before any classification; destructive actions store `User.pending_action`
  and run only after an explicit "yes".
- **Secrets never land in chat history.** `onboarding.redact_for_history()` is
  applied to the stored `ChatMessage`, and the raw text goes only to the reply
  path.

### Chat surfaces

- `/api/chat/` — per-user. While `User.onboarding` is not done, messages go to
  `onboarding.onboarding_reply()` (plain-language setup wizard that writes
  settings as it goes); afterwards to `chat.responder_reply()`, which first
  tries `actions.detect_action()` (regex fast-path, then LLM JSON classify) so
  the chat can run cycles, approve/reject drafts, switch profiles, etc.
  Company names in actions resolve only against real DB rows.
- `/api/guide/` — `guide.py`, the floating help widget grounded in a product KB
  + live workspace state.
- Replies mirror the user's language (English / Tamil / Tanglish) —
  `chat.detect_language_style()`.

### Frontend

Built for a non-technical client: plain language ("Find companies",
"Research", "Write emails", "Autopilot", "Good fit"), no Django/DB jargon in
client-facing copy.

- Pages (hash router `src/lib/router.ts`, `#/page/sub`): Home · Approvals ·
  Leads (`#/leads/board`, `#/leads/reports`) · Activity · Assistant ·
  Settings (`#/settings/<section>`, sections in `pages/settings/`, each saves
  only its own fields via `useSectionForm` with an unsaved-changes guard).
- `src/lib/api.ts` re-exports `transport.ts` (mode probe, auth, `ApiError`,
  `Result`) + `endpoints.ts` (every call). Contract: when the `/health/` probe
  succeeds (LIVE) getters return real data or **throw**, mutations return
  `Result` — live mode never falls back to mock data or fake success. Bundled
  `mockData.ts` is used only in DEMO mode (backend unreachable AND dev build or
  `VITE_ALLOW_DEMO=1`); a production build shows a Retry screen instead. A 401
  fires `SESSION_EXPIRED_EVENT` → login.
- `lib/status.tsx` (`WorkspaceStatusProvider`) polls pipeline + outreach
  status (15 s, 3 s while a cycle runs) and exposes `cycleVersion` (bumps when
  a cycle finishes — pages put it in `useAsync` deps) and `startCycle()`.
  Status pills are always derived from it, never hardcoded.
- One approval queue: `components/ApprovalQueue.tsx` (+ `DraftModal`) is used
  by Approvals and the Home preview. Success is shown only when the server
  returns `status === 'Sent'`; `sentVia === 'console'` is "Not delivered".
- `src/lib/types.ts` mirrors `backend/core/serializers.py` (camelCase on the
  wire) — change both sides together.
- Styling: one hand-written `src/styles.css` (tokens at the top, orange accent,
  warm canvas, dark chrome). Shared UI: `components/ui.tsx` (Field, Chip,
  Toggle, PageHeader), `feedback.tsx` (toast, Banner, EmptyState, Skeleton,
  LoadError), `overlay.tsx` (Modal, Drawer, ConfirmButton — focus-managed).
  Icons are inline SVG in `components/icons.tsx`. Zero UI dependencies.
- Local dev: `API_PROXY_TARGET=http://127.0.0.1:8765 npm run dev` when :8000 is
  taken (on this machine :8000 belongs to another project's container).
- localStorage keys use the `agentic-ai:` prefix; logout clears them all and
  secrets are never stored there.

### Auth

DRF token auth (`Authorization: Token …`); only `/api/health/` and
`/api/auth/*` are open. First user created becomes `owner`. Product installs
create the owner via `bootstrap_admin` (`ADMIN_*` env); demo installs
(`SEED_DEMO=1`) seed `operator` / `operator-demo-2026`. `DJANGO_DEBUG=0`
refuses to boot without `DJANGO_SECRET_KEY` and `ALLOWED_HOSTS`.

## Gotchas

- `AgentConfig.db_provider` is MongoDB-only **by design** (product-level
  setting, locked in migration 0006). The Django app itself runs on
  Postgres/SQLite via `DATABASE_URL`. Don't "fix" one into the other.
- Secrets (AI key, SMTP, Apollo) live in `AppSettings` and are masked by the
  serializer; a masked value sent back on PUT must not overwrite the real one.
- Migrations: two branches often create the same-numbered migration — resolve
  with `makemigrations --merge`, never hand-edit a pushed migration.
- Cadence (`run_worker`/`pipeline_loop`) reads Settings → Frequent Runs live;
  daily report and cadence use `Asia/Kolkata`, Django otherwise UTC.
- `backend/salem_discovery.py` is a standalone one-off script, not pipeline code.
- `.gitattributes` normalizes to LF; CRLF warnings on Windows are expected.
- Branch per change, never commit to `master` directly (see `CONTRIBUTING.md`).
