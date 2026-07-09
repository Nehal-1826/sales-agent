import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import {
  useWebhooks,
  useWorkspace,
  type ApiKey,
  type SubClient,
  type TeamMember,
} from '@/features/workspace/api';
import { useBranding } from '@/features/branding/api';
import { useCustomDomain } from '@/features/custom-domain/api';
import { useDedicatedPoolStatus } from '@/features/dedicated-pool/api';
import { useAuthStore } from '@/stores/auth';
import type { Mailbox } from '@/features/mailboxes/types';
import { AGENCY_WORKSPACE_SKELETON_W2 } from '@/pages/client/agency/AgWksW2Harbor';
import type { AgencyWorkspaceData } from '@/pages/client/agency/AgWksC1Federation';

/**
 * Live-data adapter for the Agency-tier "Marina Harbor" workspace surface
 * (`pages/client/agency/AgWksW2Harbor.tsx` — the locked-live design).
 *
 * W2 is the nautical-chart workspace: agency = harbormaster lighthouse,
 * sub-clients = ships moored in numbered slips along tier-grouped piers,
 * with a rotating beam, bathymetric grid, compass rose, animated wakes,
 * tide chart, weather/bulletin cards and a port-amenities feature rail.
 *
 * Maps the existing TanStack-Query workspace / mailbox / branding / custom
 * domain / dedicated pool / webhooks hooks onto the exact
 * `AgencyWorkspaceData` shape the harbor consumes. Modelled on the sibling
 * Agency adapters (`useAgencyDashboardData`, `useAgencyMailboxesData`,
 * `useAgencyBillingData`, `useAgencySettingsData`,
 * `useAgencyActivityData`, `useAgencyAnalyticsData`,
 * `useAgencyReputationData`): real data where a hook surfaces it,
 * skeleton zeros + zero-fill empty collections elsewhere (no fabrication).
 *
 *   - still loading the workspace → `isLoading: true`, `data: null`
 *   - no workspace + no auth user → `data: null`
 *     (caller shows the shared PageLoader empty state)
 *
 * NB on synthesised / zero-fill fields. The backend doesn't yet surface
 * several per-sub-client / agency metrics, so:
 *   - `subClients[].avgWarmth` is the mean of warmth_score across each
 *     sub-client's mailbox bucket (matched by owner_email domain); the
 *     mailbox roster is the authoritative source. Zero when the
 *     sub-client has no matching mailboxes yet.
 *   - `subClients[].status` is derived from the bucket's mean warmth
 *     (≥70 healthy / ≥40 warming / <40 at_risk; zero-mailbox →
 *     `inactive`). Mirrors the same banding the dashboard adapter uses.
 *   - `subClients[].monthlyMrrUsd` is zero-filled. No per-sub-client MRR
 *     column exists yet; the harbor surfaces $0 rather than fabricating
 *     dollar amounts the user might trust.
 *   - `subClients[].plan` defaults to 'Pro' — no per-sub-client plan
 *     column on the backend yet. The W2 harbor tiers sub-clients into
 *     Pier A (Pro Plus) / Pier B (Pro) / Pier C (Starter) by this field;
 *     until the column ships every sub-client docks at Pier B (Pro).
 *   - `subClients[].teamCount` is zero-filled until per-sub-client team
 *     headcount surfaces.
 *   - `team[].subClientsManaged` is zero-filled — workspace owner is
 *     marked as managing all sub-clients, everyone else 0.
 *   - `team[].lastActiveAgo` derives from `member.accepted_at` /
 *     `member.invited_at` with a coarse relative-time formatter.
 *   - `apiKeys[].masked` is synthesised from `key_hash_prefix`
 *     (the only public-safe identifier the backend exposes).
 *   - `apiKeys[].scope` defaults to 'admin' — no per-key scope column.
 *   - `webhooks[].events` is the backend's `events` array verbatim.
 *   - `webhooks[].status` maps `is_active` → 'live' / 'paused'.
 *
 * Re-export the shape so callers (`workspace/AgencyWorkspace`) can
 * import the type from either module.
 */
export type { AgencyWorkspaceData } from '@/pages/client/agency/AgWksC1Federation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SubClientStatus = AgencyWorkspaceData['subClients'][number]['status'];
type TeamRole = AgencyWorkspaceData['team'][number]['role'];
type ApiKeyScope = AgencyWorkspaceData['apiKeys'][number]['scope'];
type WebhookStatus = AgencyWorkspaceData['webhooks'][number]['status'];
type DomainStatus = AgencyWorkspaceData['features']['customDomain']['status'];

function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function domainOf(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

/** Two-char initials for a sub-client logo plate (e.g. "Helix" → "HX"). */
function logoFor(name: string): string {
  const parts = name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    const w = parts[0]!;
    return (w[0] ?? '?').toUpperCase() + (w[1] ?? '').toUpperCase();
  }
  return (
    (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '?').toUpperCase()
  );
}

