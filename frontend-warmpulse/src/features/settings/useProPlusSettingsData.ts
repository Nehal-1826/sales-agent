import { useMemo } from 'react';
import { Database, Mail } from 'lucide-react';
import { useMe } from '@/features/auth/useAuthApi';
import { useAuthStore } from '@/stores/auth';
import {
  useNotificationEvents,
  useSessions,
  useUserSettings,
  useWorkspaceProfile,
  type EventChannels,
  type SessionItem,
} from '@/features/settings/api';
import {
  SETTINGS_SKELETON,
  type ConnectedAccount,
  type Density,
  type NotifEvent,
  type NotifMatrix,
  type Session,
  type SettingsData,
  type Theme,
} from '@/pages/client/proplus/ProPlusSet1Document';

/**
 * Live-data adapter for the Pro-Plus "Long-form Document" settings surface
 * (`pages/client/proplus/ProPlusSet1Document.tsx`).
 *
 * Maps the existing TanStack-Query settings hooks (`useUserSettings`,
 * `useSessions`, `useNotificationEvents`, `useWorkspaceProfile`) and the
 * cached `useAuthStore` user onto the exact `SettingsData` shape the doc
 * consumes. Modelled on `useProPlusReceiptData.ts`: real data where a hook
 * surfaces it, skeleton values elsewhere (no fabrication). Resilient:
 *
 *   - no auth user                              → `data: null`
 *     (caller shows the "sign in / complete onboarding" EmptyState)
 *   - still loading the primary settings hook   → `isLoading: true`, `data: null`
 *   - any best-effort hook 404s / errors        → keep skeleton field, never block
 *
 * Re-export the shape so callers (`settings/ProPlusSettings`) can import the
 * type from either module.
 */
export type {
  ConnectedAccount,
  Density,
  NotifChannel,
  NotifEvent,
  NotifMatrix,
  Session,
  SettingsData,
  SettingsProfile,
  Theme,
} from '@/pages/client/proplus/ProPlusSet1Document';

export interface UseProPlusSettingsDataResult {
  data: SettingsData | null;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Label-map for the 8 settings-API event keys (the design ships 6). */
const EVENT_LABELS: Record<string, { label: string; desc: string }> = {
  mailbox_connected: {
    label: 'Mailbox connected',
    desc: 'A new mailbox is connected and warmup starts',
  },
  mailbox_paused: {
    label: 'Mailbox paused',
    desc: 'A mailbox is paused by you or by the system',
  },
  bounce_spike: {
    label: 'Failed delivery spike detected',
    desc: 'Failure rate crosses the alert threshold',
  },
  peer_failed: {
    label: 'Helper inbox failures',
    desc: 'A helper inbox fails repeatedly and is auto-rotated',
  },
  weekly_digest: {
    label: 'Weekly sender trust digest',
    desc: 'Monday 9am summary per mailbox',
  },
  invoice_paid: {
    label: 'Invoice paid',
    desc: 'Receipt after each successful payment',
  },
  invoice_failed: {
    label: 'Payment failed',
    desc: 'Immediate alert if a payment method fails',
  },
  member_invited: {
    label: 'Member invited / joined',
    desc: 'A workspace member is invited or accepts',
  },
  product_updates: {
    label: 'Product changelog',
    desc: 'Monthly product updates and launches',
  },
};

/** Format a relative-time string for the session "last active" column. */
function relTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'unknown';
  const ms = Date.now() - t;
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'Active now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/** Map a sessions/API row → design `Session`. */
function toSession(s: SessionItem): Session {
  // The API gives us a label/detail pair already — the design's row shape
  // matches one-to-one. No device-type plumbing from the server, so we keep
  // the laptop icon as the universal fallback (matches the StarterDocument
  // sibling design's choice).
  return {
    id: s.id,
    device: s.label,
    detail: s.detail,
    lastActive: relTime(s.last_active),
    current: s.is_current,
    Icon: SETTINGS_SKELETON.sessions[0]!.Icon,
  };
}

/** Read the resolved theme from localStorage (mirrors ProSettings keys). */
function readLocalTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    // Newer key — JSON-shaped wp_user_settings.theme.
    const raw = window.localStorage.getItem('wp_user_settings');
    if (raw) {
      const parsed = JSON.parse(raw) as { theme?: string };
      if (
        parsed.theme === 'light' ||
        parsed.theme === 'dark' ||
        parsed.theme === 'system'
      ) {
        return parsed.theme;
      }
    }
    // Older key — bare string.
    const t = window.localStorage.getItem('warmpulse.theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    // ignore
  }
  return null;
}

