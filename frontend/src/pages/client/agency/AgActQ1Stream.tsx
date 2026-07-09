import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AnimatePresence, motion, useAnimationFrame } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Clock,
  Filter,
  Gauge,
  Globe,
  Inbox,
  Mail,
  MailOpen,
  Pause,
  Play,
  Radio,
  Reply,
  Search,
  Send,
  Shield,
  Siren,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgActQ1Stream — Agency-tier Activity, design candidate Q1, "Live Activity Stream".
 *
 * The Activity surface for an agency reads like an operations console: dozens
 * of sub-clients, hundreds of mailboxes, thousands of warmup events per day.
 * Q1 leans into the streaming nature of that data: the page is a vertical
 * event feed, Stripe / Vercel / Datadog style, where new events SLIDE IN
 * FROM THE TOP and the rest of the list shifts down with a FLIP layout
 * transition. Each event is a rich card showing the action, the sub-client
 * + mailbox, the peer (where applicable), and a status pill.
 *
 * Composition:
 *
 *   - TOP HEADER: agency name + region pill + "Live · streaming" indicator
 *     with a continuously breathing accent dot, then 8 KPI tiles (Events
 *     today / Sends / Opens / Replies / Peer interactions / Spam rescues /
 *     Events last hour / Avg events per minute) with odometer count-up on
 *     mount, plus a MoM-growth-ish "vs yesterday" chip and a PAUSE STREAM
 *     toggle.
 *
 *   - FILTER BAR: action-type chips (All / Sent / Opened / Replied /
 *     Starred / Spam-rescued / Bounce) with live counts that update as the
 *     stream advances, sub-client chips, and a mailbox-email search input.
 *
 *   - MAIN CANVAS (lg:col-span-8): vertical stack of EVENT CARDS, most
 *     recent at top. Each card has a status-tinted 4px left accent border
 *     keyed to the action kind (sent=accent2, opened=accent,
 *     replied=accent, starred=accent4, spam_rescue=accent4, bounce=accent3),
 *     a status-tinted square icon, a logoChar tile for the sub-client, the
 *     mailbox email, an action description, a provider tag, a status badge
 *     and a relative timestamp. Hover lifts the card and adds an accent
 *     border-glow; click selects the event so the inspector panel can show
 *     its full context.
 *
 *   - RIGHT INSPECTOR (lg:col-span-4): "Today's heartbeat" — a sparkline of
 *     events / min over the last hour with a cursor-tracking vertical
 *     guide, dot and tooltip; a "Top active mailboxes" list with bars; a
 *     recent-alerts ticker that cross-fades through the open alerts; and a
 *     provider distribution mini-bar showing which providers have been
 *     most active today.
 *
 *   - ANIMATIONS: new events `y: -40, opacity: 0` → `y: 0, opacity: 1` with
 *     spring physics; older events shift down with `layout` FLIP. New cards
 *     get a 1.2s accent border-glow that fades. KPI counters count up on
 *     mount. The live indicator dot breathes (1.5s loop). The inspector
 *     sparkline tracks the cursor with a vertical guide + tooltip.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * The harness mounts it prop-less; every value comes from the inline MOCK
 * const. Renders only page content; the shell supplies sidebar / chrome.
 *
 * NOT a heatmap (sibling Q3 owns that), NOT a journey timeline (sibling
 * Q2), NOT a kanban-per-action board (sibling Q4). The streaming feed +
 * sliding-in cards + KPI count-up + inspector heartbeat is the identity.
 */

// ---------------------------------------------------------------------------
// Shared Agency Activity data shape — kept in sync across all 4 variants.
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

const PROVIDER_BY_INDEX: MailboxProvider[] = ['gmail', 'outlook', 'yahoo', 'smtp'];
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

