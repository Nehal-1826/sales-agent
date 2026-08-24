/**
 * Admin area react-query hooks (spec §5.2).
 *
 * All read hooks are best-effort: on 404 (endpoint not wired yet) or 501
 * (endpoint explicitly stubbed), they resolve to sensible empty defaults so
 * the UI still renders with "no data" rather than throwing a red screen.
 * All mutations use `useMutation` and invalidate relevant caches on success.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';
import { type AuthUser } from '@/stores/auth';
import type {
  AddonRow,
  AdminCrmOverview,
  AdminCrmWorkspaceDetail,
  AdminPayment,
  AdminUserRow,
  AuditFilters,
  AuditLogResponse,
  BulkPauseMailboxesRequest,
  BulkPauseMailboxesResponse,
  ExportRequest,
  GenerateRequest,
  GenerateResult,
  PaymentUpdate,
  PaymentsFilters,
  PaymentsListResponse,
  PeerInboxFilters,
  PeerInboxOut,
  PeerInboxStats,
  PlanDistributionRow,
  PlanRow,
  PlatformOverview,
  PoolAssignmentOut,
  PoolOut,
  ReportScheduleCreate,
  ReportScheduleOut,
  ReportScheduleUpdate,
  ReportTypeItem,
  SankeyData,
  SequenceStatusOut,
  SignupRatePoint,
  TopClient,
  UnassignedClient,
  UsersListResponse,
  VolumePoint,
  WarmthBin,
  LlmUsageRow,
  LlmUsageSummary,
} from './types';

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------

export const ADMIN_KEYS = {
  overview: ['admin', 'overview'] as const,
  reports: ['admin', 'reports'] as const,
  reportTypes: ['admin', 'reports', 'types'] as const,
  reportSchedules: ['admin', 'reports', 'schedules'] as const,
  warmthDist: ['admin', 'warmth-distribution'] as const,
  sendVolume: ['admin', 'send-volume'] as const,
  planDist: ['admin', 'plan-distribution'] as const,
  signupRate: ['admin', 'signup-rate'] as const,
  topClients: ['admin', 'top-clients'] as const,
  users: ['admin', 'users'] as const,
  peerInboxes: ['admin', 'peer-inboxes'] as const,
  peerInboxStats: ['admin', 'peer-inboxes', 'stats'] as const,
  peerPools: ['admin', 'peer-pools'] as const,
  poolRouting: ['admin', 'pool-routing'] as const,
  poolUnassigned: ['admin', 'pool-routing', 'unassigned'] as const,
  poolMailboxes: ['admin', 'pool-routing', 'mailboxes'] as const,
  sankey: ['admin', 'pool-routing', 'sankey'] as const,
  llmSummary: ['admin', 'llm', 'summary'] as const,
  llmList: ['admin', 'llm', 'list'] as const,
  plans: ['admin', 'plans'] as const,
  addons: ['admin', 'addons'] as const,
  payments: ['admin', 'payments'] as const,
  auditLog: ['admin', 'audit-log'] as const,
  crmOverview: ['admin', 'crm', 'overview'] as const,
  crmWorkspace: ['admin', 'crm', 'workspace'] as const,
  mailViewerAccounts: ['admin-mail-accounts'] as const,
  mailViewerMessages: ['admin-mail-messages'] as const,
  mailViewerMessage: ['admin-mail-message'] as const,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusCode(err: unknown): number | null {
  if (err instanceof AxiosError) return err.response?.status ?? null;
  return null;
}

function isSoftMissing(err: unknown): boolean {
  // 404 (unknown), 501 (not implemented), 503 (unavailable) — all treat as empty.
  const s = statusCode(err);
  return s === 404 || s === 501 || s === 503;
}

async function getOrEmpty<T>(path: string, params: Record<string, unknown> | undefined, empty: T): Promise<T> {
  try {
    const res = await api.get<T>(path, { params });
    return res.data;
  } catch (err) {
    if (isSoftMissing(err)) return empty;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Platform analytics
// ---------------------------------------------------------------------------

export function useAdminOverview(): UseQueryResult<PlatformOverview> {
  return useQuery({
    queryKey: ADMIN_KEYS.overview,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Backend returns total_sends_today / mrr_cents and omits queue_depth +
      // peer_pool_health_pct. Normalize here so the dashboard always sees the
      // fields it expects with safe numeric defaults.
      const raw = await getOrEmpty<Record<string, unknown>>(
        '/admin/platform-analytics/overview',
        undefined,
        {},
      );
      const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
      const totalPeers = num(raw.total_peer_inboxes);
      const activePeers = num(raw.active_peer_inboxes);
      const overview: PlatformOverview = {
        total_users: num(raw.total_users),
        active_mailboxes: num(raw.active_mailboxes),
        total_mailboxes: num(raw.total_mailboxes),
        mrr_usd:
          typeof raw.mrr_usd === 'number'
            ? raw.mrr_usd
            : num(raw.mrr_cents) / 100,
        queue_depth: num(raw.queue_depth),
        sends_today:
          typeof raw.sends_today === 'number'
            ? raw.sends_today
            : num(raw.total_sends_today),
        // Backend has no peer_pool_health_pct — derive it from active/total peers.
        peer_pool_health_pct:
          typeof raw.peer_pool_health_pct === 'number'
            ? raw.peer_pool_health_pct
            : totalPeers > 0
              ? Math.round((activePeers / totalPeers) * 100)
              : 0,
      };
      return overview;
    },
  });
}

export function useAdminWarmthDistribution(): UseQueryResult<WarmthBin[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.warmthDist,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Backend returns { bins: [{ range, count }] }; map range → bin.
      const data = await getOrEmpty<{ bins?: Array<{ range: string; count: number }> } | WarmthBin[]>(
        '/admin/platform-analytics/warmth-distribution',
        undefined,
        { bins: [] },
      );
      const bins = Array.isArray(data) ? data : (data.bins ?? []);
      return bins.map((b) => ({
        bin: 'bin' in b ? (b.bin as string) : b.range,
        count: b.count,
      }));
    },
  });
}

export function useAdminSendVolume(days = 7): UseQueryResult<VolumePoint[]> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.sendVolume, days],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<VolumePoint[] | { items: VolumePoint[] }>(
        '/admin/platform-analytics/send-volume',
        { days },
        [],
      );
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });
}

export function useAdminPlanDistribution(): UseQueryResult<PlanDistributionRow[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.planDist,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Backend returns { by_plan: [{ plan_name, user_count, active_mailboxes, mrr_cents }] }.
      const data = await getOrEmpty<
        { by_plan?: Array<{ plan_name: string; user_count: number; mrr_cents: number }> } | PlanDistributionRow[]
      >('/admin/platform-analytics/plan-distribution', undefined, { by_plan: [] });
      const rows = Array.isArray(data) ? data : (data.by_plan ?? []);
      return rows.map((r) =>
        'plan' in r
          ? (r as PlanDistributionRow)
          : { plan: r.plan_name, count: r.user_count, mrr: (r.mrr_cents ?? 0) / 100 },
      );
    },
  });
}

export function useAdminSignupRate(days = 30): UseQueryResult<SignupRatePoint[]> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.signupRate, days],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Backend returns [{ date, count }] (SignupPoint); map count → signups.
      const data = await getOrEmpty<Array<{ date: string; count?: number; signups?: number }>>(
        '/admin/platform-analytics/signup-rate',
        { days },
        [],
      );
      const items = Array.isArray(data) ? data : [];
      return items.map((p) => ({ date: p.date, signups: p.signups ?? p.count ?? 0 }));
    },
  });
}

export function useAdminTopClients(
  sortBy: 'send_volume' | 'avg_warmth' | 'mailbox_count' = 'send_volume',
): UseQueryResult<TopClient[]> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.topClients, sortBy],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Backend's /top-clients returns a single metric_value per `by`
      // (by ∈ send_volume|warmth|mailboxes). The table needs all three metrics,
      // so fetch each sort and merge by user_id.
      type Row = { user_id: string; email: string; plan_name: string | null; metric_value: number };
      const fetchBy = (by: string) =>
        getOrEmpty<Row[]>('/admin/platform-analytics/top-clients', { by, limit: 100 }, []);
      const [vol, warmth, mailboxes] = await Promise.all([
        fetchBy('send_volume'),
        fetchBy('warmth'),
        fetchBy('mailboxes'),
      ]);
      const warmthBy: Record<string, number> = {};
      const mailboxBy: Record<string, number> = {};
      for (const r of warmth) warmthBy[r.user_id] = r.metric_value ?? 0;
      for (const r of mailboxes) mailboxBy[r.user_id] = r.metric_value ?? 0;
      const merged: TopClient[] = vol.map((r) => ({
        user_id: r.user_id,
        email: r.email,
        workspace_name: null,
        plan: r.plan_name ?? '',
        send_volume: r.metric_value ?? 0,
        avg_warmth: warmthBy[r.user_id] ?? 0,
        mailbox_count: mailboxBy[r.user_id] ?? 0,
      }));
      const key: keyof TopClient =
        sortBy === 'avg_warmth' ? 'avg_warmth' : sortBy === 'mailbox_count' ? 'mailbox_count' : 'send_volume';
      return merged.sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, 15);
    },
  });
}

// ---------------------------------------------------------------------------
// Users (stub → 501)
// ---------------------------------------------------------------------------

export function useAdminUsers(
  filters?: { page?: number; page_size?: number; search?: string; status?: string },
): UseQueryResult<UsersListResponse> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.users, filters],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: () =>
      getOrEmpty<UsersListResponse>('/admin/users', filters, {
        items: [],
        total: 0,
        page: filters?.page ?? 1,
        page_size: filters?.page_size ?? 25,
      }),
  });
}

export function useAdminUserDetail(id: string | null): UseQueryResult<AdminUserRow | null> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.users, 'detail', id],
    enabled: !!id,
    queryFn: () => getOrEmpty<AdminUserRow | null>(`/admin/users/${id}`, undefined, null),
  });
}

/**
 * Fetch a user's avatar as an object URL. The admin avatar route is
 * super_admin-gated, so an `<img src>` can't carry the bearer token — we
 * fetch the bytes through the shared axios instance and wrap them in a blob
 * URL. Returns `null` while loading or when the user has no avatar.
 */
