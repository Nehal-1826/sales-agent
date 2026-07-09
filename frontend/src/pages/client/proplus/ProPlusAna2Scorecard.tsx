import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Fingerprint,
  Flame,
  Gauge,
  Inbox,
  Minus,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * ProPlusAna2Scorecard — STANDALONE Pro-Plus "Graded Scorecard / health
 * report" analytics section for the isolated preview harness.
 *
 * This is deliberately NOT a chart dashboard, NOT a pivot/explorer, NOT a
 * benchmark split, NOT an annotated storyboard. It presents analytics the way
 * a credit report / Lighthouse score / medical check-up does:
 *
 *   ┌─ Header band — title + Pro Plus badge + period chip ─────────────┐
 *   ├─ GRADE HERO ─────────────────────────────────────────────────────┤
 *   │  big letter grade in a draw-in ring · count-up composite score   │
 *   │  · "what this means" sentence · trend vs last period             │
 *   ├─ DOMAIN SCORECARDS (6) ──────────────────────────────────────────┤
 *   │  Deliverability · Inbox Placement · Engagement · Authentication  │
 *   │  · Warmth Ramp · Reputation. Each = letter + score + sparkline   │
 *   │  + 2-3 sub-metrics w/ pass/watch/fail pills + one-line verdict   │
 *   ├─ WHAT CHANGED ── delta list (improved / regressed factors) ──────┤
 *   └─ GRADING LEGEND ── subtle A+→F band ────────────────────────────┘
 *
 * Everything is the inline `MOCK` const; letter grades are DERIVED from the
 * 0-100 scores by `gradeFor()` (a real function), not hard-coded. Renders
 * ONLY page content — the shell + sidebar are supplied by the harness. No
 * router / query / fetch / props.
 */

// ---------------------------------------------------------------------------
// Grading model — score (0-100) → letter grade, the single source of truth
// ---------------------------------------------------------------------------

type Letter = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

/** Cut-points for the report card. Higher score = better grade. */
const GRADE_BANDS: Array<{ min: number; letter: Letter }> = [
  { min: 95, letter: 'A+' },
  { min: 85, letter: 'A' },
  { min: 70, letter: 'B' },
  { min: 55, letter: 'C' },
  { min: 40, letter: 'D' },
  { min: 0, letter: 'F' },
];

/** The real score→letter function the whole UI grades through. */
function gradeFor(score: number): Letter {
  const clamped = Math.max(0, Math.min(100, score));
  for (const band of GRADE_BANDS) {
    if (clamped >= band.min) return band.letter;
  }
  return 'F';
}

/**
 * Token mapping for a letter. Contract: A/B → accent, C → accent4,
 * D/F → accent3. A+ rides accent too (it's the best A).
 */
const GRADE_TOKEN: Record<
  Letter,
  { text: string; bar: string; ring: string; soft: string }
> = {
  'A+': {
    text: 'text-accent',
    bar: 'bg-accent',
    ring: 'var(--wp-accent, #F26522)',
    soft: 'bg-accent/10 border-accent/30 text-accent',
  },
  A: {
    text: 'text-accent',
    bar: 'bg-accent',
    ring: 'var(--wp-accent, #F26522)',
    soft: 'bg-accent/10 border-accent/30 text-accent',
  },
  B: {
    text: 'text-accent',
    bar: 'bg-accent',
    ring: 'var(--wp-accent, #F26522)',
    soft: 'bg-accent/10 border-accent/30 text-accent',
  },
  C: {
    text: 'text-accent4',
    bar: 'bg-accent4',
    ring: '#ffd54f',
    soft: 'bg-accent4/10 border-accent4/30 text-accent4',
  },
  D: {
    text: 'text-accent3',
    bar: 'bg-accent3',
    ring: '#ff6b4a',
    soft: 'bg-accent3/10 border-accent3/30 text-accent3',
  },
  F: {
    text: 'text-accent3',
    bar: 'bg-accent3',
    ring: '#ff6b4a',
    soft: 'bg-accent3/10 border-accent3/30 text-accent3',
  },
};

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Status = 'pass' | 'watch' | 'fail';

interface SubMetric {
  label: string;
  value: string;
  status: Status;
}

interface SparkPoint extends Record<string, unknown> {
  i: number;
  v: number;
}

