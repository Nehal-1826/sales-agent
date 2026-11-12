# Shell & UX Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the owner's 11 shell/UX items on `merge/agent-foundation` — nav/signout/bottom-nav, signup intelligence, settings cleanups, Gmail-like mailbox wizard + connect-bug fix, ReactBits polish.

**Architecture:** Frontend-first changes on the billing-line shell (frontend/), two new Django endpoints (`/api/company/scrape`, `/api/mailboxes/test`), one root-cause investigation in the mailbox save/send path. Stream B (warmup dashboards) is out of scope — its own spec follows.

**Tech Stack:** React+Vite+TS strict (custom CSS tokens), Django+DRF (backend-agent), ReactBits, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-11-12-shell-ux-batch-design.md`

## Global Constraints

- Continue on branch `merge/agent-foundation`. No push/deploy — owner gates deployment.
- TypeScript strict; no Tailwind; no secrets in frontend; violet tokens only (`#7C5CFF`/`#6B49FF` family).
- No changes under `backend/` (warmup FastAPI) in this stream.
- Django API additions ship with tests; existing suites + E2E gate stay green.
- Windows Git Bash; quote paths; zombie-Vite check before starting dev servers.

---

### Task 1: Shell nav — alignment, kill bottom nav, sign out

**Files:** Modify `frontend/src/components/Sidebar.tsx`, `frontend/src/components/TopBar.tsx`, `frontend/src/styles.css` (nav + `MOBILE POLISH — bottom tab bar` block ~3614+), possibly `frontend/src/App.tsx` (scrim/bottom-nav wiring if any).

