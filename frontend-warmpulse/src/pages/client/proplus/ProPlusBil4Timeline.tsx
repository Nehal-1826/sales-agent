import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  Crown,
  Flag,
  Plus,
  RefreshCcw,
  Rocket,
  Sparkles,
  TrendingUp,
  Undo2,
  Wallet,
  XOctagon,
  Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { formatMoney, formatNumber, formatDate } from '@/lib/format';

/**
 * ProPlusBil4Timeline — "Spend Timeline / Financial Story".
 *
 * Standalone preview-harness page rendered prop-less with built-in MOCK.
 * No network / router / fetch / query hooks.
 *
 * Concept: billing as a chronological financial narrative. A horizontal
 * timeline spans ~14 months since signup with interactive milestone dots
 * (signup / Pro upgrade / monthly renewals / Pro Plus upgrade / refund /
 * add-on). Above it: a cumulative spend area chart that trails the
 * timeline. Past today the line extends as a dashed forecast of the next
 * three renewals. Clicking any milestone drives an animated drawer below
 * showing that month's line items.
 *
 * Real useState: `selectedId` drives the breakdown drawer. Summary stats
 * (total, monthly avg, biggest month, days since signup) are computed
 * with .reduce() over the milestones + month-buckets.
 *
 * Distinct from sibling Pro-Plus billing layouts:
 *   - NOT a receipt / invoice list (no PDF rows, no line-item table layout)
 *   - NOT a plan-card compare (no side-by-side tier matrix)
 *   - NOT a meter cockpit (no usage bars or quota cards)
 *   - Centerpiece is a chronological timeline + cumulative trail + forecast.
 *
 * Styling: existing Tailwind tokens only.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type MilestoneType =
  | 'signup'
  | 'upgrade'
  | 'renewal'
  | 'addon'
  | 'refund'
  | 'failed';

interface Milestone {
  id: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  type: MilestoneType;
  label: string;
  /** USD, positive for charges, negative for refunds. */
  amount: number;
  /** Optional secondary note. */
  note?: string;
}

interface ForecastPoint {
  id: string;
  date: string;
  label: string;
  amount: number;
}

interface LineItem {
  id: string;
  label: string;
  amount: number;
  kind: 'subscription' | 'addon' | 'adjustment' | 'refund' | 'failed';
}

interface MonthBucket {
  /** yyyy-mm key, also drives drawer state. */
  ym: string;
  /** Human label e.g. "Mar 2025". */
  label: string;
  items: LineItem[];
}

// ---------------------------------------------------------------------------
// Mock data — 15 milestones across 14 months
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function shift(months: number, day: number): string {
  const d = new Date(ANCHOR);
  d.setMonth(ANCHOR.getMonth() - months);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
}

