import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';

/**
 * User settings react-query hooks (spec §5.1 item 8).
 *
 * Reads are best-effort: on 404 / 501 / 503 they resolve to sensible defaults so
 * the UI still renders. Mutations invalidate the ['settings'] cache on success.
 */

export interface UserProfile {
  email: string;
  display_name: string;
  timezone: string;
  locale: string;
  /** Whether a profile picture is stored. Drives initials-vs-image fallback. */
  has_avatar?: boolean;
  /** Versioned URL of the avatar (auth-gated — fetch as a blob, not <img src>). */
  avatar_url?: string | null;
}

export interface NotificationAlerts {
  warmth_drop: boolean;
  bounce_spike: boolean;
  dns_break: boolean;
}

export interface NotificationSettings {
  slack_webhook: string | null;
  email_digest_enabled: boolean;
  alerts: NotificationAlerts;
}

export interface SecuritySettings {
  totp_enabled: boolean;
}

export interface TourStatus {
  completed_at: string | null;
}

export interface UserSettings {
  profile: UserProfile;
  notifications: NotificationSettings;
  security: SecuritySettings;
  tour: TourStatus;
}

export interface TotpEnrollment {
  secret: string;
  qr_url: string;
  recovery_codes: string[];
}

export const SETTINGS_KEY = ['settings'] as const;

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

const DEFAULT_SETTINGS: UserSettings = {
  profile: {
    email: '',
    display_name: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    locale: 'en-US',
  },
  notifications: {
    slack_webhook: null,
    email_digest_enabled: true,
    alerts: {
      warmth_drop: true,
      bounce_spike: true,
      dns_break: true,
    },
  },
  security: { totp_enabled: false },
  tour: { completed_at: null },
};

export function useUserSettings(): UseQueryResult<UserSettings> {
  return useQuery({
    queryKey: SETTINGS_KEY,
    staleTime: 60_000,
    queryFn: () =>
      getOrEmpty<UserSettings>('/workspace/settings', undefined, DEFAULT_SETTINGS),
  });
}

// ---------- mutations ----------

export function useUpdateProfile(): UseMutationResult<
  UserProfile,
  unknown,
  Partial<UserProfile>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/workspace/settings/profile', payload);
      return res.data as UserProfile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

// ---------- Profile picture (avatar) ----------

/** Auth-of-me query key — kept in sync with useAuthApi's useMe(). */
const AUTH_ME_KEY = ['auth', 'me'] as const;

export interface AvatarUploadResponse {
  has_avatar: boolean;
  avatar_url: string;
}

/**
 * Upload/replace the current user's profile picture (multipart POST).
 * Invalidates the settings query AND the auth/me query so the new avatar
 * shows up immediately wherever the user is rendered.
 */
export function useUploadAvatar(): UseMutationResult<
  AvatarUploadResponse,
  unknown,
  File
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/workspace/settings/profile/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as AvatarUploadResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: AUTH_ME_KEY });
      qc.invalidateQueries({ queryKey: AVATAR_BLOB_KEY });
    },
  });
}

export function useDeleteAvatar(): UseMutationResult<void, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/workspace/settings/profile/avatar');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: AUTH_ME_KEY });
      qc.invalidateQueries({ queryKey: AVATAR_BLOB_KEY });
    },
  });
}

export const AVATAR_BLOB_KEY = ['avatar-blob'] as const;

/**
 * Fetch the current user's avatar as an object URL. The avatar endpoint is
 * auth-gated, so an `<img src>` can't carry the bearer token — we fetch the
 * bytes via the shared axios instance and wrap them in a blob URL. Returns
 * `null` while loading or when no avatar is stored.
 */
export function useAvatarObjectUrl(
  hasAvatar: boolean | undefined,
  version: string | null | undefined,
): string | null {
  const q = useQuery({
    queryKey: [...AVATAR_BLOB_KEY, version ?? ''],
    enabled: !!hasAvatar,
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const res = await api.get('/workspace/settings/profile/avatar', {
        responseType: 'blob',
      });
      return URL.createObjectURL(res.data as Blob);
    },
  });
  return q.data ?? null;
}

export interface UpdateNotificationsPayload {
  slack_webhook?: string | null;
  email_digest_enabled?: boolean;
  alerts?: Partial<NotificationAlerts>;
}

export function useUpdateNotifications(): UseMutationResult<
  NotificationSettings,
  unknown,
  UpdateNotificationsPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/workspace/settings/notifications', payload);
      return res.data as NotificationSettings;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

