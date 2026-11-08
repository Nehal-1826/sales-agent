# SaaS: self-serve signup, plans, paywall, billing, platform admin console

Branch: `feat/saas-billing`. Status: approved by owner 2026-11-08.
Rules from CLAUDE.md stay in force: multi-tenancy and outreach safety are never weakened.

## Decisions (owner)
- Gateways: **Razorpay** (India, INR) and **Stripe** (international, USD). Both behind one adapter interface.
- Currency: INR + USD stored per plan. India visitors see INR, else USD. Prices exclude 18% GST (India).
- Plans: Startups, Business, Enterprise (see `marketing/pricing-research.md`).
- Trial / refund policy: client pays at signup; **10 bonus days** are added to the first period.
  Cancel within 10 days of first payment → **partial refund** (pro-rata on unused paid days,
  minus a non-refundable fee `REFUND_FEE_PCT`, default 10%). After 10 days: cancel at period end, no refund.
- Platform operator: **Shailog Technologies**. Platform admins = users with `workspace=NULL` and
  `is_staff=True` (superusers included). Never a tenant user.
- No payment SDKs: gateway calls via `requests` (already a dependency). No new deps.

## Plans (seeded by data migration; editable in admin console)
| code | name | INR/mo | USD/mo | INR/yr | USD/yr | leads/mo | emails/mo | mailboxes | seats | sequences | whatsapp | runs/day | ai msgs/mo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| startups | Startups | 2999 | 39 | 29990 | 390 | 500 | 3000 | 2 | 2 | 5 | no | 2 | 300 |
| business | Business | 7999 | 99 | 79990 | 990 | 2000 | 15000 | 5 | 5 | 25 | yes | 6 | 2000 |
| enterprise | Enterprise | 19999 | 249 | 199990 | 2490 | 8000 | 60000 | 20 | 20 | -1 | yes | 24 | 10000 |
`-1` = unlimited. Prices stored as integer minor units (paise / cents).

## Data model (new app `billing`, `backend/billing/`)
Platform-level (NOT TenantOwned): `Plan`, `WebhookEvent`, `PlatformAuditLog`, `InvoiceCounter`.
- `Plan(code unique, name, is_active, sort, price_inr_month, price_usd_month, price_inr_year, price_usd_year`
  (ints, minor units)`, limits JSONField, features JSONField, razorpay_plan_ids JSON {month,year}, stripe_price_ids JSON {month,year})`.
- `WebhookEvent(gateway, event_id unique per gateway, type, received_at, processed_at, payload_hash, status, error)` —
  idempotency + replay protection. Raw payload not stored (PII); store sha256.
- `PlatformAuditLog(actor FK user null, action, target_workspace FK null, meta JSON, ip, created_at)` — append-only;
  every platform-admin write and every billing state change logs here.

Tenant-scoped (inherit `TenantOwned`):
- `Subscription(workspace OneToOne, plan FK, interval month|year, currency INR|USD, gateway razorpay|stripe|manual,
  gateway_customer_id, gateway_subscription_id, status: pending|active|past_due|canceled|expired,
  current_period_start, current_period_end, bonus_days default 10, first_paid_at, cancel_at_period_end bool,
  canceled_at, created_at, updated_at)`.
- `Invoice(number unique global e.g. SHL-2026-000123, subscription FK, status draft|paid|refunded|partially_refunded|void,
  currency, subtotal, tax_rate_bp (1800 = 18%), tax_amount, total, amount_refunded, period_start, period_end,
  billing_name, billing_email, billing_address, gstin, gateway_payment_id, issued_at, paid_at)`.
  Invoice number allocated in a transaction with `select_for_update` on a counter row (`InvoiceCounter`, platform-level).
- `Payment(invoice FK, gateway, gateway_payment_id unique, amount, currency, status captured|failed|refunded, created_at)`.
- `Refund(payment FK, amount, reason, gateway_refund_id, status, requested_by FK user, created_at)`.
- `Workspace` gains: `signup_source` (utm_source), `signup_campaign`, `signup_referrer` (≤200 chars, sanitized),
  `country` (ISO-2), `billing_email`. Existing `is_active` (suspend) stays.

Usage is **derived from existing rows**, no counters (single source of truth):
leads = `Lead` created in current period; emails = `EmailDraft` with `sent_at` in period; mailboxes = `Mailbox` count;
seats = `User` count in workspace; sequences = `Sequence` count; runs/day = `PipelineRun` since IST midnight;
ai msgs = `ChatMessage`(role=user) in period (if model exists; else skip meter).