export function useAdminUserAvatar(
  userId: string | null,
  hasAvatar: boolean,
): string | null {
  const q = useQuery({
    queryKey: [...ADMIN_KEYS.users, 'avatar', userId],
    enabled: !!userId && hasAvatar,
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const res = await api.get(`/admin/users/${userId}/avatar`, {
          responseType: 'blob',
        });
        return URL.createObjectURL(res.data as Blob);
      } catch (err) {
        if (isSoftMissing(err)) return null;
        throw err;
      }
    },
  });
  return q.data ?? null;
}

export function useImpersonateUser(): UseMutationResult<{ access_token: string }, unknown, string> {
  return useMutation({
    mutationFn: async (userId: string) => {
      try {
        const res = await api.post(`/admin/users/${userId}/impersonate`);
        return res.data as { access_token: string };
      } catch (err) {
        if (isSoftMissing(err)) return { access_token: '' };
        throw err;
      }
    },
  });
}

/**
 * One-click impersonation. Wraps `useImpersonateUser` and performs the full
 * client-side hand-off so the caller only has to fire `enter(row)`:
 *
 *   1. POST /admin/users/:id/impersonate → access token.
 *   2. Bail with a toast if the token is missing/empty (backend not ready).
 *   3. Build a minimal AuthUser from the admin table row, stash the admin's
 *      session, and swap in the impersonation token (`startImpersonation`).
 *      `useMe()` reconciles the full user object after the redirect.
 *   4. Toast success + full-page redirect to the client dashboard so every
 *      query refetches under the new token.
 *
 * No confirm dialog — a single click impersonates.
 */
