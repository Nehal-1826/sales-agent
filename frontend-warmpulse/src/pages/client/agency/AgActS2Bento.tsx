import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useAnimationFrame } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  Crown,
  Dot,
  Flame,
  Gauge,
  Globe,
  Grid3x3,
  Inbox,
  MailOpen,
  Maximize2,
  Pause,
  Radio,
  Reply,
  Send,
  Shield,
  Siren,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgActS2Bento — Agency-tier Activity, design candidate S2, "Bento Grid".
 *
 * The bento metaphor — borrowed from Apple's iPad keynote slides and the
 * Notion gallery — splits a single dashboard surface into a deliberate
 * mosaic of mixed-size tiles. Each tile owns ONE aspect of activity and
 * shows it at the most flattering size: the hero tile gets two columns and
 * two rows, the alerts ticker gets a tall single column, the carousel
 * stretches across the full width. The eye traces a path from the largest
 * tile down to the supporting cast, the way you'd skim a magazine spread
 * rather than a console feed.
 *
 * Composition:
 *
 *   - TOP HEADER: agency name + region pill + 4 quick KPI chips (Events
 *     today / Sends today / Replies / Spam rescues) with odometer count-up,
 *     a MoM-growth chip, and a period selector segmented control (Today /
 *     This week / 7d / 30d).
 *
 *   - MAIN CANVAS (lg:col-span-9): a 4-column bento grid with 9 tiles in
 *     varied row/col spans —
 *       1. HERO EVENT TILE (2×2) — the most recent critical event with a
 *          big breathing accent glow and a count-up "Nm ago" timer.
 *       2. 24H VOLUME (2×1) — wide area chart of events/hour with a
 *          cursor-tracking vertical guide, dot, and tooltip.
 *       3. STATUS DISTRIBUTION (1×2) — vertical stacked bar of event kinds.
 *       4. TOP MAILBOX (1×1) — biggest mover today, a clean stat tile.
 *       5. PROVIDER MIX (2×1) — horizontal stacked bar across Gmail /
 *          Outlook / Yahoo / SMTP with width-from-zero animation.
 *       6. WEEKLY HEATMAP (2×2) — mini 7-day × 24-hour heatmap with
 *          row-by-row fade-in cells.
 *       7. ALERTS TICKER (1×2) — vertically scrolling alerts list that
 *          pauses on hover.
 *       8. MAILBOXES ACTIVE NOW (1×1) — a giant number and 4 small status
 *          dots for the providers.
 *       9. RECENT EVENTS CAROUSEL (4×1) — horizontally scrollable strip of
 *          the last 10 events with snap behaviour.
 *
 *   - RIGHT INSPECTOR (lg:col-span-3): "Today's snapshot" by default — a
 *     condensed summary of the current period. When a tile is hovered or
 *     clicked, the inspector swaps in tile-specific detail. Click any tile
 *     to expand it to a layoutId-driven fullscreen modal; close with X or
 *     escape.
 *
 *   - ANIMATIONS: tiles fade-in with a 60ms stagger; hover lifts a tile
 *     (translateY -4px) and washes a status-tinted accent glow across the
 *     border; the hero event tile breathes accent; the 24h area chart
 *     traces in via pathLength 0→1 and cursor-tracks; the provider mix
 *     bar widths animate from zero; mini heatmap cells fade-in row by row;
 *     alerts ticker scrolls continuously and pauses on hover.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Every value comes from the inline MOCK constant. Renders only page
 * content; the shell supplies sidebar / chrome.
 *
 * NOT a streaming feed (sibling Q1 owns that), NOT a heatmap-first surface
 * (Q3), NOT a kanban-per-action board (Q4), NOT a journey timeline (Q2).
 * The mixed-size mosaic + layoutId expansion + magazine-spread reading
 * order is the identity here.
 */

