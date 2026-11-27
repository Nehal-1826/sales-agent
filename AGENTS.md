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
- `scripts/e2e/flow.py` — the Playwright gate (186 checks; run before every push).
- `docs/superpowers/` — specs + plans (foundation, shell-ux batch, warmup dashboards).

## Commands (local dev, Windows Git Bash — quote paths, space in "Devesh B")

```bash
# 1) Django  (.venv inside backend-agent)
#    SIGNUP_THROTTLE_RATE is LOCAL only: the sign-up door allows 5 an hour per
#    address in production (the default), and the browser gate signs up twice a run.
cd backend-agent && export DATABASE_URL=sqlite:///db-agent-e2e.sqlite3 \
  && export WARMUP_JWT_SECRET=$(cat ../.superpowers/sdd/dev-secret.txt) \
  && export SIGNUP_THROTTLE_RATE=1000/hour \
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
cd backend && .venv/Scripts/python -m pytest tests/test_bridge_auth.py tests/test_auth.py tests/test_api_key_auth.py tests/test_admin_role.py tests/test_admin_users.py tests/test_formatting.py -q
cd frontend && npm run build            # tsc + vite + SSR + prerender
python scripts/e2e/flow.py              # full-stack gate (servers must be up)
cd backend-agent && .venv/Scripts/python manage.py purge_deleted --dry-run   # what the 30-day cleanup WOULD remove (changes nothing)
cd backend-agent && .venv/Scripts/python manage.py eval_assistant   # real-model regression (needs the local runtime)
```

The shared bridge secret must be **32+ chars** and identical on both backends
(Django mints, FastAPI verifies — both fail loud on weak/placeholder secrets).

## Architecture rules

- One login: Django identity (workspaces, OTP, billing). `POST /api/auth/warmup-token/`
  mints an HS256 `iss=agent-bridge` JWT (12h) — FastAPI auto-provisions passwordless
  users from it, keyed on the email (`backend/app/api/deps.py
  _provision_bridge_user`). A FIRST sign-in fires several requests at once
  and two could both try the insert: the loser used to answer 500 on the
  unique email (every brand-new admin's or customer's first sign-in); it now
  rolls back and takes the row that won (2026-11-24). Both auth dependencies
  guard foreign `iss` (kill-switch `AGENT_BRIDGE_ENABLED`). Platform admins
  who have two-factor, and 2FA-enabled workspace users, need a
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
  Both `#/settings/twofactor` (`TwoFactorSection.tsx`) and `#/platform/settings`
  (`AdminSettingsPage.tsx`) share `frontend/src/components/TwoFactorPanel.tsx` (`CodeSlots`
  animations, QR + copyable manual secret, enable, 2-step authenticator rotate, disable).
- Two-factor is ONE authenticator per account and OPTIONAL (owner's order,
  2026-11-25): the extra devices of migration 0038 are gone
  (`0046_one_authenticator`, `TotpDevice` deleted), and a platform admin
  without one signs in with the password alone. `core.authz.otp_satisfied` is
  the ONE decision point — the second check passes when the code was verified
  OR the account has no two-factor; `auth_extras` → `otp_required = enrolled
  and not token_otp_satisfied(request)` (NOT `otp_satisfied`: the login view
  has no user yet). `TotpScreen` only asks for the code (the auto-enrolling QR
  step is gone); the console's Settings card says "Off · optional".
