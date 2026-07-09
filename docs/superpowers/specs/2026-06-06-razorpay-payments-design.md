# Razorpay payments — one-time Orders + Auto-pay Subscriptions

- **Date:** 2026-06-06
- **Status:** Approved (inline)

## Decisions
- **Build-ready with env placeholders.** When `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`
  are empty, the Razorpay routes return **503** and the UI falls back to the
  existing **dummy gateway** (mirrors the Stripe fallback). Paste test keys later → live.
- **Both flows:** one-time (Orders) **and** Auto-pay (Subscriptions); user toggles.
- **Scope:** Razorpay is primary on onboarding plan-select + billing upgrade; dummy fallback.
- **Pattern:** mirror the existing **Stripe scaffold** (`stripe_service.py` /
  `stripe_events`) — httpx + Basic auth + manual HMAC + idempotent events journal.
  No new heavy deps (httpx already present).

## Backend
- **`config.py`:** `razorpay_key_id` / `razorpay_key_secret` / `razorpay_webhook_secret`
  (default `""`); `razorpay_enabled` = both id+secret set.
- **Models + migration `0026_razorpay`** (down_revision `0025_admin_report_schedules`):
  - `payments`: add `razorpay_order_id`, `razorpay_payment_id`, `razorpay_subscription_id` (nullable str).
  - `plans`: add `razorpay_plan_id` (nullable str) — lazily-created Razorpay Plan per tier (monthly), cached.
  - new `razorpay_events` table (PK = event id; `type`, `payload` JSON, `received_at`,
    `processed_at`, `error`) — idempotency journal, same shape as `stripe_events`.
- **`services/razorpay_service.py`** (httpx, Basic auth `key_id:key_secret`,
  base `https://api.razorpay.com/v1`):
  - `create_order(db, user, plan)` → `POST /orders` (amount = `plan.price_cents` paise,
    currency `INR`, notes `{user_id, plan_id}`).
  - `create_subscription(db, user, plan)` → ensure `plan.razorpay_plan_id` (lazy
    `POST /plans` monthly) → `POST /subscriptions` (`total_count`, `customer_notify=1`,
    notes `{user_id, plan_id}`).
  - `verify_checkout_signature(...)` — HMAC-SHA256: one-time `order_id|payment_id`,
    subscription `payment_id|subscription_id`, against `key_secret`.
  - `verify_webhook(body, sig, secret)` — HMAC-SHA256(raw body) == `X-Razorpay-Signature`.
  - `handle_event(db, event)` — insert into `razorpay_events` first (dup → 200 no-op);
    handlers: `order.paid`/`payment.captured` → succeeded Payment + transition user;
    `subscription.activated`/`subscription.charged` → Payment + set plan + un-suspend;
    `subscription.halted`/`cancelled`/`paused` → suspend; `payment.failed` → failed Payment + notice.
  - Record `razorpay_*` ids on the Payment row; reuse `_transition_after_payment`.
- **Routes** (`api/routes/payments.py`):
  - `POST /payments/razorpay/order` `{plan_id}` → `{key_id, order_id, amount, currency, name, prefill}` | 503
  - `POST /payments/razorpay/subscription` `{plan_id}` → `{key_id, subscription_id, name, prefill}` | 503
  - `POST /payments/razorpay/verify` `{razorpay_payment_id, razorpay_order_id?, razorpay_subscription_id?, razorpay_signature}` → `{payment, user}` | 400 invalid
  - `POST /payments/razorpay/webhook` (raw body + `X-Razorpay-Signature`) → 200
- **`schemas/payments.py`:** request/response schemas for the above.

## Frontend
- `loadRazorpay()` helper — inject `https://checkout.razorpay.com/v1/checkout.js` once.
- `features/billing/api.ts`: `useCreateRazorpayOrder`, `useCreateRazorpaySubscription`,
  `useVerifyRazorpayPayment`; detect 503 → `isRazorpayUnavailable`.
- **`UpgradeDialog.tsx`** + onboarding plan-select: **"Pay once" / "Auto-pay (recurring)" toggle**.
  - Pay once → create order → `window.Razorpay({key, order_id, handler})` → on success → `/verify` → invalidate auth/payments.
  - Auto-pay → create subscription → Checkout with `subscription_id` (collects mandate) → `/verify`.
  - Razorpay modal handles card / UPI / netbanking / wallet.
  - On 503 (no keys) → render existing dummy card/UPI tabs unchanged.

## Payment gate
Reuse the existing `onboarding_status` progression — Razorpay Checkout is the gate to
advance past plan-selection when keys are configured. No new route guard.

## Razorpay reference (standard)
- Orders: `POST /orders {amount:paise, currency:"INR", notes}`.
- Subscriptions: Plan (`POST /plans {period:"monthly", interval:1, item:{amount, currency}}`)
  then `POST /subscriptions {plan_id, total_count, customer_notify:1, notes}`.
- Checkout success → `razorpay_payment_id` + (`razorpay_order_id` | `razorpay_subscription_id`) + `razorpay_signature`.
- Webhook `X-Razorpay-Signature` = HMAC-SHA256(raw body, webhook_secret).

## Notes / out of scope
- Webhook needs a **public URL** in deployment (set in Razorpay dashboard); locally the
  `/verify` endpoint confirms one-time payments. Recurring renewals require the webhook.
- Amount = `plan.price_cents` paise (INR) — matches the frontend's `price_cents/100` display.
- **No git push** (Razorpay verification pending). Keys go in `backend/.env.docker`.
