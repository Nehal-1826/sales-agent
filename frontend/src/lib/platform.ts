/**
 * Platform admin console API (spec 2026-11-08-saas-billing-design.md).
 * Snake_case wire format; money = integer minor units + currency.
 * Live mode never fakes success; demo mode returns read-only sample data.
 */
import { attempt, inDemo, post, put, request, requestText } from './transport';
import type { Result } from './transport';

export type Cur = 'INR' | 'USD';

export interface Me {
  platform_admin?: boolean;
  otp_required?: boolean;
  email_verified?: boolean;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Overview {
  mrr: { INR: number; USD: number; inr_equivalent: number };
  arr_inr_equivalent: number;
  counts: { active: number; pending: number; past_due: number; canceled: number };
  signups_7d: number;
  signups_30d: number;
  conversion_30d: number; // 0..1 (values > 1 are treated as percent)
  churn_30d: number;
  refunds_30d: { count: number; amount_inr_equivalent: number };
  revenue_12m: { month: string; inr_equivalent: number }[];
}

export interface UsageItem {
  meter?: string;
  limit: number;
  used: number;
}

export interface TenantRow {
  id: number | string;
  workspace: string;
  owner_email: string;
  plan: string | { code: string; name?: string } | null;
  status: string;
  period_end: string | null;
  usage?: UsageItem[] | Record<string, UsageItem>;
  created?: string;
  last_activity?: string | null;
  country?: string;
  signup_source?: string;
  suspended?: boolean;
}

export interface PaymentRow {
  id: number | string;
  tenant?: string;
  workspace?: string;
  created_at?: string;
  amount: number;
  currency: Cur;
  status: string;
  gateway?: string;
  refunded_amount?: number;
  refundable?: number;
}

export interface InvoiceRow {
  id: number | string;
  number: string;
  tenant?: string;
  workspace?: string;
  status: string;
  currency: Cur;
  total: number;
  issued_at: string;
}

export interface CountRow {
  count: number;
  paid?: number;
  [k: string]: string | number | undefined;
}

export interface Marketing {
  signups_by_day: { date: string; count: number }[];
  by_source: { source: string; count: number; paid?: number }[];
  by_campaign: CountRow[];
  by_country: CountRow[];
  funnel: { signups: number; verified: number; checkout_started: number; paid: number };
  plan_mix: { plan: string; count: number }[];
}

export interface PlanRow {
  code: string;
  name: string;
  price_inr_month: number;
  price_usd_month: number;
  price_inr_year: number;
  price_usd_year: number;
  limits: Record<string, number>;
  features?: Record<string, boolean>;
  active: boolean;
}

export interface AuditRow {
  id: number | string;
  created_at: string;
  actor?: string;
  action: string;
  target?: string;
  reason?: string;
  ip?: string;
  detail?: unknown;
}

export interface TenantQuery {
  q?: string;
  status?: string;
  plan?: string;
  page?: number;
}

const DEMO_ONLY = 'Demo data is read-only. Connect to the live server to do that.';
const demoFail = <T,>(): Result<T> => ({ ok: false, error: DEMO_ONLY });

/** Intl money from integer minor units. */
export function money(minor: number, currency: Cur): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export const pct = (v: number): string => `${(v <= 1 ? v * 100 : v).toFixed(1)}%`;

export const planCode = (p: TenantRow['plan']): string => (typeof p === 'string' ? p : p?.code ?? '—');

export function usageItems(u: TenantRow['usage']): Required<UsageItem>[] {
  if (!u) return [];
  const list = Array.isArray(u) ? u : Object.entries(u).map(([meter, v]) => ({ ...v, meter }));
  return list.map((x) => ({ meter: x.meter ?? '', limit: x.limit, used: x.used }));
}

function qs(o: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/* ---------------- session / 2FA ---------------- */

export async function getMe(): Promise<Me> {
  // demo: the sample console is only reachable by opening #/platform/…
  if (await inDemo()) return { platform_admin: window.location.hash.startsWith('#/platform'), otp_required: false };
  return request<Me>('/auth/me/');
}

export interface TotpSetup {
  secret: string;
  otpauth_uri?: string;
  otpauth_url?: string;
  provisioning_uri?: string;
}

export const totpSetup = async () =>
  (await inDemo()) ? demoFail<TotpSetup>() : attempt(() => request<TotpSetup>('/platform/2fa/setup/', post()));

/** The code is posted once and never stored. */
export const totpConfirm = async (code: string) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/platform/2fa/confirm/', post({ code })));

export const totpVerify = async (code: string) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/platform/2fa/verify/', post({ code })));

/* ---------------- demo data ---------------- */

const months = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - (11 - i));
  return d.toISOString().slice(0, 7);
});
const DEMO_OVERVIEW: Overview = {
  mrr: { INR: 18_450_000, USD: 120_000, inr_equivalent: 28_530_000 },
  arr_inr_equivalent: 342_360_000,
  counts: { active: 42, pending: 6, past_due: 3, canceled: 9 },
  signups_7d: 11,
  signups_30d: 47,
  conversion_30d: 0.28,
  churn_30d: 0.04,
  refunds_30d: { count: 2, amount_inr_equivalent: 598_000 },
  revenue_12m: months.map((month, i) => ({ month, inr_equivalent: 9_000_000 + i * 1_750_000 })),
};
const DEMO_TENANTS: TenantRow[] = [
  { id: 1, workspace: 'Acme Digital', owner_email: 'owner@acme.example', plan: 'business', status: 'active', period_end: new Date(Date.now() + 20 * 864e5).toISOString(), usage: [{ meter: 'leads', limit: 2000, used: 312 }, { meter: 'emails', limit: -1, used: 1180 }], country: 'IN', signup_source: 'google' },
  { id: 2, workspace: 'Northwind Co', owner_email: 'hi@northwind.example', plan: 'starter', status: 'past_due', period_end: null, usage: [{ meter: 'leads', limit: 500, used: 498 }], country: 'US', signup_source: 'direct' },
];
const emptyPage = <T,>(results: T[]): Page<T> => ({ count: results.length, next: null, previous: null, results });
const DEMO_MARKETING: Marketing = {
  signups_by_day: Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10), count: (i * 7) % 5 + 1 })),
  by_source: [{ source: 'google', count: 20, paid: 6 }, { source: 'direct', count: 14, paid: 4 }],
  by_campaign: [{ campaign: 'launch', count: 12, paid: 3 }],
  by_country: [{ country: 'IN', count: 30, paid: 9 }, { country: 'US', count: 8, paid: 2 }],
  funnel: { signups: 47, verified: 39, checkout_started: 21, paid: 13 },
  plan_mix: [{ plan: 'starter', count: 18 }, { plan: 'business', count: 20 }, { plan: 'scale', count: 4 }],
};
const DEMO_PLANS: PlanRow[] = [
  { code: 'business', name: 'Business', price_inr_month: 499900, price_usd_month: 5900, price_inr_year: 4999000, price_usd_year: 59000, limits: { leads: 2000, emails: 15000, mailboxes: 5, seats: 5 }, active: true },
];

