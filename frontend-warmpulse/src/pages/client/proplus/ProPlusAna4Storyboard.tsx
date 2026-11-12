import { useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Flag,
  Gauge,
  Inbox,
  Lightbulb,
  MailOpen,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';

/**
 * ProPlusAna4Storyboard — STANDALONE Pro-Plus "Analytics" section for the
 * isolated preview harness.
 *
 * Concept: an ANNOTATED DATA STORYBOARD. Not a dashboard, not a pivot, not a
 * scorecard, not a versus split. The page reads top-to-bottom like a written
 * case-study: a vertical narrative spine (numbered milestone rail on the left)
 * threads through four "chapters". Each chapter pairs a short narrative with
 * one large trend chart whose specific datapoints are pinned with CALLOUT
 * MARKERS (annotated dots + reference lines that pop in sequentially once the
 * chart has drawn). It closes with a "Key takeaways" insight list.
 *
 * Fully standalone: no router / query / fetch / props. All numbers are the
 * inline MOCK below (Pro Plus framing — 15 mailboxes). Renders ONLY page
 * content; the harness supplies nav + chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Tone = 'good' | 'warn' | 'bad' | 'info';

interface Marker {
  /** Index into the chapter's series array the callout pins to. */
  dayIndex: number;
  /** Which series key the dot rides on (must exist on the row). */
  on: string;
  label: string;
  tone: Tone;
}

interface WarmthRow extends Record<string, unknown> {
  day: number;
  date: string;
  warmth: number;
}

interface PlacementRow extends Record<string, unknown> {
  day: number;
  date: string;
  inbox: number;
  promotions: number;
  spam: number;
}

interface EngagementRow extends Record<string, unknown> {
  day: number;
  date: string;
  opens: number;
  replies: number;
}

interface ReputationRow extends Record<string, unknown> {
  day: number;
  date: string;
  reputation: number;
}

interface Chapter {
  no: number;
  eyebrow: string;
  title: string;
  Icon: typeof Gauge;
  /** 1–2 sentence narrative shown beside the chart. */
  narrative: string;
  /** Pull-stat shown under the narrative. */
  statLabel: string;
  statValue: string;
  statDelta: number;
  statTone: Tone;
}

interface Takeaway {
  Icon: typeof CheckCircle2;
  tone: Tone;
  title: string;
  body: string;
}

interface StoryboardMock {
  mailboxCount: number;
  activeCount: number;
  windowDays: number;
  warmth: WarmthRow[];
  warmthMarkers: Marker[];
  placement: PlacementRow[];
  placementMarkers: Marker[];
  engagement: EngagementRow[];
  engagementMarkers: Marker[];
  reputation: ReputationRow[];
  reputationMarkers: Marker[];
  chapters: [Chapter, Chapter, Chapter, Chapter];
  takeaways: Takeaway[];
}

// ---------------------------------------------------------------------------
// Mock builders — a deliberate 30-day NARRATIVE (ramp → wobble → recover)
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function dayLabel(dayIndex: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - (29 - dayIndex));
  return formatDate(d);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Warmth ramp scripted to the ladder: a flat-ish D1–7 base, a clear step at
 * D8 and D15 (ramp advances), a brief D19–21 dip (the Outlook wobble), then a
 * confident recovery into the high-80s.
 */
function buildWarmth(): WarmthRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    let w: number;
    if (day <= 7) w = 41 + day * 1.4;
    else if (day <= 14) w = 52 + (day - 7) * 2.1;
    else if (day <= 18) w = 67 + (day - 14) * 2.4;
    else if (day <= 21) w = 77 - (day - 18) * 1.9; // the dip
    else w = 71.3 + (day - 21) * 2.05;
    return {
      day,
      date: dayLabel(i),
      warmth: Math.round(Math.max(0, Math.min(100, w + Math.sin(i * 0.7) * 0.7))),
    };
  });
}

/**
 * Placement: inbox climbs, then a D19 spam spike (Outlook tightened) that the
 * spam-rescue engine claws back over the next several days.
 */
