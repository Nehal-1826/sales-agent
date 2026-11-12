import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Reply,
  Send,
  Star,
  MailOpen,
  ShieldCheck,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDate } from '@/lib/format';

/**
 * ProPlusDashV4Editorial — "Editorial / minimal-luxe" Pro Plus dashboard.
 *
 * A deliberate counter-point to the existing dense "Mission control" Pro Plus
 * surface. The design language here is editorial: oversized display type, an
 * enormous tabular warmth numeral that anchors the page, one elegant
 * full-bleed trend chart, hairline dividers between refined supporting detail
 * rows, generous whitespace, a single accent, and a quiet Pro-Plus footnote
 * line. Fewer boxes — more craft. The narrative (the warmth story) is told
 * once, confidently, in prose-scale type rather than scattered across a KPI
 * grid.
 *
 * Fully STANDALONE — no network, router or query hooks; no required props.
 * Every number comes from the inline MOCK const so a preview harness can
 * mount it prop-less. Renders only page content; the app shell supplies the
 * sidebar / chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

interface TrendPoint {
  date: string;
  warmth: number;
}

interface StatLine {
  key: string;
  label: string;
  value: string;
  context: string;
  delta: number;
  deltaUnit: string;
  /** Falling delta reads as good (spam-style metric). */
  invert?: boolean;
}

interface TimelineEvent {
  id: string;
  minutesAgo: number;
  mailbox: string;
  peer: string;
  action: 'replied' | 'opened' | 'starred' | 'spam_rescued' | 'sent';
}

interface EditorialData {
  avgWarmth: number;
  warmthDelta: number;
  warmthFloor: number;
  warmthPeak: number;
  mailboxCount: number;
  warmingCount: number;
  narrative: string;
  trend: TrendPoint[];
  stats: StatLine[];
  timeline: TimelineEvent[];
  footnote: string;
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro Plus numbers
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function isoMinusDays(days: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Smooth 30-day warmth ramp 67 → 86, gently jittered, oldest → newest. */
function buildTrend(): TrendPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const warmth = 67 + t * 19 + Math.sin(i * 0.55) * 1.4;
    return {
      date: isoMinusDays(29 - i),
      warmth: Math.round(Math.max(0, Math.min(100, warmth)) * 10) / 10,
    };
  });
}

const MOCK: EditorialData = {
  avgWarmth: 85,
  warmthDelta: 2.4,
  warmthFloor: 67,
  warmthPeak: 86,
  mailboxCount: 15,
  warmingCount: 12,
  narrative:
    'Workspace warmth has climbed nineteen points over the last thirty days and is holding firm in the high-trust band. Twelve of fifteen mailboxes are still building up; the rest are at full sending pace with inbox delivery above ninety-four percent.',
  trend: buildTrend(),
  stats: [
    {
      key: 'sends',
      label: 'Sends today',
      value: '643',
      context: 'of 825 planned across 15 mailboxes',
      delta: 61,
      deltaUnit: 'vs daily avg',
    },
    {
      key: 'reply',
      label: 'Reply rate',
      value: '26.4%',
      context: 'helper replies on warmup threads, 7-day mean',
      delta: 1.7,
      deltaUnit: 'pts week',
    },
    {
      key: 'inbox',
      label: 'Where emails land',
      value: '94.2%',
      context: 'seed-test landing, last inbox test run',
      delta: 2.6,
      deltaUnit: 'pts week',
    },
    {
      key: 'spam',
      label: 'Spam rate',
      value: '0.9%',
      context: 'Postmaster + SNDS, well under threshold',
      delta: -0.7,
      deltaUnit: 'pts week',
      invert: true,
    },
  ],
  timeline: [
    {
      id: 't1',
      minutesAgo: 1,
      mailbox: 'founder@acme.io',
      peer: 'maya.r@peernet.co',
      action: 'replied',
    },
    {
      id: 't2',
      minutesAgo: 4,
      mailbox: 'sales@acme.io',
      peer: 'devon@peer-inbox.io',
      action: 'opened',
    },
    {
      id: 't3',
      minutesAgo: 7,
      mailbox: 'success@acme.io',
      peer: 'lina.k@peernet.co',
      action: 'starred',
    },
    {
      id: 't4',
      minutesAgo: 11,
      mailbox: 'support@acme.co',
      peer: 'omar@peer-inbox.io',
      action: 'spam_rescued',
    },
    {
      id: 't5',
      minutesAgo: 16,
      mailbox: 'partnerships@acme.io',
      peer: 'raj.p@peernet.co',
      action: 'replied',
    },
    {
      id: 't6',
      minutesAgo: 22,
      mailbox: 'growth@acme.io',
      peer: 'ava@peer-inbox.io',
      action: 'sent',
    },
  ],
  footnote: 'Postmaster + SNDS connected · 15 mailboxes · inbox tester active',
};