/**
 * Begin TOTP enrollment. Backend returns the secret, an otpauth:// URL that
 * authenticator apps can render as a QR code, and a batch of recovery codes.
 * The secret is NOT persisted until `useVerifyTotp` confirms a valid code.
 */
export function useEnableTotp(): UseMutationResult<TotpEnrollment, unknown, void> {
  return useMutation({
    mutationFn: async () => {
      try {
        const res = await api.post('/workspace/settings/security/totp/enroll');
        return res.data as TotpEnrollment;
      } catch (err) {
        if (isSoftMissing(err)) {
          // Deterministic placeholder so the UI can complete the round-trip.
          const secret = 'JBSWY3DPEHPK3PXP';
          return {
            secret,
            qr_url: `otpauth://totp/WarmPulse:user@email?secret=${secret}&issuer=WarmPulse`,
            recovery_codes: Array.from({ length: 8 }).map((_, i) =>
              `${String(i + 1).padStart(2, '0')}-${secret.slice(0, 4)}-${secret.slice(-4)}`,
            ),
          } satisfies TotpEnrollment;
        }
        throw err;
      }
    },
  });
}

export function useVerifyTotp(): UseMutationResult<
  { enabled: boolean },
  unknown,
  { code: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code }) => {
      const res = await api.post('/workspace/settings/security/totp/verify', { code });
      return res.data as { enabled: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useDisableTotp(): UseMutationResult<void, unknown, { password: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ password }) => {
      await api.post('/workspace/settings/security/totp/disable', { password });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export function useChangePassword(): UseMutationResult<
  void,
  unknown,
  ChangePasswordPayload
> {
  return useMutation({
    mutationFn: async (payload) => {
      await api.post('/workspace/settings/security/password', payload);
    },
  });
}

export function useReplayTour(): UseMutationResult<void, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await api.post('/workspace/settings/tour/replay');
      } catch (err) {
        if (isSoftMissing(err)) return; // best-effort
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

// =====================================================================
// Pro Settings — workspace, sessions, event matrix, data export hooks.
// These extend the existing user-level hooks above with workspace-scoped
// persistence (one row per workspace_id in workspace_settings) and the
// 8-event × 3-channel notifications matrix.
// =====================================================================

export interface WorkspaceProfile {
  name: string;
  slug: string;
  default_sender: string;
  brand_color: string;
  retention_days: number;
  auto_crm_enabled: boolean;
}

export const WORKSPACE_PROFILE_KEY = ['workspace-profile'] as const;

const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = {
  name: 'Workspace',
  slug: 'workspace',
  default_sender: '',
  brand_color: '#F26522',
  retention_days: 90,
  auto_crm_enabled: false,
};

export function useWorkspaceProfile(): UseQueryResult<WorkspaceProfile> {
  return useQuery({
    queryKey: WORKSPACE_PROFILE_KEY,
    staleTime: 60_000,
    queryFn: () =>
      getOrEmpty<WorkspaceProfile>(
        '/workspace/settings/workspace',
        undefined,
        DEFAULT_WORKSPACE_PROFILE,
      ),
  });
}

export function useUpdateWorkspaceProfile(): UseMutationResult<
  WorkspaceProfile,
  unknown,
  Partial<WorkspaceProfile>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/workspace/settings/workspace', payload);
      return res.data as WorkspaceProfile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WORKSPACE_PROFILE_KEY });
    },
  });
}

// ---------- Notification events matrix ----------

export interface EventChannels {
  email: boolean;
  in_app: boolean;
  push: boolean;
}

export interface NotificationEventsResponse {
  events: Record<string, EventChannels>;
}

export const NOTIFICATION_EVENTS_KEY = ['notification-events'] as const;

const DEFAULT_EVENT_KEYS = [
  'mailbox_paused',
  'bounce_spike',
  'peer_failed',
  'weekly_digest',
  'invoice_paid',
  'invoice_failed',
  'member_invited',
  'product_updates',
] as const;

function emptyEvents(): Record<string, EventChannels> {
  const out: Record<string, EventChannels> = {};
  for (const k of DEFAULT_EVENT_KEYS) {
    out[k] = { email: true, in_app: true, push: false };
  }
  return out;
}