/** Friendly name for a workspace plan slug (e.g. 'pro_plus' → 'Pro Plus'). */
function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function relTime(iso: string | null | undefined, prefix = ''): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'never';
  const ms = Date.now() - t;
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return `${prefix}now`;
  if (min < 60) return `${prefix}${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${prefix}${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${prefix}${days}d ago`;
  if (days < 365) return `${prefix}${Math.round(days / 30)}mo ago`;
  return `${prefix}${Math.round(days / 365)}y ago`;
}

function joinedAgo(iso: string | null | undefined): string {
  if (!iso) return 'moored recently';
  return relTime(iso, 'moored ');
}

/**
 * Bucket sub-clients with their mailboxes by owner_email domain. The
 * mailbox is the authoritative source of warmth/status — we attribute
 * mailboxes to sub-clients by domain match, the same rule used by the
 * sibling adapters.
 */
function bucketMailboxesBySubClient(
  subs: SubClient[],
  mailboxes: Mailbox[],
): Map<string, Mailbox[]> {
  const out = new Map<string, Mailbox[]>();
  for (const s of subs) {
    const dom = domainOf(s.owner_email);
    if (!dom) {
      out.set(s.id, []);
      continue;
    }
    out.set(
      s.id,
      mailboxes.filter((m) => domainOf(m.email_address) === dom),
    );
  }
  return out;
}

function statusForWarmth(
  warmth: number,
  mailboxCount: number,
): SubClientStatus {
  if (mailboxCount === 0) return 'inactive';
  if (warmth >= 70) return 'healthy';
  if (warmth >= 40) return 'warming';
  return 'at_risk';
}

function roleFor(member: TeamMember): TeamRole {
  if (member.role === 'owner') return 'owner';
  if (member.role === 'admin') return 'admin';
  return 'member';
}

function teamLastActiveAgo(member: TeamMember): string {
  // Best-effort: prefer accepted_at if present, else invited_at. The
  // backend doesn't surface a per-member last-login timestamp yet —
  // these are the only timestamps we have so use them as a coarse proxy.
  return relTime(member.accepted_at ?? member.invited_at, '');
}