function ymOf(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

const MILESTONES: Milestone[] = [
  {
    id: 'm-signup',
    date: shift(13, 4),
    type: 'signup',
    label: 'Joined WarmPulse',
    amount: 0,
    note: 'Starter trial · 14-day no-card',
  },
  {
    id: 'm-pro-1',
    date: shift(12, 4),
    type: 'upgrade',
    label: 'Upgraded to Pro',
    amount: 49,
    note: '5 mailboxes · 30 sends/day',
  },
  {
    id: 'm-pro-r1',
    date: shift(11, 4),
    type: 'renewal',
    label: 'Pro renewal',
    amount: 49,
  },
  {
    id: 'm-pro-r2',
    date: shift(10, 4),
    type: 'renewal',
    label: 'Pro renewal',
    amount: 49,
  },
  {
    id: 'm-pro-r3',
    date: shift(9, 4),
    type: 'renewal',
    label: 'Pro renewal',
    amount: 49,
  },
  {
    id: 'm-pro-r4',
    date: shift(8, 4),
    type: 'renewal',
    label: 'Pro renewal',
    amount: 49,
  },
  {
    id: 'm-pp-up',
    date: shift(7, 12),
    type: 'upgrade',
    label: 'Upgraded to Pro Plus',
    amount: 73,
    note: 'Mid-cycle proration · 15 mailboxes unlocked',
  },
  {
    id: 'm-pp-r1',
    date: shift(6, 4),
    type: 'renewal',
    label: 'Pro Plus renewal',
    amount: 96,
  },
  {
    id: 'm-pp-r2',
    date: shift(5, 4),
    type: 'renewal',
    label: 'Pro Plus renewal',
    amount: 96,
  },
  {
    id: 'm-addon',
    date: shift(4, 21),
    type: 'addon',
    label: 'Sender-trust boost add-on',
    amount: 24,
    note: 'One-off helper-group priority pack',
  },
  {
    id: 'm-pp-r3',
    date: shift(4, 4),
    type: 'renewal',
    label: 'Pro Plus renewal',
    amount: 96,
  },
  {
    id: 'm-refund',
    date: shift(3, 9),
    type: 'refund',
    label: 'Goodwill refund',
    amount: -48,
    note: 'Partial credit for Mar helper-group downtime',
  },
  {
    id: 'm-pp-r4',
    date: shift(3, 4),
    type: 'renewal',
    label: 'Pro Plus renewal',
    amount: 96,
  },
  {
    id: 'm-fail',
    date: shift(2, 2),
    type: 'failed',
    label: 'Charge failed · retried next day',
    amount: 0,
    note: 'Card declined · Visa ·· 4242 · auto-retry succeeded',
  },
  {
    id: 'm-pp-r5',
    date: shift(1, 4),
    type: 'renewal',
    label: 'Pro Plus renewal',
    amount: 96,
  },
  {
    id: 'm-pp-r6',
    date: shift(0, 4),
    type: 'renewal',
    label: 'Pro Plus renewal',
    amount: 96,
    note: 'Latest invoice',
  },
];

const FORECAST: ForecastPoint[] = [
  { id: 'f-1', date: shift(-1, 4), label: 'Projected renewal', amount: 96 },
  { id: 'f-2', date: shift(-2, 4), label: 'Projected renewal', amount: 96 },
  { id: 'f-3', date: shift(-3, 4), label: 'Projected renewal', amount: 96 },
];

/**
 * Per-month breakdown for the drawer. Each entry is keyed by yyyy-mm and
 * contains the line items that posted in that month. The drawer pulls
 * the row matching the selected milestone's month.
 */
const MONTH_DETAILS: MonthBucket[] = [
  {
    ym: ymOf(shift(13, 4)),
    label: monthLabel(shift(13, 4)),
    items: [
      {
        id: 'd1',
        label: 'Account created · Starter trial',
        amount: 0,
        kind: 'adjustment',
      },
    ],
  },
  {
    ym: ymOf(shift(12, 4)),
    label: monthLabel(shift(12, 4)),
    items: [
      { id: 'd2', label: 'Pro · monthly subscription', amount: 49, kind: 'subscription' },
    ],
  },
  {
    ym: ymOf(shift(11, 4)),
    label: monthLabel(shift(11, 4)),
    items: [{ id: 'd3', label: 'Pro · monthly subscription', amount: 49, kind: 'subscription' }],
  },
  {
    ym: ymOf(shift(10, 4)),
    label: monthLabel(shift(10, 4)),
    items: [{ id: 'd4', label: 'Pro · monthly subscription', amount: 49, kind: 'subscription' }],
  },
  {
    ym: ymOf(shift(9, 4)),
    label: monthLabel(shift(9, 4)),
    items: [{ id: 'd5', label: 'Pro · monthly subscription', amount: 49, kind: 'subscription' }],
  },
  {
    ym: ymOf(shift(8, 4)),
    label: monthLabel(shift(8, 4)),
    items: [{ id: 'd6', label: 'Pro · monthly subscription', amount: 49, kind: 'subscription' }],
  },
  {
    ym: ymOf(shift(7, 12)),
    label: monthLabel(shift(7, 12)),
    items: [
      {
        id: 'd7a',
        label: 'Pro Plus · mid-cycle proration (19 days)',
        amount: 73,
        kind: 'subscription',
      },
      {
        id: 'd7b',
        label: 'Tier change adjustment · Pro credit applied',
        amount: -16,
        kind: 'adjustment',
      },
    ],
  },
  {
    ym: ymOf(shift(6, 4)),
    label: monthLabel(shift(6, 4)),
    items: [
      { id: 'd8', label: 'Pro Plus · monthly subscription', amount: 96, kind: 'subscription' },
    ],
  },
  {
    ym: ymOf(shift(5, 4)),
    label: monthLabel(shift(5, 4)),
    items: [
      { id: 'd9', label: 'Pro Plus · monthly subscription', amount: 96, kind: 'subscription' },
    ],
  },
  {
    ym: ymOf(shift(4, 4)),
    label: monthLabel(shift(4, 4)),
    items: [
      { id: 'd10a', label: 'Pro Plus · monthly subscription', amount: 96, kind: 'subscription' },
      {
        id: 'd10b',
        label: 'Sender-trust boost · one-off add-on',
        amount: 24,
        kind: 'addon',
      },
    ],
  },
  {
    ym: ymOf(shift(3, 4)),
    label: monthLabel(shift(3, 4)),
    items: [
      { id: 'd11a', label: 'Pro Plus · monthly subscription', amount: 96, kind: 'subscription' },
      {
        id: 'd11b',
        label: 'Goodwill refund · helper-group downtime',
        amount: -48,
        kind: 'refund',
      },
    ],
  },
  {
    ym: ymOf(shift(2, 4)),
    label: monthLabel(shift(2, 4)),
    items: [
      {
        id: 'd12a',
        label: 'Pro Plus · charge attempt (declined)',
        amount: 0,
        kind: 'failed',
      },
      {
        id: 'd12b',
        label: 'Pro Plus · charge retry (succeeded next day)',
        amount: 96,
        kind: 'subscription',
      },
    ],
  },
  {
    ym: ymOf(shift(1, 4)),
    label: monthLabel(shift(1, 4)),
    items: [
      { id: 'd13', label: 'Pro Plus · monthly subscription', amount: 96, kind: 'subscription' },
    ],
  },
  {
    ym: ymOf(shift(0, 4)),
    label: monthLabel(shift(0, 4)),
    items: [
      { id: 'd14', label: 'Pro Plus · monthly subscription', amount: 96, kind: 'subscription' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_META: Record<
  MilestoneType,
  {
    Icon: typeof Crown;
    dot: string;
    ring: string;
    text: string;
    bg: string;
    label: string;
  }
> = {
  signup: {
    Icon: Flag,
    dot: 'bg-accent',
    ring: 'ring-accent/30',
    text: 'text-accent',
    bg: 'bg-accent/10',
    label: 'Signup',
  },
  upgrade: {
    Icon: Rocket,
    dot: 'bg-accent',
    ring: 'ring-accent/30',
    text: 'text-accent',
    bg: 'bg-accent/10',
    label: 'Upgrade',
  },
  renewal: {
    Icon: RefreshCcw,
    dot: 'bg-text-dim',
    ring: 'ring-border-muted',
    text: 'text-text-dim',
    bg: 'bg-surface-2',
    label: 'Renewal',
  },
  addon: {
    Icon: Plus,
    dot: 'bg-accent',
    ring: 'ring-accent/30',
    text: 'text-accent',
    bg: 'bg-accent/10',
    label: 'Add-on',
  },
  refund: {
    Icon: Undo2,
    dot: 'bg-accent4',
    ring: 'ring-accent4/30',
    text: 'text-accent4',
    bg: 'bg-accent4/10',
    label: 'Refund',
  },
  failed: {
    Icon: XOctagon,
    dot: 'bg-accent3',
    ring: 'ring-accent3/30',
    text: 'text-accent3',
    bg: 'bg-accent3/10',
    label: 'Failed',
  },
};

function usd(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${formatMoney(Math.abs(n))}`;
}

function signedUsd(n: number): string {
  if (n === 0) return formatMoney(0);
  if (n > 0) return `+${formatMoney(n)}`;
  return `-${formatMoney(Math.abs(n))}`;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Animation presets
// ---------------------------------------------------------------------------

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// CountUp — animated number using framer-motion's `animate` on a value via
// useEffect-free approach (motion's whileInView with object-based animate).
// ---------------------------------------------------------------------------

function CountUp({
  to,
  prefix = '',
  suffix = '',
  duration = 1.1,
  delay = 0,
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  className?: string;
}): JSX.Element {
  return (
    <motion.span
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay }}
    >
      <motion.span
        initial={{ '--n': 0 } as never}
        animate={{ '--n': to } as never}
        transition={{ duration, delay, ease: 'easeOut' }}
      >
        <CountValue prefix={prefix} suffix={suffix} target={to} />
      </motion.span>
    </motion.span>
  );
}

/**
 * Simple, dependency-free counter using a CSS variable bridge isn't reliable
 * across browsers — fall back to a JS-driven counter via requestAnimationFrame.
 */
function CountValue({
  prefix,
  suffix,
  target,
}: {
  prefix: string;
  suffix: string;
  target: number;
}): JSX.Element {
  const [n, setN] = useState(0);
  // Drive via rAF when target changes.
  useMemo(() => {
    const start = performance.now();
    const dur = 1100;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return (
    <span className="tabular-nums">
      {prefix}
      {formatNumber(n)}
      {suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusBil4Timeline(): JSX.Element {
  // Default to the latest milestone so the drawer shows something on first paint.
  const [selectedId, setSelectedId] = useState<string>(MILESTONES[MILESTONES.length - 1]!.id);

  // --- Sort milestones chronologically for layout / cumulative math. ---
  const ordered = useMemo(
    () => [...MILESTONES].sort((a, b) => a.date.localeCompare(b.date)),
    [],
  );

  // --- Cumulative trail series (history) ---
  const trail = useMemo(() => {
    let running = 0;
    return ordered.map((m) => {
      running += Math.max(0, m.amount); // refunds & failed charges don't grow spend
      return {
        date: m.date,
        ts: new Date(m.date).getTime(),
        cumulative: running,
        forecast: undefined as number | undefined,
        isForecast: false,
      };
    });
  }, [ordered]);

  // --- Cumulative forecast continuation (dashed) starts from last history point. ---
  const forecastSeries = useMemo(() => {
    const last = trail[trail.length - 1];
    if (!last) return [];
    let running = last.cumulative;
    const head = {
      date: last.date,
      ts: last.ts,
      cumulative: undefined as number | undefined,
      forecast: last.cumulative,
      isForecast: true,
    };
    const tail = FORECAST.map((f) => {
      running += f.amount;
      return {
        date: f.date,
        ts: new Date(f.date).getTime(),
        cumulative: undefined as number | undefined,
        forecast: running,
        isForecast: true,
      };
    });
    return [head, ...tail];
  }, [trail]);

  const chartData = useMemo(
    () => [...trail, ...forecastSeries],
    [trail, forecastSeries],
  );

  // --- X-axis bounds covering history + forecast for stable positioning ---
  const [xMin, xMax] = useMemo(() => {
    if (chartData.length === 0) return [0, 1] as const;
    const tsList = chartData.map((p) => p.ts);
    return [Math.min(...tsList), Math.max(...tsList)] as const;
  }, [chartData]);

  // --- Summary stats (reduce-driven) ---
  const stats = useMemo(() => {
    const total = ordered.reduce((acc, m) => acc + (m.amount > 0 ? m.amount : 0), 0);
    const refunds = ordered.reduce(
      (acc, m) => acc + (m.amount < 0 ? Math.abs(m.amount) : 0),
      0,
    );
    const net = total - refunds;
    // Group by yyyy-mm for monthly stats.
    const perMonth = ordered.reduce<Record<string, number>>((acc, m) => {
      const k = ymOf(m.date);
      acc[k] = (acc[k] ?? 0) + m.amount;
      return acc;
    }, {});
    const months = Object.entries(perMonth);
    const biggest = months.reduce(
      (best, [k, v]) => (v > best.amount ? { ym: k, amount: v } : best),
      { ym: '', amount: 0 },
    );
    const monthsActive = months.length || 1;
    const avg = Math.round(net / monthsActive);
    const signupIso = ordered[0]?.date ?? ANCHOR.toISOString().slice(0, 10);
    const daysSince = daysBetween(signupIso, ANCHOR.toISOString().slice(0, 10));
    return { total, refunds, net, avg, biggest, daysSince, monthsActive };
  }, [ordered]);

  const selected = useMemo(
    () => ordered.find((m) => m.id === selectedId) ?? ordered[ordered.length - 1]!,
    [ordered, selectedId],
  );

  const selectedMonth = useMemo(() => {
    const ym = ymOf(selected.date);
    return (
      MONTH_DETAILS.find((b) => b.ym === ym) ?? {
        ym,
        label: monthLabel(selected.date),
        items: [],
      }
    );
  }, [selected]);

  const selectedMonthTotal = useMemo(
    () => selectedMonth.items.reduce((s, it) => s + it.amount, 0),
    [selectedMonth],
  );

  // --- Forecast horizon for the band ---
  const forecastTotal = useMemo(
    () => FORECAST.reduce((s, f) => s + f.amount, 0),
    [],
  );

  // Today timestamp for the ReferenceLine separating history vs forecast.
  const todayTs = trail[trail.length - 1]?.ts ?? Date.now();

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ */}
      {/* Header band                                                  */}
      {/* ------------------------------------------------------------ */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Spend timeline
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </span>
          </div>
          <p className="text-sm text-text-dim">
            Your financial story with WarmPulse · click any milestone to inspect the month.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <CalendarRange className="h-3.5 w-3.5 text-accent" />
          <span>
            <strong className="text-text">{longDate(ordered[0]!.date)}</strong>
            {' → '}
            <strong className="text-text">{longDate(ANCHOR.toISOString())}</strong>
          </span>
        </div>
      </motion.header>

      {/* ------------------------------------------------------------ */}
      {/* Summary band — four stats with count-up animation            */}
      {/* ------------------------------------------------------------ */}
      <motion.section
        {...fade(0.05)}
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <SummaryStat
          Icon={Wallet}
          label="Net spend to date"
          value={stats.net}
          prefix="$"
          tone="accent"
          subtitle={`${stats.monthsActive} months active`}
          delay={0.1}
        />
        <SummaryStat
          Icon={TrendingUp}
          label="Monthly average"
          value={stats.avg}
          prefix="$"
          tone="accent"
          subtitle="across active months"
          delay={0.15}
        />
        <SummaryStat
          Icon={ArrowUpRight}
          label="Biggest month"
          value={stats.biggest.amount}
          prefix="$"
          tone="accent4"
          subtitle={stats.biggest.ym ? monthLabel(`${stats.biggest.ym}-01`) : '—'}
          delay={0.2}
        />
        <SummaryStat
          Icon={Flag}
          label="Days since signup"
          value={stats.daysSince}
          prefix=""
          tone="accent"
          subtitle={`Joined ${shortDate(ordered[0]!.date)}`}
          delay={0.25}
        />
      </motion.section>

      {/* ------------------------------------------------------------ */}
      {/* Cumulative spend chart (above timeline)                       */}
      {/* ------------------------------------------------------------ */}
      <motion.section {...fade(0.3)}>
        <Card noShimmer>
          <CardContent className="space-y-3 p-5">
            <header className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                <div>
                  <h2 className="text-base font-semibold text-text">
                    Cumulative spend
                  </h2>
                  <p className="text-xs text-text-dim">
                    Solid · history · dashed · 3-renewal forecast
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text-dim">
                  <span className="h-1.5 w-3 rounded-full bg-accent" />
                  Actual
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text-dim">
                  <span
                    className="inline-block h-px w-3 border-t-2 border-dashed"
                    style={{ borderColor: 'var(--wp-accent, #F26522)' }}
                  />
                  Forecast +{usd(forecastTotal)}
                </span>
              </div>
            </header>
            <motion.div
              className="h-56 w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="bil4-trail" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F26522" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a3a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={[xMin, xMax]}
                    scale="time"
                    tick={{ fill: '#8888a0', fontSize: 11 }}
                    axisLine={{ stroke: '#2a2a3a' }}
                    tickLine={false}
                    tickFormatter={(v: number) => formatDate(new Date(v))}
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fill: '#8888a0', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v: number) => formatMoney(v)}
                  />
                  <Tooltip
                    cursor={{ stroke: '#F26522', strokeOpacity: 0.3 }}
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #2a2a3a',
                      borderRadius: 8,
                      color: '#e8e8f0',
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => formatDate(new Date(v as number))}
                    formatter={(v: number, name: string) => [
                      usd(v),
                      name === 'cumulative' ? 'Cumulative' : 'Forecast',
                    ]}
                  />
                  <ReferenceLine
                    x={todayTs}
                    stroke="#F26522"
                    strokeDasharray="2 4"
                    strokeOpacity={0.6}
                    label={{
                      value: 'Today',
                      fill: '#8888a0',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#F26522"
                    strokeWidth={2}
                    fill="url(#bil4-trail)"
                    isAnimationActive
                    animationDuration={1100}
                  />
                  <Area
                    type="monotone"
                    dataKey="forecast"
                    stroke="#FF8A4B"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    fill="transparent"
                    isAnimationActive
                    animationDuration={1100}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </CardContent>
        </Card>
      </motion.section>

      {/* ------------------------------------------------------------ */}
      {/* Horizontal timeline                                           */}
      {/* ------------------------------------------------------------ */}
      <motion.section {...fade(0.35)}>
        <Card noShimmer>
          <CardContent className="space-y-4 p-5">
            <header className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-accent" />
                <div>
                  <h2 className="text-base font-semibold text-text">Milestones</h2>
                  <p className="text-xs text-text-dim">
                    {MILESTONES.length} events · {FORECAST.length} forecast renewals · scroll horizontally to pan
                  </p>
                </div>
              </div>
              <LegendRow />
            </header>

            {/* The scroll viewport keeps the timeline usable on narrow widths. */}
            <div className="overflow-x-auto pb-2">
              <div className="relative min-w-[920px] pl-2 pr-4">
                <Timeline
                  history={ordered}
                  forecast={FORECAST}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* ------------------------------------------------------------ */}
      {/* Month-breakdown drawer (animated height)                      */}
      {/* ------------------------------------------------------------ */}
      <motion.section {...fade(0.4)}>
        <Card noShimmer>
          <CardContent className="p-0">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${TYPE_META[selected.type].bg} ${TYPE_META[selected.type].text}`}
                >
                  {(() => {
                    const Icon = TYPE_META[selected.type].Icon;
                    return <Icon className="h-4 w-4" />;
                  })()}
                </span>
                <div className="space-y-0.5">
                  <h2 className="text-base font-semibold text-text">
                    {selectedMonth.label}{' '}
                    <span className="text-text-dim">·</span>{' '}
                    <span className={TYPE_META[selected.type].text}>{selected.label}</span>
                  </h2>
                  <p className="text-xs text-text-dim">
                    {longDate(selected.date)} · {selectedMonth.items.length} line
                    item{selectedMonth.items.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text-dim">
                  Month total{' '}
                  <strong className="text-text tabular-nums">{signedUsd(selectedMonthTotal)}</strong>
                </span>
                <span className="hidden items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text-dim sm:inline-flex">
                  <ChevronDown className="h-3 w-3" />
                  Selected
                </span>
              </div>
            </header>

            <AnimatePresence mode="wait" initial={false}>
              <motion.ul
                key={selected.id}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="overflow-hidden divide-y divide-border-muted/60"
              >
                {selectedMonth.items.length === 0 ? (
                  <li className="px-5 py-6 text-center text-sm text-text-dim">
                    No line items recorded for this month.
                  </li>
                ) : (
                  selectedMonth.items.map((it, i) => (
                    <motion.li
                      key={it.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.05 + i * 0.05 }}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <LineKindBadge kind={it.kind} />
                      <span className="flex-1 text-sm text-text">{it.label}</span>
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          it.amount < 0
                            ? 'text-accent4'
                            : it.amount === 0
                              ? 'text-text-dim'
                              : 'text-text'
                        }`}
                      >
                        {it.amount === 0 ? '—' : signedUsd(it.amount)}
                      </span>
                    </motion.li>
                  ))
                )}
                <li className="flex items-center justify-between bg-surface-2/60 px-5 py-3 text-sm">
                  <span className="text-text-dim">Net for {selectedMonth.label}</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      selectedMonthTotal < 0
                        ? 'text-accent4'
                        : 'text-text'
                    }`}
                  >
                    {signedUsd(selectedMonthTotal)}
                  </span>
                </li>
              </motion.ul>
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.section>
    </div>
  );
}

export default ProPlusBil4Timeline;

// ===========================================================================
// Local sub-components
// ===========================================================================

function SummaryStat({
  Icon,
  label,
  value,
  prefix,
  tone,
  subtitle,
  delay,
}: {
  Icon: typeof Wallet;
  label: string;
  value: number;
  prefix: string;
  tone: 'accent' | 'accent3' | 'accent4';
  subtitle: string;
  delay: number;
}): JSX.Element {
  const toneText: Record<typeof tone, string> = {
    accent: 'text-accent',
    accent3: 'text-accent3',
    accent4: 'text-accent4',
  };
  const toneBg: Record<typeof tone, string> = {
    accent: 'bg-accent/10',
    accent3: 'bg-accent3/10',
    accent4: 'bg-accent4/10',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl"
    >
      <div className="flex items-start justify-between">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneBg[tone]} ${toneText[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold leading-none tracking-tight text-text">
        <CountUp to={value} prefix={prefix} delay={delay} />
      </div>
      <div className="mt-1 text-xs font-medium text-text">{label}</div>
      <div className="text-xs text-text-dim">{subtitle}</div>
    </motion.div>
  );
}

function LegendRow(): JSX.Element {
  const items: { type: MilestoneType; label: string }[] = [
    { type: 'signup', label: 'Signup' },
    { type: 'upgrade', label: 'Upgrade' },
    { type: 'renewal', label: 'Renewal' },
    { type: 'addon', label: 'Add-on' },
    { type: 'refund', label: 'Refund' },
    { type: 'failed', label: 'Failed' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => {
        const m = TYPE_META[it.type];
        return (
          <span
            key={it.type}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[11px] text-text-dim"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
            {it.label}
          </span>
        );
      })}
    </div>
  );
}

function LineKindBadge({ kind }: { kind: LineItem['kind'] }): JSX.Element {
  const meta: Record<LineItem['kind'], { label: string; cls: string }> = {
    subscription: { label: 'Subscription', cls: 'bg-accent/10 text-accent border-accent/30' },
    addon: { label: 'Add-on', cls: 'bg-accent/10 text-accent border-accent/30' },
    adjustment: { label: 'Adjustment', cls: 'bg-surface-2 text-text-dim border-border-muted' },
    refund: { label: 'Refund', cls: 'bg-accent4/10 text-accent4 border-accent4/30' },
    failed: { label: 'Failed', cls: 'bg-accent3/10 text-accent3 border-accent3/30' },
  };
  const m = meta[kind];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Timeline — pure layout component
// ---------------------------------------------------------------------------

function Timeline({
  history,
  forecast,
  selectedId,
  onSelect,
}: {
  history: Milestone[];
  forecast: ForecastPoint[];
  selectedId: string;
  onSelect: (id: string) => void;
}): JSX.Element {
  const minTs = Math.min(...history.map((m) => new Date(m.date).getTime()));
  const lastHist = Math.max(...history.map((m) => new Date(m.date).getTime()));
  const lastFc =
    forecast.length > 0
      ? Math.max(...forecast.map((f) => new Date(f.date).getTime()))
      : lastHist;
  const maxTs = Math.max(lastHist, lastFc);
  const span = Math.max(1, maxTs - minTs);

  const pos = (iso: string): number => {
    const t = new Date(iso).getTime();
    return ((t - minTs) / span) * 100;
  };

  const todayPct = (lastHist - minTs) / span * 100;

  // Month tick labels at the bottom — generate one per ~1.5 months for clarity.
  const monthTicks = useMemo(() => {
    const ticks: { iso: string; left: number; label: string }[] = [];
    const start = new Date(minTs);
    start.setDate(1);
    const end = new Date(maxTs);
    let cur = new Date(start);
    while (cur.getTime() <= end.getTime()) {
      ticks.push({
        iso: cur.toISOString(),
        left: pos(cur.toISOString()),
        label: formatDate(cur),
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 2, 1);
    }
    return ticks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minTs, maxTs]);

  return (
    <div className="relative h-[200px]">
      {/* Spine container — split history & forecast halves so the dashed
          extension reads as separate from the solid history line. */}
      <div className="absolute left-0 right-0 top-[96px] h-px">
        {/* History spine — solid, animated draw-in */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.45 }}
          style={{
            width: `${todayPct}%`,
            transformOrigin: 'left center',
          }}
          className="h-px bg-gradient-to-r from-accent/70 via-accent to-accent/70"
        />
        {/* Forecast spine — dashed, drawn after history */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 1.35 }}
          style={{
            position: 'absolute',
            left: `${todayPct}%`,
            top: 0,
            width: `${100 - todayPct}%`,
            transformOrigin: 'left center',
            borderTop: '2px dashed #FF8A4B',
            opacity: 0.7,
          }}
        />
      </div>

      {/* Today marker */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 1.2 }}
        className="absolute"
        style={{ left: `${todayPct}%`, top: 0, bottom: 24 }}
      >
        <div className="absolute -translate-x-1/2 -top-1 text-[10px] font-medium uppercase tracking-wider text-accent">
          Today
        </div>
        <div className="h-full w-px bg-gradient-to-b from-accent/70 via-accent/30 to-transparent" />
      </motion.div>

      {/* History milestone dots */}
      {history.map((m, i) => {
        const meta = TYPE_META[m.type];
        const isSelected = m.id === selectedId;
        const left = pos(m.date);
        // Stagger above / below to prevent label overlap.
        const above = i % 2 === 0;
        return (
          <motion.button
            type="button"
            key={m.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.4,
              delay: 0.7 + i * 0.04,
              type: 'spring',
              stiffness: 240,
              damping: 18,
            }}
            whileHover={{ y: above ? -2 : 2, scale: 1.08 }}
            onClick={() => onSelect(m.id)}
            aria-pressed={isSelected}
            className={`group absolute -translate-x-1/2 cursor-pointer focus:outline-none ${isSelected ? 'z-20' : 'z-10'}`}
            style={{ left: `${left}%`, top: 96 - 6 }}
          >
            {/* Connector stem */}
            <span
              aria-hidden
              className={`absolute left-1/2 ${above ? '-translate-y-full bottom-3' : 'top-3'} h-6 w-px ${isSelected ? 'bg-accent' : 'bg-border-muted'}`}
            />
            {/* Dot */}
            <span
              className={`relative flex h-3 w-3 items-center justify-center rounded-full ${meta.dot} ring-4 ${isSelected ? 'ring-accent/40' : meta.ring} transition-shadow`}
            >
              {isSelected ? (
                <motion.span
                  layoutId="bil4-selected-ring"
                  className="absolute inset-[-6px] rounded-full border border-accent/60"
                  transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                />
              ) : null}
            </span>

            {/* Label card (above or below) */}
            <span
              className={`absolute left-1/2 w-44 -translate-x-1/2 ${above ? 'bottom-9' : 'top-9'} pointer-events-none`}
            >
              <span
                className={`block rounded-lg border ${isSelected ? 'border-accent/40 bg-surface' : 'border-border-muted bg-surface/80'} px-2 py-1.5 text-left backdrop-blur-xl transition-colors group-hover:border-accent/40`}
              >
                <span className="flex items-center justify-between gap-1.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider ${meta.text}`}>
                    <meta.Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-text-dim">{shortDate(m.date)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs font-medium text-text">
                  {m.label}
                </span>
                <span
                  className={`mt-0.5 block text-[11px] tabular-nums ${
                    m.amount === 0
                      ? 'text-text-dim'
                      : m.amount < 0
                        ? 'text-accent4'
                        : 'text-text'
                  }`}
                >
                  {m.amount === 0 ? 'no charge' : signedUsd(m.amount)}
                </span>
              </span>
            </span>
          </motion.button>
        );
      })}

      {/* Forecast milestone dots (hollow, dashed-ring) */}
      {forecast.map((f, i) => {
        const left = pos(f.date);
        return (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 1.5 + i * 0.08 }}
            className="absolute -translate-x-1/2"
            style={{ left: `${left}%`, top: 96 - 6 }}
          >
            <span
              aria-hidden
              className="absolute left-1/2 top-3 h-6 w-px border-l border-dashed border-accent2/60"
            />
            <span
              className="relative flex h-3 w-3 items-center justify-center rounded-full border-2 border-dashed border-accent2/80 bg-surface"
              title={`${f.label} · ${longDate(f.date)}`}
            >
              <span className="sr-only">{f.label}</span>
            </span>
            <span className="pointer-events-none absolute left-1/2 top-9 w-32 -translate-x-1/2">
              <span className="block rounded-lg border border-dashed border-accent2/40 bg-surface/60 px-2 py-1 text-center backdrop-blur-xl">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-accent2">
                  Projected
                </span>
                <span className="block text-[10px] text-text-dim">{shortDate(f.date)}</span>
                <span className="block text-[11px] font-medium tabular-nums text-text">
                  {signedUsd(f.amount)}
                </span>
              </span>
            </span>
          </motion.div>
        );
      })}

      {/* Month tick labels */}
      <div className="absolute inset-x-0 bottom-0 h-5">
        {monthTicks.map((t) => (
          <span
            key={t.iso}
            className="absolute -translate-x-1/2 text-[10px] uppercase tracking-wider text-text-dim"
            style={{ left: `${t.left}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {/* Refund/failure mini-indicator strip below the spine (sentiment cue) */}
      <div className="absolute inset-x-0 top-[112px] h-2 pointer-events-none">
        {history
          .filter((m) => m.type === 'refund' || m.type === 'failed')
          .map((m) => (
            <motion.span
              key={`mark-${m.id}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 1.2 }}
              className={`absolute h-2 w-2 -translate-x-1/2 rotate-45 ${
                m.type === 'refund' ? 'bg-accent4/40' : 'bg-accent3/40'
              }`}
              style={{ left: `${pos(m.date)}%` }}
              aria-hidden
            />
          ))}
      </div>

      {/* Decorative arrow at far right to telegraph forecast direction */}
      <motion.span
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 2 }}
        className="absolute right-0 top-[88px] text-accent2"
        aria-hidden
      >
        <ArrowDownRight className="h-3.5 w-3.5 rotate-[-45deg]" />
      </motion.span>
    </div>
  );
}