- **Enter as user** (impersonation, 2026-11-25): a platform admin opens a
  customer's workspace in a NEW tab for 60 minutes. `ImpersonationTicket`
  (migration 0047) stores only the SHA-256 of a random ticket; it starts once,
  within 10 minutes (`core/impersonation.py`). `POST /api/platform/users/<id>/impersonate/`
  `{reason}` issues it, `POST /api/auth/impersonate/start|end/` use it, and the
  tab signs every request `Authorization: Impersonation <ticket>` —
  `core.authentication.ImpersonationAuthentication`, FIRST in
  `DEFAULT_AUTHENTICATION_CLASSES`, which only looks at its own keyword. The
  ticket lives in the tab's `sessionStorage` (`agentic-ai:impersonation`), so
  the admin's own tab — whose token every tab shares through localStorage —
  is never touched: inside that tab `transport.ts` never loads the shared
  token, a 401 drops only the ticket, and `logout()` only ends it. Hand-off:
  `/impersonate#t=<ticket>` (a fragment never reaches a server), moved into
  storage and started once per tab; `App` renders `ImpersonatePage` for the
  whole life of that tab on every address, so a refresh brings the same
  workspace back. Refused inside, by the server, in TWO places —
  `ImpersonationRefusalMiddleware` (before the router) and the authentication
  class — for `core.impersonation.REFUSED_PREFIXES`: password, username,
  2FA, the warmup bridge token (so the Warmup page says it is not available)
  and every `/api/platform/…`. Everything else inside is as that person, with
  their role — approving and sending e-mail included (the owner's decision).
  The bar on top (`ImpersonationBanner`) is a
  normal element above the shell; everything hidden by a negative offset
  needs the bar's height too (the skip link hung 33px over it). Start and
  end are audited (`platform.impersonate.issue/start/end`) under the ADMIN's
  name; the person's two-factor is not asked and `last_login` is not touched.
- The console's Users page lists the REAL accounts: `GET /api/platform/users/`
  (Django, 25 per page, word-split search over e-mail/username/name/company,
  `role` incl. `platform_admin`, `status`) joined in the app with the warmup
  copies by e-mail. A deleted account appears only with `status=deleted`; an
  unknown `status` is a 400 (`bad_status`), never ignored. `last_login` is
  written by `core.authz.note_sign_in` at each of the four places a session
  starts (both doors, sign-up, Google) — nothing wrote it before, so it said
  "Never" for everyone.
- **Delete account** (30-day recycle bin, 2026-11-25; `core/accounts.py`,
  migration 0048: `User.deleted_at/deleted_by`, `Workspace.deleted_at`):
  `POST /api/platform/users/<id>/delete/` `{reason, confirmEmail}` and
  `…/restore/` `{reason}`. The existing `is_active = False` is what stops
  sign-in and the worker (all of them already skip what is not active). A
  deletion pauses the warmup mailboxes of every account that goes FIRST
  (`core/warmup_accounts.py`, server-to-server by e-mail with a bridge token
  minted for the acting admin): if that fails nothing changes (502
  `warmup_unavailable`) — a deleted account must never keep warming, and
  "could not look" is never read as "no copy". When it fails on a LATER
  account, what was already paused runs again (`warmup_accounts.undo`), or
  the admin is told whose mailboxes stayed paused. The workspace stops with its
  last owner/admin and the other accounts in it go with it; only the
  deletion's own stop is stamped (`Workspace.deleted_at`), so a workspace an
  admin stopped by hand from Tenants is never restarted by a restore. A
  restore restarts a deletion-stopped workspace as soon as it has an owner or
  admin again. Sign-in answers "This account was deleted." on both doors and
  Google — only when the password is right. `manage.py purge_deleted
  [--days 30] [--dry-run]` (also a daily thread in `run_worker`) removes what
  is 30 days deleted: an account on its own, a stopped workspace with
  everything in it once nobody in it can come back (together — never restore
  someone into a workspace that can never start); billing rows and the audit
  log stay, the workspace row stays as "Deleted account <id>", an active
  subscription becomes `canceled` WITHOUT a gateway call. A purge is only
  complete when the warmup copy went first; a vanished admin leaves the copy,
  logged with its e-mail. In the app: Users → a panel → "Delete account"
  (`DeleteAccountDialog.tsx`: says in plain words whether the whole workspace
  stops; the button unlocks only with the account's e-mail typed and a
  reason); the "Deleted" filter lists them with "Restore account" and the day
  they go for good; a deleted row cannot be ticked for the warmup bulk
  actions ("Resume all" would undo the deletion's pause).
- **Changing roles** (2026-11-26; `core/roles.py`, no migration): console →
  Users → a panel → **Role** (Member · Admin · Owner · Super admin) →
  **Change role** with a reason: `POST /api/platform/users/<id>/role/`
  `{role, reason, workspace?}`. "Super admin" is STILL not a role value — it
  is an account with no workspace and `is_staff` — so picking it takes the
  account OUT of its company and picking a company role for a Super admin
  puts it INTO one (`workspace` = the company id; `GET
  /api/platform/workspaces/` lists the running companies; the plan's seat
  limit applies). `roles.can_change` is the ONE rule: never your own account,
  never a deleted one, never the role it has, a company always keeps an
  owner (the only owner can be neither lowered nor made a Super admin), the
  console always keeps a Super admin. (Two accounts with one e-mail address
  — the live bug of 26 Nov 2026 — cannot exist any more: see Account
  uniqueness.)
  Warmup FIRST, then the account: a
  promotion pauses the person's warmup mailboxes while their copy is still a
  client and then sets the copy's role (`POST /api/admin/users/{id}/role` —
  the warmup side's one door for it; signing in still never flips an existing
  copy); a demotion sets the copy back to `client` and lets the mailboxes run
  again; a service that cannot be reached changes nothing — and when it fails
  on the SECOND step, the first is taken back (`warmup_accounts.undo`), or
  the admin is told what stayed done: the answer says "Nothing was changed"
  only when it is true. What that service says when it refuses ON PURPOSE (a
  4xx with a reason) is passed on in its words and with its status
  (`warmup_refused`); `warmup_unavailable` / 502 is only for a service that is
  down or fails (`warmup_accounts._refused`). A person made
  Owner/Admin in a company that is already set up gets `onboarding.done`, so
  the setup wizard does not catch them (its finish flips the company's
  autopilot). Always `QuerySet.update()` — and for a change INSIDE a company
  the request's `workspace` is empty: the account must keep its own company
  (the first version detached it; the tests caught it). Audit
  `platform.user.role`. The console says "Super admin", never "Platform
  admin", and the rail's foot names the account that is signed in.
- **Account uniqueness** (27 Nov 2026; owner's order; `core/identity.py`,
  migration 0051): one person, one e-mail address; one company, one name —
  enforced at every door AND by the database itself. `core_user.email` had
  no uniqueness rule at all (only the sign-up form checked it), and on live
  two platform admins came to share `superadmin@warmpulse.tech`: `admin`
  (id 1) was the development database's superuser, brought over by the 18
  Nov full import, and `superadmin` (id 7) was made by a script on 19 Nov
  with the same address. The database now holds: `uniq_user_email_ci`
  (unique on `LOWER(TRIM(email))` where the address is not empty — Django
  writes it as a unique index on PostgreSQL AND SQLite), `uniq_user_username_ci`
  (`LOWER(username)`), and `Workspace.name_key` (`uniq_workspace_name_key`:
  trimmed, inner spaces collapsed, case-folded — computed in `save()` and
  by `WorkspaceQuerySet.update(name=…)`, so a raw update keeps it in step).
  Migration 0051 REPORTS FIRST: with two rows sharing a company name or an
  e-mail address it stops and lists their ids — a clash is resolved by a
  person, never by a migration. (A typed name in Settings that equals
  another company's name does not stop it: the settings door looks at a
  name only when it changes, so the demo seed's typed "Shailog Technologies"
  on the company "Demo" blocks nothing.) `core.identity` is the one way to
  write and compare
  (`normalize_email`, `email_is_taken`, `username_is_taken`, `company_key`,
  `company_name_is_taken`, `sync_company_name`, `signup_address_in_use`,
  `signup_lost_race`); `User.save()` stores the e-mail in one form. Every
  door asks it first and says the same three sentences: "Email already
  registered. Sign in instead." · "Company already exists. Sign in
  instead." · "That username is already taken." — sign-up (`company` and
  `email` field errors; a lost race is caught and answered from what the
  database holds now), `PUT /api/settings/` (400 `detail`), the wizard's
  company step (asked again), the profile fetch (`apply_profile` keeps the
  current name and says so), `create_platform_admin`, `create_workspace`,
  the Django admin's user and workspace forms, `change-username` (a lost
  race is a 409, it was an uncaught error), and Google sign-in (refuses more
  than one match; it still never makes an account). `bootstrap_admin` never
  makes a second account: a username or address taken elsewhere → "already
  exists elsewhere — nothing to do" (it used to crash — `set -e` took the
  container down — and printed an API token into the log; the token line is
  gone, the GENERATED password line is still there by design). There is no
  phone field on accounts (the owner chose to skip phone), no invites, no
  user import, no "is this e-mail free" door (it would let people probe
  addresses); sign-up stays at 5/hour per IP. Soft-deleted accounts and
  stopped companies keep their address / name. ONE COMPANY NAME: the name
  typed in Settings → Your business is also the workspace's name
  (`sync_company_name`: what the console, the sidebar and reports show) —
  the migration renames nothing; tooling that assigns `company_name`
  directly (the demo seed, `eval_assistant`) renames nothing, and the eval's
  throwaway workspace carries the run's stamp because a company name is
  never taken twice. Pinned by `core.tests.test_identity`.
