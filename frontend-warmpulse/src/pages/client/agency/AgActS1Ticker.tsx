import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion, useAnimationFrame } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Building2,
  CircleDot,
  Clock,
  Gauge,
  Globe,
  Inbox,
  Mail,
  MailOpen,
  Minus,
  Pause,
  Play,
  Radio,
  Reply,
  Send,
  Shield,
  Siren,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

/**
 * AgActS1Ticker — Agency-tier Activity, design candidate S1,
 * "News Ticker / Trading Floor".
 *
 * The Activity surface re-imagined as a financial trading desk. Events are
 * "ticks" that scroll horizontally across three stacked tapes at slightly
 * different speeds. Below the tape, a stacked-area VOLUME CHART of hourly
 * events for the last 24h sits next to an "EVENT BLOTTER" rolling table.
 * A right inspector ranks the most active mailboxes like stock MARKET MOVERS
 * with up/down arrows, surfaces alerts as MARKET BULLETINS, and shows a
 * provider performance bar like sector indices.
 *
 * The aesthetic is a Bloomberg / NYSE pit: monospace digits, subtle CRT
 * scanlines (3% opacity), pulsing "MARKET OPEN" indicator, status-tinted
 * tick text (accent / accent2 / accent3 / accent4), and a "MARKET HOURS"
 * footer line.
 *
 * Fully STANDALONE — no network, router, or query-hook imports. Mounts
 * prop-less from the harness; every value resolves from inline MOCK. Renders
 * page content only — the surrounding shell supplies sidebar / chrome.
 *
 * NOT a vertical stream (sibling Q1), NOT a heatmap (Q2), NOT a journey
 * timeline (Q3), NOT a kanban (Q4), NOT any of the C/D/P/Q sibling Agency
 * canvases. The 3 scrolling tapes + volume chart + rolling blotter +
 * market-movers inspector is the identity.
 */

// ---------------------------------------------------------------------------
// Shared Agency Activity data shape — kept VERBATIM in sync with siblings.
// ---------------------------------------------------------------------------

type ActionKind = 'sent' | 'opened' | 'replied' | 'starred' | 'spam_rescue' | 'bounce';
type MailboxProvider = 'gmail' | 'outlook' | 'yahoo' | 'smtp';
type AlertSeverity = 'info' | 'warn' | 'critical';
type AlertKind = 'spike' | 'silence' | 'spam_burst';

export interface AgencyActivityData {
  workspace: { name: string; subClientCount: number; mailboxCount: number };
  kpis: {
    eventsToday: number;
    sendsToday: number;
    opensToday: number;
    repliesToday: number;
    spamRescuesToday: number;
    peerInteractionsToday: number;
    eventsLastHour: number;
    avgEventsPerMin: number;
  };
  events: Array<{
    id: string;
    kind: ActionKind;
    timestamp: string;
    timeAgo: string;
    mailboxId: string;
    mailboxEmail: string;
    provider: MailboxProvider;
    subClientId: string;
    subClientName: string;
    subClientLogoChar: string;
    peerEmail: string | null;
    note: string;
  }>;
  hourlyVolume: Array<{
    hour: string;
    sends: number;
    opens: number;
    replies: number;
    rescues: number;
  }>;
  weeklyHeatmap: Array<{
    day: number;
    hour: number;
    intensity: number;
    events: number;
  }>;
  topActiveMailboxes: Array<{
    mailboxId: string;
    mailboxEmail: string;
    subClientName: string;
    eventsToday: number;
  }>;
  alerts: Array<{
    id: string;
    kind: AlertKind;
    message: string;
    timeAgo: string;
    severity: AlertSeverity;
    subClientId?: string;
    subClientName?: string;
  }>;
}

// ---------------------------------------------------------------------------
// MOCK — Northwind Agency, 8 sub-clients, 96 mailboxes, ~2.8k events today.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: Array<{
  id: string;
  name: string;
  logoChar: string;
  domain: string;
  ticker: string;
}> = [
  { id: 'sc-helix', name: 'Helix Outreach', logoChar: 'H', domain: 'helix.com', ticker: 'HLX' },
  { id: 'sc-nimbus', name: 'Nimbus Cloud', logoChar: 'N', domain: 'nimbuscloud.io', ticker: 'NMB' },
  { id: 'sc-orion', name: 'Orion Sales', logoChar: 'O', domain: 'orionsales.com', ticker: 'ORN' },
  { id: 'sc-vega', name: 'Vega Outbound', logoChar: 'V', domain: 'vegaoutbound.io', ticker: 'VGA' },
  { id: 'sc-quasar', name: 'Quasar Growth', logoChar: 'Q', domain: 'quasargrowth.com', ticker: 'QSR' },
  { id: 'sc-lyra', name: 'Lyra Studio', logoChar: 'L', domain: 'lyrastudio.co', ticker: 'LYR' },
  { id: 'sc-atlas', name: 'Atlas Bio', logoChar: 'A', domain: 'atlas-bio.com', ticker: 'ATL' },
  { id: 'sc-pixel', name: 'Pixel Forge', logoChar: 'P', domain: 'pixelforge.io', ticker: 'PXF' },
];

