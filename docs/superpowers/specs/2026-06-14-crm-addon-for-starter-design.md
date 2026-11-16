# CRM Add-on for Starter — Design

**Date:** 2026-06-14
**Status:** Approved (inline)
**Author:** Engineering

## Problem

CRM is fully built and wired for Pro / Pro Plus / Agency tiers (`CrmWorkspace` +
`@/features/crm` — audit found zero dead buttons). Starter (and unknown-plan)
users are blocked in two places:

1. **Backend** `crm_service.crm_campaign_cap()` returns `0` for
   starter/trial/free/unknown → cannot create a campaign.
2. **Frontend** `CrmPage.tsx` routes Starter/unknown to `StarterCrm`
   (a paywall, `StCrmA3Compare`) instead of the real `CrmWorkspace`.

We want CRM "functional for all": Pro+ keep it included; **Starter unlocks the
full CRM by buying a paid add-on**. After purchase that workspace gets a modest,
fully-working CRM.

## Decisions

- **Add-on grant:** Starter-with-add-on → **1 campaign / 500 leads**.
- **Price / gateway:** **₹499/mo** via the active **dummy gateway** (consistent
  with current billing; no real PSP).
- **Unlock model:** a **per-workspace** flag, independent of plan. If the
  workspace later upgrades to Pro+, the flag is simply redundant.
- **Entry points:** CRM-page paywall **and** Billing-page add-ons section.

## Changes

### 1. Data model
Add `crm_addon_enabled: bool` (default `False`, `NOT NULL`) to
`workspace_settings` (mirrors existing `auto_crm_enabled`). New Alembic
migration `0029_add_crm_addon_enabled`.

### 2. Backend gating (`services/crm_service.py`)
- `crm_campaign_cap(plan_name, *, crm_addon=False)` and
  `crm_lead_cap(plan_name, *, crm_addon=False)` gain the flag:
  - starter/unknown **without** add-on → campaigns `0` (unchanged).
  - starter/unknown **with** add-on → campaigns `1`, leads `500`.
  - Pro / Pro Plus / Agency → unchanged (add-on is a no-op).
- Helper `_crm_addon_enabled(session, user)` reads the workspace row.
- Thread the flag through `get_limits`, `create_campaign`, and lead import.

### 3. Purchase endpoint (`routes/payments.py` + `payments_service.py`)
- `POST /api/payments/crm-addon` (auth required): dummy charge that records a
  `succeeded` Payment (`payment_method='crm_addon'`, current `plan_id` to
  satisfy the non-null FK, `amount_cents=49900`) and sets
  `workspace_settings.crm_addon_enabled = True` (get-or-create the row).
  Idempotent — re-purchase while active is a no-op success.

### 4. Expose the flag
- Add `crm_addon: bool` to `/auth/me` (`schemas/auth.UserResponse`) and the
  frontend `AuthUser` type, so `CrmPage` reads it without an extra request.

### 5. Frontend
- `CrmPage.tsx`: Starter/unknown → if `crm_addon` render `CrmWorkspace`
  (Starter flavor, 1-campaign cap chip) else `StarterCrm`.
- `StCrmA3Compare` paywall: primary CTA becomes **"Unlock CRM — ₹499/mo"** →
  dummy checkout dialog → on success invalidate `/auth/me` → page flips live.
- Billing page: **Add-ons** section — CRM row shows **Buy (₹499/mo)** or
  **Active**.

### 6. Deploy
Migrate the prod container DB (`docker compose run --rm api alembic upgrade
head`), rebuild `api` + `frontend`.

## Out of scope
- Real PSP add-on billing (Stripe/Cashfree) — dummy gateway only for now.
- Recurring/auto-renew enforcement — the flag is a simple unlock.
- CRM feature internals — already fully wired.

## Test notes
- `info.shailog@gmail.com` (Agency) is the working reference account — CRM
  already functional there.
- Verify a Starter workspace: CRM locked → buy add-on → CRM live with a
  1-campaign cap; 2nd campaign returns 409; lead import caps at 500.