- **Formats** (2026-11-26; owner's order: Indian by default, changeable at any
  time, for every role in both apps): `User.format` (`IN` · `US` · `GB` ·
  `device`) and `User.clock` (`12h` · `24h`), migration 0050, every account
  starts on India + 12-hour. `GET /api/auth/me/` carries `preferences
  {format, clock}`; `PUT /api/auth/preferences/` (signed in + OTP satisfied;
  only the keys sent change; an unknown value is a 400) saves them. Refused
  inside "Enter as user" (`REFUSED_PREFIXES`): those are the customer's
  screens, and that tab follows the CUSTOMER's choice (it comes with their
  profile) — the admin's own tab is never touched.
- The app has ONE formatter, `frontend/src/lib/format.ts` (`fmtDate`,
  `fmtTime`, `fmtDateTime`, `fmtDayTick`, `fmtMonth`, `fmtNumber`, `fmtMoney`,
  `fmtMoneyMajor`, `fmtPercent`, `timeAgo`, `plural`). Nothing else under
  `frontend/src` may call `toLocaleDateString` / `toLocaleTimeString` /
  `.toLocaleString` / `new Intl.NumberFormat` / `new Intl.DateTimeFormat` —
  the browser gate's last section reads the source for it (the public
  marketing pages are the one exception). The choice lives in that module
  (`setPreferences`, fed by `getCurrentUser` / `getMe` / the impersonation
  profile; `usePreferences()` through `useSyncExternalStore`); the app waits
  for the profile before the first screen, so nothing flashes in the wrong
  format. A saved change re-draws every open screen at once through
  `FormatScope` (inside `<main>` in `App`'s Shell and in `PlatformShell`;
  render-prop — nothing remounts, no page has to subscribe). Ways in:
  Settings → Account (`AccountSection`), console Settings (after two-factor,
  `AdminSettingsPage`), and the **Format button at the foot of both sidebars**
  (`FormatButton` → `FormatDialog`), because Members never see Settings.
  Rules of the formatter: a bare day (`"2026-11-26"`) or month (`"2026-11"`)
  is a calendar label and reads as THAT day wherever the device is — `new
  Date` reads it as UTC midnight, the day before west of Greenwich; an instant
  (with `Z` or an offset) is shown in the device's zone; the 24-hour clock
  writes its leading zero in every format (09:04); a money sign follows the
  money, only the grouping follows the format; `toFixed(1)` scores, typed
  inputs (hours as 24-hour text), CSV cells and small bounded counts (steps,
  pagers) stay as they are.
