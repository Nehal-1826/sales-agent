# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WarmPulse is a multi-tenant email-warmup SaaS. Clients connect their outbound mailboxes (Gmail OAuth / Outlook / Yahoo / generic SMTP); a system-owned **peer-inbox network** sends, opens, replies, stars, and spam-rescues warmup mail to/from those mailboxes to build sender reputation with Gmail / Outlook / Yahoo.

The peer network is the moat — anywhere code or comments treat peer inboxes as mockable, optional, or replaceable with templates, that's wrong. The architecture spec at `warmpulse-architecture.html` (root) and `docs/superpowers/specs/2026-04-23-warmpulse-platform-architecture-design.md` is the authoritative contract.

## Common commands

The Makefile is the primary entry point on macOS / Linux / WSL. On native Windows run the same commands manually (the Makefile uses `find … -prune` for `clean`, which won't work in cmd / PowerShell).

```bash
make install       # pip install -e ".[dev]"  +  pnpm install
make db-up         # postgres + redis only (5 services later via docker compose)
make migrate       # alembic upgrade head
make backend       # uvicorn :8001 (reload)
make frontend      # vite :5173
make worker        # celery -Q default,smtp
make beat          # celery beat
make test          # backend pytest
make lint          # ruff + pnpm lint
make format        # ruff format + prettier
```

`make dev` prints the 7-terminal workflow. Dev intentionally has no orchestration so the topology matches systemd in prod.

**Single test:** `cd backend && pytest tests/test_peer_inboxes.py::test_create_peer_writes_default_pool_membership -x`. `pytest-asyncio` is in `auto` mode (`pyproject.toml`), so `@pytest.mark.asyncio` is unnecessary — just use `async def test_…`.

**Frontend type-check:** `cd frontend && pnpm typecheck`. Build: `pnpm build` (runs `tsc -b` first, so a build failure surfaces type errors).

**New migration:** `make migrate-create MSG="add foo column"` runs `alembic revision --autogenerate`. Always inspect the generated file — autogenerate misses index changes and check constraints.

## Production deploy

Single Hostinger VPS, 6 docker-compose services on the host network: `postgres` (5433), `redis` (6380), `api` (:8001), `worker`, `beat`, `frontend` (nginx serving the Vite build). `network_mode: host` for app containers means `localhost` reaches Postgres/Redis directly; do NOT introduce a docker bridge unless you also rewrite every connection string.

Deploy: `git pull && docker compose exec api alembic upgrade head && docker compose up -d --build api worker beat frontend && docker compose logs -f api`. Required env vars in `backend/.env.docker`:

- `DATABASE_URL`, `REDIS_URL`, `REDIS_KEY_PREFIX=warmpulse:` (Redis is shared; key-prefix isolation matters)
- `FERNET_KEY` (`Fernet.generate_key()`) — credential-at-rest. Comma-separate to rotate (`MultiFernet`).
- `JWT_SECRET` (`secrets.token_urlsafe(64)`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for the mailbox-connect OAuth flow
- LLM provider key (one of): `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`. Provider priority: Gemini → Claude → static templates (see `services/warmup/content_factory.py`; `services/llm/` holds `gemini_provider` and `claude_provider`).
- Transactional mail (`services/transactional_mail.py`) uses its own platform SMTP via `TRANSACTIONAL_SMTP_*` env vars — separate from per-mailbox warmup SMTP. When `TRANSACTIONAL_SMTP_HOST` is empty the service runs in **dry-run mode** (logs at INFO, returns success); this is intentional so signup / alert flows don't break on a fresh install.

## Architecture: how the warmup engine actually runs

Seven Celery Beat jobs drive the entire engine (`backend/app/celerybeat_schedule.py`):

1. **`warmup-outbound-every-15min`** → `tasks/warmup_send.schedule_warmup_cycle`. Fans out one `send_single_warmup_email` per active, in-window, under-quota mailbox onto the `smtp` queue. Per-send: `pairing.pick_peer_inbox` picks a peer (workspace's pool → default pool → reputation-weighted random, 24h dedup), `services/warmup/content_factory` produces a thread message, `smtp_sender.send_email` delivers it, a `WarmupLog(direction=outbound, action=sent)` row is written.
2. **`warmup-inbound-every-3min`** → `tasks/warmup_receive.schedule_inbound_cycle` mirrors the outbound flow with sender/recipient swapped (peer → user mailbox). Cadence is intentionally tighter than outbound — engagement signal needs to land quickly. Real IMAP polling for engagement actions (open / reply / star / spam-rescue) lives in `services/warmup/imap_watcher.py` and `tasks/peer_actions.py`.
3. **`peer-rotation-hourly`** → `tasks/peer_actions.hourly_peer_health_check`. Recomputes `peer_inboxes.reputation_score` from the last 24h of inbound signal-vs-bounce ratio; deactivates peers below `PEER_REPUTATION_MIN = 0.3` with an audit row. **Day-0 peers are exempt** — they're skipped until they've had a chance to receive signal (see `f097760`).
4. **`ramp-advance-daily`** (00:00 UTC) advances `mailboxes.current_day` so `services/warmup/ramp.ramp_target` returns the next ladder step. Ladder: D1–3=5, D4–7=10, D8–14=20, D15–21=35, D22–28=50, D29+=`mailbox.daily_target`.
5. **`daily-rollup`** (00:05 UTC) writes one `daily_metrics(mailbox_id, date)` row from the previous day's `warmup_logs`. Unique `(mailbox_id, date)` constraint — upsert, not insert.
6. **`alert-check-hourly`** (`:10` every hour) → `tasks/alert_check.scan_and_dispatch`. Scans for stalled mailboxes / failing peers / quota issues and fires transactional-mail notifications via `services/notifications_dispatch`.
7. **`beat-heartbeat-1min`** → `tasks/beat_heartbeat.tick`. Writes a heartbeat row consumed by `routes/admin_system_health.py` so the admin System Health page can show "beat alive N seconds ago" rather than guessing from job timings.

Two Celery queues: `default` (beat fan-out + LLM content generation) and `smtp` (per-send SMTP/IMAP I/O). A single worker consumes both.

## Architecture: backend code layout

```
backend/app/
  main.py                  FastAPI app factory; mounts every router in api/routes
  config.py                Pydantic Settings; reads .env / .env.docker
  celery_app.py            Celery app, beat schedule wired here
  api/
    deps.py                get_current_user / get_current_claims / require_super_admin
    routes/                Thin handlers — DB access lives in services/
  db/
    base.py                Declarative Base, uuid_pk(), created_at_col()
    session.py             AsyncSession factory
    models/                One file per table. *_encrypted columns are BYTEA Fernet tokens.
  schemas/                 Pydantic v2 wire schemas. Update bodies use ConfigDict(extra="forbid").
  services/                Business logic. Routes call services; services call models.
    warmup/                Engine internals (pairing, ramp, timing, smtp_sender, imap_watcher).
    llm/                   Provider abstraction + Gemini/Claude impls + usage_tracker.
    crypto.py              FernetService for credential at-rest encryption (MultiFernet rotation).
  tasks/                   Celery tasks. Async-in-sync pattern: each task body does asyncio.run(_impl()).
  alembic/versions/        Migrations. Autogenerate is fine for tables; index/check constraints need manual edits.
```

**Strict layering**: routes are thin (≤40 lines per handler — see `payments.py` for the bar). All DB access, credential encryption, and audit writes live in `services/*`. A handler that touches `session.add` or `select(...)` directly is a smell.

**Audit invariants**: every super_admin or destructive action writes an `audit_logs` row via the per-service `_write_audit` helper. Audits use a SAVEPOINT (`session.begin_nested()`) so an audit failure can't poison the surrounding transaction.

**Credential handling** (security-critical): SMTP passwords / OAuth refresh tokens / IMAP creds are encrypted with `services/crypto.FernetService` before they reach the database. The plaintext lives only as a local variable for the duration of the create / send / probe; we explicitly re-bind to `"REDACTED"` and `del` afterward. The pattern is in `services/warmup/smtp_sender.send_email` — copy it.

**Service modules worth knowing about**:
- `payments_service.py` — card + UPI dummy gateway (no real PSP yet); records `succeeded` Payment rows and transitions user to `plan_selected`. Treats PAN/CVC as sensitive even though gateway is a stub.
- `reports_service.py` — scheduled reports CRUD + on-demand CSV/PDF export. PDF requires the optional `reportlab` dep; missing dep returns **501 with a hint** rather than silently shipping a fake `.pdf`.
- `transactional_mail.py` + `mail_templates.py` — branded HTML shell shared by welcome / mailbox / 2FA / billing emails. All per-template functions feed headline / intro / detail rows / CTA — never raw HTML.
- `notifications_dispatch.py` / `notification_inbox_service.py` — in-app notification inbox + outbound transactional dispatch fanout.
- `peer_pool_service.py` — workspace-pool routing (admin can pin a workspace to a specific peer pool; falls back to default pool).
- `dns_validator.py` (used by `routes/dns.py`) — SPF / DKIM / DMARC lookups surfaced in the client Tools page.
- `audit_query_service.py` — admin audit-log filtering and pagination (consumed by `/admin/audit`).
- TOTP-based 2FA lives in `services/security.py` + `auth_service.py`; recovery codes are issued at enrolment and downloadable once.

## Architecture: frontend code layout

```
frontend/src/
  main.tsx                 BrowserRouter + QueryClient + ThemeProvider + LenisProvider
  App.tsx                  Route table — public / onboarding / /app/* / /admin/*
  pages/                   Route components only. Compose features.
  features/<domain>/       Per-domain hooks (api.ts), types (types.ts), shared components.
  components/ui/           Radix-based primitives (Button, Card, AppDialog, AppDropdown, AppToast).
  lib/api.ts               axios instance with bearer-injection + 401-refresh interceptor.
  stores/                  Zustand stores (auth, theme).
```

**State conventions**: every server-state read goes through TanStack Query. Hand-rolled `useState` + `useEffect(fetch)` is a smell. Mutations use `useMutation` with `onSuccess: qc.invalidateQueries(...)`. Forms use `react-hook-form` + `zod`.

**Styling tokens** (Tailwind, in `tailwind.config.ts`): `bg-bg`, `bg-surface`, `bg-surface-2`, `text-text`, `text-text-dim`, `border-border-muted`, `text-accent`, `text-accent3` (warning), `text-accent4` (mid). Don't introduce new colors — reach for an existing token first.

## Database conventions

- **UUIDs everywhere** for primary keys (`db/base.uuid_pk()`). Pattern: `id: Mapped[uuid.UUID] = uuid_pk()`.
- **created_at / updated_at** via `created_at_col()` / `updated_at_col()` helpers — they emit `DateTime(timezone=True)` with `func.now()` server defaults.
- **Per-workspace isolation**: every workspace-owned row carries `workspace_id`; every query joins / filters on `user.workspace_id` from the JWT. Cross-workspace reads are a security bug.
- **Indexes worth knowing about** (spec §8.3, baked into 0001_initial): `warmup_logs(mailbox_id, created_at DESC)` for activity feeds; partial `peer_inboxes(is_active=true)` for peer pool queries; unique `(mailbox_id, date)` on `daily_metrics`.

## Auth model

JWT bearer in `Authorization: Bearer <access_token>`. `api/deps.py` provides:

- `get_current_claims` — decode + verify JWT, returns claims dict.
- `get_current_user` — claims → DB row. Use this on every authenticated route.
- `require_super_admin` — extra role check; admin routes mount it via `dependencies=[Depends(require_super_admin)]`.

Refresh tokens are separate (`type=refresh`); the frontend's axios interceptor handles 401 → POST `/auth/refresh` → retry transparently.

Three OAuth flows live side by side: classic Google login (`/api/auth/google/{login,callback}`), the mailbox-connect popup (`/api/auth/google/{oauth-start,mailbox-callback}`) which yields an offline refresh token postMessaged back to the opener, and `/api/auth/firebase` which verifies a Firebase-issued ID token against Google's public X.509 certs (no Firebase Admin SDK). The Firebase verifier self-heals a stale cert cache on 401 before failing the request.

**TOTP**: users can enrol a TOTP authenticator in Settings; on login a modal challenges the code (matcher in the frontend `LoginPage` expects the backend's exact body shape — see `5368452`). Recovery codes are presented + downloadable once at enrolment.

## Tests

In-memory SQLite via `aiosqlite` per test for fast unit tests; integration tests that need Postgres-only features (enum types, partial indexes, ON CONFLICT) belong behind `@pytest.mark.integration` and currently skip in CI. `tests/conftest.py` seeds env vars (`FERNET_KEY`, `JWT_SECRET`, `DATABASE_URL`) before any module imports `config`, so the settings cache picks up test-safe values.

Several test files maintain their own per-file fixture (`app_and_maker` in `test_peer_inboxes.py`, `test_mailboxes.py`, `test_analytics.py`) instead of using the shared `conftest.db_session` — they enumerate the exact tables they need to dodge SQLite's intolerance for some Postgres-flavoured index definitions. When adding a new model, check whether any of those fixtures need it added to their `tables = [...]` list before tests pass.

## Editing the architecture spec

`warmpulse-architecture.html` at the repo root is a single self-contained HTML file with inline `<style>` and `<script>`. Tabs are driven by `data-tab` attributes on `.tab-btn` and matching section `id`s. When adding a new section, update both the tab button list and add a `<div class="section" id="...">` block, then verify the tab-switching script at the bottom still finds it.
