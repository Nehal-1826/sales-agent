import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
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
  Activity,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Database,
  FlaskConical,
  Gauge,
  Inbox,
  Mail,
  Radar,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * ProPlusBil3UsageMeter — "Pro Plus" Billing rendered as a Usage Meter Cockpit.
 *
 * Resource-monitoring framing, NOT a receipt / plan-compare / spend timeline.
 *
 * Layout (top → bottom):
 *   1. Header band — title, Pro Plus badge, cycle-window pill
 *   2. Dial row — 5 large animated SVG arc gauges (mailboxes, daily sends,
 *      peer-pool draws, postmaster/SNDS ingest, placement-tester credits).
 *      Each: arc fill stroke-dashoffset animation, count-up center value,
 *      delta vs last period chip, "Projected month-end" caption, status color
 *      that shifts as the dial approaches the cap.
 *   3. Run-rate forecast strip — wide AreaChart: 21 actual days + 9 forecast
 *      days with cap reference line + "approaching cap" shaded headroom band.
 *   4. Footer rail — 4 small subordinate cards: plan price · next renewal ·
 *      card on file · last invoice. Intentionally NOT centered — small.
 *
 * Standalone, preview-harness friendly: no network/router/fetch hooks, no
 * required props, inline MOCK only. recharts in fixed-height container,
 * ResponsiveContainer 100%/100%.
 *
 * Styling tokens only: bg-bg / bg-surface / bg-surface-2 / text-text /
 * text-text-dim / border-border-muted / text-accent / text-accent3 (near-cap)
 * / text-accent4 (warm).
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type Tone = 'accent' | 'accent4' | 'accent3';

interface ResourceMeter {
  key: string;
  label: string;
  used: number;
  cap: number;
  unit: string;
  delta: number; // percent vs previous period
  projected: number; // projected month-end consumption
  Icon: typeof Inbox;
  hint: string;
}

interface PaceRow {
  day: number;
  actual: number | null;
  forecast: number | null;
  cap: number;
}

// ---------------------------------------------------------------------------
// Pro Plus mock (15 mailbox cap, 75 sends/day each → 1,125 cap, Postmaster +
// SNDS connected, placement tester quota in the plan)
// ---------------------------------------------------------------------------

const PLAN_LABEL = 'Pro Plus';
const PLAN_PRICE = 96;
const CYCLE_LENGTH_DAYS = 30;
const CYCLE_DAY_NOW = 21; // 21 of 30 elapsed
const CYCLE_LABEL = 'May 1 – May 30';

const METERS: ResourceMeter[] = [
  {
    key: 'mailboxes',
    label: 'Mailboxes active',
    used: 12,
    cap: 15,
    unit: '',
    delta: 9,
    projected: 13,
    Icon: Inbox,
    hint: 'Onboarded out of plan ceiling',
  },
  {
    key: 'daily_sends',
    label: 'Daily sends · avg',
    used: 1068,
    cap: 1125,
    unit: '/d',
    delta: 4,
    projected: 1110,
    Icon: Mail,
    hint: '12 mbx · build-up avg vs 75/day limit',
  },
  {
    key: 'peer_draws',
    label: 'Helper-group draws · today',
    used: 384,
    cap: 500,
    unit: '',
    delta: 12,
    projected: 412,
    Icon: Users,
    hint: 'Heavy + medium helper activity',
  },
  {
    key: 'postmaster',
    label: 'Postmaster · SNDS ingest',
    used: 18,
    cap: 20,
    unit: ' src',
    delta: 0,
    projected: 18,
    Icon: Radar,
    hint: 'Connected trust sources',
  },
  {
    key: 'placement',
    label: 'Inbox-test credits',
    used: 47,
    cap: 60,
    unit: '',
    delta: -8,
    projected: 56,
    Icon: FlaskConical,
    hint: 'Seed-inbox tests used this cycle',
  },
];