- `FormatDialog` is drawn through a portal at the root of the page
  (`createPortal(…, document.body)`): the sidebar is a `backdrop-filter`
  panel, and such a panel is the box its fixed-position children are placed
  against — a dialog rendered inside the rail is squeezed into it.
- Documents that leave the app — invoices, the daily report, the slug digest,
  the digest line in chat, the WhatsApp approval line — are ALWAYS Indian,
  whoever reads them, and are written by the server: `core/formatting.py`
  (Django) and `app/services/formatting.py` (the warmup service; the same
  helpers without Django): lakhs and crores by hand, `26/11/2026`,
  `26/11/2026, 2:05 PM IST` in Indian time, `₹2,999.00` rounded half-up.
  Portable code only — no `%-d` in `strftime` (it does not exist on Windows).
  The warmup invoice PDF's built-in font has no rupee sign (pre-existing).
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
- Daily report (`manage.py daily_report --loop`, the worker's report thread;
  `core/reports.py`): each full 20:00 IST round is remembered per IST day in
  `ReportRound` (migration 0049). When the loop starts and the most recent
  20:00 has passed with no round recorded — the worker was down: a deploy, a
  crash — that round is sent at once, and once only
  (`missed_report_round`); across midnight it is still the evening's round.
  With NO record at all (a first start, the upgrade from before records)
  only today's 20:00 counts, so a routine morning start sends nothing. A full
  round run by hand at or after 20:00 counts as the day's round; one with
  `--day` or `--workspace` does not. A round covers EVERYTHING SINCE THE
  PREVIOUS ONE — the 24 hours up to its own 20:00 IST, longer after an
  outage (`core.reports.report_window_ist`; the owner asked for "daily only",
  25 Nov 2026 — before that the round was the ALL-TIME summary) — and never
  a calendar day: a lead found at 21:00 would then be in no report at all
  (that day's went out at 20:00, the next day's starts at midnight). The
  on-demand reports (the chat command, the API, the Leads & Reports page) are
  unchanged: all time, or one calendar day.