function buildPlacement(): PlacementRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const t = i / 29;
    let spam = Math.max(1.2, 8.5 - t * 6.4 + Math.sin(i * 0.9) * 0.4);
    if (day >= 18 && day <= 22) spam += (5 - Math.abs(day - 19)) * 1.35; // spike + decay
    const promotions = Math.max(2.4, 8.2 - t * 4.1 + Math.cos(i * 0.8) * 0.5);
    const inbox = Math.max(0, 100 - spam - promotions);
    return {
      day,
      date: dayLabel(i),
      inbox: r1(inbox),
      promotions: r1(promotions),
      spam: r1(spam),
    };
  });
}

/** Engagement arc: opens & replies climb with warmth, both notch up post-D15. */
function buildEngagement(): EngagementRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const t = i / 29;
    const lift = day > 15 ? 4 : 0;
    return {
      day,
      date: dayLabel(i),
      opens: Math.round(48 + t * 26 + lift + Math.sin(i * 0.8) * 1.6),
      replies: Math.round(14 + t * 16 + lift * 0.6 + Math.cos(i * 0.7) * 1.1),
    };
  });
}

/** Reputation: the dip-and-recover spine — D17 SPF drift, D20 fix, full heal. */
function buildReputation(): ReputationRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    let rep: number;
    if (day <= 16) rep = 72 + day * 1.05;
    else if (day <= 20) rep = 88.8 - (day - 16) * 3.4; // SPF drift drags it down
    else rep = 75.2 + (day - 20) * 1.7; // DNS fixed → heal
    return {
      day,
      date: dayLabel(i),
      reputation: Math.round(Math.max(0, Math.min(100, rep + Math.sin(i * 0.6) * 0.6))),
    };
  });
}

