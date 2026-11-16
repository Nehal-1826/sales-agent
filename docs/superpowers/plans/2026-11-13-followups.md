# Stream C — Follow-up Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land all 20 follow-up items (security, bugs, infra, CI, warmup product depth, mailbox unification) from the owner's pending list.

**Architecture:** Six mechanical/backend tasks first (C2, C5, C4, C3, C1), then five feature ports (C6-C9) and the unification (C10). Spec: `docs/superpowers/specs/2026-11-13-followups-design.md`.

**Tech Stack:** as before. Global Constraints: same as Stream A/B (branch, no push, servers up, strict TS, tokens, Git Bash quirks, frontend-warmpulse read-only).

---

### Task 1 (C2): Security trio — backend/
**Files:** Modify `ops/gateway/nginx.conf` (drop docs/redoc/openapi location), `backend/app/api/deps.py` (iss-less suspension 403 in get_current_user_or_api_key), email normalization at provisioning + native login compare. **Test:** extend `backend/tests/test_bridge_auth.py` + auth tests.
Steps: [fail-test suspension-asymmetry → fix deps → fail-test mixed-case email (provision `Bob@X` then bridge `bob@x` = one user) → normalize (lower() at provision; native login compare via func.lower or store-lower) → remove gateway docs block → run bridge/auth/api_key/config modules green → commit `warmup: iss-less suspension parity + email-case normalization; gateway drops dead /docs proxy`]

### Task 2 (C5): Backend small bugs
**Files:** Modify `backend/app/schemas/mailboxes.py` (add self_hosted to response enum; trace DB enum values), `backend/scripts/dev_bootstrap.py` (hard-refuse non-sqlite DATABASE_URL). **Test:** extend `test_dev_bootstrap.py` + a mailbox serialization test.
Steps: [fail-test self_hosted serializes → add enum value + serializer test → fail-test bootstrap refuses postgres URL → implement guard → modules green → commit `warmup: MailboxOut self_hosted + bootstrap refuses non-sqlite URLs`]

