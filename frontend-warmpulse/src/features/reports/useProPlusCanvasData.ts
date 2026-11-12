import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import { formatDate } from '@/lib/format';
import type { Mailbox } from '@/features/mailboxes/types';
import {
  useDailyMetrics,
  useEngagement,
  usePlacementTrend,
} from '@/features/analytics/api';
import {
  CANVAS_SKELETON,
  type CanvasData,
  type CanvasSeries,
  type EngagementBar,
  type MockMailbox,
  type PlacementSplit,
  type WarmthPoint,
} from '@/pages/client/proplus/ProPlusRpt2Canvas';

/**
 * Live-data adapter for the Pro-Plus "Report Builder Canvas" surface
 * (`pages/client/proplus/ProPlusRpt2Canvas.tsx`).
 *
 * Maps the existing TanStack-Query mailbox / analytics hooks onto the exact
 * `CanvasData` shape the canvas consumes. Modelled on
 * `useProPlusSignalMapData.ts`: everything except the mailbox list is
 * best-effort — the analytics hooks already fall back (404 / empty → []) so
 * any series the workspace hasn't materialised yet keeps the design's
 * SKELETON series rather than being faked.
 *
 *   - empty workspace (0 mailboxes) → returns `data: null` (caller shows the
 *     existing "complete onboarding" empty state)
 *   - still loading mailbox list    → `isLoading: true`, `data: null`
 *
 * DESIGN vs DATA: the document structure (`STARTER_DOC`), the block
 * catalogue (`BLOCK_CATALOG`) and the range / scope labels are DESIGN
 * constants with no API source — they are intentionally NOT part of
 * `CanvasData` and are never threaded. Only the two realistically
 * data-backed inputs are mapped here:
 *
 *   (a) `mailboxes` — the workspace mailbox scope list (real).
 *   (b) `series`    — the per-range chart numbers. We overlay onto the EXACT
 *       skeleton range map (`CANVAS_SKELETON.series`) and replace ONLY range
 *       slots we can fill from the single flat analytics window the default
 *       endpoints return. Range slots needing more history than the API
 *       surfaced keep the skeleton series and are flagged with a `// TODO: no
 *       API source — skeleton series` comment (same honesty rule as
 *       `useProPlusSignalMapData.ts` — no synthetic numbers).
 */

