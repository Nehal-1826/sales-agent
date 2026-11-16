/**
 * Shared API module for the platform-admin pages ported from the WarmPulse
 * admin console (Users · Settings · Reports · Billing). Wire contract mirrors
 * the reference frontend 1:1 (snake_case, /admin/* routes).
 *
 * Parallel-stream policy: ADD ONLY — never rename or remove existing exports.
 *
 * Conventions (same as platform.ts): reads return data or throw (useAsync
 * renders the error), mutations return a Result; demo mode serves read-only
 * sample data and refuses writes; stub endpoints (404/501/503) soft-fail to
 * safe defaults instead of blanking the page.
 */
import { API_BASE_URL, attempt, downloadFile, inDemo, post, request } from './transport';
import type { Result } from './transport';
import { WarmupApiError, warmupGet, warmupSend } from './warmupApi';

/* ---------------- shared helpers ---------------- */

const DEMO_ONLY = 'Demo data is read-only. Connect to the live server to do that.';
const demoFail = <T,>(): Result<T> => ({ ok: false, error: DEMO_ONLY });

const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) });
const del = (): RequestInit => ({ method: 'DELETE' });

/** A stub endpoint the backend has not landed yet — show the fallback, not an error. */
function isSoftMissing(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return status === 404 || status === 501 || status === 503;
}

async function getOrFallback<T>(path: string, fallback: T): Promise<T> {
  try {
    return await request<T>(path);
  } catch (e) {
    if (isSoftMissing(e)) return fallback;
    throw e;
  }
}