// 21 actual days + 9 forecast days = 30-day cycle, daily-sends pace.
const DAILY_CAP = 1125;
const PACE: PaceRow[] = (() => {
  // Realistic ramp: starts ~640, climbs to ~1070 by day 21.
  const actuals = [
    640, 668, 692, 705, 712, 730, 758, 781, 800, 821, 842, 855, 870, 894, 912,
    935, 958, 982, 1010, 1042, 1068,
  ];
  const lastActual = actuals[actuals.length - 1] ?? 1068;
  // Forecast continues at current 7-day slope.
  const last7Slope = (lastActual - (actuals[actuals.length - 8] ?? lastActual)) / 7;
  const rows: PaceRow[] = [];
  for (let d = 1; d <= CYCLE_LENGTH_DAYS; d += 1) {
    const idx = d - 1;
    if (idx < actuals.length) {
      rows.push({
        day: d,
        actual: actuals[idx]!,
        forecast: idx === actuals.length - 1 ? actuals[idx]! : null,
        cap: DAILY_CAP,
      });
    } else {
      const stepsAhead = idx - (actuals.length - 1);
      const projected = Math.round(
        Math.min(DAILY_CAP * 1.04, lastActual + last7Slope * stepsAhead),
      );
      rows.push({
        day: d,
        actual: null,
        forecast: projected,
        cap: DAILY_CAP,
      });
    }
  }
  return rows;
})();

const FORECAST_PEAK = Math.max(
  ...PACE.map((p) => Math.max(p.actual ?? 0, p.forecast ?? 0)),
);
const FORECAST_TO_CAP_PCT = Math.round((FORECAST_PEAK / DAILY_CAP) * 100);

// ---------------------------------------------------------------------------
// Tone helpers — healthy <70 → accent, warm 70–90 → accent4, near cap >90 →
// accent3.
// ---------------------------------------------------------------------------

function toneFor(pct: number): Tone {
  if (pct >= 90) return 'accent3';
  if (pct >= 70) return 'accent4';
  return 'accent';
}

const TONE_STROKE: Record<Tone, string> = {
  accent: '#FF9670', // accent
  accent4: '#facc15', // accent4 (warning amber)
  accent3: '#f87171', // accent3 (danger)
};
const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent',
  accent4: 'text-accent4',
  accent3: 'text-accent3',
};
const TONE_RING: Record<Tone, string> = {
  accent: 'border-accent/30',
  accent4: 'border-accent4/30',
  accent3: 'border-accent3/30',
};
const TONE_BG: Record<Tone, string> = {
  accent: 'bg-accent/10',
  accent4: 'bg-accent4/10',
  accent3: 'bg-accent3/10',
};
const TONE_GLOW: Record<Tone, string> = {
  accent: 'shadow-[0_0_30px_-12px_rgba(255, 150, 112,0.6)]',
  accent4: 'shadow-[0_0_30px_-12px_rgba(250,204,21,0.55)]',
  accent3: 'shadow-[0_0_30px_-12px_rgba(248,113,113,0.55)]',
};

function statusLabel(pct: number): string {
  if (pct >= 90) return 'Approaching cap';
  if (pct >= 70) return 'Healthy · warm';
  return 'Healthy';
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Count-up: ramps a number from 0 to target while the dial is in view.
// ---------------------------------------------------------------------------

function useCountUp(target: number, active: boolean, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out-quint
      const eased = 1 - Math.pow(1 - t, 5);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, durationMs]);
  return value;
}

// ---------------------------------------------------------------------------
// ArcGauge — single SVG semicircular arc with animated stroke fill, count-up
// center, status color and a small needle.
// ---------------------------------------------------------------------------

interface ArcGaugeProps {
  meter: ResourceMeter;
  index: number;
}

