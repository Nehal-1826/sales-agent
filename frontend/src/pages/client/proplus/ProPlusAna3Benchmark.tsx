import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  CalendarRange,
  GitCompareArrows,
  Minus,
  Server,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { chartTheme } from '@/components/charts/theme';

/**
 * ProPlusAna3Benchmark — STANDALONE Pro-Plus "Benchmark / comparison"
 * analytics section for the isolated preview harness.
 *
 * This is deliberately NOT a KPI dashboard, NOT an interactive pivot/explorer,
 * NOT a graded scorecard, and NOT an annotated storyboard. It is a
 * side-by-side *versus* layout: a comparison-axis toggle picks what is being
 * compared, then the page renders paired metric rows (LEFT value vs RIGHT
 * value with a center delta callout + dual-bar mini viz + winner highlight),
 * a summary band, and a diverging bar chart (gains right of zero, regressions
 * left).
 *
 * Three comparison modes, all recomputed from the same inline MOCK via
 * `useMemo` (no hardcoded per-mode results):
 *   1. "This period vs last period"  — fleet aggregate, current vs prior.
 *   2. "Each mailbox vs fleet avg"   — every mailbox's metric vs the mean.
 *   3. "Provider vs provider"        — per-ESP averages, pick two to face off.
 *
 * Renders ONLY page content. No router / query / fetch / required props.
 * Tokens only (gain → accent, loss → accent3, neutral → accent4).
 */

// ---------------------------------------------------------------------------
// Comparison-axis polarity
//
// For most metrics "higher is better" (warmth, inbox %, reply %, open %).
// For spam % and bounce % "lower is better" — a *drop* is an improvement, so
// the delta sign is inverted before it drives the winner / colour.
// ---------------------------------------------------------------------------

export type MetricKey =
  | 'warmth'
  | 'inboxPct'
  | 'replyPct'
  | 'openPct'
  | 'spamPct'
  | 'bouncePct';

interface MetricDef {
  key: MetricKey;
  label: string;
  unit: '' | '%';
  /** When true, a lower value is the better value. */
  lowerIsBetter?: boolean;
  /** Decimal places for display. */
  dp: number;
}

const METRICS: MetricDef[] = [
  { key: 'warmth', label: 'Avg warmth', unit: '', dp: 0 },
  { key: 'inboxPct', label: 'Where emails land', unit: '%', dp: 1 },
  { key: 'replyPct', label: 'Reply rate', unit: '%', dp: 1 },
  { key: 'openPct', label: 'Open rate', unit: '%', dp: 1 },
  { key: 'spamPct', label: 'Spam rate', unit: '%', lowerIsBetter: true, dp: 1 },
  {
    key: 'bouncePct',
    label: 'Failure rate',
    unit: '%',
    lowerIsBetter: true,
    dp: 1,
  },
];

export type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';

export type MetricBag = Record<MetricKey, number>;

export interface MailboxRow {
  id: string;
  email: string;
  provider: Provider;
  /** Current 7-day window. */
  current: MetricBag;
  /** Prior 7-day window. */
  prior: MetricBag;
}

export interface BenchmarkMock {
  workspace: string;
  mailboxCount: number;
  mailboxes: MailboxRow[];
}

// ---------------------------------------------------------------------------
// Mock data — 15-mailbox Pro Plus account, current + prior windows + provider.
// Deterministic (seeded jitter) so the three modes recompute identically on
// every render.
// ---------------------------------------------------------------------------

const PROVIDERS: Provider[] = ['gmail', 'outlook', 'smtp', 'yahoo'];

const SEED_NAMES = [
  'founder',
  'sales',
  'success',
  'growth',
  'hello',
  'team',
  'ops',
  'billing',
  'careers',
  'press',
  'partners',
  'support',
  'demo',
  'invest',
  'product',
];