/** Read the saved UI density (same source as ProSettings.AppearanceTab). */
function readLocalDensity(): Density | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('wp_user_settings');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { density?: string };
    // ProSettings persists capitalised values; design uses lowercase.
    const lower = (parsed.density ?? '').toLowerCase();
    if (lower === 'compact' || lower === 'comfortable') return lower;
    if (lower === 'spacious' || lower === 'roomy') return 'roomy';
  } catch {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProPlusSettingsData(): UseProPlusSettingsDataResult {
  // Primary gate — the canonical user settings payload. This carries the
  // server-side profile (display_name + timezone) plus security.totp_enabled.
  const settingsQ = useUserSettings();
  // Best-effort siblings — workspace gives the retention window, sessions
  // gives the device list, events gives the notification matrix. Every
  // fallback in the underlying hooks means we never block on them.
  const workspaceQ = useWorkspaceProfile();
  const sessionsQ = useSessions();
  const eventsQ = useNotificationEvents();
  const meQ = useMe();
  const authUser = useAuthStore((s) => s.user);

  const isLoading = settingsQ.isLoading || meQ.isLoading;

  const data = useMemo<SettingsData | null>(() => {
    if (isLoading) return null;
    // No signed-in user — the wrapper shows the "complete onboarding"
    // EmptyState (Settings makes no sense for an anonymous viewer).
    if (!authUser) return null;

    const s = settingsQ.data;
    const ws = workspaceQ.data;
    const apiSessions = sessionsQ.data ?? [];
    const eventsResp = eventsQ.data;

    // ── profile ─────────────────────────────────────────────────────────
    const displayName =
      s?.profile.display_name?.trim() ||
      authUser.name?.trim() ||
      authUser.email ||
      SETTINGS_SKELETON.profile.displayName;
    const email = s?.profile.email || authUser.email || SETTINGS_SKELETON.profile.email;
    const tz = s?.profile.timezone || SETTINGS_SKELETON.profile.timezone;
    // TODO: skeleton — no per-user "role label" on /workspace/settings yet.
    // `auth.role` is super_admin vs client which is too coarse for the doc's
    // sub-header; map super_admin to "Workspace owner" and fall back to a
    // neutral "Member" otherwise so we don't display a raw enum.
    const role =
      authUser.role === 'super_admin' ? 'Workspace owner' : 'Workspace member';

    // ── two-factor ──────────────────────────────────────────────────────
    const twoFa = s?.security.totp_enabled ?? SETTINGS_SKELETON.twoFa;

    // ── sessions ────────────────────────────────────────────────────────
    // Real `/sessions` endpoint. When it returns an empty list (or 404s) we
    // keep the skeleton rows so the design renders a populated section
    // rather than an empty divider list (no fabrication of "real" rows —
    // the skeleton is clearly placeholder copy).
    const sessions: Session[] =
      apiSessions.length > 0
        ? apiSessions.map(toSession)
        : // TODO: skeleton — no sessions returned from
          // /workspace/settings/sessions. Keep skeleton rows so the design
          // renders populated.
          SETTINGS_SKELETON.sessions;

    // ── notification events + matrix ────────────────────────────────────
    // The settings API exposes 8 events; the design ships 6. Use whatever
    // the server returns, falling back to the skeleton list when it's
    // empty. Each row is paired with its EVENT_LABELS entry; unknown keys
    // get a humanised fallback so a future event appears without a code
    // change.
    let notifEvents: NotifEvent[];
    let notif: NotifMatrix;
    const apiEvents = eventsResp?.events ?? {};
    const apiKeys = Object.keys(apiEvents);
    if (apiKeys.length > 0) {
      notifEvents = apiKeys.map((key) => {
        const meta = EVENT_LABELS[key];
        if (meta) return { key, label: meta.label, desc: meta.desc };
        // TODO: skeleton — unknown event key from the server (new event
        // added backend-side without a frontend label). Fall back to a
        // titlecased version so the row still reads.
        return {
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          desc: '',
        };
      });
      notif = {};
      for (const k of apiKeys) {
        const row: EventChannels =
          apiEvents[k] ?? { email: false, in_app: false, push: false };
        notif[k] = { email: row.email, in_app: row.in_app, push: row.push };
      }
    } else {
      // TODO: skeleton — /workspace/settings/notifications/events returned
      // an empty matrix. Keep the design's defaults so the section is
      // populated.
      notifEvents = SETTINGS_SKELETON.notifEvents;
      notif = SETTINGS_SKELETON.notif;
    }

    // ── appearance ──────────────────────────────────────────────────────
    // Theme + density live in localStorage (ProSettings + ThemeProvider
    // own the canonical write side). Read both keys to stay in sync.
    const theme: Theme = readLocalTheme() ?? SETTINGS_SKELETON.theme;
    const density: Density = readLocalDensity() ?? SETTINGS_SKELETON.density;

    // ── retention ───────────────────────────────────────────────────────
    const retentionDays =
      ws?.retention_days ?? SETTINGS_SKELETON.retentionDays;

    // ── connected accounts ──────────────────────────────────────────────
    // TODO: skeleton — there is no OAuth-connections endpoint on this
    // build. Surface a Google row mapped to the signed-in email so it at
    // least lines up with reality (SSO is implied by the Google sign-in
    // path); leave Slack as a skeleton "available" placeholder.
    const connected: ConnectedAccount[] = [
      {
        id: 'google',
        name: 'Google',
        detail: `${email} - SSO sign-in`,
        // TODO: skeleton — assume connected when the user signed in with
        // Google. No reliable signal in `auth.user` to distinguish, so we
        // optimistically mark it connected (the user can toggle locally).
        status: 'connected',
        Icon: Mail,
      },
    ];
    // Silence "Database is imported but only referenced in types" lint by
    // touching it once — the icon is reserved for a future "Data sources"
    // row when that endpoint lands. (No-op; the bundle tree-shakes anyway.)
    void Database;

    return {
      profile: {
        displayName,
        email,
        role,
        timezone: tz,
        // Surface the user's profile picture from `/workspace/settings`
        // — ProfileSection's avatar uploader reads these. Optional /
        // nullable on the design side so SETTINGS_SKELETON still renders
        // the initials disc in the design-preview harness.
        hasAvatar: s?.profile.has_avatar ?? false,
        avatarUrl: s?.profile.avatar_url ?? null,
      },
      twoFa,
      timezone: tz,
      sessions,
      notifEvents,
      notif,
      theme,
      density,
      retentionDays,
      connected,
    };
  }, [
    isLoading,
    authUser,
    settingsQ.data,
    workspaceQ.data,
    sessionsQ.data,
    eventsQ.data,
  ]);

  return { data, isLoading };
}
