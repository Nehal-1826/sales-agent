import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import { api } from '@/lib/api';
import type {
  DnsCheckResult,
  Mailbox,
  MailboxListFilters,
  MailboxListResponse,
  MailboxProvider,
  MailboxStatus,
  TestConnectionResult,
  UpdateMailboxPayload,
  WarmupThread,
} from './types';

/**
 * React-query hooks against the workspace mailbox endpoints.
 * Every call is best-effort: 404 → sensible fallback so the UI renders.
 */

export const MAILBOXES_KEY = ['mailboxes'] as const;

function isAxios404(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

// ---------------------------------------------------------------------------
// Legacy types kept for other pages (ReputationPage etc.)
// ---------------------------------------------------------------------------

export type { MailboxProvider } from './types';
export type MailboxLegacyStatus =
  | 'active'
  | 'paused'
  | 'pending'
  | 'error'
  | 'pending_verification';

export interface DnsIndicators {
  spf: 'valid' | 'invalid' | 'missing' | 'unknown';
  dkim: 'valid' | 'invalid' | 'missing' | 'unknown';
  dmarc: 'valid' | 'invalid' | 'missing' | 'unknown';
}

export interface MailboxListItem {
  id: string;
  email_address: string;
  provider: MailboxProvider;
  status: MailboxLegacyStatus;
  is_paused: boolean;
  current_day: number;
  daily_target: number;
  warmth_score: number;
  content_mode: 'A' | 'B' | 'C' | 'D';
  dns: DnsIndicators;
  last_activity_at?: string | null;
  created_at: string;
}

export interface MailboxDetail extends MailboxListItem {
  smtp_host?: string | null;
  smtp_port?: number | null;
  imap_host?: string | null;
  imap_port?: number | null;
  schedule_window?: {
    tz: string;
    weekday_mask: number;
    start_hour: number;
    end_hour: number;
  } | null;
  ramp_schedule: Array<{ day: number; planned: number }>;
  daily_actuals: Array<{ day: number; date: string; actual: number; planned: number }>;
  threads?: Array<{
    id: string;
    peer_email: string;
    subject: string;
    last_action_at: string;
    messages_count: number;
  }>;
}

export interface MailboxListResponseLegacy {
  items: MailboxListItem[];
  total: number;
}

/**
 * Legacy list hook used by ReputationPage and similar. New UI should use
 * `useMailboxes` instead.
 */
export function useMailboxList(): UseQueryResult<MailboxListResponseLegacy> {
  return useQuery({
    queryKey: ['mailboxes', 'list'],
    queryFn: async () => {
      try {
        const res: AxiosResponse<MailboxListResponseLegacy> = await api.get(
          '/workspace/mailboxes',
        );
        return res.data;
      } catch (err) {
        if (isAxios404(err)) return { items: [], total: 0 };
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Spec-aligned hooks (§5.1 item 2)
// ---------------------------------------------------------------------------

function normalizeMailbox(raw: Partial<Mailbox> & Record<string, unknown>): Mailbox {
  // Backend may still be evolving — coalesce any partial responses into the
  // `Mailbox` shape so UI never crashes on missing fields.
  const warmthScore = Number(raw.warmth_score ?? 0);
  return {
    id: String(raw.id ?? ''),
    email_address: String(raw.email_address ?? ''),
    provider: (raw.provider as MailboxProvider) ?? 'smtp',
    warmup_status: (raw.warmup_status as MailboxStatus) ?? 'pending',
    daily_target: Number(raw.daily_target ?? 0),
    current_day: Number(raw.current_day ?? 0),
    warmth_score: Number.isFinite(warmthScore) ? warmthScore : 0,
    content_mode: (raw.content_mode as Mailbox['content_mode']) ?? 'A',
    is_paused: Boolean(raw.is_paused ?? false),
    spf_valid: raw.spf_valid as boolean | null | undefined ?? null,
    dkim_valid: raw.dkim_valid as boolean | null | undefined ?? null,
    dmarc_valid: raw.dmarc_valid as boolean | null | undefined ?? null,
    schedule_window_id: (raw.schedule_window_id as string | null | undefined) ?? null,
    schedule_window:
      (raw.schedule_window as Mailbox['schedule_window'] | undefined) ?? null,
    created_at: String(raw.created_at ?? new Date().toISOString()),
    ramp_target_today: Number(raw.ramp_target_today ?? raw.daily_target ?? 0),
    days_remaining_in_ramp: Number(raw.days_remaining_in_ramp ?? 0),
    last_activity_at: (raw.last_activity_at as string | null | undefined) ?? null,
    warmth_sparkline: Array.isArray(raw.warmth_sparkline)
      ? (raw.warmth_sparkline as number[])
      : null,
    sent_today: (raw.sent_today as number | null | undefined) ?? null,
  };
}

function unwrapList(data: unknown): MailboxListResponse {
  // Accept either {items,total,...} or raw array.
  if (Array.isArray(data)) {
    const items = data.map((x) =>
      normalizeMailbox(x as Partial<Mailbox> & Record<string, unknown>),
    );
    return { items, page: 1, page_size: items.length, total: items.length };
  }
  const d = (data ?? {}) as Partial<MailboxListResponse> & { items?: unknown[] };
  const rawItems = Array.isArray(d.items) ? d.items : [];
  const items = rawItems.map((x) =>
    normalizeMailbox(x as Partial<Mailbox> & Record<string, unknown>),
  );
  return {
    items,
    page: Number(d.page ?? 1),
    page_size: Number(d.page_size ?? items.length),
    total: Number(d.total ?? items.length),
  };
}

export function useMailboxes(
  filters?: MailboxListFilters,
): UseQueryResult<MailboxListResponse> {
  const params: Record<string, string | number> = {};
  if (filters?.status && filters.status !== 'all') params.status = filters.status;
  if (filters?.provider && filters.provider !== 'all') params.provider = filters.provider;
  if (filters?.search) params.search = filters.search;
  if (filters?.page) params.page = filters.page;
  if (filters?.page_size) params.page_size = filters.page_size;

  return useQuery({
    queryKey: [...MAILBOXES_KEY, params],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/mailboxes', { params });
        return unwrapList(res.data);
      } catch (err) {
        if (isAxios404(err)) return { items: [], page: 1, page_size: 0, total: 0 };
        throw err;
      }
    },
  });
}

export function useMailbox(id: string | null | undefined): UseQueryResult<Mailbox> {
  return useQuery({
    queryKey: [...MAILBOXES_KEY, id],
    enabled: !!id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await api.get(`/workspace/mailboxes/${id}`);
      return normalizeMailbox(res.data as Partial<Mailbox> & Record<string, unknown>);
    },
  });
}

export function useUpdateMailbox(): UseMutationResult<
  Mailbox,
  unknown,
  { id: string; payload: UpdateMailboxPayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res: AxiosResponse<Partial<Mailbox>> = await api.patch(
        `/workspace/mailboxes/${id}`,
        payload,
      );
      return normalizeMailbox(res.data as Partial<Mailbox> & Record<string, unknown>);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
      qc.invalidateQueries({ queryKey: [...MAILBOXES_KEY, vars.id] });
    },
  });
}