function qs(o: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** POST that answers a file, not JSON (report exports). Token from the documented localStorage key. */
async function postBlob(path: string, body: unknown): Promise<Blob> {
  let token: string | null = null;
  try {
    token = localStorage.getItem('agentic-ai:token');
  } catch {
    /* storage unavailable */
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Token ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Export failed (${res.status}).`);
  return res.blob();
}

/** Client-side CSV download for tables assembled in the browser. */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const esc = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════ H4: admin users ═══════════════ */

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  /** Platform role; super_admins cannot be impersonated or bulk-selected. */
  role?: string;
  /** Null for users who haven't selected a plan yet. */
  plan: string | null;
  status: 'active' | 'suspended' | 'pending';
  mailbox_count: number;
  joined_at: string;
  last_seen_at?: string | null;
  warmth_sparkline?: number[];
  avatar_url?: string | null;
  is_sabotaged?: boolean;
}

export interface AdminUsersPageData {
  items: AdminUserRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface BulkPauseMailboxesRequest {
  /** Empty list = every client user (super admins are skipped server-side). */
  user_ids: string[];
  action: 'pause' | 'resume';
}

export interface BulkPauseMailboxesResponse {
  users_affected: number;
  mailboxes_updated: number;
  skipped_super_admin: number;
}

export interface SignupRatePoint {
  date: string;
  signups: number;
  cumulative?: number;
}

export interface PlanDistributionRow {
  plan: string;
  count: number;
  mrr?: number;
}

/* ═══════════════ H4: admin billing ═══════════════ */

export type PaymentStatus = 'succeeded' | 'pending' | 'failed' | 'refunded';

export interface AdminPayment {
  id: string;
  user_id: string;
  user_email: string;
  /** Display plan label (normalized from the wire plan_name). */
  plan: string;
  /** Display amount in major units (normalized from the wire amount_cents). */
  amount_usd: number;
  status: PaymentStatus;
  created_at: string;
  external_ref?: string | null;
  workspace_name?: string | null;
  amount_cents?: number;
  plan_name?: string | null;
  plan_id?: string | null;
  payment_method?: string | null;
}

export interface PaymentsListData {
  items: AdminPayment[];
  total: number;
  page: number;
  page_size: number;
  revenue_series?: { date: string; revenue_usd: number }[];
}

/** Admin plan catalogue row — distinct from the billing PlanRow in platform.ts. */
export interface AdminPlanRow {
  id: string;
  slug: string;
  name: string;
  price_monthly_usd: number;
  mailboxes_included: number;
  max_mailboxes: number;
  daily_email_cap?: number;
  features: string[];
  is_active: boolean;
  is_public: boolean;
  llm_token_cap?: number;
  sort_order: number;
}

export interface PaymentsQuery {
  status?: PaymentStatus;
  plan?: string;
  user_email?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

/* ═══════════════ H4: admin settings ═══════════════ */

export interface LlmSpendPoint {
  date: string;
  cost_usd: number;
}

export interface AdminSettings {
  google_oauth: { client_id_masked: string; configured: boolean };
  llm: {
    api_key_masked: string;
    configured: boolean;
    default_cap_tokens: number;
    spend_mtd_usd: number;
    spend_series: LlmSpendPoint[];
  };
  defaults: {
    ramp_day1: number;
    ramp_day7_target: number;
    human_delay_min_s: number;
    human_delay_max_s: number;
    email_from_display_name: string;
    reply_to: string;
    warmup_log_retention_days: number;
  };
  transactional_smtp: {
    host: string;
    port: number;
    username: string;
    from_addr: string;
    starttls: boolean;
    password_masked: string;
    configured: boolean;
    mode: 'admin' | 'env' | 'dry_run';
    env_host: string;
  };
  danger: { maintenance_mode: boolean };
}

export interface UpdateLlmPayload {
  api_key?: string;
  default_cap_tokens?: number;
}

export interface UpdateOauthPayload {
  client_id?: string;
  client_secret?: string;
}

export interface UpdateSmtpPayload {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from_addr?: string;
  starttls?: boolean;
}

export interface UpdateDefaultsPayload {
  ramp_day1?: number;
  ramp_day7_target?: number;
  human_delay_min_s?: number;
  human_delay_max_s?: number;
  email_from_display_name?: string;
  reply_to?: string;
  warmup_log_retention_days?: number;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
  detail?: string;
}

/* ═══════════════ H4: admin reports ═══════════════ */

export interface ReportTypeItem {
  key: string;
  label: string;
  description: string;
  available_columns: string[];
  default_columns: string[];
  has_money_metric: boolean;
}

export type GroupBy = 'none' | 'plan' | 'month' | 'region';
export type ExportFormat = 'csv' | 'pdf' | 'xlsx';
export type ReportCadence = 'daily' | 'weekly' | 'monthly';

export interface GenerateRequest {
  type: string;
  preset?: string | null;
  from_?: string | null;
  to_?: string | null;
  plan_filter?: string[];
  region_filter?: string[];
  status_filter?: string[];
  group_by?: GroupBy;
  columns?: string[];
  compare_previous?: boolean;
}

export interface SummaryItem {
  label: string;
  value: string;
  delta_pct?: number | null;
}

export interface GenerateResult {
  columns: string[];
  rows: Record<string, unknown>[];
  summary: SummaryItem[];
  estimated_rows: number;
}

export interface ExportRequest {
  type: string;
  preset?: string | null;
  from_?: string | null;
  to_?: string | null;
  plan_filter?: string[];
  region_filter?: string[];
  status_filter?: string[];
  group_by?: GroupBy;
  columns?: string[];
  format?: ExportFormat;
}

export interface ReportScheduleCreate {
  name: string;
  report_type: string;
  cadence: ReportCadence;
  recipients: string[];
  format?: ExportFormat;
  filters?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ReportScheduleUpdate {
  name?: string;
  cadence?: ReportCadence;
  recipients?: string[];
  format?: ExportFormat;
  filters?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ReportScheduleOut {
  id: string;
  name: string;
  report_type: string;
  cadence: ReportCadence;
  recipients: string[];
  format: ExportFormat;
  filters: Record<string, unknown>;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ═══════════════ demo data (read-only) ═══════════════ */

const DEMO_USERS: AdminUserRow[] = [
  { id: 'u1', email: 'owner@acme.example', name: 'Asha Rao', role: 'client', plan: 'business', status: 'active', mailbox_count: 5, joined_at: '2026-08-14T09:12:00Z', last_seen_at: new Date(Date.now() - 36e5).toISOString() },
  { id: 'u2', email: 'hi@northwind.example', name: 'Nikhil V', role: 'client', plan: 'starter', status: 'suspended', mailbox_count: 2, joined_at: '2026-09-02T14:40:00Z', last_seen_at: new Date(Date.now() - 12 * 864e5).toISOString() },
  { id: 'u3', email: 'ops@lumen.example', name: null, role: 'client', plan: null, status: 'pending', mailbox_count: 0, joined_at: new Date(Date.now() - 2 * 864e5).toISOString(), last_seen_at: null },
  { id: 'u4', email: 'root@warmpulse.example', name: 'Platform Root', role: 'super_admin', plan: 'agency', status: 'active', mailbox_count: 1, joined_at: '2026-01-05T08:00:00Z', last_seen_at: new Date().toISOString() },
];

const demoUsersPage = (): AdminUsersPageData => ({ items: DEMO_USERS, total: DEMO_USERS.length, page: 1, page_size: 100 });

const DEMO_SIGNUP_RATE: SignupRatePoint[] = Array.from({ length: 14 }, (_, i) => ({
  date: new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10),
  signups: (i * 3) % 4 + 1,
}));

const DEMO_PLAN_DIST: PlanDistributionRow[] = [
  { plan: 'Free', count: 18, mrr: 0 },
  { plan: 'Starter', count: 11, mrr: 290 },
  { plan: 'Pro', count: 6, mrr: 414 },
  { plan: 'Agency', count: 2, mrr: 398 },
];

const DEMO_ADMIN_PLANS: AdminPlanRow[] = [
  { id: 'p-free', slug: 'free', name: 'Free', price_monthly_usd: 0, mailboxes_included: 1, max_mailboxes: 1, features: ['warmup basics'], is_active: true, is_public: true, sort_order: 0 },
  { id: 'p-starter', slug: 'starter', name: 'Starter', price_monthly_usd: 29, mailboxes_included: 3, max_mailboxes: 3, features: ['warmup', 'reports'], is_active: true, is_public: true, sort_order: 1 },
  { id: 'p-pro', slug: 'pro', name: 'Pro', price_monthly_usd: 69, mailboxes_included: 10, max_mailboxes: 10, features: ['warmup', 'reports', 'priority support'], is_active: true, is_public: true, sort_order: 2 },
  { id: 'p-agency', slug: 'agency', name: 'Agency', price_monthly_usd: 199, mailboxes_included: 40, max_mailboxes: 100, features: ['everything', 'white-label'], is_active: true, is_public: true, sort_order: 3 },
];

const pay = (id: string, uid: string, email: string, plan: string, cents: number, status: PaymentStatus, daysAgo: number): AdminPayment => ({
  id,
  user_id: uid,
  user_email: email,
  plan,
  amount_usd: cents / 100,
  amount_cents: cents,
  status,
  created_at: new Date(Date.now() - daysAgo * 864e5).toISOString(),
});

const DEMO_PAYMENTS: AdminPayment[] = [
  pay('pay1', 'u1', 'owner@acme.example', 'business', 599900, 'succeeded', 3),
  pay('pay2', 'u1', 'owner@acme.example', 'business', 599900, 'succeeded', 33),
  pay('pay3', 'u2', 'hi@northwind.example', 'starter', 290000, 'refunded', 10),
  pay('pay4', 'u4', 'root@warmpulse.example', 'agency', 1990000, 'succeeded', 1),
  pay('pay5', 'u2', 'hi@northwind.example', 'starter', 290000, 'failed', 2),
  pay('pay6', 'u4', 'root@warmpulse.example', 'agency', 1990000, 'pending', 0),
];

const DEMO_SETTINGS: AdminSettings = {
  google_oauth: { client_id_masked: '1234••••.apps.googleusercontent.com', configured: true },
  llm: {
    api_key_masked: 'sk-•••••••7f2a',
    configured: true,
    default_cap_tokens: 100_000,
    spend_mtd_usd: 41.28,
    spend_series: Array.from({ length: 12 }, (_, i) => ({ date: new Date(Date.now() - (11 - i) * 864e5).toISOString().slice(0, 10), cost_usd: 1.2 + ((i * 7) % 5) * 0.4 })),
  },
  defaults: {
    ramp_day1: 5,
    ramp_day7_target: 40,
    human_delay_min_s: 30,
    human_delay_max_s: 300,
    email_from_display_name: 'Asha from WarmPulse',
    reply_to: 'reply@warmpulse.io',
    warmup_log_retention_days: 7,
  },
  transactional_smtp: {
    host: 'smtp.example.in',
    port: 587,
    username: 'alerts@warmpulse.io',
    from_addr: 'WarmPulse <alerts@warmpulse.io>',
    starttls: true,
    password_masked: '••••••••',
    configured: true,
    mode: 'admin',
    env_host: '',
  },
  danger: { maintenance_mode: false },
};

const DEMO_REPORT_TYPES: ReportTypeItem[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    description: 'Collected revenue by plan and month',
    available_columns: ['month', 'plan', 'payments', 'revenue', 'mrr'],
    default_columns: ['month', 'plan', 'payments', 'revenue'],
    has_money_metric: true,
  },
  {
    key: 'subscriber_growth',
    label: 'Subscriber growth',
    description: 'New signups vs paying conversions',
    available_columns: ['month', 'signups', 'verified', 'paid', 'conversion_pct'],
    default_columns: ['month', 'signups', 'paid', 'conversion_pct'],
    has_money_metric: false,
  },
  {
    key: 'deliverability',
    label: 'Deliverability',
    description: 'Inbox placement across the peer network',
    available_columns: ['month', 'sent', 'inbox_pct', 'spam_pct', 'reply_pct'],
    default_columns: ['month', 'sent', 'inbox_pct', 'reply_pct'],
    has_money_metric: false,
  },
];

const DEMO_SCHEDULES: ReportScheduleOut[] = [
  {
    id: 's1',
    name: 'Weekly revenue digest',
    report_type: 'revenue',
    cadence: 'weekly',
    recipients: ['root@warmpulse.example'],
    format: 'csv',
    filters: { preset: '7d' },
    enabled: true,
    next_run_at: new Date(Date.now() + 3 * 864e5).toISOString(),
    last_run_at: new Date(Date.now() - 4 * 864e5).toISOString(),
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
];

/* ═══════════════ reads ═══════════════ */

export async function listAdminUsers(filters?: {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
}): Promise<AdminUsersPageData> {
  if (await inDemo()) return demoUsersPage();
  return getOrFallback<AdminUsersPageData>(`/admin/users${qs({ ...filters })}`, {
    items: [],
    total: 0,
    page: filters?.page ?? 1,
    page_size: filters?.page_size ?? 25,
  });
}

export async function getAdminUser(id: string): Promise<AdminUserRow> {
  if (await inDemo()) return DEMO_USERS.find((u) => u.id === id) ?? DEMO_USERS[0]!;
  return request<AdminUserRow>(`/admin/users/${id}`);
}

export async function getAdminSignupRate(days = 30): Promise<SignupRatePoint[]> {
  if (await inDemo()) return DEMO_SIGNUP_RATE;
  return getOrFallback<SignupRatePoint[]>(`/admin/platform-analytics/signup-rate${qs({ days })}`, []);
}

export async function getAdminPlanDistribution(): Promise<PlanDistributionRow[]> {
  if (await inDemo()) return DEMO_PLAN_DIST;
  return getOrFallback<PlanDistributionRow[]>('/admin/platform-analytics/plan-distribution', []);
}

export async function listAdminPayments(filters?: PaymentsQuery): Promise<PaymentsListData> {
  if (await inDemo()) {
    const items = DEMO_PAYMENTS.filter((p) => (!filters?.status || p.status === filters.status) && (!filters?.plan || p.plan === filters.plan) && (!filters?.user_email || p.user_email.includes(filters.user_email)));
    return { items, total: items.length, page: filters?.page ?? 1, page_size: filters?.page_size ?? 200 };
  }
  return getOrFallback<PaymentsListData>(`/admin/payments${qs({ ...filters })}`, { items: [], total: 0, page: 1, page_size: 200 });
}

export async function listAdminPlans(): Promise<AdminPlanRow[]> {
  if (await inDemo()) return DEMO_ADMIN_PLANS;
  return getOrFallback<AdminPlanRow[]>('/admin/plans', []);
}

export async function getAdminSettings(): Promise<AdminSettings> {
  if (await inDemo()) return DEMO_SETTINGS;
  return getOrFallback<AdminSettings>('/admin/settings', {
    ...DEMO_SETTINGS,
    google_oauth: { client_id_masked: '', configured: false },
    llm: { ...DEMO_SETTINGS.llm, api_key_masked: '', configured: false, default_cap_tokens: 0, spend_mtd_usd: 0, spend_series: [] },
    transactional_smtp: { ...DEMO_SETTINGS.transactional_smtp, host: '', username: '', from_addr: '', password_masked: '', configured: false, mode: 'dry_run' as const, env_host: '' },
  });
}

export async function listAdminReportTypes(): Promise<ReportTypeItem[]> {
  if (await inDemo()) return DEMO_REPORT_TYPES;
  return getOrFallback<ReportTypeItem[]>('/admin/reports/types', []);
}

export async function listReportSchedules(): Promise<ReportScheduleOut[]> {
  if (await inDemo()) return DEMO_SCHEDULES;
  return getOrFallback<ReportScheduleOut[]>('/admin/reports/schedules', []);
}

/* ═══════════════ users writes ═══════════════ */

/** Suspend/unsuspend are audited platform actions. */
export const suspendAdminUser = async (id: string, suspended: boolean, reason: string) =>
  (await inDemo())
    ? demoFail<unknown>()
    : attempt(() => request<unknown>(`/admin/users/${id}/${suspended ? 'suspend' : 'unsuspend'}`, post({ reason })));

export const updateAdminUserPlan = async (userId: string, planId: string) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>(`/admin/users/${userId}/plan${qs({ plan_id: planId })}`, post()));

export const deleteAdminUser = async (id: string, reason: string) =>
  (await inDemo())
    ? demoFail<unknown>()
    : attempt(() => request<unknown>(`/admin/users/${id}`, { ...del(), body: JSON.stringify({ reason }) }));

/** Issue a short-lived impersonation token for a client user (30 min TTL server-side). */
export const impersonateAdminUser = async (id: string): Promise<Result<{ access_token: string }>> =>
  (await inDemo()) ? demoFail<{ access_token: string }>() : attempt(() => request<{ access_token: string }>(`/admin/users/${id}/impersonate`, post()));

export const bulkPauseMailboxes = async (payload: BulkPauseMailboxesRequest) =>
  (await inDemo()) ? demoFail<BulkPauseMailboxesResponse>() : attempt(() => request<BulkPauseMailboxesResponse>('/admin/users/bulk-pause-mailboxes', post(payload)));

/* ═══════════════ settings writes ═══════════════ */

export const updateAdminDefaults = async (payload: UpdateDefaultsPayload) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/admin/settings/defaults', patch(payload)));

export const updateAdminLlm = async (payload: UpdateLlmPayload) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/admin/settings/llm', patch(payload)));

export const updateAdminOauth = async (payload: UpdateOauthPayload) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/admin/settings/google-oauth', patch(payload)));

export const updateAdminSmtp = async (payload: UpdateSmtpPayload) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/admin/settings/transactional-smtp', patch(payload)));

export const toggleMaintenanceMode = async (enabled: boolean) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/admin/settings/maintenance', post({ enabled })));

export const rotateAdminLlmKey = async () =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/admin/settings/llm/rotate-key', post()));

export const resetPeerPoolHealth = async () =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>('/admin/settings/peer-pool/reset-health', post()));

const notAvailable = (): TestConnectionResult => ({ ok: false, error: 'not_available' });

export const testAdminLlm = async (): Promise<TestConnectionResult> => {
  if (await inDemo()) return { ok: true, detail: 'Demo: key is valid.' };
  try {
    return await request<TestConnectionResult>('/admin/settings/llm/test', post());
  } catch (e) {
    if (isSoftMissing(e)) return notAvailable();
    throw e;
  }
};

export const testAdminOauth = async (): Promise<TestConnectionResult> => {
  if (await inDemo()) return { ok: true, detail: 'Demo: OAuth reachable.' };
  try {
    return await request<TestConnectionResult>('/admin/settings/google-oauth/test', post());
  } catch (e) {
    if (isSoftMissing(e)) return notAvailable();
    throw e;
  }
};

export const testAdminSmtp = async (): Promise<TestConnectionResult> => {
  if (await inDemo()) return { ok: true, detail: 'Demo: test email would be sent.' };
  try {
    return await request<TestConnectionResult>('/admin/settings/transactional-smtp/test', post());
  } catch (e) {
    if (isSoftMissing(e)) return notAvailable();
    throw e;
  }
};

/* ═══════════════ reports writes ═══════════════ */

/** Generate an in-app preview of a report (never downloads anything). */
export async function generateReport(body: GenerateRequest): Promise<GenerateResult> {
  if (await inDemo()) {
    return {
      columns: ['month', 'value', 'delta_pct'],
      rows: DEMO_SIGNUP_RATE.slice(0, 6).map((p) => ({ month: p.date.slice(0, 7), value: p.signups * 37, delta_pct: `+${p.signups}%` })),
      summary: [
        { label: 'Total', value: '₹1,84,500' },
        { label: 'Payments', value: '42' },
        { label: 'Avg / payment', value: '₹4,393', delta_pct: 3.2 },
      ],
      estimated_rows: 173,
    };
  }
  return request<GenerateResult>('/admin/reports/generate', post(body));
}

/** POST the export and hand the returned file to the browser. */
export async function exportReport(body: ExportRequest, filename: string): Promise<Result<true>> {
  if (await inDemo()) return demoFail();
  return attempt(async () => {
    const blob = await postBlob('/admin/reports/export', body);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return true as const;
  });
}

export const createReportSchedule = async (body: ReportScheduleCreate) =>
  (await inDemo()) ? demoFail<ReportScheduleOut>() : attempt(() => request<ReportScheduleOut>('/admin/reports/schedules', post(body)));

export const updateReportSchedule = async (id: string, payload: ReportScheduleUpdate) =>
  (await inDemo()) ? demoFail<ReportScheduleOut>() : attempt(() => request<ReportScheduleOut>(`/admin/reports/schedules/${id}`, patch(payload)));

export const deleteReportSchedule = async (id: string) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>(`/admin/reports/schedules/${id}`, del()));

/** Server-rendered payments CSV (token header included by downloadFile). */
export async function exportPaymentsCsv(filters?: PaymentsQuery): Promise<Result<true>> {
  if (await inDemo()) return demoFail();
  return attempt(() => downloadFile(`/admin/payments/export.csv${qs({ ...filters })}`, 'payments.csv').then(() => true as const));
}

/* ═══════════════ H1: system health / addons / mail viewer / revenge ═══════════════
 *
 * These four live on the WarmPulse FastAPI backend (backend/app/api/routes/
 * admin_system_health.py · admin_addons.py · admin_mail_viewer.py ·
 * admin_revenge.py) and are reached through the /wp-api bridge JWT from
 * warmupApi.ts — the Django gateway only fronts /api/*. The bridge mints a
 * super_admin role for platform admins, so require_super_admin passes.
 * Same read/write contract as above: reads throw (or soft-fail on stubbed
 * 404/501/503), writes fold into a Result, demo mode is read-only.
 */

const isBridgeSoftMissing = (e: unknown): boolean =>
  e instanceof WarmupApiError && (e.status === 404 || e.status === 501 || e.status === 503);

async function bridgeGetOrFallback<T>(path: string, fallback: T): Promise<T> {
  if (await inDemo()) return fallback;
  try {
    return await warmupGet<T>(path);
  } catch (e) {
    if (isBridgeSoftMissing(e)) return fallback;
    throw e;
  }
}

/* ---------------- H1: system health ---------------- */

export interface QueueSparkPoint {
  t: string;
  value: number;
}

export interface QueueMetrics {
  celery_depth: number;
  beat_delay_s: number;
  redis_ops_per_s: number;
  celery_depth_series: QueueSparkPoint[];
  /** Raw beat delay / redis ops samples (last 60) — not spark-point shaped. */
  beat_delay_series: number[];
  redis_ops_series: number[];
  per_queue?: Record<string, number>;
}

export type WorkerStatus = 'idle' | 'busy' | 'offline' | 'error';

export interface WorkerRow {
  id: string;
  host: string;
  status: WorkerStatus;
  last_heartbeat: string;
  current_task: string | null;
}

export interface DeliveryPoint {
  t: string;
  smtp_send: number;
  imap_fetch: number;
  error_rate: number;
}

export interface LatencyPoint {
  t: string;
  p50: number;
  p95: number;
  p99: number;
}

export interface LatencyBundle {
  api_p50: number;
  api_p95: number;
  api_p99: number;
  series: LatencyPoint[];
}

export interface ErrorTypeRow {
  type: string;
  count: number;
}

export interface SystemHealthBundle {
  queues: QueueMetrics;
  workers: WorkerRow[];
  delivery_rates: DeliveryPoint[];
  latency: LatencyBundle;
  error_types: ErrorTypeRow[];
}

export const EMPTY_SYSTEM_HEALTH: SystemHealthBundle = {
  queues: {
    celery_depth: 0,
    beat_delay_s: 0,
    redis_ops_per_s: 0,
    celery_depth_series: [],
    beat_delay_series: [],
    redis_ops_series: [],
  },
  workers: [],
  delivery_rates: [],
  latency: { api_p50: 0, api_p95: 0, api_p99: 0, series: [] },
  error_types: [],
};

/** GET /api/admin/system-health — live telemetry; stubbed → all-zero bundle. */
export async function getSystemHealth(): Promise<SystemHealthBundle> {
  return bridgeGetOrFallback<SystemHealthBundle>('api/admin/system-health', EMPTY_SYSTEM_HEALTH);
}

/* ---------------- H1: add-on catalogue ---------------- */

/** AddonOut — `owned`/`price_display` are per-caller fields, unused here. */
export interface AddonRow {
  id: string;
  key: string;
  name: string;
  description: string;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
}

export interface AddonCreatePayload {
  key: string;
  name: string;
  description: string;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
}

export interface AddonUpdatePayload {
  name?: string;
  description?: string;
  price_cents?: number;
  is_active?: boolean;
  sort_order?: number;
}

export async function listAdminAddons(): Promise<AddonRow[]> {
  const rows = await bridgeGetOrFallback<AddonRow[]>('api/admin/addons', []);
  return Array.isArray(rows) ? rows : [];
}

export async function createAdminAddon(payload: AddonCreatePayload): Promise<Result<AddonRow>> {
  if (await inDemo()) return demoFail<AddonRow>();
  return attempt(() => warmupSend<AddonRow>('api/admin/addons', 'POST', payload));
}

export async function updateAdminAddon(id: string, payload: AddonUpdatePayload): Promise<Result<AddonRow>> {
  if (await inDemo()) return demoFail<AddonRow>();
  return attempt(() => warmupSend<AddonRow>(`api/admin/addons/${id}`, 'PATCH', payload));
}

/* ---------------- H1: mail viewer (read-only IMAP proxy) ---------------- */

export type MailViewerSource = 'mailbox' | 'peer';

export interface MailViewerAccount {
  source: MailViewerSource;
  id: string;
  email: string;
  provider: string;
  /** false for OAuth mailboxes — the backend IMAP proxy can't reach them yet. */
  imap_supported: boolean;
  /** Client mailbox owner (null for peers). */
  owner_email: string | null;
}

export interface MailViewerMessageSummary {
  /** IMAP UID (backend emits a number; string seq fallback). */
  uid: number | string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface MailViewerMessagesPage {
  folder: string;
  folders: string[];
  messages: MailViewerMessageSummary[];
}

export interface MailViewerMessageDetail {
  uid: number | string;
  folder: string;
  from: string;
  to: string;
  cc?: string | null;
  subject: string;
  date: string;
  /** Sanitized server-side before it ever reaches this client. */
  html_body?: string | null;
  text_body: string;
  headers: {
    message_id?: string | null;
    x_warmup_id?: string | null;
  };
}

export async function listMailViewerAccounts(): Promise<MailViewerAccount[]> {
  // Backend returns a bare array; {accounts: […]} accepted defensively too.
  const data = await bridgeGetOrFallback<MailViewerAccount[] | { accounts?: MailViewerAccount[] }>(
    'api/admin/mail-viewer/accounts',
    [],
  );
  const list = Array.isArray(data) ? data : (data.accounts ?? []);
  return list.filter((a): a is MailViewerAccount => !!a && typeof a.email === 'string');
}

/**
 * Newest-first summaries for one folder. Soft-missing (route absent) → empty
 * folder view so the page still renders; 400 (bad account) and 502 (IMAP
 * unreachable) rethrow so the page shows its error state.
 */
export async function listMailViewerMessages(
  source: MailViewerSource,
  accountId: string,
  folder: string,
  limit = 50,
): Promise<MailViewerMessagesPage> {
  if (await inDemo()) return { folder, folders: ['INBOX'], messages: [] };
  try {
    const data = await warmupGet<MailViewerMessagesPage | MailViewerMessageSummary[]>(
      `api/admin/mail-viewer/${source}/${accountId}/messages${qs({ folder, limit })}`,
    );
    if (Array.isArray(data)) return { folder, folders: ['INBOX'], messages: data };
    return {
      folder: typeof data.folder === 'string' ? data.folder : folder,
      folders: Array.isArray(data.folders) && data.folders.length > 0 ? data.folders : ['INBOX'],
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  } catch (e) {
    if (isBridgeSoftMissing(e)) return { folder, folders: ['INBOX'], messages: [] };
    throw e;
  }
}

export function getMailViewerMessage(
  source: MailViewerSource,
  accountId: string,
  folder: string,
  uid: number | string,
): Promise<MailViewerMessageDetail> {
  return warmupGet<MailViewerMessageDetail>(
    `api/admin/mail-viewer/${source}/${accountId}/message/${uid}${qs({ folder })}`,
  );
}

/* ---------------- H1: revenge activity (retention sabotage) ---------------- */

export type RevengeTrigger = 'auto_cancel_2h' | 'manual_admin';
export type RevengeStatus = 'pending' | 'completed' | 'failed' | 'no_candidates';

export interface RevengeEvent {
  id: string;
  user_id: string | null;
  user_email: string;
  workspace_id: string | null;
  trigger: RevengeTrigger;
  actor_user_id: string | null;
  status: RevengeStatus;
  candidates_count: number;
  moved_count: number;
  failed_count: number;
  detail: Record<string, unknown> | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface RevengeEventsResponse {
  items: RevengeEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface RevengeKpis {
  sabotaged_users: number;
  total_runs: number;
  total_moved: number;
  last_run_at: string | null;
}

export interface RevengeRecipient {
  email: string;
  /** Present for runs that captured per-peer results. */
  moved?: number;
  failed?: number;
  /** Present for reconstructed (historical) runs. */
  sent?: number;
}

export interface RevengeRecipientsResponse {
  /** 'run' = captured live; 'reconstructed' = derived from warmup history. */
  source: 'run' | 'reconstructed';
  recipients: RevengeRecipient[];
}

export interface SabotagedUser {
  id: string;
  email: string;
  display_name: string | null;
  workspace_id: string | null;
}

export interface RevengeEventFilters {
  status?: string;
  trigger?: string;
  q?: string;
}

export function getRevengeKpis(): Promise<RevengeKpis> {
  return bridgeGetOrFallback<RevengeKpis>('api/admin/revenge/kpis', {
    sabotaged_users: 0,
    total_runs: 0,
    total_moved: 0,
    last_run_at: null,
  });
}

export function listRevengeEvents(filters: RevengeEventFilters = {}): Promise<RevengeEventsResponse> {
  return bridgeGetOrFallback<RevengeEventsResponse>(
    `api/admin/revenge/events${qs({ limit: 100, offset: 0, ...filters })}`,
    { items: [], total: 0, limit: 100, offset: 0 },
  );
}

export function listSabotagedUsers(): Promise<SabotagedUser[]> {
  return bridgeGetOrFallback<SabotagedUser[]>('api/admin/revenge/sabotaged', []);
}

export function getRevengeRecipients(eventId: string): Promise<RevengeRecipientsResponse> {
  return warmupGet<RevengeRecipientsResponse>(`api/admin/revenge/events/${eventId}/recipients`);
}

export async function rerunRevenge(eventId: string): Promise<Result<unknown>> {
  if (await inDemo()) return demoFail<unknown>();
  return attempt(() => warmupSend<unknown>(`api/admin/revenge/events/${eventId}/rerun`, 'POST'));
}

/** Undo sabotage — reuses the admin users route (204 on success). */
export async function unsabotageUser(userId: string): Promise<Result<unknown>> {
  if (await inDemo()) return demoFail<unknown>();
  return attempt(() => warmupSend<unknown>(`api/admin/users/${userId}/unsabotage`, 'POST'));
}

/* ═══════════════ H3: peer inboxes (admin_peer_inboxes.py + admin_peer_pools.py) ═══════════════ */

export type PeerProvider = 'google_ws' | 'office365' | 'yahoo';

export interface PoolMembershipRef {
  pool_id: string;
  pool_name: string;
}

/** Wire PeerInboxOut — encrypted credentials never surface, only metadata. */
export interface PeerInboxRow {
  id: string;
  email: string;
  provider: PeerProvider;
  daily_capacity: number;
  sends_today: number;
  /** Trust score. Wire contract says 0..1; the backend also has a 0..100 variant — normalize before display. */
  reputation_score: number;
  is_active: boolean;
  last_used_at: string | null;
  pool_memberships: PoolMembershipRef[];
  pool_ids: string[];
  created_at: string;
}

export interface PeerInboxListData {
  items: PeerInboxRow[];
  page: number;
  page_size: number;
  total: number;
}

export interface PeerInboxByProviderRow {
  provider: string;
  count: number;
  active: number;
}

export interface PeerInboxStats {
  total: number;
  active: number;
  inactive: number;
  by_provider: PeerInboxByProviderRow[];
  avg_reputation: number;
  total_capacity: number;
  used_capacity_today: number;
  capacity_used_pct: number;
}

/** Wire PeerInboxCreate — carries SMTP + IMAP secrets; never logged. */
export interface PeerInboxCreateInput {
  email_address: string;
  provider: PeerProvider;
  smtp_host: string;
  smtp_port?: number;
  smtp_username: string;
  smtp_password: string;
  imap_host: string;
  imap_port?: number;
  imap_username: string;
  imap_password: string;
  daily_capacity?: number;
}

export interface PeerInboxUpdateInput {
  daily_capacity?: number;
  is_active?: boolean;
}

/** Wire BulkImportResult — succeeded count + per-row failures. */
export interface PeerBulkImportResult {
  succeeded: number;
  failed: { row: number; error: string }[];
}

export interface PeerTestResult {
  smtp_ok: boolean;
  imap_ok: boolean;
  smtp_error?: string | null;
  imap_error?: string | null;
}

export interface PeerPool {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  daily_send_limit: number | null;
  member_count: number;
  client_count: number;
  created_at: string;
}

export interface PeerPoolCreateInput {
  name: string;
  description?: string;
  is_default?: boolean;
  daily_send_limit?: number | null;
}

/** Multipart upload the JSON transport can't do — FormData sets its own boundary. */
async function postForm(path: string, form: FormData): Promise<PeerBulkImportResult> {
  let token: string | null = null;
  try {
    token = localStorage.getItem('agentic-ai:token');
  } catch {
    /* storage unavailable */
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Token ${token}` } : undefined,
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? '';
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `Import failed (${res.status}).`);
  }
  return (await res.json()) as PeerBulkImportResult;
}

