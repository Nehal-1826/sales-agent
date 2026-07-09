import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChevronsUpDown,
  Database,
  Filter,
  Layers,
  TableProperties,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * ProPlusAna1Explorer — STANDALONE Pro-Plus "Data Explorer / pivot" analytics
 * section for the isolated preview harness.
 *
 * This is deliberately NOT a dashboard. There is no fixed KPI band, no fixed
 * chart stack, no leaderboard. Instead it's an interactive analyst tool:
 *
 *   ┌─ Control bar ───────────────────────────────────────────────┐
 *   │  [metric picker]  [group-by picker]  [date-range segmented]  │
 *   ├─ Saved views chips ── result-count line ────────────────────┤
 *   │  Reactive primary chart  (line if time dim, bars if category) │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Pivot breakdown table — rows = dimension, cols = metrics,    │
 *   │  every cell value + inline heat-tint bar, click a header to   │
 *   │  live re-sort (animated row reflow)                           │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Everything recomputes for real from a flat fact array (15 mailboxes ×
 * 30 days = 450 rows) via `useMemo` keyed on the picker state — the
 * interactivity is genuine, not faked. Renders ONLY page content; the
 * shell + sidebar are supplied by the harness. No router / query / fetch.
 */

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'yahoo' | 'smtp';
type RampStage = 'D1-3' | 'D4-7' | 'D8-14' | 'D15-21' | 'D22-28' | 'D29+';

/** One immutable per-mailbox-per-day fact. The whole UI pivots over these. */
interface Fact {
  mailboxId: string;
  mailbox: string;
  provider: Provider;
  /** 0-based day index into the 30-day window (0 = oldest). */
  dayIndex: number;
  iso: string;
  weekIndex: number;
  rampStage: RampStage;
  warmth: number;
  inboxPct: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
  spamRate: number;
  volume: number;
}

type MetricKey =
  | 'warmth'
  | 'inboxPct'
  | 'openRate'
  | 'replyRate'
  | 'bounceRate'
  | 'spamRate'
  | 'volume';

type DimensionKey = 'mailbox' | 'provider' | 'day' | 'week' | 'rampStage';

interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  unit: '%' | 'score' | 'count';
  /** Aggregation across the rows that fall in a bucket. */
  agg: 'mean' | 'sum';
  /** When true a LOWER value is the good direction (bounce / spam). */
  invert: boolean;
}

interface DimensionDef {
  key: DimensionKey;
  label: string;
  /** Time dimensions drive a line chart; category dimensions a bar chart. */
  kind: 'time' | 'category';
}

const METRICS: MetricDef[] = [
  { key: 'warmth', label: 'Warmth', short: 'Warmth', unit: 'score', agg: 'mean', invert: false },
  { key: 'inboxPct', label: 'Where emails land', short: 'Inbox %', unit: '%', agg: 'mean', invert: false },
  { key: 'openRate', label: 'Open rate', short: 'Open %', unit: '%', agg: 'mean', invert: false },
  { key: 'replyRate', label: 'Reply rate', short: 'Reply %', unit: '%', agg: 'mean', invert: false },
  { key: 'bounceRate', label: 'Failure rate', short: 'Fails %', unit: '%', agg: 'mean', invert: true },
  { key: 'spamRate', label: 'Spam rate', short: 'Spam %', unit: '%', agg: 'mean', invert: true },
  { key: 'volume', label: 'Volume', short: 'Volume', unit: 'count', agg: 'sum', invert: false },
];

const METRIC_BY_KEY: Record<MetricKey, MetricDef> = METRICS.reduce(
  (acc, m) => {
    acc[m.key] = m;
    return acc;
  },
  {} as Record<MetricKey, MetricDef>,
);

const DIMENSIONS: DimensionDef[] = [
  { key: 'mailbox', label: 'Mailbox', kind: 'category' },
  { key: 'provider', label: 'Provider', kind: 'category' },
  { key: 'day', label: 'Day', kind: 'time' },
  { key: 'week', label: 'Week', kind: 'time' },
  { key: 'rampStage', label: 'Build-up stage', kind: 'category' },
];

const DIMENSION_BY_KEY: Record<DimensionKey, DimensionDef> = DIMENSIONS.reduce(
  (acc, d) => {
    acc[d.key] = d;
    return acc;
  },
  {} as Record<DimensionKey, DimensionDef>,
);