export function useImpersonateAndEnter(): UseMutationResult<{ access_token: string }, unknown, AdminUserRow> {
  return useMutation({
    mutationFn: async (row: AdminUserRow) => {
      const res = await api.post(`/admin/users/${row.id}/impersonate`);
      const data = res.data as { access_token?: string };
      const token = data.access_token ?? '';
      if (!token) {
        // Treat empty token (soft-missing endpoint or unexpected shape) as a
        // failure — don't half-enter an impersonated session with no token.
        throw new Error('empty_impersonation_token');
      }
      const impersonatedUser: AuthUser = {
        id: row.id,
        email: row.email,
        name: row.name ?? row.email.split('@')[0] ?? row.email,
        role: 'client',
        workspace_id: row.id,
        onboarding_status: 'active',
        plan: row.plan ?? null,
        email_verified: true,
      };
      // Open the impersonated session in a NEW TAB, isolated per-tab via
      // sessionStorage so multiple impersonations can run at once and the
      // admin's own tab/session is untouched. 30-min window (backend TTL).
      const exp = Date.now() + 30 * 60 * 1000;
      const payload = btoa(
        encodeURIComponent(JSON.stringify({ token, user: impersonatedUser, exp })),
      );
      const tab = window.open(`/impersonate#p=${payload}`, '_blank');
      if (!tab) {
        throw new Error('impersonation_popup_blocked');
      }
      toast.success(`Opening session as ${row.email} in a new tab`);
      return { access_token: token };
    },
    onError: (err) => {
      // Surface the backend's real message (e.g. the 400 "Cannot impersonate
      // another super_admin") rather than a blanket toast. The empty-token
      // sentinel keeps the friendly "backend not ready" copy.
      const msg =
        err instanceof Error && err.message === 'empty_impersonation_token'
          ? 'Impersonation failed. Backend may not be ready.'
          : err instanceof Error && err.message === 'impersonation_popup_blocked'
            ? 'Allow pop-ups for this site to open the impersonation tab.'
            : extractErrorMessage(err, 'Impersonation failed. Please try again.');
      toast.error(msg);
    },
  });
}

export function useSuspendUser(): UseMutationResult<void, unknown, { id: string; suspended: boolean }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, suspended }) => {
      await api.post(`/admin/users/${id}/${suspended ? 'suspend' : 'unsuspend'}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.users }),
  });
}

export function useSabotageUser(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.post(`/admin/users/${id}/sabotage`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.users }),
  });
}

export function useUnsabotageUser(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.post(`/admin/users/${id}/unsabotage`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.users }),
  });
}

export function useUpdateUserPlan(): UseMutationResult<void, unknown, { userId: string; planId: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, planId }) => {
      await api.post(`/admin/users/${userId}/plan?plan_id=${planId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.users }),
  });
}

export function useDeleteUser(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/admin/users/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.users });
      // The pool-routing matrix joins on User; orphan assignments disappear
      // once the User row is gone, so refresh those views too.
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolRouting });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolUnassigned });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.sankey });
    },
  });
}

/**
 * Bulk pause/resume warmup mailboxes for client users.
 * `user_ids: []` targets EVERY client user (the Users page select-all);
 * super_admin ids are skipped server-side and reported in the response.
 */
export function useBulkPauseMailboxes(): UseMutationResult<
  BulkPauseMailboxesResponse,
  unknown,
  BulkPauseMailboxesRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post<BulkPauseMailboxesResponse>(
        '/admin/users/bulk-pause-mailboxes',
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.users });
      // Mailbox pause state feeds the same routing views a user delete does.
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolRouting });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolUnassigned });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.sankey });
    },
  });
}

// ---------------------------------------------------------------------------
// Peer inboxes
// ---------------------------------------------------------------------------

export function useAdminPeerInboxes(
  filters?: PeerInboxFilters,
): UseQueryResult<{ items: PeerInboxOut[]; total: number }> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.peerInboxes, filters],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<
        { items: PeerInboxOut[]; total: number } | PeerInboxOut[]
      >('/admin/peer-inboxes', filters as Record<string, unknown> | undefined, { items: [], total: 0 });
      if (Array.isArray(data)) return { items: data, total: data.length };
      return data;
    },
  });
}

export function useAdminPeerInboxStats(): UseQueryResult<PeerInboxStats> {
  return useQuery({
    queryKey: ADMIN_KEYS.peerInboxStats,
    staleTime: 5 * 60_000,
    queryFn: () =>
      getOrEmpty<PeerInboxStats>('/admin/peer-inboxes/stats', undefined, {
        total: 0,
        active: 0,
        by_provider: [],
        avg_reputation: 0,
        total_capacity: 0,
        used_capacity_today: 0,
      }),
  });
}

export function useAdminPeerInboxDetail(id: string | null): UseQueryResult<PeerInboxOut | null> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.peerInboxes, 'detail', id],
    enabled: !!id,
    queryFn: () => getOrEmpty<PeerInboxOut | null>(`/admin/peer-inboxes/${id}`, undefined, null),
  });
}

export interface CreatePeerInboxPayload {
  email: string;
  provider: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  imap_host?: string;
  imap_port?: number;
  imap_username?: string;
  imap_password?: string;
  daily_capacity: number;
  pool_ids?: string[];
}

// Wire-shape translation: the frontend dialog uses friendly field/provider
// names ("email", "google_workspace"), the backend's PeerInboxCreate uses
// "email_address" + the PeerProviderEnum slugs ("google_ws"). Keep the
// translation here so individual call sites don't have to know.
const PEER_PROVIDER_WIRE: Record<string, string> = {
  google_workspace: 'google_ws',
  google_ws: 'google_ws',
  office365: 'office365',
  yahoo: 'yahoo',
};

export function useCreatePeerInbox(): UseMutationResult<PeerInboxOut, unknown, CreatePeerInboxPayload> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const wire = {
        email_address: payload.email,
        provider: PEER_PROVIDER_WIRE[payload.provider] ?? payload.provider,
        daily_capacity: payload.daily_capacity,
        smtp_host: payload.smtp_host,
        smtp_port: payload.smtp_port,
        smtp_username: payload.smtp_username,
        smtp_password: payload.smtp_password,
        imap_host: payload.imap_host,
        imap_port: payload.imap_port,
        imap_username: payload.imap_username,
        imap_password: payload.imap_password,
        ...(payload.pool_ids ? { pool_ids: payload.pool_ids } : {}),
      };
      const res = await api.post('/admin/peer-inboxes', wire);
      return res.data as PeerInboxOut;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxes });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxStats });
    },
  });
}

export interface BulkImportResult {
  created: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

export function useBulkImportPeerInboxes(): UseMutationResult<BulkImportResult, unknown, FormData> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formData) => {
      const res = await api.post('/admin/peer-inboxes/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as BulkImportResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxes });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxStats });
    },
  });
}