const DEMO_PEER_POOLS: PeerPool[] = [
  { id: 'pool-a', name: 'Default network', description: 'Every helper not pinned elsewhere', is_default: true, daily_send_limit: null, member_count: 6, client_count: 9, created_at: '2026-06-01T09:00:00Z' },
  { id: 'pool-b', name: 'Enterprise · pool-B', description: 'Higher-trust helpers for paying customers', is_default: false, daily_send_limit: 4000, member_count: 3, client_count: 2, created_at: '2026-08-12T11:30:00Z' },
];

const DEMO_PEERS: PeerInboxRow[] = [
  { id: 'pe1', email: 'warmer.a@gmail.com', provider: 'google_ws', daily_capacity: 50, sends_today: 12, reputation_score: 0.92, is_active: true, last_used_at: new Date(Date.now() - 36e5).toISOString(), pool_memberships: [{ pool_id: 'pool-a', pool_name: 'Default network' }], pool_ids: ['pool-a'], created_at: '2026-07-02T10:00:00Z' },
  { id: 'pe2', email: 'helper.b@outlook.com', provider: 'office365', daily_capacity: 40, sends_today: 38, reputation_score: 0.61, is_active: true, last_used_at: new Date(Date.now() - 9 * 36e5).toISOString(), pool_memberships: [{ pool_id: 'pool-b', pool_name: 'Enterprise · pool-B' }], pool_ids: ['pool-b'], created_at: '2026-05-18T10:00:00Z' },
  { id: 'pe3', email: 'helper.c@yahoo.com', provider: 'yahoo', daily_capacity: 30, sends_today: 0, reputation_score: 0.44, is_active: false, last_used_at: null, pool_memberships: [], pool_ids: [], created_at: '2026-09-01T10:00:00Z' },
];