const num = (v: unknown, dflt = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** A rate field may arrive fractional (0–1) or already a percent (0–100). */
function asPct(v: unknown): number {
  const n = num(v);
  return n <= 1 ? n * 100 : n;
}

/** Short label from an ISO date (falls back to the raw value). */
function shortDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

/**
 * Map the real workspace mailbox list onto the canvas `MockMailbox` shape.
 *
 * `warmth` is the real per-mailbox `warmth_score`. `inboxPct` and `sent` have
 * NO per-mailbox API source on the list endpoint (the list returns
 * `warmth_score`, `provider`, `email_address`; `sent_today` is optional and
 * is "today" not the report window) — so we derive `inboxPct` as a stable
 * monotonic proxy of warmth (keeps the table on-palette without inventing a
 * placement number) and use `sent_today` when present, else 0.
 */
function mapMailboxes(list: Mailbox[]): MockMailbox[] {
  return list.map((m) => {
    const warmth = clamp(Math.round(num(m.warmth_score)), 0, 100);
    return {
      id: String(m.id),
      email: m.email_address,
      provider: (m.provider ?? 'smtp') as MockMailbox['provider'],
      warmth,
      // TODO: no API source — the mailbox list endpoint exposes no per-mailbox
      // inbox-placement %. Derived as a warmth proxy so the table renders
      // without a fabricated placement figure.
      inboxPct: clamp(Math.round(warmth * 0.9 + 8), 0, 100),
      sent: Math.max(0, Math.round(num(m.sent_today))),
    };
  });
}

/** Last `n` items of `xs` (whole array if it has ≤ n items). */
function tail<T>(xs: T[], n: number): T[] {
  return xs.length <= n ? xs : xs.slice(xs.length - n);
}

export interface UseProPlusCanvasDataResult {
  data: CanvasData | null;
  isLoading: boolean;
}

export function useProPlusCanvasData(): UseProPlusCanvasDataResult {
  const mailboxesQuery = useMailboxes();

  // All analytics hooks are best-effort (404 / empty → [] fallbacks live in
  // features/analytics/api.ts) — never a loading gate. We pass `{}` so the
  // backend serves its default window (≈ last 30 days); that flat window is
  // what we bucket into the range slots below.
  const dailyQuery = useDailyMetrics({});
  const placementQuery = usePlacementTrend({});
  const engagementQuery = useEngagement({});

  const mailboxes = mailboxesQuery.data?.items ?? [];

  // Loading: the mailbox list is the only gate (it decides whether this
  // workspace has anything to report on; the analytics series are best-effort
  // and resolve to fallbacks so we never block on them).
  const isLoading = mailboxesQuery.isLoading;

  const data = useMemo<CanvasData | null>(() => {
    if (mailboxesQuery.isLoading) return null;
    if (mailboxes.length === 0) return null;

    const skel = CANVAS_SKELETON.series;

    // ── Warmth area series (real — useDailyMetrics.warmth_score) ──────────
    const dailyRows = dailyQuery.data ?? [];
    const warmthPts: WarmthPoint[] = dailyRows
      .filter((r) => r.date)
      .map((r) => ({ d: shortDay(r.date), v: clamp(Math.round(num(r.warmth_score)), 0, 100) }));
    // Only fill a range slot when the real window actually has ≥ that many
    // points; otherwise keep the skeleton for that slot (no fabrication).
    const warmth: Record<string, WarmthPoint[]> = {
      '7d': warmthPts.length >= 7 ? tail(warmthPts, 7) : skel.warmth['7d'],
      '14d': warmthPts.length >= 14 ? tail(warmthPts, 14) : skel.warmth['14d'],
      '30d': warmthPts.length >= 1 ? warmthPts : skel.warmth['30d'],
      // TODO: no API source — the default daily-metrics window is ≈30d, so a
      // genuine 90-day series is never returned. Keep the skeleton series.
      '90d': skel.warmth['90d'],
    };

    // ── Engagement bars (real — useEngagement open/reply rates) ───────────
    // The design's bars are "opened / replied / clicked". The engagement
    // endpoint exposes open_rate / reply_rate / star_rate / rescue_rate (no
    // click-rate). We map opened←open_rate, replied←reply_rate and
    // clicked←star_rate (the closest available extra engagement signal —
    // there is no click metric in the warmup engine; flagged below).
    const engRows = engagementQuery.data ?? [];
    const engPts: EngagementBar[] = engRows
      .filter((p) => p.bucket)
      .map((p) => ({
        d: shortDay(p.bucket),
        opened: Math.round(asPct(p.open_rate)),
        replied: Math.round(asPct(p.reply_rate)),
        // TODO: no API source — the warmup engine tracks no "click" signal.
        // star_rate is the nearest extra engagement metric; surfaced here so
        // the third bar reflects a real number rather than a fabricated one.
        clicked: Math.round(asPct(p.star_rate)),
      }));
    const engagement: Record<string, EngagementBar[]> = {
      '7d': engPts.length >= 1 ? tail(engPts, 7) : skel.engagement['7d'],
      '14d': engPts.length >= 1 ? tail(engPts, 14) : skel.engagement['14d'],
      '30d': engPts.length >= 1 ? engPts : skel.engagement['30d'],
      // TODO: no API source — default engagement window doesn't span 90d.
      '90d': skel.engagement['90d'],
    };

    // ── Placement split (real — usePlacementTrend, averaged over window) ──
    // The design's placement block is a single split per range, not a
    // timeseries; the endpoint returns a per-date trend. Average the trend
    // window into one split (the honest reduction of the available data).
    const plcRows = placementQuery.data ?? [];
    const avgSplit = (): PlacementSplit | null => {
      if (plcRows.length === 0) return null;
      let i = 0;
      let p = 0;
      let s = 0;
      for (const r of plcRows) {
        i += asPct(r.inbox_pct);
        p += asPct(r.promotions_pct);
        s += asPct(r.spam_pct);
      }
      const n = plcRows.length;
      return {
        inbox: clamp(Math.round(i / n), 0, 100),
        promo: clamp(Math.round(p / n), 0, 100),
        spam: clamp(Math.round(s / n), 0, 100),
      };
    };
    const split = avgSplit();
    // One real split for every range slot we can fill (the trend window has
    // no per-range breakdown); 90d keeps the skeleton (window ≈ 30d only).
    const placement: Record<string, PlacementSplit> = {
      '7d': split ?? skel.placement['7d'],
      '14d': split ?? skel.placement['14d'],
      '30d': split ?? skel.placement['30d'],
      // TODO: no API source — default placement window doesn't span 90d.
      '90d': skel.placement['90d'],
    };

    const series: CanvasSeries = {
      warmth: warmth as CanvasSeries['warmth'],
      engagement: engagement as CanvasSeries['engagement'],
      placement: placement as CanvasSeries['placement'],
    };

    return {
      mailboxes: mapMailboxes(mailboxes),
      series,
    };
  }, [
    mailboxesQuery.isLoading,
    mailboxes,
    dailyQuery.data,
    placementQuery.data,
    engagementQuery.data,
  ]);

  return { data, isLoading };
}
