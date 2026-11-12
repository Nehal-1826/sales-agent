import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox } from '@/features/mailboxes/types';
import type {
  AnalyticsCommonParams,
  BounceSpamPoint,
  DailyMetricRow,
  DashboardSummary,
  EngagementPoint,
  HealthRadarPoint,
  PlacementTrendPoint,
  ProviderSlice,
  VolumeComboPoint,
  WarmthHeatmap,
} from './types';

/**
 * React-query hooks for the analytics surface. Every call is best-effort:
 * on 404 we fall back to an empty shape so the card renders its empty-state
 * instead of crashing the page.
 */

function isAxios404(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

function toParams(p: AnalyticsCommonParams): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.mailbox_id && p.mailbox_id !== 'all') out.mailbox_id = p.mailbox_id;
  if (p.from) out.from = p.from;
  if (p.to) out.to = p.to;
  if (p.granularity) out.granularity = p.granularity;
  return out;
}

// ---------------------------------------------------------------------------
// Dashboard summary (re-exported from analytics endpoint)
// ---------------------------------------------------------------------------

/**
 * Synthesize a workspace-level summary from the user's mailbox list.
 *
 * Mirrors `deriveSummaryFromMailboxes` in `features/dashboard/api.ts` —
 * gives the Analytics page sensible KPI values (avg warmth, sent-today,
 * mailbox count) even when the aggregate endpoint hasn't materialised
 * `daily_metrics` rows yet (a fresh workspace on Day 1).
 */
function deriveSummaryFromMailboxes(mailboxes: Mailbox[]): DashboardSummary {
  const count = mailboxes.length;
  const mean =
    count === 0
      ? 0
      : mailboxes.reduce((acc, m) => acc + (Number(m.warmth_score) || 0), 0) /
        count;
  const sentToday = mailboxes.reduce(
    (acc, m) => acc + (Number(m.sent_today) || 0),
    0,
  );

  // Build a rough synthetic 30d warmth trend. For each mailbox, walk back
  // from today's warmth to a small Day-1 baseline based on `current_day`,
  // then average across mailboxes per point. Empty mailbox list → empty trend.
  const today = new Date();
  const trend_30d: Array<{ date: string; warmth_score: number }> = [];
  if (count > 0) {
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (29 - i));
      // Days ago: 29 - i. Per-mailbox synthesised warmth = scale today's
      // score by how far that mailbox was into its ramp at that point.
      let sum = 0;
      for (const m of mailboxes) {
        const w = Number(m.warmth_score) || 0;
        const dayNow = Math.max(1, Number(m.current_day) || 1);
        const dayThen = Math.max(0, dayNow - (29 - i));
        // Linear ramp from 0 → today's warmth across the mailbox's current day count.
        const synth = dayNow === 0 ? w : (w * dayThen) / dayNow;
        sum += synth;
      }
      const avg = sum / count;
      trend_30d.push({
        date: d.toISOString().slice(0, 10),
        warmth_score: Math.max(0, Math.min(100, Math.round(avg))),
      });
    }
  }

  return {
    warmth_score: Math.round(mean),
    warmth_score_yesterday: Math.round(mean),
    warmth_delta: 0,
    sent_today: sentToday,
    opens_today: 0,
    replies_today: 0,
    spam_rescues_today: 0,
    placement: { inbox_pct: 0, promotions_pct: 0, spam_pct: 0 },
    mailbox_count: count,
    trend_30d,
  };
}

/**
 * Normalise the backend dashboard-summary payload into the canonical
 * frontend `DashboardSummary` shape. The backend currently returns
 * `mean_warmth_score`, `warmth_delta_24h`, `today.{sent,opens,…}`,
 * `placement_split`, `warmth_30d`, and mailbox counts under different
 * keys (see `backend/app/schemas/analytics.py::DashboardSummary`). We
 * map all of those onto the frontend names so consumers can stay
 * blissfully unaware of the wire shape.
 */