const DEMO_PEER_STATS: PeerInboxStats = {
  total: 3,
  active: 2,
  inactive: 1,
  by_provider: [
    { provider: 'google_ws', count: 1, active: 1 },
    { provider: 'office365', count: 1, active: 1 },
    { provider: 'yahoo', count: 1, active: 0 },
  ],
  avg_reputation: 0.66,
  total_capacity: 120,
  used_capacity_today: 50,
  capacity_used_pct: 41.7,
};

export async function listPeerInboxes(filters?: { page?: number; page_size?: number; provider?: string; is_active?: boolean }): Promise<PeerInboxListData> {
  if (await inDemo()) return { items: DEMO_PEERS, page: 1, page_size: 100, total: DEMO_PEERS.length };
  const boolStr = filters?.is_active === undefined ? undefined : String(filters.is_active);
  return getOrFallback<PeerInboxListData>(`/admin/peer-inboxes${qs({ page: filters?.page, page_size: filters?.page_size, provider: filters?.provider, is_active: boolStr })}`, { items: [], page: 1, page_size: 100, total: 0 });
}

export async function getPeerInboxStats(): Promise<PeerInboxStats> {
  if (await inDemo()) return DEMO_PEER_STATS;
  return getOrFallback<PeerInboxStats>('/admin/peer-inboxes/stats', { total: 0, active: 0, inactive: 0, by_provider: [], avg_reputation: 0, total_capacity: 0, used_capacity_today: 0, capacity_used_pct: 0 });
}