const ACTION_NOTE_BY_KIND: Record<ActionKind, string[]> = {
  sent: [
    'Outbound warmup delivered to peer inbox',
    'Threaded reply opened a new conversation',
    'Peer-net handoff complete',
    'Scheduled cadence step executed',
  ],
  opened: [
    'Peer recipient opened in primary',
    'Inbox open registered via tracking pixel',
    'Read receipt confirmed',
    'Opened from desktop client',
  ],
  replied: [
    'Peer authored a multi-line response',
    'Reply lands in same conversation thread',
    'Threaded reply maintains warmup history',
    'Inbox reply delivered with quote',
  ],
  starred: [
    'Peer starred for high-importance signal',
    'Pinned to peer top by warmup engine',
    'Starred to boost engagement weight',
    'Important marker applied via IMAP',
  ],
  spam_rescue: [
    'Recovered from spam folder by peer',
    'Marked NOT SPAM and moved to inbox',
    'Spam-rescue lifted by peer agent',
    'IMAP move + mark-as-read completed',
  ],
  bounce: [
    'Permanent bounce — recipient rejected',
    'SMTP 550 — mailbox does not exist',
    'Soft bounce — temporary failure',
    'Transient delivery failure (4xx)',
  ],
};

function pickFrom<T>(arr: readonly T[], i: number, fallback: T): T {
  if (arr.length === 0) return fallback;
  const idx = ((i % arr.length) + arr.length) % arr.length;
  return arr[idx] ?? fallback;
}

function formatTimeAgo(seconds: number): string {
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function buildMockEvents(): AgencyActivityData['events'] {
  const KIND_BAG: ActionKind[] = [
    'opened',
    'opened',
    'opened',
    'sent',
    'sent',
    'sent',
    'sent',
    'replied',
    'replied',
    'starred',
    'starred',
    'spam_rescue',
    'bounce',
  ];
  const PROVIDER_BAG: MailboxProvider[] = [
    'gmail',
    'gmail',
    'gmail',
    'gmail',
    'outlook',
    'outlook',
    'yahoo',
    'smtp',
  ];
  const out: AgencyActivityData['events'] = [];
  let secondsBack = 8;
  for (let i = 0; i < 50; i++) {
    const kind = pickFrom(KIND_BAG, i * 7 + 3, 'opened');
    const sub = pickFrom(SUB_CLIENTS, i * 3 + 1, SUB_CLIENTS[0]!);
    const provider = pickFrom(PROVIDER_BAG, i * 5 + 2, 'gmail');
    const mboxIdx = (i % 12) + 1;
    const noteList = ACTION_NOTE_BY_KIND[kind];
    const note = pickFrom(noteList, i * 11 + 4, '');
    const peer =
      kind === 'bounce'
        ? null
        : `peer-${String((i * 17 + 91) % 220).padStart(3, '0')}@peer-net.io`;
    const tsMs = Date.now() - secondsBack * 1000;
    const mboxNames = [
      'outreach',
      'team',
      'hello',
      'sales',
      'growth',
      'sam',
      'mia',
      'devon',
      'priya',
      'leo',
      'kira',
      'noor',
    ];
    out.push({
      id: `evt-${i.toString().padStart(3, '0')}`,
      kind,
      timestamp: new Date(tsMs).toISOString(),
      timeAgo: formatTimeAgo(secondsBack),
      mailboxId: `${sub.id}-mbx-${mboxIdx}`,
      mailboxEmail: `${mboxNames[mboxIdx - 1]}@${sub.domain}`,
      provider,
      subClientId: sub.id,
      subClientName: sub.name,
      subClientLogoChar: sub.logoChar,
      peerEmail: peer,
      note,
    });
    const stepSec = pickFrom([28, 41, 95, 62, 137, 49, 78, 184, 53, 91], i, 60);
    secondsBack += stepSec;
  }
  return out;
}

const MOCK_EVENTS = buildMockEvents();

function buildMockHourly(): AgencyActivityData['hourlyVolume'] {
  const SEND_BASELINE = [
    8, 6, 4, 3, 4, 6, 12, 18, 26, 34, 41, 36, 32, 38, 44, 42, 36, 28, 22, 18,
    14, 12, 10, 9,
  ];
  const OPEN_RATIO = 1.7;
  const REPLY_RATIO = 0.48;
  const RESCUE_RATIO = 0.02;
  const out: AgencyActivityData['hourlyVolume'] = [];
  for (let h = 0; h < 24; h++) {
    const base = SEND_BASELINE[h] ?? 10;
    const wobble = ((h * 13) % 7) - 3;
    const sends = Math.max(2, base + wobble);
    out.push({
      hour: `${(23 - h).toString().padStart(2, '0')}:00`,
      sends,
      opens: Math.round(sends * OPEN_RATIO),
      replies: Math.round(sends * REPLY_RATIO),
      rescues: Math.max(0, Math.round(sends * RESCUE_RATIO)),
    });
  }
  return out;
}

const MOCK_HOURLY = buildMockHourly();

function buildMockHeatmap(): AgencyActivityData['weeklyHeatmap'] {
  const cells: AgencyActivityData['weeklyHeatmap'] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const weekdayBoost = day >= 1 && day <= 5 ? 1.0 : 0.45;
      const peakHour = hour >= 8 && hour <= 18 ? 1 : 0.25;
      const wobble = Math.sin(day * 1.3 + hour * 0.4) * 0.15;
      const intensity = Math.min(1, Math.max(0, weekdayBoost * peakHour + wobble));
      const events = Math.round(intensity * 220 + 4);
      cells.push({ day, hour, intensity, events });
    }
  }
  return cells;
}

const MOCK_HEATMAP = buildMockHeatmap();