interface DomainCard {
  key: string;
  name: string;
  Icon: typeof Inbox;
  score: number;
  /** Score one period ago — drives the +/- trend chip. */
  prevScore: number;
  verdict: string;
  subs: SubMetric[];
  spark: SparkPoint[];
}

interface ChangedFactor {
  label: string;
  domain: string;
  delta: number;
  unit: string;
  direction: 'improved' | 'regressed';
}

interface ScorecardMock {
  mailboxCount: number;
  activeCount: number;
  periodLabel: string;
  composite: number;
  prevComposite: number;
  headline: string;
  domains: DomainCard[];
  changed: ChangedFactor[];
}

// ---------------------------------------------------------------------------
// Mock data — Pro Plus (15 mailboxes), analyst-grade report-card numbers
// ---------------------------------------------------------------------------

/** Build a smooth N-point sparkline that lands near `end`, gently rising. */
function spark(end: number, swing: number, n = 16): SparkPoint[] {
  const start = Math.max(0, end - swing);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const v = start + (end - start) * t + Math.sin(i * 0.9) * (swing * 0.14);
    return { i, v: Math.round(Math.max(0, Math.min(100, v)) * 10) / 10 };
  });
}

const MOCK: ScorecardMock = {
  mailboxCount: 15,
  activeCount: 14,
  periodLabel: 'Last 30 days vs previous 30',
  composite: 91,
  prevComposite: 86,
  headline:
    'Strong sender health. Inbox delivery and authentication are excellent; opens & replies is the one area holding the grade back from an A+.',
  domains: [
    {
      key: 'deliverability',
      name: 'Inbox delivery',
      Icon: ShieldCheck,
      score: 96,
      prevScore: 92,
      verdict:
        'Almost no failed deliveries and spam complaints are well under threshold across all 15 mailboxes.',
      subs: [
        { label: 'Failure rate', value: '0.4%', status: 'pass' },
        { label: 'Spam complaints', value: '0.02%', status: 'pass' },
        { label: 'Send success', value: '99.6%', status: 'pass' },
      ],
      spark: spark(96, 10),
    },
    {
      key: 'placement',
      name: 'Where Emails Land',
      Icon: Inbox,
      score: 93,
      prevScore: 88,
      verdict:
        'Inbox share is climbing steadily; a small slice still lands in Promotions at Gmail.',
      subs: [
        { label: 'Inbox', value: '93.4%', status: 'pass' },
        { label: 'Promotions', value: '5.1%', status: 'watch' },
        { label: 'Spam folder', value: '1.5%', status: 'pass' },
      ],
      spark: spark(93, 14),
    },
    {
      key: 'engagement',
      name: 'Opens & Replies',
      Icon: MousePointerClick,
      score: 71,
      prevScore: 74,
      verdict:
        'Open rate is healthy but reply rate dipped this period — helper reply pace is being rebalanced.',
      subs: [
        { label: 'Open rate', value: '68.2%', status: 'pass' },
        { label: 'Reply rate', value: '21.5%', status: 'watch' },
        { label: 'Star rate', value: '7.8%', status: 'watch' },
      ],
      spark: spark(71, 9),
    },
    {
      key: 'authentication',
      name: 'Authentication',
      Icon: Fingerprint,
      score: 98,
      prevScore: 98,
      verdict:
        'SPF, DKIM and DMARC all align on every domain. No further action needed.',
      subs: [
        { label: 'SPF', value: 'Pass', status: 'pass' },
        { label: 'DKIM', value: 'Pass', status: 'pass' },
        { label: 'DMARC', value: 'p=quarantine', status: 'pass' },
      ],
      spark: spark(98, 4),
    },
    {
      key: 'warmth',
      name: 'Warmth Build-up',
      Icon: Flame,
      score: 84,
      prevScore: 79,
      verdict:
        'Average warmth is on the expected ladder; two newer mailboxes are still early in their build-up.',
      subs: [
        { label: 'Avg warmth', value: '84 / 100', status: 'pass' },
        { label: 'Building-up mailboxes', value: '2 of 15', status: 'watch' },
        { label: 'Daily-limit adherence', value: '97%', status: 'pass' },
      ],
      spark: spark(84, 22),
    },
    {
      key: 'reputation',
      name: 'Sender Trust',
      Icon: Gauge,
      score: 88,
      prevScore: 83,
      verdict:
        'Helper-network trust is strong and trending up; no mailbox is near the deactivation floor.',
      subs: [
        { label: 'Helper trust score', value: '0.88', status: 'pass' },
        { label: 'Block-list hits', value: '0', status: 'pass' },
        { label: 'Domain age signal', value: 'Good', status: 'pass' },
      ],
      spark: spark(88, 16),
    },
  ],
  changed: [
    {
      label: 'Where emails land',
      domain: 'Where Emails Land',
      delta: 5.2,
      unit: 'pts',
      direction: 'improved',
    },
    {
      label: 'Failure rate',
      domain: 'Inbox delivery',
      delta: 0.3,
      unit: 'pts',
      direction: 'improved',
    },
    {
      label: 'Helper trust',
      domain: 'Sender Trust',
      delta: 0.05,
      unit: '',
      direction: 'improved',
    },
    {
      label: 'Avg warmth',
      domain: 'Warmth Build-up',
      delta: 5,
      unit: 'pts',
      direction: 'improved',
    },
    {
      label: 'Reply rate',
      domain: 'Opens & Replies',
      delta: 2.4,
      unit: 'pts',
      direction: 'regressed',
    },
    {
      label: 'Promotions share',
      domain: 'Where Emails Land',
      delta: 0.7,
      unit: 'pts',
      direction: 'regressed',
    },
  ],
};