/* ---------------- reads ---------------- */

export async function getOverview(): Promise<Overview> {
  if (await inDemo()) return DEMO_OVERVIEW;
  return request<Overview>('/platform/overview/');
}

export async function listTenants(q: TenantQuery): Promise<Page<TenantRow>> {
  if (await inDemo()) return emptyPage(DEMO_TENANTS);
  return request<Page<TenantRow>>(`/platform/tenants/${qs({ ...q })}`);
}

export async function getTenant(id: number | string): Promise<TenantRow> {
  if (await inDemo()) return DEMO_TENANTS.find((t) => t.id === id) ?? DEMO_TENANTS[0];
  return request<TenantRow>(`/platform/tenants/${id}/`);
}

export async function listPayments(page = 1): Promise<Page<PaymentRow>> {
  if (await inDemo()) return emptyPage<PaymentRow>([]);
  return request<Page<PaymentRow>>(`/platform/payments/${qs({ page })}`);
}

export async function listInvoices(page = 1): Promise<Page<InvoiceRow>> {
  if (await inDemo()) return emptyPage<InvoiceRow>([]);
  return request<Page<InvoiceRow>>(`/platform/invoices/${qs({ page })}`);
}

export async function getMarketing(): Promise<Marketing> {
  if (await inDemo()) return DEMO_MARKETING;
  return request<Marketing>('/platform/marketing/');
}

export async function listPlans(): Promise<PlanRow[]> {
  if (await inDemo()) return DEMO_PLANS;
  const r = await request<PlanRow[] | Page<PlanRow>>('/platform/plans/');
  return Array.isArray(r) ? r : r.results;
}

export async function listAudit(page = 1): Promise<Page<AuditRow>> {
  if (await inDemo()) return emptyPage<AuditRow>([]);
  return request<Page<AuditRow>>(`/platform/audit/${qs({ page })}`);
}

/* ---------------- writes ---------------- */

type TenantAction = 'suspend' | 'unsuspend' | 'extend' | 'change_plan';
export const tenantAction = async (id: number | string, action: TenantAction, body: Record<string, unknown>) =>
  (await inDemo())
    ? demoFail<unknown>()
    : attempt(() => request<unknown>(`/platform/tenants/${id}/${action}/`, post(body)));

export const refundPayment = async (id: number | string, amount: number, reason: string) =>
  (await inDemo())
    ? demoFail<unknown>()
    : attempt(() => request<unknown>(`/platform/payments/${id}/refund/`, post({ amount, reason })));

export const savePlan = async (p: PlanRow) =>
  (await inDemo()) ? demoFail<PlanRow>() : attempt(() => request<PlanRow>(`/platform/plans/${p.code}/`, put(p)));

/** Fetch printable HTML invoice (token header needed) and open it in a new tab. */
export async function viewPlatformInvoice(id: number | string): Promise<Result<true>> {
  if (await inDemo()) return demoFail();
  return attempt(async () => {
    const html = await requestText(`/platform/invoices/${id}/`);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true as const;
  });
}