// ---------------------------------------------------------------------------
// Shared Agency Activity data shape — kept in sync across all variants.
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
}> = [
  { id: 'sc-helix', name: 'Helix Outreach', logoChar: 'H', domain: 'helix.com' },
  { id: 'sc-nimbus', name: 'Nimbus Cloud', logoChar: 'N', domain: 'nimbuscloud.io' },
  { id: 'sc-orion', name: 'Orion Sales', logoChar: 'O', domain: 'orionsales.com' },
  { id: 'sc-vega', name: 'Vega Outbound', logoChar: 'V', domain: 'vegaoutbound.io' },
  { id: 'sc-quasar', name: 'Quasar Growth', logoChar: 'Q', domain: 'quasargrowth.com' },
  { id: 'sc-lyra', name: 'Lyra Studio', logoChar: 'L', domain: 'lyrastudio.co' },
  { id: 'sc-atlas', name: 'Atlas Bio', logoChar: 'A', domain: 'atlas-bio.com' },
  { id: 'sc-pixel', name: 'Pixel Forge', logoChar: 'P', domain: 'pixelforge.io' },
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

/**
 * Generate a deterministic spread of 50 events across the last ~4 hours.
 * Same weighting / cadence as sibling variants so KPIs reconcile.
 */
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
  const MBOX_USERS = [
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
  const out: AgencyActivityData['events'] = [];
  let secondsBack = 8;
  for (let i = 0; i < 50; i++) {
    const kind = pickFrom(KIND_BAG, i * 7 + 3, 'opened');
    const sub = pickFrom(SUB_CLIENTS, i * 3 + 1, SUB_CLIENTS[0]!);
    const provider = pickFrom(PROVIDER_BAG, i * 5 + 2, 'gmail');
    const mboxIdx = i % 12;
    const noteList = ACTION_NOTE_BY_KIND[kind];
    const note = pickFrom(noteList, i * 11 + 4, '');
    const peer =
      kind === 'bounce'
        ? null
        : `peer-${String((i * 17 + 91) % 220).padStart(3, '0')}@peer-net.io`;
    const tsMs = Date.now() - secondsBack * 1000;
    out.push({
      id: `evt-${i.toString().padStart(3, '0')}`,
      kind,
      timestamp: new Date(tsMs).toISOString(),
      timeAgo: formatTimeAgo(secondsBack),
      mailboxId: `${sub.id}-mbx-${mboxIdx + 1}`,
      mailboxEmail: `${MBOX_USERS[mboxIdx]}@${sub.domain}`,
      provider,
      subClientId: sub.id,
      subClientName: sub.name,
      subClientLogoChar: sub.logoChar,
      peerEmail: peer,
      note,
    });
    const stepSec = pickFrom(
      [28, 41, 95, 62, 137, 49, 78, 184, 53, 91],
      i,
      60,
    );
    secondsBack += stepSec;
  }
  return out;
}

const MOCK_EVENTS = buildMockEvents();

/** Build 24 hourly buckets matching MOCK_EVENTS volume curves. */
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

/** 7 days × 24 hours = 168 heatmap cells. */
function buildMockHeatmap(): AgencyActivityData['weeklyHeatmap'] {
  const cells: AgencyActivityData['weeklyHeatmap'] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const weekdayBoost = day >= 1 && day <= 5 ? 1.0 : 0.45;
      const peakHour = hour >= 8 && hour <= 18 ? 1 : 0.25;
      const wobble = Math.sin(day * 1.3 + hour * 0.4) * 0.15;
      const intensity = Math.min(
        1,
        Math.max(0, weekdayBoost * peakHour + wobble),
      );
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
  workspace: {
    name: 'Northwind Agency',
    subClientCount: 8,
    mailboxCount: 96,
  },
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
 * Skeleton fallback used while the live adapter is loading or has failed,
 * so we never render the mock numbers as if they were the user's own.
 */
export const AGENCY_ACTIVITY_SKELETON_S2: AgencyActivityData = {
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
// Theme + action / provider helpers
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
} as const;

type Tone = 'accent' | 'accent2' | 'accent3' | 'accent4';

const ACTION_LABEL: Record<ActionKind, string> = {
  sent: 'Sent',
  opened: 'Opened',
  replied: 'Replied',
  starred: 'Starred',
  spam_rescue: 'Spam rescued',
  bounce: 'Bounced',
};

const ACTION_ICON: Record<ActionKind, typeof Send> = {
  sent: Send,
  opened: MailOpen,
  replied: Reply,
  starred: Star,
  spam_rescue: Shield,
  bounce: AlertTriangle,
};

const ACTION_TONE: Record<ActionKind, Tone> = {
  sent: 'accent2',
  opened: 'accent',
  replied: 'accent',
  starred: 'accent4',
  spam_rescue: 'accent4',
  bounce: 'accent3',
};

const ACTION_VERB_PAST: Record<ActionKind, string> = {
  sent: 'sent warmup mail to',
  opened: 'open registered by',
  replied: 'reply received from',
  starred: 'starred by',
  spam_rescue: 'rescued from spam by',
  bounce: 'delivery bounced for',
};

const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

const PROVIDER_TONE: Record<MailboxProvider, Tone> = {
  gmail: 'accent',
  outlook: 'accent2',
  yahoo: 'accent4',
  smtp: 'accent3',
};

const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  spike: 'Volume spike',
  silence: 'Activity silence',
  spam_burst: 'Spam burst',
};

const ALERT_KIND_ICON: Record<AlertKind, typeof TrendingUp> = {
  spike: TrendingUp,
  silence: Pause,
  spam_burst: Siren,
};

const SEVERITY_TONE: Record<AlertSeverity, Tone> = {
  info: 'accent2',
  warn: 'accent4',
  critical: 'accent3',
};

const TONE_CLASS: Record<
  Tone,
  {
    text: string;
    bg: string;
    border: string;
    softBg: string;
    softBorder: string;
    ring: string;
    glow: string;
    fromTo: string;
  }
> = {
  accent: {
    text: 'text-accent',
    bg: 'bg-accent',
    border: 'border-accent',
    softBg: 'bg-accent/10',
    softBorder: 'border-accent/30',
    ring: 'ring-accent/40',
    glow: 'shadow-[0_0_30px_-6px_rgba(242, 101, 34,0.45)]',
    fromTo: 'from-accent/20 to-accent/0',
  },
  accent2: {
    text: 'text-accent2',
    bg: 'bg-accent2',
    border: 'border-accent2',
    softBg: 'bg-accent2/10',
    softBorder: 'border-accent2/30',
    ring: 'ring-accent2/40',
    glow: 'shadow-[0_0_30px_-6px_rgba(255, 138, 75,0.45)]',
    fromTo: 'from-accent2/20 to-accent2/0',
  },
  accent3: {
    text: 'text-accent3',
    bg: 'bg-accent3',
    border: 'border-accent3',
    softBg: 'bg-accent3/10',
    softBorder: 'border-accent3/30',
    ring: 'ring-accent3/40',
    glow: 'shadow-[0_0_30px_-6px_rgba(255,107,74,0.45)]',
    fromTo: 'from-accent3/20 to-accent3/0',
  },
  accent4: {
    text: 'text-accent4',
    bg: 'bg-accent4',
    border: 'border-accent4',
    softBg: 'bg-accent4/10',
    softBorder: 'border-accent4/30',
    ring: 'ring-accent4/40',
    glow: 'shadow-[0_0_30px_-6px_rgba(255,213,79,0.45)]',
    fromTo: 'from-accent4/20 to-accent4/0',
  },
};

// ---------------------------------------------------------------------------
// useCountUp — odometer-style mount animation
// ---------------------------------------------------------------------------

/**
 * Smoothly counts from 0 → target over `durationMs`. Ease-out curve so the
 * number races out of the gate and decelerates onto `target`. Returns
 * integer for integer targets, otherwise one decimal place.
 */
function useCountUp(target: number, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const isInt = Number.isInteger(target);

  useAnimationFrame((t) => {
    if (doneRef.current) return;
    if (startRef.current === null) startRef.current = t;
    const elapsed = t - startRef.current;
    if (elapsed >= durationMs) {
      setValue(target);
      doneRef.current = true;
      return;
    }
    const progress = elapsed / durationMs;
    const eased = 1 - Math.pow(1 - progress, 3);
    const next = target * eased;
    setValue(isInt ? Math.round(next) : Math.round(next * 10) / 10);
  });

  useEffect(() => {
    startRef.current = null;
    doneRef.current = false;
    setValue(0);
  }, [target]);

  return value;
}


// ---------------------------------------------------------------------------
// Tile registry — describes every tile in the bento for the inspector +
// expansion modal. Keys are stable so layoutId can route motion correctly.
// ---------------------------------------------------------------------------

type TileKey =
  | 'hero'
  | 'volume'
  | 'distribution'
  | 'topMailbox'
  | 'providerMix'
  | 'heatmap'
  | 'alerts'
  | 'activeNow'
  | 'carousel';

const TILE_META: Record<
  TileKey,
  { title: string; icon: typeof Activity; tone: Tone; blurb: string }
> = {
  hero: {
    title: 'Latest critical event',
    icon: Flame,
    tone: 'accent3',
    blurb:
      'The most recent high-signal event across every sub-client mailbox. Tapping the tile opens a fullscreen detail panel for the event chain.',
  },
  volume: {
    title: '24-hour volume',
    icon: Activity,
    tone: 'accent',
    blurb:
      'Hour-by-hour event throughput across the agency. Cursor-track to read precise counts. Spans both peer-to-mailbox and mailbox-to-peer directions.',
  },
  distribution: {
    title: 'Status distribution',
    icon: Gauge,
    tone: 'accent2',
    blurb:
      'How today’s events break down by action kind — sends, opens, replies, stars, rescues, bounces. Useful for spotting reply-rate compression.',
  },
  topMailbox: {
    title: 'Top mailbox today',
    icon: Crown,
    tone: 'accent4',
    blurb:
      'The single mailbox with the highest engagement count today. Click through from the tile to view its dedicated activity feed.',
  },
  providerMix: {
    title: 'Provider mix',
    icon: Globe,
    tone: 'accent',
    blurb:
      'Share of mailboxes by provider, weighted by today’s outbound volume. Helps catch when a single provider is carrying disproportionate load.',
  },
  heatmap: {
    title: 'Weekly heatmap',
    icon: Grid3x3,
    tone: 'accent2',
    blurb:
      'Seven days × twenty-four hours of activity intensity. Brighter cells = more events. Reveals the agency’s natural send rhythm.',
  },
  alerts: {
    title: 'Open alerts',
    icon: Bell,
    tone: 'accent3',
    blurb:
      'Live anomaly notifications. The ticker pauses on hover so you can read at your own pace; clicking an alert jumps to the offending sub-client.',
  },
  activeNow: {
    title: 'Mailboxes active now',
    icon: Radio,
    tone: 'accent4',
    blurb:
      'Mailboxes with at least one event in the last five minutes, broken down by provider. The provider dots breathe gently when fresh signal lands.',
  },
  carousel: {
    title: 'Recent events',
    icon: Inbox,
    tone: 'accent',
    blurb:
      'Last ten events in chronological order, newest leftmost. Scroll horizontally; click any card to pin it open in the inspector panel.',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Period = 'today' | 'week' | '7d' | '30d';

const PERIOD_LABEL: Record<Period, string> = {
  today: 'Today',
  week: 'This week',
  '7d': '7d',
  '30d': '30d',
};

export function AgActS2Bento(
  { data }: { data?: AgencyActivityData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  const [period, setPeriod] = useState<Period>('today');
  const [hovered, setHovered] = useState<TileKey | null>(null);
  const [expanded, setExpanded] = useState<TileKey | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Close expanded on escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded]);

  // The hero event is the most recent critical-looking event from MOCK_EVENTS.
  // Bounces and spam_rescues are the headline-worthy ones; fall back to first.
  const heroEvent = useMemo(() => {
    const priority: ActionKind[] = ['bounce', 'spam_rescue', 'replied', 'starred', 'opened', 'sent'];
    for (const kind of priority) {
      const match = d.events.find((e) => e.kind === kind);
      if (match) return match;
    }
    return d.events[0] ?? null;
  }, [d.events]);

  // Status distribution — count events by kind in MOCK_EVENTS.
  const distribution = useMemo(() => {
    const counts: Record<ActionKind, number> = {
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescue: 0,
      bounce: 0,
    };
    for (const e of d.events) counts[e.kind] += 1;
    return counts;
  }, [d.events]);

  // Provider mix — share of total mailbox events by provider.
  const providerMix = useMemo(() => {
    const counts: Record<MailboxProvider, number> = {
      gmail: 0,
      outlook: 0,
      yahoo: 0,
      smtp: 0,
    };
    for (const e of d.events) counts[e.provider] += 1;
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const order: MailboxProvider[] = ['gmail', 'outlook', 'yahoo', 'smtp'];
    return order.map((p) => ({
      provider: p,
      count: counts[p],
      share: counts[p] / total,
    }));
  }, [d.events]);

  // "Active now" — distinct mailbox count from events in the last 5 min, plus
  // per-provider count for the four dots. With seeded mock data we just pull
  // the last few synthetic entries.
  const activeNow = useMemo(() => {
    const recent = d.events.slice(0, 16);
    const seen = new Set<string>();
    const byProvider: Record<MailboxProvider, number> = {
      gmail: 0,
      outlook: 0,
      yahoo: 0,
      smtp: 0,
    };
    for (const e of recent) {
      if (!seen.has(e.mailboxId)) {
        seen.add(e.mailboxId);
        byProvider[e.provider] += 1;
      }
    }
    return { count: seen.size, byProvider };
  }, [d.events]);

  // For the inspector default snapshot — MoM growth chip (synthetic).
  const momGrowth = 0.18; // +18% vs same period last month

  // Tile sizing classes. The bento grid is 4 cols on lg, 12 row units tall
  // overall. Below lg the tiles wrap naturally to a 2-col grid.
  // We use minmax(0, 1fr) rows so tiles don't blow out their containers.

  return (
    <div className="relative min-h-full bg-bg text-text">
      {/* Subtle gradient backdrop — magazine-style page wash. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-accent/10 blur-[140px]" />
        <div className="absolute -right-40 top-48 h-[480px] w-[480px] rounded-full bg-accent2/10 blur-[160px]" />
        <div className="absolute bottom-0 left-1/3 h-[360px] w-[360px] rounded-full bg-accent4/[0.06] blur-[120px]" />
      </div>

      <div className="mx-auto max-w-[1600px] px-6 pb-16 pt-8 lg:px-10">
        {/* HEADER */}
        <HeaderBar
          workspace={d.workspace}
          kpis={d.kpis}
          period={period}
          onPeriodChange={setPeriod}
          momGrowth={momGrowth}
        />

        {/* MAIN — 12-column grid: bento (9) + inspector (3). */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-9">
            <BentoGrid
              heroEvent={heroEvent}
              hourlyVolume={d.hourlyVolume}
              distribution={distribution}
              topMailbox={d.topActiveMailboxes[0] ?? null}
              providerMix={providerMix}
              heatmap={d.weeklyHeatmap}
              alerts={d.alerts}
              activeNow={activeNow}
              events={d.events}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
              hovered={hovered}
              onHover={setHovered}
              onExpand={setExpanded}
              mailboxTotal={d.workspace.mailboxCount}
            />
          </div>

          <div className="lg:col-span-3">
            <Inspector
              hovered={hovered}
              selectedEventId={selectedEventId}
              events={d.events}
              kpis={d.kpis}
              workspace={d.workspace}
              alerts={d.alerts}
              topMailboxes={d.topActiveMailboxes}
            />
          </div>
        </div>
      </div>

      {/* EXPANSION MODAL */}
      <AnimatePresence>
        {expanded ? (
          <ExpandedTile
            tileKey={expanded}
            onClose={() => setExpanded(null)}
            heroEvent={heroEvent}
            hourlyVolume={d.hourlyVolume}
            distribution={distribution}
            topMailbox={d.topActiveMailboxes[0] ?? null}
            providerMix={providerMix}
            heatmap={d.weeklyHeatmap}
            alerts={d.alerts}
            activeNow={activeNow}
            events={d.events}
            mailboxTotal={d.workspace.mailboxCount}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeaderBar
// ---------------------------------------------------------------------------

function HeaderBar({
  workspace,
  kpis,
  period,
  onPeriodChange,
  momGrowth,
}: {
  workspace: AgencyActivityData['workspace'];
  kpis: AgencyActivityData['kpis'];
  period: Period;
  onPeriodChange: (p: Period) => void;
  momGrowth: number;
}): JSX.Element {
  const events = useCountUp(kpis.eventsToday);
  const sends = useCountUp(kpis.sendsToday);
  const replies = useCountUp(kpis.repliesToday);
  const rescues = useCountUp(kpis.spamRescuesToday);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-muted bg-surface">
          <Building2 className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-text-faint">
            Agency activity
          </div>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-semibold text-text">
              {workspace.name}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-dim">
              <Globe className="h-3 w-3 text-accent2" />
              IN-1
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-dim">
              <Users className="h-3 w-3 text-accent" />
              {workspace.subClientCount} sub-clients
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-dim">
              <Inbox className="h-3 w-3 text-accent4" />
              {workspace.mailboxCount} mailboxes
            </span>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* MoM chip */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="font-semibold">+{Math.round(momGrowth * 100)}%</span>
            <span className="text-text-dim">vs last month</span>
          </motion.div>

          {/* Period selector */}
          <div className="inline-flex items-center gap-0.5 rounded-full border border-border-muted bg-surface p-0.5">
            {(['today', 'week', '7d', '30d'] as const).map((p) => {
              const active = period === p;
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => onPeriodChange(p)}
                  className={
                    'relative rounded-full px-3 py-1 text-xs transition-colors ' +
                    (active
                      ? 'text-text'
                      : 'text-text-dim hover:text-text')
                  }
                >
                  {active ? (
                    <motion.span
                      layoutId="periodPill"
                      className="absolute inset-0 rounded-full bg-surface-2 ring-1 ring-border-muted"
                      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                    />
                  ) : null}
                  <span className="relative">{PERIOD_LABEL[p]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiChip
          label="Events today"
          value={events}
          icon={Activity}
          tone="accent"
        />
        <KpiChip
          label="Sends today"
          value={sends}
          icon={Send}
          tone="accent2"
        />
        <KpiChip
          label="Replies today"
          value={replies}
          icon={Reply}
          tone="accent"
        />
        <KpiChip
          label="Spam rescues"
          value={rescues}
          icon={Shield}
          tone="accent4"
        />
      </div>
    </div>
  );
}

function KpiChip({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: Tone;
}): JSX.Element {
  const t = TONE_CLASS[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="group relative overflow-hidden rounded-2xl border border-border-muted bg-surface/80 p-4 backdrop-blur"
    >
      <div
        aria-hidden
        className={
          'pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity ' +
          t.softBg +
          ' opacity-50 group-hover:opacity-90'
        }
      />
      <div className="relative flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
          {label}
        </div>
        <Icon className={'h-4 w-4 ' + t.text} />
      </div>
      <div className="relative mt-2 text-2xl font-semibold text-text tabular-nums">
        {formatNumber(value)}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// BentoGrid — the 9-tile mosaic
// ---------------------------------------------------------------------------

interface BentoProps {
  heroEvent: AgencyActivityData['events'][number] | null;
  hourlyVolume: AgencyActivityData['hourlyVolume'];
  distribution: Record<ActionKind, number>;
  topMailbox: AgencyActivityData['topActiveMailboxes'][number] | null;
  providerMix: Array<{ provider: MailboxProvider; count: number; share: number }>;
  heatmap: AgencyActivityData['weeklyHeatmap'];
  alerts: AgencyActivityData['alerts'];
  activeNow: { count: number; byProvider: Record<MailboxProvider, number> };
  events: AgencyActivityData['events'];
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  hovered: TileKey | null;
  onHover: (k: TileKey | null) => void;
  onExpand: (k: TileKey) => void;
  mailboxTotal: number;
}

function BentoGrid(props: BentoProps): JSX.Element {
  const {
    heroEvent,
    hourlyVolume,
    distribution,
    topMailbox,
    providerMix,
    heatmap,
    alerts,
    activeNow,
    events,
    selectedEventId,
    onSelectEvent,
    hovered,
    onHover,
    onExpand,
    mailboxTotal,
  } = props;

  // Tile order used for the stagger index — same as visual order.
  const order: TileKey[] = [
    'hero',
    'volume',
    'distribution',
    'topMailbox',
    'providerMix',
    'activeNow',
    'heatmap',
    'alerts',
    'carousel',
  ];
  const indexOf = (k: TileKey) => order.indexOf(k);

  return (
    <div
      className="grid auto-rows-[minmax(0,1fr)] grid-cols-2 gap-4 md:grid-cols-4"
      style={
        {
          // Tile heights are tuned so the 4×N grid feels deliberate at 1280–1600px.
          gridAutoRows: '160px',
        } as CSSProperties
      }
    >
      <BentoTile
        tileKey="hero"
        stagger={indexOf('hero')}
        hovered={hovered}
        onHover={onHover}
        onExpand={onExpand}
        className="col-span-2 row-span-2"
      >
        <HeroEventTile event={heroEvent} />
      </BentoTile>

      <BentoTile
        tileKey="volume"
        stagger={indexOf('volume')}
        hovered={hovered}
        onHover={onHover}
        onExpand={onExpand}
        className="col-span-2 row-span-1"
      >
        <VolumeTile hourlyVolume={hourlyVolume} />
      </BentoTile>

      <BentoTile
        tileKey="distribution"
        stagger={indexOf('distribution')}
        hovered={hovered}
        onHover={onHover}
        onExpand={onExpand}
        className="col-span-1 row-span-2"
      >
        <DistributionTile distribution={distribution} />
      </BentoTile>

      <BentoTile
        tileKey="topMailbox"
        stagger={indexOf('topMailbox')}
        hovered={hovered}
        onHover={onHover}
        onExpand={onExpand}
        className="col-span-1 row-span-1"
      >
        <TopMailboxTile topMailbox={topMailbox} />
      </BentoTile>

      <BentoTile
        tileKey="providerMix"
        stagger={indexOf('providerMix')}
        hovered={hovered}
        onHover={onHover}
        onExpand={onExpand}
        className="col-span-2 row-span-1"
      >
        <ProviderMixTile providerMix={providerMix} />
      </BentoTile>

      <BentoTile
        tileKey="heatmap"
        stagger={indexOf('heatmap')}
        hovered={hovered}
        onHover={onHover}
        onExpand={onExpand}
        className="col-span-2 row-span-2"
      >
        <HeatmapTile heatmap={heatmap} />
      </BentoTile>

      <BentoTile
        tileKey="alerts"
        stagger={indexOf('alerts')}
        hovered={hovered}
        onHover={onHover}
        onExpand={onExpand}
        className="col-span-1 row-span-2"
      >
        <AlertsTickerTile alerts={alerts} />
      </BentoTile>

      <BentoTile
        tileKey="activeNow"
        stagger={indexOf('activeNow')}
        hovered={hovered}
        onHover={onHover}
        onExpand={onExpand}
        className="col-span-1 row-span-1"
      >
        <ActiveNowTile activeNow={activeNow} mailboxTotal={mailboxTotal} />
      </BentoTile>

      <BentoTile
        tileKey="carousel"
        stagger={indexOf('carousel')}
        hovered={hovered}
        onHover={onHover}
        onExpand={onExpand}
        className="col-span-2 row-span-1 md:col-span-4"
      >
        <CarouselTile
          events={events.slice(0, 10)}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
        />
      </BentoTile>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BentoTile — shared wrapper: layoutId, fade-in stagger, hover lift, glow,
// header label row, click-to-expand.
// ---------------------------------------------------------------------------

function BentoTile({
  tileKey,
  stagger,
  hovered,
  onHover,
  onExpand,
  className,
  children,
}: {
  tileKey: TileKey;
  stagger: number;
  hovered: TileKey | null;
  onHover: (k: TileKey | null) => void;
  onExpand: (k: TileKey) => void;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  const meta = TILE_META[tileKey];
  const Icon = meta.icon;
  const t = TONE_CLASS[meta.tone];
  const isHovered = hovered === tileKey;

  return (
    <motion.div
      layoutId={`bento-${tileKey}`}
      onMouseEnter={() => onHover(tileKey)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onExpand(tileKey)}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: stagger * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ y: -4, scale: 1.015 }}
      className={
        'group relative cursor-pointer overflow-hidden rounded-3xl border border-border-muted bg-surface/80 backdrop-blur transition-shadow ' +
        (isHovered ? t.glow + ' ' + t.softBorder : '') +
        ' ' +
        (className ?? '')
      }
    >
      {/* Status-tinted soft glow that brightens on hover. */}
      <div
        aria-hidden
        className={
          'pointer-events-none absolute inset-0 bg-gradient-to-br ' +
          t.fromTo +
          ' opacity-40 transition-opacity group-hover:opacity-90'
        }
      />
      {/* Header label row */}
      <div className="relative flex items-center justify-between border-b border-border-muted/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className={'h-3.5 w-3.5 ' + t.text} />
          <span className="text-[10px] uppercase tracking-[0.18em] text-text-dim">
            {meta.title}
          </span>
        </div>
        <Maximize2 className="h-3.5 w-3.5 text-text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      {/* Body */}
      <div className="relative h-[calc(100%-2.4rem)] overflow-hidden">
        {children}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// HeroEventTile (2x2) — featured most-recent critical event
// ---------------------------------------------------------------------------

function HeroEventTile({
  event,
}: {
  event: AgencyActivityData['events'][number] | null;
}): JSX.Element {
  if (!event) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-text-faint">
        <span className="text-sm">No events yet</span>
      </div>
    );
  }
  const tone = ACTION_TONE[event.kind];
  const t = TONE_CLASS[tone];
  const Icon = ACTION_ICON[event.kind];

  return (
    <div className="relative flex h-full flex-col p-6">
      {/* Breath glow behind icon */}
      <motion.div
        aria-hidden
        className={'absolute -left-10 -top-10 h-48 w-48 rounded-full blur-3xl ' + t.softBg}
        animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.08, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative flex items-start gap-4">
        <div
          className={
            'flex h-14 w-14 items-center justify-center rounded-2xl border ' +
            t.softBorder +
            ' ' +
            t.softBg
          }
        >
          <Icon className={'h-7 w-7 ' + t.text} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ' +
                t.softBg +
                ' ' +
                t.softBorder +
                ' ' +
                t.text
              }
            >
              {ACTION_LABEL[event.kind]}
            </span>
            <TimerChip iso={event.timestamp} />
          </div>
          <div className="mt-1 truncate text-lg font-semibold text-text">
            {event.mailboxEmail}
          </div>
          <div className="text-xs text-text-dim">
            {event.subClientName} · {PROVIDER_LABEL[event.provider]}
          </div>
        </div>
      </div>

      <div className="relative mt-5 flex-1 rounded-2xl border border-border-muted/60 bg-surface-2/70 p-4 text-sm text-text">
        <div className="text-[10px] uppercase tracking-[0.18em] text-text-faint">
          Summary
        </div>
        <p className="mt-1 leading-relaxed text-text">{event.note}</p>
        {event.peerEmail ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-text-dim">
            <Users className="h-3.5 w-3.5 text-accent2" />
            <span>Peer:</span>
            <span className="font-mono text-text">{event.peerEmail}</span>
          </div>
        ) : null}
      </div>

      <div className="relative mt-4 flex items-center justify-between text-xs">
        <div className="inline-flex items-center gap-1.5 text-text-dim">
          <Sparkles className={'h-3.5 w-3.5 ' + t.text} />
          <span>Featured event</span>
        </div>
        <div className="inline-flex items-center gap-1 text-text">
          Open detail
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
}

function TimerChip({ iso }: { iso: string }): JSX.Element {
  const [label, setLabel] = useState(() => relativeFromIso(iso));
  useEffect(() => {
    setLabel(relativeFromIso(iso));
    const interval = setInterval(() => setLabel(relativeFromIso(iso)), 1000);
    return () => clearInterval(interval);
  }, [iso]);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-dim">
      <Clock className="h-3 w-3 text-accent" />
      {label}
    </span>
  );
}

function relativeFromIso(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'Just now';
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return formatTimeAgo(seconds);
}

// ---------------------------------------------------------------------------
// VolumeTile (2x1) — wide area chart of events/hour, cursor-tracking
// ---------------------------------------------------------------------------

function VolumeTile({
  hourlyVolume,
}: {
  hourlyVolume: AgencyActivityData['hourlyVolume'];
}): JSX.Element {
  return (
    <div className="relative h-full px-4 pb-3 pt-2">
      <AreaChart hours={hourlyVolume} />
    </div>
  );
}

function AreaChart({
  hours,
}: {
  hours: AgencyActivityData['hourlyVolume'];
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 600, h: 110 });
  const [cursorX, setCursorX] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const cr = e.contentRect;
      setSize({ w: Math.max(200, cr.width), h: Math.max(60, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padL = 28;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const innerW = Math.max(1, size.w - padL - padR);
  const innerH = Math.max(1, size.h - padT - padB);

  const max = useMemo(() => {
    if (hours.length === 0) return 1;
    return Math.max(
      1,
      ...hours.map((h) => h.sends + h.opens + h.replies + h.rescues),
    );
  }, [hours]);

  const totals = useMemo(
    () => hours.map((h) => h.sends + h.opens + h.replies + h.rescues),
    [hours],
  );

  const points = useMemo(() => {
    if (hours.length < 2) return [] as Array<{ x: number; y: number; idx: number }>;
    return hours.map((_, i) => {
      const x = padL + (innerW * i) / (hours.length - 1);
      const v = totals[i] ?? 0;
      const y = padT + innerH - (v / max) * innerH;
      return { x, y, idx: i };
    });
  }, [hours, totals, innerW, innerH, max]);

  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0]!;
    const last = points[points.length - 1]!;
    return (
      `M ${first.x} ${padT + innerH} ` +
      points.map((p) => `L ${p.x} ${p.y}`).join(' ') +
      ` L ${last.x} ${padT + innerH} Z`
    );
  }, [points, innerH]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setCursorX(x);
    },
    [],
  );

  const onMouseLeave = useCallback(() => setCursorX(null), []);

  const cursorIdx = useMemo(() => {
    if (cursorX === null || points.length === 0) return null;
    // Find the nearest point.
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = Math.abs(points[i]!.x - cursorX);
      if (dx < bestDist) {
        bestDist = dx;
        best = i;
      }
    }
    return best;
  }, [cursorX, points]);

  const cursorPoint = cursorIdx !== null ? points[cursorIdx] : null;
  const cursorHour = cursorIdx !== null ? hours[cursorIdx] : null;
  const cursorTotal = cursorIdx !== null ? totals[cursorIdx] : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <svg
        className="absolute inset-0"
        width={size.w}
        height={size.h}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <defs>
          <linearGradient id="bento-volume-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity="0.45" />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={padL}
            x2={size.w - padR}
            y1={padT + innerH * p}
            y2={padT + innerH * p}
            stroke="rgba(136,136,160,0.15)"
            strokeDasharray="3 4"
          />
        ))}

        {/* area */}
        <motion.path
          d={areaPath}
          fill="url(#bento-volume-area)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />

        {/* line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={HEX.accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />

        {/* x-axis ticks (only first / middle / last) */}
        {[0, Math.floor(hours.length / 2), hours.length - 1].map((idx) => {
          const h = hours[idx];
          if (!h) return null;
          const x = padL + (innerW * idx) / Math.max(1, hours.length - 1);
          return (
            <text
              key={idx}
              x={x}
              y={size.h - 4}
              fontSize={9}
              textAnchor="middle"
              fill="rgba(136,136,160,0.7)"
            >
              {h.hour}
            </text>
          );
        })}

        {/* cursor guide */}
        {cursorPoint ? (
          <g>
            <line
              x1={cursorPoint.x}
              x2={cursorPoint.x}
              y1={padT}
              y2={padT + innerH}
              stroke={HEX.accent}
              strokeOpacity="0.35"
              strokeDasharray="3 3"
            />
            <circle
              cx={cursorPoint.x}
              cy={cursorPoint.y}
              r={4}
              fill={HEX.accent}
              stroke="#13131d"
              strokeWidth={2}
            />
          </g>
        ) : null}
      </svg>

      {/* tooltip */}
      <AnimatePresence>
        {cursorPoint && cursorHour && cursorTotal !== null ? (
          <motion.div
            key="tip"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute z-10 rounded-lg border border-border-muted bg-surface px-2.5 py-1.5 text-[11px] shadow-lg"
            style={{
              left: Math.max(
                4,
                Math.min(size.w - 140, cursorPoint.x - 60),
              ),
              top: Math.max(4, cursorPoint.y - 56),
            }}
          >
            <div className="text-text-faint">{cursorHour.hour}</div>
            <div className="font-semibold text-text">
              {cursorTotal} events
            </div>
            <div className="text-text-dim">
              {cursorHour.sends} sends · {cursorHour.opens} opens
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DistributionTile (1x2) — vertical stacked bar of event kinds
// ---------------------------------------------------------------------------

function DistributionTile({
  distribution,
}: {
  distribution: Record<ActionKind, number>;
}): JSX.Element {
  const order: ActionKind[] = [
    'sent',
    'opened',
    'replied',
    'starred',
    'spam_rescue',
    'bounce',
  ];
  const total = order.reduce((acc, k) => acc + distribution[k], 0) || 1;

  return (
    <div className="flex h-full flex-col p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
        By action kind
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-text">
        {total}
      </div>

      <div className="mt-3 flex flex-1 gap-3">
        {/* Vertical stacked bar */}
        <div className="relative w-7 overflow-hidden rounded-xl border border-border-muted bg-surface-2/60">
          <div className="absolute inset-0 flex flex-col-reverse">
            {order.map((kind, i) => {
              const share = distribution[kind] / total;
              const tone = ACTION_TONE[kind];
              const t = TONE_CLASS[tone];
              return (
                <motion.div
                  key={kind}
                  initial={{ height: 0 }}
                  animate={{ height: `${share * 100}%` }}
                  transition={{
                    duration: 0.7,
                    delay: 0.12 + i * 0.05,
                    ease: 'easeOut',
                  }}
                  className={t.bg + '/80'}
                />
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-1 flex-col justify-between">
          {order.map((kind) => {
            const share = distribution[kind] / total;
            const tone = ACTION_TONE[kind];
            const t = TONE_CLASS[tone];
            const Icon = ACTION_ICON[kind];
            return (
              <div key={kind} className="flex items-center gap-2 text-[11px]">
                <span
                  className={'inline-flex h-2.5 w-2.5 rounded-sm ' + t.bg}
                />
                <Icon className={'h-3 w-3 ' + t.text} />
                <span className="flex-1 truncate text-text-dim">
                  {ACTION_LABEL[kind]}
                </span>
                <span className="tabular-nums text-text">
                  {Math.round(share * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopMailboxTile (1x1) — biggest mover today
// ---------------------------------------------------------------------------

function TopMailboxTile({
  topMailbox,
}: {
  topMailbox: AgencyActivityData['topActiveMailboxes'][number] | null;
}): JSX.Element {
  if (!topMailbox) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-text-faint">
        No data
      </div>
    );
  }
  const count = useCountUp(topMailbox.eventsToday);
  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="flex items-center gap-2">
        <Crown className="h-3.5 w-3.5 text-accent4" />
        <span className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
          Biggest mover
        </span>
      </div>
      <div>
        <div className="text-3xl font-semibold tabular-nums text-text">
          {count}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-text-dim">
          events today
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-text">
          {topMailbox.mailboxEmail}
        </div>
        <div className="truncate text-[11px] text-text-dim">
          {topMailbox.subClientName}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProviderMixTile (2x1) — horizontal stacked bar across providers
// ---------------------------------------------------------------------------

function ProviderMixTile({
  providerMix,
}: {
  providerMix: Array<{
    provider: MailboxProvider;
    count: number;
    share: number;
  }>;
}): JSX.Element {
  const total = providerMix.reduce((acc, p) => acc + p.count, 0);

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
            Today across providers
          </div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-text">
            {total} events
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {providerMix.map((p) => {
            const t = TONE_CLASS[PROVIDER_TONE[p.provider]];
            return (
              <div
                key={p.provider}
                className="inline-flex items-center gap-1 text-[11px] text-text-dim"
              >
                <span
                  className={'inline-block h-2 w-2 rounded-full ' + t.bg}
                />
                {PROVIDER_LABEL[p.provider]}{' '}
                <span className="tabular-nums text-text">
                  {Math.round(p.share * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative flex h-5 w-full overflow-hidden rounded-full border border-border-muted bg-surface-2/60">
        {providerMix.map((p, i) => {
          const t = TONE_CLASS[PROVIDER_TONE[p.provider]];
          return (
            <motion.div
              key={p.provider}
              initial={{ width: 0 }}
              animate={{ width: `${p.share * 100}%` }}
              transition={{
                duration: 0.9,
                delay: 0.15 + i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={t.bg + '/80'}
              title={`${PROVIDER_LABEL[p.provider]} — ${p.count}`}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-2 text-[10px] text-text-faint">
        {providerMix.map((p) => (
          <div key={p.provider} className="truncate">
            <span className="tabular-nums text-text">{p.count}</span>{' '}
            {PROVIDER_LABEL[p.provider]}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeatmapTile (2x2) — mini 7-day × 24-hour heatmap
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function HeatmapTile({
  heatmap,
}: {
  heatmap: AgencyActivityData['weeklyHeatmap'];
}): JSX.Element {
  // Index cells by day, hour
  const byDay = useMemo(() => {
    const map: Array<Array<{ intensity: number; events: number }>> = [];
    for (let d = 0; d < 7; d++) {
      map.push(
        Array.from({ length: 24 }, () => ({ intensity: 0, events: 0 })),
      );
    }
    for (const cell of heatmap) {
      const row = map[cell.day];
      if (row) row[cell.hour] = { intensity: cell.intensity, events: cell.events };
    }
    return map;
  }, [heatmap]);

  const [hover, setHover] = useState<{ day: number; hour: number } | null>(
    null,
  );

  return (
    <div className="relative flex h-full flex-col gap-2 p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
            7-day rhythm
          </div>
          <div className="mt-0.5 text-sm font-semibold text-text">
            Brightest tiles = peak activity
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-text-dim">
          <span>low</span>
          <div className="flex gap-0.5">
            {[0.15, 0.35, 0.55, 0.75, 0.95].map((v) => (
              <span
                key={v}
                className="inline-block h-2.5 w-3 rounded-sm bg-accent"
                style={{ opacity: v }}
              />
            ))}
          </div>
          <span>high</span>
        </div>
      </div>

      <div className="flex flex-1 gap-2">
        <div className="flex flex-col justify-between py-1 text-[9px] uppercase tracking-wider text-text-faint">
          {DAY_LABELS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="relative flex flex-1 flex-col gap-1">
          {byDay.map((row, d) => (
            <motion.div
              key={d}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: d * 0.06 }}
              className="grid flex-1 grid-cols-24 gap-[3px]"
              style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
            >
              {row.map((cell, h) => {
                const isHover = hover && hover.day === d && hover.hour === h;
                return (
                  <div
                    key={h}
                    onMouseEnter={() => setHover({ day: d, hour: h })}
                    onMouseLeave={() => setHover(null)}
                    className={
                      'relative rounded-[3px] transition-transform ' +
                      (isHover ? 'scale-110 ring-1 ring-accent' : '')
                    }
                    style={{
                      backgroundColor: HEX.accent,
                      opacity: 0.1 + cell.intensity * 0.75,
                    }}
                  />
                );
              })}
            </motion.div>
          ))}
          <div className="mt-1 flex justify-between text-[9px] text-text-faint">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {hover ? (
          <motion.div
            key="hm-tip"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute right-4 top-4 rounded-lg border border-border-muted bg-surface px-2 py-1 text-[11px] shadow-lg"
          >
            <span className="font-semibold text-text">
              {byDay[hover.day]?.[hover.hour]?.events ?? 0} events
            </span>
            <span className="ml-1.5 text-text-dim">
              {DAY_LABELS[hover.day]}{' '}
              {String(hover.hour).padStart(2, '0')}:00
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlertsTickerTile (1x2) — continuously scrolling alerts list
// ---------------------------------------------------------------------------

function AlertsTickerTile({
  alerts,
}: {
  alerts: AgencyActivityData['alerts'];
}): JSX.Element {
  const [paused, setPaused] = useState(false);
  const [offset, setOffset] = useState(0);

  // Continuous scroll: increment offset every frame.
  useAnimationFrame((_t, delta) => {
    if (paused) return;
    if (alerts.length === 0) return;
    setOffset((prev) => prev + delta * 0.025);
  });

  // We duplicate the list once so the loop is seamless.
  const doubled = useMemo(() => [...alerts, ...alerts], [alerts]);
  const ROW_H = 84;
  const totalH = alerts.length * ROW_H;
  const wrapped = totalH > 0 ? offset % totalH : 0;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative h-full overflow-hidden p-3"
    >
      <div className="flex items-center justify-between pb-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
          {alerts.length} open
        </span>
        <span
          className={
            'inline-flex items-center gap-1 text-[10px] ' +
            (paused ? 'text-text-dim' : 'text-accent2')
          }
        >
          <Dot className="h-3 w-3" />
          {paused ? 'paused' : 'live'}
        </span>
      </div>
      <div
        className="relative"
        style={{ height: 'calc(100% - 28px)' }}
      >
        <div
          className="absolute inset-x-0 will-change-transform"
          style={{ transform: `translateY(${-wrapped}px)` }}
        >
          {doubled.map((a, i) => {
            const tone = SEVERITY_TONE[a.severity];
            const t = TONE_CLASS[tone];
            const Icon = ALERT_KIND_ICON[a.kind];
            return (
              <div
                key={`${a.id}-${i}`}
                className="mb-2 flex items-start gap-2 rounded-xl border border-border-muted/60 bg-surface-2/60 p-2.5"
                style={{ height: ROW_H - 8 }}
              >
                <div
                  className={
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ' +
                    t.softBorder +
                    ' ' +
                    t.softBg
                  }
                >
                  <Icon className={'h-3.5 w-3.5 ' + t.text} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={
                        'text-[10px] uppercase tracking-wider ' + t.text
                      }
                    >
                      {ALERT_KIND_LABEL[a.kind]}
                    </span>
                    <span className="text-[10px] text-text-faint">
                      · {a.timeAgo}
                    </span>
                  </div>
                  <div className="line-clamp-2 text-[11px] leading-snug text-text">
                    {a.message}
                  </div>
                  {a.subClientName ? (
                    <div className="mt-0.5 text-[10px] text-text-dim">
                      {a.subClientName}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {/* Top + bottom fade masks */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-surface to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface to-transparent" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActiveNowTile (1x1) — big number + 4 status dots
// ---------------------------------------------------------------------------

function ActiveNowTile({
  activeNow,
  mailboxTotal,
}: {
  activeNow: { count: number; byProvider: Record<MailboxProvider, number> };
  mailboxTotal: number;
}): JSX.Element {
  const c = useCountUp(activeNow.count);
  const providers: MailboxProvider[] = ['gmail', 'outlook', 'yahoo', 'smtp'];

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="flex items-center gap-2">
        <Radio className="h-3.5 w-3.5 text-accent2" />
        <span className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
          Active in last 5m
        </span>
      </div>
      <div className="-mt-1">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums text-text">
            {c}
          </span>
          <span className="text-xs text-text-dim">
            of {mailboxTotal}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {providers.map((p) => {
          const tone = PROVIDER_TONE[p];
          const t = TONE_CLASS[tone];
          const count = activeNow.byProvider[p];
          return (
            <div
              key={p}
              className="flex flex-col items-center gap-1"
              title={`${PROVIDER_LABEL[p]} — ${count}`}
            >
              <motion.span
                className={'inline-block h-2.5 w-2.5 rounded-full ' + t.bg}
                animate={
                  count > 0
                    ? {
                        opacity: [0.4, 1, 0.4],
                        scale: [1, 1.18, 1],
                      }
                    : { opacity: 0.35 }
                }
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <span className="text-[9px] uppercase tracking-wider text-text-faint">
                {PROVIDER_LABEL[p].slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CarouselTile (4x1) — horizontal scrollable strip of last 10 events
// ---------------------------------------------------------------------------

function CarouselTile({
  events,
  selectedEventId,
  onSelectEvent,
}: {
  events: AgencyActivityData['events'];
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
}): JSX.Element {
  return (
    <div className="relative h-full">
      <div
        className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-3"
        style={{ scrollbarWidth: 'thin' }}
        onClick={(e) => e.stopPropagation()}
      >
        {events.map((evt, i) => {
          const tone = ACTION_TONE[evt.kind];
          const t = TONE_CLASS[tone];
          const Icon = ACTION_ICON[evt.kind];
          const active = evt.id === selectedEventId;
          return (
            <motion.button
              type="button"
              key={evt.id}
              onClick={() =>
                onSelectEvent(active ? null : evt.id)
              }
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: i * 0.04 }}
              className={
                'group/card flex h-full min-w-[180px] shrink-0 snap-start flex-col justify-between rounded-2xl border bg-surface-2/70 p-3 text-left transition-all ' +
                (active
                  ? t.softBorder + ' ' + t.glow
                  : 'border-border-muted hover:' + t.softBorder)
              }
            >
              <div className="flex items-center justify-between">
                <div
                  className={
                    'flex h-7 w-7 items-center justify-center rounded-lg border ' +
                    t.softBorder +
                    ' ' +
                    t.softBg
                  }
                >
                  <Icon className={'h-3.5 w-3.5 ' + t.text} />
                </div>
                <span className="text-[10px] text-text-faint">
                  {evt.timeAgo}
                </span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-text">
                  {evt.mailboxEmail}
                </div>
                <div className="truncate text-[10px] text-text-dim">
                  {evt.subClientName}
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-text-dim">
                <span className={t.text}>{ACTION_LABEL[evt.kind]}</span>
                <span>{PROVIDER_LABEL[evt.provider]}</span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector — right rail. Default snapshot, or tile-specific detail when one
// is hovered.
// ---------------------------------------------------------------------------

function Inspector({
  hovered,
  selectedEventId,
  events,
  kpis,
  workspace,
  alerts,
  topMailboxes,
}: {
  hovered: TileKey | null;
  selectedEventId: string | null;
  events: AgencyActivityData['events'];
  kpis: AgencyActivityData['kpis'];
  workspace: AgencyActivityData['workspace'];
  alerts: AgencyActivityData['alerts'];
  topMailboxes: AgencyActivityData['topActiveMailboxes'];
}): JSX.Element {
  const selectedEvent = useMemo(
    () =>
      selectedEventId
        ? events.find((e) => e.id === selectedEventId) ?? null
        : null,
    [selectedEventId, events],
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="sticky top-6 flex flex-col gap-3 rounded-3xl border border-border-muted bg-surface/80 p-5 backdrop-blur"
    >
      <AnimatePresence mode="wait">
        {selectedEvent ? (
          <motion.div
            key="selected-event"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <InspectorHeader
              title="Pinned event"
              tone={ACTION_TONE[selectedEvent.kind]}
              icon={ACTION_ICON[selectedEvent.kind]}
            />
            <div className="mt-3 text-sm text-text">
              {ACTION_VERB_PAST[selectedEvent.kind]}{' '}
              <span className="font-medium text-text">
                {selectedEvent.peerEmail ?? 'peer-net'}
              </span>
            </div>
            <div className="mt-2 truncate text-xs text-text-dim">
              {selectedEvent.mailboxEmail}
            </div>
            <div className="mt-1 text-xs text-text-dim">
              {selectedEvent.subClientName} ·{' '}
              {PROVIDER_LABEL[selectedEvent.provider]} ·{' '}
              {selectedEvent.timeAgo}
            </div>
            <p className="mt-3 rounded-xl border border-border-muted/60 bg-surface-2/60 p-3 text-xs leading-relaxed text-text">
              {selectedEvent.note}
            </p>
          </motion.div>
        ) : hovered ? (
          <motion.div
            key={`hover-${hovered}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <InspectorHeader
              title={TILE_META[hovered].title}
              tone={TILE_META[hovered].tone}
              icon={TILE_META[hovered].icon}
            />
            <p className="mt-3 text-xs leading-relaxed text-text-dim">
              {TILE_META[hovered].blurb}
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-1 text-[10px] text-text-dim">
              <Sparkles className="h-3 w-3 text-accent" />
              Click tile to expand
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="default-snapshot"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <InspectorHeader
              title="Today's snapshot"
              tone="accent"
              icon={Calendar}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SnapshotStat
                label="Last hour"
                value={kpis.eventsLastHour}
                icon={Clock}
                tone="accent2"
              />
              <SnapshotStat
                label="Events / min"
                value={kpis.avgEventsPerMin}
                icon={Gauge}
                tone="accent"
              />
              <SnapshotStat
                label="Opens"
                value={kpis.opensToday}
                icon={MailOpen}
                tone="accent"
              />
              <SnapshotStat
                label="Peer interactions"
                value={kpis.peerInteractionsToday}
                icon={Users}
                tone="accent4"
              />
            </div>
            <div className="mt-4 border-t border-border-muted pt-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
                Top mailboxes
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {topMailboxes.slice(0, 4).map((m, i) => {
                  const max = topMailboxes[0]?.eventsToday ?? 1;
                  const share = m.eventsToday / max;
                  return (
                    <li
                      key={m.mailboxId}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="w-3 text-[10px] text-text-faint tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-text">
                          {m.mailboxEmail}
                        </div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${share * 100}%` }}
                            transition={{
                              duration: 0.7,
                              delay: 0.2 + i * 0.06,
                            }}
                            className="h-full bg-accent"
                          />
                        </div>
                      </div>
                      <span className="text-[10px] tabular-nums text-text-dim">
                        {m.eventsToday}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-4 border-t border-border-muted pt-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
                  Open alerts
                </div>
                <span className="text-[10px] text-text-dim">
                  {alerts.length}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {alerts.slice(0, 3).map((a) => {
                  const tone = SEVERITY_TONE[a.severity];
                  const t = TONE_CLASS[tone];
                  return (
                    <li
                      key={a.id}
                      className="flex items-start gap-2 text-[11px] text-text-dim"
                    >
                      <span
                        className={
                          'mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ' +
                          t.bg
                        }
                      />
                      <span className="line-clamp-2 text-text">
                        {a.message}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-4 rounded-xl border border-border-muted/60 bg-surface-2/60 p-3 text-[11px] text-text-dim">
              <span className="text-text">{workspace.name}</span> spans{' '}
              <span className="text-text">{workspace.subClientCount}</span>{' '}
              sub-clients and{' '}
              <span className="text-text">{workspace.mailboxCount}</span>{' '}
              mailboxes.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function InspectorHeader({
  title,
  tone,
  icon: Icon,
}: {
  title: string;
  tone: Tone;
  icon: typeof Activity;
}): JSX.Element {
  const t = TONE_CLASS[tone];
  return (
    <div className="flex items-center gap-2">
      <div
        className={
          'flex h-7 w-7 items-center justify-center rounded-lg border ' +
          t.softBorder +
          ' ' +
          t.softBg
        }
      >
        <Icon className={'h-3.5 w-3.5 ' + t.text} />
      </div>
      <div className="text-sm font-semibold text-text">{title}</div>
    </div>
  );
}

function SnapshotStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: Tone;
}): JSX.Element {
  const c = useCountUp(value);
  const t = TONE_CLASS[tone];
  return (
    <div className="rounded-xl border border-border-muted/60 bg-surface-2/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-faint">
        <Icon className={'h-3 w-3 ' + t.text} />
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-text">
        {formatNumber(c)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExpandedTile — fullscreen modal driven by layoutId
// ---------------------------------------------------------------------------

interface ExpandedProps extends Omit<BentoProps, 'selectedEventId' | 'onSelectEvent' | 'hovered' | 'onHover' | 'onExpand'> {
  tileKey: TileKey;
  onClose: () => void;
}

function ExpandedTile(props: ExpandedProps): JSX.Element {
  const {
    tileKey,
    onClose,
    heroEvent,
    hourlyVolume,
    distribution,
    topMailbox,
    providerMix,
    heatmap,
    alerts,
    activeNow,
    events,
    mailboxTotal,
  } = props;

  const meta = TILE_META[tileKey];

  return (
    <>
      <motion.div
        key="scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-bg/85 backdrop-blur"
      />
      <motion.div
        layoutId={`bento-${tileKey}`}
        transition={{
          type: 'spring',
          stiffness: 240,
          damping: 28,
        }}
        className="fixed inset-x-4 inset-y-8 z-50 overflow-hidden rounded-3xl border border-border-muted bg-surface shadow-2xl lg:inset-x-16 lg:inset-y-12"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border-muted px-6 py-4">
            <div className="flex items-center gap-3">
              <div
                className={
                  'flex h-9 w-9 items-center justify-center rounded-xl border ' +
                  TONE_CLASS[meta.tone].softBorder +
                  ' ' +
                  TONE_CLASS[meta.tone].softBg
                }
              >
                <meta.icon className={'h-4 w-4 ' + TONE_CLASS[meta.tone].text} />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-text-faint">
                  Expanded view
                </div>
                <div className="text-base font-semibold text-text">
                  {meta.title}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-3 py-1.5 text-xs text-text-dim hover:text-text"
            >
              <X className="h-3.5 w-3.5" />
              Close
              <span className="ml-1 rounded bg-surface px-1 text-[10px] text-text-faint">
                Esc
              </span>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <ExpandedBody
              tileKey={tileKey}
              heroEvent={heroEvent}
              hourlyVolume={hourlyVolume}
              distribution={distribution}
              topMailbox={topMailbox}
              providerMix={providerMix}
              heatmap={heatmap}
              alerts={alerts}
              activeNow={activeNow}
              events={events}
              mailboxTotal={mailboxTotal}
            />
            <p className="mt-4 max-w-2xl text-xs leading-relaxed text-text-dim">
              {meta.blurb}
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function ExpandedBody(props: {
  tileKey: TileKey;
  heroEvent: AgencyActivityData['events'][number] | null;
  hourlyVolume: AgencyActivityData['hourlyVolume'];
  distribution: Record<ActionKind, number>;
  topMailbox: AgencyActivityData['topActiveMailboxes'][number] | null;
  providerMix: Array<{ provider: MailboxProvider; count: number; share: number }>;
  heatmap: AgencyActivityData['weeklyHeatmap'];
  alerts: AgencyActivityData['alerts'];
  activeNow: { count: number; byProvider: Record<MailboxProvider, number> };
  events: AgencyActivityData['events'];
  mailboxTotal: number;
}): JSX.Element {
  const {
    tileKey,
    heroEvent,
    hourlyVolume,
    distribution,
    topMailbox,
    providerMix,
    heatmap,
    alerts,
    activeNow,
    events,
    mailboxTotal,
  } = props;

  switch (tileKey) {
    case 'hero':
      return (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-border-muted bg-surface-2/40 p-5">
              <HeroEventTile event={heroEvent} />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
              Related recent
            </div>
            <ul className="flex flex-col gap-2">
              {events.slice(0, 6).map((e) => {
                const t = TONE_CLASS[ACTION_TONE[e.kind]];
                const Icon = ACTION_ICON[e.kind];
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-2 rounded-xl border border-border-muted/60 bg-surface-2/60 p-2.5"
                  >
                    <Icon className={'h-3.5 w-3.5 ' + t.text} />
                    <span className="min-w-0 flex-1 truncate text-xs text-text">
                      {e.mailboxEmail}
                    </span>
                    <span className="text-[10px] text-text-faint">
                      {e.timeAgo}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      );
    case 'volume':
      return (
        <div className="space-y-4">
          <div className="h-72 rounded-3xl border border-border-muted bg-surface-2/40 p-4">
            <AreaChart hours={hourlyVolume} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiBlock
              label="Peak hour"
              value={
                hourlyVolume.reduce<{ hour: string; total: number }>(
                  (acc, h) => {
                    const total = h.sends + h.opens + h.replies + h.rescues;
                    return total > acc.total ? { hour: h.hour, total } : acc;
                  },
                  { hour: '--', total: 0 },
                ).hour
              }
              tone="accent"
            />
            <KpiBlock
              label="Total"
              value={hourlyVolume
                .reduce(
                  (acc, h) => acc + h.sends + h.opens + h.replies + h.rescues,
                  0,
                )
                .toString()}
              tone="accent2"
            />
            <KpiBlock
              label="Sends"
              value={hourlyVolume.reduce((a, h) => a + h.sends, 0).toString()}
              tone="accent2"
            />
            <KpiBlock
              label="Replies"
              value={hourlyVolume.reduce((a, h) => a + h.replies, 0).toString()}
              tone="accent"
            />
          </div>
        </div>
      );
    case 'distribution':
      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-border-muted bg-surface-2/40 p-4">
            <DistributionTile distribution={distribution} />
          </div>
          <div className="space-y-2">
            {(
              [
                'sent',
                'opened',
                'replied',
                'starred',
                'spam_rescue',
                'bounce',
              ] as ActionKind[]
            ).map((kind) => {
              const total =
                Object.values(distribution).reduce((a, b) => a + b, 0) || 1;
              const share = distribution[kind] / total;
              const t = TONE_CLASS[ACTION_TONE[kind]];
              const Icon = ACTION_ICON[kind];
              return (
                <div
                  key={kind}
                  className="flex items-center gap-3 rounded-2xl border border-border-muted/60 bg-surface-2/60 p-3"
                >
                  <Icon className={'h-4 w-4 ' + t.text} />
                  <span className="w-24 text-xs text-text">
                    {ACTION_LABEL[kind]}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                    <motion.div
                      className={'h-full ' + t.bg}
                      initial={{ width: 0 }}
                      animate={{ width: `${share * 100}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs tabular-nums text-text">
                    {distribution[kind]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    case 'topMailbox':
      return (
        <div className="rounded-3xl border border-border-muted bg-surface-2/40 p-5">
          <TopMailboxTile topMailbox={topMailbox} />
        </div>
      );
    case 'providerMix':
      return (
        <div className="rounded-3xl border border-border-muted bg-surface-2/40 p-5">
          <ProviderMixTile providerMix={providerMix} />
        </div>
      );
    case 'heatmap':
      return (
        <div className="h-[460px] rounded-3xl border border-border-muted bg-surface-2/40 p-4">
          <HeatmapTile heatmap={heatmap} />
        </div>
      );
    case 'alerts':
      return (
        <div className="space-y-2">
          {alerts.map((a) => {
            const t = TONE_CLASS[SEVERITY_TONE[a.severity]];
            const Icon = ALERT_KIND_ICON[a.kind];
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 rounded-2xl border border-border-muted/60 bg-surface-2/60 p-3"
              >
                <div
                  className={
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ' +
                    t.softBorder +
                    ' ' +
                    t.softBg
                  }
                >
                  <Icon className={'h-4 w-4 ' + t.text} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-text-dim">
                    {ALERT_KIND_LABEL[a.kind]} · {a.timeAgo}
                  </div>
                  <div className="text-sm text-text">{a.message}</div>
                  {a.subClientName ? (
                    <div className="mt-0.5 text-xs text-text-dim">
                      {a.subClientName}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      );
    case 'activeNow':
      return (
        <div className="rounded-3xl border border-border-muted bg-surface-2/40 p-5">
          <ActiveNowTile activeNow={activeNow} mailboxTotal={mailboxTotal} />
        </div>
      );
    case 'carousel':
      return (
        <div className="space-y-2">
          {events.slice(0, 20).map((e) => {
            const t = TONE_CLASS[ACTION_TONE[e.kind]];
            const Icon = ACTION_ICON[e.kind];
            return (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-2xl border border-border-muted/60 bg-surface-2/60 p-3"
              >
                <Icon className={'h-4 w-4 ' + t.text} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text">
                    {e.mailboxEmail}
                  </div>
                  <div className="truncate text-[11px] text-text-dim">
                    {e.subClientName} · {PROVIDER_LABEL[e.provider]}
                  </div>
                </div>
                <span className="text-xs text-text-dim">{e.timeAgo}</span>
              </div>
            );
          })}
        </div>
      );
    default:
      return <div className="text-sm text-text-dim">No detail.</div>;
  }
}

function KpiBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}): JSX.Element {
  const t = TONE_CLASS[tone];
  return (
    <div className="rounded-2xl border border-border-muted/60 bg-surface-2/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-faint">
        {label}
      </div>
      <div className={'mt-0.5 text-lg font-semibold ' + t.text}>{value}</div>
    </div>
  );
}

export default AgActS2Bento;
