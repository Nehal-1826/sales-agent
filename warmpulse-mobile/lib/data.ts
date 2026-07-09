/**
 * Data layer for the app — TanStack Query hooks over the same backend the
 * website uses (lib/api.authFetch handles bearer + 401-refresh). Every list
 * endpoint may return a bare array OR `{ items: [...] }`; `unwrapList` handles both.
 */
import { useQuery } from '@tanstack/react-query';
import { authFetch } from './api';

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: T[] }).items;
  }
  return [];
}

/* ----------------------------------- types ----------------------------------- */
export type DashboardSummary = {
  warmth_score?: number;
  mean_warmth_score?: number;
  warmth_delta?: number;
  warmth_delta_24h?: number;
  sent_today?: number;
  opens_today?: number;
  replies_today?: number;
  spam_rescues_today?: number;
  mailbox_count?: number;
  total_mailboxes?: number;
  placement?: { inbox_pct?: number; promotions_pct?: number; spam_pct?: number };
  trend_30d?: { date: string; warmth_score: number }[];
  warmth_30d?: { date: string; warmth_score: number }[];
};

export type TodayStats = { sent: number; opens: number; replies: number; spam_rescues: number };

export type Mailbox = {
  id: string;
  email_address: string;
  provider: string;
  warmup_status: string;
  daily_target: number;
  current_day: number;
  warmth_score: number;
  is_paused?: boolean;
  spf_valid?: boolean | null;
  dkim_valid?: boolean | null;
  dmarc_valid?: boolean | null;
  ramp_target_today?: number;
  sent_today?: number | null;
  opens_today?: number | null;
  replies_today?: number | null;
  warmth_sparkline?: number[] | null;
};

export type DailyMetric = {
  date: string;
  sent?: number;
  opened?: number;
  replied?: number;
  spam_rescued?: number;
  bounced?: number;
  warmth_score?: number;
  // wire (DB) aliases the backend may emit instead:
  emails_sent?: number;
  opens?: number;
  replies?: number;
  spam_rescues?: number;
  bounce_count?: number;
};

export type ActivityItem = {
  id: string;
  ts: string;
  mailbox_email: string;
  peer_email: string;
  action: string;
  result: string;
  subject?: string;
};

export type GeneratedReport = {
  id: string;
  type: string;
  range: string;
  format: string;
  created_at: string;
  download_url?: string;
};
export type ScheduledReport = {
  id: string;
  type: string;
  frequency: string;
  recipients: string[];
  next_run_at?: string;
  last_run_at?: string | null;
};

export type Payment = {
  id: string;
  plan_name?: string;
  amount_cents: number;
  status: string;
  payment_method?: string | null;
  created_at: string;
};
export type CurrentUsage = {
  mailboxes_used: number;
  mailboxes_cap: number;
  warmup_emails_sent_mtd: number;
  llm_tokens_used_mtd: number;
  llm_tokens_cap: number;
};
export type BillingStatus = { auto_pay_enabled: boolean; next_billing_date: string | null };

export type WorkspaceData = {
  name: string;
  plan: string;
  created_at?: string;
  team_members?: { id: string; email: string; role: string; accepted_at?: string | null }[];
  sub_clients?: { id: string; name: string; owner_email: string; mailbox_count: number }[];
  api_keys?: { id: string; name: string; created_at: string; last_used_at?: string | null }[];
};

export type CrmSummary = {
  campaigns: number;
  leads: number;
  won_value_cents: number;
  by_stage?: Record<string, number>;
};
export type CrmLimits = { tier: string; cap: number | null; used: number };

export type PlanOut = {
  id: string;
  name: string;
  price_cents: number;
  max_mailboxes: number;
  daily_email_cap: number;
  capabilities?: { features?: string[] };
  price_display?: string;
  sort_order?: number;
};

/* ----------------------------------- hooks ----------------------------------- */
export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => authFetch<DashboardSummary>('/api/workspace/analytics/dashboard/summary'),
  });
}

