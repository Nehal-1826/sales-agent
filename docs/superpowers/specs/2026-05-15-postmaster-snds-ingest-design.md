# Postmaster + SNDS Ingest — Design

**Date:** 2026-05-15
**Sub-project:** 2 of 8 (Pro Plus tier)
**Status:** Approved (verbal)
**Effort:** ~2 weeks serial / ~4 h via 2 parallel subagents

## Why

Currently WarmPulse only *infers* deliverability from peer signals. Google Postmaster Tools and Microsoft SNDS expose the *real* spam-rate, complaint-rate, and IP-reputation data the providers themselves track per domain. Closing this gap is the headline Pro Plus feature — competitors don't bundle this.

## Scope

Two ingestion sources, one storage model, one new section in the Reputation page.

### Sources

| Provider | Mechanism | Auth |
|---|---|---|
| Google Postmaster | Daily REST pull from `gmailpostmastertools.googleapis.com/v1/domains/{domain}/trafficStats/{YYYYMMDD}` | OAuth scope `postmaster.readonly`; refresh token stored Fernet-encrypted |
| Microsoft SNDS | Daily CSV download from `postmaster.live.com/snds/data.aspx?key=<userkey>` | User pastes access key (no OAuth — Microsoft doesn't offer it); key stored Fernet-encrypted |

### Tier gating

Both connect flows are Pro Plus-only. Free / Starter / Pro users see the section with "Upgrade to Pro Plus" CTAs. Implement via new `isProPlus` boolean from `usePlan()`.

## Architecture

### New backend files

- `services/postmaster_client.py` — async httpx client, OAuth refresh handling, traffic-stats fetch
- `services/snds_client.py` — CSV download + parse, defensive against column changes
- `db/models/domain_credentials.py` — one row per (workspace, domain, provider): refresh_token / access_key (Fernet), last_pulled_at, last_status, is_active
- `db/models/domain_reputation_snapshots.py` — daily rows per (domain, date, provider): spam_rate, complaint_rate, ip_reputation, domain_reputation, auth_pass_pct, raw JSONB
- `tasks/postmaster_ingest.py` — Celery task, daily 03:00 UTC, iterates active Postmaster creds, pulls + writes snapshots
- `tasks/snds_ingest.py` — Celery task, daily 03:30 UTC, same pattern for SNDS
- `api/routes/workspace_postmaster.py` — `GET /workspace/postmaster/domains`, `GET /workspace/postmaster/oauth-start`, `GET /workspace/postmaster/oauth-callback`, `DELETE /workspace/postmaster/domains/{id}`
- `api/routes/workspace_snds.py` — `GET /workspace/snds/domains`, `POST /workspace/snds/domains` (body: domain + access_key), `DELETE /workspace/snds/domains/{id}`
- `alembic/versions/0017_domain_reputation.py` — creates `domain_credentials` + `domain_reputation_snapshots`
- Tests: `tests/test_postmaster_ingest.py`, `tests/test_snds_ingest.py`

### Modified backend

- `services/notifications_dispatch.py` — add event constants `spam_rate_spike` + `complaint_rate_spike`
- `db/models/__init__.py` — register new models
- `main.py` — mount the two new routers
- celery beat schedule — add `postmaster-ingest-daily` + `snds-ingest-daily`

### Frontend

- `pages/client/reputation/PostmasterCard.tsx` (new) — shows last pull, current spam rate, 30-day sparkline, connect/disconnect CTA
- `pages/client/reputation/SndsCard.tsx` (new) — same shape for SNDS metrics
- `pages/client/reputation/ConnectPostmasterDialog.tsx` (new) — domain input + "Connect Google" button that opens OAuth popup
- `pages/client/reputation/ConnectSndsDialog.tsx` (new) — domain input + access-key paste field
- `pages/client/reputation/ProReputation.tsx` (modified) — add "External Signals" section above the H2 health matrix, render both cards
- `features/reputation/api.ts` (modified) — add `useDomainReputation()`, `useConnectPostmaster()`, `useConnectSnds()`, `useDisconnectReputationSource()`
- `lib/usePlan.ts` (modified) — add `isProPlus` boolean (true when plan is `pro_plus`, `agency`, `enterprise`)

## Data shapes

**Postmaster response → snapshot:**
```
{
  "spammyFeedbackLoops": 0.001,           → spam_rate
  "ipReputations": [{...}],                → raw.ip_reputations
  "domainReputation": "HIGH"|"MEDIUM"|...  → domain_reputation
  "spfSuccessRatio": 0.99,                 → auth_pass_pct (avg of three)
  "dkimSuccessRatio": 0.97,
  "dmarcSuccessRatio": 0.95,
  "inboundEncryptionRatio": 1.0,           → raw.encryption_pct
  "deliveryErrors": [{...}]                → raw.delivery_errors
}
```

**SNDS CSV row → snapshot:**
```
IP, Activity-Start, Activity-End, RCPT-Commands, Data-Commands,
MessageRecipients, Filter-Result, Complaint-Rate, TrapHits,
Sample-Helo, Sample-From, Comments
→ stored: complaint_rate, ip_reputation=Filter-Result, raw=full row
```

## Webhook events

When a Postmaster snapshot lands with `spam_rate > 0.001` (Google's Red threshold), ingest task fires `spam_rate_spike` event. SNDS equivalent fires `complaint_rate_spike` when `complaint_rate > 0.003`. Both flow through sub-project 1's webhook dispatcher — no new dispatch code.

## UI layout

The Reputation page (`/app/reputation`) gets a new section above the H2 health matrix:

```
External Signals · Domain reputation from inbox providers
┌──── Google Postmaster ─────────────┐  ┌──── Microsoft SNDS ──────────────┐
│ acme.com · last pulled 4h ago      │  │ acme.com · last pulled 8h ago    │
│ Spam rate    0.04%      🟢 Green    │  │ Complaint rate  0.02%  🟢 Green   │
│ Domain rep   HIGH                  │  │ IP reputation   GREEN             │
│ Auth pass    98.5%                 │  │ Trap hits       0                 │
│ [30-day sparkline]                 │  │ [30-day sparkline]                │
│ [Disconnect]            [Raw JSON] │  │ [Disconnect]           [Raw JSON] │
└────────────────────────────────────┘  └───────────────────────────────────┘
```

If a provider isn't connected: card body replaced with a "Connect Google Postmaster" / "Connect SNDS" CTA + 1-line explainer. If user is not on Pro Plus or above: replace CTA with "Upgrade to Pro Plus".

## OAuth flow (Postmaster only)

1. User clicks "Connect Google Postmaster" → frontend calls `GET /api/workspace/postmaster/oauth-start?domain=acme.com`
2. Backend returns Google auth URL with `scope=https://www.googleapis.com/auth/postmaster.readonly` and `state=<workspace_id>:<domain>:<nonce>`
3. Frontend opens popup window; Google consent screen; user approves
4. Google redirects to `GET /api/workspace/postmaster/oauth-callback?code=...&state=...`
5. Backend exchanges code → access + refresh token; writes `domain_credentials` row; refresh token Fernet-encrypted at rest
6. Popup posts a `postMessage` back to opener → frontend invalidates `useDomainReputation()` query

We reuse the existing Google OAuth client registration in WarmPulse (adding the new scope is non-sensitive, no re-verification).

## SNDS access-key flow

1. User clicks "Connect SNDS" → dialog with domain input + access-key paste field
2. User pastes their SNDS access key (already registered at `postmaster.live.com`)
3. Frontend `POST /api/workspace/snds/domains` body `{domain, access_key}`
4. Backend validates by attempting one CSV fetch; on success, encrypts + stores; on failure, returns 400 with reason

## Beat-schedule entries

Add to existing celerybeat dict:

- `postmaster-ingest-daily` → `app.tasks.postmaster_ingest.tick`, crontab `0 3 * * *`
- `snds-ingest-daily` → `app.tasks.snds_ingest.tick`, crontab `30 3 * * *`

## Out of scope

- Per-IP breakdown UI (raw JSONB stored, visualization later)
- DMARC aggregate report email parsing (separate sub-project)
- TLS-RPT report ingestion (separate)
- Auto-domain discovery (user explicitly registers each domain)
- Historical backfill on initial connect (Postmaster only stores 60 days; we pull fresh data going forward)

## Risk

| Risk | Mitigation |
|---|---|
| Google OAuth scope verification | `postmaster.readonly` is non-sensitive; no review needed |
| SNDS CSV column changes | Defensive parser — log + skip unknown columns rather than crash |
| Refresh-token leak in logs | Existing redaction pattern (`smtp_sender.py`) applied to all log lines touching creds |
| Domain ownership claim | Postmaster API only returns data for domains the OAuth user has verified in Postmaster Tools — Google enforces claim. SNDS similarly tied to Microsoft verification. No WarmPulse-side verification needed. |
| Daily pull failing silently | `last_status` + `last_pulled_at` columns; alert webhook fires when stale >36h |

## Verification

- `cd backend && pytest tests/test_postmaster_ingest.py tests/test_snds_ingest.py -x` — green
- `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no new errors
- Manual: register a Google domain in Postmaster Tools, click Connect, see OAuth flow complete, run task by hand, see snapshot stored, dashboard tile populated
- Manual: paste a real SNDS key for a registered domain, see CSV pulled and snapshot stored

## File touch list

**Sub-A (Postmaster + shared infra):**
- Add: 2 services (postmaster_client.py · placeholder for snds) · 2 models · 2 task files (Postmaster only) · 1 route · 1 migration · 2 test files
- Modify: notifications_dispatch.py (events) · models/__init__.py · main.py · celery beat · usePlan.ts (isProPlus) · ProReputation.tsx (External Signals wrapper) · features/reputation/api.ts (Postmaster + shared hooks)
- Frontend new: PostmasterCard.tsx · ConnectPostmasterDialog.tsx

**Sub-B (SNDS additive):**
- Add: services/snds_client.py · tasks/snds_ingest.py · api/routes/workspace_snds.py · tests/test_snds_ingest.py
- Modify: main.py (mount SNDS route — append) · celery beat (add SNDS entry — append) · features/reputation/api.ts (append SNDS hooks) · ProReputation.tsx (replace Sub-A's SNDS placeholder with real SndsCard)
- Frontend new: SndsCard.tsx · ConnectSndsDialog.tsx