const MOCK_TOP_MAILBOXES: AgencyActivityData['topActiveMailboxes'] = [
  {
    mailboxId: 'sc-orion-mbx-4',
    mailboxEmail: 'sales@orionsales.com',
    subClientName: 'Orion Sales',
    eventsToday: 312,
  },
  {
    mailboxId: 'sc-nimbus-mbx-7',
    mailboxEmail: 'mia@nimbuscloud.io',
    subClientName: 'Nimbus Cloud',
    eventsToday: 287,
  },
  {
    mailboxId: 'sc-helix-mbx-1',
    mailboxEmail: 'outreach@helix.com',
    subClientName: 'Helix Outreach',
    eventsToday: 256,
  },
  {
    mailboxId: 'sc-quasar-mbx-3',
    mailboxEmail: 'growth@quasargrowth.com',
    subClientName: 'Quasar Growth',
    eventsToday: 224,
  },
  {
    mailboxId: 'sc-orion-mbx-9',
    mailboxEmail: 'devon@orionsales.com',
    subClientName: 'Orion Sales',
    eventsToday: 198,
  },
  {
    mailboxId: 'sc-lyra-mbx-2',
    mailboxEmail: 'hello@lyrastudio.co',
    subClientName: 'Lyra Studio',
    eventsToday: 174,
  },
  {
    mailboxId: 'sc-pixel-mbx-1',
    mailboxEmail: 'team@pixelforge.io',
    subClientName: 'Pixel Forge',
    eventsToday: 152,
  },
  {
    mailboxId: 'sc-vega-mbx-5',
    mailboxEmail: 'sam@vegaoutbound.io',
    subClientName: 'Vega Outbound',
    eventsToday: 138,
  },
];

const MOCK_ALERTS: AgencyActivityData['alerts'] = [
  {
    id: 'al-1',
    kind: 'spike',
    severity: 'critical',
    message: 'Atlas Bio bounce volume up 4.2× over the rolling hour',
    timeAgo: '6m ago',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
  },
  {
    id: 'al-2',
    kind: 'spam_burst',
    severity: 'warn',
    message: 'Vega Outbound spam-rescues clustered on Yahoo recipients',
    timeAgo: '32m ago',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
  },
  {
    id: 'al-3',
    kind: 'silence',
    severity: 'warn',
    message: 'Pixel Forge — no inbound events for 17 minutes',
    timeAgo: '17m ago',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
  },
  {
    id: 'al-4',
    kind: 'spike',
    severity: 'info',
    message: 'Orion Sales reply volume above 24h average (+38%)',
    timeAgo: '1h ago',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
  },
];

const MOCK: AgencyActivityData = {
  workspace: { name: 'Northwind Agency', subClientCount: 8, mailboxCount: 96 },
  kpis: {
    eventsToday: 2840,
    sendsToday: 648,
    opensToday: 1120,
    repliesToday: 312,
    spamRescuesToday: 14,
    peerInteractionsToday: 746,
    eventsLastHour: 96,
    avgEventsPerMin: 1.6,
  },
  events: MOCK_EVENTS,
  hourlyVolume: MOCK_HOURLY,
  weeklyHeatmap: MOCK_HEATMAP,
  topActiveMailboxes: MOCK_TOP_MAILBOXES,
  alerts: MOCK_ALERTS,
};

/**
 * Skeleton fallback used when the live adapter hasn't loaded yet.
 * Every collection is empty so the UI never shows mock numbers in prod.
 */
export const AGENCY_ACTIVITY_SKELETON_S1: AgencyActivityData = {
  workspace: { name: 'Your agency', subClientCount: 0, mailboxCount: 0 },
  kpis: {
    eventsToday: 0,
    sendsToday: 0,
    opensToday: 0,
    repliesToday: 0,
    spamRescuesToday: 0,
    peerInteractionsToday: 0,
    eventsLastHour: 0,
    avgEventsPerMin: 0,
  },
  events: [],
  hourlyVolume: [],
  weeklyHeatmap: [],
  topActiveMailboxes: [],
  alerts: [],
};

// ---------------------------------------------------------------------------
// Visual primitives — tokens, helpers, small components.
// ---------------------------------------------------------------------------

/**
 * Color tier per ActionKind — only Tailwind token classes (no defaults).
 * UP = accent (green-ish in token theme), DOWN = accent3 (red-ish), warn =
 * accent4, neutral = accent2.
 */
const KIND_TOKEN: Record<
  ActionKind,
  { text: string; bg: string; border: string; symbol: string; direction: 'up' | 'down' | 'flat' | 'warn' }
> = {
  sent: {
    text: 'text-accent2',
    bg: 'bg-accent2/10',
    border: 'border-accent2/30',
    symbol: '→',
    direction: 'flat',
  },
  opened: {
    text: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/30',
    symbol: '↑',
    direction: 'up',
  },
  replied: {
    text: 'text-accent',
    bg: 'bg-accent/15',
    border: 'border-accent/40',
    symbol: '⇈',
    direction: 'up',
  },
  starred: {
    text: 'text-accent4',
    bg: 'bg-accent4/10',
    border: 'border-accent4/30',
    symbol: '★',
    direction: 'warn',
  },
  spam_rescue: {
    text: 'text-accent4',
    bg: 'bg-accent4/15',
    border: 'border-accent4/40',
    symbol: '⚑',
    direction: 'warn',
  },
  bounce: {
    text: 'text-accent3',
    bg: 'bg-accent3/10',
    border: 'border-accent3/30',
    symbol: '↓',
    direction: 'down',
  },
};

const KIND_LABEL: Record<ActionKind, string> = {
  sent: 'SEND',
  opened: 'OPEN',
  replied: 'REPLY',
  starred: 'STAR',
  spam_rescue: 'RESCUE',
  bounce: 'BOUNCE',
};