export function useNotificationEvents(): UseQueryResult<NotificationEventsResponse> {
  return useQuery({
    queryKey: NOTIFICATION_EVENTS_KEY,
    staleTime: 60_000,
    queryFn: () =>
      getOrEmpty<NotificationEventsResponse>(
        '/workspace/settings/notifications/events',
        undefined,
        { events: emptyEvents() },
      ),
  });
}

export interface NotificationEventUpdatePayload {
  key: string;
  channel: 'email' | 'in_app' | 'push';
  enabled: boolean;
}

export function useUpdateNotificationEvent(): UseMutationResult<
  NotificationEventsResponse,
  unknown,
  NotificationEventUpdatePayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch(
        '/workspace/settings/notifications/events',
        payload,
      );
      return res.data as NotificationEventsResponse;
    },
    // Optimistic update — toggle immediately and roll back on error.
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: NOTIFICATION_EVENTS_KEY });
      const prev = qc.getQueryData<NotificationEventsResponse>(
        NOTIFICATION_EVENTS_KEY,
      );
      if (prev?.events?.[payload.key]) {
        const next = {
          ...prev,
          events: {
            ...prev.events,
            [payload.key]: {
              ...prev.events[payload.key],
              [payload.channel]: payload.enabled,
            },
          },
        };
        qc.setQueryData(NOTIFICATION_EVENTS_KEY, next);
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      const prev = (ctx as { prev?: NotificationEventsResponse } | undefined)
        ?.prev;
      if (prev) qc.setQueryData(NOTIFICATION_EVENTS_KEY, prev);
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: NOTIFICATION_EVENTS_KEY }),
  });
}

// ---------- Sessions ----------

export interface SessionItem {
  id: string;
  kind: 'jwt' | 'api_key';
  label: string;
  detail: string;
  last_active: string | null;
  is_current: boolean;
}

export const SESSIONS_KEY = ['sessions'] as const;

export function useSessions(): UseQueryResult<SessionItem[]> {
  return useQuery({
    queryKey: SESSIONS_KEY,
    staleTime: 30_000,
    queryFn: () =>
      getOrEmpty<SessionItem[]>('/workspace/settings/sessions', undefined, []),
  });
}

export function useRevokeSession(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/workspace/settings/sessions/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

// ---------- Data export / GDPR / delete ----------

/**
 * Trigger a CSV download of the workspace's recent warmup logs. The
 * backend streams the file; we use a Blob anchor click rather than
 * navigating because the auth header has to be attached to the request.
 */
export async function exportWorkspaceCsv(): Promise<void> {
  const res = await api.get('/workspace/settings/data/export', {
    responseType: 'blob',
  });
  const blob = res.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `warmpulse-export-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface GdprRequestPayload {
  subject_email: string;
  reason?: string;
}

export function useSubmitGdprRequest(): UseMutationResult<
  { received_at: string; subject_email: string },
  unknown,
  GdprRequestPayload
> {
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post(
        '/workspace/settings/data/gdpr-request',
        payload,
      );
      return res.data as { received_at: string; subject_email: string };
    },
  });
}

export function useRequestWorkspaceDeletion(): UseMutationResult<
  { queued_at: string; expected_completion: string },
  unknown,
  void
> {
  return useMutation({
    mutationFn: async () => {
      const res = await api.delete('/workspace/settings/workspace');
      return res.data as { queued_at: string; expected_completion: string };
    },
  });
}

// =====================================================================
// Outbound webhooks (Pro Tier — D2)
// =====================================================================

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  last_delivery_at: string | null;
  last_status: string | null;
}

export interface WebhookCreateResponse extends Webhook {
  secret: string;
}

export interface WebhookCreatePayload {
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

export const WEBHOOKS_KEY = ['webhooks'] as const;

export function useWebhooks(): UseQueryResult<Webhook[]> {
  return useQuery({
    queryKey: WEBHOOKS_KEY,
    staleTime: 30_000,
    queryFn: () => getOrEmpty<Webhook[]>('/workspace/webhooks', undefined, []),
  });
}

export function useCreateWebhook(): UseMutationResult<
  WebhookCreateResponse,
  unknown,
  WebhookCreatePayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/workspace/webhooks', payload);
      return res.data as WebhookCreateResponse;
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

export function useTestWebhook(): UseMutationResult<
  WebhookDelivery,
  unknown,
  string
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/workspace/webhooks/${id}/test`);
      return res.data as WebhookDelivery;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WEBHOOKS_KEY }),
  });
}
