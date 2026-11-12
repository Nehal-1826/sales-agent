import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Flag,
  Gauge,
  Inbox,
  Mail,
  MailPlus,
  Radar,
  Reply,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
} from 'recharts';
import { formatDate } from '@/lib/format';

/**
 * ProPlusDashN1Timeline — "Timeline Journey" Pro-Plus dashboard.
 *
 * The warmup told as a vertical chronological STORY down a central spine,
 * NOT a card grid / cockpit / bento / gauge-focus / editorial-prose layout.
 *
 * Structure (deliberately distinct from every existing dashboard):
 *   - A compact "today" summary header strip (date · 15 mailboxes · avg
 *     warmth · sends today) — a single hairline-bounded ribbon, not KPI tiles.
 *   - A single CONTINUOUS vertical timeline rail (the spine): an animated
 *     gradient line that draws itself top→bottom on mount. Every milestone in
 *     the warmup journey is a dated node threaded off that one spine — a small
 *     pulse marker on the line plus a single event card offset to its right.
 *     The whole thing reads top-to-bottom like a feed/journey; there is no
 *     multi-column grid, no gauge hero, no bento tiles, no leaderboard.
 *   - Each node card carries a tiny inline micro-chart or single stat (sparl-
 *     line / mini-bars / mini-area / metric) sized to the event.
 *   - Pro-Plus flavour: Google Postmaster + Microsoft SNDS milestone nodes
 *     live inline in the same journey (the tier moat), plus a "now" terminal
 *     node and a forward "next milestone" projection node.
 *
 * Fully STANDALONE — no network / router / query hooks, no required props.
 * Every number comes from the inline MOCK const so the preview harness can
 * mount it prop-less. Renders only page content; the harness shell supplies
 * the real sidebar / chrome.
 */

// ---------------------------------------------------------------------------
// Theme constants (mirror tailwind.config.ts tokens as hex for recharts/SVG)
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
  surface2: '#1a1a26',
  borderMuted: '#2a2a3a',
  textDim: '#8888a0',
} as const;

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type NodeKind =
  | 'milestone'
  | 'mailbox'
  | 'postmaster'
  | 'snds'
  | 'placement'
  | 'rescue'
  | 'ramp'
  | 'now'
  | 'next';

type ChartKind = 'spark' | 'bars' | 'area' | 'stat' | 'none';

interface JourneyNode {
  id: string;
  /** Ladder day this event happened on (or projected day for `next`). */
  day: number;
  /** Human date label, e.g. "Apr 19". */
  date: string;
  kind: NodeKind;
  title: string;
  detail: string;
  Icon: typeof Mail;
  /** Accent token used for the marker + icon tint. */
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
  /** Optional inline micro-chart spec. */
  chart: ChartKind;
  series?: number[];
  /** Big inline figure (for `stat`) + its caption. */
  statValue?: string;
  statCaption?: string;
}

interface RampStep {
  label: string;
  range: string;
  target: number;
  /** True once the workspace has progressed past this rung. */
  done: boolean;
  /** True for the rung the workspace is on right now. */
  current: boolean;
}

interface TodaySummary {
  dateLabel: string;
  mailboxCount: number;
  warmingCount: number;
  avgWarmth: number;
  warmthDelta: number;
  sentToday: number;
  sentTarget: number;
  dayInJourney: number;
}

interface DashboardData {
  today: TodaySummary;
  ramp: RampStep[];
  nodes: JourneyNode[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro Plus numbers (15 mailboxes, avg warmth ~84)
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function dateLabel(daysAgo: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - daysAgo);
  return formatDate(d);
}

/** Smooth-ish ramp series helper for the inline micro-charts. */
function ramp(from: number, to: number, n: number, jitter = 0): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const v = from + (to - from) * t + Math.sin(i * 0.9) * jitter;
    return Math.round(v * 10) / 10;
  });
}