export interface UpdateScheduleWindowPayload {
  tz: string;
  weekday_mask: number;
  start_hour: number;
  end_hour: number;
}

export function useUpdateMailboxSchedule(): UseMutationResult<
  Mailbox,
  unknown,
  { id: string; payload: UpdateScheduleWindowPayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res: AxiosResponse<Partial<Mailbox>> = await api.patch(
        `/workspace/mailboxes/${id}/schedule`,
        payload,
      );
      return normalizeMailbox(res.data as Partial<Mailbox> & Record<string, unknown>);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
      qc.invalidateQueries({ queryKey: [...MAILBOXES_KEY, vars.id] });
    },
  });
}

export function usePauseMailbox(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.post(`/workspace/mailboxes/${id}/pause`);
    },
    onMutate: async (id) => {
      // Optimistic: flip is_paused locally across list + detail caches.
      await qc.cancelQueries({ queryKey: MAILBOXES_KEY });
      const previous = qc.getQueriesData<MailboxListResponse>({ queryKey: MAILBOXES_KEY });
      qc.setQueriesData<MailboxListResponse>({ queryKey: MAILBOXES_KEY }, (old) => {
        if (!old || !old.items) return old;
        return {
          ...old,
          items: old.items.map((m) =>
            m.id === id ? { ...m, is_paused: true, warmup_status: 'paused' } : m,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      ctx?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_d, _e, id) => {
      qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
      qc.invalidateQueries({ queryKey: [...MAILBOXES_KEY, id] });
    },
  });
}

export function useResumeMailbox(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.post(`/workspace/mailboxes/${id}/resume`);
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: MAILBOXES_KEY });
      const previous = qc.getQueriesData<MailboxListResponse>({ queryKey: MAILBOXES_KEY });
      qc.setQueriesData<MailboxListResponse>({ queryKey: MAILBOXES_KEY }, (old) => {
        if (!old || !old.items) return old;
        return {
          ...old,
          items: old.items.map((m) =>
            m.id === id ? { ...m, is_paused: false, warmup_status: 'active' } : m,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      ctx?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_d, _e, id) => {
      qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
      qc.invalidateQueries({ queryKey: [...MAILBOXES_KEY, id] });
    },
  });
}

export function useDeleteMailbox(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/workspace/mailboxes/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
      qc.invalidateQueries({ queryKey: ['mailboxes', 'list'] });
    },
  });
}