const MOCK: StoryboardMock = {
  mailboxCount: 15,
  activeCount: 14,
  windowDays: 30,
  warmth: buildWarmth(),
  warmthMarkers: [
    { dayIndex: 7, on: 'warmth', label: 'Build-up D8 — 10/day', tone: 'info' },
    { dayIndex: 14, on: 'warmth', label: 'Build-up D15 — 20/day', tone: 'good' },
    { dayIndex: 19, on: 'warmth', label: 'Outlook wobble', tone: 'warn' },
    { dayIndex: 29, on: 'warmth', label: 'Peak — 88', tone: 'good' },
  ],
  placement: buildPlacement(),
  placementMarkers: [
    { dayIndex: 18, on: 'spam', label: 'Spam spike 7.1%', tone: 'bad' },
    { dayIndex: 21, on: 'spam', label: 'Spam recovery engaged', tone: 'info' },
    { dayIndex: 29, on: 'inbox', label: 'Inbox 94.8%', tone: 'good' },
  ],
  engagement: buildEngagement(),
  engagementMarkers: [
    { dayIndex: 15, on: 'opens', label: 'Post-D15 lift', tone: 'good' },
    { dayIndex: 29, on: 'replies', label: 'Reply 30%', tone: 'good' },
  ],
  reputation: buildReputation(),
  reputationMarkers: [
    { dayIndex: 16, on: 'reputation', label: 'SPF drift detected', tone: 'warn' },
    { dayIndex: 17, on: 'reputation', label: 'Trough — 72', tone: 'bad' },
    { dayIndex: 19, on: 'reputation', label: 'DNS fixed', tone: 'info' },
    { dayIndex: 29, on: 'reputation', label: 'Fully recovered', tone: 'good' },
  ],
  chapters: [
    {
      no: 1,
      eyebrow: 'Chapter one',
      title: 'The build-up story',
      Icon: Gauge,
      narrative:
        'Across the first week the workspace held a cautious base while the helper network seeded sender trust. Day 8 and Day 15 stepped the ladder to 10 and 20 sends/day — warmth climbed in clean increments, dipping only briefly during the Day 19 Outlook wobble before pushing to a 30-day peak of 88.',
      statLabel: '30-day warmth gain',
      statValue: '+47 pts',
      statDelta: 47,
      statTone: 'good',
    },
    {
      no: 2,
      eyebrow: 'Chapter two',
      title: 'The where-emails-land journey',
      Icon: Inbox,
      narrative:
        'Inbox share trended up steadily until a Day 19 spam spike to 7.1% — Outlook tightened its filters mid-build-up. The spam-recovery engine engaged within two days, clawing flagged mail back to the inbox; landing closed the window at 94.8% inbox with spam back under 1.5%.',
      statLabel: 'Final inbox landing',
      statValue: '94.8%',
      statDelta: 6.2,
      statTone: 'good',
    },
    {
      no: 3,
      eyebrow: 'Chapter three',
      title: 'The opens & replies arc',
      Icon: MailOpen,
      narrative:
        'Opens and replies tracked warmth closely. The Day 15 ladder step produced a visible lift in both curves — recipients on the larger volume kept engaging rather than tuning out — and reply rate finished the month at a healthy 30%.',
      statLabel: 'Reply rate (end of window)',
      statValue: '30%',
      statDelta: 9,
      statTone: 'good',
    },
    {
      no: 4,
      eyebrow: 'Chapter four',
      title: 'Sender-trust recovery',
      Icon: ShieldCheck,
      narrative:
        'A Day 17 SPF-record drift dragged sender trust from 89 down to a Day 17 trough of 72. Domain records (DNS) were corrected on Day 20; sender trust healed in a straight line back to the high-80s within the week — no lasting damage to the warmup curve.',
      statLabel: 'Recovered to',
      statValue: '92',
      statDelta: 20,
      statTone: 'good',
    },
  ],
  takeaways: [
    {
      Icon: TrendingUp,
      tone: 'good',
      title: 'Build-up discipline paid off',
      body: 'Stepping volume on the ladder (never ahead of it) kept warmth monotonic — even the Outlook wobble cost under 4 points and self-corrected.',
    },
    {
      Icon: ShieldCheck,
      tone: 'info',
      title: 'The recovery engine earned its keep',
      body: 'The Day 19 spam spike was reversed inside 48 hours by automated spam recovery — no manual intervention, no inbox-share cliff.',
    },
    {
      Icon: Flag,
      tone: 'warn',
      title: 'Watch your domain records (DNS) during build-up',
      body: 'The single biggest dip this month was an SPF drift, not warmup mechanics. A domain records (DNS) check on connect would have caught it before Day 17.',
    },
    {
      Icon: Sparkles,
      tone: 'good',
      title: 'Opens & replies followed warmth',
      body: 'Opens and replies rose with volume rather than diluting — a strong signal the 15-mailbox group can absorb the next ladder step.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Tone → token maps (existing Tailwind tokens only)
// ---------------------------------------------------------------------------

const TONE_HEX: Record<Tone, string> = {
  // Resolve the same CSS custom properties the Tailwind tokens use so recharts
  // (which needs concrete colours) stays on-palette without new colours.
  good: 'var(--color-accent, #34d399)',
  warn: 'var(--color-accent4, #fbbf24)',
  bad: 'var(--color-accent3, #fb923c)',
  info: 'var(--color-accent2, #FF9670)',
};

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-accent',
  warn: 'text-accent4',
  bad: 'text-accent3',
  info: 'text-accent2',
};

const TONE_BADGE: Record<Tone, 'green' | 'yellow' | 'orange' | 'blue'> = {
  good: 'green',
  warn: 'yellow',
  bad: 'orange',
  info: 'blue',
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const fmtPct = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
};
const fmtInt = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : '—';
};

// ---------------------------------------------------------------------------
// Shared chart chrome
// ---------------------------------------------------------------------------

const AXIS = '#6b7280';
const GRID = 'rgba(148,163,184,0.14)';

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string | number;
  unit: 'pct' | 'int';
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <p className="mb-1 font-medium text-text">{String(label)}</p>
      <ul className="space-y-0.5">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center gap-2 text-text-dim">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            <span className="capitalize">{p.name}</span>
            <span className="ml-auto font-medium tabular-nums text-text">
              {unit === 'pct' ? fmtPct(p.value) : fmtInt(p.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Renders ReferenceLine + ReferenceDot callouts that fade/scale in one after
 * another once `armed` flips true (the chart has finished its draw-in tween).
 * recharts children can't be framer `motion` elements, so the staged reveal is
 * done by gating each marker on a timed `visibleCount` and animating the SVG
 * `<g>` opacity via CSS transition.
 */
function buildMarkers<T extends Record<string, unknown>>(
  rows: T[],
  markers: Marker[],
  visibleCount: number,
): JSX.Element[] {
  const nodes: JSX.Element[] = [];
  markers.forEach((m, idx) => {
    const row = rows[m.dayIndex];
    if (!row) return;
    const x = row.day as number;
    const y = row[m.on] as number;
    const hex = TONE_HEX[m.tone];
    const shown = idx < visibleCount;
    const above = y < 55; // place the label box away from the curve edge

    nodes.push(
      <ReferenceLine
        key={`vl-${idx}`}
        x={x}
        stroke={hex}
        strokeDasharray="2 5"
        strokeOpacity={shown ? 0.35 : 0}
        ifOverflow="extendDomain"
        style={{ transition: 'stroke-opacity 320ms ease' }}
      />,
    );
    nodes.push(
      <ReferenceDot
        key={`rd-${idx}`}
        x={x}
        y={y}
        r={shown ? 5 : 0}
        fill={hex}
        stroke="var(--color-bg, #0b0b12)"
        strokeWidth={2}
        isFront
        style={{ transition: 'r 280ms cubic-bezier(.34,1.56,.64,1)' }}
      >
        <Label
          value={m.label}
          position={above ? 'top' : 'bottom'}
          offset={12}
          style={{
            fill: hex,
            fontSize: 11,
            fontWeight: 600,
            opacity: shown ? 1 : 0,
            transition: 'opacity 320ms ease 80ms',
          }}
        />
      </ReferenceDot>,
    );
  });
  return nodes;
}

// ---------------------------------------------------------------------------
// Chapter block — the narrative spine unit
// ---------------------------------------------------------------------------

function ChapterBlock({
  chapter,
  flip,
  children,
}: {
  chapter: Chapter;
  /** Alternate chart/prose sides so the spine zig-zags. */
  flip: boolean;
  /** Render-prop: receives `armed` once the chapter has scrolled into view. */
  children: (armed: boolean) => JSX.Element;
}): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const DeltaIcon = chapter.statDelta >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <section
      ref={ref}
      className="relative grid grid-cols-1 gap-6 pb-14 lg:grid-cols-[1fr_minmax(0,1.35fr)]"
    >
      {/* Spine node — pinned milestone number on the rail */}
      <div className="absolute left-[-2.05rem] top-1 hidden lg:block">
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={inView ? { scale: 1, opacity: 1 } : {}}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border-muted bg-surface text-sm font-semibold text-accent shadow-sm"
        >
          {chapter.no}
        </motion.span>
      </div>

      {/* Narrative column */}
      <motion.div
        initial={{ opacity: 0, x: flip ? 24 : -24 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className={`flex flex-col justify-center ${
          flip ? 'lg:order-2 lg:pl-2' : 'lg:order-1'
        }`}
      >
        <span className="mb-2 inline-flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-dim">
          <chapter.Icon className="h-3.5 w-3.5 text-accent" />
          {chapter.eyebrow}
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          {chapter.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-text-dim">
          {chapter.narrative}
        </p>
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border-muted bg-surface/60 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wide text-text-dim">
              {chapter.statLabel}
            </span>
            <span className="text-xl font-semibold tabular-nums text-text">
              {chapter.statValue}
            </span>
          </div>
          <span
            className={`ml-auto inline-flex items-center gap-1 text-sm font-medium ${TONE_TEXT[chapter.statTone]}`}
          >
            <DeltaIcon className="h-4 w-4" />
            {Math.abs(chapter.statDelta)}
          </span>
        </div>
      </motion.div>

      {/* Chart column */}
      <motion.div
        initial={{ opacity: 0, y: 26 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.12 }}
        className={`rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl ${
          flip ? 'lg:order-1' : 'lg:order-2'
        }`}
      >
        {children(inView)}
      </motion.div>
    </section>
  );
}

/**
 * Drives the staged callout reveal: starts at 0, then advances one marker at a
 * time on a timer once `armed` (chart in view + draw tween elapsed).
 */
function useStagedMarkers(
  armed: boolean,
  total: number,
  chartDrawMs = 950,
  stepMs = 360,
): number {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  if (armed && !started.current) {
    started.current = true;
    for (let i = 1; i <= total; i++) {
      window.setTimeout(() => setCount((c) => Math.max(c, i)), chartDrawMs + i * stepMs);
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Chapter charts
// ---------------------------------------------------------------------------

function WarmthChapterChart({ armed }: { armed: boolean }): JSX.Element {
  const n = useStagedMarkers(armed, MOCK.warmthMarkers.length);
  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={MOCK.warmth} margin={{ top: 28, right: 20, bottom: 4, left: -8 }}>
          <defs>
            <linearGradient id="ana4-warmth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TONE_HEX.good} stopOpacity={0.32} />
              <stop offset="100%" stopColor={TONE_HEX.good} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            interval={4}
          />
          <YAxis
            domain={[30, 100]}
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip unit="int" />}
            cursor={{ stroke: AXIS, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="warmth"
            stroke={TONE_HEX.good}
            strokeWidth={2.4}
            fill="url(#ana4-warmth)"
            isAnimationActive={armed}
            animationDuration={900}
            animationEasing="ease-out"
            dot={false}
          />
          {buildMarkers(MOCK.warmth, MOCK.warmthMarkers, n)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlacementChapterChart({ armed }: { armed: boolean }): JSX.Element {
  const n = useStagedMarkers(armed, MOCK.placementMarkers.length);
  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={MOCK.placement}
          stackOffset="none"
          margin={{ top: 28, right: 20, bottom: 4, left: -8 }}
        >
          <defs>
            <linearGradient id="ana4-inbox" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TONE_HEX.good} stopOpacity={0.3} />
              <stop offset="100%" stopColor={TONE_HEX.good} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            interval={4}
          />
          <YAxis
            domain={[0, 100]}
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip unit="pct" />}
            cursor={{ stroke: AXIS, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="inbox"
            stackId="p"
            stroke={TONE_HEX.good}
            strokeWidth={2}
            fill="url(#ana4-inbox)"
            isAnimationActive={armed}
            animationDuration={900}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="promotions"
            stackId="p"
            stroke={TONE_HEX.warn}
            strokeWidth={1.5}
            fill={TONE_HEX.warn}
            fillOpacity={0.14}
            isAnimationActive={armed}
            animationDuration={900}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="spam"
            stackId="p"
            stroke={TONE_HEX.bad}
            strokeWidth={1.5}
            fill={TONE_HEX.bad}
            fillOpacity={0.18}
            isAnimationActive={armed}
            animationDuration={900}
            dot={false}
          />
          {buildMarkers(MOCK.placement, MOCK.placementMarkers, n)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function EngagementChapterChart({ armed }: { armed: boolean }): JSX.Element {
  const n = useStagedMarkers(armed, MOCK.engagementMarkers.length);
  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={MOCK.engagement} margin={{ top: 28, right: 20, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            interval={4}
          />
          <YAxis
            domain={[0, 90]}
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip unit="int" />}
            cursor={{ stroke: AXIS, strokeDasharray: '3 3' }}
          />
          <Line
            type="monotone"
            dataKey="opens"
            stroke={TONE_HEX.info}
            strokeWidth={2.4}
            isAnimationActive={armed}
            animationDuration={900}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="replies"
            stroke={TONE_HEX.good}
            strokeWidth={2.4}
            isAnimationActive={armed}
            animationDuration={900}
            dot={false}
          />
          {buildMarkers(MOCK.engagement, MOCK.engagementMarkers, n)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReputationChapterChart({ armed }: { armed: boolean }): JSX.Element {
  const n = useStagedMarkers(armed, MOCK.reputationMarkers.length);
  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={MOCK.reputation}
          margin={{ top: 28, right: 20, bottom: 4, left: -8 }}
        >
          <defs>
            <linearGradient id="ana4-rep" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TONE_HEX.info} stopOpacity={0.3} />
              <stop offset="100%" stopColor={TONE_HEX.info} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            interval={4}
          />
          <YAxis
            domain={[60, 100]}
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip unit="int" />}
            cursor={{ stroke: AXIS, strokeDasharray: '3 3' }}
          />
          {/* The "healthy floor" the recovery climbs back above. */}
          <ReferenceLine
            y={85}
            stroke={AXIS}
            strokeDasharray="4 6"
            label={{
              value: 'healthy ≥ 85',
              position: 'insideTopRight',
              fill: AXIS,
              fontSize: 10,
            }}
          />
          <Area
            type="monotone"
            dataKey="reputation"
            stroke={TONE_HEX.info}
            strokeWidth={2.4}
            fill="url(#ana4-rep)"
            isAnimationActive={armed}
            animationDuration={900}
            dot={false}
          />
          {buildMarkers(MOCK.reputation, MOCK.reputationMarkers, n)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Takeaways
// ---------------------------------------------------------------------------

function TakeawaysSection(): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });
  return (
    <section ref={ref} className="relative pb-4">
      <div className="absolute left-[-2.05rem] top-1 hidden lg:block">
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={inView ? { scale: 1, opacity: 1 } : {}}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-surface text-accent shadow-sm"
        >
          <Lightbulb className="h-4 w-4" />
        </motion.span>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
      >
        <span className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-dim">
          <BookOpen className="h-3.5 w-3.5 text-accent" />
          Epilogue
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          Key takeaways
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-text-dim">
          What the 30-day story tells us about this {MOCK.mailboxCount}-mailbox
          workspace — and where to point attention next.
        </p>
      </motion.div>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MOCK.takeaways.map((t, i) => (
          <motion.li
            key={t.title}
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.15 + i * 0.1, ease: 'easeOut' }}
            className="flex gap-3 rounded-xl border border-border-muted bg-surface/60 p-4"
          >
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-muted bg-surface-2 ${TONE_TEXT[t.tone]}`}
            >
              <t.Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text">{t.title}</p>
                <Badge variant={TONE_BADGE[t.tone]} className="shrink-0">
                  {t.tone === 'good'
                    ? 'win'
                    : t.tone === 'warn'
                      ? 'watch'
                      : t.tone === 'bad'
                        ? 'risk'
                        : 'note'}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text-dim">{t.body}</p>
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProPlusAna4Storyboard(): JSX.Element {
  const [c1, c2, c3, c4] = MOCK.chapters;
  const peak = useMemo(
    () => Math.max(...MOCK.warmth.map((r) => r.warmth)),
    [],
  );

  return (
    <div className="space-y-8">
      {/* Cover */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="overflow-hidden rounded-2xl border border-border-muted bg-surface/60 p-6 backdrop-blur-xl sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2.5">
              <Badge variant="orange">
                <Sparkles className="h-3 w-3" />
                Pro Plus
              </Badge>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted px-2.5 py-0.5 text-xs text-text-dim">
                <BookOpen className="h-3 w-3 text-accent" />
                Analytics storyboard
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-text">
              A 30-day warmup story
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-text-dim">
              Not a dashboard — a narrative. Scroll through four chapters that
              walk the workspace from a cold start, through a mid-build-up Outlook
              wobble and an SPF scare, to a fully recovered, high-inbox-delivery
              finish across {MOCK.mailboxCount} mailboxes.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border-muted bg-border-muted text-center">
            {[
              { k: 'Window', v: `${MOCK.windowDays}d` },
              { k: 'Mailboxes', v: `${MOCK.activeCount}/${MOCK.mailboxCount}` },
              { k: 'Peak warmth', v: String(peak) },
            ].map((s) => (
              <div key={s.k} className="bg-surface px-4 py-3">
                <p className="text-lg font-semibold tabular-nums text-text">
                  {s.v}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-text-dim">
                  {s.k}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.header>

      {/* Narrative spine — the rail line + zig-zag chapters */}
      <div className="relative lg:pl-12">
        <div
          aria-hidden
          className="absolute left-[0.95rem] top-2 hidden h-full w-px bg-gradient-to-b from-accent/40 via-border-muted to-transparent lg:block"
        />

        <ChapterBlock chapter={c1} flip={false}>
          {(armed) => <WarmthChapterChart armed={armed} />}
        </ChapterBlock>

        <ChapterBlock chapter={c2} flip>
          {(armed) => <PlacementChapterChart armed={armed} />}
        </ChapterBlock>

        <ChapterBlock chapter={c3} flip={false}>
          {(armed) => <EngagementChapterChart armed={armed} />}
        </ChapterBlock>

        <ChapterBlock chapter={c4} flip>
          {(armed) => <ReputationChapterChart armed={armed} />}
        </ChapterBlock>

        <TakeawaysSection />
      </div>
    </div>
  );
}

export default ProPlusAna4Storyboard;