export function useTodayStats() {
  return useQuery({
    queryKey: ['today-stats'],
    queryFn: () => authFetch<TodayStats>('/api/workspace/warmup-activity/today-stats'),
  });
}

export function useMailboxes() {
  return useQuery({
    queryKey: ['mailboxes'],
    queryFn: async () => unwrapList<Mailbox>(await authFetch('/api/workspace/mailboxes?page_size=100')),
  });
}

export function useDailyMetrics() {
  return useQuery({
    queryKey: ['daily-metrics'],
    queryFn: async () => unwrapList<DailyMetric>(await authFetch('/api/workspace/analytics/daily-metrics')),
  });
}

export function useActivity(limit = 50) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: async () => unwrapList<ActivityItem>(await authFetch(`/api/workspace/warmup-activity?limit=${limit}`)),
  });
}

export type ReportsData = {
  generated: GeneratedReport[];
  scheduled: ScheduledReport[];
};
export function useReports() {
  return useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const d = await authFetch<{ generated?: GeneratedReport[]; scheduled?: ScheduledReport[] }>(
        '/api/workspace/reports',
      );
      return {
        generated: Array.isArray(d?.generated) ? d.generated : [],
        scheduled: Array.isArray(d?.scheduled) ? d.scheduled : [],
      } as ReportsData;
    },
  });
}

export function usePayments() {
  return useQuery({
    queryKey: ['payments'],
    queryFn: async () => unwrapList<Payment>(await authFetch('/api/payments/me')),
  });
}
export function useUsage() {
  return useQuery({
    queryKey: ['billing-usage'],
    queryFn: () => authFetch<CurrentUsage>('/api/workspace/billing/usage'),
  });
}
export function useBillingStatus() {
  return useQuery({
    queryKey: ['billing-status'],
    queryFn: () => authFetch<BillingStatus>('/api/payments/billing-status'),
  });
}

export function useWorkspace() {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => authFetch<WorkspaceData>('/api/workspace'),
  });
}

export function useCrmSummary() {
  return useQuery({
    queryKey: ['crm-summary'],
    queryFn: () => authFetch<CrmSummary>('/api/crm/summary'),
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: async () => unwrapList<PlanOut>(await authFetch('/api/plans')),
    staleTime: 10 * 60_000,
  });
}

/* --------------------------------- adapters ---------------------------------- */
/** Normalise a daily-metric row (canonical names OR DB aliases) to one shape. */
export function normalizeMetric(m: DailyMetric) {
  return {
    date: m.date,
    sent: m.sent ?? m.emails_sent ?? 0,
    opened: m.opened ?? m.opens ?? 0,
    replied: m.replied ?? m.replies ?? 0,
    spamRescued: m.spam_rescued ?? m.spam_rescues ?? 0,
    bounced: m.bounced ?? m.bounce_count ?? 0,
    warmth: m.warmth_score ?? 0,
  };
}

/** Dashboard summary tolerates either field-name family. */
export function normalizeSummary(s: DashboardSummary | undefined) {
  if (!s) return null;
  return {
    warmth: Math.round(s.warmth_score ?? s.mean_warmth_score ?? 0),
    warmthDelta: Math.round(s.warmth_delta ?? s.warmth_delta_24h ?? 0),
    sentToday: s.sent_today ?? 0,
    opensToday: s.opens_today ?? 0,
    repliesToday: s.replies_today ?? 0,
    spamRescuesToday: s.spam_rescues_today ?? 0,
    mailboxCount: s.mailbox_count ?? s.total_mailboxes ?? 0,
    inboxPct: Math.round(s.placement?.inbox_pct ?? 0),
    promotionsPct: Math.round(s.placement?.promotions_pct ?? 0),
    spamPct: Math.round(s.placement?.spam_pct ?? 0),
    trend: (s.trend_30d ?? s.warmth_30d ?? []).map((p) => p.warmth_score),
  };
}