function normaliseBackendSummary(
  raw: Record<string, unknown>,
  fallback: DashboardSummary,
): DashboardSummary {
  const num = (v: unknown, dflt = 0): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : dflt;
  };
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

  const today = obj(raw.today);
  const placement = obj(raw.placement_split ?? raw.placement);
  const warmth30 = Array.isArray(raw.warmth_30d)
    ? (raw.warmth_30d as Array<Record<string, unknown>>)
    : Array.isArray(raw.trend_30d)
      ? (raw.trend_30d as Array<Record<string, unknown>>)
      : [];

  const trend_30d = warmth30
    .map((p) => {
      const d = p.date;
      const score = p.score ?? p.warmth_score;
      return {
        date: typeof d === 'string' ? d : '',
        warmth_score: Math.round(num(score)),
      };
    })
    .filter((p) => p.date !== '');

  const warmthScore = Math.round(
    num(raw.warmth_score ?? raw.mean_warmth_score, fallback.warmth_score),
  );
  const warmthDelta = num(
    raw.warmth_delta ?? raw.warmth_delta_24h,
    fallback.warmth_delta,
  );
  const sentToday = num(
    raw.sent_today ?? today.sent,
    fallback.sent_today,
  );
  const opensToday = num(
    raw.opens_today ?? today.opens,
    fallback.opens_today,
  );
  const repliesToday = num(
    raw.replies_today ?? today.replies,
    fallback.replies_today,
  );
  const spamRescuesToday = num(
    raw.spam_rescues_today ?? today.spam_rescues,
    fallback.spam_rescues_today,
  );
  const mailboxCount = num(
    raw.mailbox_count ?? raw.total_mailboxes,
    fallback.mailbox_count,
  );

  return {
    warmth_score: warmthScore,
    warmth_score_yesterday: Math.round(
      num(raw.warmth_score_yesterday, warmthScore - warmthDelta),
    ),
    warmth_delta: Math.round(warmthDelta * 10) / 10,
    sent_today: sentToday,
    opens_today: opensToday,
    replies_today: repliesToday,
    spam_rescues_today: spamRescuesToday,
    placement: {
      inbox_pct: num(placement.inbox_pct, fallback.placement.inbox_pct),
      promotions_pct: num(
        placement.promotions_pct,
        fallback.placement.promotions_pct,
      ),
      spam_pct: num(placement.spam_pct, fallback.placement.spam_pct),
    },
    mailbox_count: mailboxCount,
    trend_30d: trend_30d.length > 0 ? trend_30d : fallback.trend_30d,
  };
}

export function useAnalyticsDashboardSummary(): UseQueryResult<DashboardSummary> {
  // Seed mailbox list so we always have a fallback to derive from.
  const mailboxes = useMailboxes();

  return useQuery({
    queryKey: ['analytics', 'summary'],
    staleTime: 60_000,
    queryFn: async () => {
      const fallback = deriveSummaryFromMailboxes(
        mailboxes.data?.items ?? [],
      );
      try {
        const res = await api.get('/workspace/analytics/dashboard/summary');
        const raw =
          res.data && typeof res.data === 'object'
            ? (res.data as Record<string, unknown>)
            : {};
        return normaliseBackendSummary(raw, fallback);
      } catch (err) {
        if (isAxios404(err)) {
          return fallback;
        }
        throw err;
      }
    },
    // Wait until we at least know the mailbox list (for fallback quality).
    enabled: !mailboxes.isLoading,
  });
}

// ---------------------------------------------------------------------------
// Daily metrics timeseries (warmth / volume combo)
// ---------------------------------------------------------------------------

function unwrapList<T>(data: unknown, key = 'items'): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && key in data) {
    const v = (data as Record<string, unknown>)[key];
    return Array.isArray(v) ? (v as T[]) : [];
  }
  return [];
}

/**
 * Map a `/workspace/analytics/daily-metrics` wire row → the canonical
 * `DailyMetricRow` shape every consumer expects.
 *
 * The backend serialises the `daily_metrics` table with its own column
 * names (`emails_sent`, `emails_received`, `opens`, `replies`,
 * `spam_rescues`, `bounce_count`), but every frontend consumer
 * (Starter Analytics, Starter Workspace, the Pro dashboard adapter, the
 * Reports preview) reads the `DailyMetricRow` names (`sent`, `opened`,
 * `replied`, `bounced`, `spam_rescued`). `useDailyMetrics` previously did
 * an unchecked `unwrapList<DailyMetricRow>` cast with NO field mapping, so
 * every consumer except the one that only reads `warmth_score` silently
 * got `undefined` → `NaN`/`0`. This mapper is the single root-cause fix.
 *
 * Dual-name `??` fallback (canonical name first) keeps it correct whether
 * the wire keeps the DB names or is ever changed to emit the canonical
 * ones — defense in depth so this can't silently regress again.
 */
function mapDailyRow(r: Record<string, unknown>): DailyMetricRow {
  const n = (v: unknown): number => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
  return {
    date: String(r.date ?? ''),
    sent: n(r.sent ?? r.emails_sent),
    delivered: n(r.delivered ?? r.emails_received),
    bounced: n(r.bounced ?? r.bounce_count),
    opened: n(r.opened ?? r.opens),
    replied: n(r.replied ?? r.replies),
    starred: n(r.starred),
    spam_rescued: n(r.spam_rescued ?? r.spam_rescues),
    warmth_score: n(r.warmth_score),
  };
}