export const createPeerInbox = async (input: PeerInboxCreateInput) =>
  (await inDemo()) ? demoFail<PeerInboxRow>() : attempt(() => request<PeerInboxRow>('/admin/peer-inboxes', post(input)));

/** CSV columns: email, provider, daily_capacity, smtp_host, smtp_port, smtp_username, smtp_password, imap_host, imap_port, imap_username, imap_password. */
export async function bulkImportPeerInboxes(file: File): Promise<Result<PeerBulkImportResult>> {
  if (await inDemo()) return demoFail();
  return attempt(async () => {
    const form = new FormData();
    form.append('file', file);
    return postForm('/admin/peer-inboxes/bulk', form);
  });
}

export const updatePeerInbox = async (id: string, payload: PeerInboxUpdateInput) =>
  (await inDemo()) ? demoFail<PeerInboxRow>() : attempt(() => request<PeerInboxRow>(`/admin/peer-inboxes/${id}`, patch(payload)));

export const deletePeerInbox = async (id: string) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>(`/admin/peer-inboxes/${id}`, del()));

/** Zero this helper's used_today counter without waiting for the daily 00:01 UTC reset. */
export const resetPeerCapacity = async (id: string) =>
  (await inDemo()) ? demoFail<PeerInboxRow>() : attempt(() => request<PeerInboxRow>(`/admin/peer-inboxes/${id}/reset-capacity`, post()));

/** Zero used_today across the whole network — answers { peers_reset }. */
export const resetAllPeerCapacity = async () =>
  (await inDemo()) ? demoFail<{ peers_reset: number }>() : attempt(() => request<{ peers_reset: number }>('/admin/peer-inboxes/reset-capacity', post()));

export async function testPeerConnection(id: string): Promise<PeerTestResult> {
  if (await inDemo()) return { smtp_ok: true, imap_ok: true };
  try {
    return await request<PeerTestResult>(`/admin/peer-inboxes/${id}/test-connection`, post());
  } catch (e) {
    if (isSoftMissing(e)) return { smtp_ok: false, imap_ok: false, smtp_error: 'not_available', imap_error: 'not_available' };
    throw e;
  }
}

export async function listPeerPools(): Promise<PeerPool[]> {
  if (await inDemo()) return DEMO_PEER_POOLS;
  const data = await getOrFallback<PeerPool[] | { items: PeerPool[] }>('/admin/peer-pools', []);
  return Array.isArray(data) ? data : data.items ?? [];
}

export const createPeerPool = async (input: PeerPoolCreateInput) =>
  (await inDemo()) ? demoFail<PeerPool>() : attempt(() => request<PeerPool>('/admin/peer-pools', post(input)));

export const addPeerPoolMembers = async (poolId: string, peerInboxIds: string[]) =>
  (await inDemo()) ? demoFail<{ added: number; already_member: number }>() : attempt(() => request<{ added: number; already_member: number }>(`/admin/peer-pools/${poolId}/members`, post({ peer_inbox_ids: peerInboxIds })));

export const removePeerPoolMember = async (poolId: string, peerInboxId: string) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>(`/admin/peer-pools/${poolId}/members/${peerInboxId}`, del()));

/* ═══════════════ H3: pool routing (admin_pool_routing.py) ═══════════════ */

export interface PoolAssignment {
  workspace_id: string;
  user_id: string | null;
  client_email: string;
  client_plan: string | null;
  pool_id: string;
  pool_name: string;
  assigned_at: string;
  sends_last_30d: number;
}

export interface PoolAssignmentListData {
  items: PoolAssignment[];
  page: number;
  page_size: number;
  total: number;
}