const MOCK: DashboardData = {
  today: {
    dateLabel: formatDate(ANCHOR),
    mailboxCount: 15,
    warmingCount: 13,
    avgWarmth: 84,
    warmthDelta: 2.6,
    sentToday: 648,
    sentTarget: 840,
    dayInJourney: 31,
  },
  ramp: [
    { label: 'D1–3', range: 'Days 1–3', target: 5, done: true, current: false },
    { label: 'D4–7', range: 'Days 4–7', target: 10, done: true, current: false },
    { label: 'D8–14', range: 'Days 8–14', target: 20, done: true, current: false },
    { label: 'D15–21', range: 'Days 15–21', target: 35, done: true, current: false },
    { label: 'D22–28', range: 'Days 22–28', target: 50, done: true, current: false },
    { label: 'D29+', range: 'Day 29 onward', target: 70, done: false, current: true },
  ],
  nodes: [
    {
      id: 'n-start',
      day: 1,
      date: dateLabel(30),
      kind: 'milestone',
      title: 'Warmup journey started',
      detail:
        'Workspace activated with 11 mailboxes. Helper network paired and the first warmup threads went out at a 5-send ceiling.',
      Icon: Rocket,
      tone: 'accent',
      chart: 'stat',
      statValue: '11',
      statCaption: 'mailboxes day 1',
    },
    {
      id: 'n-d4',
      day: 4,
      date: dateLabel(27),
      kind: 'ramp',
      title: 'Daily build-up advanced to 10 sends/day',
      detail:
        'Failure-free first rung. The ladder stepped D4–7 and per-mailbox volume doubled with no spam complaints.',
      Icon: TrendingUp,
      tone: 'accent2',
      chart: 'bars',
      series: [5, 5, 5, 7, 8, 10, 10],
    },
    {
      id: 'n-outlook',
      day: 6,
      date: dateLabel(25),
      kind: 'mailbox',
      title: 'Outlook mailbox added',
      detail:
        'partnerships@acme.io connected via Microsoft 365 OAuth and joined the warmup helper group — fleet now 12 mailboxes.',
      Icon: MailPlus,
      tone: 'accent4',
      chart: 'stat',
      statValue: '12',
      statCaption: 'mailboxes in helper group',
    },
    {
      id: 'n-d14',
      day: 14,
      date: dateLabel(17),
      kind: 'milestone',
      title: 'Crossed 70 workspace warmth',
      detail:
        'Average warmth moved out of the mid band into the high-trust band — inbox delivery broke 90% the same day.',
      Icon: Gauge,
      tone: 'accent',
      chart: 'area',
      series: ramp(48, 71, 14, 1.6),
    },
    {
      id: 'n-pm',
      day: 18,
      date: dateLabel(13),
      kind: 'postmaster',
      title: 'Postmaster trust reached High',
      detail:
        'Google Postmaster Tools promoted the sending domain across 6 Gmail mailboxes to High and held it 14 days running.',
      Icon: ShieldCheck,
      tone: 'accent',
      chart: 'area',
      series: ramp(62, 91, 16, 1.8),
    },
    {
      id: 'n-3mb',
      day: 20,
      date: dateLabel(11),
      kind: 'mailbox',
      title: '3 mailboxes added in a batch',
      detail:
        'growth@, billing@ and support@ onboarded together — fleet reached 15 mailboxes, the Pro Plus ceiling.',
      Icon: MailPlus,
      tone: 'accent4',
      chart: 'stat',
      statValue: '15',
      statCaption: 'mailboxes connected',
    },
    {
      id: 'n-rescue',
      day: 22,
      date: dateLabel(9),
      kind: 'rescue',
      title: 'Spam recovery saved 3 sends',
      detail:
        'Helper inboxes pulled 3 warmup messages out of spam and starred them on growth@acme.io — sender trust recovered within a day.',
      Icon: ShieldCheck,
      tone: 'accent3',
      chart: 'spark',
      series: [0, 1, 0, 3, 1, 0, 0, 1, 0, 0],
    },
    {
      id: 'n-snds',
      day: 24,
      date: dateLabel(7),
      kind: 'snds',
      title: 'SNDS clean week',
      detail:
        'Microsoft SNDS reported a green filter result for 7 straight days with a 0.00% complaint rate across the Outlook IPs.',
      Icon: Radar,
      tone: 'accent2',
      chart: 'bars',
      series: [0.04, 0.03, 0.02, 0.01, 0.0, 0.0, 0.0],
    },
    {
      id: 'n-placement',
      day: 26,
      date: dateLabel(5),
      kind: 'placement',
      title: 'Seed test landed 95% inbox',
      detail:
        'Latest inbox test run: 48 of 50 seeds inbox, 1 promotions, 1 spam — the strongest result of the journey so far.',
      Icon: Inbox,
      tone: 'accent',
      chart: 'stat',
      statValue: '95%',
      statCaption: '48/50 seeds inbox',
    },
    {
      id: 'n-d28',
      day: 28,
      date: dateLabel(3),
      kind: 'milestone',
      title: 'Completed the 28-day build-up',
      detail:
        'All built-up mailboxes cleared D22–28 and moved onto steady-state pace at their full daily target.',
      Icon: Flag,
      tone: 'accent4',
      chart: 'area',
      series: ramp(71, 83, 14, 1.2),
    },
    {
      id: 'n-reply',
      day: 30,
      date: dateLabel(1),
      kind: 'milestone',
      title: 'Reply rate held above 26%',
      detail:
        'Helper replies on warmup threads stayed above 26% for a full week — a durable opens & replies signal to the mailbox providers.',
      Icon: Reply,
      tone: 'accent',
      chart: 'spark',
      series: ramp(21, 27, 12, 0.8),
    },
    {
      id: 'n-now',
      day: 31,
      date: dateLabel(0),
      kind: 'now',
      title: 'Today — steady state, holding strong',
      detail:
        '13 of 15 mailboxes warming, 648 of 840 sends placed so far, workspace warmth 84 and climbing. Postmaster High · SNDS green.',
      Icon: Activity,
      tone: 'accent',
      chart: 'spark',
      series: ramp(67, 84, 14, 1.4),
    },
    {
      id: 'n-next',
      day: 35,
      date: 'Projected',
      kind: 'next',
      title: 'Next: workspace warmth → 88',
      detail:
        'On the current trajectory the remaining 2 mailboxes finish building up inside a week and workspace warmth crosses 88.',
      Icon: Sparkles,
      tone: 'accent4',
      chart: 'none',
    },
  ],
};