### Task 3 (C4): Frontend polish
**Files:** Modify `frontend/vite.config.ts` (manualChunks: apexcharts+react-apexcharts separate chunk), `frontend/src/styles.css` (purge stale `var(--accent, #6b49ff)` fallbacks — token always defined), compare-page internal links (add to `frontend/src/marketing/MarketingLayout.tsx` nav or footer — pick footer, keeps nav clean), `frontend/src/pages/WarmupPage.tsx` (refresh busy label: track manual-refresh in-flight state).
Steps: [chunk split → build green + chunk sizes reported → fallback purge (grep zero #6b49ff literals in styles.css) → compare links (footer "Compare" column: 2-3 links to prerendered compare routes — read ROUTES names) → busy label real state → build + screenshot footer → commit `frontend: apexcharts chunk split, token-fallback purge, compare footer links, refresh busy state`]

### Task 4 (C3): Infra — HTTPS, health gates, make targets, single secret
**Files:** Create `ops/compose/docker-compose.https.yml` overlay (or root file — follow repo convention), Modify `docker-compose.yml` (depends_on condition: service_completed/healthy where the images support it — db/redis healthchecks exist; nginx gateway: X-Forwarded-Proto $scheme), `backend-agent/agentic/settings.py` (CSRF_TRUSTED_ORIGINS from env, comma-split), `Makefile` (db-down scoped; stack-down = full), `.env.example` (single WARMUP_JWT_SECRET story).
Steps: [compose edits → YAML parse check → settings env + Django test for CSRF origins parsing → Makefile targets → .env.example rewrite of secret section → commit `ops: HTTPS overlay + X-Forwarded-Proto + CSRF_TRUSTED_ORIGINS; health-gated depends_on; scoped make targets; single JWT secret`]

### Task 5 (C1): FastAPI CI workflow
**Files:** Create `.github/workflows/ci-warmup.yml`.
Steps: [workflow: on push/PR paths backend/** — python 3.12, pip install -e ".[dev]", sqlite env, run the network-independent modules (bridge_auth auth api_key_auth config_security dev_bootstrap + any others that pass without network — verify locally first, list what's excluded and why in the workflow comments) → YAML parse → commit `ci: FastAPI network-independent test job for backend/`]

### Task 6 (C6): Warmup mailbox management UI
**Files:** Modify `frontend/src/pages/warmup/MailboxRows.tsx` (+ new `MailboxActions.tsx`, `EnrollMailbox.tsx`), `frontend/src/lib/warmupApi.ts` (+types), `frontend/src/pages/WarmupPage.tsx`.
Steps: [trace mailboxes.py write routes (pause/resume/create/patch) → warmupApi methods + types → row actions (pause/resume with optimistic state + error revert) → "Add mailbox to warmup" picker listing the agent's verified sending mailboxes (fetch via existing agent endpoints; enroll via warmup create route) → per-mailbox detail drawer (ramp, today counters, schedule window) → E2E-able screenshots → build → commit `warmup: mailbox management — pause/resume, enroll-from-agent, detail drawer`]

### Task 7 (C7): DNS onboarding wizard port
**Files:** Create `frontend/src/pages/warmup/DnsWizard.tsx` (+ section in Settings Mailboxes or Warmup page — implementer picks per UX fit, document choice), warmupApi dns methods (`dns.py` routes).
Steps: [trace dns.py routes/schemas → types+methods → wizard UI (domain input → SPF/DKIM/DMARC status cards + recheck, shell styles) → wire into chosen entry point → build + screenshot → commit `warmup: DNS onboarding wizard (SPF/DKIM/DMARC checks) ported`]

### Task 8 (C8): Reports/PDF
**Files:** Create `frontend/src/pages/warmup/Reports.tsx`, `frontend/src/lib/warmupReport.ts` (pdf build), `frontend/package.json` (jspdf — same major as frontend-warmpulse uses).
Steps: [trace report routes → data methods → summary cards + per-mailbox table → PDF export (jspdf, token-styled headers, logo asset) → entry point (Warmup section sub-tab or button — pick, document) → build + generated-PDF smoke (headless download) → commit `warmup: reports + PDF export ported`]

### Task 9 (C9): Reputation page port
**Files:** Create `frontend/src/pages/warmup/Reputation.tsx` (+ chart components reuse from dashboard), warmupApi methods (reputation/analytics routes).
Steps: [trace routes → methods+types → placement trends (line), spam-rate gauge, provider breakdown (bar/donut) → sub-tab in Warmup section → build + screenshot → commit `warmup: reputation view ported — placement trends, spam rate, providers`]

### Task 10 (C10): Mailbox unification — auto-enroll into warmup
**Files:** Modify `backend-agent/core/outbox.py` or mailbox-save view (hook point: verified save), Create `backend-agent/core/warmup_enroll.py` (internal bridge JWT mint via warmup_bridge.mint_warmup_token + POST to FastAPI create route, short timeout, service-to-service), mailbox model flag `warmup_enrolled` + `warmup_enroll_error` (+ migration), serializer fields, MailboxesSection UI (flag toggle + retry + status chip), **Test:** `backend-agent/core/tests/test_warmup_enroll.py` (mocked HTTP).
Steps: [TDD: enroll called on verified save; idempotent; failure → error field + save succeeds; toggle off respected → implement warmup_enroll.py (httpx? check Django deps — requests is present per scraper; use requests, timeout 5s) → migration + serializer + UI chip/toggle/retry → modules green + build → commit `agent→warmup: verified sending mailboxes auto-enroll into warmup (flagged, idempotent, non-blocking)`]

### Task 11: Final gate + stream close
**Files:** Extend `scripts/e2e/flow.py` (C6 actions smoke where feasible offline-safe, C7/C8/C9 render checks), README touch-ups.
Steps: [Django suite / FastAPI modules / build / E2E all green → ledger close → commit `e2e: Stream C coverage — follow-ups complete`]
