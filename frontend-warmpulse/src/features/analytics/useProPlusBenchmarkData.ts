import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import {
  useDailyMetrics,
  useEngagement,
  usePlacementTrend,
} from '@/features/analytics/api';
import type {
  DailyMetricRow,
  EngagementPoint,
  PlacementTrendPoint,
} from '@/features/analytics/types';
import type {
  BenchmarkMock,
  MailboxRow,
  MetricBag,
  Provider,
} from '@/pages/client/proplus/ProPlusAna3Benchmark';

/**
 * Live-data adapter for the Pro-Plus "Benchmark / comparison" surface
 * (`pages/client/proplus/ProPlusAna3Benchmark.tsx`).
 *
 * Maps the existing TanStack-Query mailbox / analytics hooks into the exact
 * `BenchmarkMock` shape the three comparison modes consume. Modelled on
 * `useProPlusActivityData.ts` / `useProPlusConsoleData.ts`: everything is
 * best-effort — `useMailboxes` / `useDailyMetrics` / `usePlacementTrend` /
 * `useEngagement` already fall back to empty results on 404, so any window a
 * mailbox / the workspace hasn't materialised yet is zero-filled here, never
 * faked.
 *
 *   - empty workspace (0 mailboxes)  → returns `data: null` (caller shows
 *     the existing "complete onboarding" empty state)
 *   - still loading mailbox list     → `isLoading: true`, `data: null`
 *
 * Window split (so the "period vs period" mode is REAL, not synthetic):
 *   - `current` MetricBag = aggregates over the most recent 7 days.
 *   - `prior`   MetricBag = aggregates over the preceding 7 days (days 8-14).
 * We pull a single 14-day workspace daily-metrics / placement / engagement
 * series and bisect it by date — the analytics endpoints are workspace-wide
 * (no per-mailbox breakdown), so every mailbox's `current`/`prior` shares the
 * workspace-derived deliverability metrics while its `warmth` is its own
 * real per-mailbox score. Per-mailbox deliverability would need a
 * `mailbox_id`-scoped endpoint that doesn't exist yet.
 *
 * Re-export the shapes so callers (ProPlusAnalytics) can import the type
 * from either module.
 */
export type {
  BenchmarkMock,
  MailboxRow,
  MetricBag,
  Provider,
} from '@/pages/client/proplus/ProPlusAna3Benchmark';

