# AGENTS.md — WarmPulse monorepo (Email-Warmup)

WarmPulse = one product: mailbox warmup network + AI outbound lead agent.
Merged 2026-11-12 from WarmPulse (email warmup SaaS) + Shailog sales-agent
(pipeline: USER → ORCHESTRATOR → SEARCH → PROFILE → COPYWRIGHT → RESPONDER).
Brand: **WarmPulse**, accent theme **orange** (`#f97316` family — restored
2026-11-13; violet was the brief 11-12 experiment). Logos: `frontend/public/warmpulse-*`.

## Layout

- `frontend/` — THE app (React + Vite + TS strict, custom CSS tokens, NO Tailwind).
  Landing/login/signup + workspace shell (Home · Approvals · Replies · Tasks ·
  Leads · Activity · Assistant · Warmup · Mail · Settings). Sidebar at all widths
  (bottom tab bar removed). Prerendered marketing build (SSR + `scripts/prerender.mjs`).
  Platform console at `/<admin-slug>/<page>` (14 sidebar entries in 4 groups:
  Overview · Platform stats | Mail [same webmail client as user panel] ·
  Test accounts · Account routing | Users · Tenants · Leads · Plans ·
  Payment | Reports · Audit log · Settings · Marketing). Payment is ONE
  section with three tabs (Billing · Payments · Invoices = `PaymentPage`).
  Removed over time: SystemHealth, PlatformMail, MailViewer (broken locally);
  AI usage, Retention and Add-ons (2026-11-24, owner's order — their pages
  are gone, the old addresses land on the Overview).
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
- `scripts/e2e/flow.py` — the Playwright gate (131 checks; run before every push).
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
#    fresh sqlite DB needs the ONE-OFF seed first (an up-but-EMPTY backend
#    FAILS the warmup dashboard checks; only a down backend skips them):
#    WARMUP_DEV_BOOTSTRAP=1 .venv/Scripts/python -m scripts.dev_bootstrap

# 3) Vite (IPv6 localhost only — probe http://localhost:5173, NOT 127.0.0.1)
cd frontend && npm run dev

# Gates
cd backend-agent && DATABASE_URL=sqlite:///db-agent-test.sqlite3 .venv/Scripts/python manage.py test
cd backend && .venv/Scripts/python -m pytest tests/test_bridge_auth.py tests/test_auth.py tests/test_api_key_auth.py -q
cd frontend && npm run build            # tsc + vite + SSR + prerender
python scripts/e2e/flow.py              # full-stack gate (servers must be up)
cd backend-agent && .venv/Scripts/python manage.py eval_assistant   # real-model regression (needs the local runtime)
```

The shared bridge secret must be **32+ chars** and identical on both backends
(Django mints, FastAPI verifies — both fail loud on weak/placeholder secrets).

## Architecture rules

- One login: Django identity (workspaces, OTP, billing). `POST /api/auth/warmup-token/`
  mints an HS256 `iss=agent-bridge` JWT (12h) — FastAPI auto-provisions passwordless
  users from it (both auth dependencies guard foreign `iss`; kill-switch
  `AGENT_BRIDGE_ENABLED`). Platform admins and 2FA-enabled workspace users need a
  satisfied OTP session (`PlatformSession` within 12h) to mint or access protected APIs.
- Two login doors (login split): `POST /api/auth/admin-login/` is platform
  admins ONLY (staff, no workspace) — workspace users get 403 "This page is
  for platform administrators only.". `POST /api/auth/login/` refuses platform
  admins: 403 `admin_only:true`, no token minted — superadmins sign in ONLY at
  `/<slug>/login` (frontend AdminLoginPage; signed-out visitors to any
  /<6-digits>/… URL are redirected there). Both doors share LoginThrottle +
  per-username/IP lockout; wrong-door valid credentials never count as failures.
- Unified 2FA (Admin & User): `core/authz.py` provides shared TOTP handlers, lockout
  (10 failures / 15 min), anti-replay (`last_otp_step`), `auth_extras` (`totp_enabled`,
  `otp_required`), and `enforce_otp` / `IsOtpSatisfied` (`403 OTP required` until verified).
  Platform admins always gate on `TotpScreen` (auto-enrolling QR setup when
  `totp_enabled` is false); 2FA-enabled users gate on `TotpScreen` → `/api/auth/2fa/verify/`.
  Both `#/settings/twofactor` (`TwoFactorSection.tsx`) and `#/platform/settings`
  (`AdminSettingsPage.tsx`) share `frontend/src/components/TwoFactorPanel.tsx` (`CodeSlots`
  animations, QR + copyable manual secret, enable, 2-step authenticator rotate, disable).
