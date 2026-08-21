/**
 * Admin write actions — super_admin-gated mutations against /api/admin/*.
 *
 * Mirrors lib/mutations.ts: thin useMutation wrappers over authFetch that
 * invalidate the matching admin-* read queries (lib/adminData.ts) on success.
 * Components call these and surface their own Alert feedback.
 *
 * Notes:
 *  - 204 responses resolve to undefined via authFetch (lib/api.ts).
 *  - All PATCH bodies hit schemas with extra="forbid" — send only the fields
 *    listed per hook.
 *  - Two endpoints take params on the query string (not the body): set-user-plan
 *    (plan_id) and revert-pool-routing (workspace_id).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from './api';

function jsonBody(method: string, body?: unknown) {
  return { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };
}

/* ----------------------------------- users ---------------------------------- */

export type ImpersonateResult = { access_token: string; email: string; expires_in_minutes: string };

/** Suspend a user (is_suspended = true). 204. */
export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => authFetch<void>(`/api/admin/users/${userId}/suspend`, jsonBody('POST')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

/** Unsuspend a user. 204. */
export function useUnsuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => authFetch<void>(`/api/admin/users/${userId}/unsuspend`, jsonBody('POST')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

/** Manually reassign a user's plan. plan_id is a query param (no body). 204. */
export function useSetUserPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, planId }: { userId: string; planId: string }) =>
      authFetch<void>(`/api/admin/users/${userId}/plan?plan_id=${encodeURIComponent(planId)}`, jsonBody('POST')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

/** Hard-delete a user + cascade. Refuses self / super_admins. 204. */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => authFetch<void>(`/api/admin/users/${userId}`, jsonBody('DELETE')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

/** Mark a user sabotaged + trigger respamming (retention). 204. */
export function useSabotageUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => authFetch<void>(`/api/admin/users/${userId}/sabotage`, jsonBody('POST')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

/** Remove the sabotaged flag. 204. */
export function useUnsabotageUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => authFetch<void>(`/api/admin/users/${userId}/unsabotage`, jsonBody('POST')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

/** Mint a 30-min impersonation token for a user (refuses super_admins). */
export function useImpersonateUser() {
  return useMutation({
    mutationFn: (userId: string) =>
      authFetch<ImpersonateResult>(`/api/admin/users/${userId}/impersonate`, jsonBody('POST')),
  });
}

/* ------------------------------- peer inboxes ------------------------------- */

/** Delete a peer inbox. 204. */
export function useDeletePeer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (peerId: string) => authFetch<void>(`/api/admin/peer-inboxes/${peerId}`, jsonBody('DELETE')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-peers'] });
      qc.invalidateQueries({ queryKey: ['admin-peer-stats'] });
    },
  });
}

/** Zero used_today for one peer. Returns the updated peer. */
export function useResetPeerCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (peerId: string) =>
      authFetch<void>(`/api/admin/peer-inboxes/${peerId}/reset-capacity`, jsonBody('POST')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-peers'] });
      qc.invalidateQueries({ queryKey: ['admin-peer-stats'] });
    },
  });
}

/** Zero used_today for ALL peers. Returns { peers_reset }. */
export function useResetAllPeerCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authFetch<{ peers_reset: number }>(`/api/admin/peer-inboxes/reset-capacity`, jsonBody('POST')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-peers'] });
      qc.invalidateQueries({ queryKey: ['admin-peer-stats'] });
    },
  });
}

export type TestConnectionInput = { smtp_host?: string; smtp_port?: number; imap_host?: string; imap_port?: number };
export type TestConnectionResult = { smtp_ok: boolean; imap_ok: boolean; smtp_error?: string; imap_error?: string };

/** Test stored (or override) SMTP/IMAP creds for a peer. */
export function useTestPeerConnection() {
  return useMutation({
    mutationFn: ({ peerId, override }: { peerId: string; override?: TestConnectionInput }) =>
      authFetch<TestConnectionResult>(`/api/admin/peer-inboxes/${peerId}/test-connection`, jsonBody('POST', override ?? {})),
  });
}

export type PeerPatch = { daily_capacity?: number; is_active?: boolean };

/** Patch a peer's capacity / active flag. extra="forbid". */
export function usePatchPeer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ peerId, patch }: { peerId: string; patch: PeerPatch }) =>
      authFetch<void>(`/api/admin/peer-inboxes/${peerId}`, jsonBody('PATCH', patch)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-peers'] });
      qc.invalidateQueries({ queryKey: ['admin-peer-stats'] });
    },
  });
}

