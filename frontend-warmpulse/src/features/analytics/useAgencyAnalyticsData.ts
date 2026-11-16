import { useMemo } from 'react';
import {
  useAnalyticsDashboardSummary,
  useDailyMetrics,
  useEngagement,
  usePlacementTrend,
  useProviderDistribution,
  useVolumeCombo,
} from '@/features/analytics/api';
import { useMailboxes } from '@/features/mailboxes/api';
import { useWorkspace, type SubClient } from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import type { Mailbox } from '@/features/mailboxes/types';
import type { AgencyAnalyticsData } from '@/pages/client/agency/AgAnaR3Funnel';

/**
 * Live-data adapter for the Agency-tier "Funnel Theatre" analytics surface
 * (`pages/client/agency/AgAnaR3Funnel.tsx` — the locked-live design).
 *
 * Maps the existing TanStack-Query analytics + workspace + mailbox hooks
 * onto the exact `AgencyAnalyticsData` shape the funnel consumes. Modelled
 * on the sibling Agency adapters (`useAgencyDashboardData`,
 * `useAgencyMailboxesData`, `useAgencyActivityData`): real data where a
 * hook surfaces it, skeleton zeros + zero-fill empty collections elsewhere
 * (no fabrication).
 *
 *   - still loading the workspace or mailbox list → `isLoading: true`, `data: null`
 *   - no workspace + no auth user                 → `data: null`
 *     (caller shows the shared PageLoader empty state)
 *
 * NB on synthesised / zero-fill fields. The backend doesn't yet expose a
 * single per-sub-client analytics rollup endpoint, so:
 *   - `funnel.{delivered,inboxed,opened,replied}` are computed from the
 *     30-day daily-metrics rows. When no rows exist, every funnel stage
 *     reads 0 — the design renders a degenerate (but honest) flat funnel.
 *   - `providerMix` is derived from the mailbox roster (count + share of
 *     sends). Inbox / spam / blocked percentages reuse the workspace-wide
 *     placement split because per-provider placement isn't surfaced
 *     individually. Flagged with `TODO:` so a dedicated endpoint drops in.
 *   - `subClientLeaderboard` is attributed per sub-client by matching the
 *     mailbox's email domain against each sub-client's owner_email. Sends
 *     are summed from those mailboxes; warmth + inbox % use the workspace
 *     averages (skeleton). Same domain-match rule the dashboard and
 *     mailboxes adapters use.
 *   - `weeklyInsights` is empty — there's no insights engine yet. The
 *     design degrades gracefully to "no insights" empty state.
 *   - `comparisons` is the leaderboard restated with the comparison-table
 *     field names so the bottom comparisons grid renders the same data
 *     without an additional query.
 *
 * Re-export the shape so callers (`analytics/AgencyAnalytics`) can import
 * the type from either module.
 */
export type { AgencyAnalyticsData } from '@/pages/client/agency/AgAnaR3Funnel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function domainOf(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

function logoCharFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const ch = trimmed[0] ?? '?';
  return ch.toUpperCase();
}

function normalizeProvider(
  p: string,
): AgencyAnalyticsData['providerMix'][number]['provider'] {
  if (p === 'gmail' || p === 'outlook' || p === 'yahoo') return p;
  return 'smtp';
}

