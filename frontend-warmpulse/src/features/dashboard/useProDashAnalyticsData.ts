import { useMemo } from 'react';
import { Gauge, Inbox, Reply, ShieldCheck, TrendingDown } from 'lucide-react';
import { useMailboxes } from '@/features/mailboxes/api';
import {
  useDailyMetrics,
  useEngagement,
  usePlacementTrend,
  useProviderDistribution,
  useVolumeCombo,
} from '@/features/analytics/api';
import { useDashboardSummary } from '@/features/dashboard/api';
import { chartTheme } from '@/components/charts/theme';
import type { ProviderSlice } from '@/features/analytics/types';
import type { DonutDatum } from '@/components/charts/recharts/DonutChartWp';
import type { ProDashAnalyticsData } from '@/pages/client/dashboards/ProDashAnalytics';

/**
 * Live-data adapter for the Pro "Analytics cockpit" dashboard
 * (`pages/client/dashboards/ProDashAnalytics.tsx`).
 *
 * Maps the existing TanStack-Query analytics / dashboard / mailbox hooks
 * into the exact `ProDashAnalyticsData` shape the design component renders.
 * Everything is best-effort: each underlying hook already falls back to an
 * empty array / derived value on 404, so any metric the backend hasn't
 * materialised yet is zero-filled here — never faked.
 *
 *   - empty workspace (0 mailboxes)  → returns `data: null` (caller shows
 *     the existing "complete onboarding" empty state)
 *   - still loading                  → `isLoading: true`, `data: null`
 */

// Single source of truth for the shape: the page exports it. Re-export so
// callers (ProDashboard) can import the type from either module.
export type { ProDashAnalyticsData } from '@/pages/client/dashboards/ProDashAnalytics';

// Local aliases for the nested row shapes used while mapping. They mirror the
// page's private interfaces; the final object is typed `ProDashAnalyticsData`
// so any drift is caught by the compiler at the return site.
type DonutSlice = DonutDatum;
type WarmthVolumeRow = ProDashAnalyticsData['warmthVolume'][number];
type PlacementRow = ProDashAnalyticsData['placement'][number];
type EngagementRow = ProDashAnalyticsData['engagement'][number];
type LeaderboardRow = ProDashAnalyticsData['leaderboard'][number];
type Kpi = ProDashAnalyticsData['kpis'][number];

const num = (v: unknown, dflt = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
};

function normalizeProvider(p: string): LeaderboardRow['provider'] {
  if (p === 'gmail' || p === 'outlook' || p === 'yahoo') return p;
  return 'smtp';
}

/**
 * Map the workspace-derived `ProviderSlice[]` (label, mailbox_count) into the
 * donut datum shape, colouring each slice from the shared chart palette so it
 * matches the rest of the analytics surface.
 */
function toProviderSplit(slices: ProviderSlice[]): DonutSlice[] {
  // Order is stable: Gmail, Outlook, SMTP, Yahoo when present.
  const ORDER: Array<{ match: RegExp; name: string; color: string }> = [
    { match: /gmail|google/i, name: 'Gmail', color: chartTheme.palette[0] },
    { match: /outlook|microsoft/i, name: 'Outlook', color: chartTheme.palette[1] },
    { match: /smtp|custom/i, name: 'SMTP', color: chartTheme.palette[4] },
    { match: /yahoo/i, name: 'Yahoo', color: chartTheme.palette[3] },
  ];
  const out: DonutSlice[] = [];
  for (const bucket of ORDER) {
    const total = slices
      .filter((s) => bucket.match.test(s.provider))
      .reduce((acc, s) => acc + num(s.mailbox_count), 0);
    out.push({ name: bucket.name, value: total, color: bucket.color });
  }
  // Any provider label that didn't match a known bucket (defensive).
  const known = ORDER;
  for (const s of slices) {
    if (!known.some((b) => b.match.test(s.provider))) {
      out.push({ name: s.provider, value: num(s.mailbox_count) });
    }
  }
  return out;
}

export interface UseProDashAnalyticsDataResult {
  data: ProDashAnalyticsData | null;
  isLoading: boolean;
}