export interface UnassignedClient {
  workspace_id: string;
  user_id: string;
  email: string;
  plan: string | null;
  sends_last_30d: number;
}

/** A client mailbox in the routing table: own pin (pool_id) + resolved effective pool. */
export interface RoutingMailboxRow {
  id: string;
  email: string;
  provider: string;
  workspace_id: string;
  plan_name: string | null;
  pool_id: string | null;
  effective_pool_id: string | null;
  sends_last_30d: number;
  can_send: boolean;
  is_oauth: boolean;
}

export interface SankeyNode {
  id: string;
  name: string;
  type: 'pool' | 'client';
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export async function listPoolAssignments(filters?: { page?: number; page_size?: number; search?: string }): Promise<PoolAssignmentListData> {
  if (await inDemo()) {
    const items: PoolAssignment[] = [
      { workspace_id: 'ws1', user_id: 'u1', client_email: 'owner@acme.example', client_plan: 'business', pool_id: 'pool-b', pool_name: 'Enterprise · pool-B', assigned_at: '2026-09-10T08:00:00Z', sends_last_30d: 8400 },
      { workspace_id: 'ws2', user_id: 'u2', client_email: 'hi@northwind.example', client_plan: 'starter', pool_id: 'pool-a', pool_name: 'Default network', assigned_at: '2026-10-02T08:00:00Z', sends_last_30d: 2100 },
    ];
    return { items, page: 1, page_size: 100, total: items.length };
  }
  return getOrFallback<PoolAssignmentListData>(`/admin/pool-routing${qs({ page: filters?.page, page_size: filters?.page_size, search: filters?.search })}`, { items: [], page: 1, page_size: 100, total: 0 });
}

export async function listUnassignedClients(): Promise<UnassignedClient[]> {
  if (await inDemo()) return [{ workspace_id: 'ws3', user_id: 'u3', email: 'ops@lumen.example', plan: null, sends_last_30d: 40 }];
  const data = await getOrFallback<UnassignedClient[] | { items: UnassignedClient[] }>('/admin/pool-routing/clients/unassigned', []);
  return Array.isArray(data) ? data : data.items ?? [];
}

export async function listRoutingMailboxes(): Promise<RoutingMailboxRow[]> {
  if (await inDemo()) {
    return [
      { id: 'mb1', email: 'asha@acme.example', provider: 'gmail', workspace_id: 'ws1', plan_name: 'business', pool_id: null, effective_pool_id: 'pool-b', sends_last_30d: 5100, can_send: true, is_oauth: true },
      { id: 'mb2', email: 'team@northwind.example', provider: 'smtp', workspace_id: 'ws2', plan_name: 'starter', pool_id: null, effective_pool_id: 'pool-a', sends_last_30d: 2100, can_send: false, is_oauth: false },
    ];
  }
  const data = await getOrFallback<RoutingMailboxRow[] | { items: RoutingMailboxRow[] }>('/admin/pool-routing/mailboxes', []);
  return Array.isArray(data) ? data : data.items ?? [];
}

/** Pin (pool_id) or unpin (null → inherit workspace routing) a single mailbox. */
export const pinRoutingMailbox = async (mailboxId: string, poolId: string | null) =>
  (await inDemo()) ? demoFail<RoutingMailboxRow>() : attempt(() => request<RoutingMailboxRow>(`/admin/pool-routing/mailboxes/${mailboxId}`, post({ pool_id: poolId })));

/** Pin a workspace to a pool (upsert). */
export const upsertPoolAssignment = async (workspaceId: string, poolId: string) =>
  (await inDemo()) ? demoFail<PoolAssignment>() : attempt(() => request<PoolAssignment>('/admin/pool-routing', post({ workspace_id: workspaceId, pool_id: poolId })));

/** Remove the pin — the workspace falls back to the default pool. */
export const revertPoolAssignment = async (workspaceId: string) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>(`/admin/pool-routing${qs({ workspace_id: workspaceId })}`, del()));

export async function getRoutingSankey(): Promise<SankeyData> {
  if (await inDemo()) {
    return {
      nodes: [
        { id: 'pool-a', name: 'Default network', type: 'pool' },
        { id: 'pool-b', name: 'Enterprise · pool-B', type: 'pool' },
        { id: 'ws1', name: 'owner@acme.example', type: 'client' },
        { id: 'ws2', name: 'hi@northwind.example', type: 'client' },
      ],
      links: [
        { source: 'ws1', target: 'pool-b', value: 8400 },
        { source: 'ws2', target: 'pool-a', value: 2100 },
      ],
    };
  }
  return getOrFallback<SankeyData>('/admin/pool-routing/sankey-data', { nodes: [], links: [] });
}

/* ═══════════════ H3: platform mail (platform_mail.py — IMAP client for the platform account) ═══════════════ */

export interface PlatformMailFolders {
  folders: string[];
  unread: Record<string, number>;
}

export interface PlatformMailSummary {
  uid: number;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  seen: boolean;
  starred: boolean;
}

export interface PlatformMailListData {
  folder: string;
  folders: string[];
  messages: PlatformMailSummary[];
}

export interface PlatformMailAttachment {
  /** IMAP part path — the fetch/download address for this part. */
  part: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface PlatformMailDetail {
  uid: number;
  from: string;
  to: string;
  cc?: string | null;
  subject: string;
  date: string;
  text_body: string;
  /** Sanitized server-side; rendered in a sandboxed iframe. */
  html_body?: string | null;
  attachments: PlatformMailAttachment[];
  headers: {
    message_id?: string | null;
    in_reply_to?: string | null;
    references?: string | null;
  };
  seen: boolean;
  starred: boolean;
}

export interface PlatformMailSendAttachment {
  filename: string;
  content_type?: string;
  /** Raw file bytes, base64 (no data: prefix). */
  content_b64: string;
}

export interface PlatformMailSendInput {
  to: string;
  cc?: string;
  subject: string;
  body_text: string;
  body_html?: string;
  in_reply_to?: string;
  references?: string;
  attachments?: PlatformMailSendAttachment[];
}

export interface PlatformMailSendResult {
  status: string;
  to: string;
  message_id: string;
}

/** Human copy for a messages-load failure: 502 = IMAP dead, 400 = backend detail. */
export function describePlatformMailError(e: unknown, fallback: string): string {
  const status = (e as { status?: number })?.status;
  if (status === 502) return 'IMAP is unreachable for the platform account — check the transactional SMTP/IMAP settings.';
  if (status === 400) return (e as { message?: string })?.message || 'This folder cannot be viewed over IMAP.';
  return (e as { message?: string })?.message || fallback;
}

export async function getPlatformMailFolders(): Promise<PlatformMailFolders> {
  if (await inDemo()) return { folders: ['INBOX', 'Sent', 'Trash'], unread: { INBOX: 2 } };
  const data = await getOrFallback<PlatformMailFolders>('/admin/platform-mail/folders', { folders: [], unread: {} });
  return {
    folders: Array.isArray(data.folders) ? data.folders : [],
    unread: data.unread && typeof data.unread === 'object' && !Array.isArray(data.unread) ? data.unread : {},
  };
}

export async function getPlatformMailMessages(folder: string, search = ''): Promise<PlatformMailListData> {
  if (await inDemo()) {
    const all: PlatformMailSummary[] = [
      { uid: 51, from: 'notifications@stripe.com', to: 'platform@warmpulse.io', subject: 'Payout scheduled', date: new Date(Date.now() - 18 * 60_000).toISOString(), snippet: 'The payout is expected to arrive on Friday.', seen: false, starred: false },
      { uid: 50, from: 'maria@brightlabs.io', to: 'platform@warmpulse.io', subject: 'Partnership intro', date: new Date(Date.now() - 26 * 36e5).toISOString(), snippet: 'Open to a partnership call Thursday?', seen: true, starred: true },
    ];
    const q = search.trim().toLowerCase();
    const hits = q ? all.filter((m) => `${m.subject} ${m.from} ${m.snippet}`.toLowerCase().includes(q)) : all;
    return { folder, folders: ['INBOX', 'Sent', 'Trash'], messages: hits };
  }
  const data = await getOrFallback<PlatformMailListData>(`/admin/platform-mail/messages${qs({ folder, limit: 50, search: search || undefined })}`, { folder, folders: ['INBOX'], messages: [] });
  return {
    folder: typeof data.folder === 'string' ? data.folder : folder,
    folders: Array.isArray(data.folders) && data.folders.length > 0 ? data.folders : ['INBOX'],
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
}

/** Fetching marks the message seen server-side (our own account). IMAP is slow — 30s timeout. */
export async function getPlatformMailMessage(folder: string, uid: number): Promise<PlatformMailDetail> {
  if (await inDemo()) {
    return {
      uid,
      from: 'notifications@stripe.com',
      to: 'platform@warmpulse.io',
      cc: null,
      subject: 'Payout scheduled',
      date: new Date(Date.now() - 18 * 60_000).toISOString(),
      text_body: 'The payout is expected to arrive on Friday.',
      html_body: '<p>The payout is expected to arrive on <strong>Friday</strong>.</p>',
      attachments: [],
      headers: { message_id: '<payout-51@stripe.com>' },
      seen: true,
      starred: false,
    };
  }
  return request<PlatformMailDetail>(`/admin/platform-mail/message/${uid}${qs({ folder })}`, undefined, 30_000);
}

export const sendPlatformMail = async (input: PlatformMailSendInput) =>
  (await inDemo()) ? demoFail<PlatformMailSendResult>() : attempt(() => request<PlatformMailSendResult>('/admin/platform-mail/send', post(input), 30_000));

export const setPlatformMailSeen = async (folder: string, uid: number, seen: boolean) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>(`/admin/platform-mail/${uid}/seen${qs({ folder, seen: String(seen) })}`, post()));

export const setPlatformMailStar = async (folder: string, uid: number, starred: boolean) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>(`/admin/platform-mail/${uid}/star${qs({ folder, starred: String(starred) })}`, post()));