export function useUpdatePeerInbox(): UseMutationResult<
  PeerInboxOut,
  unknown,
  { id: string; payload: Partial<CreatePeerInboxPayload> & { is_active?: boolean } }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.patch(`/admin/peer-inboxes/${id}`, payload);
      return res.data as PeerInboxOut;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxes });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxStats });
    },
  });
}

export function useDeletePeerInbox(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/admin/peer-inboxes/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxes });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxStats });
    },
  });
}

export function useResetPeerCapacity(): UseMutationResult<PeerInboxOut, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/admin/peer-inboxes/${id}/reset-capacity`);
      return res.data as PeerInboxOut;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxes });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxStats });
    },
  });
}

export function useResetAllPeerCapacity(): UseMutationResult<{ peers_reset: number }, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/peer-inboxes/reset-capacity');
      return res.data as { peers_reset: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxes });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxStats });
    },
  });
}

export function useTestPeerConnection(): UseMutationResult<
  { smtp_ok: boolean; imap_ok: boolean; error?: string },
  unknown,
  string
> {
  return useMutation({
    mutationFn: async (id) => {
      try {
        const res = await api.post(`/admin/peer-inboxes/${id}/test-connection`);
        return res.data as { smtp_ok: boolean; imap_ok: boolean };
      } catch (err) {
        if (isSoftMissing(err)) return { smtp_ok: false, imap_ok: false, error: 'not_available' };
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Peer pools + routing
// ---------------------------------------------------------------------------

export function useAdminPeerPools(): UseQueryResult<PoolOut[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.peerPools,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<PoolOut[] | { items: PoolOut[] }>(
        '/admin/peer-pools',
        undefined,
        [],
      );
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });
}

export function useCreatePool(): UseMutationResult<PoolOut, unknown, { name: string; description?: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/admin/peer-pools', payload);
      return res.data as PoolOut;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerPools }),
  });
}

export function useUpdatePool(): UseMutationResult<
  PoolOut,
  unknown,
  { id: string; payload: { name?: string; description?: string } }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.patch(`/admin/peer-pools/${id}`, payload);
      return res.data as PoolOut;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerPools }),
  });
}

export function useDeletePool(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/admin/peer-pools/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerPools }),
  });
}

export function useAddPoolMembers(): UseMutationResult<
  void,
  unknown,
  { poolId: string; peer_inbox_ids: string[] }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ poolId, peer_inbox_ids }) => {
      await api.post(`/admin/peer-pools/${poolId}/members`, { peer_inbox_ids });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerPools });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxes });
    },
  });
}

export function useRemovePoolMember(): UseMutationResult<
  void,
  unknown,
  { poolId: string; peerInboxId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ poolId, peerInboxId }) => {
      await api.delete(`/admin/peer-pools/${poolId}/members/${peerInboxId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerPools });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.peerInboxes });
    },
  });
}

export function useAdminPoolRouting(): UseQueryResult<PoolAssignmentOut[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.poolRouting,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<PoolAssignmentOut[] | { items: PoolAssignmentOut[] }>(
        '/admin/pool-routing',
        undefined,
        [],
      );
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });
}

export function useUnassignedClients(): UseQueryResult<UnassignedClient[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.poolUnassigned,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<UnassignedClient[] | { items: UnassignedClient[] }>(
        '/admin/pool-routing/clients/unassigned',
        undefined,
        [],
      );
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });
}

export function useAssignPool(): UseMutationResult<
  void,
  unknown,
  { user_id: string; pool_id: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      // Backend route is POST /admin/pool-routing (base), body {workspace_id, pool_id}.
      // `user_id` coming from the RoutingClient is actually the workspace_id after our
      // hook normalisation, so we rename the field on the way out.
      await api.post('/admin/pool-routing', {
        workspace_id: payload.user_id,
        pool_id: payload.pool_id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolRouting });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolUnassigned });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.sankey });
    },
  });
}

export function useRevertPool(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workspaceId) => {
      // Backend: DELETE /admin/pool-routing?workspace_id=... → reverts to default pool.
      await api.delete(`/admin/pool-routing`, { params: { workspace_id: workspaceId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolRouting });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolUnassigned });
    },
  });
}

export function useSankeyData(): UseQueryResult<SankeyData> {
  return useQuery({
    queryKey: ADMIN_KEYS.sankey,
    staleTime: 5 * 60_000,
    queryFn: () =>
      getOrEmpty<SankeyData>('/admin/pool-routing/sankey-data', undefined, { nodes: [], links: [] }),
  });
}

// ---------------------------------------------------------------------------
// LLM usage
// ---------------------------------------------------------------------------

export function useAdminLlmSummary(): UseQueryResult<LlmUsageSummary> {
  return useQuery({
    queryKey: ADMIN_KEYS.llmSummary,
    staleTime: 5 * 60_000,
    queryFn: () =>
      getOrEmpty<LlmUsageSummary>('/admin/llm-usage/summary', undefined, {
        total_tokens_mtd: 0,
        total_cost_cents_mtd: 0,
        forecast_eom_cents: 0,
        by_user: [],
        by_mode: { A: 0, B: 0, C: 0, D: 0 },
        spend_series: [],
        caps_by_plan: [],
      }),
  });
}

export function useAdminLlmList(filters?: {
  page?: number;
  page_size?: number;
  search?: string;
}): UseQueryResult<{ items: LlmUsageRow[]; total: number }> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.llmList, filters],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<{ items: LlmUsageRow[]; total: number } | LlmUsageRow[]>(
        '/admin/llm-usage',
        filters,
        { items: [], total: 0 },
      );
      if (Array.isArray(data)) return { items: data, total: data.length };
      return data;
    },
  });
}

export function useAdminLlmByUser(userId: string | null): UseQueryResult<LlmUsageRow | null> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.llmList, 'user', userId],
    enabled: !!userId,
    queryFn: () => getOrEmpty<LlmUsageRow | null>(`/admin/llm-usage/${userId}`, undefined, null),
  });
}

export function useUpdateLlmCap(): UseMutationResult<
  void,
  unknown,
  { planId: string; cap_tokens: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, cap_tokens }) => {
      await api.patch(`/admin/llm-usage/caps/${planId}`, { cap_tokens });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.llmSummary });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.llmList });
    },
  });
}