function maskedKeyFor(key: ApiKey): string {
  // Only the hash prefix is safe to show; everything else stays bullets.
  const prefix = key.key_hash_prefix || 'wp';
  return `${prefix}_••••_${key.id.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencyWorkspaceDataResult {
  data: AgencyWorkspaceData | null;
  isLoading: boolean;
}

export function useAgencyWorkspaceData(): UseAgencyWorkspaceDataResult {
  const workspaceQuery = useWorkspace();
  const mailboxesQuery = useMailboxes();
  const webhooksQuery = useWebhooks();
  const brandingQuery = useBranding();
  const domainQuery = useCustomDomain();
  const poolQuery = useDedicatedPoolStatus();
  const authUser = useAuthStore((s) => s.user);

  // Workspace is the only primary gate — every other hook soft-fails to
  // an empty / null fallback. We don't want to block the page on a
  // 404'd webhooks or branding endpoint.
  const isLoading = workspaceQuery.isLoading || mailboxesQuery.isLoading;

  const data = useMemo<AgencyWorkspaceData | null>(() => {
    if (isLoading) return null;
    const ws = workspaceQuery.data;
    if (!ws && !authUser) return null;

    const rawMailboxes: Mailbox[] = mailboxesQuery.data?.items ?? [];
    const subClientsRaw: SubClient[] = ws?.sub_clients ?? [];
    const teamRaw: TeamMember[] = ws?.team_members ?? [];
    const apiKeysRaw: ApiKey[] = ws?.api_keys ?? [];
    const webhooks = webhooksQuery.data ?? [];
    const branding = brandingQuery.data;
    const customDomain = domainQuery.data;
    const pool = poolQuery.data;

    // ── agency identity ──────────────────────────────────────────────────
    const agencyName =
      ws?.name ??
      (authUser?.email
        ? `${authUser.email.split('@')[0]}'s agency`
        : 'Your agency');
    const plan = titleCase(ws?.plan ?? authUser?.plan ?? 'agency') || 'Agency';
    const ownerEmail = authUser?.email ?? '';
    const slug = agencyName.toLowerCase().replace(/\s+/g, '-');

    // ── early empty state: skeleton zeros (no fabrication) ───────────────
    if (
      subClientsRaw.length === 0 &&
      teamRaw.length === 0 &&
      apiKeysRaw.length === 0 &&
      webhooks.length === 0
    ) {
      return {
        ...AGENCY_WORKSPACE_SKELETON_W2,
        agency: {
          ...AGENCY_WORKSPACE_SKELETON_W2.agency,
          name: agencyName,
          plan,
          ownerEmail,
          slug,
        },
        features: {
          whiteLabel: {
            enabled: !!branding?.brand_name,
            brandName: branding?.brand_name ?? null,
            hasLogo: !!branding?.has_logo,
          },
          customDomain: {
            enabled: !!customDomain?.domain,
            domain: customDomain?.domain ?? null,
            status:
              (customDomain?.status as DomainStatus | undefined) ?? 'not_set',
          },
          dedicatedPool: {
            enabled: pool?.is_dedicated === true,
            poolName: pool?.pool_name ?? null,
            memberCount: pool?.member_count ?? 0,
          },
        },
      };
    }

    // ── sub-clients: bucket by domain, derive warmth + status ────────────
    const mailboxBuckets = bucketMailboxesBySubClient(
      subClientsRaw,
      rawMailboxes,
    );
    const subClients: AgencyWorkspaceData['subClients'] = subClientsRaw.map(
      (s) => {
        const bucket = mailboxBuckets.get(s.id) ?? [];
        const mailboxCount = s.mailbox_count ?? bucket.length;
        const meanWarmth =
          bucket.length > 0
            ? Math.round(
                bucket.reduce((acc, m) => acc + num(m.warmth_score), 0) /
                  bucket.length,
              )
            : 0;
        const status = statusForWarmth(meanWarmth, mailboxCount);

        return {
          id: s.id,
          name: s.name,
          logoChar: logoFor(s.name),
          ownerEmail: s.owner_email,
          // TODO: skeleton — no per-sub-client plan column. Default to 'Pro'
          // so sub-clients dock at Pier B in the harbor. Replace once the
          // backend ships a plan column on sub_clients.
          plan: 'Pro',
          mailboxCount,
          // TODO: skeleton — no per-sub-client team headcount column.
          teamCount: 0,
          avgWarmth: meanWarmth,
          status,
          // TODO: skeleton — no per-sub-client MRR column. $0 rather than
          // fabricate a billing amount the user might trust as real.
          monthlyMrrUsd: 0,
          createdAgo: joinedAgo(s.created_at),
          // TODO: skeleton — no per-sub-client last-activity column. Use a
          // friendly placeholder rather than relTime() on a missing field.
          lastActiveAgo: 'signal recent',
        };
      },
    );

    // ── team: map workspace team_members onto the harbor crew shape ──────
    const team: AgencyWorkspaceData['team'] = teamRaw.map((m, i) => ({
      id: m.id,
      // The backend doesn't surface a separate display name — use the
      // local-part of the email as a friendly fallback so the crew chip
      // never reads "@" only.
      name: titleCase(m.email.split('@')[0] ?? `Crew ${i + 1}`),
      email: m.email,
      role: roleFor(m),
      lastActiveAgo: teamLastActiveAgo(m),
      // TODO: skeleton — no per-member sub_clients_managed column. The
      // owner is treated as managing every sub-client; the rest stay 0.
      subClientsManaged: m.role === 'owner' ? subClientsRaw.length : 0,
    }));

    // ── api keys: only non-revoked, in their visible-shape ──────────────
    const apiKeys: AgencyWorkspaceData['apiKeys'] = apiKeysRaw
      .filter((k) => !k.revoked_at)
      .map((k) => ({
        id: k.id,
        label: k.name || 'API key',
        masked: maskedKeyFor(k),
        // TODO: skeleton — no per-key scope column. Default to 'admin'.
        scope: 'admin' as ApiKeyScope,
        lastUsedAgo: relTime(k.last_used_at, ''),
      }));

    // ── webhooks: live/paused mapping. Keep events verbatim. ────────────
    const webhookRows: AgencyWorkspaceData['webhooks'] = webhooks.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      status: (w.is_active ? 'live' : 'paused') as WebhookStatus,
    }));

    // ── features ─────────────────────────────────────────────────────────
    const features: AgencyWorkspaceData['features'] = {
      whiteLabel: {
        enabled: !!branding?.brand_name,
        brandName: branding?.brand_name ?? null,
        hasLogo: !!branding?.has_logo,
      },
      customDomain: {
        enabled: !!customDomain?.domain,
        domain: customDomain?.domain ?? null,
        status: (customDomain?.status as DomainStatus | undefined) ?? 'not_set',
      },
      dedicatedPool: {
        enabled: pool?.is_dedicated === true,
        poolName: pool?.pool_name ?? null,
        memberCount: pool?.member_count ?? 0,
      },
    };

    return {
      agency: {
        name: agencyName,
        plan,
        ownerEmail,
        // TODO: skeleton — workspace payload has no region field; the
        // harbor's port-of-region label falls back to the platform default.
        region: 'us-east-1',
        slug,
      },
      features,
      subClients,
      team,
      apiKeys,
      webhooks: webhookRows,
    };
  }, [
    isLoading,
    workspaceQuery.data,
    mailboxesQuery.data,
    webhooksQuery.data,
    brandingQuery.data,
    domainQuery.data,
    poolQuery.data,
    authUser,
  ]);

  return { data, isLoading };
}
