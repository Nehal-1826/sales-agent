import { useMemo } from 'react';
import {
  useNotificationEvents,
  useUserSettings,
  useWorkspaceProfile,
} from '@/features/settings/api';
import { useWorkspace } from '@/features/workspace/api';
import { useBranding } from '@/features/branding/api';
import { useCustomDomain } from '@/features/custom-domain/api';
import { useDedicatedPoolStatus } from '@/features/dedicated-pool/api';
import { useAuthStore } from '@/stores/auth';
import type { AgencySettingsData } from '@/pages/client/agency/AgSetC2Mosaic';

/**
 * Live-data adapter for the Agency-tier "Mosaic Mural" settings surface
 * (`pages/client/agency/AgSetC2Mosaic.tsx`).
 *
 * Maps the existing TanStack-Query settings + workspace + branding + custom
 * domain + dedicated pool hooks onto the exact `AgencySettingsData` shape
 * the mosaic consumes. Modelled on `useProPlusSettingsData.ts`: real data
 * where a hook surfaces it, skeleton fallbacks elsewhere (no fabrication).
 *
 *   - still loading user settings or workspace → `isLoading: true`, `data: null`
 *   - no workspace + no auth user             → `data: null`
 *
 * NB on synthesised fields. The backend doesn't currently expose:
 *   - region (skeleton `us-east-1`)
 *   - per-user lastLogin timestamp (skeleton `recently`)
 *   - email daily digest setting (skeleton `false` — only weekly is wired)
 *   - in-app critical toggle (skeleton `false`)
 *   - session timeout minutes (skeleton `60`)
 *   - active session count (skeleton `1`)
 *   - last password change timestamp (skeleton `unknown`)
 *   - recovery codes issued flag (skeleton `false`)
 *   - integrations list (skeleton `[]`)
 *   - API rate limit per minute (skeleton `600` — platform default)
 *   - seat limit (skeleton derived from plan: agency=10, pro_plus=5, pro=3,
 *     starter=1)
 *   - audit-log summary (skeleton zeros)
 *
 * Re-export the shape so callers (`settings/AgencySettings`) can import the
 * type from either module.
 */
export type { AgencySettingsData } from '@/pages/client/agency/AgSetC2Mosaic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function initialsFor(name: string, email: string): string {
  const base = (name || email || '').trim();
  if (!base) return '??';
  const parts = base
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) {
    return (base[0] ?? '?').toUpperCase() + (base[1] ?? '?').toUpperCase();
  }
  if (parts.length === 1) {
    const w = parts[0]!;
    return (w[0] ?? '?').toUpperCase() + (w[1] ?? '').toUpperCase();
  }
  return (
    (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '?').toUpperCase()
  );
}

/**
 * Slack incoming-webhook URLs encode the channel as the last path segment of
 * `hooks.slack.com/services/Txxx/Bxxx/<channelToken>`. We can't recover the
 * human-readable channel name from that token — surface a friendly hint
 * instead until the backend stores the channel display name alongside.
 */
function slackChannelFromWebhook(webhookUrl: string | null): string | null {
  if (!webhookUrl) return null;
  return '#warmup-alerts'; // TODO: skeleton — display name not stored separately
}