// ---------------------------------------------------------------------------
// Plans (client-facing /api/plans)
// ---------------------------------------------------------------------------

/**
 * Backend `/plans` returns a different shape than the legacy `PlanRow` type
 * (it uses `price_cents` + `capabilities.features` instead of `price_monthly_usd`
 * + flat `features`, and has no `slug`). We normalise here so the UI keeps the
 * stable PlanRow contract without forcing a backend rewrite.
 */
function normalisePlan(raw: Record<string, unknown>): PlanRow {
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const name = typeof raw.name === 'string' ? raw.name : '—';
  const slug =
    typeof raw.slug === 'string' && raw.slug
      ? raw.slug
      : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'plan';
  const capabilities = (raw.capabilities ?? {}) as Record<string, unknown>;
  const features = Array.isArray(capabilities.features)
    ? (capabilities.features as unknown[]).filter((f): f is string => typeof f === 'string')
    : Array.isArray(raw.features)
      ? (raw.features as unknown[]).filter((f): f is string => typeof f === 'string')
      : [];
  return {
    id: typeof raw.id === 'string' ? raw.id : String(raw.id ?? ''),
    slug,
    name,
    price_monthly_usd:
      typeof raw.price_monthly_usd === 'number'
        ? raw.price_monthly_usd
        : num(raw.price_cents) / 100,
    mailboxes_included:
      typeof raw.mailboxes_included === 'number'
        ? raw.mailboxes_included
        : num(raw.max_mailboxes),
    max_mailboxes: num(raw.max_mailboxes),
    daily_email_cap:
      typeof raw.daily_email_cap === 'number' ? raw.daily_email_cap : undefined,
    features,
    is_active: raw.is_active !== false,
    is_public: raw.is_public !== false,
    sort_order: typeof raw.sort_order === 'number' ? raw.sort_order : 0,
    llm_token_cap:
      typeof raw.llm_token_cap === 'number'
        ? raw.llm_token_cap
        : typeof raw.token_cap_per_month === 'number'
          ? raw.token_cap_per_month
          : undefined,
  };
}

export function useAdminPlans(): UseQueryResult<PlanRow[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.plans,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Admin listing hits /plans/all (super_admin only) so HIDDEN
      // (is_public=false) and inactive tiers still appear here for the
      // visibility toggle — the public /plans endpoint filters them out.
      const data = await getOrEmpty<unknown>('/plans/all', undefined, []);
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { items?: unknown }).items)
          ? (data as { items: unknown[] }).items
          : [];
      return list
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map(normalisePlan);
    },
  });
}

