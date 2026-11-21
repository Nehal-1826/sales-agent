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
  Platform console at `#/platform` (19 pages grouped: Overview · Analytics · Mail
  [same webmail client as user panel] · PeerInboxes · PoolRouting · AI Usage ·
  Users · Tenants · Retention · Leads · Plans · Add-ons · Billing · Payments ·
  Invoices · Reports · Audit · Settings · Marketing). SystemHealth, PlatformMail
  and MailViewer were removed (broken locally, replaced by the real Mail page).
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
- Shared cache: `settings.CACHES` = RedisCache when `REDIS_URL` is set (compose
  wires `redis://redis:6379/1` into django + django-worker; FastAPI owns db 0),
  locmem locally. DRF throttles + cache cooldowns MUST share this — per-worker
  locmem silently doubled every limit under gunicorn's 2 workers.
- Secrets server-side only (env/.env.docker), masked in API responses, never frontend.
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
- Alembic (backend/) is Postgres-only; sqlite dev needs the bootstrap flag.
- Branch state: single branch `main` (= `master`, synced via PR). Only
  `feat/client-ui-and-outreach-safety` preserved (Agy's work). Push to
  `origin/main` only on the owner's explicit command — **no push/deploy without command**.
  Push protection: any `AQ.*`/`AIza*` key in history blocks pushes to sales-agent
  repo (GEMINI key was scrubbed; check before pushing new work).
- E2E selectors worth knowing: `.side-logout`, `aside.sidebar` full-height rail,
  password-rule `li.pass/.fail` flip on signup, `.code-slots__input`, `.tfa-panel`, `.tfa-qr-box`.
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