export interface ProbeCredentialsPayload {
  email_address: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  imap_host?: string | null;
  imap_port?: number | null;
}

export function useProbeCredentials(): UseMutationResult<
  TestConnectionResult,
  unknown,
  ProbeCredentialsPayload
> {
  return useMutation({
    mutationFn: async (payload) => {
      const res: AxiosResponse<TestConnectionResult> = await api.post(
        '/workspace/mailboxes/probe',
        payload,
      );
      return res.data;
    },
  });
}

export interface ProviderDetection {
  domain: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'zoho' | 'icloud' | 'unknown';
  zoho_region: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  imap_host: string | null;
  imap_port: number | null;
  mx_records: string[];
  note: string | null;
}

export function useDetectProvider(email: string | null | undefined) {
  return useQuery<ProviderDetection | null>({
    queryKey: ['mailbox-detect-provider', email?.toLowerCase() ?? null],
    queryFn: async () => {
      if (!email || !email.includes('@')) return null;
      const res: AxiosResponse<ProviderDetection> = await api.get(
        '/workspace/mailboxes/detect-provider',
        { params: { email } },
      );
      return res.data;
    },
    enabled: !!email && email.includes('@') && email.length > 5,
    staleTime: 5 * 60 * 1000, // MX records don't change often
    retry: false,
  });
}

export function useTestConnection(): UseMutationResult<TestConnectionResult, unknown, string> {
  return useMutation({
    mutationFn: async (id) => {
      try {
        const res: AxiosResponse<TestConnectionResult> = await api.post(
          `/workspace/mailboxes/${id}/test-connection`,
        );
        return res.data;
      } catch (err) {
        if (isAxios404(err)) {
          // Endpoint not available yet — return neutral fallback.
          return { smtp_ok: false, imap_ok: false, error: 'not_available' };
        }
        throw err;
      }
    },
  });
}

export function useDnsCheck(): UseMutationResult<DnsCheckResult | null, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      try {
        const res: AxiosResponse<DnsCheckResult> = await api.post(
          `/workspace/mailboxes/${id}/dns-check`,
        );
        return res.data;
      } catch (err) {
        if (isAxios404(err)) return null;
        throw err;
      }
    },
    onSuccess: (_data, id) => {
      // Refresh the detail cache (rail in MailboxDrillIn etc.).
      qc.invalidateQueries({ queryKey: [...MAILBOXES_KEY, id] });
      // ALSO refresh the list so the row in /app/mailboxes (and the
      // StarterMailboxes left rail, which reads from useMailboxes()) picks
      // up the new spf_valid / dkim_valid / dmarc_valid values.
      qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Threads (used in MailboxDrillIn → Threads tab)
// ---------------------------------------------------------------------------

export function useWarmupThreads(mailboxId: string | null | undefined) {
  return useQuery<WarmupThread[]>({
    queryKey: ['warmup-threads', mailboxId],
    enabled: !!mailboxId,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/warmup-activity/warmup-threads', {
          params: { mailbox_id: mailboxId, limit: 50 },
        });
        const data = res.data as unknown;
        if (Array.isArray(data)) return data as WarmupThread[];
        if (data && typeof data === 'object' && 'items' in data) {
          return (data as { items: WarmupThread[] }).items ?? [];
        }
        return [];
      } catch (err) {
        if (isAxios404(err)) return [];
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Legacy-shape hooks used by MailboxDetailDrawer / ReputationPage — kept for
// backward compat. New components should use `useMailbox` / `useDnsCheck`.
// ---------------------------------------------------------------------------

export function useMailboxDetail(id: string | null): UseQueryResult<MailboxDetail> {
  return useQuery({
    queryKey: ['mailboxes', 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const res: AxiosResponse<MailboxDetail> = await api.get(`/workspace/mailboxes/${id}`);
      return res.data;
    },
  });
}

export function useRecheckDns(): UseMutationResult<
  {
    spf: { status: DnsIndicators['spf']; record?: string; issues?: string[] };
    dkim: { status: DnsIndicators['dkim']; record?: string; issues?: string[] };
    dmarc: { status: DnsIndicators['dmarc']; record?: string; issues?: string[] };
  },
  unknown,
  string
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/workspace/mailboxes/${id}/dns-recheck`);
      return res.data as {
        spf: { status: DnsIndicators['spf']; record?: string; issues?: string[] };
        dkim: { status: DnsIndicators['dkim']; record?: string; issues?: string[] };
        dmarc: { status: DnsIndicators['dmarc']; record?: string; issues?: string[] };
      };
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['mailboxes', 'list'] });
      qc.invalidateQueries({ queryKey: ['mailboxes', 'detail', id] });
      qc.invalidateQueries({ queryKey: ['reputation', 'dns', id] });
    },
  });
}