export const deletePlatformMail = async (folder: string, uid: number) =>
  (await inDemo()) ? demoFail<unknown>() : attempt(() => request<unknown>(`/admin/platform-mail/${uid}${qs({ folder })}`, del()));

/** Download one attachment part (token header via downloadFile; server sets Content-Disposition). */
export async function downloadPlatformMailAttachment(folder: string, uid: number, part: string, filename: string): Promise<Result<true>> {
  if (await inDemo()) return demoFail();
  return attempt(() => downloadFile(`/admin/platform-mail/${uid}/attachment/${encodeURIComponent(part)}${qs({ folder })}`, filename).then(() => true as const));
}

/* ═══════════════ H2: LLM usage · CRM · platform analytics ═══════════════
 *
 * All three live on the WarmPulse FastAPI backend (backend/app/api/routes/
 * admin_llm_usage.py · admin_crm.py · admin_platform_analytics.py), reached
 * through the /wp-api bridge JWT exactly like the H1 routes above. Wire
 * shapes mirror those routers 1:1; the few fields the pages need in a
 * friendlier unit (CRM rates as percent, MRR in dollars, warmth bin labels)
 * are normalized here so the pages never touch raw wire data.
 */

/* ---------------- H2: LLM usage (spec §6) ---------------- */

export interface LlmModeCounts {
  A: number;
  B: number;
  C: number;
  D: number;
}

export interface LlmPerUserSummary {
  user_id: string;
  email: string;
  plan: string | null;
  tokens_mtd: number;
  cost_cents_mtd: number;
  cap: number;
  /** 0–100 */
  pct_used: number;
}

export interface LlmUsageSummary {
  total_tokens_mtd: number;
  total_cost_cents_mtd: number;
  forecast_eom_cents: number;
  by_user: LlmPerUserSummary[];
  by_mode: LlmModeCounts;
}

/** One usage event, wire shape of LlmUsageRow (schemas/llm_usage.py). */
export interface LlmUsageEvent {
  id: number;
  user_id: string;
  user_email: string | null;
  plan_name: string | null;
  mailbox_id: string | null;
  mode: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_cents: number;
  created_at: string;
}

export interface LlmUsageEventsPage {
  items: LlmUsageEvent[];
  page: number;
  page_size: number;
  total: number;
}

export interface LlmTimeSeriesPoint {
  date: string;
  tokens: number;
  cost_cents: number;
}

export interface LlmPerUserDetail {
  user_id: string;
  email: string;
  plan: string | null;
  tokens_mtd: number;
  cost_cents_mtd: number;
  cap: number;
  pct_used: number;
  time_series: { points: LlmTimeSeriesPoint[] };
  by_mode: LlmModeCounts;
}

/** Plan catalogue row — only the fields the LLM cap manager needs (GET /api/plans/all). */
export interface LlmPlanCapRow {
  plan_id: string;
  name: string;
  cap_tokens: number;
  is_active: boolean;
}

const EMPTY_LLM_SUMMARY: LlmUsageSummary = {
  total_tokens_mtd: 0,
  total_cost_cents_mtd: 0,
  forecast_eom_cents: 0,
  by_user: [],
  by_mode: { A: 0, B: 0, C: 0, D: 0 },
};

/** GET /api/admin/llm-usage/summary — month-to-date totals, per-user rollup, mode split, EOM forecast. */
export async function getLlmUsageSummary(): Promise<LlmUsageSummary> {
  return bridgeGetOrFallback<LlmUsageSummary>('api/admin/llm-usage/summary', EMPTY_LLM_SUMMARY);
}

/** GET /api/admin/llm-usage — raw usage events, newest first, filterable. */
export async function getLlmUsageEvents(q: {
  page?: number;
  page_size?: number;
  user_id?: string;
  mode?: string;
  from?: string;
  to?: string;
} = {}): Promise<LlmUsageEventsPage> {
  return bridgeGetOrFallback<LlmUsageEventsPage>(
    `api/admin/llm-usage${qs({ ...q })}`,
    { items: [], page: q.page ?? 1, page_size: q.page_size ?? 50, total: 0 },
  );
}

/** GET /api/admin/llm-usage/by-user/{id} — daily token/cost series for the drill-in drawer. */
export function getLlmUsageByUser(userId: string): Promise<LlmPerUserDetail> {
  return warmupGet<LlmPerUserDetail>(`api/admin/llm-usage/by-user/${userId}`);
}

/** GET /api/plans/all — plan ids + token caps so cap edits can address the right row. */
export async function getLlmPlanCaps(): Promise<LlmPlanCapRow[]> {
  const rows = await bridgeGetOrFallback<Array<Record<string, unknown>>>('api/plans/all', []);
  return rows
    .filter((r) => !!r && typeof r === 'object' && r.id != null)
    .map((r) => ({
      plan_id: String(r.id),
      name: typeof r.name === 'string' ? r.name : '—',
      cap_tokens: typeof r.token_cap_per_month === 'number' ? r.token_cap_per_month : 0,
      is_active: r.is_active !== false,
    }));
}

/**
 * POST /api/admin/llm-usage/caps/{plan_id} — sets Plan.token_cap_per_month
 * for every workspace on that plan (audited server-side). The wire field is
 * `token_cap_per_month`, NOT the reference client's `cap_tokens`.
 */
export const updateLlmPlanCap = async (
  planId: string,
  tokenCap: number,
): Promise<Result<{ plan_id: string; token_cap_per_month: number }>> => {
  if (await inDemo()) return demoFail<{ plan_id: string; token_cap_per_month: number }>();
  return attempt(() =>
    warmupSend<{ plan_id: string; token_cap_per_month: number }>(
      `api/admin/llm-usage/caps/${planId}`,
      'POST',
      { token_cap_per_month: tokenCap },
    ),
  );
};

/* ---------------- H2: admin CRM (cross-workspace) ---------------- */

export interface AdminCrmCampaignRow {
  id: string;
  name: string;
  leads: number;
  status: string;
}

export interface AdminCrmSequenceRow {
  id: string;
  name: string;
  /** "active" | "paused" | "archived" */
  status: string;
  paused: boolean;
  /** active enrollments */
  enrolled: number;
  open_rate: number;
  reply_rate: number;
}

export interface AdminCrmRecentActivity {
  kind: string;
  lead_label: string;
  at: string;
}

export interface AdminCrmWorkspaceRow {
  workspace_id: string;
  name: string;
  plan: string | null;
  owner_email: string;
  campaigns: number;
  leads: number;
  sequences_active: number;
  sequences_paused: number;
  active_enrollments: number;
  /** percent 0–100 (wire fraction normalized) */
  open_rate: number;
  reply_rate: number;
  last_activity_at: string | null;
}

export interface AdminCrmOverview {
  total_campaigns: number;
  total_leads: number;
  sequences_active: number;
  sequences_paused: number;
  active_enrollments: number;
  emails_sent_30d: number;
  open_rate: number;
  reply_rate: number;
  workspaces: AdminCrmWorkspaceRow[];
}

export interface AdminCrmWorkspaceDetail extends AdminCrmWorkspaceRow {
  campaign_list: AdminCrmCampaignRow[];
  sequence_list: AdminCrmSequenceRow[];
  recent_activities: AdminCrmRecentActivity[];
}

export interface SequenceStatusOut {
  id: string;
  name: string;
  status: string;
  paused: boolean;
}

