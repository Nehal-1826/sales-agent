# WarmPulse × Shailog AI Agent — Single Product Merge Design

Date: 2026-11-12
Status: approved by product owner (Devesh) in design review
Repos merged: `ShailogTech/Email-Warmup` (WarmPulse, this repo) + `Nehal-1826/sales-agent` (Django agent, line `feat/saas-billing` — the build live at agent.warmpulse.tech)

## Goal

One product, one codebase, one login, one shell. All WarmPulse features (warmup
network, mailboxes, DNS onboarding, reports, mobile app) and all sales-agent
features (lead pipeline, scraping, AI copywriting, approvals, CRM, chat
responder, billing, workspaces) stay fully functional and connected.

Owner decisions (fixed):

- Repo home: **ShailogTech/Email-Warmup** (monorepo). Old repos archived.
- App shell after login: **sales-agent 4-page shell** (Dashboard · Report ·
  Pipeline · Settings, plus new Warmup section).
- Brand: **WarmPulse** (violet tokens). Sales-agent landing UI is reused but
  retitled/recolored to WarmPulse.
- Architecture: **two backends behind one gateway** (no rewrites).

## 1 · Repo layout

```
Email-Warmup/
├─ backend-agent/     Django agent (sales-agent feat/saas-billing: backend/)
├─ backend-warmup/    FastAPI + Celery + Alembic (current backend/, unchanged)
├─ frontend/          sales-agent frontend (src/, index.html, vite config) — THE app
├─ warmpulse-mobile/  unchanged; talks to FastAPI directly
├─ ops/               gateway nginx conf, docker-compose variants, env templates
└─ docs/              this spec, merge plan, merged DEPLOY
```

Import method: `git subtree add` so both histories survive and `git log
--follow` works across the move. Sales-agent files land at `backend-agent/`
and inside `frontend/`; WarmPulse history remains the repo root history.

## 2 · Gateway + routing

Single entrypoint. Prod: nginx gateway container. Dev: Vite proxy.

| Path            | Target                                  |
|-----------------|-----------------------------------------|
| `/`             | frontend SPA (history fallback)         |
| `/api/`         | Django (`backend-agent`) :8000          |
| `/wp-api/`      | FastAPI (`backend-warmup`) :8001, `root_path=/wp-api` |
| `/docs`, `/redoc` | FastAPI docs — gated to platform admins |

Rules:

- FastAPI's public API surface is NOT renamed or version-bumped — the mobile
  app and existing warmup clients keep working.
- `/wp-api/` prefix is stripped by the gateway (`proxy_pass .../8001/` with
  FastAPI `root_path=/wp-api` so generated links stay correct).
- Dev parity: `vite.config.ts` gains a `/wp-api` proxy rule (target overridable
  via `WP_API_PROXY_TARGET`, default `http://127.0.0.1:8001`) beside the
  existing `/api` rule.

## 3 · Auth — one login

Django is the identity provider (it already has workspaces, OTP, email
verification, billing, platform-admin).

Flow:

1. User logs in on the (WarmPulse-branded) sales-agent login page → Django
   token, exactly as today.
2. Frontend calls `POST /api/auth/warmup-token/` (new Django endpoint,
   token-authenticated).
3. Django mints an HS256 JWT with claims: `sub` (django user id), `email`,
   `workspace` (name/slug), `exp` (12 h). Secret: `WARMUP_JWT_SECRET` in env,
   shared with FastAPI.
4. Frontend stores the JWT beside the Django token and attaches it as
   `Authorization: Bearer …` on every `/wp-api/*` request (`warmupApi.ts`
   axios instance).
5. FastAPI validates the JWT; on first sight of a `sub` it auto-provisions its
   local user record (email + external id) and matches subsequent visits.

Mobile app keeps its native WarmPulse JWT login (unchanged) until a later
phase; dual auth on the warmup backend is accepted interim state.

No shared database tables. Alignment happens at the token layer only.

## 4 · Frontend — shell, brand, warmup section

Base: sales-agent frontend from `feat/saas-billing`.