// ---------------------------------------------------------------------------
// Animation presets
// ---------------------------------------------------------------------------

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

const STATUS_META: Record<
  Status,
  { Icon: typeof CheckCircle2; cls: string; label: string }
> = {
  pass: {
    Icon: CheckCircle2,
    cls: 'bg-accent/10 border-accent/30 text-accent',
    label: 'Pass',
  },
  watch: {
    Icon: Minus,
    cls: 'bg-accent4/10 border-accent4/30 text-accent4',
    label: 'Watch',
  },
  fail: {
    Icon: XCircle,
    cls: 'bg-accent3/10 border-accent3/30 text-accent3',
    label: 'Fail',
  },
};

// ---------------------------------------------------------------------------
// Count-up number — animates 0 → target on mount via a keyframed motion span
// ---------------------------------------------------------------------------

function CountUp({
  to,
  delay = 0,
  duration = 1.1,
  className,
}: {
  to: number;
  delay?: number;
  duration?: number;
  className?: string;
}): JSX.Element {
  // Build an integer keyframe ramp so the displayed text ticks 0 → `to`.
  const steps = useMemo(() => {
    const n = Math.max(2, Math.min(40, Math.round(to) + 1));
    return Array.from({ length: n }, (_, i) =>
      Math.round((to * i) / (n - 1)),
    );
  }, [to]);

  return (
    <motion.span
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay }}
    >
      <motion.span
        initial={{ display: 'inline-block' }}
        animate={{}}
      >
        {steps.map((s, idx) => (
          <motion.span
            key={idx}
            className="tabular-nums"
            style={{ position: idx === 0 ? 'relative' : 'absolute' }}
            initial={{ opacity: idx === 0 ? 1 : 0 }}
            animate={{ opacity: idx === steps.length - 1 ? 1 : 0 }}
            transition={{
              duration: duration / steps.length,
              delay: delay + (duration * idx) / steps.length,
              ease: 'linear',
            }}
          >
            {s}
          </motion.span>
        ))}
      </motion.span>
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// Grade ring — SVG circle whose stroke draws in proportionally to the score
// ---------------------------------------------------------------------------