function ArcGauge({ meter, index }: ArcGaugeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });

  const pct = Math.min(100, Math.round((meter.used / meter.cap) * 100));
  const tone = toneFor(pct);
  const stroke = TONE_STROKE[tone];
  const value = useCountUp(meter.used, inView);

  // Semicircular arc geometry (radius 70, viewbox 180×110).
  const radius = 70;
  const cx = 90;
  const cy = 90;
  const circumference = Math.PI * radius; // half circle
  const dashOffset = circumference * (1 - pct / 100);

  // Needle angle in radians (0% = 180deg, 100% = 0deg → left to right sweep).
  const angleDeg = 180 - (pct / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const needleLen = radius - 6;
  const needleX = cx + needleLen * Math.cos(angleRad);
  const needleY = cy - needleLen * Math.sin(angleRad);

  const display =
    meter.used >= 1000 ? value.toFixed(0) : value.toFixed(meter.used < 100 ? 0 : 0);
  const projPct = Math.min(100, Math.round((meter.projected / meter.cap) * 100));
  const deltaPositive = meter.delta >= 0;
  const deltaLabel = `${deltaPositive ? '+' : ''}${meter.delta}% vs prev`;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.04 * index }}
      whileHover={{ y: -3 }}
      className={`group relative flex flex-col rounded-xl border ${TONE_RING[tone]} bg-surface/70 p-4 backdrop-blur-xl transition-shadow duration-300 hover:${TONE_GLOW[tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-dim">
            <meter.Icon className={`h-3 w-3 ${TONE_TEXT[tone]}`} />
            <span className="truncate">{meter.label}</span>
          </p>
          <p className="text-[10px] text-text-dim/70">{meter.hint}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${TONE_RING[tone]} ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}
        >
          {pct}%
        </span>
      </div>

      <div className="relative mx-auto mt-1 w-full max-w-[200px]">
        <svg viewBox="0 0 180 110" className="w-full">
          <defs>
            <linearGradient
              id={`arc-${meter.key}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={stroke} stopOpacity={0.7} />
              <stop offset="100%" stopColor={stroke} stopOpacity={1} />
            </linearGradient>
          </defs>

          {/* Track */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="currentColor"
            className="text-border-muted"
            strokeWidth={10}
            strokeLinecap="round"
          />

          {/* Tick marks at 70 % and 90 % thresholds */}
          {[70, 90].map((tickPct) => {
            const a = 180 - (tickPct / 100) * 180;
            const r1 = radius - 14;
            const r2 = radius + 4;
            const aRad = (a * Math.PI) / 180;
            return (
              <line
                key={tickPct}
                x1={cx + r1 * Math.cos(aRad)}
                y1={cy - r1 * Math.sin(aRad)}
                x2={cx + r2 * Math.cos(aRad)}
                y2={cy - r2 * Math.sin(aRad)}
                stroke="currentColor"
                className="text-text-dim/40"
                strokeWidth={1}
              />
            );
          })}

          {/* Projected ghost arc */}
          <motion.path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={stroke}
            strokeOpacity={0.18}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={
              inView
                ? { strokeDashoffset: circumference * (1 - projPct / 100) }
                : undefined
            }
            transition={{
              duration: 1.05,
              ease: 'easeOut',
              delay: 0.05 + 0.04 * index,
            }}
          />

          {/* Active arc */}
          <motion.path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={`url(#arc-${meter.key})`}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={inView ? { strokeDashoffset: dashOffset } : undefined}
            transition={{
              duration: 1.1,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.1 + 0.04 * index,
            }}
          />

          {/* Needle */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : undefined}
            transition={{ delay: 1.05 + 0.04 * index, duration: 0.3 }}
          >
            <line
              x1={cx}
              y1={cy}
              x2={needleX}
              y2={needleY}
              stroke={stroke}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={4} fill={stroke} />
            <circle cx={cx} cy={cy} r={1.5} fill="#0b0b12" />
          </motion.g>
        </svg>

        {/* Center value overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center">
          <span className="text-[26px] font-semibold leading-none tabular-nums text-text">
            {meter.used >= 1000
              ? formatNumber(value)
              : display}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wider text-text-dim">
            / {compact(meter.cap)}
            {meter.unit}
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${
            deltaPositive
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-border-muted bg-surface-2 text-text-dim'
          }`}
        >
          <TrendingUp
            className={`h-3 w-3 ${deltaPositive ? '' : 'rotate-180'}`}
          />
          {deltaLabel}
        </span>
        <span className={`font-medium ${TONE_TEXT[tone]}`}>
          {statusLabel(pct)}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-text-dim">
        Projected month-end{' '}
        <strong className="text-text tabular-nums">
          {formatNumber(meter.projected)}
        </strong>{' '}
        <span className="text-text-dim/70">/ {compact(meter.cap)}</span>
      </p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip for the forecast strip
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  dataKey: string;
  value: number | null;
  payload: PaceRow;
}

function ForecastTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const isActual = row.actual !== null;
  const value = isActual ? row.actual : row.forecast;
  return (
    <div className="rounded-lg border border-border-muted bg-bg/95 px-3 py-2 text-xs shadow-glass backdrop-blur-xl">
      <p className="font-medium text-text">
        Day {row.day} · {isActual ? 'Actual' : 'Forecast'}
      </p>
      <p className="text-text-dim">
        <span className="text-text tabular-nums">
          {formatNumber(value ?? 0)}
        </span>{' '}
        / {formatNumber(DAILY_CAP)} sends
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer rail card
// ---------------------------------------------------------------------------

interface FooterCardProps {
  label: string;
  value: string;
  sub: string;
  Icon: typeof Wallet;
  delay: number;
}

function FooterCard({ label, value, sub, Icon, delay }: FooterCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay }}
      className="flex items-center gap-2.5 rounded-lg border border-border-muted bg-surface/60 px-3 py-2.5 backdrop-blur-xl transition-colors hover:border-accent/30"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-text-dim">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-text">{value}</p>
        <p className="truncate text-[11px] text-text-dim/80">{sub}</p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusBil3UsageMeter(): JSX.Element {
  const cycleProgress = Math.round((CYCLE_DAY_NOW / CYCLE_LENGTH_DAYS) * 100);

  const overallTone = useMemo<Tone>(() => {
    const peak = Math.max(
      ...METERS.map((m) => Math.round((m.used / m.cap) * 100)),
    );
    return toneFor(peak);
  }, []);

  const overallLabel =
    overallTone === 'accent3'
      ? 'One resource approaching cap'
      : overallTone === 'accent4'
        ? 'One resource warming up'
        : 'All resources healthy';

  const forecastRef = useRef<HTMLDivElement>(null);
  const forecastInView = useInView(forecastRef, {
    once: true,
    margin: '-10% 0px',
  });

  // Renewal info
  const renewalDaysLeft = CYCLE_LENGTH_DAYS - CYCLE_DAY_NOW;

  return (
    <div className="space-y-5">
      {/* ─── Header band ─────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Billing · Usage cockpit
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              {PLAN_LABEL}
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Live resource consumption across your metered limits — not an
            invoice, a meter. Cycle {CYCLE_LABEL}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${TONE_RING[overallTone]} ${TONE_BG[overallTone]} ${TONE_TEXT[overallTone]}`}
          >
            {overallTone === 'accent' ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {overallLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface/60 px-3 py-1 text-xs text-text-dim backdrop-blur-xl">
            <Activity className="h-3.5 w-3.5 text-accent" />
            Day {CYCLE_DAY_NOW} / {CYCLE_LENGTH_DAYS} · {cycleProgress}% elapsed
          </span>
        </div>
      </motion.header>

      {/* ─── Dial row ────────────────────────────────────────────────── */}
      <section aria-label="Resource dials">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {METERS.map((m, i) => (
            <ArcGauge key={m.key} meter={m} index={i} />
          ))}
        </div>
      </section>

      {/* ─── Run-rate forecast strip ─────────────────────────────────── */}
      <motion.section
        ref={forecastRef}
        initial={{ opacity: 0, y: 14 }}
        animate={forecastInView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
      >
        <Card noShimmer>
          <CardContent className="space-y-3 p-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-0.5">
                <h2 className="flex items-center gap-2 text-base font-semibold text-text">
                  <Gauge className="h-4 w-4 text-accent" />
                  Run-rate forecast · daily sends
                </h2>
                <p className="text-xs text-text-dim">
                  Day-by-day actuals continued at the current 7-day slope vs
                  your plan ceiling of{' '}
                  <strong className="text-text tabular-nums">
                    {formatNumber(DAILY_CAP)}
                  </strong>{' '}
                  sends / day (12 mbx × 75 limit × build-up factor).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-accent">
                  <span className="h-2 w-2 rounded-full bg-accent" /> Actual
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-accent4/30 bg-accent4/10 px-2 py-0.5 text-accent4">
                  <span className="h-2 w-2 rounded-full bg-accent4 [mask-image:linear-gradient(90deg,#000_50%,transparent_50%)] [mask-size:4px_2px]" />
                  Forecast
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-accent3">
                  <span className="h-2 w-2 rounded-full bg-accent3" /> Plan
                  ceiling
                </span>
              </div>
            </header>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border border-border-muted bg-surface-2/60 px-3 py-2">
                <p className="text-text-dim">Today</p>
                <p className="tabular-nums text-text">
                  <strong className="text-text">
                    {formatNumber(PACE[CYCLE_DAY_NOW - 1]?.actual ?? 0)}
                  </strong>{' '}
                  /day
                </p>
              </div>
              <div className="rounded-md border border-border-muted bg-surface-2/60 px-3 py-2">
                <p className="text-text-dim">Projected month-end peak</p>
                <p
                  className={`tabular-nums ${TONE_TEXT[toneFor(FORECAST_TO_CAP_PCT)]}`}
                >
                  <strong>{formatNumber(FORECAST_PEAK)}</strong> /day
                  ({FORECAST_TO_CAP_PCT}% of cap)
                </p>
              </div>
              <div className="rounded-md border border-border-muted bg-surface-2/60 px-3 py-2">
                <p className="text-text-dim">Headroom remaining</p>
                <p className="tabular-nums text-text">
                  <strong>
                    {formatNumber(Math.max(0, DAILY_CAP - FORECAST_PEAK))}
                  </strong>{' '}
                  sends /day
                </p>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={PACE}
                  margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="proplus-actual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF9670" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#FF9670" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient
                      id="proplus-forecast"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#facc15" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
                    </linearGradient>
                    {/* Approaching-cap shaded band 90–100 % */}
                    <linearGradient id="proplus-cap-band" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a3a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#8888a0', fontSize: 11 }}
                    axisLine={{ stroke: '#2a2a3a' }}
                    tickLine={false}
                    tickFormatter={(v: number) => `D${v}`}
                  />
                  <YAxis
                    tick={{ fill: '#8888a0', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    domain={[0, Math.ceil((DAILY_CAP * 1.1) / 100) * 100]}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
                    }
                  />
                  <Tooltip
                    content={<ForecastTooltip />}
                    cursor={{ stroke: '#FF9670', strokeOpacity: 0.3 }}
                  />

                  {/* Headroom band — 90 % to 100 % of cap */}
                  <ReferenceLine
                    y={DAILY_CAP * 0.9}
                    stroke="#facc15"
                    strokeOpacity={0.4}
                    strokeDasharray="2 4"
                    label={{
                      value: '90% — warm',
                      position: 'insideTopLeft',
                      fill: '#facc15',
                      fontSize: 10,
                    }}
                  />

                  {/* Plan ceiling reference */}
                  <ReferenceLine
                    y={DAILY_CAP}
                    stroke="#f87171"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Plan cap · ${formatNumber(DAILY_CAP)}`,
                      position: 'insideTopRight',
                      fill: '#f87171',
                      fontSize: 11,
                    }}
                  />

                  {/* Day-now vertical marker */}
                  <ReferenceLine
                    x={CYCLE_DAY_NOW}
                    stroke="#FF9670"
                    strokeOpacity={0.7}
                    strokeDasharray="2 3"
                    label={{
                      value: 'Today',
                      position: 'top',
                      fill: '#FF9670',
                      fontSize: 10,
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="#FF9670"
                    strokeWidth={2}
                    fill="url(#proplus-actual)"
                    isAnimationActive={forecastInView}
                    animationDuration={900}
                    animationEasing="ease-out"
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="forecast"
                    stroke="#facc15"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    fill="url(#proplus-forecast)"
                    isAnimationActive={forecastInView}
                    animationDuration={1100}
                    animationBegin={400}
                    animationEasing="ease-out"
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <p className="text-[11px] text-text-dim">
              At current pace your peak day-{CYCLE_LENGTH_DAYS} send rate lands
              at{' '}
              <strong className={TONE_TEXT[toneFor(FORECAST_TO_CAP_PCT)]}>
                {FORECAST_TO_CAP_PCT}%
              </strong>{' '}
              of the Pro Plus daily ceiling. No action required.
            </p>
          </CardContent>
        </Card>
      </motion.section>

      {/* ─── Footer rail — plan info (NOT centered, intentionally small) ─ */}
      <section
        aria-label="Plan footer"
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="flex items-center gap-2 text-[11px] text-text-dim">
          <Database className="h-3.5 w-3.5 text-text-dim" />
          <span>
            Counters reset on the {CYCLE_LENGTH_DAYS}th billing day · dummy
            gateway, no card is charged
          </span>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:max-w-3xl sm:grid-cols-2 lg:grid-cols-4">
          <FooterCard
            label="Plan"
            value={`${formatMoney(PLAN_PRICE)} / mo`}
            sub={`${PLAN_LABEL} · monthly`}
            Icon={Sparkles}
            delay={0.05}
          />
          <FooterCard
            label="Next renewal"
            value={`In ${renewalDaysLeft} days`}
            sub="Auto-renew on"
            Icon={RefreshCw}
            delay={0.1}
          />
          <FooterCard
            label="Card on file"
            value="Visa ·· 4242"
            sub="Exp 11/27"
            Icon={CreditCard}
            delay={0.15}
          />
          <FooterCard
            label="Last invoice"
            value={`${formatMoney(PLAN_PRICE, { decimals: 2 })} paid`}
            sub={`${CYCLE_LABEL.split(' ')[0]} 1 · INV-2026-04812`}
            Icon={Wallet}
            delay={0.2}
          />
        </div>
      </section>
    </div>
  );
}

export default ProPlusBil3UsageMeter;
