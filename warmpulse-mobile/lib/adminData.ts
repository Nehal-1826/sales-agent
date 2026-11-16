/**
 * Admin data layer — super_admin-gated reads from /api/admin/*. Same TanStack
 * Query + authFetch pattern as lib/data.ts.
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

export type PlatformOverview = {
  total_users: number;
  active_users: number;
  total_mailboxes: number;
  active_mailboxes: number;
  total_peer_inboxes: number;
  active_peer_inboxes: number;
  mrr_cents: number;
  total_sends_today: number;
  total_sends_7d: number;
};

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  status: string;
  plan: string | null;
  mailbox_count: number;
  totp_enabled: boolean;
  is_suspended: boolean;
  created_at: string | null;
};

export type PeerInbox = {
  id: string;
  email: string;
  provider: string;
  daily_capacity: number;
  sends_today: number;
  reputation_score: number;
  is_active: boolean;
};

export type PeerStats = {
  total: number;
  active: number;
  inactive: number;
  avg_reputation: number;
  total_capacity: number;
  used_capacity_today: number;
  capacity_used_pct: number;
};

export type SystemHealth = {
  queues?: { celery_depth?: number; beat_delay_s?: number; redis_ops_per_s?: number; per_queue?: { default?: number; smtp?: number } };
  workers?: { id: string; host: string; status: string; last_heartbeat: string; current_task: string | null }[];
};

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => authFetch<PlatformOverview>('/api/admin/platform-analytics/overview'),
  });
}

export function useAdminUsers(search = '') {
  return useQuery({
    queryKey: ['admin-users', search],
    queryFn: async () =>
      unwrapList<AdminUser>(
        await authFetch(`/api/admin/users?page=1&page_size=50${search ? `&search=${encodeURIComponent(search)}` : ''}`),
      ),
  });
}

export function useAdminPeerStats() {
  return useQuery({
    queryKey: ['admin-peer-stats'],
    queryFn: () => authFetch<PeerStats>('/api/admin/peer-inboxes/stats'),
  });
}

export function useAdminPeers() {
  return useQuery({
    queryKey: ['admin-peers'],
    queryFn: async () => unwrapList<PeerInbox>(await authFetch('/api/admin/peer-inboxes?page=1&page_size=100')),
  });
}

export function useAdminSystemHealth() {
  return useQuery({
    queryKey: ['admin-system-health'],
    queryFn: () => authFetch<SystemHealth>('/api/admin/system-health'),
    refetchInterval: 30_000,
  });
}

/* ----------------------------- platform analytics ---------------------------- */
export type SendVolumePoint = { date: string; sent: number; received?: number; opens?: number; replies?: number };
export type SignupPoint = { date: string; count: number };
export type PlanDistRow = { plan_name: string; user_count: number; active_mailboxes: number; mrr_cents: number };

export function useSendVolume() {
  return useQuery({
    queryKey: ['admin-send-volume'],
    queryFn: async () => unwrapList<SendVolumePoint>(await authFetch('/api/admin/platform-analytics/send-volume?granularity=day')),
  });
}
export function useSignupRate() {
  return useQuery({
    queryKey: ['admin-signup-rate'],
    queryFn: async () => unwrapList<SignupPoint>(await authFetch('/api/admin/platform-analytics/signup-rate?granularity=day')),
  });
}
export function usePlanDistribution() {
  return useQuery({
    queryKey: ['admin-plan-dist'],
    queryFn: async () => {
      const d = await authFetch<{ by_plan?: PlanDistRow[] }>('/api/admin/platform-analytics/plan-distribution');
      return Array.isArray(d?.by_plan) ? d.by_plan : [];
    },
  });
}

/* -------------------------------- pool routing ------------------------------- */
export type PoolAssignment = { workspace_id: string; client_email: string; client_plan: string | null; pool_name: string; sends_last_30d: number };
export type PeerPool = { id: string; name: string; is_default: boolean; member_count: number; client_count: number };

export function usePoolAssignments() {
  return useQuery({
    queryKey: ['admin-pool-assignments'],
    queryFn: async () => unwrapList<PoolAssignment>(await authFetch('/api/admin/pool-routing?page=1&page_size=100')),
  });
}
export function usePeerPools() {
  return useQuery({
    queryKey: ['admin-peer-pools'],
    queryFn: async () => unwrapList<PeerPool>(await authFetch('/api/admin/peer-pools')),
  });
}