- Multi-device TOTP (`TotpDevice`, migration 0038): up to 3 authenticators per user
  (primary `totp_secret` counts as one). `{GET,POST,DELETE} …/2fa/devices/…` on BOTH
  doors (`/api/auth/2fa/` workspace, `/api/platform/2fa/` console in billing/urls.py);
  add → QR-only `otpauth_uri` (never the raw secret), confirm with that device's code;
  any confirmed device satisfies OTP (`check_totp_any` — pending devices never do);
  add/remove need an OTP-satisfied session (platform GET is otp=False); can't remove
  the last method; disable 2FA wipes all devices; `warmup_token` gates on
  `user_2fa_active` too. Panel: "Authenticator devices" card in TwoFactorPanel.
  Security trail (0039): `added_ip`/`added_user_agent` stamped at confirm,
  `last_used_ip` on each verify — the list returns a parsed `added_device`
  ("Chrome · Windows") so the panel shows where each device was enrolled
  and last used from.
- Frontend↔backend: Django via `lib/` request helpers; warmup via `lib/warmupApi.ts`
  (Bearer JWT, `/wp-api` base, health probe, 401 re-acquire once). Bridge JWT dies
  with the session (all four token-clear sites purge both keys).
- `backend-agent/core/serializers.py` ↔ `frontend/src` types change together.
- Anonymous endpoints: `/api/health/`, `/api/auth/*`, `/api/company/scrape`
  (AllowAny + 10/min scoped throttle, SSRF-guarded, reuses `core/scraper.py`).
- Mailboxes: provider wizard + `POST /api/mailboxes/test` (IMAP+SMTP probe,
  per-leg results, never echoes passwords; username = `smtpUser || fromEmail`).
  Unreachable mailboxes pause 24h with one-click Resume. Auto-enroll into
  warmup on verified save (flag `warmup_enrolled`, 5s-capped, non-blocking).
- `/pricing` is interactive on DESKTOP ONLY: OptionWheel
  (`components/reactbits/OptionWheel.tsx`) spins plan names, DepthCarousel
  (`DepthCarousel.tsx`, gsap) shows the plan cards (SVG data-URIs from
  `marketing/planCards.ts`, all features, prices follow the ₹/$ + month/year
  toggles), bidirectionally synced, ONE Get Started CTA follows the selection.
  Wheel over the carousel advances EXACTLY one plan per scroll (tween + 250ms
  dual gate — do not restore fractional scrolling). MOBILE (≤760px, owner
  order): the picker is hidden and plain stacked static cards
  (`.mk-tiers.mk-tiers-mobile` in PricingPage) show instead — no wheel, no
  carousel animation on phones. FlexCarousel/ogl were tried and removed —
  don't re-add.
- Webmail: `POST/GET /api/webmail/*` — IMAP client over connected mailboxes
  (accounts/folders/messages/read/send/mark). Read pane = sandboxed iframe +
  CSP `img-src 'none'` (anti tracking-pixel). Replies thread via `message_id`.
  Available in both the user panel (sidebar → Mail) and the platform console
  (Email network group → Mail). STRICT isolation (`Mailbox.is_platform`):
  platform admins see ONLY `is_platform=True` mailboxes (WarmPulse's own
  @warmpulse.tech mail in the dedicated `warmpulse` workspace); workspace
  users see ONLY their own workspace's mailboxes — tenant mail never appears
  in the console and platform mail never appears in a workspace (Settings
  list and outbox exclude it too — platform mail never sends cold outreach).
  "+ Add mailbox" button links to Settings → Mailboxes & speed.
- Account self-service: `POST /api/auth/change-username/` (IsAuthenticated +
  OTP-satisfied) — 3-30 chars `[A-Za-z0-9_]`, unique case-insensitive;
  token survives (pk-keyed). Card in platform Settings (AdminSettingsPage).
