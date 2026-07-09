/**
 * Admin settings feature hooks.
 *
 * Exposes one read hook (`useAdminSettings`) backed by `/admin/settings` and a
 * set of mutations for updating the various config panels. All reads soft-fail
 * to sensible defaults on 404/501/503 using the same pattern as the broader
 * admin api.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LlmSpendPoint {
  date: string;
  cost_usd: number;
}

export interface AdminSettings {
  google_oauth: {
    client_id_masked: string;
    configured: boolean;
  };
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
  danger: {
    maintenance_mode: boolean;
  };
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

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------

export const SETTINGS_KEYS = {
  root: ['admin', 'settings'] as const,
} as const;

// ---------------------------------------------------------------------------
// Helpers (mirror admin/api.ts)
// ---------------------------------------------------------------------------

function statusCode(err: unknown): number | null {
  if (err instanceof AxiosError) return err.response?.status ?? null;
  return null;
}

function isSoftMissing(err: unknown): boolean {
  const s = statusCode(err);
  return s === 404 || s === 501 || s === 503;
}

async function getOrEmpty<T>(
  path: string,
  params: Record<string, unknown> | undefined,
  empty: T,
): Promise<T> {
  try {
    const res = await api.get<T>(path, { params });
    return res.data;
  } catch (err) {
    if (isSoftMissing(err)) return empty;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Defaults for soft-fail
// ---------------------------------------------------------------------------

const EMPTY_SETTINGS: AdminSettings = {
  google_oauth: { client_id_masked: '', configured: false },
  llm: {
    api_key_masked: '',
    configured: false,
    default_cap_tokens: 0,
    spend_mtd_usd: 0,
    spend_series: [],
  },
  defaults: {
    ramp_day1: 5,
    ramp_day7_target: 10,
    human_delay_min_s: 30,
    human_delay_max_s: 300,
    email_from_display_name: '',
    reply_to: '',
    warmup_log_retention_days: 7,
  },
  transactional_smtp: {
    host: '',
    port: 587,
    username: '',
    from_addr: '',
    starttls: true,
    password_masked: '',
    configured: false,
    mode: 'dry_run',
    env_host: '',
  },
  danger: { maintenance_mode: false },
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useAdminSettings(): UseQueryResult<AdminSettings> {
  return useQuery({
    queryKey: SETTINGS_KEYS.root,
    staleTime: 60_000,
    queryFn: () => getOrEmpty<AdminSettings>('/admin/settings', undefined, EMPTY_SETTINGS),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function invalidateSettings(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: SETTINGS_KEYS.root });
}

export function useUpdateLlmSettings(): UseMutationResult<void, unknown, UpdateLlmPayload> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      await api.patch('/admin/settings/llm', payload);
    },
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useUpdateOauthSettings(): UseMutationResult<void, unknown, UpdateOauthPayload> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      await api.patch('/admin/settings/google-oauth', payload);
    },
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useUpdateSmtpSettings(): UseMutationResult<void, unknown, UpdateSmtpPayload> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      await api.patch('/admin/settings/transactional-smtp', payload);
    },
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useUpdateDefaults(): UseMutationResult<void, unknown, UpdateDefaultsPayload> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      await api.patch('/admin/settings/defaults', payload);
    },
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useToggleMaintenance(): UseMutationResult<void, unknown, boolean> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled) => {
      await api.post('/admin/settings/maintenance', { enabled });
    },
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useRotateLlmKey(): UseMutationResult<void, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/admin/settings/llm/rotate-key');
    },
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useResetPeerPool(): UseMutationResult<void, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/admin/settings/peer-pool/reset-health');
    },
    onSuccess: () => {
      invalidateSettings(qc);
      qc.invalidateQueries({ queryKey: ['admin', 'peer-inboxes'] });
      qc.invalidateQueries({ queryKey: ['admin', 'peer-inboxes', 'stats'] });
    },
  });
}

export function useTestLlmConnection(): UseMutationResult<TestConnectionResult, unknown, void> {
  return useMutation({
    mutationFn: async () => {
      try {
        const res = await api.post('/admin/settings/llm/test');
        return res.data as TestConnectionResult;
      } catch (err) {
        if (isSoftMissing(err)) return { ok: false, error: 'not_available' };
        throw err;
      }
    },
  });
}

export function useTestOauthConnection(): UseMutationResult<TestConnectionResult, unknown, void> {
  return useMutation({
    mutationFn: async () => {
      try {
        const res = await api.post('/admin/settings/google-oauth/test');
        return res.data as TestConnectionResult;
      } catch (err) {
        if (isSoftMissing(err)) return { ok: false, error: 'not_available' };
        throw err;
      }
    },
  });
}

export function useTestSmtpConnection(): UseMutationResult<TestConnectionResult, unknown, void> {
  return useMutation({
    mutationFn: async () => {
      try {
        const res = await api.post('/admin/settings/transactional-smtp/test');
        return res.data as TestConnectionResult;
      } catch (err) {
        if (isSoftMissing(err)) return { ok: false, error: 'not_available' };
        throw err;
      }
    },
  });
}