## Gotchas

- Vite binds IPv6 `[::1]` only; zombie Vite processes survive task kills —
  `netstat -ano | grep :5173` + `taskkill //F //PID` before restarts; port
  assignment is ready-order, not start-order.
- Background servers die with the session — see Commands to bring the stack back.
- Vite's dev server CLOSES ITSELF when its standard input ends (Vite
  registers `process.stdin.on("end", …)`, skipped only when `CI=true`): started
  as a background task whose input is later closed, it exits silently — no
  error in its log, the task reports exit 127, and the gate dies on
  `ERR_CONNECTION_REFUSED` at some random check (26 Nov 2026, twice). Start it
  as `CI=true npm run dev`, and when the gate says the connection is refused
  look at `netstat -ano | grep :5173` first — it is the server, not the code.
- Deploy rule: after `git pull`, rebuild AND recreate EVERY service that
  carries the release TOGETHER —
  `docker compose build <services> && docker compose up -d --force-recreate <services>`.
  Always `django django-worker`; `frontend` for UI work; and when `backend/`
  changed, all THREE images built from `./backend`: `fastapi celery-worker
  celery-beat` (their Celery tasks send the payment mails and run the
  renewals — a worker left on the old image keeps writing the old way. Until
  26 Nov 2026 only `fastapi` was recreated, and the two Celery containers ran
  code from 9 days before). Recreating only `django` leaves the worker on
  stale code.
- Deploy ORDER (since 26 Nov 2026): **build first**, then wait, stop, switch.
  The build runs while the old containers keep running, so a build that fails
  switches nothing and stops nothing (the first order stopped the worker
  BEFORE building — a failed build would have left it stopped). Build
  first is also what makes the window short: on 26 Nov 2026 the worker stood
  still 30 s (13:19:27Z → 13:19:57Z) while the build took 1 min 53 s outside
  it. Arrive with a cycle running? Wait for its end line read-only first (a
  poll loop that also checks the worker is still `running`), THEN build, so
  the build's load never lands on a running cycle — cycles are due about
  hourly per workspace. Before the build free memory for it:
  `ops/ollama-watchdog.sh 2500` recycles an IDLE runner over 2.5 GB (it
  was 3.1 GB and 1.7 GB was free; 4.5 GB after — the model reloads on the
  next request).
- Deploying while autopilot is on: the restart cuts a running cycle in half
  (the worker is also the email sender). A cycle writes its `PipelineRun` only
  when it FINISHES, so an "unfinished runs" query cannot show a running cycle
  — read the worker log: `[slug] Cycle due — running pipeline…` starts one,
  `[slug] Run #N: …` or `Pipeline cycle failed [slug]` ends it (a cycle may
  take 35 min). Wait for the end line, `docker compose stop django-worker` at
  once (then no new cycle can start), switch everything over together; the
  image entrypoint runs `migrate` itself at start. From that `stop` to the
  switch-over the site sends no e-mail, reads no inbox and runs no cycle. A
  20:00 IST daily report inside the window goes out LATE, not lost: the
  report loop sends a missed round the moment it starts again
  (`core.reports.missed_report_round`, the `ReportRound` record, migration
  0049 — since 25 Nov 2026; before that the round was simply missed). Keep
  the window short, and if the switch fails, `docker compose start
  django-worker` AT ONCE and sort it out with the site running. On 25 Nov
  2026 the worker stood still for
  2 h 47 min because the switch-over never actually started (the ssh trap
  two bullets below); no e-mail was due, but that evening's report was lost
  — which is why the catch-up exists. If the model runner is over
  ~3 GB when the cycle ends, `ops/ollama-watchdog.sh` recycles the idle runner
  before the build. Pull with `--ff-only` only — the server tree carries its
  own nginx.conf edits. `ops/deploy/deploy.sh` is the OLD pre-merge path
  (systemd, `git reset --hard`): never run it on this stack.
