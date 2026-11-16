/**
 * Billing feature types (spec §5.1 item 9).
 * Billing is dummy — no real payment processor is contacted.
 */

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  plan_id: string;
  plan_name: string;
  amount_cents: number;
  status: PaymentStatus;
  // Card path; null for UPI rows.
  dummy_card_last4: string | null;
  // UPI path; null for card rows.
  dummy_upi_vpa: string | null;
  // 'card_dummy' | 'upi_dummy' | 'stripe' | null (legacy rows).
  payment_method: string | null;
  created_at: string;
}

export interface Invoice {
  payment_id: string;
  invoice_number: string; // auto-generated client-side: INV-YYYY-NNNNN
  date: string;
  plan_name: string;
  amount_cents: number;
  tax_cents: number; // 0 for dummy
  total_cents: number; // = amount_cents for dummy
  billing_address: string;
  issuer_address: string;
}

export interface CurrentUsage {
  mailboxes_used: number;
  mailboxes_cap: number;
  warmup_emails_sent_mtd: number;
  llm_tokens_used_mtd: number;
  llm_tokens_cap: number;
}

/**
 * Upgrade payload used by the in-app UpgradeDialog. The DummyPayment onboarding
 * flow has its own narrower shape — we keep both so existing wizard code keeps
 * working but the dialog can capture the full card-form values.
 */
export interface UpgradePayload {
  plan_id: string;
  card_number: string;
  cvc: string;
  expiry_mmyy: string;
  cardholder_name: string;
  country: string;
}

export interface UpgradeResponse {
  status: 'succeeded' | 'failed';
  payment_id: string;
}

// ---------------------------------------------------------------------------
// Cashfree Checkout (real gateway — gated on CASHFREE_KEY_ID server-side).
// Backend returns 503 when Cashfree isn't configured; callers fall back to the
// dummy gateway. Field shapes mirror the `/payments/cashfree/*` responses.
// ---------------------------------------------------------------------------

/** Response of `POST /payments/cashfree/order` (one-time payment). */
export interface CashfreeOrderOut {
  payment_session_id: string;
  order_id: string;
}

/** Response of `POST /payments/cashfree/subscription` (recurring auto-pay). */
export interface CashfreeSubscriptionOut {
  payment_session_id: string;
  subscription_id: string;
}

/**
 * Body for `POST /payments/cashfree/verify`. 
 */
export interface CashfreeVerifyPayload {
  order_id: string;
}

/** Verify response — mirrors the dummy `/payments/dummy` envelope. */
export interface CashfreeVerifyResponse {
  payment: Payment;
  user: import('@/stores/auth').AuthUser;
}

export interface MonthlySpendPoint {
  month: string; // "YYYY-MM"
  amount_cents: number;
}

/**
 * Payment method projection returned by ``GET /payments/methods`` and the
 * mutation that creates one. Mirrors :class:`PaymentMethodOut` on the
 * backend.
 */
export interface PaymentMethod {
  id: string;
  kind: 'card' | 'upi';
  label: string;
  sub: string | null;
  is_default: boolean;
}

export interface PaymentMethodsResponse {
  items: PaymentMethod[];
}

/**
 * Request body for ``POST /payments/methods``. The frontend never sends a
 * full PAN beyond the dummy-gateway contract; only ``last4`` reaches the
 * database (the backend strips PAN/CVC in the service layer regardless).
 */
export type AddPaymentMethodPayload =
  | {
      kind: 'card';
      label?: string;
      card_number: string;
      cvc: string;
      expiry_mmyy: string;
      cardholder_name: string;
      country: string;
    }
  | {
      kind: 'upi';
      label?: string;
      upi_vpa: string;
    };

/** Dummy auto-pay state for the signed-in user. */
export interface BillingStatus {
  auto_pay_enabled: boolean;
  next_billing_date: string | null;
}

/** A purchasable add-on (catalogue + per-caller `owned` flag). */
export interface Addon {
  id: string;
  key: string;
  name: string;
  description: string;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
  owned: boolean;
  price_display: string;
}
