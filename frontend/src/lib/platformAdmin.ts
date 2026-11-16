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