/* --------------------------------- llm usage --------------------------------- */
export type LlmSummary = {
  total_tokens_mtd: number;
  total_cost_cents_mtd: number;
  forecast_eom_cents: number;
  by_mode?: { A?: number; B?: number; C?: number; D?: number };
  by_user?: { email: string; plan: string | null; tokens_mtd: number; cost_cents_mtd: number; pct_used: number }[];
};
export function useLlmSummary() {
  return useQuery({
    queryKey: ['admin-llm-summary'],
    queryFn: () => authFetch<LlmSummary>('/api/admin/llm-usage/summary'),
  });
}

/* ------------------------------ retention / revenge -------------------------- */
export type RevengeKpis = { sabotaged_users: number; total_runs: number; total_moved: number; last_run_at: string | null };
export type RevengeEvent = { id: string; user_email: string; trigger: string; status: string; moved_count: number; created_at: string };

export function useRevengeKpis() {
  return useQuery({
    queryKey: ['admin-revenge-kpis'],
    queryFn: () => authFetch<RevengeKpis>('/api/admin/revenge/kpis'),
  });
}
export function useRevengeEvents() {
  return useQuery({
    queryKey: ['admin-revenge-events'],
    queryFn: async () => unwrapList<RevengeEvent>(await authFetch('/api/admin/revenge/events?limit=50')),
  });
}

/* -------------------------------- admin crm ---------------------------------- */
export type AdminCrmOverview = {
  total_campaigns: number;
  total_leads: number;
  active_enrollments: number;
  emails_sent_30d: number;
  open_rate: number;
  reply_rate: number;
  workspaces?: { workspace_id: string; name: string; owner_email: string; campaigns: number; leads: number; open_rate: number }[];
};
export function useAdminCrmOverview() {
  return useQuery({
    queryKey: ['admin-crm-overview'],
    queryFn: () => authFetch<AdminCrmOverview>('/api/admin/crm/overview'),
  });
}

/* ----------------------------- plans / addons -------------------------------- */
export type AdminPlan = { id: string; name: string; price_cents: number; max_mailboxes: number; is_active: boolean; is_public: boolean; price_display?: string };
export type Addon = { id: string; key: string; name: string; description: string; price_cents: number; is_active: boolean; price_display?: string };

export function useAllPlans() {
  return useQuery({
    queryKey: ['admin-all-plans'],
    queryFn: async () => unwrapList<AdminPlan>(await authFetch('/api/plans/all')),
  });
}
export function useAdminAddons() {
  return useQuery({
    queryKey: ['admin-addons'],
    queryFn: async () => unwrapList<Addon>(await authFetch('/api/admin/addons')),
  });
}

/* -------------------------------- payments ----------------------------------- */
export type AdminPayment = { id: string; plan_name: string | null; user_email: string | null; amount_cents: number; status: string; payment_method: string | null; created_at: string };
export function useAdminPayments() {
  return useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => unwrapList<AdminPayment>(await authFetch('/api/admin/payments?page=1&page_size=50')),
  });
}

/* --------------------------------- reports ----------------------------------- */
export type ReportSchedule = { id: string; name: string; report_type: string; cadence: string; recipients: string[]; enabled: boolean; next_run_at: string | null };
export function useAdminReportSchedules() {
  return useQuery({
    queryKey: ['admin-report-schedules'],
    queryFn: async () => unwrapList<ReportSchedule>(await authFetch('/api/admin/reports/schedules')),
  });
}

/* -------------------------------- audit log ---------------------------------- */
export type AuditEntry = { id: number; actor_email: string | null; actor_role: string | null; action: string; target_type: string | null; ip: string | null; created_at: string };
export function useAuditLog() {
  return useQuery({
    queryKey: ['admin-audit-log'],
    queryFn: async () => unwrapList<AuditEntry>(await authFetch('/api/admin/audit-log/?page=1&page_size=50')),
  });
}

/* ------------------------------ admin settings ------------------------------- */
export type AdminSettings = {
  google_oauth?: { configured: boolean };
  llm?: { configured: boolean; default_cap_tokens: number; spend_mtd_usd: number };
  transactional_smtp?: { configured: boolean; mode: string; host: string };
  defaults?: { ramp_day1: number; ramp_day7_target: number; human_delay_min_s: number; human_delay_max_s: number; warmup_log_retention_days: number };
  danger?: { maintenance_mode: boolean };
};
export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => authFetch<AdminSettings>('/api/admin/settings'),
  });
}