const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  gmail: 'GML',
  outlook: 'OUT',
  yahoo: 'YHO',
  smtp: 'SMT',
};

const ACTION_ICON: Record<ActionKind, typeof Send> = {
  sent: Send,
  opened: MailOpen,
  replied: Reply,
  starred: Star,
  spam_rescue: Shield,
  bounce: AlertTriangle,
};

const ALERT_SEV_TOKEN: Record<AlertSeverity, { text: string; bg: string; border: string }> = {
  info: { text: 'text-accent2', bg: 'bg-accent2/10', border: 'border-accent2/30' },
  warn: { text: 'text-accent4', bg: 'bg-accent4/10', border: 'border-accent4/30' },
  critical: { text: 'text-accent3', bg: 'bg-accent3/10', border: 'border-accent3/30' },
};

function formatInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function formatDecimal(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// CRT scanline overlay — 3% opacity faint stripes.
// ---------------------------------------------------------------------------

function CrtScanlines(): JSX.Element {
  const style: CSSProperties = {
    backgroundImage:
      'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 3px)',
    opacity: 0.5,
  };
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 opacity-30 mix-blend-overlay"
      style={style}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// Pulsing "MARKET OPEN" indicator dot.
// ---------------------------------------------------------------------------

function PulsingDot({ tone = 'accent' }: { tone?: 'accent' | 'accent2' | 'accent3' | 'accent4' }): JSX.Element {
  const ring = `bg-${tone}`;
  return (
    <span className="relative inline-flex h-2 w-2">
      <motion.span
        className={`absolute inset-0 rounded-full ${ring}`}
        animate={{ scale: [1, 2.3, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
      />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${ring}`} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Count-up odometer for KPI tiles.
// ---------------------------------------------------------------------------

function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const elapsed = t - start;
      const p = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// ---------------------------------------------------------------------------
// KPI tile.
// ---------------------------------------------------------------------------

function KpiTile({
  label,
  value,
  decimals = 0,
  icon: Icon,
  delta,
  deltaDir,
}: {
  label: string;
  value: number;
  decimals?: number;
  icon: typeof Send;
  delta?: string;
  deltaDir?: 'up' | 'down' | 'flat';
}): JSX.Element {
  const v = useCountUp(value);
  const display = decimals > 0 ? formatDecimal(v, decimals) : formatInt(v);
  const deltaTone =
    deltaDir === 'up'
      ? 'text-accent border-accent/30 bg-accent/10'
      : deltaDir === 'down'
        ? 'text-accent3 border-accent3/30 bg-accent3/10'
        : 'text-text-dim border-border-muted bg-surface-2';
  const DeltaIcon = deltaDir === 'up' ? ArrowUpRight : deltaDir === 'down' ? ArrowDownRight : Minus;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative flex flex-col gap-1 rounded-md border border-border-muted bg-surface px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-faint">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        {delta ? (
          <div
            className={`flex items-center gap-0.5 rounded-sm border px-1 py-0.5 font-mono text-[9px] tabular-nums ${deltaTone}`}
          >
            <DeltaIcon className="h-2.5 w-2.5" />
            {delta}
          </div>
        ) : null}
      </div>
      <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-text">
        {display}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Single ticker tick — used inside the scrolling tape.
// ---------------------------------------------------------------------------

function TickerTick({
  ev,
}: {
  ev: AgencyActivityData['events'][number];
}): JSX.Element {
  const token = KIND_TOKEN[ev.kind];
  const sub = SUB_CLIENTS.find((s) => s.id === ev.subClientId);
  const tickerCode = sub?.ticker ?? ev.subClientLogoChar;
  const Icon = ACTION_ICON[ev.kind];
  return (
    <div
      className={`inline-flex shrink-0 items-center gap-2 rounded-sm border ${token.border} ${token.bg} px-3 py-1 font-mono text-xs tabular-nums`}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-[2px] bg-surface-2 text-[10px] font-bold text-text">
        {ev.subClientLogoChar}
      </span>
      <span className="font-semibold text-text">{tickerCode}</span>
      <Icon className={`h-3 w-3 ${token.text}`} />
      <span className={`text-[10px] font-bold uppercase tracking-wider ${token.text}`}>
        {token.symbol} {KIND_LABEL[ev.kind]}
      </span>
      <span className="text-text-dim">·</span>
      <span className={`text-[11px] font-semibold ${token.text}`}>
        {PROVIDER_LABEL[ev.provider]}
      </span>
      <span className="text-[10px] text-text-faint">{ev.timeAgo}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scrolling ticker tape — one band, continuously animated.
//
// Implementation: render two copies of the row side-by-side and translateX
// the wrapper from 0 → -width via rAF, looping seamlessly. Pause on hover.
// ---------------------------------------------------------------------------

function TickerTape({
  events,
  durationSec,
  globalPaused,
  bandLabel,
}: {
  events: AgencyActivityData['events'];
  durationSec: number;
  globalPaused: boolean;
  bandLabel: string;
}): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const widthRef = useRef(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const measure = () => {
      if (measureRef.current) {
        widthRef.current = measureRef.current.scrollWidth;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (measureRef.current) ro.observe(measureRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [events]);

  useAnimationFrame((_t, delta) => {
    if (globalPaused || hovered) return;
    const w = widthRef.current;
    if (w <= 0) return;
    const pxPerMs = w / (durationSec * 1000);
    offsetRef.current -= pxPerMs * delta;
    if (offsetRef.current <= -w) {
      offsetRef.current += w;
    }
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
    }
  });

  return (
    <div
      className="relative overflow-hidden border-y border-border-muted bg-surface"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div className="pointer-events-none absolute left-0 top-0 z-20 flex h-full items-center gap-1.5 border-r border-border-muted bg-surface-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">
        <Radio className="h-3 w-3 text-accent" />
        {bandLabel}
      </div>
      <div
        ref={trackRef}
        className="flex items-center gap-2 whitespace-nowrap py-2 pl-28 pr-4 will-change-transform"
      >
        <div ref={measureRef} className="flex shrink-0 items-center gap-2">
          {events.map((ev) => (
            <TickerTick key={`a-${ev.id}`} ev={ev} />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2" aria-hidden>
          {events.map((ev) => (
            <TickerTick key={`b-${ev.id}`} ev={ev} />
          ))}
        </div>
      </div>
      {(globalPaused || hovered) && (
        <div className="pointer-events-none absolute right-3 top-1/2 z-20 inline-flex -translate-y-1/2 items-center gap-1 rounded-sm border border-border-muted bg-surface-2/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-dim">
          <Pause className="h-2.5 w-2.5" />
          PAUSED
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volume chart — stacked area, cursor tracking.
// ---------------------------------------------------------------------------

type VolumePoint = AgencyActivityData['hourlyVolume'][number];

function VolumeChart({ data }: { data: VolumePoint[] }): JSX.Element {
  const W = 720;
  const H = 240;
  const PAD_L = 36;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const totals = useMemo(
    () => data.map((p) => p.sends + p.opens + p.replies + p.rescues),
    [data],
  );
  const maxY = Math.max(1, ...totals) * 1.1;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;

  // Build cumulative stacked y-values for each series.
  const stack = useMemo(() => {
    return data.map((p) => {
      const s = p.sends;
      const o = s + p.opens;
      const r = o + p.replies;
      const t = r + p.rescues;
      return { sends: s, opens: o, replies: r, rescues: t };
    });
  }, [data]);

  const xAt = useCallback((i: number) => PAD_L + i * stepX, [stepX]);
  const yAt = useCallback(
    (val: number) => PAD_T + innerH - (val / maxY) * innerH,
    [innerH, maxY],
  );

  const areaPath = useCallback(
    (key: 'sends' | 'opens' | 'replies' | 'rescues') => {
      if (stack.length === 0) return '';
      const top: string[] = [];
      const bot: string[] = [];
      stack.forEach((s, i) => {
        const x = xAt(i);
        top.push(`${i === 0 ? 'M' : 'L'} ${x} ${yAt(s[key])}`);
      });
      // baseline (reverse)
      for (let i = stack.length - 1; i >= 0; i--) {
        const x = xAt(i);
        const prevKey =
          key === 'sends'
            ? 0
            : key === 'opens'
              ? stack[i]!.sends
              : key === 'replies'
                ? stack[i]!.opens
                : stack[i]!.replies;
        bot.push(`L ${x} ${yAt(prevKey)}`);
      }
      return `${top.join(' ')} ${bot.join(' ')} Z`;
    },
    [stack, xAt, yAt],
  );

  const [cursor, setCursor] = useState<number | null>(null);

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const ratio = W / rect.width;
    const x = (e.clientX - rect.left) * ratio;
    if (x < PAD_L || x > W - PAD_R) {
      setCursor(null);
      return;
    }
    const idx = Math.round((x - PAD_L) / stepX);
    setCursor(Math.max(0, Math.min(data.length - 1, idx)));
  };

  // Y-axis ticks (4 lines)
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push((maxY / 4) * i);
    return ticks;
  }, [maxY]);

  // X-axis labels — every 4th hour
  const xLabels = useMemo(() => {
    const out: Array<{ i: number; label: string }> = [];
    data.forEach((p, i) => {
      if (i % 4 === 0 || i === data.length - 1) out.push({ i, label: p.hour });
    });
    return out;
  }, [data]);

  const cur = cursor !== null ? data[cursor] : null;
  const curTotal = cur ? cur.sends + cur.opens + cur.replies + cur.rescues : 0;

  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-text">
            VOLUME · EVENTS/HR
          </div>
          <div className="rounded-sm border border-border-muted bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-dim">
            24H
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-text-dim">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-accent2" /> SEND
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-accent" /> OPEN
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-accent/70" /> REPLY
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-accent4" /> RESCUE
          </div>
        </div>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          onPointerMove={onMove}
          onPointerLeave={() => setCursor(null)}
        >
          {/* gridlines */}
          {yTicks.map((t, i) => (
            <g key={`grid-${i}`}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="currentColor"
                strokeWidth={0.5}
                className="text-border-muted"
              />
              <text
                x={PAD_L - 6}
                y={yAt(t) + 3}
                textAnchor="end"
                className="fill-current font-mono text-[9px] text-text-faint"
              >
                {formatInt(t)}
              </text>
            </g>
          ))}
          {/* x labels */}
          {xLabels.map(({ i, label }) => (
            <text
              key={`xl-${i}`}
              x={xAt(i)}
              y={H - 10}
              textAnchor="middle"
              className="fill-current font-mono text-[9px] uppercase text-text-faint"
            >
              {label}
            </text>
          ))}
          {/* stacked areas — animated on mount */}
          <motion.path
            d={areaPath('rescues')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="fill-accent4/40 stroke-accent4"
            strokeWidth={1}
          />
          <motion.path
            d={areaPath('replies')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.05 }}
            className="fill-accent/30 stroke-accent/80"
            strokeWidth={1}
          />
          <motion.path
            d={areaPath('opens')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="fill-accent/25 stroke-accent"
            strokeWidth={1}
          />
          <motion.path
            d={areaPath('sends')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="fill-accent2/35 stroke-accent2"
            strokeWidth={1}
          />
          {/* cursor guide */}
          {cursor !== null && (
            <g>
              <line
                x1={xAt(cursor)}
                x2={xAt(cursor)}
                y1={PAD_T}
                y2={H - PAD_B}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="2 2"
                className="text-text-dim"
              />
              <circle
                cx={xAt(cursor)}
                cy={yAt(stack[cursor]?.rescues ?? 0)}
                r={3.5}
                className="fill-accent stroke-bg"
                strokeWidth={1.5}
              />
            </g>
          )}
        </svg>
        {cur && cursor !== null && (
          <div
            className="pointer-events-none absolute top-2 max-w-[200px] rounded-md border border-border-muted bg-surface-2/95 px-3 py-2 font-mono text-[10px] tabular-nums shadow-lg backdrop-blur"
            style={{
              left: `${(xAt(cursor) / W) * 100}%`,
              transform: cursor > data.length / 2 ? 'translateX(-105%)' : 'translateX(12px)',
            }}
          >
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-text-faint">
              <Clock className="h-2.5 w-2.5" />
              {cur.hour}
            </div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-text-dim">TOTAL</span>
              <span className="font-semibold text-text">{formatInt(curTotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-accent2">
              <span>SEND</span>
              <span>{formatInt(cur.sends)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-accent">
              <span>OPEN</span>
              <span>{formatInt(cur.opens)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-accent">
              <span>REPLY</span>
              <span>{formatInt(cur.replies)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-accent4">
              <span>RESCUE</span>
              <span>{formatInt(cur.rescues)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Blotter — rolling table of last 30 events.
// ---------------------------------------------------------------------------

function EventBlotter({
  events,
}: {
  events: AgencyActivityData['events'];
}): JSX.Element {
  const rows = events.slice(0, 30);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-accent" />
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-text">
            EVENT BLOTTER
          </div>
          <div className="rounded-sm border border-border-muted bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-dim">
            LAST 30
          </div>
        </div>
        <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-text-faint">
          <PulsingDot tone="accent" />
          STREAMING
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-border-muted bg-surface">
        <div className="grid grid-cols-[80px_120px_110px_1fr_80px] gap-2 border-b border-border-muted bg-surface-2 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-text-faint">
          <div>TIME</div>
          <div>SUB-CLIENT</div>
          <div>ACTION</div>
          <div>MAILBOX</div>
          <div className="text-right">VALUE</div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {rows.map((ev, _i) => {
              const token = KIND_TOKEN[ev.kind];
              const Icon = ACTION_ICON[ev.kind];
              return (
                <motion.div
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, y: -10, backgroundColor: 'rgba(255,255,255,0.06)' }}
                  animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(255,255,255,0)' }}
                  exit={{ opacity: 0 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 300, damping: 30 },
                    opacity: { duration: 0.25 },
                    backgroundColor: { duration: 1.2, delay: 0.2 },
                  }}
                  className="grid grid-cols-[80px_120px_110px_1fr_80px] items-center gap-2 border-b border-border-muted/50 px-3 py-2 font-mono text-[11px] tabular-nums last:border-b-0 hover:bg-surface-2/50"
                >
                  <div className="text-text-dim">{ev.timeAgo}</div>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] bg-surface-2 text-[9px] font-bold text-text">
                      {ev.subClientLogoChar}
                    </span>
                    <span className="truncate text-text">{ev.subClientName}</span>
                  </div>
                  <div
                    className={`inline-flex w-fit items-center gap-1 rounded-sm border ${token.border} ${token.bg} px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${token.text}`}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {KIND_LABEL[ev.kind]}
                  </div>
                  <div className="truncate text-text-dim">{ev.mailboxEmail}</div>
                  <div className={`text-right font-bold ${token.text}`}>
                    {token.symbol}
                    {ev.kind === 'sent'
                      ? ' +1'
                      : ev.kind === 'opened'
                        ? ' +1'
                        : ev.kind === 'replied'
                          ? ' +2'
                          : ev.kind === 'starred'
                            ? ' +1'
                            : ev.kind === 'spam_rescue'
                              ? ' +3'
                              : ' -1'}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {rows.length === 0 && (
            <div className="px-3 py-12 text-center font-mono text-[10px] uppercase tracking-wider text-text-faint">
              No ticks on the blotter yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Market Movers — top mailboxes ranked like stocks.
// ---------------------------------------------------------------------------

function MarketMovers({
  mailboxes,
  events,
}: {
  mailboxes: AgencyActivityData['topActiveMailboxes'];
  events: AgencyActivityData['events'];
}): JSX.Element {
  // Synthesize a "direction" per mailbox by counting recent events; even
  // indexed → up, odd → down for a deterministic mix.
  const ranked = useMemo(() => {
    return mailboxes.map((m, i) => {
      const dir: 'up' | 'down' | 'flat' = i % 3 === 2 ? 'flat' : i % 2 === 0 ? 'up' : 'down';
      const recent = events.filter((e) => e.mailboxId === m.mailboxId).length;
      const pct = ((m.eventsToday % 47) / 100) * (dir === 'down' ? -1 : 1);
      return { ...m, dir, recent, pct };
    });
  }, [mailboxes, events]);

  const max = Math.max(1, ...ranked.map((r) => r.eventsToday));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-text">
          MARKET MOVERS
        </div>
        <div className="ml-auto rounded-sm border border-border-muted bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-dim">
          TOP 8
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-border-muted bg-surface">
        {ranked.map((m, i) => {
          const tone =
            m.dir === 'up'
              ? 'text-accent'
              : m.dir === 'down'
                ? 'text-accent3'
                : 'text-text-dim';
          const glow =
            m.dir === 'up'
              ? 'shadow-[0_0_18px_rgba(16,185,129,0)] hover:shadow-[0_0_18px_rgba(16,185,129,0.12)]'
              : m.dir === 'down'
                ? 'shadow-[0_0_18px_rgba(239,68,68,0)] hover:shadow-[0_0_18px_rgba(239,68,68,0.12)]'
                : '';
          const DirIcon = m.dir === 'up' ? ArrowUpRight : m.dir === 'down' ? ArrowDownRight : Minus;
          const pctText = (m.dir === 'down' ? '-' : m.dir === 'up' ? '+' : '') + Math.abs(m.pct).toFixed(2) + '%';
          const widthPct = (m.eventsToday / max) * 100;
          return (
            <motion.div
              key={m.mailboxId}
              layout
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`group relative flex items-center gap-2 border-b border-border-muted/60 px-3 py-2 last:border-b-0 transition-shadow ${glow}`}
            >
              <div className="flex w-5 items-center justify-center font-mono text-[10px] text-text-faint">
                {(i + 1).toString().padStart(2, '0')}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[11px] font-semibold text-text">
                    {m.mailboxEmail}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-text-faint">
                  <span className="truncate">{m.subClientName}</span>
                </div>
                <div className="mt-0.5 h-0.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={{ duration: 0.7, delay: 0.1 + i * 0.04 }}
                    className={`h-full ${m.dir === 'down' ? 'bg-accent3' : m.dir === 'up' ? 'bg-accent' : 'bg-accent2'}`}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 font-mono tabular-nums">
                <div className="font-semibold text-text">{formatInt(m.eventsToday)}</div>
                <div className={`flex items-center gap-0.5 text-[10px] ${tone}`}>
                  <DirIcon className="h-2.5 w-2.5" />
                  {pctText}
                </div>
              </div>
            </motion.div>
          );
        })}
        {ranked.length === 0 && (
          <div className="px-3 py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-faint">
            No movers
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Market Bulletins — alerts.
// ---------------------------------------------------------------------------

function MarketBulletins({
  alerts,
}: {
  alerts: AgencyActivityData['alerts'];
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Siren className="h-4 w-4 text-accent3" />
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-text">
          MARKET BULLETINS
        </div>
        <div className="ml-auto rounded-sm border border-accent3/30 bg-accent3/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent3">
          {alerts.length} ACTIVE
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {alerts.map((a, i) => {
          const sev = ALERT_SEV_TOKEN[a.severity];
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`relative flex items-start gap-2 rounded-md border ${sev.border} ${sev.bg} px-3 py-2`}
            >
              <div className={`mt-0.5 ${sev.text}`}>
                <Bell className="h-3.5 w-3.5" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-sm border ${sev.border} bg-surface-2/60 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${sev.text}`}
                  >
                    {a.severity}
                  </span>
                  {a.subClientName && (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-text-faint">
                      {a.subClientName}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[9px] text-text-faint">{a.timeAgo}</span>
                </div>
                <div className="text-[11px] leading-snug text-text">{a.message}</div>
              </div>
            </motion.div>
          );
        })}
        {alerts.length === 0 && (
          <div className="rounded-md border border-border-muted bg-surface px-3 py-6 text-center font-mono text-[10px] uppercase tracking-wider text-text-faint">
            No active bulletins
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sector Indices — provider performance.
// ---------------------------------------------------------------------------

function SectorIndices({
  events,
}: {
  events: AgencyActivityData['events'];
}): JSX.Element {
  const byProv = useMemo(() => {
    const counts: Record<MailboxProvider, number> = {
      gmail: 0,
      outlook: 0,
      yahoo: 0,
      smtp: 0,
    };
    events.forEach((e) => {
      counts[e.provider] = (counts[e.provider] ?? 0) + 1;
    });
    const total = Math.max(1, events.length);
    const order: MailboxProvider[] = ['gmail', 'outlook', 'yahoo', 'smtp'];
    return order.map((p, i) => ({
      provider: p,
      count: counts[p],
      pct: (counts[p] / total) * 100,
      dir: (i % 2 === 0 ? 'up' : 'down') as 'up' | 'down',
      delta: ((counts[p] % 13) / 10).toFixed(2),
    }));
  }, [events]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-accent" />
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-text">
          SECTOR INDICES
        </div>
        <div className="ml-auto rounded-sm border border-border-muted bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-dim">
          PROVIDERS
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {byProv.map((s) => {
          const tone = s.dir === 'up' ? 'text-accent' : 'text-accent3';
          const Icon = s.dir === 'up' ? ArrowUpRight : ArrowDownRight;
          return (
            <div
              key={s.provider}
              className="flex flex-col gap-1 rounded-md border border-border-muted bg-surface px-2.5 py-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-text">
                  {PROVIDER_LABEL[s.provider]}
                </span>
                <span className={`flex items-center gap-0.5 font-mono text-[9px] ${tone}`}>
                  <Icon className="h-2.5 w-2.5" />
                  {(s.dir === 'down' ? '-' : '+') + s.delta}%
                </span>
              </div>
              <div className="font-mono text-base font-semibold tabular-nums text-text">
                {formatInt(s.count)}
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${s.pct}%` }}
                  transition={{ duration: 0.7 }}
                  className={`h-full ${s.dir === 'up' ? 'bg-accent' : 'bg-accent3'}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header — agency name, region, KPIs, MoM chip, MARKET OPEN indicator.
// ---------------------------------------------------------------------------

function Header({
  data,
  paused,
  onTogglePaused,
}: {
  data: AgencyActivityData;
  paused: boolean;
  onTogglePaused: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4 border-b border-border-muted pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border-muted bg-surface-2">
            <Building2 className="h-5 w-5 text-text-dim" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-lg font-semibold tracking-tight text-text">
                {data.workspace.name}
              </h1>
              <span className="rounded-sm border border-border-muted bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-dim">
                NYSE · NORTHEAST
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-faint">
              <Users className="h-3 w-3" />
              {data.workspace.subClientCount} SUB-CLIENTS
              <span className="text-text-faint">·</span>
              <Mail className="h-3 w-3" />
              {data.workspace.mailboxCount} MAILBOXES
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
            <PulsingDot tone="accent" />
            MARKET OPEN
          </div>
          <button
            type="button"
            onClick={onTogglePaused}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-muted bg-surface-2 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-text-dim transition-colors hover:bg-surface hover:text-text"
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? 'RESUME TAPE' : 'PAUSE TAPE'}
          </button>
          <div className="flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-accent">
            <TrendingUp className="h-3 w-3" />
            MoM +18.4%
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <KpiTile
          label="Events"
          value={data.kpis.eventsToday}
          icon={Activity}
          delta="+8.2%"
          deltaDir="up"
        />
        <KpiTile
          label="Sends"
          value={data.kpis.sendsToday}
          icon={Send}
          delta="+3.1%"
          deltaDir="up"
        />
        <KpiTile
          label="Opens"
          value={data.kpis.opensToday}
          icon={MailOpen}
          delta="+11.6%"
          deltaDir="up"
        />
        <KpiTile
          label="Replies"
          value={data.kpis.repliesToday}
          icon={Reply}
          delta="+5.4%"
          deltaDir="up"
        />
        <KpiTile
          label="Peer Acts"
          value={data.kpis.peerInteractionsToday}
          icon={Users}
          delta="+2.0%"
          deltaDir="up"
        />
        <KpiTile
          label="Rescues"
          value={data.kpis.spamRescuesToday}
          icon={Shield}
          delta="-12%"
          deltaDir="down"
        />
        <KpiTile
          label="Events/Hr"
          value={data.kpis.eventsLastHour}
          icon={Zap}
          delta="+4.0%"
          deltaDir="up"
        />
        <KpiTile
          label="Avg/Min"
          value={data.kpis.avgEventsPerMin}
          decimals={2}
          icon={Gauge}
          delta="flat"
          deltaDir="flat"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer — MARKET HOURS line.
// ---------------------------------------------------------------------------

function MarketHoursFooter(): JSX.Element {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border-muted pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <CircleDot className="h-3 w-3 text-accent" />
          MARKET HOURS · 00:00–24:00 UTC · CONTINUOUS
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span>SESSION · LIVE</span>
        <span className="text-text-dim">·</span>
        <span>
          LOCAL TIME · {hh}:{mm}
        </span>
        <span className="text-text-dim">·</span>
        <span className="flex items-center gap-1">
          <Sparkles className="h-2.5 w-2.5" />
          NEXT BAR ROLL · {(60 - now.getSeconds()).toString().padStart(2, '0')}s
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component.
// ---------------------------------------------------------------------------

export function AgActS1Ticker({
  data,
}: { data?: AgencyActivityData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const [paused, setPaused] = useState(false);

  // Build three rotations of the event stream so each tape feels distinct.
  const tapeA = d.events;
  const tapeB = useMemo(
    () => [...d.events.slice(15), ...d.events.slice(0, 15)],
    [d.events],
  );
  const tapeC = useMemo(
    () => [...d.events.slice(30), ...d.events.slice(0, 30)],
    [d.events],
  );

  return (
    <div className="relative flex flex-col gap-6 bg-bg pb-6 pt-6 text-text">
      <CrtScanlines />
      <div className="relative z-20 flex flex-col gap-6 px-6">
        <Header data={d} paused={paused} onTogglePaused={() => setPaused((p) => !p)} />
      </div>

      {/* Tape strip — full width, edge to edge */}
      <div className="relative z-20 flex flex-col">
        <TickerTape
          events={tapeA}
          durationSec={30}
          globalPaused={paused}
          bandLabel="TAPE A · FAST"
        />
        <TickerTape
          events={tapeB}
          durationSec={45}
          globalPaused={paused}
          bandLabel="TAPE B · MID"
        />
        <TickerTape
          events={tapeC}
          durationSec={60}
          globalPaused={paused}
          bandLabel="TAPE C · SLOW"
        />
      </div>

      {/* Trade floor */}
      <div className="relative z-20 grid grid-cols-1 gap-6 px-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <div className="rounded-lg border border-border-muted bg-surface p-4">
            <VolumeChart data={d.hourlyVolume} />
          </div>
          <EventBlotter events={d.events} />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-4">
          <MarketMovers mailboxes={d.topActiveMailboxes} events={d.events} />
          <MarketBulletins alerts={d.alerts} />
          <SectorIndices events={d.events} />
        </div>
      </div>

      <div className="relative z-20 px-6">
        <MarketHoursFooter />
      </div>
    </div>
  );
}

export default AgActS1Ticker;