export function useProDashAnalyticsData(): UseProDashAnalyticsDataResult {
  const mailboxesQuery = useMailboxes();
  const summaryQuery = useDashboardSummary();
  const dailyQuery = useDailyMetrics({});
  const placementQuery = usePlacementTrend({});
  const engagementQuery = useEngagement({});
  const volumeQuery = useVolumeCombo({});
  const providerDist = useProviderDistribution();

  const mailboxes = mailboxesQuery.data?.items ?? [];
  const summary = summaryQuery.data;
  const daily = dailyQuery.data ?? [];
  const placementPoints = placementQuery.data ?? [];
  const engagementPoints = engagementQuery.data ?? [];
  const volumePoints = volumeQuery.data ?? [];

  // Loading: mailbox list is the gate (everything else is best-effort and
  // resolves to empty arrays on 404, so we don't block on them).
  const isLoading = mailboxesQuery.isLoading;

  const data = useMemo<ProDashAnalyticsData | null>(() => {
    if (mailboxesQuery.isLoading) return null;
    if (mailboxes.length === 0) return null;

    const mailboxCount = mailboxes.length;
    const activeCount = mailboxes.filter(
      (m) => m.warmup_status === 'active',
    ).length;

    const avgWarmth = summary
      ? Math.round(num(summary.warmth_score))
      : Math.round(
          mailboxes.reduce((acc, m) => acc + num(m.warmth_score), 0) /
            mailboxCount,
        );
    const warmthDelta = summary ? num(summary.warmth_delta) : 0;

    // --- Warmth & volume combo (30d) -----------------------------------
    // Prefer daily_metrics rows (real warmth + sent). Fall back to the
    // summary's synthetic 30d warmth trend (volume 0) if metrics are empty.
    let warmthVolume: WarmthVolumeRow[] = daily.map((r) => ({
      date: r.date,
      warmth: Math.round(num(r.warmth_score)),
      volume: Math.round(num(r.sent)),
    }));
    if (warmthVolume.length === 0 && summary?.trend_30d) {
      warmthVolume = summary.trend_30d.map((p) => ({
        date: p.date,
        warmth: Math.round(num(p.warmth_score)),
        volume: 0,
      }));
    }

    // --- Placement stacked-area (14d) ----------------------------------
    const placement: PlacementRow[] = placementPoints.map((p) => ({
      date: p.date,
      inbox: Math.round(num(p.inbox_pct) * 10) / 10,
      promotions: Math.round(num(p.promotions_pct) * 10) / 10,
      spam: Math.round(num(p.spam_pct) * 10) / 10,
    }));

    // --- Engagement grouped-bar (7d) -----------------------------------
    // volume-combo gives absolute sent/opened/replied per day — exactly the
    // counts the design's bars want. Take the trailing 7 points.
    const engagement: EngagementRow[] = volumePoints
      .slice(-7)
      .map((p) => ({
        day: p.date,
        sent: Math.round(num(p.sent)),
        opens: Math.round(num(p.opened)),
        replies: Math.round(num(p.replied)),
      }));

    // --- Provider donut ------------------------------------------------
    const providerSplit = toProviderSplit(providerDist.data);

    // --- Leaderboard ---------------------------------------------------
    const leaderboard: LeaderboardRow[] = mailboxes.map((m) => ({
      id: m.id,
      email: m.email_address,
      provider: normalizeProvider(m.provider),
      warmth: Math.round(num(m.warmth_score)),
      // Per-mailbox warmth delta isn't exposed by the list endpoint yet.
      delta: 0,
      // Per-mailbox inbox% isn't exposed either — 0 until backend ships it.
      inboxPct: 0,
      sentToday: Math.round(num(m.sent_today)),
      dailyTarget: Math.round(num(m.daily_target)),
      day: Math.round(num(m.current_day)),
    }));

    // --- KPI band ------------------------------------------------------
    // Derive headline rates from the freshest data we have. Each is real or
    // zero — placement % from the last placement point, bounce/spam from the
    // last daily-metrics row, reply rate from the last engagement bucket.
    const lastPlacement = placementPoints[placementPoints.length - 1];
    const lastDaily = daily[daily.length - 1];
    const lastEngagement = engagementPoints[engagementPoints.length - 1];

    const inboxPct = lastPlacement ? num(lastPlacement.inbox_pct) : 0;
    const spamPct = lastPlacement
      ? num(lastPlacement.spam_pct)
      : lastDaily && num(lastDaily.sent) > 0
        ? (num(lastDaily.spam_rescued) / num(lastDaily.sent)) * 100
        : 0;
    const bouncePct =
      lastDaily && num(lastDaily.sent) > 0
        ? (num(lastDaily.bounced) / num(lastDaily.sent)) * 100
        : 0;
    const replyRate = lastEngagement ? num(lastEngagement.reply_rate) : 0;

    const kpis: Kpi[] = [
      {
        key: 'inbox',
        label: 'Inbox placement',
        value: `${inboxPct.toFixed(1)}%`,
        delta: 0,
        deltaSuffix: 'pts wk',
        tone: 'accent',
        Icon: Inbox,
        progress: Math.max(0, Math.min(100, inboxPct)),
      },
      {
        key: 'bounce',
        label: 'Bounce rate',
        value: `${bouncePct.toFixed(1)}%`,
        delta: 0,
        deltaSuffix: 'pts wk',
        tone: 'accent2',
        Icon: TrendingDown,
        progress: Math.max(0, Math.min(100, bouncePct * 10)),
        invert: true,
      },
      {
        key: 'spam',
        label: 'Spam rate',
        value: `${spamPct.toFixed(1)}%`,
        delta: 0,
        deltaSuffix: 'pts wk',
        tone: 'accent3',
        Icon: ShieldCheck,
        progress: Math.max(0, Math.min(100, spamPct * 10)),
        invert: true,
      },
      {
        key: 'reply',
        label: 'Reply rate',
        value: `${replyRate.toFixed(1)}%`,
        delta: 0,
        deltaSuffix: 'pts wk',
        tone: 'accent4',
        Icon: Reply,
        progress: Math.max(0, Math.min(100, replyRate)),
      },
      {
        key: 'warmth',
        label: 'Avg warmth',
        value: String(avgWarmth),
        delta: Math.round(warmthDelta * 10) / 10,
        deltaSuffix: 'pts wk',
        tone: 'accent',
        Icon: Gauge,
        progress: Math.max(0, Math.min(100, avgWarmth)),
      },
    ];

    return {
      avgWarmth,
      warmthDelta: Math.round(warmthDelta * 10) / 10,
      mailboxCount,
      activeCount,
      kpis,
      warmthVolume,
      placement,
      engagement,
      providerSplit,
      leaderboard,
    };
  }, [
    mailboxesQuery.isLoading,
    mailboxes,
    summary,
    daily,
    placementPoints,
    engagementPoints,
    volumePoints,
    providerDist.data,
  ]);

  return { data, isLoading };
}
