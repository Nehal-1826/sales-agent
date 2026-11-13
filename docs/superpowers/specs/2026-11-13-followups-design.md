# Stream C — Follow-up Completion Design

Date: 2026-11-13
Status: owner approved ("go for 2 complete all" — every item from the pending list's follow-up buckets)
Base: `merge/agent-foundation` (current tip after TOTP QR work)

## Scope — all 20 items, grouped into 10 tasks

**C2 Security trio (backend/):** remove gateway `/docs|/redoc|/openapi.json` proxy block (docs already off in prod — dead pass-through); fix iss-less JWT suspension asymmetry in `get_current_user_or_api_key` (mirror the suspension 403); email-case normalization (lowercase emails at bridge provisioning + native login compare, no duplicate rows).

**C5 Backend small bugs:** add `self_hosted` to the `MailboxOut` response enum (+ test); dev bootstrap hard-refuses non-sqlite DATABASE_URL (+ test).

**C4 Frontend polish:** `manualChunks` split so apexcharts stops blowing the chunk warning; purge stale violet `var(--accent, #6b49ff)` fallbacks (styles.css:3649,3670 area); restore internal links to the compare pages (nav or footer, SEO); fix Warmup refresh-button dead busy label.

**C3 Infra/deploy:** HTTPS compose variant + gateway `X-Forwarded-Proto` + Django `CSRF_TRUSTED_ORIGINS` env; compose `depends_on` health-gated conditions; `make db-down` scoped to db/redis only (new target `stack-down` for everything); kill the dual JWT secret docs — compose interpolates `WARMUP_JWT_SECRET` for FastAPI's `JWT_SECRET`, `.env.example` documents exactly one key.

**C1 CI:** GitHub Actions workflow for `backend/` (FastAPI): the network-independent test modules (bridge_auth, auth, api_key_auth, config_security, dev_bootstrap) on push/PR paths `backend/**`; document the still-network-gated remainder as the CI wishlist.

**C6 Warmup mailbox management (Warmup section):** list view already exists (dashboard rows) → add actions: pause/resume a mailbox's warmup, add-a-mailbox-to-warmup (from the agent's verified sending mailboxes — picker), per-mailbox detail (ramp, sent/opens today). Via `warmupApi` POST/PATCH routes that already exist warmup-side (trace `mailboxes.py` write routes; mobile uses them).

**C7 DNS onboarding wizard port:** port WarmPulse DNS onboarding (SPF/DKIM/DMARC checks, per-domain status) into Settings → Mailboxes area (the `checkdmarc`-backed `dns.py` routes exist warmup-side); restyled to shell conventions.

**C8 Reports/PDF:** warmup reports page port — summary + per-mailbox warmup report, PDF export via jspdf (dependency already used by the old frontend; add to frontend/), driven by `warmupApi`.

**C9 Reputation page port:** WarmPulse reputation view (placement trends, spam-rate, provider breakdown) into the Warmup section (tab or sub-view) from `reputation.py`/analytics routes.

**C10 Mailbox unification:** verified agent sending-mailboxes auto-enroll into warmup. Django side: after a mailbox passes Test Connection + save (A5 flow), Django server-side mints an internal bridge JWT and POSTs it to FastAPI's mailbox-create route (same shared secret; service-to-service, user-scoped claim). Per-mailbox `warmup_enrolled` flag (default on) shown in Settings; idempotent; failure never blocks the save (visible retry state instead).

## Constraints

Same as Stream A/B. Read-only reference: `frontend-warmpulse/`. Servers stay up. No push/deploy. Windows Git Bash quirks.

## Verification

Per-task TDD where backend; build + E2E extensions per UI task; full gate (Django suite / FastAPI modules / build / E2E) after C10.