export function useUpdatePlan(): UseMutationResult<
  PlanRow,
  unknown,
  { id: string; payload: Partial<PlanRow> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      // Same wire translation as create — the frontend's PlanRow uses
      // friendly names (price_monthly_usd, features, mailboxes_included);
      // the backend PlanUpdate expects (price_cents, capabilities.features,
      // max_mailboxes, daily_email_cap, token_cap_per_month). Only emit
      // fields the caller actually changed so PATCH is a real partial.
      const wire: Record<string, unknown> = {};
      if (payload.name !== undefined) wire.name = payload.name;
      if (payload.price_monthly_usd !== undefined) {
        wire.price_cents = Math.round(payload.price_monthly_usd * 100);
      }
      if (payload.max_mailboxes !== undefined) {
        wire.max_mailboxes = payload.max_mailboxes;
      }
      if (payload.daily_email_cap !== undefined) {
        wire.daily_email_cap = payload.daily_email_cap;
      }
      if (payload.llm_token_cap !== undefined) {
        wire.token_cap_per_month = payload.llm_token_cap;
      }
      if (payload.features !== undefined) {
        wire.capabilities = { features: payload.features };
      }
      if (payload.is_active !== undefined) wire.is_active = payload.is_active;
      if (payload.is_public !== undefined) wire.is_public = payload.is_public;
      if (payload.sort_order !== undefined) wire.sort_order = payload.sort_order;

      const res = await api.patch(`/plans/${id}`, wire);
      const raw = res.data as Record<string, unknown>;
      return normalisePlan(raw);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.plans });
      // Also refresh the public + onboarding plan catalogues so admin edits
      // (price, features, order, visibility) reflect immediately. [plans] is
      // a prefix that covers both the raw [plans] query and the normalized
      // [plans,public,normalized] used by usePublicPlans.
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useDeletePlan(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (planId) => {
      // Backend `DELETE /api/plans/{id}` is a soft-delete (flips
      // is_active=false). Existing subscribers stay attached for billing,
      // the row just disappears from the public pricing list.
      await api.delete(`/plans/${planId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.plans });
      // Also refresh the public + onboarding plan catalogues so admin edits
      // (price, features, order, visibility) reflect immediately. [plans] is
      // a prefix that covers both the raw [plans] query and the normalized
      // [plans,public,normalized] used by usePublicPlans.
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useCreatePlan(): UseMutationResult<PlanRow, unknown, Partial<PlanRow>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      // Wire translation: the frontend PlanRow uses friendly names
      // (price_monthly_usd, features, mailboxes_included), the backend's
      // PlanCreate uses (price_cents, capabilities.features, max_mailboxes,
      // daily_email_cap, token_cap_per_month). Mismatched payloads return
      // 422, so do the rename + unit conversion here.
      const wire: Record<string, unknown> = {
        name: payload.name ?? 'New plan',
        price_cents: Math.round((payload.price_monthly_usd ?? 0) * 100),
        max_mailboxes: payload.max_mailboxes ?? payload.mailboxes_included ?? 5,
        // Default to 50 if the create form doesn't supply one, matching
        // the Starter seed value. The Create/Edit dialogs expose this
        // field so admins can dial it per tier (50 Starter · 100 Pro ·
        // 200 Agency, etc.) and the change flows straight to the
        // onboarding volume picker via /plans.
        daily_email_cap: payload.daily_email_cap ?? 50,
        token_cap_per_month: payload.llm_token_cap ?? 1_000_000,
        capabilities: { features: payload.features ?? [] },
        is_active: payload.is_active !== false,
        is_public: payload.is_public !== false,
        sort_order: payload.sort_order ?? 0,
      };
      const res = await api.post('/plans', wire);
      // Backend returns backend-shape too — normalise back into PlanRow.
      const raw = res.data as Record<string, unknown>;
      return normalisePlan(raw);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.plans });
      // Also refresh the public + onboarding plan catalogues so admin edits
      // (price, features, order, visibility) reflect immediately. [plans] is
      // a prefix that covers both the raw [plans] query and the normalized
      // [plans,public,normalized] used by usePublicPlans.
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export function useAdminPayments(filters?: PaymentsFilters): UseQueryResult<PaymentsListResponse> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.payments, filters],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await getOrEmpty<PaymentsListResponse>(
        '/admin/payments',
        filters as Record<string, unknown> | undefined,
        {
          items: [],
          total: 0,
          page: filters?.page ?? 1,
          page_size: filters?.page_size ?? 25,
          revenue_series: [],
          by_plan_series: [],
        },
      );
      // Backend returns PaymentOut (amount_cents) but consumers read amount_usd
      // (already in rupees — display currency is INR). Normalize here so the
      // list and detail paths agree and money() never sees undefined → ₹NaN.
      return {
        ...res,
        items: (res.items ?? []).map((p) => ({
          ...p,
          amount_usd:
            typeof p.amount_usd === 'number' && !Number.isNaN(p.amount_usd)
              ? p.amount_usd
              : (p.amount_cents ?? 0) / 100,
          plan: p.plan || p.plan_name || '',
        })),
      };
    },
  });
}

export function useExportPaymentsCsv(): UseMutationResult<Blob, unknown, PaymentsFilters | undefined> {
  return useMutation({
    mutationFn: async (filters) => {
      const res = await api.get('/admin/payments/export.csv', {
        params: filters,
        responseType: 'blob',
      });
      return res.data as Blob;
    },
  });
}

/**
 * Patch a payment's status and/or amount_cents (super_admin only).
 * Invalidates the admin payments list + any user-detail queries so every
 * surface that shows payment data refreshes automatically.
 */
export function useUpdatePayment(): UseMutationResult<
  AdminPayment,
  unknown,
  { id: string; update: PaymentUpdate }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, update }) => {
      // Backend accepts amount_cents on the wire; we send exactly what was
      // computed in the dialog (Math.round(rupees * 100)).
      const res = await api.patch(`/admin/payments/${id}`, update);
      // Backend returns PaymentOut which uses amount_cents, not amount_usd.
      // Normalise to the AdminPayment shape the frontend uses everywhere.
      const raw = res.data as {
        id: string;
        user_id: string;
        user_email?: string | null;
        plan_name?: string | null;
        amount_cents: number;
        status: string;
        created_at: string;
        external_ref?: string | null;
        workspace_name?: string | null;
      };
      const payment: AdminPayment = {
        id: raw.id,
        user_id: raw.user_id,
        user_email: raw.user_email ?? '',
        plan: raw.plan_name ?? '',
        amount_usd: raw.amount_cents / 100,
        status: raw.status as AdminPayment['status'],
        created_at: raw.created_at,
        external_ref: raw.external_ref,
        workspace_name: raw.workspace_name ?? null,
      };
      return payment;
    },
    onSuccess: () => {
      // Invalidate all payment query variants (filters may differ).
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.payments });
      // Users page reads subscription derived from payments.
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.users });
      // Overview MRR is derived from payments.
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.overview });
    },
  });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

/**
 * Backend `/admin/audit-log/` returns entries with `created_at` + `payload`
 * (and an int id). The frontend type uses `timestamp` + `metadata` (and string
 * id), so we normalise the shape here.
 */
function normaliseAuditEntry(raw: Record<string, unknown>): import('./types').AuditLogEntry {
  const role = typeof raw.actor_role === 'string' ? raw.actor_role : 'system';
  const normalisedRole: 'super_admin' | 'client' | 'system' =
    role === 'super_admin' || role === 'client' ? role : 'system';
  return {
    id: typeof raw.id === 'string' ? raw.id : String(raw.id ?? ''),
    timestamp:
      typeof raw.timestamp === 'string'
        ? raw.timestamp
        : typeof raw.created_at === 'string'
          ? raw.created_at
          : new Date().toISOString(),
    actor_email: typeof raw.actor_email === 'string' && raw.actor_email ? raw.actor_email : 'system',
    actor_role: normalisedRole,
    action: typeof raw.action === 'string' ? raw.action : 'unknown',
    target_type: typeof raw.target_type === 'string' ? raw.target_type : '',
    target_id:
      typeof raw.target_id === 'string'
        ? raw.target_id
        : raw.target_id != null
          ? String(raw.target_id)
          : null,
    ip: typeof raw.ip === 'string' && raw.ip ? raw.ip : null,
    metadata:
      raw.metadata && typeof raw.metadata === 'object'
        ? (raw.metadata as Record<string, unknown>)
        : raw.payload && typeof raw.payload === 'object'
          ? (raw.payload as Record<string, unknown>)
          : undefined,
  };
}

export function useAdminAuditLog(filters?: AuditFilters): UseQueryResult<AuditLogResponse> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.auditLog, filters],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const raw = await getOrEmpty<Record<string, unknown>>(
        '/admin/audit-log/',
        filters as Record<string, unknown> | undefined,
        {},
      );
      const rawItems: unknown[] = Array.isArray(raw.items) ? raw.items : [];
      const items = rawItems
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map(normaliseAuditEntry);
      return {
        items,
        total: typeof raw.total === 'number' ? raw.total : items.length,
        page: typeof raw.page === 'number' ? raw.page : (filters?.page ?? 1),
        page_size: typeof raw.page_size === 'number' ? raw.page_size : (filters?.page_size ?? 25),
        by_type: Array.isArray(raw.by_type)
          ? (raw.by_type as Array<{ action: string; count: number }>)
          : [],
      };
    },
  });
}

// Re-export as a convenience for individual payment fetches
export async function fetchPayment(id: string): Promise<AdminPayment | null> {
  return getOrEmpty<AdminPayment | null>(`/admin/payments/${id}`, undefined, null);
}

// ---------------------------------------------------------------------------
// Admin CRM (cross-workspace)
// ---------------------------------------------------------------------------

/**
 * The backend returns open_rate / reply_rate as fractions (0–1) for the
 * overview endpoint. Normalise to percentages (0–100) so the UI always
 * works with pct values regardless of which shape the backend settles on.
 */
function normaliseCrmRate(v: unknown): number {
  const n = typeof v === 'number' ? v : 0;
  // If the value is already in 0–100 range (pct), leave it; if ≤1 treat as fraction.
  return n > 0 && n <= 1 ? +(n * 100).toFixed(2) : +n.toFixed(2);
}

function normaliseCrmWorkspaceRow(raw: Record<string, unknown>): import('./types').AdminCrmWorkspaceRow {
  return {
    workspace_id: typeof raw.workspace_id === 'string' ? raw.workspace_id : String(raw.workspace_id ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    plan: typeof raw.plan === 'string' ? raw.plan : null,
    owner_email: typeof raw.owner_email === 'string' ? raw.owner_email : '',
    campaigns: typeof raw.campaigns === 'number' ? raw.campaigns : 0,
    leads: typeof raw.leads === 'number' ? raw.leads : 0,
    sequences_active: typeof raw.sequences_active === 'number' ? raw.sequences_active : 0,
    sequences_paused: typeof raw.sequences_paused === 'number' ? raw.sequences_paused : 0,
    active_enrollments: typeof raw.active_enrollments === 'number' ? raw.active_enrollments : 0,
    open_rate: normaliseCrmRate(raw.open_rate),
    reply_rate: normaliseCrmRate(raw.reply_rate),
    last_activity_at: typeof raw.last_activity_at === 'string' ? raw.last_activity_at : null,
  };
}

export function useAdminCrmOverview(): UseQueryResult<AdminCrmOverview> {
  return useQuery({
    queryKey: ADMIN_KEYS.crmOverview,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const raw = await getOrEmpty<Record<string, unknown>>(
        '/admin/crm/overview',
        undefined,
        {},
      );
      const rawWorkspaces = Array.isArray(raw.workspaces) ? raw.workspaces : [];
      const workspaces = rawWorkspaces
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map(normaliseCrmWorkspaceRow);
      return {
        total_campaigns: typeof raw.total_campaigns === 'number' ? raw.total_campaigns : 0,
        total_leads: typeof raw.total_leads === 'number' ? raw.total_leads : 0,
        sequences_active: typeof raw.sequences_active === 'number' ? raw.sequences_active : 0,
        sequences_paused: typeof raw.sequences_paused === 'number' ? raw.sequences_paused : 0,
        active_enrollments: typeof raw.active_enrollments === 'number' ? raw.active_enrollments : 0,
        emails_sent_30d: typeof raw.emails_sent_30d === 'number' ? raw.emails_sent_30d : 0,
        open_rate: normaliseCrmRate(raw.open_rate),
        reply_rate: normaliseCrmRate(raw.reply_rate),
        workspaces,
      } satisfies AdminCrmOverview;
    },
  });
}

export function useAdminCrmWorkspaceDetail(workspaceId: string | null): UseQueryResult<AdminCrmWorkspaceDetail | null> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.crmWorkspace, workspaceId],
    enabled: !!workspaceId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const raw = await getOrEmpty<Record<string, unknown>>(
        `/admin/crm/workspaces/${workspaceId}`,
        undefined,
        {},
      );
      if (!raw.workspace_id) return null;
      const baseRow = normaliseCrmWorkspaceRow(raw);
      const normSeq = (s: Record<string, unknown>): import('./types').AdminCrmSequenceRow => ({
        id: typeof s.id === 'string' ? s.id : String(s.id ?? ''),
        name: typeof s.name === 'string' ? s.name : '',
        status: typeof s.status === 'string' ? s.status : 'active',
        paused: typeof s.paused === 'boolean' ? s.paused : false,
        enrolled: typeof s.enrolled === 'number' ? s.enrolled : 0,
        open_rate: normaliseCrmRate(s.open_rate),
        reply_rate: normaliseCrmRate(s.reply_rate),
      });
      const normCamp = (c: Record<string, unknown>): import('./types').AdminCrmCampaignRow => ({
        id: typeof c.id === 'string' ? c.id : String(c.id ?? ''),
        name: typeof c.name === 'string' ? c.name : '',
        leads: typeof c.leads === 'number' ? c.leads : 0,
        status: typeof c.status === 'string' ? c.status : 'active',
      });
      const normAct = (a: Record<string, unknown>): import('./types').AdminCrmRecentActivity => ({
        kind: typeof a.kind === 'string' ? a.kind : '',
        lead_label: typeof a.lead_label === 'string' ? a.lead_label : '',
        at: typeof a.at === 'string' ? a.at : new Date().toISOString(),
      });
      const rawSeqs = Array.isArray(raw.sequence_list) ? raw.sequence_list : [];
      const rawCamps = Array.isArray(raw.campaign_list) ? raw.campaign_list : [];
      const rawActs = Array.isArray(raw.recent_activities) ? raw.recent_activities : [];
      return {
        ...baseRow,
        campaign_list: rawCamps
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map(normCamp),
        sequence_list: rawSeqs
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map(normSeq),
        recent_activities: rawActs
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map(normAct),
      } satisfies AdminCrmWorkspaceDetail;
    },
  });
}

export function useSetSequenceStatus(): UseMutationResult<
  SequenceStatusOut,
  unknown,
  { sequenceId: string; paused: boolean; workspaceId?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sequenceId, paused }) => {
      const res = await api.post(`/admin/crm/sequences/${sequenceId}/status`, { paused });
      return res.data as SequenceStatusOut;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.crmOverview });
      if (vars.workspaceId) {
        qc.invalidateQueries({ queryKey: [...ADMIN_KEYS.crmWorkspace, vars.workspaceId] });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Admin Reports
// ---------------------------------------------------------------------------

export function useAdminReportTypes(): UseQueryResult<ReportTypeItem[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.reportTypes,
    staleTime: 10 * 60_000,
    queryFn: () =>
      getOrEmpty<ReportTypeItem[]>('/admin/reports/types', undefined, []),
  });
}

export function useGenerateReport(): UseMutationResult<GenerateResult, unknown, GenerateRequest> {
  return useMutation({
    mutationFn: async (body) => {
      const res = await api.post<GenerateResult>('/admin/reports/generate', body);
      return res.data;
    },
  });
}

export function useExportReport(): UseMutationResult<void, unknown, ExportRequest & { filename?: string }> {
  return useMutation({
    mutationFn: async ({ filename: _fn, ...body }) => {
      let resp: { data: unknown; headers: Record<string, string> };
      try {
        resp = await api.post('/admin/reports/export', body, { responseType: 'blob' }) as typeof resp;
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 501) {
          // Backend hint lives in the blob text — decode it
          const blobText = err.response.data instanceof Blob
            ? await (err.response.data as Blob).text()
            : String(err.response.data ?? '');
          let hint = '';
          try { hint = (JSON.parse(blobText) as { detail?: string }).detail ?? ''; } catch { /* noop */ }
          toast.error(hint || 'Export format not available on this server (missing dep).');
          return;
        }
        throw err;
      }
      const blob = resp.data as Blob;
      const disposition: string = (resp.headers as Record<string, string>)['content-disposition'] ?? '';
      const match = /filename="?([^";\n]+)"?/.exec(disposition);
      const name = match?.[1] ?? `report.${body.format ?? 'csv'}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}

export function useReportSchedules(): UseQueryResult<ReportScheduleOut[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.reportSchedules,
    staleTime: 2 * 60_000,
    queryFn: () =>
      getOrEmpty<ReportScheduleOut[]>('/admin/reports/schedules', undefined, []),
  });
}

