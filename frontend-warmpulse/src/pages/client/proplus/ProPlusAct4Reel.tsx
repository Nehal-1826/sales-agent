import { useEffect, useMemo, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  Gauge,
  Inbox,
  Mail,
  MailOpen,
  Pause,
  Play,
  Radio,
  Reply as ReplyIcon,
  ShieldCheck,
  Star,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from 'recharts';
import { formatNumber } from '@/lib/format';

/**
 * ProPlusAct4Reel — STANDALONE Pro-Plus "Warmup Activity" section, built as a
 * broadcast-style **Activity Reel** for the isolated preview harness.
 *
 * Paradigm (deliberately distinct from every sibling):
 *   - Siblings A1/A2/A3 = timeline list, Slack channels, stacked-bar drilldown.
 *   - ProPlusActivity   = pulse strip + stacked bar + timeline feed.
 *   - This file          = a big-screen NOC / sports-highlight reel:
 *       1. A rotating HERO HEADLINE carousel — one hero "moment" at a time,
 *          giant animated count-up number, auto-advancing on an interval,
 *          progress pips, play/pause, click-to-jump. No list, no chart here.
 *       2. A continuous news-style LIVE TICKER — infinite x-translate marquee
 *          of the ~20 most recent events. Not a scrollable feed; it moves.
 *       3. A row of 4 "odometer" STAT tiles — value tweens on mount, one
 *          carries a tiny fixed-height sparkline.
 *
 * Fully standalone: no router/query/fetch/props. All data is the inline MOCK.
 * Renders ONLY page content; the harness supplies nav + shell. Pro Plus
 * framing: 15 mailboxes, busy account.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type ActivityAction =
  | 'sent'
  | 'opened'
  | 'replied'
  | 'starred'
  | 'spam_rescued';

interface Highlight {
  id: string;
  /** Eyebrow kicker, e.g. "LAST HOUR". */
  kicker: string;
  /** The big animated number. */
  value: number;
  /** Optional suffix rendered after the number ("%", "/hr"…). */
  suffix?: string;
  /** Headline line under the number. */
  headline: string;
  /** Supporting sentence. */
  detail: string;
  /** Tone drives the accent (tokens only). */
  tone: 'accent' | 'accent3' | 'accent4';
  Icon: typeof Mail;
  /** Tiny shape behind the number — 12 normalized bars (0..1). */
  spark: number[];
}

interface TickerEvent {
  id: string;
  action: ActivityAction;
  mailbox: string;
  peer: string;
  /** Minutes ago (for the "Nm" stamp). */
  ago: number;
}