// ---------------------------------------------------------------------------
// Animation + format helpers
// ---------------------------------------------------------------------------

const ACCENT = '#F26522';

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const, delay },
});

/** Eased count-up that runs once when scrolled into view. */
function useCountUp(target: number, decimals: number, run: boolean): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      setVal(Number((target * eased).toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, decimals, run]);
  return val;
}

function fmtDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : formatDate(d);
}

const ACTION_META: Record<
  TimelineEvent['action'],
  { verb: string; Icon: typeof Send; tone: string }
> = {
  replied: { verb: 'replied from', Icon: Reply, tone: 'text-accent' },
  opened: { verb: 'opened by', Icon: MailOpen, tone: 'text-text-dim' },
  starred: { verb: 'starred by', Icon: Star, tone: 'text-accent4' },
  spam_rescued: {
    verb: 'recovered from spam by',
    Icon: ShieldCheck,
    tone: 'text-accent3',
  },
  sent: { verb: 'sent to', Icon: Send, tone: 'text-text-dim' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusDashV4Editorial(): JSX.Element {
  const d = MOCK;

  return (
    <div className="mx-auto max-w-5xl pb-4">
      {/* Eyebrow */}
      <motion.div
        {...rise(0)}
        className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.22em] text-text-dim"
      >
        <span>Workspace warmth</span>
        <span className="text-accent">Pro Plus</span>
      </motion.div>

      {/* Hero — oversized warmth numeral + narrative */}
      <header className="mt-6 grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-12">
        <WarmthNumeral
          value={d.avgWarmth}
          delta={d.warmthDelta}
          floor={d.warmthFloor}
          peak={d.warmthPeak}
        />
        <motion.div
          {...rise(0.12)}
          className="flex flex-col justify-end lg:col-span-7"
        >
          <h1 className="text-balance text-2xl font-semibold leading-snug tracking-tight text-text sm:text-[1.65rem]">
            The warmth story
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-text-dim">
            {d.narrative}
          </p>
        </motion.div>
      </header>

      {/* Hairline */}
      <motion.div
        {...rise(0.2)}
        className="mt-10 border-t border-border-muted"
      />

      {/* Single full-bleed hero trend chart */}
      <motion.section {...rise(0.24)} className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-text-dim">
            Thirty-day warmth
          </h2>
          <span className="text-xs tabular-nums text-text-dim">
            {d.warmthFloor} → {d.warmthPeak}
          </span>
        </div>
        <TrendChart rows={d.trend} />
      </motion.section>

      {/* Hairline */}
      <motion.div
        {...rise(0.3)}
        className="mt-10 border-t border-border-muted"
      />

      {/* Supporting detail rows — typographic, hairline-divided */}
      <motion.section {...rise(0.34)} className="mt-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-[0.16em] text-text-dim">
          The supporting numbers
        </h2>
        <dl className="divide-y divide-border-muted">
          {d.stats.map((s, i) => (
            <StatRow key={s.key} stat={s} index={i} />
          ))}
        </dl>
      </motion.section>

      {/* Hairline */}
      <motion.div
        {...rise(0.42)}
        className="mt-10 border-t border-border-muted"
      />

      {/* Minimal activity timeline */}
      <motion.section {...rise(0.46)} className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-text-dim">
            Recent helper signal
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-text-dim">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            live
          </span>
        </div>
        <ul className="mt-4 space-y-px">
          {d.timeline.map((e, i) => (
            <TimelineRow key={e.id} event={e} index={i} />
          ))}
        </ul>
      </motion.section>

      {/* Quiet Pro-Plus footnote */}
      <motion.footer
        {...rise(0.56)}
        className="mt-12 border-t border-border-muted pt-5"
      >
        <p className="text-xs tracking-wide text-text-dim">{d.footnote}</p>
      </motion.footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WarmthNumeral({
  value,
  delta,
  floor,
  peak,
}: {
  value: number;
  delta: number;
  floor: number;
  peak: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const shown = useCountUp(value, 0, inView);
  const DeltaIcon =
    delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    delta > 0 ? 'text-accent' : delta < 0 ? 'text-accent3' : 'text-text-dim';

  return (
    <motion.div {...rise(0.05)} ref={ref} className="lg:col-span-5">
      <span className="block text-xs uppercase tracking-[0.2em] text-text-dim">
        Average warmth
      </span>
      <div className="mt-1 flex items-end gap-4">
        <span className="text-[5.5rem] font-semibold leading-[0.85] tracking-tighter tabular-nums text-text sm:text-[7rem]">
          {Math.round(shown)}
        </span>
        <span
          className={`mb-3 flex items-center gap-1 text-sm font-medium ${deltaTone}`}
        >
          <DeltaIcon className="h-4 w-4" />
          {delta > 0 ? '+' : ''}
          {delta} · 7d
        </span>
      </div>
      <p className="mt-3 text-sm text-text-dim">
        Holding in the high-trust band ·{' '}
        <span className="tabular-nums text-text">
          {floor}–{peak}
        </span>{' '}
        over 30 days
      </p>
    </motion.div>
  );
}

function TrendChart({ rows }: { rows: TrendPoint[] }) {
  return (
    <div className="mt-5 h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={rows}
          margin={{ top: 12, right: 4, bottom: 0, left: -16 }}
        >
          <defs>
            <linearGradient id="v4ed-warmth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.26} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fill: '#5a5a72', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            dy={6}
          />
          <YAxis
            domain={[Math.max(0, Math.min(...rows.map((r) => r.warmth)) - 6), 100]}
            tick={{ fill: '#5a5a72', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ stroke: '#2a2a3a', strokeWidth: 1 }}
            contentStyle={{
              background: '#12121a',
              border: '1px solid #2a2a3a',
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: '#8888a0' }}
            labelFormatter={(l) => fmtDate(String(l))}
            formatter={(val) => [String(val), 'Avg warmth']}
          />
          <Area
            type="monotone"
            dataKey="warmth"
            name="Avg warmth"
            stroke={ACCENT}
            strokeWidth={2.4}
            fill="url(#v4ed-warmth)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            animationDuration={1600}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatRow({ stat, index }: { stat: StatLine; index: number }) {
  const good = stat.invert ? stat.delta < 0 : stat.delta > 0;
  const flat = stat.delta === 0;
  const DeltaIcon = flat
    ? Minus
    : stat.delta > 0
      ? ArrowUpRight
      : ArrowDownRight;
  const deltaTone = flat
    ? 'text-text-dim'
    : good
      ? 'text-accent'
      : 'text-accent3';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        delay: 0.04 * index,
      }}
      className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-5"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{stat.label}</p>
        <p className="mt-0.5 text-xs text-text-dim">{stat.context}</p>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold tabular-nums leading-none text-text">
          {stat.value}
        </span>
        <span
          className={`flex items-center gap-0.5 text-xs font-medium ${deltaTone}`}
        >
          <DeltaIcon className="h-3 w-3" />
          {Math.abs(stat.delta)} {stat.deltaUnit}
        </span>
      </div>
    </motion.div>
  );
}

function TimelineRow({
  event,
  index,
}: {
  event: TimelineEvent;
  index: number;
}) {
  const meta = ACTION_META[event.action];
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
        delay: 0.05 * index,
      }}
      className="flex items-center gap-4 py-3"
    >
      <span className={`shrink-0 ${meta.tone}`}>
        <meta.Icon className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm text-text">
        <span className="font-medium">{event.mailbox}</span>{' '}
        <span className="text-text-dim">{meta.verb}</span>{' '}
        <span className="text-text-dim">{event.peer}</span>
      </p>
      <span className="shrink-0 text-xs tabular-nums text-text-dim">
        {event.minutesAgo}m ago
      </span>
    </motion.li>
  );
}

export default ProPlusDashV4Editorial;