/**
 * Generate a deterministic spread of 50 events across the last ~4 hours.
 *
 * - actionKind cycles through a weighted bag so opens / sends dominate and
 *   spam_rescue / bounce remain rare (matching real warmup signal).
 * - sub-clients rotate so every brand is visible in the feed.
 * - providers spread Gmail-heavy with Outlook secondary.
 * - peerEmail is filled in for everything except bounces.
 * - timeAgo is a pre-computed string ('Just now', '12s ago', '3m ago', …).
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
  const out: AgencyActivityData['events'] = [];
  // Each event is offset by 4–7 minutes from the previous one so the visible
  // window spans roughly 4 hours.
  let secondsBack = 8; // newest event lands 8s ago
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
    out.push({
      id: `evt-${i.toString().padStart(3, '0')}`,
      kind,
      timestamp: new Date(tsMs).toISOString(),
      timeAgo: formatTimeAgo(secondsBack),
      mailboxId: `${sub.id}-mbx-${mboxIdx}`,
      mailboxEmail: `${['outreach', 'team', 'hello', 'sales', 'growth', 'sam', 'mia', 'devon', 'priya', 'leo', 'kira', 'noor'][mboxIdx - 1]}@${sub.domain}`,
      provider,
      subClientId: sub.id,
      subClientName: sub.name,
      subClientLogoChar: sub.logoChar,
      peerEmail: peer,
      note,
    });
    // Move the clock further back. Bag of intervals so the spacing feels
    // organic rather than uniform.
    const stepSec = pickFrom([28, 41, 95, 62, 137, 49, 78, 184, 53, 91], i, 60);
    secondsBack += stepSec;
  }
  return out;
}

function formatTimeAgo(seconds: number): string {
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const MOCK_EVENTS = buildMockEvents();

/** Build 24 hourly buckets matching MOCK_EVENTS volume curves. */
function buildMockHourly(): AgencyActivityData['hourlyVolume'] {
  // Volume bell-curves around mid-morning + mid-afternoon. Hours run from
  // 24h ago (index 0) to "now" (index 23).
  const SEND_BASELINE = [
    8, 6, 4, 3, 4, 6, 12, 18, 26, 34, 41, 36, 32, 38, 44, 42, 36, 28, 22, 18,
    14, 12, 10, 9,
  ];
  const OPEN_RATIO = 1.7; // opens-to-send ratio
  const REPLY_RATIO = 0.48;
  const RESCUE_RATIO = 0.02;
  const out: AgencyActivityData['hourlyVolume'] = [];
  for (let h = 0; h < 24; h++) {
    const base = SEND_BASELINE[h] ?? 10;
    const wobble = ((h * 13) % 7) - 3; // -3..+3
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
      // Bell-shaped distribution centred on weekday mornings.
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
 * Skeleton fallback for the future live adapter — used when the API hasn't
 * loaded yet (or has failed) so we don't render mock data the user might
 * mistake for their own. Every collection is empty.
 */
export const AGENCY_ACTIVITY_SKELETON_Q1: AgencyActivityData = {
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
  surface: '#13131d',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  text: '#e8e8f0',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
} as const;

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

type Tone = 'accent' | 'accent2' | 'accent3' | 'accent4';

const ACTION_TONE: Record<ActionKind, Tone> = {
  sent: 'accent2',
  opened: 'accent',
  replied: 'accent',
  starred: 'accent4',
  spam_rescue: 'accent4',
  bounce: 'accent3',
};

const ACTION_VERB_PREFIX: Record<ActionKind, string> = {
  sent: 'Sent warmup email to',
  opened: 'Opened by',
  replied: 'Reply received from',
  starred: 'Starred by',
  spam_rescue: 'Rescued from spam by',
  bounce: 'Delivery bounced for',
};

const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
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
  }
> = {
  accent: {
    text: 'text-accent',
    bg: 'bg-accent',
    border: 'border-accent',
    softBg: 'bg-accent/10',
    softBorder: 'border-accent/30',
    ring: 'ring-accent/40',
    glow: 'shadow-[0_0_24px_-6px_rgba(242, 101, 34,0.45)]',
  },
  accent2: {
    text: 'text-accent2',
    bg: 'bg-accent2',
    border: 'border-accent2',
    softBg: 'bg-accent2/10',
    softBorder: 'border-accent2/30',
    ring: 'ring-accent2/40',
    glow: 'shadow-[0_0_24px_-6px_rgba(255, 138, 75,0.45)]',
  },
  accent3: {
    text: 'text-accent3',
    bg: 'bg-accent3',
    border: 'border-accent3',
    softBg: 'bg-accent3/10',
    softBorder: 'border-accent3/30',
    ring: 'ring-accent3/40',
    glow: 'shadow-[0_0_24px_-6px_rgba(255,107,74,0.45)]',
  },
  accent4: {
    text: 'text-accent4',
    bg: 'bg-accent4',
    border: 'border-accent4',
    softBg: 'bg-accent4/10',
    softBorder: 'border-accent4/30',
    ring: 'ring-accent4/40',
    glow: 'shadow-[0_0_24px_-6px_rgba(255,213,79,0.45)]',
  },
};

function toneFromAction(kind: ActionKind): Tone {
  return ACTION_TONE[kind];
}

function toneFromSeverity(severity: AlertSeverity): Tone {
  return SEVERITY_TONE[severity];
}

// ---------------------------------------------------------------------------
// useCountUp — odometer-style mount animation
// ---------------------------------------------------------------------------

/**
 * Smoothly counts from 0 → target over `durationMs`. Uses an ease-out curve
 * so the number races out of the gate and decelerates to land precisely on
 * `target`. Returns an integer if `target` is integer, otherwise preserves
 * one decimal place.
 */
function useCountUpClean(target: number, durationMs = 1100): number {
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

  // Reset if target changes (e.g. when data reloads).
  useEffect(() => {
    startRef.current = null;
    doneRef.current = false;
    setValue(0);
  }, [target]);

  return value;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type FilterKind = 'all' | ActionKind;

export function AgActQ1Stream(
  { data }: { data?: AgencyActivityData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  const [filter, setFilter] = useState<FilterKind>('all');
  const [selectedSubClient, setSelectedSubClient] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState<string>('');
  const [paused, setPaused] = useState<boolean>(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // The visible stream — newest first. We initialise it from the mock and
  // (when not paused) periodically prepend a synthetic new event so the
  // streaming animation has something to bite on.
  const [streamEvents, setStreamEvents] = useState(d.events);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());

  // Synthetic streaming: every 5–9s, slide a new event in from the top.
  // (Skip when the consumer pauses or when the underlying `data` changes
  // — the real adapter will manage its own websocket so we only do this
  // for the mock case.)
  useEffect(() => {
    if (data) return; // real adapter — don't fake events
    if (paused) return;
    const interval = setInterval(
      () => {
        setStreamEvents((prev) => {
          const id = `evt-live-${Date.now()}`;
          const KIND_BAG: ActionKind[] = [
            'opened',
            'sent',
            'opened',
            'sent',
            'replied',
            'opened',
            'starred',
            'sent',
            'opened',
            'spam_rescue',
          ];
          const PROVIDER_BAG: MailboxProvider[] = [
            'gmail',
            'gmail',
            'gmail',
            'outlook',
            'outlook',
            'yahoo',
          ];
          const seed = prev.length + Date.now();
          const kind = pickFrom(KIND_BAG, seed, 'opened');
          const sub = pickFrom(SUB_CLIENTS, seed * 3 + 1, SUB_CLIENTS[0]!);
          const provider = pickFrom(PROVIDER_BAG, seed * 7 + 2, 'gmail');
          const mboxIdx = (seed % 12) + 1;
          const noteList = ACTION_NOTE_BY_KIND[kind];
          const note = pickFrom(noteList, seed * 11 + 4, '');
          const peer =
            kind === 'bounce'
              ? null
              : `peer-${String((seed * 17 + 91) % 220).padStart(3, '0')}@peer-net.io`;
          const newEvent: AgencyActivityData['events'][number] = {
            id,
            kind,
            timestamp: new Date().toISOString(),
            timeAgo: 'Just now',
            mailboxId: `${sub.id}-mbx-${mboxIdx}`,
            mailboxEmail: `${['outreach', 'team', 'hello', 'sales', 'growth', 'sam', 'mia', 'devon', 'priya', 'leo', 'kira', 'noor'][mboxIdx - 1]}@${sub.domain}`,
            provider,
            subClientId: sub.id,
            subClientName: sub.name,
            subClientLogoChar: sub.logoChar,
            peerEmail: peer,
            note,
          };
          // Cap the list at 60 to keep the DOM lean.
          return [newEvent, ...prev].slice(0, 60);
        });
      },
      4500 + Math.floor(Math.random() * 4500),
    );
    return () => clearInterval(interval);
  }, [paused, data]);

  // Whenever streamEvents grows, mark the new event id as "fresh" for
  // 1.2s so the card can render with an accent border-glow.
  const prevEventIds = useRef<Set<string>>(new Set(d.events.map((e) => e.id)));
  useEffect(() => {
    const current = new Set(streamEvents.map((e) => e.id));
    const fresh: string[] = [];
    current.forEach((id) => {
      if (!prevEventIds.current.has(id)) fresh.push(id);
    });
    prevEventIds.current = current;
    if (fresh.length === 0) return;
    setNewEventIds((prev) => {
      const next = new Set(prev);
      fresh.forEach((id) => next.add(id));
      return next;
    });
    const tid = setTimeout(() => {
      setNewEventIds((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => next.delete(id));
        return next;
      });
    }, 1200);
    return () => clearTimeout(tid);
  }, [streamEvents]);

  // Live counts per filter — recompute on every stream change.
  const filterCounts = useMemo(() => {
    const counts: Record<FilterKind, number> = {
      all: streamEvents.length,
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescue: 0,
      bounce: 0,
    };
    streamEvents.forEach((e) => {
      counts[e.kind] += 1;
    });
    return counts;
  }, [streamEvents]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return streamEvents.filter((e) => {
      if (filter !== 'all' && e.kind !== filter) return false;
      if (selectedSubClient && e.subClientId !== selectedSubClient) return false;
      if (q) {
        if (
          !e.mailboxEmail.toLowerCase().includes(q) &&
          !e.subClientName.toLowerCase().includes(q) &&
          !(e.peerEmail?.toLowerCase().includes(q) ?? false)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [streamEvents, filter, selectedSubClient, search]);

  const selectedEvent = useMemo(
    () => streamEvents.find((e) => e.id === selectedEventId) ?? null,
    [streamEvents, selectedEventId],
  );

  return (
    <div className="relative space-y-5">
      {/* Ambient gradient backdrop — keeps the page from feeling flat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            'radial-gradient(1100px 600px at 12% -8%, rgba(242, 101, 34,0.10), transparent 65%), radial-gradient(900px 500px at 95% 8%, rgba(255, 138, 75,0.07), transparent 60%)',
        }}
      />

      <PageHeader
        data={d}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        liveEventCount={streamEvents.length}
      />

      <FilterBar
        filter={filter}
        onFilter={setFilter}
        counts={filterCounts}
        subClients={SUB_CLIENTS}
        selectedSubClient={selectedSubClient}
        onSelectSubClient={setSelectedSubClient}
        search={search}
        onSearchChange={setSearch}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="lg:col-span-8">
          <EventStream
            events={filteredEvents}
            totalCount={streamEvents.length}
            paused={paused}
            newEventIds={newEventIds}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            filter={filter}
          />
        </div>

        <div className="lg:col-span-4">
          <Inspector
            data={d}
            paused={paused}
            selectedEvent={selectedEvent}
            onCloseEvent={() => setSelectedEventId(null)}
          />
        </div>
      </motion.div>
    </div>
  );
}

export default AgActQ1Stream;

// ---------------------------------------------------------------------------
// Page header — workspace identity / KPI tiles / pause toggle
// ---------------------------------------------------------------------------

function PageHeader({
  data,
  paused,
  onTogglePause,
  liveEventCount,
}: {
  data: AgencyActivityData;
  paused: boolean;
  onTogglePause: () => void;
  liveEventCount: number;
}): JSX.Element {
  const { workspace, kpis } = data;
  // 8 KPI tiles. Each one has its own count-up so they don't all fire at
  // the exact same moment — small staggers feel premium.
  const KPI_TILES: Array<{
    label: string;
    value: number;
    suffix?: string;
    icon: typeof Activity;
    tone: Tone;
    delay: number;
    decimalSuffix?: boolean;
  }> = [
    {
      label: 'Events today',
      value: kpis.eventsToday,
      icon: Activity,
      tone: 'accent',
      delay: 0,
    },
    {
      label: 'Sends',
      value: kpis.sendsToday,
      icon: Send,
      tone: 'accent2',
      delay: 0.05,
    },
    {
      label: 'Opens',
      value: kpis.opensToday,
      icon: MailOpen,
      tone: 'accent',
      delay: 0.1,
    },
    {
      label: 'Replies',
      value: kpis.repliesToday,
      icon: Reply,
      tone: 'accent',
      delay: 0.15,
    },
    {
      label: 'Peer interactions',
      value: kpis.peerInteractionsToday,
      icon: Users,
      tone: 'accent2',
      delay: 0.2,
    },
    {
      label: 'Spam rescues',
      value: kpis.spamRescuesToday,
      icon: Shield,
      tone: 'accent4',
      delay: 0.25,
    },
    {
      label: 'Events / hr',
      value: kpis.eventsLastHour,
      icon: Zap,
      tone: 'accent2',
      delay: 0.3,
    },
    {
      label: 'Events / min',
      value: kpis.avgEventsPerMin,
      icon: Gauge,
      tone: 'accent',
      delay: 0.35,
      decimalSuffix: true,
    },
  ];

  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-2xl border border-border-muted bg-surface/60 px-5 py-4 backdrop-blur-xl"
    >
      {/* Top row: identity + live indicator + pause toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-accent2/30 bg-accent2/10 text-accent2">
            <Radio className="h-6 w-6" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                {workspace.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                <Globe className="h-2.5 w-2.5" />
                us-east-1
              </span>
              <LiveIndicator paused={paused} />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                <Sparkles className="h-2.5 w-2.5" />
                Activity stream
              </span>
            </div>
            <p className="text-sm text-text-dim">
              {workspace.subClientCount > 0 ? (
                <>
                  Streaming events from{' '}
                  <span className="font-mono text-text">
                    {workspace.mailboxCount}
                  </span>{' '}
                  mailboxes across{' '}
                  <span className="font-mono text-text">
                    {workspace.subClientCount}
                  </span>{' '}
                  sub-client
                  {workspace.subClientCount === 1 ? '' : 's'}
                  {' · '}
                  <span className="font-mono text-text">
                    {formatNumber(liveEventCount)}
                  </span>{' '}
                  events in view
                </>
              ) : (
                'No sub-clients connected yet'
              )}
            </p>
          </div>
        </div>

        {/* Right: pause toggle + vs-yesterday chip */}
        <div className="flex flex-wrap items-center gap-2">
          <VsYesterdayChip eventsToday={kpis.eventsToday} />
          <button
            type="button"
            onClick={onTogglePause}
            className={`group inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
              paused
                ? 'border-accent2/40 bg-accent2/10 text-accent2 hover:bg-accent2/15'
                : 'border-accent3/40 bg-accent3/10 text-accent3 hover:bg-accent3/15'
            }`}
          >
            {paused ? (
              <>
                <Play className="h-3.5 w-3.5" />
                Resume stream
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5" />
                Pause stream
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI tiles — 8 columns on lg+, wraps gracefully on smaller widths. */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
        {KPI_TILES.map((tile) => (
          <KpiTile key={tile.label} tile={tile} />
        ))}
      </div>
    </motion.header>
  );
}

function LiveIndicator({ paused }: { paused: boolean }): JSX.Element {
  if (paused) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent3/30 bg-accent3/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent3">
        <Pause className="h-2.5 w-2.5" />
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
      <motion.span
        className="grid h-2 w-2 place-items-center rounded-full bg-accent"
        animate={{
          opacity: [1, 0.4, 1],
          scale: [1, 0.85, 1],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      Live · streaming
    </span>
  );
}

function VsYesterdayChip({
  eventsToday,
}: {
  eventsToday: number;
}): JSX.Element {
  // Synthetic comparison — would come from real adapter eventually.
  const deltaPct = eventsToday === 0 ? 0 : 12.4;
  const up = deltaPct >= 0;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/70 px-3 py-1.5 text-xs">
      <span
        className={`grid h-5 w-5 place-items-center rounded-full ${
          up ? 'bg-accent/15 text-accent' : 'bg-accent3/15 text-accent3'
        }`}
      >
        {up ? (
          <ArrowUpRight className="h-3 w-3" />
        ) : (
          <ArrowDownRight className="h-3 w-3" />
        )}
      </span>
      <span className="text-text-dim">vs yesterday</span>
      <span
        className={`font-mono font-semibold ${
          up ? 'text-accent' : 'text-accent3'
        }`}
      >
        {up ? '+' : ''}
        {deltaPct.toFixed(1)}%
      </span>
    </span>
  );
}

function KpiTile({
  tile,
}: {
  tile: {
    label: string;
    value: number;
    suffix?: string;
    icon: typeof Activity;
    tone: Tone;
    delay: number;
    decimalSuffix?: boolean;
  };
}): JSX.Element {
  const { label, value, icon: Icon, tone, delay, decimalSuffix } = tile;
  const counted = useCountUpClean(value, 1100);
  const tc = TONE_CLASS[tone];
  const display = decimalSuffix
    ? counted.toFixed(1)
    : Number.isInteger(value)
      ? formatNumber(Math.round(counted))
      : formatNumber(counted);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
      className="group relative rounded-xl border border-border-muted bg-surface-2/50 px-3 py-3 transition hover:border-border-muted/80 hover:bg-surface-2/80"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
            {label}
          </p>
          <p className="font-mono text-xl font-semibold leading-tight text-text">
            {display}
          </p>
        </div>
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${tc.softBorder} ${tc.softBg} ${tc.text}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Filter bar — chips + search
// ---------------------------------------------------------------------------

function FilterBar({
  filter,
  onFilter,
  counts,
  subClients,
  selectedSubClient,
  onSelectSubClient,
  search,
  onSearchChange,
}: {
  filter: FilterKind;
  onFilter: (f: FilterKind) => void;
  counts: Record<FilterKind, number>;
  subClients: typeof SUB_CLIENTS;
  selectedSubClient: string | null;
  onSelectSubClient: (id: string | null) => void;
  search: string;
  onSearchChange: (v: string) => void;
}): JSX.Element {
  const FILTERS: Array<{ id: FilterKind; label: string; tone: Tone | 'neutral' }> =
    [
      { id: 'all', label: 'All', tone: 'neutral' },
      { id: 'sent', label: 'Sent', tone: 'accent2' },
      { id: 'opened', label: 'Opened', tone: 'accent' },
      { id: 'replied', label: 'Replied', tone: 'accent' },
      { id: 'starred', label: 'Starred', tone: 'accent4' },
      { id: 'spam_rescue', label: 'Spam-rescued', tone: 'accent4' },
      { id: 'bounce', label: 'Bounce', tone: 'accent3' },
    ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay: 0.04 }}
      className="rounded-2xl border border-border-muted bg-surface/40 px-4 py-3 backdrop-blur-xl"
    >
      {/* Action chips row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
          <Filter className="h-3 w-3" />
          Action
        </span>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <FilterChip
              key={f.id}
              label={f.label}
              count={counts[f.id]}
              tone={f.tone}
              active={active}
              onClick={() => onFilter(f.id)}
            />
          );
        })}
      </div>

      {/* Sub-client + search row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
          <Building2 className="h-3 w-3" />
          Sub-client
        </span>
        <button
          type="button"
          onClick={() => onSelectSubClient(null)}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
            selectedSubClient === null
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border-muted bg-surface-2/50 text-text-dim hover:border-border-muted/80 hover:text-text'
          }`}
        >
          All clients
        </button>
        {subClients.map((sc) => {
          const active = selectedSubClient === sc.id;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() =>
                onSelectSubClient(active ? null : sc.id)
              }
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border-muted bg-surface-2/50 text-text-dim hover:border-border-muted/80 hover:text-text'
              }`}
            >
              <span
                className={`grid h-4 w-4 place-items-center rounded-md text-[9px] font-bold ${
                  active
                    ? 'bg-accent/20 text-accent'
                    : 'bg-surface-2 text-text-dim'
                }`}
              >
                {sc.logoChar}
              </span>
              {sc.name}
            </button>
          );
        })}

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search mailbox or peer…"
            className="w-56 rounded-full border border-border-muted bg-surface-2/60 py-1.5 pl-8 pr-3 text-xs text-text placeholder:text-text-faint focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>
    </motion.div>
  );
}

function FilterChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: Tone | 'neutral';
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const toneClasses =
    tone === 'neutral'
      ? active
        ? 'border-accent/40 bg-accent/10 text-accent'
        : 'border-border-muted bg-surface-2/50 text-text-dim hover:border-border-muted/80 hover:text-text'
      : active
        ? `${TONE_CLASS[tone].softBorder} ${TONE_CLASS[tone].softBg} ${TONE_CLASS[tone].text}`
        : 'border-border-muted bg-surface-2/50 text-text-dim hover:border-border-muted/80 hover:text-text';

  const countTone =
    tone === 'neutral' || !active
      ? 'bg-surface text-text-dim'
      : `${TONE_CLASS[tone].softBg} ${TONE_CLASS[tone].text}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${toneClasses}`}
    >
      {label}
      <span
        className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-px font-mono text-[10px] ${countTone}`}
      >
        {count}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Event stream — the main vertical feed of cards
// ---------------------------------------------------------------------------

function EventStream({
  events,
  totalCount,
  paused,
  newEventIds,
  selectedEventId,
  onSelectEvent,
  filter,
}: {
  events: AgencyActivityData['events'];
  totalCount: number;
  paused: boolean;
  newEventIds: Set<string>;
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  filter: FilterKind;
}): JSX.Element {
  // Cap displayed events to keep the DOM lean; the inspector still tracks
  // the underlying stream for KPIs.
  const visible = events.slice(0, 30);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-text">
            Live event feed
          </h2>
          <span className="font-mono text-[11px] text-text-faint">
            {formatNumber(events.length)} of {formatNumber(totalCount)}{' '}
            visible
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-text-faint">
          <Clock className="h-3 w-3" />
          {paused ? 'Paused' : 'Newest first'}
        </div>
      </div>

      <div className="relative rounded-2xl border border-border-muted bg-surface/40 p-3 backdrop-blur-xl">
        {/* Top-edge accent line — communicates "stream entry point". */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(242, 101, 34,0.55) 25%, rgba(255, 138, 75,0.55) 60%, transparent 100%)',
          }}
        />
        {visible.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="relative space-y-2">
            <AnimatePresence initial={false}>
              {visible.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isNew={newEventIds.has(event.id)}
                  isSelected={selectedEventId === event.id}
                  onSelect={() => onSelectEvent(event.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
        {visible.length > 0 && events.length > visible.length ? (
          <div className="mt-3 flex items-center justify-center rounded-xl border border-dashed border-border-muted/70 bg-surface-2/40 px-3 py-2">
            <span className="font-mono text-[11px] text-text-faint">
              + {formatNumber(events.length - visible.length)} older
              event
              {events.length - visible.length === 1 ? '' : 's'} below
              the fold
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: FilterKind }): JSX.Element {
  const label =
    filter === 'all'
      ? 'No events captured yet'
      : `No ${ACTION_LABEL[filter as ActionKind].toLowerCase()} events match the current filter`;
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-border-muted bg-surface-2/60 text-text-faint">
        <Inbox className="h-6 w-6" />
      </span>
      <p className="max-w-xs text-sm text-text-dim">{label}</p>
    </div>
  );
}

function EventCard({
  event,
  isNew,
  isSelected,
  onSelect,
}: {
  event: AgencyActivityData['events'][number];
  isNew: boolean;
  isSelected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const Icon = ACTION_ICON[event.kind];
  const tone = toneFromAction(event.kind);
  const tc = TONE_CLASS[tone];
  const description = buildDescription(event);

  // Card style — left accent border 4px, hover lift, isNew glow.
  // We can't easily animate a Tailwind shadow toggle, so the glow is
  // expressed via a CSS var that fades from 1 → 0 over 1.2s.
  const glowVar = isNew ? '1' : '0';

  return (
    <motion.button
      type="button"
      layout
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{
        type: 'spring',
        stiffness: 320,
        damping: 30,
        mass: 0.6,
      }}
      onClick={onSelect}
      className={`group relative block w-full overflow-hidden rounded-xl border bg-surface-2/40 text-left transition ${
        isSelected
          ? `${tc.softBorder} ${tc.softBg}`
          : 'border-border-muted hover:-translate-y-0.5 hover:border-border-muted/80 hover:bg-surface-2/70'
      }`}
      style={
        {
          '--card-glow': glowVar,
          boxShadow: isSelected
            ? `0 0 24px -6px ${HEX[tone]}55`
            : `0 0 28px -8px ${HEX[tone]}${isNew ? '66' : '00'}`,
          transition: 'box-shadow 1.2s ease-out, border-color 0.2s, background 0.2s, transform 0.18s',
        } as CSSProperties
      }
    >
      {/* Left accent border — 4px column tinted by action kind. */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-full w-1 ${tc.bg}`}
        style={{ opacity: isSelected ? 1 : 0.85 }}
      />

      <div className="flex items-start gap-3 px-4 py-3 pl-5">
        {/* Action icon square */}
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${tc.softBorder} ${tc.softBg} ${tc.text}`}
        >
          <Icon className="h-4 w-4" />
        </span>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Top row: logo char + sub-client + mailbox */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="grid h-5 w-5 place-items-center rounded-md border border-border-muted bg-surface text-[10px] font-bold text-text-dim">
              {event.subClientLogoChar}
            </span>
            <span className="font-semibold text-text">
              {event.subClientName}
            </span>
            <span className="text-text-faint">·</span>
            <span className="font-mono text-[11px] text-text-dim">
              {event.mailboxEmail}
            </span>
          </div>

          {/* Middle: action description */}
          <p className="text-sm leading-snug text-text">{description}</p>

          {/* Bottom row: provider + status + timestamp */}
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <ProviderTag provider={event.provider} />
            <span
              className={`inline-flex items-center gap-1 rounded-full border ${tc.softBorder} ${tc.softBg} px-2 py-0.5 font-mono uppercase tracking-[0.12em] ${tc.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${tc.bg}`} />
              {ACTION_LABEL[event.kind]}
            </span>
            <span className="font-mono text-text-faint">{event.note}</span>
            <span className="ml-auto inline-flex items-center gap-1 font-mono text-text-dim">
              <Clock className="h-3 w-3" />
              {event.timeAgo}
            </span>
          </div>
        </div>

        {/* Chevron — hover hint that the card is clickable. */}
        <span
          className={`mt-1 hidden shrink-0 text-text-faint transition group-hover:text-text-dim md:block ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </motion.button>
  );
}

function buildDescription(
  event: AgencyActivityData['events'][number],
): string {
  const verb = ACTION_VERB_PREFIX[event.kind];
  if (event.peerEmail) {
    return `${verb} ${event.peerEmail}`;
  }
  if (event.kind === 'bounce') {
    return `${verb} attempted recipient`;
  }
  return verb;
}

function ProviderTag({
  provider,
}: {
  provider: MailboxProvider;
}): JSX.Element {
  const colorByProvider: Record<MailboxProvider, string> = {
    gmail: 'border-accent3/30 bg-accent3/10 text-accent3',
    outlook: 'border-accent2/30 bg-accent2/10 text-accent2',
    yahoo: 'border-accent/30 bg-accent/10 text-accent',
    smtp: 'border-border-muted bg-surface text-text-dim',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono uppercase tracking-[0.12em] ${colorByProvider[provider]}`}
    >
      <Mail className="h-2.5 w-2.5" />
      {PROVIDER_LABEL[provider]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inspector panel — heartbeat sparkline / top mailboxes / alerts / providers
// ---------------------------------------------------------------------------

function Inspector({
  data,
  paused,
  selectedEvent,
  onCloseEvent,
}: {
  data: AgencyActivityData;
  paused: boolean;
  selectedEvent: AgencyActivityData['events'][number] | null;
  onCloseEvent: () => void;
}): JSX.Element {
  return (
    <div className="sticky top-4 space-y-3">
      <AnimatePresence mode="wait">
        {selectedEvent ? (
          <motion.div
            key={`event-${selectedEvent.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <EventDetailCard
              event={selectedEvent}
              onClose={onCloseEvent}
            />
          </motion.div>
        ) : (
          <motion.div
            key="default"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
          >
            <HeartbeatCard data={data} paused={paused} />
            <TopActiveMailboxesCard data={data} />
            <AlertsTickerCard data={data} />
            <ProviderDistributionCard data={data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EventDetailCard({
  event,
  onClose,
}: {
  event: AgencyActivityData['events'][number];
  onClose: () => void;
}): JSX.Element {
  const Icon = ACTION_ICON[event.kind];
  const tone = toneFromAction(event.kind);
  const tc = TONE_CLASS[tone];
  return (
    <div className="space-y-3 rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${tc.softBorder} ${tc.softBg} ${tc.text}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
            Event detail
          </p>
          <p className={`text-base font-semibold ${tc.text}`}>
            {ACTION_LABEL[event.kind]}
          </p>
          <p className="font-mono text-[11px] text-text-dim">
            {event.timeAgo} · {new Date(event.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-text-dim transition hover:border-border-muted/80 hover:text-text"
          aria-label="Close detail"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <DetailRow label="Sub-client">
        <span className="inline-flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-md border border-border-muted bg-surface-2 text-[10px] font-bold text-text">
            {event.subClientLogoChar}
          </span>
          <span className="text-sm font-medium text-text">
            {event.subClientName}
          </span>
        </span>
      </DetailRow>
      <DetailRow label="Mailbox">
        <span className="break-all font-mono text-xs text-text">
          {event.mailboxEmail}
        </span>
      </DetailRow>
      <DetailRow label="Provider">
        <ProviderTag provider={event.provider} />
      </DetailRow>
      {event.peerEmail ? (
        <DetailRow label="Peer">
          <span className="break-all font-mono text-xs text-text">
            {event.peerEmail}
          </span>
        </DetailRow>
      ) : null}
      <DetailRow label="Note">
        <span className="text-xs text-text-dim">{event.note}</span>
      </DetailRow>
      <DetailRow label="ID">
        <span className="font-mono text-[10px] text-text-faint">{event.id}</span>
      </DetailRow>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="grid grid-cols-[80px_1fr] items-start gap-3 border-t border-border-muted/60 pt-2 first:border-t-0 first:pt-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heartbeat card — sparkline of events/min over the last hour
// ---------------------------------------------------------------------------

function HeartbeatCard({
  data,
  paused,
}: {
  data: AgencyActivityData;
  paused: boolean;
}): JSX.Element {
  // We don't get a per-minute series in the contract, so we approximate
  // one by spreading the last 4 hourly buckets across 60 minutes with a
  // small sine wobble. This stays inside the variant since the shared
  // shape (.hourlyVolume) is the same across all 4 candidates.
  const minutes = useMemo(() => buildMinuteSeries(data.hourlyVolume), [
    data.hourlyVolume,
  ]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ idx: number; x: number; y: number } | null>(
    null,
  );

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const xRatio = (e.clientX - rect.left) / rect.width;
      if (xRatio < 0 || xRatio > 1 || minutes.length === 0) {
        setHovered(null);
        return;
      }
      const idx = Math.min(
        minutes.length - 1,
        Math.max(0, Math.floor(xRatio * minutes.length)),
      );
      setHovered({
        idx,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [minutes.length],
  );
  const onLeave = useCallback(() => setHovered(null), []);

  if (minutes.length === 0) {
    return (
      <Panel
        icon={Activity}
        title="Today's heartbeat"
        subtitle="No activity captured yet"
      >
        <div className="grid h-24 place-items-center text-xs text-text-faint">
          Awaiting first event…
        </div>
      </Panel>
    );
  }

  const max = Math.max(...minutes.map((m) => m.events));
  const W = 100; // viewBox-percent
  const H = 38;
  const step = W / (minutes.length - 1 || 1);
  const points = minutes
    .map((m, i) => {
      const x = i * step;
      const y = H - (max === 0 ? 0 : (m.events / max) * H);
      return `${x},${y}`;
    })
    .join(' ');
  const areaPath =
    `M0,${H} L` +
    minutes
      .map((m, i) => {
        const x = i * step;
        const y = H - (max === 0 ? 0 : (m.events / max) * H);
        return `${x},${y}`;
      })
      .join(' L') +
    ` L${W},${H} Z`;

  const cursorIdx = hovered?.idx ?? minutes.length - 1;
  const cursorMinute = minutes[cursorIdx] ?? minutes[minutes.length - 1]!;
  const cursorX = cursorIdx * step;
  const cursorY =
    H - (max === 0 ? 0 : (cursorMinute.events / max) * H);

  return (
    <Panel
      icon={Activity}
      title="Today's heartbeat"
      subtitle={paused ? 'Stream paused · 60min window' : 'Last 60 minutes'}
    >
      <div
        ref={containerRef}
        className="relative h-24 w-full cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {/* Subtle gridlines at 25% / 50% / 75% */}
          {[0.25, 0.5, 0.75].map((p) => (
            <line
              key={p}
              x1={0}
              x2={W}
              y1={H * p}
              y2={H * p}
              stroke={HEX.border}
              strokeWidth={0.25}
              strokeDasharray="1,2"
            />
          ))}

          {/* Filled gradient area */}
          <defs>
            <linearGradient id="hbGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.45} />
              <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <motion.path
            d={areaPath}
            fill="url(#hbGrad)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />

          {/* Sparkline */}
          <motion.polyline
            points={points}
            fill="none"
            stroke={HEX.accent}
            strokeWidth={0.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />

          {/* Cursor vertical guide + dot */}
          <line
            x1={cursorX}
            x2={cursorX}
            y1={0}
            y2={H}
            stroke={HEX.accent2}
            strokeWidth={0.3}
            strokeDasharray="1,1"
            opacity={hovered ? 0.9 : 0.4}
          />
          <circle
            cx={cursorX}
            cy={cursorY}
            r={1.3}
            fill={HEX.accent2}
            stroke={HEX.surface}
            strokeWidth={0.5}
          />
        </svg>

        {/* Tooltip */}
        {hovered ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border-muted bg-surface px-2 py-1.5 text-[10px] font-mono text-text shadow-lg"
            style={{ left: hovered.x, top: cursorY * 2.4 - 6 }}
          >
            <div className="font-semibold">
              {cursorMinute.events} events / min
            </div>
            <div className="text-text-faint">{cursorMinute.label}</div>
          </div>
        ) : null}
      </div>

      {/* Footer mini-stats */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-muted/60 pt-3">
        <MiniStat
          label="Peak / min"
          value={max.toString()}
          tone="accent"
        />
        <MiniStat
          label="Avg / min"
          value={(
            minutes.reduce((a, m) => a + m.events, 0) / minutes.length
          ).toFixed(1)}
          tone="accent2"
        />
        <MiniStat
          label="Last 60m"
          value={formatNumber(data.kpis.eventsLastHour)}
          tone="accent4"
        />
      </div>
    </Panel>
  );
}

function buildMinuteSeries(
  hourly: AgencyActivityData['hourlyVolume'],
): Array<{ label: string; events: number }> {
  if (hourly.length === 0) return [];
  // Take the most recent 4 buckets and spread each across 15 minutes.
  // Hourly is "23h ago first, now last", so the last 4 are the most
  // recent ones — but mock fills 24 from the buildMockHourly() reading
  // (which inverts the labels). We just take the last 4 here.
  const tail = hourly.slice(-4);
  const out: Array<{ label: string; events: number }> = [];
  tail.forEach((h, hi) => {
    const total = h.sends + h.opens + h.replies + h.rescues;
    const perMin = total / 60;
    for (let m = 0; m < 15; m++) {
      const wobble = Math.sin((hi * 15 + m) * 0.6) * 0.45;
      const events = Math.max(0, Math.round(perMin + wobble));
      const minuteOfHour = m * 4 + (hi % 2 === 0 ? 1 : 2);
      out.push({
        label: `${h.hour} +${minuteOfHour.toString().padStart(2, '0')}m`,
        events,
      });
    }
  });
  return out;
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}): JSX.Element {
  const tc = TONE_CLASS[tone];
  return (
    <div className="space-y-0.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
        {label}
      </p>
      <p className={`font-mono text-sm font-semibold ${tc.text}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top active mailboxes
// ---------------------------------------------------------------------------

function TopActiveMailboxesCard({
  data,
}: {
  data: AgencyActivityData;
}): JSX.Element {
  const max = useMemo(
    () =>
      Math.max(
        1,
        ...data.topActiveMailboxes.map((m) => m.eventsToday),
      ),
    [data.topActiveMailboxes],
  );
  return (
    <Panel
      icon={TrendingUp}
      title="Top active mailboxes"
      subtitle="By event volume today"
    >
      {data.topActiveMailboxes.length === 0 ? (
        <div className="grid h-16 place-items-center text-xs text-text-faint">
          No mailboxes active yet
        </div>
      ) : (
        <ul className="space-y-2">
          {data.topActiveMailboxes.slice(0, 8).map((m, idx) => {
            const ratio = m.eventsToday / max;
            return (
              <li key={m.mailboxId} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-border-muted bg-surface-2 font-mono text-[10px] text-text-dim">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-text">
                        {m.mailboxEmail}
                      </p>
                      <p className="truncate text-[10px] text-text-faint">
                        {m.subClientName}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] font-semibold text-text">
                    {formatNumber(m.eventsToday)}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${ratio * 100}%` }}
                    transition={{
                      duration: 0.6,
                      ease: 'easeOut',
                      delay: 0.08 * idx,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Alerts ticker
// ---------------------------------------------------------------------------

function AlertsTickerCard({
  data,
}: {
  data: AgencyActivityData;
}): JSX.Element {
  return (
    <Panel
      icon={AlertTriangle}
      title="Recent alerts"
      subtitle={
        data.alerts.length === 0
          ? 'All clear'
          : `${data.alerts.length} open across the agency`
      }
    >
      {data.alerts.length === 0 ? (
        <div className="grid h-14 place-items-center text-xs text-text-faint">
          No alerts in the last hour
        </div>
      ) : (
        <ul className="space-y-2">
          {data.alerts.map((a) => (
            <AlertTickerItem key={a.id} alert={a} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AlertTickerItem({
  alert,
}: {
  alert: AgencyActivityData['alerts'][number];
}): JSX.Element {
  const Icon = ALERT_KIND_ICON[alert.kind];
  const tone = toneFromSeverity(alert.severity);
  const tc = TONE_CLASS[tone];
  return (
    <li
      className={`flex items-start gap-2 rounded-xl border ${tc.softBorder} ${tc.softBg} px-3 py-2`}
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${tc.softBorder} ${tc.softBg} ${tc.text}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-semibold ${tc.text}`}>
            {ALERT_KIND_LABEL[alert.kind]}
          </span>
          {alert.subClientName ? (
            <>
              <span className="text-text-faint">·</span>
              <span className="font-mono text-[10px] text-text-dim">
                {alert.subClientName}
              </span>
            </>
          ) : null}
        </div>
        <p className="text-[11px] text-text">{alert.message}</p>
        <p className="font-mono text-[10px] text-text-faint">
          {alert.timeAgo}
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Provider distribution mini-bar
// ---------------------------------------------------------------------------

function ProviderDistributionCard({
  data,
}: {
  data: AgencyActivityData;
}): JSX.Element {
  // Aggregate events by provider — recomputed any time the underlying
  // event list changes.
  const dist = useMemo(() => {
    const counts: Record<MailboxProvider, number> = {
      gmail: 0,
      outlook: 0,
      yahoo: 0,
      smtp: 0,
    };
    data.events.forEach((e) => {
      counts[e.provider] += 1;
    });
    const total = counts.gmail + counts.outlook + counts.yahoo + counts.smtp;
    return PROVIDER_BY_INDEX.map((p) => ({
      provider: p,
      count: counts[p],
      pct: total === 0 ? 0 : (counts[p] / total) * 100,
    }));
  }, [data.events]);
  const total = dist.reduce((a, x) => a + x.count, 0);

  return (
    <Panel
      icon={Inbox}
      title="Provider distribution"
      subtitle={
        total === 0
          ? 'No provider mix yet'
          : `${formatNumber(total)} events sliced by provider`
      }
    >
      {total === 0 ? (
        <div className="grid h-12 place-items-center text-xs text-text-faint">
          Awaiting first event…
        </div>
      ) : (
        <>
          {/* Stacked single-row bar */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
            {dist.map((d, idx) => {
              if (d.pct === 0) return null;
              const colorByProvider: Record<MailboxProvider, string> = {
                gmail: 'bg-accent3',
                outlook: 'bg-accent2',
                yahoo: 'bg-accent',
                smtp: 'bg-text-faint',
              };
              return (
                <motion.div
                  key={d.provider}
                  className={`${colorByProvider[d.provider]}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${d.pct}%` }}
                  transition={{
                    duration: 0.6,
                    ease: 'easeOut',
                    delay: 0.08 * idx,
                  }}
                  style={{ height: '100%' }}
                />
              );
            })}
          </div>

          {/* Legend */}
          <ul className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            {dist.map((d) => {
              const colorByProvider: Record<MailboxProvider, string> = {
                gmail: 'bg-accent3',
                outlook: 'bg-accent2',
                yahoo: 'bg-accent',
                smtp: 'bg-text-faint',
              };
              return (
                <li
                  key={d.provider}
                  className="flex items-center gap-2"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${colorByProvider[d.provider]}`}
                  />
                  <span className="font-mono text-text-dim">
                    {PROVIDER_LABEL[d.provider]}
                  </span>
                  <span className="ml-auto font-mono text-text">
                    {d.count} · {d.pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Shared panel scaffold
// ---------------------------------------------------------------------------

function Panel({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Activity;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border-muted bg-surface-2/70 text-text-dim">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className="text-[11px] text-text-faint">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