## Entitlements + paywall (`billing/entitlements.py`)
- `get_entitlement(ws) -> Entitlement(plan, status, limits, usage, period_start, period_end, is_paid_access)`.
  `is_paid_access` = status in {active, past_due-within-3-day-grace} and now < period_end (+bonus applied at activation).
- `check(ws, meter, add=1)` raises `QuotaExceeded(meter, limit, used)` → API 402 JSON
  `{"error":"quota_exceeded","meter":..,"limit":..,"used":..}`.
- `require_paid(ws)` raises `PaymentRequired` → 402 `{"error":"payment_required"}`.
- Hook points (server-side, never only in UI): pipeline run start (runs/day + leads headroom; lead creation stops
  when leads quota reached), `send_draft` before claim (emails), mailbox create (mailboxes), user create/invite (seats),
  sequence create (sequences), WhatsApp send/approve (whatsapp feature), chat POST (ai msgs).
- Paywall: DRF permission `HasPaidAccess` added to DEFAULT_PERMISSION_CLASSES chain via a global permission that
  allows: safe methods (GET/HEAD/OPTIONS) always for authenticated tenant users (they can see data + billing page),
  and all writes only when `is_paid_access`. Exempt paths: `/api/auth/*`, `/api/billing/*`, `/api/health/`,
  `/api/unsubscribe/*`, `/api/webhooks/*`, `/api/platform/*` (platform admins have own permission).
- Worker loops (`run_worker`, outbox, inbox, sequences, whatsapp): skip workspaces without paid access.
  Inbox polling still runs for 7 days after expiry (so replies/bounces/unsubscribes are honoured). Unsubscribe always works.
- Legacy workspaces (existing before migration, e.g. DEFAULT_TENANT_SLUG / operator demo): data migration gives them
  a `manual` Enterprise subscription with period_end = 2099 so nothing breaks.

## Gateways (`billing/gateways/{base,razorpay,stripe}.py`)
Interface: `create_checkout(workspace, plan, interval, currency, customer_email, success_url, cancel_url) -> {redirect_url | razorpay_options}`,
`verify_webhook(raw_body: bytes, headers) -> bool`, `parse_event(...) -> NormalizedEvent`, `refund(payment_id, amount) -> refund_id`,
`cancel(subscription_id, at_period_end)`.
- Gateway choice: currency INR → Razorpay, USD → Stripe. Not user-selectable.
- Razorpay: Subscriptions API (`POST https://api.razorpay.com/v1/subscriptions`, basic auth key_id:key_secret).
  Frontend opens Razorpay Checkout with `subscription_id`. Checkout callback signature verified server-side:
  `HMAC_SHA256(key_secret, payment_id + "|" + subscription_id) == razorpay_signature`.
  Webhook: header `X-Razorpay-Signature` = HMAC_SHA256(webhook_secret, raw_body), hex. Events:
  `subscription.activated`, `subscription.charged`, `subscription.halted`, `subscription.cancelled`, `payment.failed`, `refund.processed`.
- Stripe: Checkout Session (`POST https://api.stripe.com/v1/checkout/sessions`, mode=subscription, bearer secret key,
  `client_reference_id`=workspace public id, `metadata.workspace_id`). Webhook header `Stripe-Signature`
  (`t=..,v1=..`): HMAC_SHA256(webhook_secret, f"{t}.{raw_body}") compared with `hmac.compare_digest`,
  reject if |now - t| > 300s. Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.deleted`, `charge.refunded`.
- **Activation happens only from a verified webhook** (or verified Razorpay checkout signature followed by a server
  fetch of the subscription status). Never from a client redirect/query param.
- Webhooks: `POST /api/webhooks/razorpay/`, `/api/webhooks/stripe/` — csrf_exempt, AllowAny, no tenant context
  from the request; workspace resolved from our stored gateway ids / metadata, then `workspace_context(ws)`.
  Idempotent via `WebhookEvent` unique (gateway, event_id). Return 200 for duplicates, 400 for bad signature.
- Env (read with os.environ, never committed, never in AppSettings of tenants): `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `BILLING_GSTIN`, `BILLING_LEGAL_NAME`, `BILLING_ADDRESS`, `REFUND_FEE_PCT`. Missing keys → checkout returns 503
  `{"error":"gateway_not_configured"}`; tests mock HTTP.