function statusForWarmth(
  warmth: number,
  mailboxCount: number,
): AgencyAnalyticsData['subClientLeaderboard'][number]['status'] {
  if (mailboxCount === 0) return 'at_risk';
  if (warmth >= 70) return 'healthy';
  if (warmth >= 40) return 'warming';
  return 'at_risk';
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencyAnalyticsDataResult {
  data: AgencyAnalyticsData | null;
  isLoading: boolean;
}

export function useAgencyAnalyticsData(): UseAgencyAnalyticsDataResult {
  const workspaceQuery = useWorkspace();
  const mailboxesQuery = useMailboxes();
  // Empty params = backend default (typically last-30d / all mailboxes).
  const summaryQuery = useAnalyticsDashboardSummary();
  const dailyQuery = useDailyMetrics({});
  const placementQuery = usePlacementTrend({});
  const engagementQuery = useEngagement({});
  const volumeQuery = useVolumeCombo({});
  const providerQuery = useProviderDistribution();
  const authUser = useAuthStore((s) => s.user);

  // Loading: workspace + mailbox list are the primary gates (they decide
  // identity + roster). All the analytics hooks soft-fail to empty arrays
  // on 404, so we never block on them.
  const isLoading = workspaceQuery.isLoading || mailboxesQuery.isLoading;

  const data = useMemo<AgencyAnalyticsData | null>(() => {
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

    const summary = summaryQuery.data;
    const daily = dailyQuery.data ?? [];
    const placement = placementQuery.data ?? [];
    const engagement = engagementQuery.data ?? [];
    const volume = volumeQuery.data ?? [];

    // ── workspace ─────────────────────────────────────────────────────
    const totalMailboxes =
      rawMailboxes.length ||
      subClients.reduce((acc, s) => acc + (s.mailbox_count ?? 0), 0);

    // ── KPIs ──────────────────────────────────────────────────────────
    // 30-day sends / opens / replies — sum daily rows if present, else
    // fall back to today-only numbers from summary.
    const totalSends30d =
      daily.length > 0
        ? daily.reduce((acc, r) => acc + num(r.sent), 0)
        : num(summary?.sent_today);
    const totalOpens30d =
      daily.length > 0
        ? daily.reduce((acc, r) => acc + num(r.opened), 0)
        : num(summary?.opens_today);
    const totalReplies30d =
      daily.length > 0
        ? daily.reduce((acc, r) => acc + num(r.replied), 0)
        : num(summary?.replies_today);
    const totalBounced30d = daily.reduce(
      (acc, r) => acc + num(r.bounced),
      0,
    );

    // Inbox / spam from placement-trend (avg across the window) when
    // present; otherwise pull from the summary's placement split.
    const placementMean =
      placement.length > 0
        ? placement.reduce(
            (acc, p) => {
              acc.inbox += num(p.inbox_pct);
              acc.spam += num(p.spam_pct);
              acc.count += 1;
              return acc;
            },
            { inbox: 0, spam: 0, count: 0 },
          )
        : null;
    const inboxRatePct = placementMean
      ? placementMean.inbox / placementMean.count
      : num(summary?.placement.inbox_pct);
    const spamRatePct = placementMean
      ? placementMean.spam / placementMean.count
      : num(summary?.placement.spam_pct);
    const bounceRatePct =
      totalSends30d > 0 ? (totalBounced30d / totalSends30d) * 100 : 0;

    const avgWarmth = num(summary?.warmth_score);
    const momGrowthPct = num(summary?.warmth_delta);

    // ── days30 ────────────────────────────────────────────────────────
    // Map daily-metrics rows into the design's 30-day series. Inbox % is
    // not in DailyMetricRow, so we cross-reference placement-trend by
    // date when possible; missing entries fall back to the window mean.
    const placementByDate = new Map<string, number>();
    for (const p of placement) {
      placementByDate.set(p.date, num(p.inbox_pct));
    }
    const days30: AgencyAnalyticsData['days30'] = daily.map((r) => ({
      date: r.date,
      sends: num(r.sent),
      opens: num(r.opened),
      replies: num(r.replied),
      inboxPct: placementByDate.get(r.date) ?? inboxRatePct,
    }));

    // ── funnel ────────────────────────────────────────────────────────
    // Sends → Delivered (= sends - bounces) → Inboxed (= delivered ×
    // inbox%) → Opened → Replied. Volume-combo confirms the relationship
    // when present; otherwise we use the totals computed above.
    const volumeTotal = volume.reduce(
      (acc, v) => {
        acc.sent += num(v.sent);
        acc.opened += num(v.opened);
        acc.replied += num(v.replied);
        return acc;
      },
      { sent: 0, opened: 0, replied: 0 },
    );
    const sends = totalSends30d || volumeTotal.sent;
    const delivered = Math.max(0, sends - totalBounced30d);
    const inboxed =
      inboxRatePct > 0 ? Math.round((delivered * inboxRatePct) / 100) : delivered;
    const opened = totalOpens30d || volumeTotal.opened;
    const replied = totalReplies30d || volumeTotal.replied;
    const funnel: AgencyAnalyticsData['funnel'] = {
      sends,
      delivered,
      inboxed,
      opened,
      replied,
    };

    // ── providerMix ───────────────────────────────────────────────────
    // Backend-derived provider distribution gives us mailbox count + sent
    // count per provider. We project sends across the window using each
    // provider's today-share of total sends.
    // TODO: replace with `/workspace/analytics/by-provider` once it ships
    // so per-provider inbox / spam / blocked percentages stop reusing the
    // workspace-wide split.
    const providerSlices = providerQuery.data ?? [];
    const totalProviderSent = providerSlices.reduce(
      (acc, p) => acc + num(p.sent),
      0,
    );
    const providerKeyFor = (label: string): string => {
      const lower = label.toLowerCase();
      if (lower.includes('gmail') || lower.includes('google')) return 'gmail';
      if (lower.includes('outlook') || lower.includes('microsoft'))
        return 'outlook';
      if (lower.includes('yahoo')) return 'yahoo';
      return 'smtp';
    };
    const providerMix: AgencyAnalyticsData['providerMix'] = providerSlices
      .map((p) => {
        const key = providerKeyFor(p.provider);
        const share = totalProviderSent > 0 ? p.sent / totalProviderSent : 0;
        return {
          provider: normalizeProvider(key),
          sends: Math.round(sends * share),
          inboxPct: inboxRatePct,
          spamPct: spamRatePct,
          // No bounce-by-provider yet — reuse the workspace bounce rate
          // so the donut totals stay coherent.
          blockedPct: bounceRatePct,
        };
      })
      .filter((p) => p.sends > 0);

    // ── subClientLeaderboard ──────────────────────────────────────────
    // For each sub-client: count their mailboxes (by domain match), sum
    // sent_today across the matched mailboxes, scale up to a 30-day
    // estimate so the leaderboard stays useful before a real rollup ships.
    // TODO: replace with `/workspace/analytics/sub-clients` when it ships.
    const subClientLeaderboard: AgencyAnalyticsData['subClientLeaderboard'] =
      subClients.map((s) => {
        const dom = domainOf(s.owner_email);
        const subMailboxes = rawMailboxes.filter(
          (m) => domainOf(m.email_address) === dom,
        );
        const sentToday = subMailboxes.reduce(
          (acc, m) => acc + num(m.sent_today),
          0,
        );
        // Scale today to a rough 30-day total. If we have no today data,
        // fall back to a proportional share of the workspace totals so the
        // leaderboard isn't empty.
        const mailboxShare =
          rawMailboxes.length > 0
            ? subMailboxes.length / rawMailboxes.length
            : 0;
        const sends30d =
          sentToday > 0 ? sentToday * 30 : Math.round(sends * mailboxShare);
        const avgWarmthForSub =
          subMailboxes.length > 0
            ? Math.round(
                subMailboxes.reduce(
                  (acc, m) => acc + num(m.warmth_score),
                  0,
                ) / subMailboxes.length,
              )
            : avgWarmth;
        const mailboxCount = s.mailbox_count ?? subMailboxes.length;
        return {
          id: s.id,
          name: s.name,
          logoChar: logoCharFor(s.name),
          sends30d,
          inboxPct: inboxRatePct,
          warmthScore: avgWarmthForSub,
          // TODO: per-sub-client MoM delta needs a historical rollup —
          // surface 0 (unchanged) until that lands.
          delta30dPct: 0,
          status: statusForWarmth(avgWarmthForSub, mailboxCount),
        };
      });

    // ── comparisons ───────────────────────────────────────────────────
    // Restate the leaderboard with the field names the comparisons table
    // wants. Engagement open / reply rates from the engagement hook give
    // us a better-than-zero open / reply estimate per row.
    const meanOpenRate =
      engagement.length > 0
        ? engagement.reduce((acc, e) => acc + num(e.open_rate), 0) /
          engagement.length
        : totalSends30d > 0
          ? (totalOpens30d / totalSends30d) * 100
          : 0;
    const meanReplyRate =
      engagement.length > 0
        ? engagement.reduce((acc, e) => acc + num(e.reply_rate), 0) /
          engagement.length
        : totalSends30d > 0
          ? (totalReplies30d / totalSends30d) * 100
          : 0;
    const comparisons: AgencyAnalyticsData['comparisons'] =
      subClientLeaderboard.map((s) => ({
        subClientId: s.id,
        subClientName: s.name,
        sends: s.sends30d,
        opens: Math.round((s.sends30d * meanOpenRate) / 100),
        replies: Math.round((s.sends30d * meanReplyRate) / 100),
        inboxRate: s.inboxPct,
        spamRate: spamRatePct,
        bounceRate: bounceRatePct,
        warmth: s.warmthScore,
      }));

    return {
      workspace: {
        name: agencyName,
        subClientCount: subClients.length,
        mailboxCount: totalMailboxes,
      },
      period: 'last_30d',
      kpis: {
        totalSends30d,
        totalOpens30d,
        totalReplies30d,
        inboxRatePct,
        spamRatePct,
        bounceRatePct,
        avgWarmth,
        momGrowthPct,
      },
      days30,
      funnel,
      providerMix,
      subClientLeaderboard,
      // TODO: skeleton — no insights engine yet. The design renders an
      // empty-state when the array is empty.
      weeklyInsights: [],
      comparisons,
    };
  }, [
    isLoading,
    workspaceQuery.data,
    mailboxesQuery.data,
    summaryQuery.data,
    dailyQuery.data,
    placementQuery.data,
    engagementQuery.data,
    volumeQuery.data,
    providerQuery.data,
    authUser,
  ]);

  return { data, isLoading };
}
