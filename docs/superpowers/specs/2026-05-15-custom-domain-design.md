# Custom Domain — Design

**Date:** 2026-05-15
**Sub-project:** 7 of 8 (Agency tier — 2/3)
**Status:** Approved (verbal)
**Effort:** ~1.5-2 hours via 2 parallel subagents

## Why

Agency-tier sub-clients should access WarmPulse via the agency's own URL (e.g. `clients.acmeoutreach.com`), not `app.warmpulse.io`. Combined with sub-6's white-label branding, end-clients have zero visible cue that WarmPulse exists under the hood. This is the second leg of the Agency moat.

## Scope: dead-simple MVP

What we build in code:
- Domain registry table per workspace
- DNS verification (TXT or CNAME)
- Activation gate
- UI tab

What we explicitly DON'T build:
- TLS / SSL provisioning (production reverse proxy handles it — Caddy or nginx + Let's Encrypt)
- Host-based workspace resolution middleware (JWT works identically on any host)
- Custom email-sending domain (separate concern — DKIM infrastructure)
- Per-sub-client domains
- Wildcard subdomains

## Production setup story (documentation, no code)

Production reverse proxy (Caddy or nginx + acme.sh) handles arbitrary hostnames + auto-TLS:

```
*.acmeoutreach.com, *.clientportal.io {
  reverse_proxy /api/* localhost:8001
  reverse_proxy / localhost:5173
  tls { on_demand }
}
```

A `docs/PROD_CUSTOM_DOMAIN.md` doc covers this for deployers.

## Verification flow

1. Agency clicks "Add custom domain" → enters `clients.acmeoutreach.com`
2. Backend creates `workspace_custom_domains` row with status `pending` + 16-char `verification_code`
3. UI shows two options:
   - **TXT (recommended)**: `_warmpulse-verify.clients.acmeoutreach.com TXT "warmpulse-verify-{code}"`
   - **CNAME (alternative)**: `clients.acmeoutreach.com CNAME app.warmpulse.io`
4. User clicks "Verify" → backend DNS lookup (tries TXT first, falls back to CNAME)
5. On success: status=`verified`, `verified_at=now()`
6. UI flips to "Active" state

## Architecture

### New backend
- `db/models/workspace_custom_domains.py` — `WorkspaceCustomDomain`:
  - `id uuid_pk`, `workspace_id FK + unique`, `domain string(253)` (DNS max length), `verification_code string(32)`, `verification_method string` (`txt`|`cname`|null), `verified_at timestamp nullable`, `status string` (`pending`|`verified`|`failed`), `last_check_at`, `created_at`
  - Unique constraint on `domain` (one domain ↔ one workspace globally)
- `services/custom_domain_service.py` — async functions:
  - `async start(session, workspace_id, domain) -> WorkspaceCustomDomain` — Agency-only, validates domain format, generates code, persists or updates row, returns it. Raises `CustomDomainNotAllowedError` for non-Agency tiers. Raises `DomainAlreadyTakenError` for unique-constraint violations (409 from route).
  - `async verify(session, workspace_id) -> dict` — runs DNS lookup. Tries TXT at `_warmpulse-verify.{domain}` first; if matches `warmpulse-verify-{code}` → success. Else tries CNAME at `{domain}` → if resolves to `app.warmpulse.io` → success. On success: status=`verified`, sets `verified_at`. On failure: status=`failed`, returns reason. Uses `dnspython` (already imported by `dns_validator.py`); 5s timeout per lookup.
  - `async get_status(session, workspace_id) -> dict | None`
  - `async remove(session, workspace_id) -> None`
- `api/routes/workspace_custom_domain.py` — four routes (all require `get_current_user`):
  - `GET /api/workspace/custom-domain` → current status + verification instructions if `status=pending`. Returns 404 if no row.
  - `POST /api/workspace/custom-domain` body `{domain}` → starts verification. Returns 402 for non-Agency. Returns 409 if domain taken. Returns 400 for invalid domain format.
  - `POST /api/workspace/custom-domain/verify` → re-runs DNS check on current row.
  - `DELETE /api/workspace/custom-domain` → removes row.
- `alembic/versions/0020_custom_domain.py` — `down_revision = '0019_white_label_branding'`. Creates table with unique indexes on `workspace_id` and `domain`.
- `tests/test_custom_domain.py` — at least 5 tests:
  - `test_start_requires_agency_tier_returns_402`
  - `test_start_rejects_invalid_domain_format` (e.g. `not a domain`, `localhost`, `*.acme.com`)
  - `test_start_rejects_duplicate_domain_with_409`
  - `test_verify_succeeds_with_valid_txt_record` (mock dnspython)
  - `test_verify_fails_with_clear_reason_when_no_record` (mock dnspython to return NoAnswer)

### Modified backend
- `db/models/__init__.py` — register `WorkspaceCustomDomain`
- `main.py` — mount `workspace_custom_domain.router`

### New frontend
- `features/custom-domain/api.ts` — hooks:
  - `useCustomDomain()` — query `GET /custom-domain`. Returns `null` on 404. Refetches every 30s while `status === 'pending'` to catch DNS propagation.
  - `useStartCustomDomain()` — mutation POST. Throws on 402 (upgrade hint) / 409 (duplicate) / 400 (invalid format).
  - `useVerifyCustomDomain()` — mutation POST `/verify`. Invalidates `useCustomDomain`.
  - `useRemoveCustomDomain()` — mutation DELETE.
- `pages/client/workspace/CustomDomainTab.tsx` — Agency-only tab:
  - **No domain**: input field + "Add domain" button. Helper text: "Use your own domain for client-facing portals (e.g. `clients.youragency.com`). Requires Agency tier."
  - **Pending**: header "Verification needed", two side-by-side cards (TXT instructions + CNAME instructions) each with copy-to-clipboard button, status pill, "Verify now" + "Cancel" buttons, helper "Most DNS changes propagate in 5-30 min".
  - **Verified**: green "Active" badge, clickable URL link `https://{domain}`, "Visit your portal" button, "Remove domain" button (with confirm dialog).
  - **Failed**: red "Verification failed" badge + specific reason ("We checked `_warmpulse-verify.{domain}` but found no matching record") + Retry button + Cancel button.

### Modified frontend
- `pages/client/WorkspacePage.tsx` — add "Custom domain" tab to the Agency tab strip (only render when `usePlan().isAgency`).

## Domain validation rules

- Lowercase
- Regex: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$` (DNS labels)
- Max 253 chars total
- Min 1 dot (no bare TLDs)
- Max 5 dots (rough sanity check)
- Reserved (rejected): `warmpulse.io`, `*.warmpulse.io`, `localhost`, anything ending `.local`, IP addresses (regex check), `*.test`, `*.example`

## Tier gating

- Agency / Enterprise: tab visible + functional
- Pro Plus and below: tab hidden; direct API returns 402

## Out of scope (deferred)

- TLS cert provisioning in code
- Host-based workspace resolution middleware
- Custom email-sending domain (DKIM concern)
- Per-sub-client domains
- Wildcard certs / domains
- Multi-region routing
- "WarmPulse-managed subdomain" option (e.g. `{agency-slug}.warmpulse-clients.io`)

## Verification

- `cd backend && pytest tests/test_custom_domain.py -x` — green
- `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no new errors
- Manual: as Agency user → Workspace → Custom domain → add `clients.test.com` → see TXT/CNAME instructions → simulate via mocked DNS → see Active state
- Manual: as Pro user → tab not visible

## File touch list

**Sub-A (backend):**
- Add: 1 model · 1 service · 1 route · 1 migration · 1 test file
- Modify: `db/models/__init__.py` · `main.py`

**Sub-B (frontend):**
- Add: 1 features module · 1 tab page
- Modify: `WorkspacePage.tsx`