- Bonus days: on the **first** successful payment, `current_period_end += bonus_days`.
- Refund on cancel (`POST /api/billing/cancel/` owner only): if `now - first_paid_at <= 10 days` →
  refund = round(paid_total * unused_paid_days / paid_days * (1 - REFUND_FEE_PCT)), where paid days exclude bonus days,
  cancel immediately, status canceled. Else `cancel_at_period_end=True`. Every refund: `Refund` row + audit log.

## Self-serve signup (`core/signup.py`)
- `POST /api/auth/signup/` {company, name, email, password, country, plan_code, interval, utm_*} (AllowAny, throttled
  5/hour/IP). Creates Workspace (slug from company, unique-suffixed) + owner user (username=email, lowercased) +
  `Subscription(status=pending)` in one transaction. Returns a token immediately; the workspace stays `pending`
  (paywalled, read-only) until payment. Email verification (`User.email_verified_at`) is required before checkout.
- `POST /api/auth/verify_email/` {token} — Django `signing.TimestampSigner` token, 48h max_age, single-use
  (compare against stored `email_verified_at is None`). Verification mail sent via platform SMTP env
  (`PLATFORM_SMTP_*`); if not configured, link is logged (dev) and the endpoint `resend_verification` exists.
- Existing email on signup → 400 `{"email":["Could not use this email."]}`; login errors stay generic.
- `register` (old closed endpoint) stays closed.
- Password policy: Django `AUTH_PASSWORD_VALIDATORS` (min length 10, common, numeric, similarity) applied in signup and
  change_password.

## Security hardening (global)
- DRF throttling: `DEFAULT_THROTTLE_RATES` anon 60/min, user 600/min; scoped: `login` 10/min, `signup` 5/hour,
  `billing` 30/min, `webhook` 600/min. `DEFAULT_THROTTLE_CLASSES` anon+user+scoped.
- Login lockout: 10 failed attempts per username per 15 min → 429 (cache-based, keyed by lowercased username + IP).
- Platform admin TOTP 2FA (RFC 6238, stdlib `hmac`, 30s step, ±1 window). Secret in `User.totp_secret` (base32,
  never serialized after enrollment); enrollment via `/api/platform/2fa/setup/` + `/confirm/`. All `/api/platform/*`
  except 2fa setup require `X-OTP` verified within token session (stored on Token via `PlatformSession` model
  with `otp_verified_at`, valid 12h).
- Tenant users can never reach `/api/platform/*`: `IsPlatformAdmin` = authenticated, `workspace_id is None`,
  `is_staff` True, active. Superusers count.
- Every platform-admin write → `PlatformAuditLog`. Admin console is read-mostly: allowed writes = suspend/unsuspend
  workspace, change plan (manual), extend period, issue refund, edit plan prices/limits.
- Secrets: gateway secrets only in env; never serialized; never logged. Webhook payload stored as hash only.
- Money as integers; currency explicit everywhere; refunds capped at `total - amount_refunded` under `select_for_update`.
- No PII in URLs. Invoices fetched by id with tenant scoping (TenantOwned) — never by guessable public URL.

## Platform admin API (`/api/platform/…`, app `billing/views_platform.py`)
- `GET overview/` → MRR (normalised monthly: yearly/12) per currency + INR-equivalent (fixed FX env `USD_INR_RATE`, default 84),
  ARR, active/pending/past_due/canceled counts, new signups 7d/30d, trial→paid conversion 30d, churn 30d,
  refunds 30d, revenue last 12 months series.
- `GET tenants/?q=&status=&plan=` (paginated) → workspace, owner email, plan, status, period_end, usage vs limits,
  created, last activity (latest PipelineRun / sent email), country, signup_source.
- `GET tenants/<id>/` detail; `POST tenants/<id>/suspend|unsuspend|extend|change_plan/`.
- `GET payments/`, `GET invoices/` (+ `GET invoices/<id>/` printable HTML), `POST payments/<id>/refund/` {amount, reason}.
- `GET marketing/` → signups by day (90d), by `signup_source`/campaign/country, funnel: signup → email verified →
  checkout started → paid, plan mix. Pricing page views are not tracked server-side (omitted).
- `GET plans/`, `PUT plans/<code>/`. `GET audit/`.