type RangeKey = 7 | 14 | 30;
const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: 7, label: '7d' },
  { key: 14, label: '14d' },
  { key: 30, label: '30d' },
];

// Columns shown in the pivot table (fixed set, independent of the picker).
const TABLE_COLUMNS: MetricKey[] = [
  'warmth',
  'inboxPct',
  'openRate',
  'replyRate',
  'bounceRate',
  'spamRate',
  'volume',
];

// ---------------------------------------------------------------------------
// Mock fact dataset — 15 mailboxes × 30 days, deterministic
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function isoMinusDays(days: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function rampStageFor(day1Based: number): RampStage {
  if (day1Based <= 3) return 'D1-3';
  if (day1Based <= 7) return 'D4-7';
  if (day1Based <= 14) return 'D8-14';
  if (day1Based <= 21) return 'D15-21';
  if (day1Based <= 28) return 'D22-28';
  return 'D29+';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

interface MailboxSeed {
  id: string;
  email: string;
  provider: Provider;
  /** Days already warmed at the END of the window — sets the maturity tilt. */
  maturity: number;
  quality: number; // 0..1 deliverability quality knob
  dailyCap: number;
}

const MAILBOX_SEEDS: MailboxSeed[] = [
  { id: 'mb-01', email: 'founder@acme.io', provider: 'gmail', maturity: 30, quality: 0.95, dailyCap: 50 },
  { id: 'mb-02', email: 'sales@acme.io', provider: 'outlook', maturity: 28, quality: 0.9, dailyCap: 50 },
  { id: 'mb-03', email: 'success@acme.io', provider: 'gmail', maturity: 26, quality: 0.92, dailyCap: 45 },
  { id: 'mb-04', email: 'growth@acme.io', provider: 'smtp', maturity: 24, quality: 0.82, dailyCap: 45 },
  { id: 'mb-05', email: 'partners@acme.io', provider: 'outlook', maturity: 22, quality: 0.86, dailyCap: 40 },
  { id: 'mb-06', email: 'demos@acme.io', provider: 'gmail', maturity: 21, quality: 0.88, dailyCap: 40 },
  { id: 'mb-07', email: 'hello@acme.co', provider: 'yahoo', maturity: 18, quality: 0.74, dailyCap: 35 },
  { id: 'mb-08', email: 'team@acme.co', provider: 'gmail', maturity: 17, quality: 0.84, dailyCap: 35 },
  { id: 'mb-09', email: 'billing@acme.io', provider: 'outlook', maturity: 15, quality: 0.8, dailyCap: 35 },
  { id: 'mb-10', email: 'press@acme.io', provider: 'smtp', maturity: 13, quality: 0.7, dailyCap: 30 },
  { id: 'mb-11', email: 'careers@acme.io', provider: 'gmail', maturity: 12, quality: 0.83, dailyCap: 30 },
  { id: 'mb-12', email: 'events@acme.co', provider: 'yahoo', maturity: 10, quality: 0.66, dailyCap: 25 },
  { id: 'mb-13', email: 'support@acme.io', provider: 'outlook', maturity: 8, quality: 0.78, dailyCap: 25 },
  { id: 'mb-14', email: 'founders2@acme.io', provider: 'gmail', maturity: 6, quality: 0.81, dailyCap: 20 },
  { id: 'mb-15', email: 'newbox@acme.co', provider: 'smtp', maturity: 4, quality: 0.62, dailyCap: 15 },
];

/**
 * Build the flat fact table once at module load. Each value is a smooth
 * ramp shaped by the mailbox's maturity + quality plus a deterministic
 * sinusoidal jitter so the curves look like real telemetry, not a line.
 */
function buildFacts(): Fact[] {
  const facts: Fact[] = [];
  for (const mb of MAILBOX_SEEDS) {
    for (let i = 0; i < 30; i++) {
      // Effective ramp day for this mailbox on calendar day i.
      const day1Based = clamp(mb.maturity - (29 - i), 1, 60);
      const t = clamp(day1Based / 30, 0, 1);
      const wob = Math.sin(i * 0.7 + mb.maturity) * 1.4;

      const warmth = clamp(
        38 + t * (52 * mb.quality + 8) + wob,
        20,
        99,
      );
      const inboxPct = clamp(
        72 + t * (24 * mb.quality) + wob * 0.6,
        55,
        99,
      );
      const openRate = clamp(
        46 + t * (30 * mb.quality) + wob * 0.5,
        30,
        92,
      );
      const replyRate = clamp(
        14 + t * (18 * mb.quality) + wob * 0.4,
        6,
        44,
      );
      const bounceRate = clamp(
        3.4 - t * 2.7 * mb.quality + Math.abs(wob) * 0.12,
        0.2,
        6,
      );
      const spamRate = clamp(
        7.5 - t * 6 * mb.quality + Math.abs(wob) * 0.18,
        0.4,
        11,
      );
      const volume = Math.round(
        clamp(8 + t * (mb.dailyCap - 8) + wob * 1.5, 4, mb.dailyCap),
      );

      facts.push({
        mailboxId: mb.id,
        mailbox: mb.email,
        provider: mb.provider,
        dayIndex: i,
        iso: isoMinusDays(29 - i),
        weekIndex: Math.floor((29 - i) / 7),
        rampStage: rampStageFor(day1Based),
        warmth: Math.round(warmth * 10) / 10,
        inboxPct: Math.round(inboxPct * 10) / 10,
        openRate: Math.round(openRate * 10) / 10,
        replyRate: Math.round(replyRate * 10) / 10,
        bounceRate: Math.round(bounceRate * 100) / 100,
        spamRate: Math.round(spamRate * 100) / 100,
        volume,
      });
    }
  }
  return facts;
}

const MOCK_FACTS: Fact[] = buildFacts();

// Cosmetic saved-views chip row.
const SAVED_VIEWS: Array<{
  id: string;
  label: string;
  metric: MetricKey;
  dimension: DimensionKey;
  range: RangeKey;
}> = [
  { id: 'sv-1', label: 'Warmth by mailbox', metric: 'warmth', dimension: 'mailbox', range: 30 },
  { id: 'sv-2', label: 'Inbox % over time', metric: 'inboxPct', dimension: 'day', range: 30 },
  { id: 'sv-3', label: 'Spam by provider', metric: 'spamRate', dimension: 'provider', range: 14 },
  { id: 'sv-4', label: 'Volume by week', metric: 'volume', dimension: 'week', range: 30 },
  { id: 'sv-5', label: 'Reply by build-up stage', metric: 'replyRate', dimension: 'rampStage', range: 30 },
];

// ---------------------------------------------------------------------------
// Aggregation core — the pivot engine
// ---------------------------------------------------------------------------

interface ChartPoint {
  bucket: string;
  /** Sort key so time buckets stay chronological. */
  order: number;
  value: number;
}

interface PivotRow {
  bucket: string;
  order: number;
  /** Every metric aggregated for this dimension bucket. */
  metrics: Record<MetricKey, number>;
  /** Number of underlying facts behind this row. */
  count: number;
}

const RAMP_ORDER: RampStage[] = ['D1-3', 'D4-7', 'D8-14', 'D15-21', 'D22-28', 'D29+'];

/** Derive the (bucket label, sort order) pair for a fact under a dimension. */
function bucketOf(fact: Fact, dim: DimensionKey): { bucket: string; order: number } {
  switch (dim) {
    case 'mailbox':
      return { bucket: fact.mailbox, order: 0 };
    case 'provider':
      return { bucket: fact.provider, order: 0 };
    case 'day':
      return { bucket: fact.iso, order: fact.dayIndex };
    case 'week':
      return { bucket: `Wk ${4 - fact.weekIndex}`, order: -fact.weekIndex };
    case 'rampStage':
      return { bucket: fact.rampStage, order: RAMP_ORDER.indexOf(fact.rampStage) };
  }
}

function aggregate(values: number[], agg: MetricDef['agg']): number {
  if (values.length === 0) return 0;
  if (agg === 'sum') return values.reduce((a, b) => a + b, 0);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Full pivot: group every windowed fact by `dim`, aggregate ALL metrics. */
function pivot(facts: Fact[], dim: DimensionKey): PivotRow[] {
  const groups = new Map<string, { order: number; facts: Fact[] }>();
  for (const f of facts) {
    const { bucket, order } = bucketOf(f, dim);
    const g = groups.get(bucket);
    if (g) g.facts.push(f);
    else groups.set(bucket, { order, facts: [f] });
  }
  const rows: PivotRow[] = [];
  for (const [bucket, g] of groups) {
    const metrics = {} as Record<MetricKey, number>;
    for (const m of METRICS) {
      const vals = g.facts.map((f) => f[m.key]);
      const raw = aggregate(vals, m.agg);
      metrics[m.key] = m.unit === 'count' ? Math.round(raw) : Math.round(raw * 10) / 10;
    }
    rows.push({ bucket, order: g.order, metrics, count: g.facts.length });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtMetric(value: number, def: MetricDef): string {
  if (def.unit === '%') return `${value.toFixed(1)}%`;
  if (def.unit === 'count') return formatNumber(Math.round(value));
  return value.toFixed(1);
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

function bucketLabel(bucket: string, dim: DimensionKey): string {
  if (dim === 'day') return fmtDay(bucket);
  if (dim === 'provider') return PROVIDER_LABEL[bucket as Provider] ?? bucket;
  if (dim === 'mailbox') return bucket.split('@')[0] ?? bucket;
  return bucket;
}

/**
 * Heat tint for a cell: maps a value to a 0..1 position within the column's
 * observed range, flips for inverted metrics, returns an accent token rgba.
 * No new colors — pulls the three accent rgbs already in the theme.
 */
const ACCENT_RGB: Record<'good' | 'mid' | 'bad', string> = {
  good: '0, 229, 160', // accent  (#F26522)
  mid: '255, 213, 79', // accent4 (#ffd54f)
  bad: '255, 107, 74', // accent3 (#ff6b4a)
};

function heatTint(
  value: number,
  min: number,
  max: number,
  invert: boolean,
): { bar: string; chip: string; pos: number } {
  const span = max - min || 1;
  let pos = (value - min) / span; // 0 = min, 1 = max
  if (invert) pos = 1 - pos; // for bounce/spam, low is good
  pos = clamp(pos, 0, 1);
  const tone: 'good' | 'mid' | 'bad' = pos >= 0.66 ? 'good' : pos >= 0.33 ? 'mid' : 'bad';
  const rgb = ACCENT_RGB[tone];
  return {
    bar: `rgba(${rgb}, 0.55)`,
    chip: `rgba(${rgb}, 0.12)`,
    pos,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type SortDir = 'asc' | 'desc';

export function ProPlusAna1Explorer(): JSX.Element {
  const [metric, setMetric] = useState<MetricKey>('warmth');
  const [dimension, setDimension] = useState<DimensionKey>('mailbox');
  const [range, setRange] = useState<RangeKey>(30);
  const [sortKey, setSortKey] = useState<MetricKey | 'bucket'>('warmth');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [activeView, setActiveView] = useState<string | null>('sv-1');

  const metricDef = METRIC_BY_KEY[metric];
  const dimDef = DIMENSION_BY_KEY[dimension];

  // 1. Window the flat fact table by the selected range. REAL recomputation.
  const windowed = useMemo<Fact[]>(
    () => MOCK_FACTS.filter((f) => f.dayIndex >= 30 - range),
    [range],
  );

  // 2. Full pivot of the windowed facts by the chosen dimension.
  const pivotRows = useMemo<PivotRow[]>(
    () => pivot(windowed, dimension),
    [windowed, dimension],
  );

  // 3. Primary-chart series for the SELECTED metric only, ordered for display.
  const chartData = useMemo<ChartPoint[]>(() => {
    const pts = pivotRows.map((r) => ({
      bucket: r.bucket,
      order: r.order,
      value: r.metrics[metric],
    }));
    if (dimDef.kind === 'time') {
      pts.sort((a, b) => a.order - b.order);
    } else {
      // Category dim: rank by the selected metric (best first, respecting invert).
      pts.sort((a, b) => (metricDef.invert ? a.value - b.value : b.value - a.value));
    }
    return pts;
  }, [pivotRows, metric, dimDef.kind, metricDef.invert]);

  // 4. Sorted pivot table rows — live re-sort on header click.
  const sortedRows = useMemo<PivotRow[]>(() => {
    const rows = [...pivotRows];
    rows.sort((a, b) => {
      if (sortKey === 'bucket') {
        const cmp = a.bucket.localeCompare(b.bucket);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const av = a.metrics[sortKey];
      const bv = b.metrics[sortKey];
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return rows;
  }, [pivotRows, sortKey, sortDir]);

  // Per-column min/max across visible rows → cell heat tint scale.
  const columnRange = useMemo<Record<MetricKey, { min: number; max: number }>>(() => {
    const out = {} as Record<MetricKey, { min: number; max: number }>;
    for (const col of TABLE_COLUMNS) {
      let min = Infinity;
      let max = -Infinity;
      for (const r of pivotRows) {
        const v = r.metrics[col];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      out[col] = {
        min: Number.isFinite(min) ? min : 0,
        max: Number.isFinite(max) ? max : 1,
      };
    }
    return out;
  }, [pivotRows]);

  // Summary line: best + headline aggregate of the active metric.
  const summary = useMemo(() => {
    if (chartData.length === 0) return null;
    const sorted = [...chartData].sort((a, b) =>
      metricDef.invert ? a.value - b.value : b.value - a.value,
    );
    const best = sorted[0]!;
    const headlineVals = pivotRows.map((r) => r.metrics[metric]);
    const headline =
      metricDef.agg === 'sum'
        ? headlineVals.reduce((a, b) => a + b, 0)
        : headlineVals.reduce((a, b) => a + b, 0) / headlineVals.length;
    return { best, headline };
  }, [chartData, pivotRows, metric, metricDef]);

  function applyView(v: (typeof SAVED_VIEWS)[number]): void {
    setActiveView(v.id);
    setMetric(v.metric);
    setDimension(v.dimension);
    setRange(v.range);
    setSortKey(v.metric);
    setSortDir(METRIC_BY_KEY[v.metric].invert ? 'asc' : 'desc');
  }

  function toggleSort(key: MetricKey | 'bucket'): void {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'bucket' ? 'asc' : 'desc');
    }
  }

  // Any manual picker change drops the saved-view highlight.
  function pickMetric(k: MetricKey): void {
    setMetric(k);
    setActiveView(null);
  }
  function pickDimension(k: DimensionKey): void {
    setDimension(k);
    setActiveView(null);
  }
  function pickRange(k: RangeKey): void {
    setRange(k);
    setActiveView(null);
  }

  const chartColor =
    metricDef.invert ? `rgb(${ACCENT_RGB.bad})` : `rgb(${ACCENT_RGB.good})`;
  const selectionKey = `${metric}|${dimension}|${range}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-accent" />
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Data explorer
            </h1>
            <Badge variant="orange">Pro Plus</Badge>
          </div>
          <p className="text-sm text-text-dim">
            Pivot {formatNumber(MOCK_FACTS.length)} mailbox-day facts across
            15 mailboxes — pick a metric and a dimension; the chart and
            breakdown recompute live.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <Layers className="h-3.5 w-3.5 text-accent" />
          <span className="font-medium text-text">{windowed.length}</span>
          <span>facts in window</span>
        </div>
      </motion.header>

      {/* Control bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.05 }}
      >
        <Card noShimmer>
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
            <PickerGroup
              icon={<Filter className="h-3.5 w-3.5" />}
              label="Metric"
            >
              {METRICS.map((m) => (
                <PillButton
                  key={m.key}
                  active={metric === m.key}
                  onClick={() => pickMetric(m.key)}
                >
                  {m.label}
                </PillButton>
              ))}
            </PickerGroup>

            <PickerGroup
              icon={<Layers className="h-3.5 w-3.5" />}
              label="Group by"
            >
              {DIMENSIONS.map((dm) => (
                <PillButton
                  key={dm.key}
                  active={dimension === dm.key}
                  onClick={() => pickDimension(dm.key)}
                >
                  {dm.label}
                </PillButton>
              ))}
            </PickerGroup>

            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-dim">
                Range
              </span>
              <div className="inline-flex rounded-lg border border-border-muted bg-bg p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => pickRange(r.key)}
                    className={`relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      range === r.key
                        ? 'text-bg'
                        : 'text-text-dim hover:text-text'
                    }`}
                  >
                    {range === r.key && (
                      <motion.span
                        layoutId="ppa1-range-pill"
                        className="absolute inset-0 rounded-md bg-accent"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Saved views + result count */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-dim">
            <Bookmark className="h-3.5 w-3.5" />
            Saved views
          </span>
          {SAVED_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => applyView(v)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeView === v.id
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border-muted bg-surface/60 text-text-dim hover:border-accent/30 hover:text-text'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-dim">
          Showing{' '}
          <span className="font-semibold tabular-nums text-text">
            {pivotRows.length}
          </span>{' '}
          {dimDef.label.toLowerCase()} rows ·{' '}
          <span className="font-semibold tabular-nums text-text">
            {windowed.length}
          </span>{' '}
          facts aggregated
        </p>
      </motion.div>

      {/* Reactive primary chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12 }}
      >
        <Card noShimmer>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text">
                  {metricDef.label} by {dimDef.label.toLowerCase()}
                </h2>
                <p className="text-xs text-text-dim">
                  {dimDef.kind === 'time'
                    ? `Trend over the last ${range} days (${metricDef.agg === 'sum' ? 'summed' : 'averaged'} across all 15 mailboxes).`
                    : `Each ${dimDef.label.toLowerCase()} ${metricDef.agg === 'sum' ? 'summed' : 'averaged'} over the last ${range} days, ranked.`}
                </p>
              </div>
              {summary && (
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-text-dim">
                      {metricDef.agg === 'sum' ? 'Total' : 'Average'}
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-text">
                      {fmtMetric(summary.headline, metricDef)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-text-dim">
                      Best {dimDef.label.toLowerCase()}
                    </p>
                    <p className="text-sm font-semibold text-accent">
                      {bucketLabel(summary.best.bucket, dimension)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="h-[340px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectionKey}
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.985 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="h-full w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    {dimDef.kind === 'time' ? (
                      <LineChart
                        data={chartData}
                        margin={{ top: 8, right: 16, left: -6, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="ppa1-line-grad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={chartColor}
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="100%"
                              stopColor={chartColor}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="rgb(42, 42, 58)"
                          strokeDasharray="3 6"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="bucket"
                          tickFormatter={(v: string) =>
                            bucketLabel(v, dimension)
                          }
                          tick={{ fill: 'rgb(136, 136, 160)', fontSize: 11 }}
                          axisLine={{ stroke: 'rgb(42, 42, 58)' }}
                          tickLine={false}
                          minTickGap={24}
                        />
                        <YAxis
                          tick={{ fill: 'rgb(136, 136, 160)', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          width={44}
                          domain={
                            metricDef.unit === 'count'
                              ? [0, 'auto']
                              : ['auto', 'auto']
                          }
                        />
                        <Tooltip
                          cursor={{
                            stroke: chartColor,
                            strokeOpacity: 0.25,
                          }}
                          content={
                            <ExplorerTooltip
                              dimension={dimension}
                              metricDef={metricDef}
                            />
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          name={metricDef.label}
                          stroke={chartColor}
                          strokeWidth={2.4}
                          fill="url(#ppa1-line-grad)"
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                          isAnimationActive
                          animationDuration={650}
                        />
                      </LineChart>
                    ) : (
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 16, left: -6, bottom: 0 }}
                      >
                        <CartesianGrid
                          stroke="rgb(42, 42, 58)"
                          strokeDasharray="3 6"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="bucket"
                          tickFormatter={(v: string) =>
                            bucketLabel(v, dimension)
                          }
                          tick={{ fill: 'rgb(136, 136, 160)', fontSize: 11 }}
                          axisLine={{ stroke: 'rgb(42, 42, 58)' }}
                          tickLine={false}
                          interval={0}
                          angle={dimension === 'mailbox' ? -28 : 0}
                          textAnchor={
                            dimension === 'mailbox' ? 'end' : 'middle'
                          }
                          height={dimension === 'mailbox' ? 64 : 30}
                        />
                        <YAxis
                          tick={{ fill: 'rgb(136, 136, 160)', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          width={44}
                          domain={
                            metricDef.unit === 'count'
                              ? [0, 'auto']
                              : ['auto', 'auto']
                          }
                        />
                        <Tooltip
                          cursor={{
                            fill: chartColor,
                            fillOpacity: 0.06,
                          }}
                          content={
                            <ExplorerTooltip
                              dimension={dimension}
                              metricDef={metricDef}
                            />
                          }
                        />
                        <Bar
                          dataKey="value"
                          name={metricDef.label}
                          fill={chartColor}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={64}
                          isAnimationActive
                          animationDuration={650}
                        />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </motion.div>
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Pivot breakdown table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.16 }}
      >
        <Card noShimmer>
          <CardContent className="p-0">
            <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
              <div className="flex items-center gap-2">
                <TableProperties className="h-4 w-4 text-accent" />
                <h2 className="text-base font-semibold text-text">
                  Pivot breakdown · by {dimDef.label.toLowerCase()}
                </h2>
              </div>
              <span className="text-xs text-text-dim">
                Click a column to re-sort
              </span>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-muted">
                    <HeaderCell
                      label={dimDef.label}
                      sortable
                      active={sortKey === 'bucket'}
                      dir={sortDir}
                      onClick={() => toggleSort('bucket')}
                      align="left"
                      sticky
                    />
                    {TABLE_COLUMNS.map((col) => (
                      <HeaderCell
                        key={col}
                        label={METRIC_BY_KEY[col].short}
                        sortable
                        active={sortKey === col}
                        dir={sortDir}
                        onClick={() => toggleSort(col)}
                        align="right"
                        highlight={col === metric}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {sortedRows.map((row, i) => (
                      <motion.tr
                        key={row.bucket}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          layout: {
                            type: 'spring',
                            stiffness: 420,
                            damping: 34,
                          },
                          opacity: { duration: 0.25, delay: i * 0.012 },
                        }}
                        className="border-b border-border-muted/60 last:border-0 hover:bg-surface-2"
                      >
                        <td className="sticky left-0 z-[1] bg-surface px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-text">
                              {bucketLabel(row.bucket, dimension)}
                            </span>
                            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] tabular-nums text-text-dim">
                              {row.count}
                            </span>
                          </div>
                        </td>
                        {TABLE_COLUMNS.map((col) => {
                          const def = METRIC_BY_KEY[col];
                          const v = row.metrics[col];
                          const cr = columnRange[col];
                          const tint = heatTint(
                            v,
                            cr.min,
                            cr.max,
                            def.invert,
                          );
                          return (
                            <td
                              key={col}
                              className="px-4 py-2.5 text-right align-middle"
                            >
                              <div className="flex items-center justify-end gap-2.5">
                                <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-2 sm:block">
                                  <motion.div
                                    className="h-full rounded-full"
                                    style={{ background: tint.bar }}
                                    initial={false}
                                    animate={{
                                      width: `${Math.round(tint.pos * 100)}%`,
                                    }}
                                    transition={{
                                      duration: 0.4,
                                      ease: 'easeOut',
                                    }}
                                  />
                                </div>
                                <span
                                  className={`min-w-[58px] rounded-md px-1.5 py-0.5 text-right tabular-nums ${
                                    col === metric
                                      ? 'font-semibold text-text'
                                      : 'text-text-dim'
                                  }`}
                                  style={{
                                    backgroundColor:
                                      col === metric
                                        ? tint.chip
                                        : 'transparent',
                                  }}
                                >
                                  {fmtMetric(v, def)}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PickerGroup({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-dim">
        {icon}
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border-muted bg-bg text-text-dim hover:border-accent/30 hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

function HeaderCell({
  label,
  sortable,
  active,
  dir,
  onClick,
  align,
  highlight,
  sticky,
}: {
  label: string;
  sortable: boolean;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align: 'left' | 'right';
  highlight?: boolean;
  sticky?: boolean;
}): JSX.Element {
  return (
    <th
      className={`whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${
        align === 'left' ? 'text-left' : 'text-right'
      } ${sticky ? 'sticky left-0 z-[2] bg-surface pl-5' : ''} ${
        highlight ? 'text-accent' : 'text-text-dim'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!sortable}
        className={`inline-flex items-center gap-1 transition-colors hover:text-text ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-text' : ''}`}
      >
        <span>{label}</span>
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

interface TooltipPayloadEntry {
  value?: number | string;
  payload?: ChartPoint;
}

function ExplorerTooltip({
  active,
  payload,
  dimension,
  metricDef,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  dimension: DimensionKey;
  metricDef: MetricDef;
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-border-muted bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-text">
        {bucketLabel(point.bucket, dimension)}
      </p>
      <p className="flex items-center gap-2 text-text-dim">
        <span>{metricDef.label}</span>
        <span className="font-semibold tabular-nums text-text">
          {fmtMetric(point.value, metricDef)}
        </span>
      </p>
    </div>
  );
}

export default ProPlusAna1Explorer;
