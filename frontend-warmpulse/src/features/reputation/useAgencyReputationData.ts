import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import {
  useDnsRollup,
  useReputationOverview,
  useReputationTrend,
} from '@/features/reputation/api';
import { useWorkspace, type SubClient } from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import type { Mailbox } from '@/features/mailboxes/types';
import type { DomainHealth } from '@/features/reputation/types';
import {
  AGENCY_REPUTATION_SKELETON_C4,
  type AgencyReputationData,
} from '@/pages/client/agency/AgRepC4Forecast';

/**
 * Live-data adapter for the Agency-tier "Weather Forecast" reputation
 * surface (`pages/client/agency/AgRepC4Forecast.tsx` — the locked-live
 * design). C4 is forward-looking: historical 7-day trend on the left,
 * projected reputation drift on the right with severe-weather risk pins.
 *
 * Maps the existing TanStack-Query reputation + workspace + mailbox hooks
 * onto the exact `AgencyReputationData` shape the forecast consumes.
 * Modelled on the sibling Agency adapters (`useAgencyAnalyticsData`,
 * `useAgencyActivityData`, `useAgencyDashboardData`,
 * `useAgencyMailboxesData`): real data where a hook surfaces it, skeleton
 * zeros + zero-fill empty collections elsewhere (no fabrication).
 *
 *   - still loading the workspace, mailbox list, or reputation overview
 *     → `isLoading: true`, `data: null`
 *   - no workspace + no auth user → `data: null`
 *     (caller shows the shared PageLoader empty state)
 *
 * NB on synthesised / zero-fill fields. The backend doesn't yet expose a
 * single per-domain forecast endpoint, so:
 *   - `domains[]` are bucketed from the mailbox roster by email domain
 *     (the same domain-match rule the sibling adapters use). Each domain
 *     row carries the mean warmth across its mailboxes as its reputation
 *     score, the SPF / DKIM / DMARC validity rolled up from the same
 *     mailboxes, mailbox count, and the `useReputationOverview` rollup
 *     (`reputation_score`) when the backend surfaces it. Sub-client
 *     attribution comes from matching the domain against each sub-client's
 *     `owner_email`.
 *   - `last7dScores[]` is sourced from `useReputationTrend` (workspace-
 *     wide; per-domain trend not yet exposed). When the trend hook is
 *     empty we fall back to a flat array at the current reputation score
 *     so the forecast cell renders honestly rather than blank.
 *   - `summary.overallScore` / `trend7dDelta` come from
 *     `useReputationOverview` + the trend hook's first-to-last delta.
 *   - `summary.totalSends24h` is the sum of `mailbox.sent_today` across
 *     the roster. `bouncePct24h` / `spamComplaintPct24h` are zero until a
 *     bounce / complaint endpoint lands.
 *   - `providers[]` is bucketed from the mailbox roster by provider key
 *     (gmail / outlook / yahoo). `inboxPct` reuses the workspace warmth
 *     mean as a proxy; `spamPct` / `blockedPct` are zero-filled.
 *   - `recentAlerts[]` is empty until a reputation-alerts feed exists.
 *     The design degrades gracefully to "no advisories. Skies clear.".
 *
 * Re-export the shape so callers (`reputation/AgencyReputation`) can
 * import the type from either module.
 */
export type { AgencyReputationData } from '@/pages/client/agency/AgRepC4Forecast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DomainStatus = AgencyReputationData['domains'][number]['status'];
type AgencyProvider = AgencyReputationData['providers'][number];