export function useDailyMetrics(
  params: AnalyticsCommonParams,
): UseQueryResult<DailyMetricRow[]> {
  const qp = toParams(params);
  return useQuery({
    queryKey: ['analytics', 'daily-metrics', qp],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/analytics/daily-metrics', { params: qp });
        return unwrapList<Record<string, unknown>>(res.data).map(mapDailyRow);
      } catch (err) {
        if (isAxios404(err)) return [];
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Placement trend (stacked area)
// ---------------------------------------------------------------------------

export function usePlacementTrend(
  params: AnalyticsCommonParams,
): UseQueryResult<PlacementTrendPoint[]> {
  const qp = toParams(params);
  return useQuery({
    queryKey: ['analytics', 'placement-trend', qp],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/analytics/placement-trend', { params: qp });
        return unwrapList<PlacementTrendPoint>(res.data);
      } catch (err) {
        if (isAxios404(err)) return [];
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Engagement (grouped bar: open/reply/star/rescue rates)
// ---------------------------------------------------------------------------

export function useEngagement(
  params: AnalyticsCommonParams,
): UseQueryResult<EngagementPoint[]> {
  const qp = toParams({ granularity: 'week', ...params });
  return useQuery({
    queryKey: ['analytics', 'engagement', qp],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/analytics/engagement', { params: qp });
        return unwrapList<EngagementPoint>(res.data);
      } catch (err) {
        if (isAxios404(err)) return [];
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Warmth heatmap (ApexCharts)
// ---------------------------------------------------------------------------

export function useWarmthHeatmap(
  params: { mailbox_id?: string },
): UseQueryResult<WarmthHeatmap> {
  const qp: Record<string, string> = {};
  if (params.mailbox_id && params.mailbox_id !== 'all') qp.mailbox_id = params.mailbox_id;
  return useQuery({
    queryKey: ['analytics', 'warmth-heatmap', qp],
    staleTime: 120_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/analytics/warmth-heatmap', { params: qp });
        const data = res.data as Partial<WarmthHeatmap> | WarmthHeatmap;
        if (data && Array.isArray((data as WarmthHeatmap).cells)) {
          return data as WarmthHeatmap;
        }
        // Accept flat-array response.
        if (Array.isArray(data)) {
          return { cells: data as WarmthHeatmap['cells'] };
        }
        return { cells: [] };
      } catch (err) {
        if (isAxios404(err)) return { cells: [] };
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Bounce × Spam scatter (per mailbox per day)
// ---------------------------------------------------------------------------

export function useBounceSpam(
  params: AnalyticsCommonParams,
): UseQueryResult<BounceSpamPoint[]> {
  const qp = toParams(params);
  return useQuery({
    queryKey: ['analytics', 'bounce-spam', qp],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/analytics/bounce-spam', { params: qp });
        return unwrapList<BounceSpamPoint>(res.data);
      } catch (err) {
        if (isAxios404(err)) return [];
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Provider distribution — derived client-side from the mailbox list so the
// donut always renders even when no backend endpoint exists.
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<string, string> = {
  gmail: 'Gmail / Google Workspace',
  outlook: 'Outlook / Microsoft 365',
  yahoo: 'Yahoo',
  smtp: 'Custom SMTP',
};

export function useProviderDistribution(): {
  data: ProviderSlice[];
  isLoading: boolean;
  isError: boolean;
} {
  const mailboxes = useMailboxes();
  const items = mailboxes.data?.items ?? [];
  const counts = new Map<string, { count: number; sent: number }>();
  for (const m of items) {
    const key = m.provider ?? 'smtp';
    const curr = counts.get(key) ?? { count: 0, sent: 0 };
    curr.count += 1;
    curr.sent += Number(m.sent_today ?? 0);
    counts.set(key, curr);
  }
  const data: ProviderSlice[] = Array.from(counts.entries()).map(([provider, v]) => ({
    provider: PROVIDER_LABELS[provider] ?? provider,
    mailbox_count: v.count,
    sent: v.sent,
  }));
  return { data, isLoading: mailboxes.isLoading, isError: mailboxes.isError };
}

// ---------------------------------------------------------------------------
// Health radar — derived from dashboard summary + engagement tail.
// Backend may expose `/workspace/analytics/health-radar`; if so, use it;
// otherwise synthesise from summary so the radar still renders.
// ---------------------------------------------------------------------------

export function useHealthRadar(
  params: { mailbox_id?: string },
): UseQueryResult<HealthRadarPoint[]> {
  const qp: Record<string, string> = {};
  if (params.mailbox_id && params.mailbox_id !== 'all') qp.mailbox_id = params.mailbox_id;
  return useQuery({
    queryKey: ['analytics', 'health-radar', qp],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/analytics/health-radar', { params: qp });
        return unwrapList<HealthRadarPoint>(res.data);
      } catch (err) {
        if (isAxios404(err)) return [] as HealthRadarPoint[];
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Volume combo (bar=sent, line=opens) — re-uses daily metrics endpoint.
// ---------------------------------------------------------------------------

export function useVolumeCombo(
  params: AnalyticsCommonParams,
): UseQueryResult<VolumeComboPoint[]> {
  const qp = toParams(params);
  return useQuery({
    queryKey: ['analytics', 'volume-combo', qp],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/analytics/daily-metrics', { params: qp });
        const rows = unwrapList<DailyMetricRow>(res.data);
        return rows.map<VolumeComboPoint>((r) => ({
          date: r.date,
          sent: Number(r.sent ?? 0),
          opened: Number(r.opened ?? 0),
          replied: Number(r.replied ?? 0),
        }));
      } catch (err) {
        if (isAxios404(err)) return [] as VolumeComboPoint[];
        throw err;
      }
    },
  });
}