// ---------------------------------------------------------------------------
// Animation + token maps
// ---------------------------------------------------------------------------

const TONE_TEXT = {
  accent: 'text-accent',
  accent2: 'text-accent2',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
} as const;

const TONE_BORDER = {
  accent: 'border-accent/40',
  accent2: 'border-accent2/40',
  accent3: 'border-accent3/40',
  accent4: 'border-accent4/40',
} as const;

const TONE_BG_SOFT = {
  accent: 'bg-accent/10',
  accent2: 'bg-accent2/10',
  accent3: 'bg-accent3/10',
  accent4: 'bg-accent4/10',
} as const;

const TONE_HEX: Record<JourneyNode['tone'], string> = {
  accent: HEX.accent,
  accent2: HEX.accent2,
  accent3: HEX.accent3,
  accent4: HEX.accent4,
};

const KIND_LABEL: Record<NodeKind, string> = {
  milestone: 'Milestone',
  mailbox: 'Mailbox',
  postmaster: 'Postmaster',
  snds: 'SNDS',
  placement: 'Where it lands',
  rescue: 'Spam recovery',
  ramp: 'Build-up step',
  now: 'Now',
  next: 'Upcoming',
};

/** Eased count-up that runs once when scrolled into view. */
function useCountUp(target: number, decimals: number, run: boolean): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Number((target * eased).toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, decimals, run]);
  return val;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusDashN1Timeline(): JSX.Element {
  const { today, ramp: ladder, nodes } = MOCK;

  return (
    <div className="mx-auto max-w-4xl pb-6">
      <TodayHeader today={today} ladder={ladder} />

      {/* The journey — one continuous spine, dated nodes threaded off it */}
      <section className="relative mt-7">
        <Spine />
        <ol className="space-y-0">
          {nodes.map((n, i) => (
            <TimelineNode
              key={n.id}
              node={n}
              index={i}
              isLast={i === nodes.length - 1}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today summary header — a single hairline ribbon, not KPI tiles
// ---------------------------------------------------------------------------

function TodayHeader({
  today,
  ladder,
}: {
  today: TodaySummary;
  ladder: RampStep[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const warmth = useCountUp(today.avgWarmth, 0, inView);
  const sent = useCountUp(today.sentToday, 0, inView);
  const sentPct = Math.round((today.sentToday / today.sentTarget) * 100);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-text">
              Warmup journey
            </h1>
            <p className="text-xs text-text-dim">{today.dateLabel}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent3/30 bg-accent3/10 px-2.5 py-1 text-xs font-medium text-accent3">
          <Sparkles className="h-3 w-3" />
          Pro Plus
        </span>
      </div>

      {/* Today ribbon — four inline figures divided by hairlines */}
      <div
        ref={ref}
        className="mt-4 grid grid-cols-2 divide-x divide-y divide-border-muted overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl sm:grid-cols-4 sm:divide-y-0"
      >
        <RibbonCell
          Icon={Mail}
          label="Mailboxes"
          value={`${today.warmingCount}/${today.mailboxCount}`}
          sub="warming now"
        />
        <RibbonCell
          Icon={Gauge}
          label="Avg warmth"
          value={String(Math.round(warmth))}
          sub={`+${today.warmthDelta} this week`}
          accent
        />
        <RibbonCell
          Icon={TrendingUp}
          label="Sends today"
          value={String(Math.round(sent))}
          sub={`${sentPct}% of ${today.sentTarget}`}
        />
        <RibbonCell
          Icon={Flag}
          label="Journey day"
          value={String(today.dayInJourney)}
          sub="steady state"
        />
      </div>

      {/* Ramp ladder as a slim progress strip — the journey's roadmap */}
      <div className="mt-3 flex items-stretch gap-1.5">
        {ladder.map((step, i) => (
          <motion.div
            key={step.label}
            initial={{ opacity: 0, scaleX: 0.6 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{
              duration: 0.45,
              ease: 'easeOut',
              delay: 0.15 + i * 0.06,
            }}
            className={`flex-1 origin-left rounded-lg border px-2.5 py-2 ${
              step.current
                ? 'border-accent/40 bg-accent/10'
                : step.done
                  ? 'border-border-muted bg-surface-2/60'
                  : 'border-dashed border-border-muted bg-transparent'
            }`}
            title={`${step.range} · ${step.target} sends/day`}
          >
            <p
              className={`text-[11px] font-semibold tabular-nums ${
                step.current
                  ? 'text-accent'
                  : step.done
                    ? 'text-text'
                    : 'text-text-dim'
              }`}
            >
              {step.label}
            </p>
            <p className="text-[10px] tabular-nums text-text-dim">
              {step.target}/day
            </p>
          </motion.div>
        ))}
      </div>
    </motion.header>
  );
}

function RibbonCell({
  Icon,
  label,
  value,
  sub,
  accent,
}: {
  Icon: typeof Mail;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3.5">
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-dim">
        <Icon className={`h-3.5 w-3.5 ${accent ? 'text-accent' : ''}`} />
        {label}
      </span>
      <span
        className={`text-2xl font-semibold tabular-nums leading-none ${
          accent ? 'text-accent' : 'text-text'
        }`}
      >
        {value}
      </span>
      <span className="text-[11px] text-text-dim">{sub}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The spine — a single animated gradient line that draws top→bottom
// ---------------------------------------------------------------------------

function Spine() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.05 });
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute bottom-2 left-[14px] top-2 w-px sm:left-[18px]"
    >
      {/* faint static track so the rail reads even before the draw */}
      <div className="absolute inset-0 bg-border-muted/60" />
      {/* the animated draw — scales from the top down */}
      <motion.div
        className="absolute inset-x-0 top-0 origin-top"
        style={{
          height: '100%',
          background: `linear-gradient(to bottom, ${HEX.accent}, ${HEX.accent2} 55%, ${HEX.accent4})`,
        }}
        initial={{ scaleY: 0 }}
        animate={inView ? { scaleY: 1 } : {}}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// A single dated node threaded off the spine
// ---------------------------------------------------------------------------

function TimelineNode({
  node,
  index,
  isLast,
}: {
  node: JourneyNode;
  index: number;
  isLast: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const isFuture = node.kind === 'next';
  const isNow = node.kind === 'now';

  return (
    <li ref={ref} className="relative pl-10 sm:pl-14">
      {/* Marker pinned onto the spine */}
      <motion.span
        className={`absolute left-0 top-3 grid h-[30px] w-[30px] place-items-center rounded-full border bg-bg sm:left-1 ${TONE_BORDER[node.tone]} ${TONE_TEXT[node.tone]}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={inView ? { scale: 1, opacity: 1 } : {}}
        transition={{
          duration: 0.4,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.05 + index * 0.04,
        }}
      >
        {isNow && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: `${TONE_HEX[node.tone]}55` }}
          />
        )}
        <node.Icon className="relative h-3.5 w-3.5" />
      </motion.span>

      {/* Event card offset to the right of the spine */}
      <motion.div
        initial={{ opacity: 0, x: 18 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{
          duration: 0.5,
          ease: [0.22, 1, 0.36, 1],
          delay: 0.1 + index * 0.04,
        }}
        className={`mb-5 rounded-2xl border bg-surface/60 p-4 backdrop-blur-xl transition-colors sm:p-5 ${
          isNow
            ? 'border-accent/30'
            : isFuture
              ? 'border-dashed border-border-muted'
              : 'border-border-muted hover:border-accent/30'
        } ${isLast ? 'mb-0' : ''}`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs font-semibold tabular-nums text-text-dim">
            {node.date}
          </span>
          <span className="text-border-muted">·</span>
          <span className="text-xs tabular-nums text-text-dim">
            {isFuture ? `~Day ${node.day}` : `Day ${node.day}`}
          </span>
          <span
            className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TONE_BORDER[node.tone]} ${TONE_BG_SOFT[node.tone]} ${TONE_TEXT[node.tone]}`}
          >
            {KIND_LABEL[node.kind]}
          </span>
        </div>

        <h3 className="mt-2 text-[15px] font-semibold leading-snug text-text">
          {node.title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-text-dim">
          {node.detail}
        </p>

        {node.chart !== 'none' && (
          <div className="mt-3 border-t border-white/5 pt-3">
            <NodeChart node={node} animate={inView} />
          </div>
        )}
      </motion.div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Inline micro-charts — each sized to its node, fixed-height parents only
// ---------------------------------------------------------------------------

function NodeChart({
  node,
  animate,
}: {
  node: JourneyNode;
  animate: boolean;
}) {
  const color = TONE_HEX[node.tone];
  const data = useMemo(
    () => (node.series ?? []).map((v, i) => ({ i, v })),
    [node.series],
  );

  if (node.chart === 'stat') {
    return (
      <div className="flex items-end justify-between">
        <span className="text-[11px] uppercase tracking-wider text-text-dim">
          {node.statCaption}
        </span>
        <span
          className="text-2xl font-semibold tabular-nums leading-none"
          style={{ color }}
        >
          {node.statValue}
        </span>
      </div>
    );
  }

  if (node.chart === 'bars') {
    return (
      <div className="h-[44px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
            <Bar
              dataKey="v"
              fill={color}
              radius={[2, 2, 0, 0]}
              maxBarSize={14}
              isAnimationActive={animate}
              animationDuration={900}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (node.chart === 'area') {
    const gid = `n1-area-${node.id}`;
    return (
      <div className="h-[52px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gid})`}
              dot={false}
              isAnimationActive={animate}
              animationDuration={1100}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // 'spark'
  return (
    <div className="h-[40px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            dot={false}
            isAnimationActive={animate}
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Keep these icon imports stable across refactors (referenced via node meta).
void [ArrowUpRight, Star];

export default ProPlusDashN1Timeline;