/* ------------------------------ pool routing -------------------------------- */

/** Assign (or reassign) a workspace to a pool. Upsert. */
export function useAssignPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, poolId }: { workspaceId: string; poolId: string }) =>
      authFetch<void>('/api/admin/pool-routing', jsonBody('POST', { workspace_id: workspaceId, pool_id: poolId })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pool-assignments'] });
      qc.invalidateQueries({ queryKey: ['admin-peer-pools'] });
    },
  });
}

/** Revert a workspace to the default pool. workspace_id is a query param. 204. */
export function useRevertPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) =>
      authFetch<void>(`/api/admin/pool-routing?workspace_id=${encodeURIComponent(workspaceId)}`, jsonBody('DELETE')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pool-assignments'] });
      qc.invalidateQueries({ queryKey: ['admin-peer-pools'] });
    },
  });
}

/* --------------------------------- settings --------------------------------- */

export type DefaultsPatch = {
  ramp_day1?: number;
  ramp_day7_target?: number;
  human_delay_min_s?: number;
  human_delay_max_s?: number;
  email_from_display_name?: string;
  reply_to?: string;
  warmup_log_retention_days?: number;
};

/** PATCH warmup defaults. extra="forbid". 204. */
export function useUpdateDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: DefaultsPatch) => authFetch<void>('/api/admin/settings/defaults', jsonBody('PATCH', patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
  });
}

export type LlmPatch = { api_key?: string | null; default_cap_tokens?: number | null };

/** PATCH LLM key + cap. extra="forbid". 204. */
export function useUpdateLlm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: LlmPatch) => authFetch<void>('/api/admin/settings/llm', jsonBody('PATCH', patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
  });
}

/** Drop the stored LLM key (forces fallback provider). 204. */
export function useRotateLlmKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authFetch<void>('/api/admin/settings/llm/rotate-key', jsonBody('POST')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
  });
}

/** Send a test LLM request with the configured key. */
export function useTestLlm() {
  return useMutation({
    mutationFn: () => authFetch<{ ok: boolean; error?: string }>('/api/admin/settings/llm/test', jsonBody('POST')),
  });
}

export type OauthPatch = { client_id?: string | null; client_secret?: string | null };

/** PATCH Google OAuth creds. extra="forbid". 204. */
export function useUpdateOauth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: OauthPatch) => authFetch<void>('/api/admin/settings/google-oauth', jsonBody('PATCH', patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
  });
}

/** Test the configured Google OAuth creds. */
export function useTestOauth() {
  return useMutation({
    mutationFn: () => authFetch<{ ok: boolean; error?: string }>('/api/admin/settings/google-oauth/test', jsonBody('POST')),
  });
}

export type SmtpPatch = {
  host?: string | null;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  from_addr?: string | null;
  starttls?: boolean | null;
};

/** PATCH transactional SMTP. extra="forbid". 204. */
export function useUpdateSmtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SmtpPatch) => authFetch<void>('/api/admin/settings/transactional-smtp', jsonBody('PATCH', patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
  });
}

/** Send a real test email to the admin via transactional SMTP. */
export function useTestSmtp() {
  return useMutation({
    mutationFn: () => authFetch<{ ok: boolean; detail?: string; error?: string }>('/api/admin/settings/transactional-smtp/test', jsonBody('POST')),
  });
}

/** Toggle platform maintenance mode. 204. */
export function useToggleMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => authFetch<void>('/api/admin/settings/maintenance', jsonBody('POST', { enabled })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
  });
}

/** Reset ALL peer reputation scores + daily counters. 204. */
export function useResetPeerHealth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authFetch<void>('/api/admin/settings/peer-pool/reset-health', jsonBody('POST')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['admin-peers'] });
      qc.invalidateQueries({ queryKey: ['admin-peer-stats'] });
    },
  });
}

/* ----------------------------------- plans ---------------------------------- */

/** Set a plan's monthly token cap. Returns the new cap. */
export function useSetPlanTokenCap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, cap }: { planId: string; cap: number }) =>
      authFetch<{ plan_id: string; token_cap_per_month: number }>(
        `/api/admin/llm-usage/caps/${planId}`,
        jsonBody('POST', { token_cap_per_month: cap }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-llm-summary'] });
      qc.invalidateQueries({ queryKey: ['admin-all-plans'] });
    },
  });
}