const num = (v: unknown, dflt = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** ISO yyyy-mm-dd `n` days before `from` (inclusive window math). */
function isoDaysBefore(from: Date, days: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const EMPTY_BAG: MetricBag = {
  warmth: 0,
  inboxPct: 0,
  replyPct: 0,
  openPct: 0,
  spamPct: 0,
  bouncePct: 0,
};

/**
 * Aggregate a window of daily-metric rows + placement points + engagement
 * points into one `MetricBag`. `warmth` is supplied per-mailbox by the
 * caller (this only produces the workspace-wide deliverability metrics).
 *
 *   - inboxPct  : mean of placement `inbox_pct` across the window.
 *   - replyPct  : window replies / window sent  (falls back to engagement
 *                 `reply_rate` mean when no daily-metric volume yet).
 *   - openPct   : window opens   / window sent  (falls back to engagement
 *                 `open_rate` mean).
 *   - spamPct   : mean of placement `spam_pct`.
 *   - bouncePct : window bounced / window sent.
 */
function aggregateBag(
  daily: DailyMetricRow[],
  placement: PlacementTrendPoint[],
  engagement: EngagementPoint[],
): Omit<MetricBag, 'warmth'> {
  const vol = daily.reduce(
    (acc, r) => {
      acc.sent += num(r.sent);
      acc.opened += num(r.opened);
      acc.replied += num(r.replied);
      acc.bounced += num(r.bounced);
      return acc;
    },
    { sent: 0, opened: 0, replied: 0, bounced: 0 },
  );

  const meanOf = (
    rows: Array<Record<string, unknown>>,
    key: string,
  ): number => {
    if (rows.length === 0) return 0;
    let s = 0;
    for (const r of rows) s += num(r[key]);
    return s / rows.length;
  };

  const placementInbox = meanOf(
    placement as unknown as Array<Record<string, unknown>>,
    'inbox_pct',
  );
  const placementSpam = meanOf(
    placement as unknown as Array<Record<string, unknown>>,
    'spam_pct',
  );

  // Engagement endpoint reports rates directly (0..1 or 0..100 — coerce to %).
  const asPct = (v: number): number => (v > 0 && v <= 1 ? v * 100 : v);
  const engOpen = asPct(
    meanOf(engagement as unknown as Array<Record<string, unknown>>, 'open_rate'),
  );
  const engReply = asPct(
    meanOf(
      engagement as unknown as Array<Record<string, unknown>>,
      'reply_rate',
    ),
  );

  const openPct =
    vol.sent > 0 ? (vol.opened / vol.sent) * 100 : engOpen;
  const replyPct =
    vol.sent > 0 ? (vol.replied / vol.sent) * 100 : engReply;
  const bouncePct = vol.sent > 0 ? (vol.bounced / vol.sent) * 100 : 0;

  return {
    inboxPct: round1(clamp(placementInbox, 0, 100)),
    replyPct: round1(clamp(replyPct, 0, 100)),
    openPct: round1(clamp(openPct, 0, 100)),
    spamPct: round1(clamp(placementSpam, 0, 100)),
    bouncePct: round1(clamp(bouncePct, 0, 100)),
  };
}

export interface UseProPlusBenchmarkDataResult {
  data: BenchmarkMock | null;
  isLoading: boolean;
}

export function useProPlusBenchmarkData(): UseProPlusBenchmarkDataResult {
  const mailboxesQuery = useMailboxes();

  // 14-day workspace window so we can bisect into current (last 7d) vs prior
  // (preceding 7d) for the real period-over-period comparison.
  const { from14, mid, to } = useMemo(() => {
    const today = new Date();
    return {
      to: today.toISOString().slice(0, 10),
      // current window starts 6 days ago (7-day inclusive window).
      mid: isoDaysBefore(today, 6),
      from14: isoDaysBefore(today, 13),
    };
  }, []);

  const params = useMemo(
    () => ({ from: from14, to, granularity: 'day' as const }),
    [from14, to],
  );

  // All workspace-wide (no mailbox_id) — best-effort, never gating.
  const dailyQuery = useDailyMetrics(params);
  const placementQuery = usePlacementTrend(params);
  const engagementQuery = useEngagement(params);

  const mailboxes = mailboxesQuery.data?.items ?? [];

  // Loading: the mailbox list is the only gate (it decides whether this
  // workspace has anything to benchmark; the analytics series are best-effort
  // and resolve to empty arrays on 404 so we never block on them).
  const isLoading = mailboxesQuery.isLoading;

  const data = useMemo<BenchmarkMock | null>(() => {
    if (mailboxesQuery.isLoading) return null;
    if (mailboxes.length === 0) return null;

    const daily = dailyQuery.data ?? [];
    const placement = placementQuery.data ?? [];
    const engagement = engagementQuery.data ?? [];

    // Bisect each series by date string. `mid` is the first day of the
    // current 7-day window; anything < mid is the prior window.
    const isCurrent = (dateStr: string): boolean =>
      typeof dateStr === 'string' && dateStr >= mid;

    const curDaily = daily.filter((r) => isCurrent(r.date));
    const priDaily = daily.filter((r) => !isCurrent(r.date));
    const curPlace = placement.filter((r) => isCurrent(r.date));
    const priPlace = placement.filter((r) => !isCurrent(r.date));
    // Engagement buckets are week-start dates; bisect on the same boundary.
    const curEng = engagement.filter((r) => isCurrent(r.bucket));
    const priEng = engagement.filter((r) => !isCurrent(r.bucket));

    // Workspace-wide deliverability for each window. Per-mailbox placement /
    // bounce / open / reply has NO API source (the analytics endpoints are
    // workspace-scoped), so every mailbox shares these — only `warmth` is
    // genuinely per-mailbox.
    // TODO: no per-mailbox deliverability API — switch to a mailbox_id-scoped
    // daily-metrics/placement/engagement endpoint when one exists so each
    // MailboxRow's current/prior bag is independently real.
    const curWs = aggregateBag(curDaily, curPlace, curEng);
    const priWs = aggregateBag(priDaily, priPlace, priEng);

    const mailboxRows: MailboxRow[] = mailboxes.map((m) => {
      const provider = (m.provider as Provider) ?? 'smtp';
      const warmth = clamp(Math.round(num(m.warmth_score)), 0, 100);
      // Prior-window per-mailbox warmth has no API source either. Best-effort:
      // use the oldest warmth_sparkline point as the prior-window warmth when
      // present (the sparkline is the mailbox's own real 7-day history),
      // otherwise zero-fill to the current warmth (no synthetic drift).
      const spark = Array.isArray(m.warmth_sparkline)
        ? m.warmth_sparkline
        : null;
      const priorWarmth =
        spark && spark.length > 0
          ? clamp(Math.round(num(spark[0])), 0, 100)
          : warmth;

      const current: MetricBag = {
        ...EMPTY_BAG,
        ...curWs,
        warmth,
      };
      const prior: MetricBag = {
        ...EMPTY_BAG,
        ...priWs,
        warmth: priorWarmth,
      };

      return {
        id: String(m.id),
        email: String(m.email_address),
        provider,
        current,
        prior,
      };
    });

    return {
      workspace: 'Your workspace',
      mailboxCount: mailboxRows.length,
      mailboxes: mailboxRows,
    };
  }, [
    mailboxesQuery.isLoading,
    mailboxes,
    dailyQuery.data,
    placementQuery.data,
    engagementQuery.data,
    mid,
  ]);

  return { data, isLoading };
}
