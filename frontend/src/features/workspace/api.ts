import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

/**
 * Workspace react-query hooks (spec §5.1 item 7).
 *
 * `useWorkspace()` is a single aggregate read — it pulls the workspace, team,
 * sub-clients, API keys, and a 30-day activity series so the Overview, Team,
 * Sub-Clients, and API Keys tabs can render without waterfall requests.
 * Soft-fail on 404/501/503 so every piece renders empty rather than throwing.
 */

// All four real tiers + the legacy `free` slug used by older fixtures.
// Earlier this union was missing `pro_plus`, so any Pro Plus value
// coming through the workspace API got narrowed away by TypeScript
// callers and silently mapped to a fallback (most often `pro`).
export type WorkspacePlan = 'free' | 'starter' | 'pro' | 'pro_plus' | 'agency';
export type TeamRole = 'owner' | 'admin' | 'member';

export interface WorkspaceInfo {
  name: string;
  plan: WorkspacePlan;
  created_at: string;
}

export interface TeamMember {
  id: string;
  email: string;
  role: TeamRole;
  can_invite: boolean;
  invited_at: string;
  accepted_at: string | null;
}

export interface SubClient {
  id: string;
  name: string;
  owner_email: string;
  mailbox_count: number;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_hash_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface TeamActivityPoint {
  date: string;
  invites: number;
  accepted: number;
}

export interface WorkspaceData extends WorkspaceInfo {
  team_members: TeamMember[];
  sub_clients: SubClient[];
  api_keys: ApiKey[];
  team_activity_series: TeamActivityPoint[];
}

export const WORKSPACE_KEY = ['workspace'] as const;

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

// Synthesize an empty 30-day activity series so the chart has an x-axis scale
// even when the backend endpoint is not wired up.
function emptyActivitySeries(): TeamActivityPoint[] {
  const today = new Date();
  return Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    return { date: d.toISOString().slice(0, 10), invites: 0, accepted: 0 };
  });
}

/**
 * Synthesize a minimal workspace from the auth-store user. Used as a final
 * safety net so the workspace UI always has SOMETHING to render — even if
 * every backend endpoint is unreachable. We'd rather show "Workspace ·
 * user@example.com · Free" than a "Workspace not loaded" wall.
 */
function synthesizeFromAuth(): WorkspaceData | null {
  const user = useAuthStore.getState().user;
  if (!user) return null;
  const localPart = user.email?.split('@')[0] ?? 'workspace';
  const name = `${localPart}'s workspace`;
  const plan = (user.plan as WorkspacePlan | undefined) ?? 'free';
  return {
    name,
    plan,
    created_at: '',
    team_members: [],
    sub_clients: [],
    api_keys: [],
    team_activity_series: emptyActivitySeries(),
  };
}

/**
 * Single aggregate hook. Accepts either a `/workspace` response that includes
 * everything or falls back to reading each collection separately. When every
 * backend probe fails (404/501/503), we synthesize from the auth-store user
 * so the page always renders. Only auth failures (401/403) bubble.
 */
export function useWorkspace(): UseQueryResult<WorkspaceData | null> {
  return useQuery<WorkspaceData | null>({
    queryKey: WORKSPACE_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      // Try the all-in-one endpoint first.
      try {
        const res = await api.get('/workspace');
        const d = res.data as Partial<WorkspaceData> & Record<string, unknown>;
        if (d && typeof d === 'object' && 'name' in d && 'plan' in d) {
          return {
            name: String(d.name ?? ''),
            plan: (d.plan as WorkspacePlan) ?? 'free',
            created_at: String(d.created_at ?? ''),
            team_members: (d.team_members as TeamMember[]) ?? [],
            sub_clients: (d.sub_clients as SubClient[]) ?? [],
            api_keys: (d.api_keys as ApiKey[]) ?? [],
            team_activity_series:
              (d.team_activity_series as TeamActivityPoint[]) ?? emptyActivitySeries(),
          };
        }
      } catch (err) {
        // Only swallow "endpoint not implemented yet" responses. Real auth
        // errors (401/403) and network failures should still bubble so the
        // axios refresh interceptor + toast can react.
        if (!isSoftMissing(err)) throw err;
      }

      // Fallback: parallel fetches with soft-fail.
      const [workspace, team, subs, keys, activity] = await Promise.all([
        getOrEmpty<WorkspaceInfo | null>('/workspace/info', undefined, null),
        getOrEmpty<TeamMember[] | { items: TeamMember[] }>(
          '/workspace/team',
          undefined,
          [],
        ),
        getOrEmpty<SubClient[] | { items: SubClient[] }>(
          '/workspace/sub-clients',
          undefined,
          [],
        ),
        getOrEmpty<ApiKey[] | { items: ApiKey[] }>(
          '/workspace/api-keys',
          undefined,
          [],
        ),
        getOrEmpty<TeamActivityPoint[] | { items: TeamActivityPoint[] }>(
          '/workspace/team-activity',
          { days: 30 },
          emptyActivitySeries(),
        ),
      ]);

      // Final safety net: if /workspace/info also 404'd, synthesize from
      // the auth-store so the UI never shows "Workspace not loaded".
      if (!workspace) return synthesizeFromAuth();

      const pickArr = <T,>(v: T[] | { items: T[] }): T[] =>
        Array.isArray(v) ? v : v.items ?? [];

      return {
        ...workspace,
        team_members: pickArr(team),
        sub_clients: pickArr(subs),
        api_keys: pickArr(keys),
        team_activity_series: Array.isArray(activity) ? activity : activity.items ?? [],
      } satisfies WorkspaceData;
    },
  });
}