- Admin API routing: all `platformAdmin.ts` calls go through the warmup bridge
  (`warmupGet`/`warmupSend` → `/wp-api/api/admin/*`) — never through Django's
  `/api/admin/*` (404s). `bridgeGetOrFallback` handles auth failures gracefully.
  Platform admin requires `role='admin'|'owner'` OR `is_superuser=True` AND
  `is_staff=True` on the Django user, plus a satisfied `PlatformSession` (OTP).
- FastAPI docs (`/docs`) are disabled outside dev environments.
- WhatsApp sidecar IS deployed on the VPS (`warmpulse-whatsapp`, compose service,
  open-wa ^5.11 on node:22 + system chromium; `.env WHATSAPP_SIDECAR_SECRET`
  must equal the workspace's `AppSettings.whatsapp_secret`). Two open-wa 5
  landmines fixed in the image: `transport/assets` must resolve from CWD
  (symlinked into /app) and chromium runs via the `/usr/local/bin/chromium-clean`
  wrapper — open-wa 5 passes its default flags as one quoted string (kills
  chromium with "Multiple targets") and create() drops browserArgs, so the
  wrapper de-quotes AND injects --no-sandbox. Link a phone: Settings →
  WhatsApp → scan (Linked Devices → Link a Device).
- `provision_workspace(slug)` (core/workspaces.py) seeds the 4 AgentConfig
  rows + AppSettings idempotently — a workspace missing them 404s
  `/api/agents/<key>/config/` ("agent config missing — run seed_demo").
  Run it whenever a workspace appears without agent configs.
- Shared cache: `settings.CACHES` = RedisCache when `REDIS_URL` is set (compose
  wires `redis://redis:6379/1` into django + django-worker; FastAPI owns db 0),
  locmem locally. DRF throttles + cache cooldowns MUST share this — per-worker
  locmem silently doubled every limit under gunicorn's 2 workers.
- Secrets server-side only (env/.env.docker), masked in API responses, never frontend.
- AI website reading (`core/business_profile.py`) — pasting a DOMAIN fills both
  setup cards. `profile_from_domain` = model-free page facts
  (`company_scrape.company_details`: name, description, schema.org services,
  address) + ONE local-model call (`ai.llm_json`: Ollama's native `/api/chat`
  with a JSON-schema `format` — always valid JSON, cloud providers never asked).
  Measured rules for the small model: buyers are CHOSEN from the fixed
  catalogue (`CATALOGUE`, the 3 best, minus the seller's own kind — its 4th pick
  was regularly a weak fit), countries come
  ONLY from the domain's ccTLD (`CCTLD_COUNTRY`; no `.co/.io/.ai`), individual
  customers → no company leads. Used by the wizard
  (`onboarding._try_domain_autofill`: jumps to the mailbox step, typed answers
  beat the page, an unreadable site is reported and nothing guessed),
  `POST /api/company/infer/` (Settings → Fetch, step 2: owner/admin, 5/min per
  user, ANSWERS only — the browser saves through `PUT /api/settings/`, whose
  targeting now carries `notes` = `icp_notes`) and `icp.buyer_industries`.
- NO built-in "who to find" list any more (`icp.BUYER_INDUSTRIES` /
  `GIFTING_BUYER_INDUSTRIES` were deleted — one seller's customers handed to
  every other seller filled workspaces with leads from the wrong line of work),
  and nothing is INFERRED at fetch time either (`infer_buyers_for_settings`
  removed): `icp.buyer_industries` = the saved list (peer terms dropped) or
  `[]`. The model still works out who to find — from what the seller does
  (`business_profile.plan_targeting`) — but only through a door that SAVES
  the answer first: Settings → Fetch, the setup wizard, "who should I find?"
  in chat. Agency mode keeps its own default list.
- **Lead-finding gate** (`core/lead_gate.py`, migration 0045) — a workspace
  without proper data cannot fetch leads. The owner found 726 garbage leads
  (veterinary clinics, tattoo shops) in a journal publisher's workspace: the
  setup wizard switched autopilot ON when it was finished OR skipped, whatever
  the data, and the button was always live. "Proper data" = three SAVED
  things: company name, at least one thing you sell, who to find (choosing
  "partner agencies" counts; a list made only of businesses like the seller's
  own does not). `missing_lead_data(settings)` is the ONE rule; enforced
  before the run lock in `pipeline.run_pipeline` / `start_pipeline_async`
  (so chat, API and both schedulers are covered), as 422 in `pipeline_run`,
  as 400 in the settings serializer, in the chat `set_frequency` action and
  in both scheduler ticks. `GET /api/pipeline/status/` carries `leadFetch
  {ready, missing, message}`; the app reads it through
  `status.leadFetchBlock` — "Find leads now" (TopBar + `CycleButton`, 7
  places) is disabled with the message on hover, the status pill says "Lead
  finding off", Home's status tile (`.lead-gate-note`) and the Leads page say
  what is missing with an "Add what's missing" button, and the Autopilot
  toggle is disabled. The wizard's finish/skip turns autopilot on only when
  the data is there. Switching autopilot ON without the data is refused; a
  save (or a saved-profile switch) that TAKES the data away while autopilot
  is on is never refused — autopilot goes off with it and the response
  carries `notice` (shown as a toast). The live status refreshes on every
  settings save and on in-app navigation. Tests that start a cycle on a
  fresh workspace call `self.lead_ready()` (`core/tests/base.py`) first.
  E2E section "3d" in `scripts/e2e/flow.py` covers it (a workspace that has
  not finished its wizard is taken from Home to the wizard on page load, so
  the gate asks for Home again).
- **Rate-limited search says so** (`core.search_backends.pause`,
  `pipeline.search_cooldown`) — every engine that rate-limits us is parked
  for 1 minute after its first failure, doubling to a 30-minute cap; a cycle
  whose web search got no answer from any engine (no backend hit in
  `cycle_stats()`, some query `exhausted`, engines still resting) records
  `summary.searchPaused = {until, engines}` and puts a plain "Search paused:
  the search engines are rate-limiting us (8 of 8 resting) … They open up
  again in about 30 minutes" FIRST in the run's notes. `GET
  /api/pipeline/status/` carries `searchCooldown {until, inMinutes}` while
  that lasts (minutes counted at the look, always rounded UP), else `null`.
  The app: the finished-search toast says why and when to try again (read
  from `lastRun.summary.searchPaused`, so it still tells the reason once the
  wait is over), the status pill + Home tile say "Search paused", "Find
  leads now" stays clickable with the wait on hover; the evening report marks
  the run. Engine health is PER PROCESS (the worker and the API each keep
  their own table — they share the IP, so the wait is approximate, never a
  promise), and a run saved before this change has no wait. E2E "3e" adds a
  cooldown to the status answer for a moment (nothing saved).
- New workspaces start on the deployment's self-hosted model
  (`ai.default_ai_provider`, from `AI_PROVIDER`) — otherwise the AI, the
  AI-filled setup and the search silently do nothing for every workspace after
  the first. `settings.aiKey.ready` tells the UI the AI can run without a key.
- Address reader (`company_scrape.address_in_text`): line-based — an "Address"
  label on the same or the next line, footer bullets, then `/about` +
  `/contact` pages inside one 8s budget; a street number counts without a PIN
  code. Deliberately strict (it is printed under every cold email). The
  model-free "what you sell" is schema.org offers ONLY — page headings were
  marketing lines; the model reads the page for the rest.
- Frontend: `TagInput` commits typed text on blur (it used to vanish unless
  Enter/Add was pressed — "Who to find is not saving"); the product-tour card
  lifts above a visible Save bar (`body:has(.save-bar) .tutor-card`) — it sat
  exactly on "Save changes" for first-login users.
- The Assistant (`core/assistant.py` + `core/convo.py`) — conversation calls
  go through `ai.llm_chat`, NEVER `llm_complete`: on the local runtime it
  switches the model's private thinking OFF (measured: a five-word answer
  spent 155 hidden tokens, a turn took 40–90 s) and returns the real token
  counts and `cut` (`done_reason == "length"`). Memory: `User.chat_memory`
  (migration 0043) = `{summary, through}` — a note about every message up to
  id `through`; later ones go word for word while they fit
  `convo.PROMPT_BUDGET` (env `AI_PROMPT_BUDGET`, 2600 of the runtime's
  `AI_CONTEXT_TOKENS`=4096). **Auto-compress** (1) when the turns no longer
  fit and (2) whenever an answer is flagged — `compress(2)` folds all but
  the two newest turns into the note. **Honesty guard** (`convo.guarded` →
  `detect_problems`): made-up totals/names that are in neither the facts nor
  the conversation, "I've sent/updated…" when no command ran, repetition,
  leaked reasoning/other-AI names, placeholders, a cut-off sentence, wrong
  script for Tamil. The guard judges honesty and SHAPE only, never style —
  a correct answer that merely ends with the same closing line as the one
  before is shown (rejecting those replaced good replies with plain "noted"
  acknowledgements in a real-model run). A flagged answer is never shown:
  compress + answer again (`TIGHT_RULES`), else the honest plain reply (in
  the person's own words for Tamil/Tanglish when it has no facts). An answer
  stopped by its length allowance keeps its complete sentences; Tamil script
  gets a larger allowance (`ANSWER_TOKENS`) and a colder sample with a
  repeat penalty (the small model loops in it). The language is the first and
  last thing the model reads (the small model drifts into English) and
  English examples are withheld for non-English writers. Clearing the chat
  clears the memory.
- Prompt shape (`assistant._system_prompt` / `_answer_prompt`): the live
  FACTS sit in the instructions and the user message is ONE RUNNING
  TRANSCRIPT that ends on `Assistant:` — each turn's message is the previous
  turn's plus the new messages, so the local runtime reuses what it read
  (its prompt cache keeps a copy of every different prompt: ~110 KB per
  prompt token, not configurable — ollama/ollama #18106, #18264) instead of
  storing another. Do not add a trailing "Answer the person." line or move
  the facts below the conversation: the first breaks the continuation, the
  second made the model answer from the stored profile instead of the chat.
- Known limits of qwen3:1.7b measured with `eval_assistant` (2026-11-23) —
  not bugs in the code, do not "fix" them by adding prompt lines (three
  designs were tried for the first): (1) asked "what do we sell?" it answers
  from the SAVED profile even when the owner described the business
  differently a moment earlier — memory works (it recalls a name given in
  chat), the saved profile simply wins for that question; (2) Tamil-script
  replies are poor — often a few garbled words mixed with English — while
  English and Tanglish are fine. Both need a stronger local model, which the
  8 GB / 2-core VPS cannot run.
- The model's job: `workspaces.RESPONDER_PROMPT` (+ `core/assistant.JOB` /
  `ANSWER_RULES`). The first default described a lead-reply bot and sat in
  the same prompt as "you are the sales assistant" — `fix_responder_prompt`
  (migration 0044) repoints rows still on it; a prompt a workspace wrote
  itself is never touched.
- `ai.model_for`: the self-hosted runtime is only sent a model it HAS
  (`runtime_models()` asks `/api/tags`, cached 10 min) — every new workspace
  is seeded with the cloud name `GLM-4.6` in its agent rows, which was a 404
  on EVERY AI call for every workspace after the first two (pipeline fell
  back to templates, Assistant to keywords). Found by `eval_assistant`.
- Command check (`actions.detect_action`): keyword rules → a hint gate
  (`_COMMAND_HINT`: small talk never costs a model call) → the model with a
  LOCKED shape (`_SPEC_SCHEMA`), only the action's own fields kept. "Who
  should I find?" / "work out who to find" / "we sell …" (while Who to find
  is empty) → `suggest_targeting` → `business_profile.plan_targeting` → a
  yes/no offer → `set_targeting`. "Where do I set who to find?" is NOT a
  request. The wizard's target step does the same for a typed list
  (`onboarding._target_list_answer`).
- Guide (`core/guide.py`): the knowledge base is split into sections
  (`KB_SECTIONS`, one per Settings area) and a question is given only what
  it is about (`relevant_sections`, ≤ `GUIDE_KNOWLEDGE_TOKENS`) — reading
  all ~2,000 tokens cost the model ~40 s before it wrote a word; a question
  that matches nothing still gets everything. History is fitted by tokens
  and compressed into a note; same honesty guard.
- `manage.py eval_assistant [--quick] [--show]` — the regression run for the
  small local model: scripted conversations in a throwaway workspace against
  the REAL runtime, scored (identity, real numbers, no false "I sent it",
  memory, who-to-find analysis + set-on-yes, long chat compressed and inside
  the window, Tamil, command check ≥ 17/20, guide, past made-up replies
  caught). A change to the model's instructions, memory or guard is only
  done when this passes; exit 1 otherwise. To try code on the VPS before a
  deploy: `docker cp` the files into `warmpulse-django-1:/app` and run it —
  the running gunicorn keeps the old code until the real deploy.
- The regression run's throwaway workspaces: every one is `eval-<stamp>`
  (local time). A SIGTERM/SIGINT/SIGHUP becomes an exception so the run still
  deletes its own; and each run first sweeps leftovers of runs that were
  killed hard (`sweep_leftovers`: only `eval-<stamp>` slugs older than 60
  min — never anything else). A killed run DID leave one on the live server
  once (2026-11-23); `User.objects.filter(username__startswith='eval-')`
  and `Workspace.all_tenants.filter(slug__startswith='eval-')` must be empty.
  To stop a run on the VPS: the app container has NO `pkill`/`ps` — find the
  pid under `/proc/*/cmdline` and `kill -TERM` it; a host-side
  `pkill -f eval_assistant` kills your own ssh session (its command line
  contains the pattern).
- Admin secret slug (`/<6-digits>/…` console prefix): wrong hits are logged to
  `SlugAttempt` (no instant email) and emailed as a weekly digest via
  `manage.py send_slug_report` — VPS cron Monday 09:00 IST (03:30 UTC), log
  `/var/log/warmpulse-slug-report.log`. Digest always sends (0 hits = alive ping);
  sent from the PLATFORM SMTP (`PLATFORM_SMTP_*` → noreply@warmpulse.tech,
  duck-typed mailbox shim — no connected Mailbox row) to
  `AppSettings.report_email`; falls back to tenant SMTP when unset.
  Rate limits: `AdminSlugThrottle` 5/min per IP + ≥10 wrong hits from one IP
  in 15 min → 429 (DB-backed lockout in `admin_slug_check`).
  Rotate the slug with `manage.py set_admin_slug`.

## Gotchas

- Vite binds IPv6 `[::1]` only; zombie Vite processes survive task kills —
  `netstat -ano | grep :5173` + `taskkill //F //PID` before restarts; port
  assignment is ready-order, not start-order.
- Background servers die with the session — see Commands to bring the stack back.
- Deploy rule: after `git pull`, rebuild AND recreate `django`, `django-worker`
  and (for UI work) `frontend` TOGETHER —
  `docker compose build django django-worker frontend && docker compose up -d --force-recreate django django-worker frontend`.
  Recreating only `django` leaves the worker on stale code.
- Deploying while autopilot is on: the restart cuts a running cycle in half
  (the worker is also the email sender). A cycle writes its `PipelineRun` only
  when it FINISHES, so an "unfinished runs" query cannot show a running cycle
  — read the worker log: `[slug] Cycle due — running pipeline…` starts one,
  `[slug] Run #N: …` or `Pipeline cycle failed [slug]` ends it (a cycle may
  take 35 min). Wait for the end line, `docker compose stop django-worker` at
  once (then no new cycle can start), build, switch all three over; the image
  entrypoint runs `migrate` itself at start. If the model runner is over
  ~3 GB when the cycle ends, `ops/ollama-watchdog.sh` recycles the idle runner
  before the build. Pull with `--ff-only` only — the server tree carries its
  own nginx.conf edits. `ops/deploy/deploy.sh` is the OLD pre-merge path
  (systemd, `git reset --hard`): never run it on this stack.
- Public traffic enters through the HOST nginx
  (`/etc/nginx/sites-available/warmpulse.conf`, :443, Let's Encrypt — a file
  on the server, not in the repo) in front of the compose gateway
  (`127.0.0.1:8088`). Its `/wp-api/` location forwards the path to that
  gateway UNCHANGED (`proxy_pass http://127.0.0.1:8088;`, since 2026-11-24)
  and the gateway's own `/wp-api/api/` → fastapi route does the rewrite.
  Until then it pointed at `127.0.0.1:8001/api/`, the old host-level API
  (retired 2026-11-22): for two days every public `/wp-api/*` was a 502 (the
  Warmup section and the console's warmup-backed pages) while everything
  inside the docker network answered fine. So when a public path 502s and the
  gateway log shows nothing, look at the HOST nginx
  (`/var/log/nginx/error.log`: "connect() failed … upstream"). Change that
  file only with a backup + `nginx -t` + `systemctl reload nginx` (earlier
  copies in `/root/nginx-backups/`). The gateway re-resolves upstream names
  every 10 s, so recreated containers need no gateway restart.
- gunicorn runs `gthread` (2 workers × 4 threads): a chat reply or a website
  read waits a minute or more on the local model, and single-threaded workers
  let two such requests freeze the whole API. Timeouts line up: frontend 240s
  (infer / wizard domain paste) ≤ nginx 300s ≤ gunicorn 300s.
- VPS shell scripting: write the script to a local file → `scp` → `docker cp`
  into `warmpulse-django-1:/app/x.py` → `docker compose exec -T django python
  manage.py shell -c "exec(open(\"/app/x.py\").read())"`. `if __name__ ==
  '__main__'` never fires there, and backslash-heavy inline `python -c` breaks
  on quoting — use files.
- The model runner grows the whole time it stays loaded (`llama-server`
  inside `warmpulse-ollama`): 2.1 GB fresh → 3.3 GB after a day → 5.6 GB on
  2026-11-23, when the 8 GB box ran out (load average 60, swap full, every AI
  call timing out — the recurring "server is slow / AI can't process").
  Guard rails: `mem_limit`/`memswap_limit` 4g + `MALLOC_ARENA_MAX=2` in the
  compose `ollama` service, and `ops/ollama-watchdog.sh` from cron every 15
  minutes (`*/5 * * * *`, log `/var/log/warmpulse-ollama-watchdog.log`)
  which restarts the runtime when it passes 3200 MB and is idle — the model
  reloads on the next request (~15 s). It is the runtime's PROMPT CACHE: a
  copy of every different prompt it has read, ~110 KB per prompt token, not
  configurable (ollama/ollama #18106, #18264) — which is also why each
  Assistant turn's prompt is an exact continuation of the previous one
  (`assistant._answer_prompt`: one running transcript): the runtime reuses
  what it read instead of keeping another copy. If the site is suddenly
  slow, check `docker stats --no-stream warmpulse-ollama` and `free -m` FIRST.
- The local model is one shared slot: a background pipeline cycle's AI calls
  queue ahead of chat replies. Prompt size is latency — roughly 60 prompt
  tokens and ~5 answer tokens per second on the 2-core box — so conversation
  prompts are kept short and the stable parts (system, facts) come first for
  the runtime's prefix cache.
- Alembic (backend/) is Postgres-only; sqlite dev needs the bootstrap flag.
- Branch state: single branch `main` (= `master`, synced via PR). Only
  `feat/client-ui-and-outreach-safety` preserved (Agy's work). Push to
  `origin/main` only on the owner's explicit command — **no push/deploy without command**.
  Push protection: any `AQ.*`/`AIza*` key in history blocks pushes to sales-agent
  repo (GEMINI key was scrubbed; check before pushing new work).
- E2E selectors worth knowing: `.side-logout`, `aside.sidebar` full-height rail,
  password-rule `li.pass/.fail` flip on signup, `.code-slots__input`, `.tfa-panel`, `.tfa-qr-box`.
  A `.tags-field` found by `has_text` can match two fields (the Cities hint says
  "countries") — filter by its own `label.field-label` instead. In DRF's
  `APIClient`, `.credentials()` set earlier override a per-request
  `HTTP_AUTHORIZATION` — use a fresh client for a second user.
- The gate signs in to the platform console FOR REAL (section 8c): a throwaway
  superadmin `e2e-console-admin` with a known authenticator secret is created
  in the e2e DB (`django_shell`), signs in at the admin door with a fresh
  code (`totp_code` — same arithmetic as `core/totp.py`), and is deleted in a
  `finally`. To look at the console by hand do the same: give a local
  platform admin a `totp_secret` and type the current code. The walk never
  reloads the page — `POST /api/admin-slug/check/` allows 5 a minute per IP
  (each page load sends it twice in dev), a further one answers 429 and the
  app shows that as its 404 page.
- Console shell (`PlatformShell`): NO top bar on a wide screen — it only
  repeated the brand and the open page, and every page has its own title
  (`.pf-topbar` is `display: none` above 900px; below that the rail becomes a
  drawer and the bar is back holding only `.menu-btn`). `.sidebar-brand` is
  `flex: none`: the console's long menu squeezed that row to 40–50px (it
  is 58px, 50px under 760px tall, 46px under 640px) and the logo sat jammed
  against the top — a long menu scrolls `.side-nav`, never the brand. Its
  12px inset puts the logo tile and the nav pills on one left edge, and
  the logo goes to Overview through `navigateAdmin` (it used to append a
  stale `#/platform/overview`). The rail has NO "Console / Platform admin"
  card (owner, 2026-11-24). `resolvePlatformPage` (`shared.tsx`) is the ONE
  place an address becomes a page: current ones as is, `billing` → the
  Payment page, retired ones (`llm`, `revenge`, `addons`) → Overview — and
  `PlatformShell`'s `sync` runs it on arrival AND on every popstate, putting
  the real address in the bar (tidying only on a page change left `/addons`
  in the bar when the Overview was already open). Payment's tabs are the
  addresses `payment` (Billing) · `payments` · `invoices`; the three tab
  components take `embedded` to skip their own header. The Payment entry is
  the open one for all three (`isOpen`).
- Collapsible rail (console): `.sidebar-toggle` is a round button on the
  rail's edge inside `.sidebar-brand-row`; it adds `.collapsed` (72px icon
  rail: names hidden, `title` on each item, hairlines between groups, avatar
  + sign-out icon only) and `.app-shell:has(.sidebar.collapsed) .main`
  follows at `margin-left: 96px`. Remembered in `localStorage`
  `agentic-ai:sidebar`. Everything collapsed-related lives in
  `@media (min-width: 901px)`: at 900px and under the rail is a drawer and the
  button is hidden. Only the console has the button; the workspace sidebar
  shares the CSS and could get one.