- Shell unchanged structurally: Dashboard · Report · Pipeline · Settings, new
  nav item **Warmup** (rail icon + tab strip).
- Rebrand: WarmPulse wordmark/logo; accent tokens swapped to WarmPulse violet
  (`#7C5CFF` dark / `#6B49FF` light) via the existing CSS custom properties;
  login, emails, and document titles say WarmPulse.
- Landing: sales-agent `LandingPage` structure kept, retitled WarmPulse,
  violet palette, marketing copy covers warmup + outreach.
- Warmup section: WarmPulse client pages ported into `src/pages/warmup/` in
  stages — Dashboard (warmup scores, apexcharts), Mailboxes, DNS onboarding
  wizard, Peer network, Reports/PDF export, Alerts.
  - New `src/lib/warmupApi.ts`: axios instance, base `/wp-api`, Bearer JWT,
    typed responses. No mock-data fallback for warmup — if `/wp-api/health`
    is down the section renders an explicit offline state.
  - Ports keep page logic; styles re-written to the shell's CSS conventions
    (no Tailwind runtime in the merged frontend).
- Admin without loss, one UI for every role: WarmPulse admin pages port into
  the SAME shell as a role-gated section (`src/pages/admin/`), visible only
  to platform admins (Django `platform_admin`). No separate admin app, no
  second dashboard — role determines which nav items appear inside the one
  unified dashboard. WarmPulse admin client area, impersonation, alerting
  admin, and user management all port; nothing is dropped or left behind on
  the old FastAPI-served UI.
- Prerendered marketing build pipeline (SSR + prerender script) is preserved.

## 5 · Data alignment

- JWT carries `sub` (django user id) + `email` + `workspace`.
- FastAPI scopes accounts to that identity; one warmup account per django
  user per workspace.
- Suppression lists stay warmup-side; outreach leads stay agent-side. No
  cross-DB foreign keys.

## 6 · Ops

Single `docker-compose.yml` at root:

- one Postgres (databases: `agent`, `warmup`), one Redis
- services: `django`, `fastapi`, `celery-worker`, `celery-beat`, `gateway`
  (nginx), `frontend` (static + gateway or merged with gateway)
- `.env.example` merged (Django vars + WarmPulse vars + `WARMUP_JWT_SECRET`)
- `DEPLOY.md` merged: VPS flow, HTTPS variant, entrypoint behavior
- Local dev: two runserver/uvicorn processes + Vite proxy (documented in README)

## 7 · Verification

- Django test suite (`backend-agent`, all existing tests)
- FastAPI test suite (`backend-warmup/tests`)
- New: bridge integration test (login → warmup-token → FastAPI accepts JWT →
  auto-provision idempotent)
- Playwright E2E extended: login → shell renders → Warmup tab renders →
  mailbox list loads live data → logout (existing reachability check stays)
- `tsc --noEmit` + `vite build` (+ prerender) green
- Full E2E green before anything is pushed to `ShailogTech/Email-Warmup`

## 8 · Build order

1. **Monorepo assembly** — subtree import, target layout, root compose,
   gateway conf, dev proxy rules; everything boots via compose.
2. **Auth bridge** — Django `/api/auth/warmup-token/`, FastAPI JWT validation
   + auto-provision, integration test.
3. **Rebrand + landing** — tokens, wordmark, titles, landing restyle.
4. **Warmup section port** — Dashboard → Mailboxes → Onboarding → Peer →
   Reports → Alerts, page by page, each verified in the shell; then the
   role-gated Admin section (user management, impersonation, alerting
   admin) in the same unified shell.
5. **Ops + docs + full E2E** — compose hardening, DEPLOY/README merge,
   end-to-end pass, push.

## Non-goals (this merge)

- No rewrite of either backend's internals.
- No Tailwind in the merged frontend.
- No single-database consolidation (token-layer alignment only).
- No mobile app rework (it keeps native login).

## Risks

- Auth-bridge secret handling: stored server-side env only, never frontend.
- Two-backend drift long-term: accepted; consolidation is a possible later
  phase once the merged product is stable.
- Warmup page ports are the largest effort bucket; staged page-by-page to
  keep every phase shippable.
