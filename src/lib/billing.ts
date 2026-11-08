/**
 * Billing + signup endpoints (spec 2026-11-08-saas-billing-design.md).
 * Wire format follows the backend: snake_case, money as integer minor units.
 * Live mode never fakes success; demo mode returns a sample workspace.
 */
import { attempt, inDemo, openPost, post, put, request, requestText, setSessionToken } from './transport';
import type { Result } from './transport';

export type BillingInterval = 'month' | 'year';
export type BillingCurrency = 'INR' | 'USD';

export interface ApiPlan {
  code: string;
  name: string;
  price_inr_month: number;
  price_usd_month: number;
  price_inr_year: number;
  price_usd_year: number;
  limits: Record<string, number>;
  features?: Record<string, boolean>;
}

export interface UsageMeter {
  meter: string;
  limit: number; // -1 = unlimited
  used: number;
}

export interface SubscriptionInfo {
  plan: { code: string; name: string } | null;
  status: 'pending' | 'active' | 'past_due' | 'canceled' | 'expired' | string;
  interval?: BillingInterval;
  currency?: BillingCurrency;
  current_period_end: string | null;
  bonus_days?: number;
  cancel_at_period_end?: boolean;
  can_refund_until: string | null;
  email_verified?: boolean;
  usage: UsageMeter[] | Record<string, { limit: number; used: number }>;
}

export interface InvoiceRow {
  id: number | string;
  number: string;
  status: string;
  currency: BillingCurrency;
  total: number;
  issued_at: string;
}

export interface BillingDetails {
  billing_name: string;
  billing_email: string;
  billing_address: string;
  gstin: string;
}

export interface CheckoutResult {
  redirect_url?: string;
  razorpay_options?: Record<string, unknown>;
  url?: string;
  options?: Record<string, unknown>;
}

export interface SignupInput {
  company: string;
  name: string;
  email: string;
  password: string;
  country: string;
  plan_code: string;
  interval: BillingInterval;
  utm_source?: string;
  utm_campaign?: string;
  referrer?: string;
}

/** Normalise usage (array or keyed object) to a list of meters. */
export function usageList(u: SubscriptionInfo['usage'] | undefined): UsageMeter[] {
  if (!u) return [];
  if (Array.isArray(u)) return u;
  return Object.entries(u).map(([meter, v]) => ({ meter, limit: v.limit, used: v.used }));
}

const DEMO_ONLY = 'This is the offline demo. Connect your workspace to do that.';
const demoFail = <T,>(): Result<T> => ({ ok: false, error: DEMO_ONLY });

/** Public plans; throws when unreachable (the pricing page keeps its static fallback). */
export async function fetchPlans(): Promise<ApiPlan[]> {
  const r = await request<ApiPlan[] | { plans: ApiPlan[] }>('/billing/plans/');
  return Array.isArray(r) ? r : r.plans;
}

export async function getSubscription(): Promise<SubscriptionInfo> {
  if (await inDemo()) {
    return {
      plan: { code: 'business', name: 'Business' },
      status: 'active',
      interval: 'month',
      currency: 'INR',
      current_period_end: new Date(Date.now() + 25 * 864e5).toISOString(),
      can_refund_until: null,
      email_verified: true,
      usage: [
        { meter: 'leads', limit: 2000, used: 312 },
        { meter: 'emails', limit: 15000, used: 1180 },
        { meter: 'mailboxes', limit: 5, used: 2 },
        { meter: 'seats', limit: 5, used: 1 },
        { meter: 'sequences', limit: 25, used: 3 },
      ],
    };
  }
  return request<SubscriptionInfo>('/billing/subscription/');
}

export const startCheckout = async (plan_code: string, interval: BillingInterval, currency: BillingCurrency) =>
  (await inDemo())
    ? demoFail<CheckoutResult>()
    : attempt(() => request<CheckoutResult>('/billing/checkout/', post({ plan_code, interval, currency })));

export const verifyRazorpay = async (p: {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}) => ((await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/billing/razorpay/verify/', post(p))));

export interface CancelOutcome {
  refunded?: number;
  currency?: BillingCurrency;
  canceled_immediately?: boolean;
  cancel_at_period_end?: boolean;
}
export const cancelSubscription = async () =>
  (await inDemo()) ? demoFail<CancelOutcome>() : attempt(() => request<CancelOutcome>('/billing/cancel/', post()));

export const changePlan = async (plan_code: string, interval: BillingInterval, currency: BillingCurrency) =>
  (await inDemo())
    ? demoFail<CheckoutResult>()
    : attempt(() => request<CheckoutResult>('/billing/change_plan/', post({ plan_code, interval, currency })));

export async function getInvoices(): Promise<InvoiceRow[]> {
  if (await inDemo()) return [];
  const r = await request<InvoiceRow[] | { results: InvoiceRow[] }>('/billing/invoices/');
  return Array.isArray(r) ? r : r.results;
}

/** Fetch the printable HTML invoice (token needed, so not a plain link) and open it in a new tab. */
export async function viewInvoice(id: number | string): Promise<Result<true>> {
  if (await inDemo()) return demoFail();
  return attempt(async () => {
    const html = await requestText(`/billing/invoices/${id}/`);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true as const;
  });
}

export async function getBillingDetails(): Promise<BillingDetails> {
  if (await inDemo()) return { billing_name: '', billing_email: '', billing_address: '', gstin: '' };
  // GET is not in the contract; the subscription payload may carry it, so read tolerant
  return request<BillingDetails>('/billing/billing_details/');
}

export const saveBillingDetails = async (d: BillingDetails) =>
  (await inDemo()) ? demoFail<BillingDetails>() : attempt(() => request<BillingDetails>('/billing/billing_details/', put(d)));

/* ---------------- signup / verify ---------------- */

type Fail = { ok: false; error: string; fields: Record<string, string> };

export async function signup(input: SignupInput): Promise<{ ok: true } | Fail> {
  if (await inDemo()) return { ok: false, error: DEMO_ONLY, fields: {} };
  const r = await openPost<{ token: string }>('/auth/signup/', input);
  if (!r.ok) return r;
  if (r.data.token) setSessionToken(r.data.token);
  return { ok: true };
}

export async function verifyEmail(token: string): Promise<{ ok: true } | Fail> {
  const r = await openPost<unknown>('/auth/verify_email/', { token });
  return r.ok ? { ok: true } : r;
}

export const resendVerification = async (): Promise<Result<unknown>> =>
  (await inDemo()) ? demoFail() : attempt(() => request('/auth/resend_verification/', post()));