**Interfaces:** Produces a shell where: nav items are visually aligned (equal rail item sizing, labels on one baseline, no clipped tooltips at any width ≥360px); no bottom tab bar exists at ANY width; a Sign out control exists in the sidebar user area and/or TopBar profile menu, calling the existing `logout()` from `lib/` (which already clears both tokens — verify, don't duplicate).

- [ ] Step 1: Reproduce — dev server + Playwright screenshots at 1366×768, 768×1024, 375×812; capture current misalignment + bottom bar (save under `.superpowers/sdd/shell-before/`).
- [ ] Step 2: Fix alignment (CSS-only where possible; measure with Playwright `boundingBox()` equality assertions for nav items).
- [ ] Step 3: Delete bottom-nav CSS + toggles; make sidebar present (responsive/collapsible) at all widths.
- [ ] Step 4: Add Sign out (icon + label matching rail conventions; `aria-label="Sign out"`), wired to existing logout flow.
- [ ] Step 5: Build green (`cd frontend && npm run build`); screenshots after (`.superpowers/sdd/shell-after/`).
- [ ] Step 6: Commit: `shell: nav alignment, sidebar at all widths (bottom bar removed), sign out in rail`

### Task 2: Settings cleanups — remove WarmPulse self-integration block + WhatsApp ban banner

**Files:** Modify `frontend/src/pages/settings/MailboxesSection.tsx` (block from `WarmPulse (optional)` heading through `Check WarmPulse now` incl. state/fields), `frontend/src/pages/settings/WhatsAppSection.tsx` (Banner).

**Interfaces:** None consumed/produced. Backend columns/fields untouched.

- [ ] Step 1: Remove both blocks + dead state; grep for orphaned references (`wp_live`, warmup-key state, Banner import if now unused).
- [ ] Step 2: Build green; screenshot Settings → Mailboxes + WhatsApp.
- [ ] Step 3: Commit: `settings: drop WarmPulse self-integration block and WhatsApp ban banner (one product)`

### Task 3: Signup — live password rules, company name wiring, URL scrape

**Files:** Modify `frontend/src/pages/SignupPage.tsx` (+ small `lib/api.ts` method), `frontend/src/pages/settings/BusinessSection.tsx` (display), `backend-agent/core/` (new scrape endpoint: views + urls + tests).

**Interfaces:** Produces `POST /api/company/scrape` `{url}` → `{name, description}` (200; 422 unreachable/invalid; DRF-token auth) reusing `core/scraper.py`; signup persists company name into the workspace field BusinessSection reads; password checklist is live.

- [ ] Step 1: Django TDD — failing test for scrape endpoint (mock scraper fetch; assert name/description shape + auth 401 + bad-url 422).
- [ ] Step 2: Implement endpoint (`core/views.py` or new module; URL `company/scrape/` beside auth routes).
- [ ] Step 3: Trace where signup's company field currently drops (signup view → workspace/user model); wire persistence; Django test asserting workspace company after signup.
- [ ] Step 4: Frontend — live checklist component (rules: ≥8 chars, upper+lower, digit; per-rule pass/fail classes); "Fetch details" button next to website URL → fills company name (+description if a field exists); error state on 422.
- [ ] Step 5: Suites green (Django full + build); screenshot signup.
- [ ] Step 6: Commit: `signup: live password rules, company name persists, URL→company scrape endpoint`

### Task 4: Landing footer slim

**Files:** Modify `frontend/src/pages/LandingPage.tsx` (+ its CSS block in styles.css).

**Interfaces:** None.

- [ ] Step 1: Reduce footer to wordmark + one-liner, contact trio, legal links row; drop the rest.
- [ ] Step 2: Build + screenshot.
- [ ] Step 3: Commit: `landing: slim footer — wordmark, contact, legal only`

### Task 5: Mailbox wizard + test-connection + connect-bug root cause

**Files:** Modify `frontend/src/pages/settings/MailboxesSection.tsx`, `frontend/src/lib/api.ts`; Create/modify `backend-agent/core/mailbox_probe.py`, views/urls, `backend-agent/core/tests/test_mailbox_probe.py`.

**Interfaces:** Produces `POST /api/mailboxes/test` `{imap_host, imap_port, smtp_host, smtp_port, username, password}` → `{imap: {ok, detail}, smtp: {ok, detail}}` (never echoes the password; short socket timeouts ≤8s). Wizard presets: Gmail (imap.gmail.com:993 / smtp.gmail.com:587), Zoho (per-region like the old WarmPulse add-dialog — zoho.in/eu zones), Outlook (outlook.office365.com:993 / smtp.office365.com:587), Custom (blank). **Bug**: root-cause "saves, never works" — trace the save → status → send path (likely status unverified or creds unused at send); fix; document the root cause in the report.

- [ ] Step 1: Reproduce the bug — save a mailbox in the running app, trace backend logs + DB status fields; write down the exact break (report).
- [ ] Step 2: Django TDD — failing tests for probe endpoint (mocked IMAP/SMTP) + whatever the root-cause fix needs.
- [ ] Step 3: Implement probe (`mailbox_probe.py`: IMAP login via imaplib/aioimaplib, SMTP EHLO/NOOP; TLS first, plain fallback flagged).
- [ ] Step 4: Fix the connect bug per Step 1 findings.
- [ ] Step 5: Frontend wizard — provider picker → presets → app password → Test Connection button (spinner, per-leg results) → save keeps connected state; dailyCap stays.
- [ ] Step 6: Django suite + build green; E2E-able screenshot of wizard + test result.
- [ ] Step 7: Commit: `mailboxes: provider wizard + real test-connection endpoint; fix connect-never-works`

### Task 6: ReactBits polish + E2E gate extensions

**Files:** Modify `frontend/package.json`, dropdowns (TopBar profile, any Select), loaders (page/route loader + mailbox test spinner can adopt), landing/auth backgrounds; extend `scripts/e2e/flow.py`.

**Interfaces:** E2E additions: signout reachable; bottom-nav absent at 375px; password rules toggle live; WarmPulse-block strings absent from Settings DOM; footer link count assertion.

- [ ] Step 1: Add dependency per ReactBits install docs (component imports as directed; note license in report).
- [ ] Step 2: Apply to: profile/settings dropdowns, route/page loaders, subtle landing/auth background — tokens only, reduced-motion respected, no layout shift.
- [ ] Step 3: Extend flow.py with the assertions above (adapt selectors from Tasks 1-5 code).
- [ ] Step 4: Full gate: Django suite, build, `python scripts/e2e/flow.py` (servers up; zombie-Vite check first).
- [ ] Step 5: Commit: `polish: ReactBits dropdowns/loaders/backgrounds; E2E covers shell batch`

---

## Follow-up (not this plan)

Stream B spec — WarmPulse real dashboards in the Warmup section (owner approved "real dashboards now"): port client dashboards (warmup scores, mailbox states, peer stats, alerts) from `frontend-warmpulse/src/pages/client/` on `warmupApi`; warmup DB needs Postgres in dev (docker) or documented interim.