- Report studio (`AdminReportsPage`) lays out with `.pf-studio`: builder
  column `minmax(280px, 340px)` + preview `minmax(0, 1fr)`, stacked at
  1100px and under, children `min-width: 0`. The report-type buttons are
  `.pf-pick` and WRAP — `.btn` is `white-space: nowrap`, so the longest
  description ("Platform-wide send volume, engagement funnel…") made its
  card 429px wide in a 340px column and 60px of it slid under the preview.
  `.pf-filters > select` sits on the filter row like its search box (the
  form default `width: 100%` used to put every dropdown on its own line).
- Python env note on Windows: `backend-agent/.venv` and `backend/.venv` are currently
  absent/incomplete — the working venvs live in the sibling checkout
  `../Email-Warmup/` (`backend-agent/.venv` for Django incl. PyJWT;
  `backend/.venv` for FastAPI/uvicorn). `../.superpowers/sdd/dev-secret.txt`
  (gitignored) may need regenerating (32+ chars) before bring-up.
- Local admin setup: after `seed_demo`, manually set the admin user's role:
  `manage.py shell -c "from django.contrib.auth import get_user_model; u=get_user_model().objects.get(username='admin'); u.role='admin'; u.is_superuser=True; u.save()"` —
  otherwise `IsWorkspaceAdmin` returns 403 ("Only the workspace owner…").
- Local bridge auth chain: login clears `PlatformSession` → re-satisfy after each
  login for the warmup bridge to work. FastAPI must share the exact same
  `JWT_SECRET` as Django's `WARMUP_JWT_SECRET` (both must be 32+ chars).
  If admin endpoints return 401: check secret match; if 500: run the FastAPI
  dev bootstrap to create sqlite tables (`WARMUP_DEV_BOOTSTRAP=1`).
- Workflow rule: update `AGENTS.md` after completing work whenever architecture, routes,
  dev commands, or gotchas change.
