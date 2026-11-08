# billing

Plans, subscriptions, entitlements, gateways (Razorpay INR, Stripe USD), webhooks, invoices.
Design: `docs/superpowers/specs/2026-11-08-saas-billing-design.md`.

## Environment (never committed)
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`BILLING_GSTIN`, `BILLING_LEGAL_NAME`, `BILLING_ADDRESS` (invoice seller block),
`REFUND_FEE_PCT` (default 10), `PUBLIC_BASE_URL` (checkout return links).
Missing gateway keys -> `503 {"error":"gateway_not_configured"}`.

## Razorpay plans (required, one per plan x interval)
Razorpay subscriptions need a Razorpay *Plan*; we do not create them via API.
1. Razorpay Dashboard -> Subscriptions -> Plans -> Create Plan. Period `monthly` or `yearly`,
   interval 1, amount = the plan's INR price **plus 18 % GST** (e.g. Startups monthly: Rs 3,538.82),
   because the gateway-charged amount is what gets invoiced (invoice splits it into subtotal + GST).
2. Copy the `plan_...` id.
3. Admin console (or Django admin) -> Plan -> `razorpay_plan_ids` = `{"month": "plan_xxx", "year": "plan_yyy"}`.
Without an id, INR checkout returns 503 gateway_not_configured.

## Stripe prices (optional)
Set `stripe_price_ids` = `{"month": "price_...", "year": "price_..."}` to use Dashboard prices.
Without one, checkout builds an inline `price_data` from the plan's USD minor-unit amount
(USD is an export: 0 % tax). `change_plan` on Stripe requires a stored price id.

## Webhooks
Point the gateways at `https://<host>/api/webhooks/razorpay/` and `/api/webhooks/stripe/`.
Razorpay events: subscription.activated/charged/halted/cancelled, payment.failed, refund.processed.
Stripe events: checkout.session.completed, invoice.paid, invoice.payment_failed,
customer.subscription.deleted, charge.refunded.
Only a paid charge activates a subscription; the first one adds `bonus_days` once.