// ---------- mutations ----------

export interface InviteMemberPayload {
  email: string;
  role: TeamRole;
  can_invite?: boolean;
}

export function useInviteMember(): UseMutationResult<TeamMember, unknown, InviteMemberPayload> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/workspace/team/invites', payload);
      return res.data as TeamMember;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKSPACE_KEY }),
  });
}

export function useRemoveMember(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/workspace/team/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKSPACE_KEY }),
  });
}

export interface CreateSubClientPayload {
  name: string;
  owner_email: string;
}

export function useCreateSubClient(): UseMutationResult<
  SubClient,
  unknown,
  CreateSubClientPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/workspace/sub-clients', payload);
      return res.data as SubClient;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKSPACE_KEY }),
  });
}

export function useDeleteSubClient(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/workspace/sub-clients/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKSPACE_KEY }),
  });
}

/**
 * Creating an API key returns the raw key ONCE. The caller must display it to
 * the user immediately and then drop it from state — we never refetch it.
 */
export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
  key_hash_prefix: string;
  created_at: string;
}

export function useCreateApiKey(): UseMutationResult<
  CreateApiKeyResponse,
  unknown,
  { name: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name }) => {
      const res = await api.post('/workspace/api-keys', { name });
      return res.data as CreateApiKeyResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKSPACE_KEY }),
  });
}

export function useRevokeApiKey(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/workspace/api-keys/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKSPACE_KEY }),
  });
}

// ---------- webhooks ----------
//
// Outbound webhook subscriptions. Backend: `/api/workspace/webhooks`
// (workspace_webhooks.py). The list is its own query (separate from the
// aggregate `useWorkspace()` read) so it refetches independently after
// create / delete / test without re-pulling the whole workspace payload.

/**
 * Event keys the backend accepts (mirror of `_ALLOWED_EVENTS` in
 * workspace_webhooks.py). Keep this list in sync if the backend matrix grows.
 */
export const WEBHOOK_EVENTS = [
  'mailbox_paused',
  'bounce_spike',
  'peer_failed',
  'weekly_digest',
  'invoice_paid',
  'invoice_failed',
  'member_invited',
  'product_updates',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  mailbox_paused: 'Mailbox paused',
  bounce_spike: 'Failed delivery spike',
  peer_failed: 'Helper inbox failed',
  weekly_digest: 'Weekly digest',
  invoice_paid: 'Invoice paid',
  invoice_failed: 'Invoice failed',
  member_invited: 'Member invited',
  product_updates: 'Product updates',
};

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  last_delivery_at: string | null;
  last_status: string | null;
}

/** Create response carries the plaintext signing secret ONCE — show it then drop it. */
export interface CreateWebhookResponse extends Webhook {
  secret: string;
}

export interface CreateWebhookPayload {
  url: string;
  events: string[];
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  attempt: number;
  status: string;
  response_code: number | null;
  error_text: string | null;
  created_at: string;
}

export const WEBHOOKS_KEY = ['workspace', 'webhooks'] as const;

export function useWebhooks(): UseQueryResult<Webhook[]> {
  return useQuery<Webhook[]>({
    queryKey: WEBHOOKS_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      // Soft-fail on 404/501/503 so the panel renders an empty state
      // rather than throwing, consistent with useWorkspace().
      return getOrEmpty<Webhook[]>('/workspace/webhooks', undefined, []);
    },
  });
}

export function useCreateWebhook(): UseMutationResult<
  CreateWebhookResponse,
  unknown,
  CreateWebhookPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/workspace/webhooks', payload);
      return res.data as CreateWebhookResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WEBHOOKS_KEY }),
  });
}

export function useDeleteWebhook(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/workspace/webhooks/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WEBHOOKS_KEY }),
  });
}

export function useTestWebhook(): UseMutationResult<WebhookDelivery, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/workspace/webhooks/${id}/test`);
      return res.data as WebhookDelivery;
    },
    // A test send updates last_delivery_at / last_status on the row.
    onSuccess: () => qc.invalidateQueries({ queryKey: WEBHOOKS_KEY }),
  });
}