/** Wire rates are fractions (0–1); a value already in 0–100 is left as-is. */
function crmRate(v: unknown): number {
  const n = typeof v === 'number' ? v : 0;
  return n > 0 && n <= 1 ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100;
}

function crmWorkspace(raw: Record<string, unknown>): AdminCrmWorkspaceRow {
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  return {
    workspace_id: typeof raw.workspace_id === 'string' ? raw.workspace_id : String(raw.workspace_id ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    plan: typeof raw.plan === 'string' ? raw.plan : null,
    owner_email: typeof raw.owner_email === 'string' ? raw.owner_email : '',
    campaigns: num(raw.campaigns),
    leads: num(raw.leads),
    sequences_active: num(raw.sequences_active),
    sequences_paused: num(raw.sequences_paused),
    active_enrollments: num(raw.active_enrollments),
    open_rate: crmRate(raw.open_rate),
    reply_rate: crmRate(raw.reply_rate),
    last_activity_at: typeof raw.last_activity_at === 'string' ? raw.last_activity_at : null,
  };
}

/** GET /api/admin/crm/overview — totals + one row per workspace with CRM data. */
export async function getAdminCrmOverview(): Promise<AdminCrmOverview> {
  const raw = await bridgeGetOrFallback<Record<string, unknown>>('api/admin/crm/overview', {});
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const list = Array.isArray(raw.workspaces)
    ? raw.workspaces.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    : [];
  return {
    total_campaigns: num(raw.total_campaigns),
    total_leads: num(raw.total_leads),
    sequences_active: num(raw.sequences_active),
    sequences_paused: num(raw.sequences_paused),
    active_enrollments: num(raw.active_enrollments),
    emails_sent_30d: num(raw.emails_sent_30d),
    open_rate: crmRate(raw.open_rate),
    reply_rate: crmRate(raw.reply_rate),
    workspaces: list.map(crmWorkspace),
  };
}

/** GET /api/admin/crm/workspaces/{id} — drill-in with campaigns, sequences, activity. */
export async function getAdminCrmWorkspace(workspaceId: string): Promise<AdminCrmWorkspaceDetail | null> {
  const raw = await bridgeGetOrFallback<Record<string, unknown>>(
    `api/admin/crm/workspaces/${workspaceId}`,
    {},
  );
  if (!raw.workspace_id) return null;
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
  const objs = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : [];
  return {
    ...crmWorkspace(raw),
    campaign_list: objs(raw.campaign_list).map((c) => ({
      id: String(c.id ?? ''),
      name: str(c.name),
      leads: num(c.leads),
      status: str(c.status, 'active'),
    })),
    sequence_list: objs(raw.sequence_list).map((s) => ({
      id: String(s.id ?? ''),
      name: str(s.name),
      status: str(s.status, 'active'),
      paused: s.paused === true,
      enrolled: num(s.enrolled),
      open_rate: crmRate(s.open_rate),
      reply_rate: crmRate(s.reply_rate),
    })),
    recent_activities: objs(raw.recent_activities).map((a) => ({
      kind: str(a.kind),
      lead_label: str(a.lead_label),
      at: str(a.at, new Date(0).toISOString()),
    })),
  };
}

/** POST /api/admin/crm/sequences/{id}/status — pause or resume one sequence. */
export const setCrmSequenceStatus = async (
  sequenceId: string,
  paused: boolean,
): Promise<Result<SequenceStatusOut>> => {
  if (await inDemo()) return demoFail<SequenceStatusOut>();
  return attempt(() =>
    warmupSend<SequenceStatusOut>(`api/admin/crm/sequences/${sequenceId}/status`, 'POST', { paused }),
  );
};

/* ---------------- H2: platform analytics (spec §5.2 #5) ---------------- */

/** GET /api/admin/platform-analytics/overview — normalized to page-friendly units. */
export interface PlatformAnalyticsOverview {
  total_users: number;
  active_users: number;
  total_mailboxes: number;
  active_mailboxes: number;
  total_peer_inboxes: number;
  active_peer_inboxes: number;
  /** mrr_cents / 100 */
  mrr_usd: number;
  sends_today: number;
  sends_7d: number;
  /** derived: active/total peer inboxes × 100 */
  peer_pool_health_pct: number;
}

export interface WarmthBin {
  /** range label, e.g. "0-10" */
  bin: string;
  count: number;
}

export interface VolumePoint {
  date: string;
  sent: number;
  received: number;
  opens: number;
  replies: number;
}

/** GET /api/admin/platform-analytics/top-clients — one metric per call. */
export interface TopClientRow {
  user_id: string;
  email: string;
  plan_name: string | null;
  metric_value: number;
}

export async function getPlatformAnalyticsOverview(): Promise<PlatformAnalyticsOverview> {
  const raw = await bridgeGetOrFallback<Record<string, unknown>>(
    'api/admin/platform-analytics/overview',
    {},
  );
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const peers = num(raw.total_peer_inboxes);
  return {
    total_users: num(raw.total_users),
    active_users: num(raw.active_users),
    total_mailboxes: num(raw.total_mailboxes),
    active_mailboxes: num(raw.active_mailboxes),
    total_peer_inboxes: peers,
    active_peer_inboxes: num(raw.active_peer_inboxes),
    mrr_usd: num(raw.mrr_cents) / 100,
    sends_today: num(raw.total_sends_today),
    sends_7d: num(raw.total_sends_7d),
    peer_pool_health_pct: peers > 0 ? Math.round((num(raw.active_peer_inboxes) / peers) * 100) : 0,
  };
}

/** Warmth histogram — wire `{bins:[{range,count}]}` → flat `{bin,count}` rows. */
export async function getWarmthBins(): Promise<WarmthBin[]> {
  const raw = await bridgeGetOrFallback<
    { bins?: Array<{ range?: string; bin?: string; count?: number }> } | WarmthBin[]
  >('api/admin/platform-analytics/warmth-distribution', { bins: [] });
  const bins: Array<{ range?: string; bin?: string; count?: number }> = Array.isArray(raw) ? raw : (raw.bins ?? []);
  return bins.map((b) => ({
    bin: typeof b.bin === 'string' ? b.bin : String(b.range ?? ''),
    count: typeof b.count === 'number' ? b.count : 0,
  }));
}

/** `from`/`to` window the FastAPI range routes expect (to inclusive). */
function h2RangeQuery(days: number): string {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 864e5);
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  return qs({ from: iso(from), to: iso(to), granularity: 'day' });
}

/** Daily send volume for the last `days` days (GET …/send-volume). */
export function getSendVolumeSeries(days: number): Promise<VolumePoint[]> {
  return bridgeGetOrFallback<VolumePoint[]>(`api/admin/platform-analytics/send-volume${h2RangeQuery(days)}`, []);
}

/** Daily signups for the last `days` days (GET …/signup-rate, wire `{date,count}`). */
export async function getSignupSeries(days: number): Promise<SignupRatePoint[]> {
  const raw = await bridgeGetOrFallback<Array<{ date: string; count?: number; signups?: number }>>(
    `api/admin/platform-analytics/signup-rate${h2RangeQuery(days)}`,
    [],
  );
  return (Array.isArray(raw) ? raw : []).map((p) => ({ date: p.date, signups: p.signups ?? p.count ?? 0 }));
}

/** Plan mix — wire `{by_plan:[{plan_name,user_count,active_mailboxes,mrr_cents}]}`. */
export async function getPlanMix(): Promise<PlanDistributionRow[]> {
  const raw = await bridgeGetOrFallback<
    | { by_plan?: Array<{ plan_name?: string; user_count?: number; mrr_cents?: number }> }
    | PlanDistributionRow[]
  >('api/admin/platform-analytics/plan-distribution', { by_plan: [] });
  const rows = Array.isArray(raw) ? raw : (raw.by_plan ?? []);
  return rows.map((r) =>
    'plan' in r
      ? (r as PlanDistributionRow)
      : {
          plan: typeof r.plan_name === 'string' ? r.plan_name : '—',
          count: typeof r.user_count === 'number' ? r.user_count : 0,
          mrr: (typeof r.mrr_cents === 'number' ? r.mrr_cents : 0) / 100,
        },
  );
}

/** Top clients by one metric — `by` ∈ send_volume | warmth | mailboxes. */
export function getTopClients(
  by: 'send_volume' | 'warmth' | 'mailboxes',
  limit = 100,
): Promise<TopClientRow[]> {
  return bridgeGetOrFallback<TopClientRow[]>(
    `api/admin/platform-analytics/top-clients${qs({ by, limit })}`,
    [],
  );
}