export function useCreateReportSchedule(): UseMutationResult<ReportScheduleOut, unknown, ReportScheduleCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await api.post<ReportScheduleOut>('/admin/reports/schedules', body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.reportSchedules }),
  });
}

export function useUpdateReportSchedule(): UseMutationResult<
  ReportScheduleOut,
  unknown,
  { id: string; payload: ReportScheduleUpdate }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.patch<ReportScheduleOut>(`/admin/reports/schedules/${id}`, payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.reportSchedules }),
  });
}

export function useDeleteReportSchedule(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/admin/reports/schedules/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEYS.reportSchedules }),
  });
}

// ---------------------------------------------------------------------------
// Add-on catalogue (admin)
// ---------------------------------------------------------------------------

export function useAdminAddons(): UseQueryResult<AddonRow[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.addons,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<AddonRow[]>('/admin/addons', undefined, []);
      return Array.isArray(data) ? data : [];
    },
  });
}

export function useCreateAddon(): UseMutationResult<AddonRow, unknown, Partial<AddonRow>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const wire = {
        key: payload.key,
        name: payload.name,
        description: payload.description ?? '',
        price_cents: payload.price_cents ?? 0,
        is_active: payload.is_active ?? true,
        sort_order: payload.sort_order ?? 0,
      };
      const res = await api.post('/admin/addons', wire);
      return res.data as AddonRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.addons });
      qc.invalidateQueries({ queryKey: ['addons'] }); // client catalogue
    },
  });
}