interface OdometerStat {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  /** Period-over-period delta in %, signed. */
  delta: number;
  Icon: typeof Mail;
  tone: 'accent' | 'accent3' | 'accent4';
  /** Optional sparkline series (only one tile uses it). */
  series?: { i: number; v: number }[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro Plus numbers (15 mailboxes, busy account)
// ---------------------------------------------------------------------------

const MAILBOXES = [
  'founder@acme.io',
  'sales@acme.io',
  'success@acme.io',
  'growth@acme.io',
  'partnerships@acme.co',
  'hello@acme.co',
  'team@acme.co',
];

const PEERS = [
  'mara.holt@brightlane.net',
  'devon.pace@meridianloop.com',
  'priya.nair@northcove.io',
  'liam.frost@cedarpeak.co',
  'noor.aziz@harborline.net',
  'theo.vance@quillstack.com',
  'aria.bose@lumenfield.io',
  'kai.romero@driftwave.co',
];

const HIGHLIGHTS: Highlight[] = [
  {
    id: 'h-hour',
    kicker: 'LAST 60 MINUTES',
    value: 142,
    suffix: ' sent',
    headline: 'Peak send volume across the network',
    detail: 'All 15 mailboxes in-window — engine running hot and steady.',
    tone: 'accent',
    Icon: Mail,
    spark: [0.4, 0.5, 0.45, 0.6, 0.7, 0.65, 0.8, 0.78, 0.9, 0.85, 0.95, 1],
  },
  {
    id: 'h-replies',
    kicker: 'TODAY · BEST THIS WEEK',
    value: 27,
    suffix: ' replies',
    headline: 'Replies just set a 7-day high',
    detail: 'Inbound helper replies up 38% versus the trailing daily average.',
    tone: 'accent4',
    Icon: ReplyIcon,
    spark: [0.3, 0.35, 0.3, 0.5, 0.45, 0.6, 0.55, 0.7, 0.75, 0.8, 0.9, 1],
  },
  {
    id: 'h-rescue',
    kicker: 'SPAM RECOVERY',
    value: 4,
    suffix: ' saved',
    headline: 'Pulled growth@acme.io out of the spam folder',
    detail: '4 warmup sends recovered in the last hour — sender trust protected.',
    tone: 'accent3',
    Icon: ShieldCheck,
    spark: [0.2, 0.25, 0.2, 0.3, 0.28, 0.4, 0.5, 0.45, 0.6, 0.7, 0.85, 1],
  },
  {
    id: 'h-peak',
    kicker: 'PEAK HOUR',
    value: 14,
    suffix: ':00',
    headline: '38 opens & replies landed at 14:00',
    detail: 'Busiest window of the day — opens, replies and stars combined.',
    tone: 'accent',
    Icon: Activity,
    spark: [0.5, 0.4, 0.55, 0.6, 0.7, 0.85, 1, 0.9, 0.75, 0.6, 0.5, 0.45],
  },
  {
    id: 'h-open',
    kicker: 'OPEN RATE · 24H',
    value: 72,
    suffix: '%',
    headline: 'Healthy open rate sustained for 24 hours',
    detail: '121 opens on 168 sends — well above the inbox-delivery floor.',
    tone: 'accent4',
    Icon: MailOpen,
    spark: [0.6, 0.62, 0.65, 0.63, 0.68, 0.7, 0.72, 0.71, 0.73, 0.74, 0.72, 0.75],
  },
  {
    id: 'h-streak',
    kicker: 'CONSISTENCY STREAK',
    value: 18,
    suffix: ' days',
    headline: 'Every mailbox hit its daily target',
    detail: '18 straight days on schedule — zero stalled mailboxes today.',
    tone: 'accent3',
    Icon: Trophy,
    spark: [0.7, 0.72, 0.75, 0.78, 0.8, 0.82, 0.85, 0.88, 0.9, 0.93, 0.96, 1],
  },
];

/** Deterministic ~20-event ticker (most recent first). */
function buildTicker(): TickerEvent[] {
  const ACTIONS: ActivityAction[] = [
    'sent',
    'opened',
    'replied',
    'sent',
    'starred',
    'opened',
    'spam_rescued',
    'sent',
    'replied',
    'opened',
  ];
  return Array.from({ length: 20 }, (_, i) => ({
    id: `tk-${i}`,
    action: ACTIONS[i % ACTIONS.length]!,
    mailbox: MAILBOXES[i % MAILBOXES.length]!,
    peer: PEERS[(i * 3) % PEERS.length]!,
    ago: 1 + i * 2 + ((i * 7) % 5),
  }));
}

const TICKER: TickerEvent[] = buildTicker();

const ODOMETERS: OdometerStat[] = [
  {
    id: 'od-events',
    label: 'Events · 24h',
    value: 1284,
    delta: 12.4,
    Icon: Activity,
    tone: 'accent',
    series: Array.from({ length: 16 }, (_, i) => ({
      i,
      v: Math.round(40 + 30 * Math.sin(i / 2.4) + (i % 3) * 6),
    })),
  },
  {
    id: 'od-throughput',
    label: 'Throughput',
    value: 58,
    suffix: '/hr',
    delta: 8.1,
    Icon: Zap,
    tone: 'accent4',
  },
  {
    id: 'od-reply',
    label: 'Reply rate',
    value: 28,
    suffix: '%',
    delta: 3.6,
    Icon: ReplyIcon,
    tone: 'accent3',
  },
  {
    id: 'od-active',
    label: 'Active mailboxes',
    value: 15,
    suffix: '/15',
    delta: 0,
    Icon: Mail,
    tone: 'accent',
  },
];

// ---------------------------------------------------------------------------
// Tone → utility class maps (tokens only)
// ---------------------------------------------------------------------------

const TONE_TEXT: Record<Highlight['tone'], string> = {
  accent: 'text-accent',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
};

const TONE_BAR: Record<Highlight['tone'], string> = {
  accent: 'bg-accent',
  accent3: 'bg-accent3',
  accent4: 'bg-accent4',
};

const TONE_HEX: Record<Highlight['tone'], string> = {
  // Matches tailwind tokens: accent=#F26522, accent3=#ff6b4a, accent4=#ffd54f.
  accent: '#F26522',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
};

const ACTION_LABEL: Record<ActivityAction, string> = {
  sent: 'Sent',
  opened: 'Opened',
  replied: 'Replied',
  starred: 'Starred',
  spam_rescued: 'Rescued',
};

const ACTION_ICON: Record<ActivityAction, typeof Mail> = {
  sent: Mail,
  opened: MailOpen,
  replied: ReplyIcon,
  starred: Star,
  spam_rescued: ShieldCheck,
};

const ACTION_TONE: Record<ActivityAction, Highlight['tone']> = {
  sent: 'accent',
  opened: 'accent',
  replied: 'accent4',
  starred: 'accent4',
  spam_rescued: 'accent3',
};

const SLIDE_MS = 4200;

// ---------------------------------------------------------------------------
// Count-up number — springs from 0 → value whenever `value` changes.
// ---------------------------------------------------------------------------

function CountUp({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 70, damping: 18, mass: 1 });
  const text = useTransform(spring, (v) => formatNumber(Math.round(v)));

  useEffect(() => {
    mv.set(0);
    const id = window.setTimeout(() => mv.set(value), 30);
    return () => window.clearTimeout(id);
  }, [value, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}

// ---------------------------------------------------------------------------
// Hero headline slide
// ---------------------------------------------------------------------------

const slideVariants: Variants = {
  enter: { opacity: 0, y: 28, scale: 0.98 },
  center: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -22, scale: 0.98 },
};

function HeroSlide({ h }: { h: Highlight }) {
  const { Icon } = h;
  return (
    <motion.div
      key={h.id}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 ${TONE_TEXT[h.tone]}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span
          className={`text-xs font-semibold uppercase tracking-[0.22em] ${TONE_TEXT[h.tone]}`}
        >
          {h.kicker}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-baseline">
            <CountUp
              value={h.value}
              className={`text-6xl font-bold leading-none tabular-nums tracking-tight sm:text-7xl lg:text-8xl ${TONE_TEXT[h.tone]}`}
            />
            {h.suffix ? (
              <span className="ml-1 text-2xl font-semibold text-text-dim sm:text-3xl">
                {h.suffix}
              </span>
            ) : null}
          </div>
          <h2 className="mt-4 max-w-xl text-xl font-semibold leading-snug text-text sm:text-2xl">
            {h.headline}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-text-dim">{h.detail}</p>
        </div>

        {/* Decorative bar shape (NOT a chart) — animated in per slide. */}
        <div className="flex h-24 items-end gap-1.5">
          {h.spark.map((s, i) => (
            <motion.span
              key={i}
              className={`w-2.5 rounded-full ${TONE_BAR[h.tone]}`}
              style={{ opacity: 0.35 + s * 0.65 }}
              initial={{ height: 4 }}
              animate={{ height: 12 + s * 84 }}
              transition={{
                duration: 0.6,
                delay: 0.12 + i * 0.035,
                ease: 'easeOut',
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Live ticker row item
// ---------------------------------------------------------------------------

function TickerItem({ e }: { e: TickerEvent }) {
  const Icon = ACTION_ICON[e.action];
  const tone = ACTION_TONE[e.action];
  return (
    <span className="inline-flex items-center gap-2 px-5">
      <span className={`inline-flex items-center gap-1.5 ${TONE_TEXT[tone]}`}>
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wider">
          {ACTION_LABEL[e.action]}
        </span>
      </span>
      <span className="text-sm text-text">
        {e.mailbox.split('@')[0]}
      </span>
      <span className="text-text-dim">{e.action === 'sent' ? '→' : '←'}</span>
      <span className="text-sm text-text-dim">{e.peer.split('@')[0]}</span>
      <span className="text-xs tabular-nums text-text-dim">· {e.ago}m</span>
      <span aria-hidden className="px-3 text-border-muted">
        •
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Odometer stat tile
// ---------------------------------------------------------------------------

function OdometerTile({
  stat,
  index,
}: {
  stat: OdometerStat;
  index: number;
}) {
  const { Icon } = stat;
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 + index * 0.08, ease: 'easeOut' }}
      className="relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-xl border border-border-muted bg-surface p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-text-dim">
          {stat.label}
        </span>
        <span className={TONE_TEXT[stat.tone]}>
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <CountUp
          value={stat.value}
          className="text-3xl font-bold tabular-nums leading-none text-text"
        />
        {stat.suffix ? (
          <span className="text-sm font-medium text-text-dim">
            {stat.suffix}
          </span>
        ) : null}
      </div>

      {stat.series ? (
        <div className="h-9 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={stat.series}
              margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id={`od-fill-${stat.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={TONE_HEX[stat.tone]}
                    stopOpacity={0.45}
                  />
                  <stop
                    offset="100%"
                    stopColor={TONE_HEX[stat.tone]}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={TONE_HEX[stat.tone]}
                strokeWidth={2}
                fill={`url(#od-fill-${stat.id})`}
                isAnimationActive
                animationDuration={900}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs">
          {stat.delta === 0 ? (
            <span className="text-text-dim">no change · period over period</span>
          ) : (
            <>
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${
                  stat.delta > 0 ? 'text-accent' : 'text-accent3'
                }`}
              >
                <TrendingUp className="h-3 w-3" />
                {stat.delta > 0 ? '+' : ''}
                {stat.delta}%
              </span>
              <span className="text-text-dim">vs prior period</span>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusAct4Reel(): JSX.Element {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slides = HIGHLIGHTS;
  const active = slides[index]!;

  // Auto-advance the headline carousel. Interval is cleared on unmount and
  // re-armed whenever `paused`/`index` change so manual jumps reset the dwell.
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [paused, index, slides.length]);

  // Duplicate the ticker list so the -50% marquee loop is seamless.
  const tickerLoop = useMemo(() => [...TICKER, ...TICKER], []);

  return (
    <div className="space-y-5">
      {/* Header band */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Activity Reel
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-xs font-medium text-accent3">
              <Trophy className="h-3 w-3" />
              Pro Plus
            </span>
          </div>
          <p className="text-sm text-text-dim">
            Broadcast highlights from the helper network — 15 mailboxes, rolling
            24 hours.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3.5 py-1.5 text-xs text-text-dim">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">on air</span>
          <span className="text-border-muted">·</span>
          <span>helper network live</span>
        </div>
      </motion.header>

      {/* Hero headline carousel */}
      <motion.section
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45 }}
        className="relative h-[340px] overflow-hidden rounded-2xl border border-border-muted bg-surface sm:h-[360px]"
      >
        {/* Subtle ambient wash keyed to the active tone (token hex). */}
        <motion.div
          aria-hidden
          key={`wash-${active.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.14 }}
          transition={{ duration: 0.7 }}
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
          style={{ background: `radial-gradient(circle at center, ${TONE_HEX[active.tone]} 0%, transparent 72%)` }}
        />

        <AnimatePresence mode="wait">
          <HeroSlide key={active.id} h={active} />
        </AnimatePresence>

        {/* Top-right: live chip + play/pause */}
        <div className="absolute right-5 top-5 flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-border-muted bg-bg/60 px-2.5 py-1 text-xs text-text-dim backdrop-blur sm:inline-flex">
            <Radio className="h-3 w-3 text-accent3" />
            Highlight {index + 1} / {slides.length}
          </span>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Resume reel' : 'Pause reel'}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border-muted bg-bg/60 text-text-dim backdrop-blur transition-colors hover:text-text"
          >
            {paused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* Progress pips */}
        <div className="absolute bottom-5 left-6 flex items-center gap-2 sm:left-8">
          {slides.map((s, i) => {
            const isActive = i === index;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to highlight ${i + 1}`}
                aria-current={isActive}
                className="group relative h-1.5 overflow-hidden rounded-full bg-surface-2 transition-all"
                style={{ width: isActive ? 40 : 16 }}
              >
                {isActive ? (
                  <motion.span
                    key={`fill-${s.id}-${index}-${paused}`}
                    className={`absolute inset-y-0 left-0 rounded-full ${TONE_BAR[active.tone]}`}
                    initial={{ width: '0%' }}
                    animate={{ width: paused ? '35%' : '100%' }}
                    transition={{
                      duration: paused ? 0.3 : SLIDE_MS / 1000,
                      ease: paused ? 'easeOut' : 'linear',
                    }}
                  />
                ) : (
                  <span className="absolute inset-0 rounded-full bg-surface-2 group-hover:bg-border-muted" />
                )}
              </button>
            );
          })}
        </div>
      </motion.section>

      {/* Live ticker — infinite marquee */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="relative flex h-12 items-center overflow-hidden rounded-xl border border-border-muted bg-surface"
      >
        <span className="z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-border-muted bg-surface-2 px-4 text-xs font-semibold uppercase tracking-wider text-accent3">
          <Radio className="h-3.5 w-3.5" />
          Live
        </span>
        {/* Edge fades so items slide in/out softly. */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 z-10 h-full w-16 bg-gradient-to-l from-surface to-transparent"
        />
        <motion.div
          className="flex shrink-0 items-center whitespace-nowrap"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 38, ease: 'linear', repeat: Infinity }}
        >
          {tickerLoop.map((e, i) => (
            <TickerItem key={`${e.id}-${i}`} e={e} />
          ))}
        </motion.div>
      </motion.section>

      {/* Odometer stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ODOMETERS.map((s, i) => (
          <OdometerTile key={s.id} stat={s} index={i} />
        ))}
      </div>

      {/* Footer caption */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-text-dim"
      >
        <span className="inline-flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5 text-accent" />
          Reel auto-advances every {Math.round(SLIDE_MS / 1000)}s · pause to
          hold a highlight
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Inbox className="h-3.5 w-3.5" />
          {TICKER.length} recent events on the ticker
          <ArrowUpRight className="h-3 w-3" />
        </span>
      </motion.div>
    </div>
  );
}

export default ProPlusAct4Reel;
