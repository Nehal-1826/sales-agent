# Billing: auto-pay, add-ons, reminder + invoice emails (dummy)

**Date:** 2026-06-22 · **Status:** approved · **Mode:** dummy/beta (no real PSP; emails dry-run until `TRANSACTIONAL_SMTP_*` set)

## Goal
Add four billing capabilities to WarmPulse, all dummy for now:
1. **Auto-pay** — monthly auto-renew toggle + a daily job that dummy-charges due users.
2. **Add-ons** — a small admin-managed catalogue of purchasable add-ons (dummy charge).
3. **Payment-reminder email** — 3 days before renewal, to everyone.
4. **Invoice email** — after every successful payment (plan, add-on, renewal).

## Data model (migration `0037_billing_autopay_addons`)
- `users`: `auto_pay_enabled BOOLEAN NOT NULL DEFAULT false`, `next_billing_date DATE NULL`.
- `addons` (catalogue): `id uuid pk`, `key varchar unique`, `name`, `description`, `price_cents int`, `is_active bool default true`, `sort_order int default 0`, `created_at`. Seed: `crm` (CRM Automation, 49900), `mailbox_pack` (Extra Mailbox Pack, 29900), `priority_support` (Priority Support, 19900).
- `workspace_addons` (ownership): `id uuid pk`, `workspace_id uuid (indexed)`, `addon_id uuid fk addons RESTRICT`, `payment_id uuid null`, `created_at`; unique `(workspace_id, addon_id)`.

`next_billing_date` is stamped `today + 1 month` on every successful **plan** payment (dummy/upi/cashfree). Add-on purchases don't change it.

## Services (`payments_service.py`)
- `set_auto_pay(session, user, enabled)` → set flag, audit.
- `purchase_addon(session, *, user, addon_key, ip=None)` — generic: resolve active addon by key (404 if unknown/inactive); idempotent no-op if owned; dummy `succeeded` Payment (`payment_method="addon_dummy"`, amount=addon.price_cents, plan_id=user.plan_id or cheapest for FK); insert `workspace_addons`; if `key=="crm"` also set `workspace_settings.crm_addon_enabled=True`; send invoice email. `purchase_crm_addon` becomes `purchase_addon(key="crm")` wrapper.
- `renew_subscription_dummy(session, user)` — resolve `user.plan_id` plan; dummy `succeeded` Payment (`payment_method="auto_renew_dummy"`); `next_billing_date += 1 month`; invoice email. No-op if no plan.
- Plan-payment paths (`record_dummy_payment`, `record_dummy_upi_payment`, `record_cashfree_payment`) → set `user.next_billing_date = today + 1 month` and send invoice email.
- `addons_service.py` (new): `list_active_addons`, `list_all_addons`, `create/update` (admin), `owned_addon_ids_for_workspace`.
- Month math: helper `_add_one_month(d)` (clamp day to month length).

## Emails (`mail_templates.render` + `transactional_mail`)
- `send_payment_reminder(*, to, plan_name, amount_cents, due_date, auto_pay)` — copy differs by `auto_pay`.
- `send_invoice_email(*, to, item_label, amount_cents, invoice_number, attachment)` — uses `build_invoice_pdf` (fallback CSV) + `send_transactional_with_attachment`. Best-effort; never raises into the charge path.

## Beat jobs (`celerybeat_schedule.py` + `celery_app.py` include + `tasks/`)
- `tasks/billing_reminder.py::tick` — `billing-reminder-daily` crontab(minute=15,hour=0). Find users with `next_billing_date == today+3`, plan set; Redis-dedup per user/day; `send_payment_reminder`.
- `tasks/billing_renew.py::tick` — `billing-auto-renew-daily` crontab(minute=20,hour=0). Find users `auto_pay_enabled AND next_billing_date <= today AND plan_id NOT NULL` with a saved method; Redis-dedup; `renew_subscription_dummy`.

## API
- Client (`routes/payments.py`): `PATCH /payments/auto-pay` `{enabled: bool}`; `GET /payments/addons` (catalogue + `owned` flags); `POST /payments/addons/{key}` (dummy buy). `GET /payments/me` extended with `auto_pay_enabled`, `next_billing_date`.
- Admin (`routes/admin_addons.py`): `GET /admin/addons`, `POST /admin/addons`, `PATCH /admin/addons/{id}` — `require_super_admin`.

## Frontend
- `features/billing/api.ts`: hooks `useAutoPay`/`useSetAutoPay`, `useAddons`, `useBuyAddon`; types.
- Shared components: `AutoRenewCard` (toggle + next-billing date), `AddOnsSection` (catalogue cards + Buy → dummy → toast). Dropped into the 4 plan-variant billing pages.
- Admin: minimal Add-ons management (reuse card/inline-edit pattern from PlansPage) under `/admin` (new page or section).

## Out of scope (YAGNI)
Yearly billing (no backend interval), real PSP/subscriptions/retry/dunning, proration, refunds, per-add-on entitlement enforcement beyond CRM's existing flag.

## Test / verify
- Backend unit tests: `purchase_addon` (idempotent, sets crm flag, records payment), `renew_subscription_dummy` (advances date), `set_auto_pay`, reminder/renew task selection queries. Add new models to the per-file SQLite fixtures' table lists.
- Live: toggle auto-pay, buy an add-on (dummy), force a due/`today+3` date and run the tasks, confirm Payment rows + dry-run email logs; clean up test data.