- After a switch, look — read-only, never a test sign-in on live:
  `docker compose exec -T django python manage.py showmigrations core | tail -3`;
  each new container's first log lines (the Django one says `Applying
  core.00NN… OK`); `grep -cE "Traceback|ImportError"` over all services since
  the switch (0); signed-out probes from OUTSIDE — a new route answers 401
  where a made-up path on the same router answers 404 (that difference IS
  the proof the route is served); the live bundle's name equals the local
  build's (`frontend/dist/assets/index-*.js` — the hash is of the content)
  and carries the new screens' words; and `.superpowers/sdd/live-smoke.py`
  (14 public checks through a headless browser; nothing is signed in to).
  In this FastAPI version `app.routes` holds `_IncludedRouter` objects with
  no `.path`: to list a router's paths read the module's `router.routes` with
  `getattr(r, "path", "")`.
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
  on quoting — use files. A file fed through stdin works ONLY in a command
  that backgrounds nothing: in a non-interactive ssh shell a list started
  with `&` reads its stdin from /dev/null, so
  `cat > job.sh && nohup bash job.sh > log 2>&1 < /dev/null &` wrote an
  EMPTY file and the job did nothing, silently (25 Nov 2026). Write the file
  in one command and look at it (`wc -l`, its last lines), start the job in
  another, and read its FIRST log line before waiting on it. A wait loop must
  also check that the job is still alive (`pgrep -f job.sh`) — one that only
  greps the log spins forever on a log that stays empty. The deploy job that
  worked on 26 Nov 2026 is four small scripts kept on this machine
  (gitignored, `.superpowers/sdd/deploy-run.sh` = `deploy-build.sh` →
  `deploy-wait-and-stop.sh` → `deploy-switch.sh`): scp them to the server's
  `/tmp` as `warmpulse-*.sh` in a command that backgrounds nothing, compare
  `sha256sum` with the local files, `bash -n` each, and only then start the
  ONE detached job
  (`nohup bash /tmp/warmpulse-run-deploy.sh > /tmp/warmpulse-deploy.log 2>&1 < /dev/null &`).
  The first line of its log is `START <time> tree <commit>` — the tree must be
  the commit that was pushed.
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
  `finally` — together with the copy the warmup side makes of anyone who
  signs in through the bridge (`forget_warmup_copy`: `users` in the LOCAL
  `backend/db-warmup-e2e.sqlite3`, keyed on email, plus whatever points at
  it), so every run is a genuine first sign-in and nothing is left behind.
  To look at the console by hand do the same: give a local
  platform admin a `totp_secret` and type the current code. The walk never
  reloads the page — `POST /api/admin-slug/check/` allows 5 a minute per IP
  (each page load sends it twice in dev), a further one answers 429 and the
  app shows that as its 404 page. The same walk enters the operator's
  workspace for real ("Enter as user": a new page, checked and closed) and
  deletes and restores a throwaway account (`e2e-delete-me`, owner of the
  workspace `e2e-delete-ws`, made and removed by `django_shell`) and, on the
  same company with a second account (`e2e-mate-me`, a Member), changes roles
  end to end (Member → Admin → Owner, a lowered owner, a refusal in the
  server's words, a Super admin made and put back into the company); a deletion
  is refused while the warmup service is down, so those checks are skipped
  then. Two rules for that walk: the first account of a company is always made
  its owner (create the owner BEFORE the member a look is about), and a check
  that asks the server for a REFUSAL must look at the state first — in another
  state the same request is a real change. The same walk flips a date for real:
  with the throwaway admin's own choice (never the operator's) the Users
  table's "Signed up" cell reads day-first under India, turns month-first
  after the United States is chosen in the rail's Format dialog, and is put
  back. Formats have their own walk after it (section 8d): a throwaway
  MEMBER (`e2e-format-me` of the company `e2e-format-ws`, owner first, made
  and removed by `django_shell`, its warmup copy forgotten afterwards) signs
  in in a NEW browser context, starts on "India · 12-hour", reaches Format
  from the sidebar (a Member has no Settings entry), changes to 24-hour —
  the sample line, the account (`/api/auth/me/`), the rail's label — and
  keeps it over a reload. And the gate's last check reads the source for
  formatting outside `lib/format.ts` (see Formats above). The gate also builds-and-serves the BUILT files the way nginx does
  (`built_like_nginx`) for the refresh-flash checks (sections 1b / 2b): the
  home file must hide the marketing page for a signed-in browser before the
  first paint, the other marketing pages must not carry that guard. A check
  that waits for a server answer waits for the THING it checks (up to 20 s),
  never a fixed pause — 1.8 s was not enough for the mailbox list on a
  loaded machine and read as "0 toggles". After that snapshot the gate
  submits the sign-up form twice with a taken company name ("Demo") and a
  registered address, and reads the two sentences under their fields — the
  expected 400s are made after the hygiene snapshot on purpose. The sign-up
  door allows 5 an hour per address, so the LOCAL Django server must be
  started with `SIGNUP_THROTTLE_RATE=1000/hour` (Commands): a third gate run
  within the hour meets a 429 otherwise (it did), and the gate then SKIPs
  those three looks with that reason. The rate lives in the process (locmem):
  clearing the cache from a shell does nothing to a running server.
- Test facts worth knowing (`backend-agent`): account uniqueness is pinned
  by `core.tests.test_identity` (helpers, the database's own rules on
  SQLite, the migration's report through `MigrationCase`, every door) — the
  sign-up door is limited to 5 an hour per IP in tests too, so a test posts
  at most four times; the test database always holds the default workspace
  `shailog` / "Shailog Technologies" (migration 0022), so a test that counts
  companies counts it, and a `name_key` query is the honest count. The
  formats are pinned by
  `core.tests.test_preferences` (the two fields, the profile, the endpoint,
  the refusal inside "Enter as user"), `core.tests.test_formatting` (the
  document helpers) and `backend/tests/test_formatting.py` (the warmup
  copy of them). `billing.tests.helpers.quiet_logs`
  switches logging OFF for a test (`logging.disable(CRITICAL)`) — `assertLogs`
  then sees nothing; watch the logger itself (`mock.patch.object(module.log,
  'warning')`). `make_admin()` returns `(client, user, token)`; a login
  through either door deletes that admin's `PlatformSession` rows, so a
  platform call with the SAME client afterwards is a 403. The platform API is
  rate-limited through the cache: `cache.clear()` in `setUp`. A management
  command's `handle()` must return nothing — Django prints whatever comes
  back (`call_command` crashed on a dict). DRF authenticators run only once an
  address has resolved to a view: a rule that must hold for EVERY request
  belongs in a middleware. The tests that drive `run_worker`
  (`core/tests/test_run_worker.py` `run_ticks`, and two places in
  `core/tests/test_tenant_ops.py`) switch every background thread off BY NAME
  — a thread added to the worker must be added there too, or it runs inside
  the test and spends the patched ticks. A test that drives REAL migrations
  sits on `core.tests.base.MigrationCase`: it rewinds the schema, and classes
  do not run in migration order, so the base brings it back to the newest
  migration after each test (a test that stopped at an old one left every
  later class on that schema).
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
- **Never restore another environment's dump over live.** On 18 Nov 2026 a
  `pg_restore --clean` of the development database replaced the live
  `core_user` and `core_mailbox` tables: the platform admin lost its flags
  and its password, a development superuser (`admin`, id 1) arrived carrying
  `superadmin@warmpulse.tech`, and the next day a repair script made
  `superadmin` with the same address — the duplicate of 26 Nov. Restore per
  table, never `core_user`, `core_workspace`, `authtoken_token`,
  `core_platformsession` or `core_mailbox`; since migration 0051 the
  database refuses two rows with one address, but a whole-table restore
  still replaces every live login. To move data, write the script first and
  read its first log line (the ssh trap below).
- Python env note on Windows: `backend-agent/.venv` and `backend/.venv` are currently
  absent/incomplete — the working venvs live in the sibling checkout
  `../Email-Warmup/` (`backend-agent/.venv` for Django incl. PyJWT;
  `backend/.venv` for FastAPI, uvicorn AND pytest). `../.superpowers/sdd/dev-secret.txt`
  (gitignored) may need regenerating (32+ chars) before bring-up. This shell
  does not pass `TZ` to a child process: to try a time zone in Node, set
  `process.env.TZ` at the top of the script (verified with
  `Intl.DateTimeFormat().resolvedOptions().timeZone`).
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