function GradeRing({
  score,
  letter,
  ringColor,
}: {
  score: number;
  letter: Letter;
  ringColor: string;
}): JSX.Element {
  const R = 78;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="relative h-[184px] w-[184px] shrink-0">
      <svg viewBox="0 0 184 184" className="h-full w-full -rotate-90">
        <circle
          cx={92}
          cy={92}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={11}
          className="text-surface-2"
        />
        <motion.circle
          cx={92}
          cy={92}
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C - C * pct }}
          transition={{ duration: 1.3, ease: 'easeOut', delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-5xl font-semibold leading-none tracking-tight"
          style={{ color: ringColor }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.7, ease: 'easeOut' }}
        >
          {letter}
        </motion.span>
        <span className="mt-1.5 text-xs uppercase tracking-[0.18em] text-text-dim">
          Grade
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — recharts area in a fixed-height parent (ResponsiveContainer)
// ---------------------------------------------------------------------------

function DomainSpark({
  data,
  color,
  gradientId,
}: {
  data: SparkPoint[];
  color: string;
  gradientId: string;
}): JSX.Element {
  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, 100]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            fill={`url(#${gradientId})`}
            isAnimationActive
            animationDuration={1100}
            animationEasing="ease-out"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chip — score delta vs previous period
// ---------------------------------------------------------------------------

function TrendChip({
  delta,
  suffix = 'pts',
}: {
  delta: number;
  suffix?: string;
}): JSX.Element {
  const flat = Math.abs(delta) < 0.05;
  const up = delta > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? 'text-text-dim'
    : up
      ? 'text-accent'
      : 'text-accent3';
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${tone}`}
    >
      <Icon className="h-3 w-3" />
      {flat ? '0' : `${up ? '+' : ''}${Math.round(delta * 10) / 10}`}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Domain scorecard
// ---------------------------------------------------------------------------

function DomainScorecard({
  card,
  index,
}: {
  card: DomainCard;
  index: number;
}): JSX.Element {
  const letter = gradeFor(card.score);
  const token = GRADE_TOKEN[letter];
  const delta = card.score - card.prevScore;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.42,
        ease: 'easeOut',
        delay: 0.35 + index * 0.07,
      }}
    >
      <Card className="h-full" noShimmer>
        <CardContent className="flex h-full flex-col gap-4 p-5">
          {/* Header: icon + name + big letter badge */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg border ${token.soft}`}
              >
                <card.Icon className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold leading-tight text-text">
                  {card.name}
                </h3>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-xs tabular-nums text-text-dim">
                    {card.score}/100
                  </span>
                  <span className="text-border-muted">·</span>
                  <TrendChip delta={delta} />
                </div>
              </div>
            </div>
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl font-semibold ${token.soft}`}
              aria-label={`Grade ${letter}`}
            >
              {letter}
            </span>
          </div>

          {/* Sparkline trend */}
          <DomainSpark
            data={card.spark}
            color={token.ring}
            gradientId={`ppa2-spark-${card.key}`}
          />

          {/* Sub-metrics with pass/watch/fail pills */}
          <ul className="space-y-2">
            {card.subs.map((s) => {
              const meta = STATUS_META[s.status];
              return (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate text-text-dim">{s.label}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums font-medium text-text">
                      {s.value}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.cls}`}
                    >
                      <meta.Icon className="h-2.5 w-2.5" />
                      {meta.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {/* One-line verdict */}
          <p className="mt-auto border-t border-border-muted pt-3 text-xs leading-relaxed text-text-dim">
            {card.verdict}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusAna2Scorecard(): JSX.Element {
  const d = MOCK;
  const letter = gradeFor(d.composite);
  const token = GRADE_TOKEN[letter];
  const compositeDelta = d.composite - d.prevComposite;

  const improved = useMemo(
    () => d.changed.filter((c) => c.direction === 'improved'),
    [d.changed],
  );
  const regressed = useMemo(
    () => d.changed.filter((c) => c.direction === 'regressed'),
    [d.changed],
  );

  return (
    <div className="space-y-5">
      {/* Header band */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Inbox-delivery scorecard
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            A graded health report across {d.mailboxCount} mailboxes ·{' '}
            {d.activeCount}/{d.mailboxCount} warming · {d.periodLabel}.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">Graded just now</span>
        </div>
      </motion.header>

      {/* Grade hero */}
      <motion.div {...fade(0.08)}>
        <Card noShimmer>
          <CardContent className="flex flex-col items-center gap-7 p-6 sm:flex-row sm:items-center sm:gap-9 sm:p-8">
            <GradeRing
              score={d.composite}
              letter={letter}
              ringColor={token.ring}
            />
            <div className="flex-1 space-y-3 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <span className="text-xs uppercase tracking-[0.2em] text-text-dim">
                  Overall sender health
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${token.soft}`}
                >
                  Grade {letter}
                </span>
              </div>
              <div className="flex items-end justify-center gap-3 sm:justify-start">
                <span className="flex items-baseline">
                  <CountUp
                    to={d.composite}
                    delay={0.4}
                    className={`text-6xl font-semibold leading-none tracking-tight ${token.text}`}
                  />
                  <span className="ml-1 text-2xl font-medium text-text-dim">
                    /100
                  </span>
                </span>
                <span className="mb-1.5 flex items-center gap-1.5">
                  <TrendChip delta={compositeDelta} />
                  <span className="text-xs text-text-dim">vs last period</span>
                </span>
              </div>
              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-text-dim sm:mx-0">
                {d.headline}
              </p>
              {/* Composite score bar */}
              <div className="mx-auto h-1.5 max-w-md overflow-hidden rounded-full bg-surface-2 sm:mx-0">
                <motion.div
                  className={`h-full rounded-full ${token.bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${d.composite}%` }}
                  transition={{ duration: 1.3, ease: 'easeOut', delay: 0.3 }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Domain scorecards */}
      <div>
        <motion.h2
          {...fade(0.3)}
          className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-dim"
        >
          Domain breakdown
        </motion.h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {d.domains.map((c, i) => (
            <DomainScorecard key={c.key} card={c} index={i} />
          ))}
        </div>
      </div>

      {/* What changed + grading legend — two-up */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.85)} className="lg:col-span-7">
          <Card noShimmer className="h-full">
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <h2 className="text-base font-semibold text-text">
                  What changed this period
                </h2>
                <span className="text-xs text-text-dim">
                  {improved.length} improved · {regressed.length} regressed
                </span>
              </header>
              <div className="grid grid-cols-1 gap-px bg-border-muted sm:grid-cols-2">
                <ChangedColumn
                  title="Improved"
                  items={improved}
                  positive
                  baseDelay={0.95}
                />
                <ChangedColumn
                  title="Regressed"
                  items={regressed}
                  positive={false}
                  baseDelay={0.95}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fade(0.9)} className="lg:col-span-5">
          <Card noShimmer className="h-full">
            <CardContent className="space-y-4 p-5">
              <h2 className="text-base font-semibold text-text">
                How grades are scored
              </h2>
              <p className="text-xs leading-relaxed text-text-dim">
                Each domain is scored 0–100 from its inbox-delivery signals,
                then mapped to a letter. The overall grade is the weighted
                composite across all six domains.
              </p>
              <ul className="space-y-1.5">
                {GRADE_BANDS.map((band, idx) => {
                  const next = GRADE_BANDS[idx - 1];
                  const upper = next ? next.min - 1 : 100;
                  const tk = GRADE_TOKEN[band.letter];
                  return (
                    <li
                      key={band.letter}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span
                        className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold ${tk.soft}`}
                      >
                        {band.letter}
                      </span>
                      <span className="tabular-nums text-text-dim">
                        {band.min}
                        {band.min === upper ? '' : `–${upper}`}
                      </span>
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <motion.div
                          className={`h-full rounded-full ${tk.bar}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${upper}%` }}
                          transition={{
                            duration: 0.8,
                            ease: 'easeOut',
                            delay: 1 + idx * 0.06,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Changed-factors column — staggered improved / regressed list
// ---------------------------------------------------------------------------

function ChangedColumn({
  title,
  items,
  positive,
  baseDelay,
}: {
  title: string;
  items: ChangedFactor[];
  positive: boolean;
  baseDelay: number;
}): JSX.Element {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const tone = positive ? 'text-accent' : 'text-accent3';
  const dotSoft = positive
    ? 'bg-accent/10 border-accent/30 text-accent'
    : 'bg-accent3/10 border-accent3/30 text-accent3';

  return (
    <div className="bg-surface px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-md border ${dotSoft}`}
        >
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">
          {title}
        </span>
      </div>
      <ul className="space-y-2.5">
        {items.map((c, i) => (
          <motion.li
            key={c.label}
            initial={{ opacity: 0, x: positive ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.32,
              ease: 'easeOut',
              delay: baseDelay + i * 0.08,
            }}
            className="flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">
                {c.label}
              </p>
              <p className="text-xs text-text-dim">{c.domain}</p>
            </div>
            <span
              className={`flex shrink-0 items-center gap-0.5 text-sm font-semibold tabular-nums ${tone}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {Math.round(c.delta * 100) / 100}
              {c.unit ? ` ${c.unit}` : ''}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export default ProPlusAna2Scorecard;