function seatLimitFor(plan: string | null | undefined): number {
  switch ((plan ?? '').toLowerCase()) {
    case 'agency':
    case 'agency plus':
      return 10;
    case 'pro_plus':
    case 'pro plus':
      return 5;
    case 'pro':
      return 3;
    case 'starter':
      return 1;
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencySettingsDataResult {
  data: AgencySettingsData | null;
  isLoading: boolean;
}

export function useAgencySettingsData(): UseAgencySettingsDataResult {
  const userSettingsQuery = useUserSettings();
  const workspaceQuery = useWorkspace();
  const workspaceProfileQuery = useWorkspaceProfile();
  const notificationsQuery = useNotificationEvents();
  const brandingQuery = useBranding();
  const domainQuery = useCustomDomain();
  const poolQuery = useDedicatedPoolStatus();
  const authUser = useAuthStore((s) => s.user);

  const isLoading = userSettingsQuery.isLoading || workspaceQuery.isLoading;

  const data = useMemo<AgencySettingsData | null>(() => {
    if (isLoading) return null;
    const ws = workspaceQuery.data;
    const settings = userSettingsQuery.data;
    if (!ws && !authUser && !settings) return null;

    const wsProfile = workspaceProfileQuery.data;
    const branding = brandingQuery.data;
    const customDomain = domainQuery.data;
    const pool = poolQuery.data;
    const events = notificationsQuery.data?.events ?? {};

    // ── profile ────────────────────────────────────────────────────
    const displayName =
      settings?.profile.display_name ||
      authUser?.name ||
      authUser?.email?.split('@')[0] ||
      'You';
    const email = settings?.profile.email ?? authUser?.email ?? '';
    const profile: AgencySettingsData['profile'] = {
      name: displayName,
      email,
      avatarInitials: initialsFor(displayName, email),
      timezone: settings?.profile.timezone || 'UTC',
      locale: settings?.profile.locale || 'en-US',
      // TODO: skeleton — no per-user lastLogin timestamp on /me yet.
      lastLoginAgo: 'recently',
    };

    // ── agency identity ────────────────────────────────────────────
    const agencyName =
      ws?.name ||
      (authUser?.email
        ? `${authUser.email.split('@')[0]}'s agency`
        : 'Your agency');
    const plan = titleCase(ws?.plan ?? authUser?.plan ?? 'agency');
    const brandColor =
      branding?.accent_color || wsProfile?.brand_color || '#F26522';
    const agency: AgencySettingsData['agency'] = {
      name: agencyName,
      slug: wsProfile?.slug || agencyName.toLowerCase().replace(/\s+/g, '-'),
      plan,
      // TODO: skeleton — workspace payload has no region field.
      region: 'us-east-1',
      brandColor,
      logoUploaded: !!branding?.has_logo,
      customDomain: {
        domain: customDomain?.domain ?? null,
        status: (customDomain?.status as AgencySettingsData['agency']['customDomain']['status']) ?? 'not_set',
      },
      dedicatedPool: {
        enabled: pool?.is_dedicated === true,
        poolName: pool?.pool_name ?? null,
        memberCount: pool?.member_count ?? 0,
      },
    };

    // ── notifications ──────────────────────────────────────────────
    const ns = settings?.notifications;
    const slackEnabled = !!ns?.slack_webhook;
    const notifications: AgencySettingsData['notifications'] = {
      emailWeeklyDigest:
        ns?.email_digest_enabled === true ||
        events.weekly_digest?.email === true,
      // TODO: skeleton — no daily-digest field; folded into weekly for now.
      emailDailyDigest: false,
      emailCriticalAlerts:
        ns?.alerts?.warmth_drop === true ||
        ns?.alerts?.bounce_spike === true ||
        ns?.alerts?.dns_break === true,
      slackEnabled,
      slackChannel: slackChannelFromWebhook(ns?.slack_webhook ?? null),
      // TODO: skeleton — no in-app-critical toggle.
      inAppCritical: false,
    };

    // ── security ───────────────────────────────────────────────────
    const security: AgencySettingsData['security'] = {
      twoFactorEnabled: settings?.security.totp_enabled === true,
      // TODO: skeleton — no session-timeout field; platform default 60.
      sessionTimeoutMinutes: 60,
      // TODO: skeleton — no sessions endpoint.
      activeSessions: 1,
      // TODO: skeleton — no password-change timestamp on /me.
      lastPasswordChangedAgo: 'unknown',
      // TODO: skeleton — recovery codes flag not surfaced.
      recoveryCodesIssued: false,
    };

    // ── integrations ───────────────────────────────────────────────
    // TODO: skeleton — no per-integration status endpoint. Empty array
    // until the connectors API ships; the mosaic shows an empty-state
    // tile rather than fabricating connections.
    const integrations: AgencySettingsData['integrations'] = [];

    // ── api access ─────────────────────────────────────────────────
    const apiAccess: AgencySettingsData['apiAccess'] = {
      // TODO: skeleton — no per-workspace rate-limit field; platform default.
      rateLimitPerMin: 600,
    };

    // ── team ───────────────────────────────────────────────────────
    const teamMembers = ws?.team_members ?? [];
    const seatLimit = seatLimitFor(ws?.plan ?? authUser?.plan);
    const team: AgencySettingsData['team'] = {
      memberCount: teamMembers.length,
      pendingInvites: teamMembers.filter((m) => m.accepted_at === null).length,
      seatLimit,
      seatUsed: teamMembers.length,
    };

    // ── audit summary ──────────────────────────────────────────────
    // TODO: skeleton — no audit-summary endpoint for client-side users
    // (it's super-admin gated). Zero everything.
    const audit: AgencySettingsData['audit'] = {
      last30dEntries: 0,
      lastAdminAction: '—',
      lastAdminActionAgo: '—',
    };

    return {
      profile,
      agency,
      notifications,
      security,
      integrations,
      apiAccess,
      team,
      audit,
    };
  }, [
    isLoading,
    userSettingsQuery.data,
    workspaceQuery.data,
    workspaceProfileQuery.data,
    notificationsQuery.data,
    brandingQuery.data,
    domainQuery.data,
    poolQuery.data,
    authUser,
  ]);

  return { data, isLoading };
}