/** Tiny deterministic PRNG so MOCK is stable across renders. */
function seeded(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x); // 0..1
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function buildMailboxes(): MailboxRow[] {
  return SEED_NAMES.map((name, i) => {
    const provider = PROVIDERS[i % PROVIDERS.length]!;
    const domain = i % 3 === 0 ? 'acme.io' : i % 3 === 1 ? 'acme.co' : 'acme.dev';

    // A base "quality" per mailbox so the fleet has genuine spread.
    const q = 0.35 + seeded(i, 1) * 0.6; // 0.35..0.95

    const curWarmth = clamp(Math.round(52 + q * 44 + seeded(i, 2) * 6), 40, 99);
    const curInbox = clamp(82 + q * 16 + seeded(i, 3) * 3, 78, 99);
    const curReply = clamp(15 + q * 18 + seeded(i, 4) * 4, 8, 38);
    const curOpen = clamp(55 + q * 32 + seeded(i, 5) * 5, 45, 95);
    const curSpam = clamp(6.5 - q * 5 + seeded(i, 6) * 1.2, 0.6, 8.5);
    const curBounce = clamp(2.2 - q * 1.7 + seeded(i, 7) * 0.6, 0.1, 3.2);

    // Prior window: most mailboxes improved, a few regressed (signed drift).
    const drift = (seeded(i, 8) - 0.32) * 2; // mostly positive
    const pWarmth = clamp(Math.round(curWarmth - drift * 6 - 1), 38, 99);
    const pInbox = clamp(curInbox - drift * 3.2, 75, 99);
    const pReply = clamp(curReply - drift * 2.6, 6, 38);
    const pOpen = clamp(curOpen - drift * 3.8, 42, 95);
    const pSpam = clamp(curSpam + drift * 1.4, 0.5, 9.5);
    const pBounce = clamp(curBounce + drift * 0.5, 0.1, 3.6);

    return {
      id: `mb-${i + 1}`,
      email: `${name}@${domain}`,
      provider,
      current: {
        warmth: curWarmth,
        inboxPct: round1(curInbox),
        replyPct: round1(curReply),
        openPct: round1(curOpen),
        spamPct: round1(curSpam),
        bouncePct: round1(curBounce),
      },
      prior: {
        warmth: pWarmth,
        inboxPct: round1(pInbox),
        replyPct: round1(pReply),
        openPct: round1(pOpen),
        spamPct: round1(pSpam),
        bouncePct: round1(pBounce),
      },
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const MOCK: BenchmarkMock = {
  workspace: 'Acme Outbound',
  mailboxCount: 15,
  mailboxes: buildMailboxes(),
};

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

function meanBag(rows: MailboxRow[], pick: (m: MailboxRow) => MetricBag): MetricBag {
  const acc: MetricBag = {
    warmth: 0,
    inboxPct: 0,
    replyPct: 0,
    openPct: 0,
    spamPct: 0,
    bouncePct: 0,
  };
  if (rows.length === 0) return acc;
  for (const m of rows) {
    const b = pick(m);
    acc.warmth += b.warmth;
    acc.inboxPct += b.inboxPct;
    acc.replyPct += b.replyPct;
    acc.openPct += b.openPct;
    acc.spamPct += b.spamPct;
    acc.bouncePct += b.bouncePct;
  }
  const n = rows.length;
  return {
    warmth: Math.round(acc.warmth / n),
    inboxPct: round1(acc.inboxPct / n),
    replyPct: round1(acc.replyPct / n),
    openPct: round1(acc.openPct / n),
    spamPct: round1(acc.spamPct / n),
    bouncePct: round1(acc.bouncePct / n),
  };
}

/** Signed improvement of `right` vs `left` for a metric, polarity-aware. */
function improvement(def: MetricDef, left: number, right: number): number {
  const raw = right - left;
  return def.lowerIsBetter ? -raw : raw;
}

function pctChange(left: number, right: number): number {
  if (left === 0) return right === 0 ? 0 : 100;
  return ((right - left) / Math.abs(left)) * 100;
}

function fmtVal(def: MetricDef, n: number): string {
  return `${n.toFixed(def.dp)}${def.unit}`;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  smtp: 'SMTP',
  yahoo: 'Yahoo',
};

// gain → accent, loss → accent3, neutral → accent4
const GAIN = chartTheme.colors.primary; // accent  (green)
const LOSS = chartTheme.colors.danger; // accent3 (red)
const NEUTRAL = chartTheme.colors.warning; // accent4 (yellow)

function toneColor(delta: number): string {
  if (delta > 0.05) return GAIN;
  if (delta < -0.05) return LOSS;
  return NEUTRAL;
}

function toneTextClass(delta: number): string {
  if (delta > 0.05) return 'text-accent';
  if (delta < -0.05) return 'text-accent3';
  return 'text-accent4';
}

// ---------------------------------------------------------------------------
// Comparison model — three axes, all derived from MOCK at render via useMemo.
// ---------------------------------------------------------------------------

type Mode = 'period' | 'fleet' | 'provider';

interface ComparisonRow {
  def: MetricDef;
  leftVal: number;
  rightVal: number;
  /** Polarity-aware signed improvement of RIGHT relative to LEFT. */
  delta: number;
  /** % change of right vs left (display sign is polarity-aware via `delta`). */
  pct: number;
  /** 'left' | 'right' | 'tie' — which side wins this metric. */
  winner: 'left' | 'right' | 'tie';
}

interface DivergingDatum {
  /** Mailbox / provider short label. */
  name: string;
  /** Signed composite improvement (positive = improved). */
  value: number;
  meta: string;
}

interface ComparisonResult {
  leftLabel: string;
  rightLabel: string;
  rows: ComparisonRow[];
  diverging: DivergingDatum[];
  summary: {
    /** "X of Y beat the benchmark" — count of right-side wins across entities. */
    beat: number;
    total: number;
    topImprover: { name: string; value: number } | null;
    topRegression: { name: string; value: number } | null;
    /** Net winner of the headline pair (counts metric wins). */
    pairWinner: 'left' | 'right' | 'tie';
  };
}

function buildRows(
  leftBag: MetricBag,
  rightBag: MetricBag,
): { rows: ComparisonRow[]; leftWins: number; rightWins: number } {
  let leftWins = 0;
  let rightWins = 0;
  const rows = METRICS.map((def) => {
    const leftVal = leftBag[def.key];
    const rightVal = rightBag[def.key];
    const delta = improvement(def, leftVal, rightVal);
    const pct = pctChange(leftVal, rightVal) * (def.lowerIsBetter ? -1 : 1);
    let winner: ComparisonRow['winner'] = 'tie';
    if (delta > 0.05) {
      winner = 'right';
      rightWins += 1;
    } else if (delta < -0.05) {
      winner = 'left';
      leftWins += 1;
    }
    return { def, leftVal, rightVal, delta, pct, winner };
  });
  return { rows, leftWins, rightWins };
}

/**
 * Composite per-entity score = mean of polarity-normalised metric deltas vs a
 * benchmark, expressed in "points" so the diverging bar reads intuitively.
 */
function compositeDelta(
  entity: MetricBag,
  benchmark: MetricBag,
): number {
  let sum = 0;
  for (const def of METRICS) {
    const d = improvement(def, benchmark[def.key], entity[def.key]);
    // Normalise spread so warmth (0-100) doesn't dwarf bounce (0-3).
    const scale = def.key === 'warmth' ? 1 : def.unit === '%' ? 1.4 : 1;
    sum += d * scale;
  }
  return round1(sum / METRICS.length);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MODE_TABS: Array<{ key: Mode; label: string; Icon: typeof CalendarRange }> = [
  { key: 'period', label: 'Period vs period', Icon: CalendarRange },
  { key: 'fleet', label: 'Mailbox vs fleet avg', Icon: GitCompareArrows },
  { key: 'provider', label: 'Provider vs provider', Icon: Server },
];

export function ProPlusAna3Benchmark({
  data,
}: { data?: BenchmarkMock } = {}): JSX.Element {
  const model = data ?? MOCK;
  const d = model;
  const [mode, setMode] = useState<Mode>('period');

  // Fleet-average bags for current + prior windows (used by every mode).
  const fleetCurrent = useMemo(
    () => meanBag(d.mailboxes, (m) => m.current),
    [d.mailboxes],
  );
  const fleetPrior = useMemo(
    () => meanBag(d.mailboxes, (m) => m.prior),
    [d.mailboxes],
  );

  // Provider-average bags (current window).
  const providerBags = useMemo(() => {
    const map = new Map<Provider, MetricBag>();
    for (const p of PROVIDERS) {
      const rows = d.mailboxes.filter((m) => m.provider === p);
      if (rows.length > 0) map.set(p, meanBag(rows, (m) => m.current));
    }
    return map;
  }, [d.mailboxes]);

  const availableProviders = useMemo(
    () => PROVIDERS.filter((p) => providerBags.has(p)),
    [providerBags],
  );

  // Provider face-off selection (defaults: first two ESPs with mailboxes).
  const [leftProv, setLeftProv] = useState<Provider>(
    availableProviders[0] ?? 'gmail',
  );
  const [rightProv, setRightProv] = useState<Provider>(
    availableProviders[1] ?? availableProviders[0] ?? 'outlook',
  );

  // ---- The real recompute: every mode derives from the same MOCK ----------
  const result = useMemo<ComparisonResult>(() => {
    if (mode === 'period') {
      const { rows, leftWins, rightWins } = buildRows(fleetPrior, fleetCurrent);
      const perMailbox = d.mailboxes.map((m) => ({
        name: m.email.split('@')[0] ?? m.email,
        value: compositeDelta(m.current, m.prior),
        meta: PROVIDER_LABEL[m.provider],
      }));
      const beat = perMailbox.filter((x) => x.value > 0).length;
      return {
        leftLabel: 'Last 7 days',
        rightLabel: 'This 7 days',
        rows,
        diverging: sortDiverging(perMailbox),
        summary: {
          beat,
          total: perMailbox.length,
          topImprover: pickExtreme(perMailbox, 'max'),
          topRegression: pickExtreme(perMailbox, 'min'),
          pairWinner:
            rightWins > leftWins
              ? 'right'
              : leftWins > rightWins
                ? 'left'
                : 'tie',
        },
      };
    }

    if (mode === 'fleet') {
      // Headline pair = single worst-vs-best framing is misleading here;
      // instead show fleet-avg (left) vs the *current* fleet leader (right)
      // so the metric rows still read as a versus, while the diverging chart
      // carries the per-mailbox-vs-avg story.
      const leader = [...d.mailboxes].sort(
        (a, b) =>
          compositeDelta(b.current, fleetCurrent) -
          compositeDelta(a.current, fleetCurrent),
      )[0]!;
      const { rows, leftWins, rightWins } = buildRows(
        fleetCurrent,
        leader.current,
      );
      const perMailbox = d.mailboxes.map((m) => ({
        name: m.email.split('@')[0] ?? m.email,
        value: compositeDelta(m.current, fleetCurrent),
        meta: PROVIDER_LABEL[m.provider],
      }));
      const beat = perMailbox.filter((x) => x.value > 0).length;
      return {
        leftLabel: 'Fleet average',
        rightLabel: `Top: ${leader.email.split('@')[0] ?? leader.email}`,
        rows,
        diverging: sortDiverging(perMailbox),
        summary: {
          beat,
          total: perMailbox.length,
          topImprover: pickExtreme(perMailbox, 'max'),
          topRegression: pickExtreme(perMailbox, 'min'),
          pairWinner:
            rightWins > leftWins
              ? 'right'
              : leftWins > rightWins
                ? 'left'
                : 'tie',
        },
      };
    }

    // mode === 'provider'
    const lBag = providerBags.get(leftProv) ?? fleetCurrent;
    const rBag = providerBags.get(rightProv) ?? fleetCurrent;
    const { rows, leftWins, rightWins } = buildRows(lBag, rBag);
    // Diverging = each provider's composite vs the cross-provider mean.
    const provMean = meanBag(
      availableProviders.map((p) => ({
        id: p,
        email: p,
        provider: p,
        current: providerBags.get(p)!,
        prior: providerBags.get(p)!,
      })),
      (m) => m.current,
    );
    const perProvider = availableProviders.map((p) => ({
      name: PROVIDER_LABEL[p],
      value: compositeDelta(providerBags.get(p)!, provMean),
      meta: `${d.mailboxes.filter((m) => m.provider === p).length} mailboxes`,
    }));
    const beat = perProvider.filter((x) => x.value > 0).length;
    return {
      leftLabel: PROVIDER_LABEL[leftProv],
      rightLabel: PROVIDER_LABEL[rightProv],
      rows,
      diverging: sortDiverging(perProvider),
      summary: {
        beat,
        total: perProvider.length,
        topImprover: pickExtreme(perProvider, 'max'),
        topRegression: pickExtreme(perProvider, 'min'),
        pairWinner:
          rightWins > leftWins
            ? 'right'
            : leftWins > rightWins
              ? 'left'
              : 'tie',
      },
    };
  }, [
    mode,
    d.mailboxes,
    fleetCurrent,
    fleetPrior,
    providerBags,
    availableProviders,
    leftProv,
    rightProv,
  ]);

  const benchmarkNoun =
    mode === 'period'
      ? 'improved vs last period'
      : mode === 'fleet'
        ? 'beat fleet average'
        : 'beat the provider mean';

  return (
    <div className="space-y-5">
      {/* Header band */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Benchmark
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Side-by-side inbox delivery across {d.mailboxCount} mailboxes —{' '}
            {d.workspace}. Pick a comparison axis to face the numbers off.
          </p>
        </div>

        {/* Mode toggle */}
        <div
          role="tablist"
          aria-label="Comparison axis"
          className="flex flex-wrap items-center gap-1 rounded-full border border-border-muted bg-surface/60 p-1 backdrop-blur-xl"
        >
          {MODE_TABS.map((t) => {
            const active = mode === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(t.key)}
                className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'text-bg' : 'text-text-dim hover:text-text'
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="benchmark-mode-pill"
                    className="absolute inset-0 -z-[1] rounded-full bg-accent"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                ) : null}
                <t.Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </motion.header>

      {/* Provider face-off pickers — only in provider mode */}
      <AnimatePresence initial={false}>
        {mode === 'provider' ? (
          <motion.div
            key="prov-pickers"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-muted bg-surface/60 px-4 py-3 backdrop-blur-xl">
              <ProviderPicker
                label="Left"
                value={leftProv}
                options={availableProviders}
                disabled={rightProv}
                onChange={setLeftProv}
              />
              <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
                vs
              </span>
              <ProviderPicker
                label="Right"
                value={rightProv}
                options={availableProviders}
                disabled={leftProv}
                onChange={setRightProv}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Summary band */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.05 }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <SummaryCard
          Icon={Trophy}
          tone="accent"
          headline={`${result.summary.beat} of ${result.summary.total}`}
          label={benchmarkNoun}
          detail={
            <ProgressPips
              filled={result.summary.beat}
              total={result.summary.total}
            />
          }
        />
        <SummaryCard
          Icon={TrendingUp}
          tone="accent"
          headline={
            result.summary.topImprover
              ? `+${result.summary.topImprover.value.toFixed(1)}`
              : '—'
          }
          label="Biggest improver"
          detail={
            <span className="truncate text-xs text-text-dim">
              {result.summary.topImprover?.name ?? 'No data'}
            </span>
          }
        />
        <SummaryCard
          Icon={TrendingDown}
          tone="accent3"
          headline={
            result.summary.topRegression
              ? `${result.summary.topRegression.value.toFixed(1)}`
              : '—'
          }
          label="Biggest regression"
          detail={
            <span className="truncate text-xs text-text-dim">
              {result.summary.topRegression?.name ?? 'No data'}
            </span>
          }
        />
      </motion.div>

      {/* Versus header for the paired rows */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${mode}-${result.leftLabel}-${result.rightLabel}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          <Card noShimmer>
            <CardContent className="p-0">
              {/* Pair caption */}
              <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border-muted px-5 py-4">
                <SideTag
                  align="left"
                  label={result.leftLabel}
                  win={result.summary.pairWinner === 'left'}
                />
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-dim">
                  <GitCompareArrows className="h-3.5 w-3.5 text-accent4" />
                  versus
                </span>
                <SideTag
                  align="right"
                  label={result.rightLabel}
                  win={result.summary.pairWinner === 'right'}
                />
              </header>

              {/* Metric rows */}
              <ul className="divide-y divide-border-muted">
                {result.rows.map((row, i) => (
                  <PairedRow key={row.def.key} row={row} index={i} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Diverging bar chart — improvements right of zero, regressions left */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
      >
        <Card noShimmer>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-text">
                  Composite delta spread
                </h2>
                <p className="text-xs text-text-dim">
                  {mode === 'period'
                    ? 'Each mailbox — this period vs last (points). Right = improved.'
                    : mode === 'fleet'
                      ? 'Each mailbox vs the fleet average (points). Right = above average.'
                      : 'Each provider vs the cross-provider mean (points). Right = ahead.'}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-text-dim">
                <LegendDot color={GAIN} label="Improved" />
                <LegendDot color={LOSS} label="Regressed" />
              </div>
            </div>
            <DivergingChart key={mode} data={result.diverging} />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diverging-extreme helpers
// ---------------------------------------------------------------------------

function sortDiverging(rows: DivergingDatum[]): DivergingDatum[] {
  // Descending: biggest gains at the top of the (vertical) chart.
  return [...rows].sort((a, b) => b.value - a.value);
}

function pickExtreme(
  rows: DivergingDatum[],
  which: 'max' | 'min',
): { name: string; value: number } | null {
  if (rows.length === 0) return null;
  let best = rows[0]!;
  for (const r of rows) {
    if (which === 'max' ? r.value > best.value : r.value < best.value) best = r;
  }
  return { name: best.name, value: best.value };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProviderPicker({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: Provider;
  options: Provider[];
  /** The other side's selection — disabled so you can't compare a provider to itself. */
  disabled: Provider;
  onChange: (p: Provider) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
        {label}
      </span>
      <div className="flex items-center gap-1 rounded-lg border border-border-muted bg-surface-2 p-0.5">
        {options.map((p) => {
          const active = value === p;
          const isOff = p === disabled && !active;
          return (
            <button
              key={p}
              type="button"
              disabled={isOff}
              onClick={() => onChange(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-accent text-bg'
                  : isOff
                    ? 'cursor-not-allowed text-text-dim/40'
                    : 'text-text-dim hover:bg-surface hover:text-text'
              }`}
            >
              {PROVIDER_LABEL[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SideTag({
  align,
  label,
  win,
}: {
  align: 'left' | 'right';
  label: string;
  win: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${
        align === 'right' ? 'justify-end text-right' : 'justify-start'
      }`}
    >
      {align === 'right' && win ? (
        <Award className="h-4 w-4 shrink-0 text-accent" />
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text">{label}</p>
        {win ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
            Leads overall
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-text-dim">
            {align === 'left' ? 'baseline' : 'comparison'}
          </span>
        )}
      </div>
      {align === 'left' && win ? (
        <Award className="h-4 w-4 shrink-0 text-accent" />
      ) : null}
    </div>
  );
}

function PairedRow({ row, index }: { row: ComparisonRow; index: number }) {
  const { def, leftVal, rightVal, delta, pct, winner } = row;
  const tone = toneColor(delta);
  const DeltaIcon =
    delta > 0.05 ? ArrowUpRight : delta < -0.05 ? ArrowDownRight : Minus;

  // Dual-bar scaling: bars are relative to the larger of the two raw values
  // so the longer bar always fills the half-track.
  const maxRaw = Math.max(leftVal, rightVal, 0.0001);
  const leftPct = clamp((leftVal / maxRaw) * 100, 2, 100);
  const rightPct = clamp((rightVal / maxRaw) * 100, 2, 100);

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.04 + index * 0.05, ease: 'easeOut' }}
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4"
    >
      {/* LEFT side — value + bar growing toward center */}
      <div className="flex items-center justify-end gap-3">
        <div className="min-w-0 text-right">
          <p className="text-[11px] uppercase tracking-wider text-text-dim">
            {def.label}
          </p>
          <p
            className={`text-lg font-semibold tabular-nums leading-tight ${
              winner === 'left' ? 'text-text' : 'text-text-dim'
            }`}
          >
            {fmtVal(def, leftVal)}
          </p>
        </div>
        <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-surface-2 sm:block">
          <motion.div
            className="ml-auto h-full rounded-full"
            style={{
              background: winner === 'left' ? tone : chartTheme.colors.muted,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${leftPct}%` }}
            transition={{
              duration: 0.7,
              delay: 0.1 + index * 0.05,
              ease: 'easeOut',
            }}
          />
        </div>
      </div>

      {/* CENTER — delta callout with count-up + arrow pop */}
      <DeltaCallout
        tone={tone}
        toneClass={toneTextClass(delta)}
        Icon={DeltaIcon}
        pct={pct}
        delay={0.12 + index * 0.05}
      />

      {/* RIGHT side — bar growing toward center + value */}
      <div className="flex items-center gap-3">
        <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-surface-2 sm:block">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: winner === 'right' ? tone : chartTheme.colors.muted,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${rightPct}%` }}
            transition={{
              duration: 0.7,
              delay: 0.1 + index * 0.05,
              ease: 'easeOut',
            }}
          />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-text-dim">
            {winner === 'right' ? (
              <span className="text-accent">winner</span>
            ) : winner === 'left' ? (
              <span className="text-text-dim/70">trailing</span>
            ) : (
              'even'
            )}
          </p>
          <p
            className={`text-lg font-semibold tabular-nums leading-tight ${
              winner === 'right' ? 'text-text' : 'text-text-dim'
            }`}
          >
            {fmtVal(def, rightVal)}
          </p>
        </div>
      </div>
    </motion.li>
  );
}

function DeltaCallout({
  tone,
  toneClass,
  Icon,
  pct,
  delay,
}: {
  tone: string;
  toneClass: string;
  Icon: typeof ArrowUpRight;
  pct: number;
  delay: number;
}) {
  const sign = pct > 0.05 ? '+' : '';
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18, delay }}
      className="flex w-[88px] flex-col items-center gap-0.5"
    >
      <motion.span
        initial={{ rotate: -25, scale: 0.5 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 14, delay: delay + 0.05 }}
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ background: `${tone}1f`, color: tone }}
      >
        <Icon className="h-4 w-4" />
      </motion.span>
      <span className={`text-sm font-bold tabular-nums ${toneClass}`}>
        {sign}
        <CountUp value={Math.abs(pct)} decimals={1} />%
      </span>
    </motion.div>
  );
}

/** Lightweight framer-motion count-up (no extra deps). */
function CountUp({
  value,
  decimals = 0,
}: {
  value: number;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(0);
  useMemo(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 650;
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display.toFixed(decimals)}</>;
}

function SummaryCard({
  Icon,
  tone,
  headline,
  label,
  detail,
}: {
  Icon: typeof Trophy;
  tone: 'accent' | 'accent3';
  headline: string;
  label: string;
  detail: React.ReactNode;
}) {
  const iconClass = tone === 'accent' ? 'text-accent' : 'text-accent3';
  return (
    <Card noShimmer>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-text-dim">
            {label}
          </span>
          <span className={iconClass}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="text-2xl font-semibold tabular-nums leading-none text-text"
        >
          {headline}
        </motion.p>
        <div className="mt-0.5">{detail}</div>
      </CardContent>
    </Card>
  );
}

function ProgressPips({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: total }, (_, i) => (
        <motion.span
          key={i}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.25, delay: 0.15 + i * 0.02 }}
          className="h-3.5 w-1.5 rounded-full"
          style={{
            background: i < filled ? GAIN : chartTheme.colors.border,
          }}
        />
      ))}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

interface DivergingTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DivergingDatum }>;
}

function DivergingTooltip({ active, payload }: DivergingTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  const positive = datum.value > 0;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: chartTheme.tooltip.background,
        borderColor: chartTheme.tooltip.border,
        color: chartTheme.tooltip.text,
      }}
    >
      <p className="font-semibold">{datum.name}</p>
      <p style={{ color: chartTheme.tooltip.muted }}>{datum.meta}</p>
      <p
        className="mt-1 font-semibold tabular-nums"
        style={{ color: positive ? GAIN : LOSS }}
      >
        {positive ? '+' : ''}
        {datum.value.toFixed(1)} pts
      </p>
    </div>
  );
}

function DivergingChart({ data }: { data: DivergingDatum[] }) {
  // Symmetric domain around zero so the zero axis sits dead center.
  const maxAbs = useMemo(() => {
    const m = data.reduce((acc, x) => Math.max(acc, Math.abs(x.value)), 0);
    return Math.max(1, Math.ceil(m * 1.15));
  }, [data]);

  // Height scales with row count so 15 mailboxes stay readable.
  const height = Math.max(260, data.length * 26 + 36);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, left: 56, bottom: 4 }}
          barCategoryGap={4}
        >
          <XAxis
            type="number"
            domain={[-maxAbs, maxAbs]}
            tick={{
              fill: chartTheme.colors.muted,
              fontSize: chartTheme.font.sizeSm,
            }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{
              fill: chartTheme.colors.text,
              fontSize: chartTheme.font.sizeSm,
            }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ fill: chartTheme.colors.primary, fillOpacity: 0.06 }}
            content={<DivergingTooltip />}
          />
          <ReferenceLine x={0} stroke={chartTheme.colors.border} strokeWidth={1.5} />
          <Bar
            dataKey="value"
            radius={3}
            maxBarSize={18}
            isAnimationActive
            animationDuration={750}
            animationEasing="ease-out"
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.value >= 0 ? GAIN : LOSS}
              />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
              style={{
                fill: chartTheme.colors.muted,
                fontSize: chartTheme.font.sizeSm,
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ProPlusAna3Benchmark;