## Tenant billing API (`/api/billing/…`)
- `GET plans/` (AllowAny; public pricing) → plans with both currencies.
- `GET subscription/` → plan, status, period, bonus, usage meters, `can_refund_until`.
- `POST checkout/` {plan_code, interval, currency} owner-only, email verified → gateway payload.
- `POST razorpay/verify/` {razorpay_payment_id, razorpay_subscription_id, razorpay_signature}.
- `POST cancel/` owner-only → refund outcome. `POST change_plan/` (upgrade now via gateway; downgrade at period end).
- `GET invoices/`, `GET invoices/<id>/` (HTML printable, GST fields: GSTIN of Shailog, client GSTIN, HSN/SAC 998314).
- `PUT billing_details/` {billing_name, billing_email, billing_address, gstin (validated regex)}.

## Frontend
- `src/pages/SignupPage.tsx` (from marketing CTAs `/?signup=1&plan=business`), verify-email screen.
- Pricing page: currency toggle (auto by `navigator.language`/timezone `Asia/Kolkata` → INR), monthly/yearly toggle,
  CTAs to signup with plan.
- `Settings → Billing` section: plan card, usage meters, upgrade/cancel (cancel shows refund amount preview), invoices.
- Paywall: transport handles 402 → global `PAYMENT_REQUIRED_EVENT`; banner + redirect to Billing; quota toasts.
- Admin console: separate shell when `me.platform_admin` true: `#/platform/{overview,tenants,payments,invoices,marketing,plans,audit}`.
  2FA enrollment / prompt screen. Charts: plain SVG/CSS bars (no new chart dependency).

## Build order (each = one commit)
1. billing models + migrations + plan seed + legacy backfill + entitlements + paywall permission + quota hooks + tests.
2. gateways + webhooks + checkout/cancel/refund + invoices + tests (HTTP mocked).
3. signup + email verify + throttles + lockout + password validators + tests.
4. platform admin API + TOTP + audit log + tests.
5. frontend: signup, pricing, billing, paywall handling.
6. frontend: admin console.
7. security review (opus) + full test + build.

## Contract pins (frontend already built against these)
- `POST billing/checkout/` and `POST billing/change_plan/` respond `{"gateway":"stripe","redirect_url":"https://…"}`
  or `{"gateway":"razorpay","razorpay_options":{key, subscription_id, name, description, prefill:{email,name}, notes}}`.
- `GET billing/billing_details/` exists (returns the same fields PUT accepts).
- 402 bodies exactly `{"error":"payment_required"}` / `{"error":"quota_exceeded","meter","limit","used"}`.
- `GET auth/me/` adds `platform_admin: bool`, `email_verified: bool`, `otp_required: bool` (platform admins whose
  session has not passed TOTP).
- `GET platform/overview/` → `{mrr:{INR,USD,inr_equivalent}, arr_inr_equivalent, counts:{active,pending,past_due,canceled},
  signups_7d, signups_30d, conversion_30d, churn_30d, refunds_30d:{count,amount_inr_equivalent}, revenue_12m:[{month,inr_equivalent}]}`
  (money = integer minor units).
- `GET platform/marketing/` → `{signups_by_day:[{date,count}], by_source:[{source,count,paid}], by_campaign:[{campaign,count,paid}],
  by_country:[{country,count,paid}], funnel:{signups,verified,checkout_started,paid}, plan_mix:[{plan,count}]}`.
- Platform lists are DRF-paginated `{count,next,previous,results}`; money fields carry `currency`.
- 2FA: `POST platform/2fa/setup/` → `{secret, otpauth_uri}` (only while not yet enrolled); `POST platform/2fa/confirm/ {code}`;
  `POST platform/2fa/verify/ {code}` marks the current token session verified for 12h.
- Platform row shapes (console built against these): tenant `{id, workspace, owner_email, plan:{code,name}, status, suspended,
  period_end, usage:{meter:{used,limit}}, created, last_activity, country, signup_source}`; payment `{id, workspace, created_at,
  amount, currency, refunded_amount, refundable, gateway, status}`; invoice `{id, workspace, number, total, currency, status, issued_at}`;
  audit `{id, created_at, actor, action, target, reason, ip}`; plan `{code, name, active, sort, price_inr_month, price_usd_month,
  price_inr_year, price_usd_year, limits}`.
- Platform writes: suspend/unsuspend `{reason}`, extend `{days, reason}`, change_plan `{plan_code, reason}`, refund `{amount, reason}`
  (reason required, stored in audit meta), `PUT plans/<code>/` whole plan, minor units.