export function useUpdateAddon(): UseMutationResult<
  AddonRow,
  unknown,
  { id: string; payload: Partial<AddonRow> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const wire: Record<string, unknown> = {};
      if (payload.name !== undefined) wire.name = payload.name;
      if (payload.description !== undefined) wire.description = payload.description;
      if (payload.price_cents !== undefined) wire.price_cents = payload.price_cents;
      if (payload.is_active !== undefined) wire.is_active = payload.is_active;
      if (payload.sort_order !== undefined) wire.sort_order = payload.sort_order;
      const res = await api.patch(`/admin/addons/${id}`, wire);
      return res.data as AddonRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.addons });
      qc.invalidateQueries({ queryKey: ['addons'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mail viewer (admin IMAP proxy — read-only inbox inspector)
// ---------------------------------------------------------------------------

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
  uid: number;
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
  uid: number;
  from: string;
  to: string;
  cc?: string | null;
  subject: string;
  date: string;
  text_body: string;
  headers: {
    message_id?: string | null;
    x_warmup_id?: string | null;
  };
}

export function useMailViewerAccounts(): UseQueryResult<MailViewerAccount[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.mailViewerAccounts,
    staleTime: 60_000,
    queryFn: async () => {
      // Backend returns {accounts: [...]}; accept a bare array too (same
      // defensive pattern as the other admin list hooks).
      const data = await getOrEmpty<{ accounts?: MailViewerAccount[] } | MailViewerAccount[]>(
        '/admin/mail-viewer/accounts',
        undefined,
        [],
      );
      const list = Array.isArray(data) ? data : (data.accounts ?? []);
      return list.filter((a): a is MailViewerAccount => !!a && typeof a.email === 'string');
    },
  });
}

export function useMailViewerMessages(
  source: MailViewerSource,
  id: string | null,
  folder: string,
): UseQueryResult<MailViewerMessagesPage> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.mailViewerMessages, source, id, folder],
    enabled: !!id,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      try {
        const res = await api.get<MailViewerMessagesPage | MailViewerMessageSummary[]>(
          `/admin/mail-viewer/${source}/${id}/messages`,
          { params: { folder, limit: 50 } },
        );
        const data = res.data;
        if (Array.isArray(data)) return { folder, folders: ['INBOX'], messages: data };
        return {
          folder: typeof data.folder === 'string' ? data.folder : folder,
          folders:
            Array.isArray(data.folders) && data.folders.length > 0 ? data.folders : ['INBOX'],
          messages: Array.isArray(data.messages) ? data.messages : [],
        };
      } catch (err) {
        // Soft-missing (endpoint absent) → empty folder view so the page
        // still renders. Real IMAP failures (502) and 400s must surface to
        // the page's error state, so they rethrow.
        if (isSoftMissing(err)) return { folder, folders: ['INBOX'], messages: [] };
        throw err;
      }
    },
  });
}

export function useMailViewerMessage(
  source: MailViewerSource,
  id: string | null,
  folder: string,
  uid: number | null,
): UseQueryResult<MailViewerMessageDetail> {
  return useQuery({
    queryKey: [...ADMIN_KEYS.mailViewerMessage, source, id, folder, uid],
    enabled: !!id && uid != null,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const res = await api.get<MailViewerMessageDetail>(
        `/admin/mail-viewer/${source}/${id}/message/${uid}`,
        { params: { folder } },
      );
      return res.data;
    },
  });
}