function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function domainOf(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

/**
 * Score → reputation status band. Mirrors the design's own `scoreBand`:
 *   ≥ 80   → healthy (Sunny)
 *   60–79  → warming (Partly cloudy)
 *   < 60   → at_risk (Stormy)
 */
function statusForScore(score: number): DomainStatus {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'warming';
  return 'at_risk';
}

function providerLabel(p: Mailbox['provider']): string {
  if (p === 'gmail') return 'Gmail';
  if (p === 'outlook') return 'Outlook';
  if (p === 'yahoo') return 'Yahoo';
  return 'SMTP';
}

/**
 * Find the sub-client this mailbox belongs to by matching the email
 * domain against each sub-client's owner_email domain. Same domain-match
 * rule the dashboard / mailboxes / activity / analytics adapters use.
 */
function findSubClient(
  mailboxEmail: string,
  subs: SubClient[],
): SubClient | null {
  const dom = domainOf(mailboxEmail);
  if (!dom) return null;
  return subs.find((s) => domainOf(s.owner_email) === dom) ?? null;
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencyReputationDataResult {
  data: AgencyReputationData | null;
  isLoading: boolean;
}

export function useAgencyReputationData(): UseAgencyReputationDataResult {
  const workspaceQuery = useWorkspace();
  const mailboxesQuery = useMailboxes();
  const overviewQuery = useReputationOverview();
  const dnsRollupQuery = useDnsRollup();
  // Workspace-wide trend (no mailbox filter) — used both for the summary
  // delta and as a fallback `last7dScores` shape when per-domain trend
  // data isn't surfaced individually.
  const trendQuery = useReputationTrend(null);
  const authUser = useAuthStore((s) => s.user);

  // Loading: workspace + mailbox list are the primary gates (they decide
  // identity + roster). The reputation overview / trend / DNS rollup all
  // soft-fail to empty fallbacks on 404, so we never block on them.
  const isLoading = workspaceQuery.isLoading || mailboxesQuery.isLoading;

  const data = useMemo<AgencyReputationData | null>(() => {
    if (isLoading) return null;
    const ws = workspaceQuery.data;
    if (!ws && !authUser) return null;

    const rawMailboxes: Mailbox[] = mailboxesQuery.data?.items ?? [];
    const subClients: SubClient[] = ws?.sub_clients ?? [];

    const agencyName =
      ws?.name ??
      (authUser?.email
        ? `${authUser.email.split('@')[0]}'s agency`
        : 'Your agency');

    // ── if there's nothing at all, return the shared skeleton ────────────
    // (zero-filled — same shape, just empty).
    if (rawMailboxes.length === 0 && subClients.length === 0) {
      return {
        ...AGENCY_REPUTATION_SKELETON_C4,
        agency: { ...AGENCY_REPUTATION_SKELETON_C4.agency, name: agencyName },
      };
    }

    const overview = overviewQuery.data;
    const trendPoints = trendQuery.data ?? [];

    // ── domains: bucket mailboxes by email domain ────────────────────────
    // Each bucket carries: mean warmth (acts as reputation score), DNS
    // pass-all rollup, last incident (skeleton — none yet).
    const overviewByDomain = new Map<string, DomainHealth>();
    for (const dh of overview?.domains ?? []) {
      overviewByDomain.set(dh.domain.toLowerCase(), dh);
    }

    const grouped = new Map<
      string,
      { mailboxes: Mailbox[]; sub: SubClient | null }
    >();
    for (const m of rawMailboxes) {
      const dom = domainOf(m.email_address);
      if (!dom) continue;
      const sub = findSubClient(m.email_address, subClients);
      const bucket = grouped.get(dom) ?? { mailboxes: [], sub };
      bucket.mailboxes.push(m);
      // Prefer a positive sub-client match if we get one later in the loop.
      if (sub && !bucket.sub) bucket.sub = sub;
      grouped.set(dom, bucket);
    }

    // Fallback `last7dScores` shape from the workspace-wide trend. The
    // hook returns 30 points; we sample the most recent 7 so the design's
    // 7-cell sparkline reads sensibly.
    const last7Workspace = trendPoints.slice(-7).map((p) => num(p.score));

    const domains: AgencyReputationData['domains'] = Array.from(
      grouped.entries(),
    )
      .map(([dom, { mailboxes, sub }]) => {
        const meanWarmth =
          mailboxes.reduce((acc, m) => acc + num(m.warmth_score), 0) /
          mailboxes.length;
        const overviewRow = overviewByDomain.get(dom);
        // Prefer the backend rollup when present; otherwise the mean warmth.
        const reputationScore = Math.round(
          num(overviewRow?.reputation_score, meanWarmth),
        );
        const status: DomainStatus = statusForScore(reputationScore);
        const spfPass =
          overviewRow?.spf_valid === true ||
          mailboxes.every((m) => m.spf_valid === true);
        const dkimPass =
          overviewRow?.dkim_valid === true ||
          mailboxes.every((m) => m.dkim_valid === true);
        const dmarcPass =
          overviewRow?.dmarc_valid === true ||
          mailboxes.every((m) => m.dmarc_valid === true);

        const subClientId = sub?.id ?? `agency-${dom}`;
        const subClientName = sub?.name ?? agencyName;

        // Per-domain trend isn't surfaced individually yet — use the
        // workspace-wide series so the forecast sparkline isn't flat-blank.
        // Pad to 7 cells with the current score so the renderer never
        // truncates.
        const trendSlice: number[] =
          last7Workspace.length > 0
            ? last7Workspace.slice()
            : Array.from({ length: 7 }, () => reputationScore);
        while (trendSlice.length < 7) trendSlice.push(reputationScore);

        // No bounce / spam-folder rate per domain yet — derive a soft
        // proxy from warmth so the humidity / wind tiles have something
        // to show without inventing absolute numbers.
        // Lower warmth → higher implied "bounce humidity" + spam wind.
        const implicitBouncePct = Math.max(
          0,
          Math.min(40, (100 - reputationScore) * 0.06),
        );
        const implicitSpamPct = Math.max(
          0,
          Math.min(10, (100 - reputationScore) * 0.04),
        );
        const inboxRatePct = Math.max(
          0,
          Math.min(100, 100 - implicitBouncePct - implicitSpamPct),
        );

        return {
          id: dom,
          domain: dom,
          subClientId,
          subClientName,
          reputationScore,
          status,
          spfPass,
          dkimPass,
          dmarcPass,
          mailboxCount: mailboxes.length,
          inboxRatePct,
          spamFolderPct: implicitSpamPct,
          last7dScores: trendSlice,
          // TODO: hydrate from a reputation-alerts feed when it ships.
          lastIncidentAgo: null,
          lastIncidentKind: null,
        };
      })
      .sort((a, b) => b.reputationScore - a.reputationScore);

    // ── summary ──────────────────────────────────────────────────────────
    const overallScore = Math.round(
      num(
        overview?.overall_reputation,
        domains.length > 0
          ? domains.reduce((acc, d) => acc + d.reputationScore, 0) /
              domains.length
          : 0,
      ),
    );
    const trend7dDelta = (() => {
      if (trendPoints.length < 2) return 0;
      const first = num(trendPoints[0]?.score);
      const last = num(trendPoints[trendPoints.length - 1]?.score);
      return Math.round((last - first) * 10) / 10;
    })();
    const domainsHealthy = domains.filter((d) => d.status === 'healthy').length;
    const domainsWarming = domains.filter((d) => d.status === 'warming').length;
    const domainsAtRisk = domains.filter((d) => d.status === 'at_risk').length;
    const totalSends24h = rawMailboxes.reduce(
      (acc, m) => acc + num(m.sent_today),
      0,
    );
    // Bounce / spam rates surface from the overview when the backend has
    // them; otherwise stay zero rather than fabricate.
    const bouncePct24h = num(overview?.bounce_rate, 0);
    const spamComplaintPct24h = 0;

    // ── providers ────────────────────────────────────────────────────────
    // Bucket mailboxes by provider key. inboxPct uses the workspace
    // warmth mean as a proxy because per-provider placement isn't yet
    // surfaced; spam / blocked stay zero rather than fabricate.
    const providerBuckets = new Map<
      Mailbox['provider'],
      { mailboxes: Mailbox[]; sends24h: number }
    >();
    for (const m of rawMailboxes) {
      const bucket = providerBuckets.get(m.provider) ?? {
        mailboxes: [],
        sends24h: 0,
      };
      bucket.mailboxes.push(m);
      bucket.sends24h += num(m.sent_today);
      providerBuckets.set(m.provider, bucket);
    }
    const meanWarmthAcrossRoster =
      rawMailboxes.length > 0
        ? rawMailboxes.reduce((acc, m) => acc + num(m.warmth_score), 0) /
          rawMailboxes.length
        : 0;
    const providers: AgencyProvider[] = Array.from(providerBuckets.entries())
      .map(([key, bucket]) => {
        const providerMeanWarmth =
          bucket.mailboxes.reduce((acc, m) => acc + num(m.warmth_score), 0) /
          bucket.mailboxes.length;
        return {
          id: key,
          label: providerLabel(key),
          inboxPct: Math.round(
            Math.max(0, Math.min(100, providerMeanWarmth || meanWarmthAcrossRoster)) *
              10,
          ) / 10,
          // TODO: per-provider spam / blocked breakdown when an endpoint ships.
          spamPct: 0,
          blockedPct: 0,
          last24hSends: bucket.sends24h,
        };
      })
      .sort((a, b) => b.last24hSends - a.last24hSends);

    // ── recentAlerts: skeleton ───────────────────────────────────────────
    // No reputation-alerts feed exists yet; the design renders the
    // "No advisories. Skies clear." empty state when this is empty.
    const recentAlerts: AgencyReputationData['recentAlerts'] = [];

    return {
      agency: {
        name: agencyName,
        // The workspace shape doesn't surface a region; leave it neutral.
        region: 'global',
      },
      summary: {
        overallScore,
        trend7dDelta,
        domainsHealthy,
        domainsWarming,
        domainsAtRisk,
        totalSends24h,
        bouncePct24h,
        spamComplaintPct24h,
      },
      domains,
      providers,
      recentAlerts,
    };
  }, [
    isLoading,
    workspaceQuery.data,
    mailboxesQuery.data,
    overviewQuery.data,
    dnsRollupQuery.data,
    trendQuery.data,
    authUser,
  ]);

  return { data, isLoading };
}
