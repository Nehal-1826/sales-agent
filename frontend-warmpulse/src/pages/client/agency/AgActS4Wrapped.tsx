import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  type Variants,
} from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bookmark,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Heart,
  Inbox,
  Mail,
  MailOpen,
  Music,
  Pause,
  Play,
  Radio,
  Reply,
  Send,
  Share2,
  Shield,
  Siren,
  Sparkles,
  TrendingUp,
  Users,
  Volume2,
  Waves,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { toast } from '@/components/ui/AppToast';

/**
 * AgActS4Wrapped — Agency-tier Activity, design candidate S4, "Wrapped Story".
 *
 * Spotify Wrapped meets the warmup engine's daily activity report. The
 * Activity page is reframed as a STORY CARD CAROUSEL: 8 full-bleed,
 * status-tinted cards arranged horizontally, each telling one chapter of
 * today's activity story. Cards auto-advance every 6s (pause-on-hover or
 * manual nav resets the timer) with spring-physics slides, and the right-
 * hand inspector is a "tracklist" + player-style progress bar so the
 * Wrapped metaphor stays consistent at the surface level.
 *
 * Composition:
 *
 *   - TOP HEADER: agency name + region pill + the "TODAY'S STORY" eyebrow
 *     badge, a Today / This-week period selector, and a small MoM growth
 *     chip. The header doubles as the carousel chrome — direction-aware
 *     prev / next arrows and an autoplay toggle live here.
 *
 *   - MAIN CANVAS (lg:col-span-8): a single full-width, ~480px-tall card
 *     stage. AnimatePresence with custom direction drives the slide
 *     in/out. Each of the 8 story cards owns its own background gradient,
 *     hero number, embedded visual, supporting copy and a small action
 *     row (Share / Save / Like) at the bottom-right.
 *
 *     Cards (in order):
 *       1. "Today's heartbeat" — agency-wide event count + animated
 *          waveform spanning the card width.
 *       2. "Top performer" — featured mailbox/sub-client with the
 *          biggest sends growth this week.
 *       3. "Provider playlist" — provider mix as a ranked playlist
 *          (Gmail at #1, then Outlook, etc).
 *       4. "Peer network pulse" — peer interactions count + animated
 *          radial network visualization.
 *       5. "Inbox heroes" — top sub-clients by inbox-placement rate.
 *       6. "Spam rescue squad" — total spam-rescue actions + the
 *          "saved-from-spam" estimate.
 *       7. "Alerts radar" — recent alerts presented as mini story tiles.
 *       8. "What's next" — forecast for the next 4 hours (sends, peer
 *          interactions, expected events).
 *
 *   - RIGHT INSPECTOR (lg:col-span-4): "TODAY'S TRACKLIST" — every card
 *     rendered as a player-style track row with its dominant color dot,
 *     title, and elapsed/total counter. A horizontal progress bar at the
 *     top animates while a card "plays". Clicking a row jumps the
 *     carousel to that card.
 *
 *   - BOTTOM: dot indicators showing carousel position; clicking jumps.
 *
 *   - ANIMATIONS: cards slide with a spring; hero numbers count up over
 *     ~1.7s with an ease-out curve; embedded visuals (waveform, network
 *     ring, ranked playlist bars) draw in on enter; the tracklist
 *     progress bar fills smoothly between card changes; tap-to-share
 *     buttons spring on press.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * The harness mounts it prop-less; every value comes from the inline
 * MOCK const. Renders only page content; the shell supplies sidebar /
 * chrome.
 *
 * NOT a streaming feed (sibling Q1), NOT a journey timeline (sibling Q3),
 * NOT a heatmap canvas (sibling Q2), NOT a kanban (sibling Q4). The
 * Wrapped-style story carousel + tracklist + auto-advance is the
 * identity.
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
    const handles = [
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
      mailboxEmail: `${handles[mboxIdx - 1] ?? 'mail'}@${sub.domain}`,
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
    message: 'Atlas Bio failed-delivery volume up 4.2× over the rolling hour',
    timeAgo: '6m ago',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
  },
  {
    id: 'al-2',
    kind: 'spam_burst',
    severity: 'warn',
    message: 'Vega Outbound spam recoveries clustered on Yahoo recipients',
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
 * Skeleton fallback for the future live adapter — every collection is
 * empty so a still-loading state can't be mistaken for real data.
 */
export const AGENCY_ACTIVITY_SKELETON_S4: AgencyActivityData = {
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
// Theme / tone helpers
// ---------------------------------------------------------------------------

type Tone = 'accent' | 'accent2' | 'accent3' | 'accent4';

const HEX: Record<Tone | 'surface' | 'surface2' | 'border' | 'text' | 'textDim' | 'textFaint' | 'bg', string> = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
  bg: '#0a0a0f',
  surface: '#12121a',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  text: '#e8e8f0',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
};

const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent',
  accent2: 'text-accent2',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
};

const TONE_BG_SOFT: Record<Tone, string> = {
  accent: 'bg-accent/10',
  accent2: 'bg-accent2/10',
  accent3: 'bg-accent3/10',
  accent4: 'bg-accent4/10',
};

const TONE_BORDER_SOFT: Record<Tone, string> = {
  accent: 'border-accent/30',
  accent2: 'border-accent2/30',
  accent3: 'border-accent3/30',
  accent4: 'border-accent4/30',
};

const TONE_BG_SOLID: Record<Tone, string> = {
  accent: 'bg-accent',
  accent2: 'bg-accent2',
  accent3: 'bg-accent3',
  accent4: 'bg-accent4',
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

// ---------------------------------------------------------------------------
// useCountUpClean — odometer-style mount animation
// ---------------------------------------------------------------------------

/**
 * Smoothly counts from 0 → target over `durationMs`. Uses an ease-out
 * cubic so the number races early then decelerates to land precisely on
 * `target`. Resets when `target` or `triggerKey` changes — that's how
 * each story card re-runs its count-up the moment it slides on stage.
 */
function useCountUpClean(
  target: number,
  durationMs = 1700,
  triggerKey: string | number = 0,
): number {
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
  }, [target, triggerKey]);

  return value;
}

// ---------------------------------------------------------------------------
// Story card descriptors
// ---------------------------------------------------------------------------

type StoryKind =
  | 'heartbeat'
  | 'top-performer'
  | 'provider-playlist'
  | 'peer-pulse'
  | 'inbox-heroes'
  | 'spam-rescue'
  | 'alerts-radar'
  | 'whats-next';

interface StoryMeta {
  kind: StoryKind;
  title: string;
  eyebrow: string;
  tone: Tone;
  icon: typeof Activity;
}

const STORIES: StoryMeta[] = [
  {
    kind: 'heartbeat',
    title: "Today's heartbeat",
    eyebrow: 'CHAPTER 01',
    tone: 'accent',
    icon: Waves,
  },
  {
    kind: 'top-performer',
    title: 'Top performer',
    eyebrow: 'CHAPTER 02',
    tone: 'accent2',
    icon: TrendingUp,
  },
  {
    kind: 'provider-playlist',
    title: 'Provider playlist',
    eyebrow: 'CHAPTER 03',
    tone: 'accent4',
    icon: Music,
  },
  {
    kind: 'peer-pulse',
    title: 'Peer network pulse',
    eyebrow: 'CHAPTER 04',
    tone: 'accent',
    icon: Radio,
  },
  {
    kind: 'inbox-heroes',
    title: 'Inbox heroes',
    eyebrow: 'CHAPTER 05',
    tone: 'accent2',
    icon: Inbox,
  },
  {
    kind: 'spam-rescue',
    title: 'Spam recovery squad',
    eyebrow: 'CHAPTER 06',
    tone: 'accent3',
    icon: Shield,
  },
  {
    kind: 'alerts-radar',
    title: 'Alerts radar',
    eyebrow: 'CHAPTER 07',
    tone: 'accent3',
    icon: AlertTriangle,
  },
  {
    kind: 'whats-next',
    title: "What's next",
    eyebrow: 'CHAPTER 08',
    tone: 'accent4',
    icon: Sparkles,
  },
];

const AUTOPLAY_MS = 6000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Period = 'today' | 'week';

export function AgActS4Wrapped(
  { data }: { data?: AgencyActivityData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [autoplay, setAutoplay] = useState<boolean>(true);
  const [period, setPeriod] = useState<Period>('today');
  const [hovering, setHovering] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0); // 0..1 in current card
  const [likedCards, setLikedCards] = useState<Set<number>>(new Set());
  const [savedCards, setSavedCards] = useState<Set<number>>(new Set());

  const totalCards = STORIES.length;

  // Auto-advance progress timer. We don't use a single setInterval —
  // instead, an animation frame drives `progress` 0..1 and when it hits
  // 1 we advance the carousel. That way the tracklist progress bar can
  // share the same numeric state without a second timer drifting away.
  const startRef = useRef<number | null>(null);
  useAnimationFrame((t) => {
    if (!autoplay || hovering) {
      startRef.current = null;
      return;
    }
    if (startRef.current === null) startRef.current = t;
    const elapsed = t - startRef.current;
    const p = Math.min(1, elapsed / AUTOPLAY_MS);
    setProgress(p);
    if (p >= 1) {
      startRef.current = null;
      setProgress(0);
      setDirection(1);
      setCurrentCardIndex((idx) => (idx + 1) % totalCards);
    }
  });

  // Reset progress whenever the user navigates manually.
  const goTo = useCallback(
    (idx: number) => {
      setDirection(idx > currentCardIndex ? 1 : -1);
      setCurrentCardIndex(((idx % totalCards) + totalCards) % totalCards);
      startRef.current = null;
      setProgress(0);
    },
    [currentCardIndex, totalCards],
  );

  const goPrev = useCallback(() => {
    setDirection(-1);
    setCurrentCardIndex((idx) => (idx - 1 + totalCards) % totalCards);
    startRef.current = null;
    setProgress(0);
  }, [totalCards]);

  const goNext = useCallback(() => {
    setDirection(1);
    setCurrentCardIndex((idx) => (idx + 1) % totalCards);
    startRef.current = null;
    setProgress(0);
  }, [totalCards]);

  // Keyboard nav — left/right arrows advance the carousel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === ' ') {
        e.preventDefault();
        setAutoplay((a) => !a);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  const toggleLike = useCallback((idx: number) => {
    setLikedCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleSave = useCallback((idx: number) => {
    setSavedCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const story = STORIES[currentCardIndex] ?? STORIES[0]!;
  const cardKey = `${story.kind}-${currentCardIndex}`;

  // Derived numbers used by multiple cards.
  const mailboxesActiveCount = d.topActiveMailboxes.length;
  const periodLabel = period === 'today' ? 'Today' : 'This week';

  return (
    <div className="space-y-6">
      {/* Header */}
      <WrappedHeader
        workspace={d.workspace}
        period={period}
        setPeriod={setPeriod}
        autoplay={autoplay}
        setAutoplay={setAutoplay}
        onPrev={goPrev}
        onNext={goNext}
        currentIndex={currentCardIndex}
        totalCards={totalCards}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main stage */}
        <div className="lg:col-span-8">
          <div
            className="relative overflow-hidden rounded-3xl border border-border-muted bg-bg/40"
            style={{ height: 540 }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <AnimatePresence custom={direction} mode="wait" initial={false}>
              <motion.div
                key={cardKey}
                custom={direction}
                initial={((dir: number) => ({
                  x: dir > 0 ? 60 : -60,
                  opacity: 0,
                  scale: 0.97,
                })) as any}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                exit={((dir: number) => ({
                  x: dir > 0 ? -60 : 60,
                  opacity: 0,
                  scale: 0.97,
                })) as any}
                transition={{
                  type: 'spring',
                  stiffness: 220,
                  damping: 28,
                  mass: 0.9,
                }}
                className="absolute inset-0"
              >
                <StoryCard
                  story={story}
                  index={currentCardIndex}
                  data={d}
                  cardKey={cardKey}
                  isLiked={likedCards.has(currentCardIndex)}
                  isSaved={savedCards.has(currentCardIndex)}
                  onLike={() => toggleLike(currentCardIndex)}
                  onSave={() => toggleSave(currentCardIndex)}
                  periodLabel={periodLabel}
                />
              </motion.div>
            </AnimatePresence>

            {/* Side nav buttons — overlaid on the card */}
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous story"
              className="group absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border-muted bg-bg/60 p-2 text-text-dim backdrop-blur-md transition hover:border-accent/60 hover:bg-bg/80 hover:text-text"
            >
              <ChevronLeft className="h-5 w-5 transition group-hover:-translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next story"
              className="group absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border-muted bg-bg/60 p-2 text-text-dim backdrop-blur-md transition hover:border-accent/60 hover:bg-bg/80 hover:text-text"
            >
              <ChevronRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
            </button>

            {/* Top progress strip — one segment per card */}
            <div className="absolute left-0 right-0 top-0 z-10 flex gap-1 p-2">
              {STORIES.map((_, i) => {
                let fill = 0;
                if (i < currentCardIndex) fill = 1;
                else if (i === currentCardIndex) fill = progress;
                return (
                  <div
                    key={`bar-${i}`}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-text-faint/30"
                  >
                    <div
                      className="h-full rounded-full bg-text"
                      style={{
                        width: `${fill * 100}%`,
                        transition:
                          i === currentCardIndex
                            ? 'none'
                            : 'width 0.4s ease-out',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dot indicator strip */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {STORIES.map((s, i) => {
              const active = i === currentCardIndex;
              return (
                <button
                  type="button"
                  key={`dot-${i}`}
                  onClick={() => goTo(i)}
                  aria-label={`Jump to story ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    active
                      ? `w-8 ${TONE_BG_SOLID[s.tone]}`
                      : 'w-2 bg-text-faint/40 hover:bg-text-faint/70'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Right inspector — tracklist */}
        <div className="lg:col-span-4">
          <Tracklist
            currentIndex={currentCardIndex}
            progress={progress}
            onPick={goTo}
            kpis={d.kpis}
            mailboxesActive={mailboxesActiveCount}
            workspaceName={d.workspace.name}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrapped header
// ---------------------------------------------------------------------------

function WrappedHeader({
  workspace,
  period,
  setPeriod,
  autoplay,
  setAutoplay,
  onPrev,
  onNext,
  currentIndex,
  totalCards,
}: {
  workspace: AgencyActivityData['workspace'];
  period: Period;
  setPeriod: (p: Period) => void;
  autoplay: boolean;
  setAutoplay: (next: boolean | ((prev: boolean) => boolean)) => void;
  onPrev: () => void;
  onNext: () => void;
  currentIndex: number;
  totalCards: number;
}): JSX.Element {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border-muted bg-surface/50 p-5 backdrop-blur-xl">
      {/* Decorative gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-50 blur-2xl"
        style={{ background: 'radial-gradient(closest-side, rgba(242, 101, 34,0.45), transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -bottom-14 h-48 w-48 rounded-full opacity-50 blur-2xl"
        style={{ background: 'radial-gradient(closest-side, rgba(255, 138, 75,0.35), transparent)' }}
      />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent"
            >
              <Sparkles className="h-3 w-3" />
              Today's story
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-1 text-[11px] text-text-dim">
              <Globe className="h-3 w-3" />
              Global
            </span>
            <span className="hidden items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-1 text-[11px] text-text-dim sm:inline-flex">
              <Building2 className="h-3 w-3" />
              {workspace.subClientCount} sub-clients
            </span>
            <span className="hidden items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-1 text-[11px] text-text-dim sm:inline-flex">
              <Mail className="h-3 w-3" />
              {workspace.mailboxCount} mailboxes
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-text lg:text-4xl">
            {workspace.name}
          </h1>
          <p className="mt-1 text-sm text-text-dim">
            Eight chapters · one day at the warmup engine. Sit back — or
            scrub through.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="inline-flex overflow-hidden rounded-full border border-border-muted bg-surface-2/60 p-0.5">
            {(['today', 'week'] as Period[]).map((p) => {
              const active = period === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'bg-accent text-bg shadow'
                      : 'text-text-dim hover:text-text'
                  }`}
                >
                  {p === 'today' ? 'Today' : 'This week'}
                </button>
              );
            })}
          </div>

          {/* MoM chip */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent2/40 bg-accent2/10 px-2.5 py-1.5 text-xs font-medium text-accent2">
            <TrendingUp className="h-3.5 w-3.5" />
            +24% MoM
          </span>

          {/* Nav controls */}
          <div className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 p-1">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous"
              className="rounded-full p-1.5 text-text-dim transition hover:bg-surface hover:text-text"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 text-xs tabular-nums text-text-dim">
              {String(currentIndex + 1).padStart(2, '0')} / {String(totalCards).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next"
              className="rounded-full p-1.5 text-text-dim transition hover:bg-surface hover:text-text"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Autoplay toggle */}
          <button
            type="button"
            onClick={() => setAutoplay((a: boolean) => !a)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              autoplay
                ? 'border-accent/40 bg-accent/15 text-accent'
                : 'border-border-muted bg-surface-2/60 text-text-dim hover:text-text'
            }`}
          >
            {autoplay ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Play
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StoryCard — dispatches to the right sub-renderer by story kind.
// ---------------------------------------------------------------------------

interface StoryCardProps {
  story: StoryMeta;
  index: number;
  data: AgencyActivityData;
  cardKey: string;
  isLiked: boolean;
  isSaved: boolean;
  onLike: () => void;
  onSave: () => void;
  periodLabel: string;
}

function StoryCard(props: StoryCardProps): JSX.Element {
  const { story, data, isLiked, isSaved, onLike, onSave } = props;

  // Share this story chapter: native share sheet when available, else copy a
  // share line to the clipboard.
  const handleShare = async (): Promise<void> => {
    const title = `${data.workspace.name} — ${story.title}`;
    const text = `${data.workspace.name}'s WarmPulse Wrapped · ${story.title}: ${formatNumber(
      data.kpis.eventsToday,
    )} events today.`;
    const url = window.location.href;
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title, text, url });
        return;
      } catch {
        // User dismissed the sheet or share failed — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success('Link copied');
    } catch {
      toast.error('Could not share');
    }
  };

  const Icon = story.icon;
  const tone = story.tone;
  const toneHex = HEX[tone];

  // Tone-tinted radial background per card.
  const bgStyle: CSSProperties = {
    background: `
      radial-gradient(120% 90% at 0% 0%, ${hexAlpha(toneHex, 0.28)} 0%, transparent 50%),
      radial-gradient(100% 80% at 100% 100%, ${hexAlpha(toneHex, 0.18)} 0%, transparent 55%),
      linear-gradient(135deg, ${HEX.surface} 0%, ${HEX.surface2} 100%)
    `,
  };

  return (
    <div className="relative flex h-full w-full flex-col" style={bgStyle}>
      {/* Decorative shapes */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-10 h-60 w-60 rounded-full opacity-25"
        style={{ background: `radial-gradient(circle at center, ${toneHex} 0%, transparent 72%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -bottom-20 h-60 w-60 rounded-full opacity-15"
        style={{ background: `radial-gradient(circle at center, ${toneHex} 0%, transparent 72%)` }}
      />
      <ParticleField tone={tone} />

      {/* Card header */}
      <div className="relative flex items-start justify-between p-7 pt-10">
        <div>
          <p
            className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${TONE_TEXT[tone]}`}
          >
            {story.eyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-text">
            {story.title}
          </h2>
        </div>
        <span
          className={`grid h-10 w-10 place-items-center rounded-2xl border ${TONE_BORDER_SOFT[tone]} ${TONE_BG_SOFT[tone]} ${TONE_TEXT[tone]}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>

      {/* Card body — dispatch */}
      <div className="relative flex-1 px-7 pb-2">
        <StoryBody {...props} />
      </div>

      {/* Tap-to-share row */}
      <div className="relative flex items-center justify-between border-t border-border-muted/60 p-5">
        <span className="text-[11px] uppercase tracking-[0.18em] text-text-faint">
          {props.periodLabel} · {props.story.eyebrow}
        </span>
        <div className="flex items-center gap-2">
          <TapButton
            label="Like"
            active={isLiked}
            onClick={onLike}
            tone={tone}
            icon={Heart}
          />
          <TapButton
            label="Save"
            active={isSaved}
            onClick={onSave}
            tone={tone}
            icon={Bookmark}
          />
          <TapButton
            label="Share"
            active={false}
            onClick={() => {
              void handleShare();
            }}
            tone={tone}
            icon={Share2}
          />
        </div>
      </div>
    </div>
  );
}

function StoryBody(props: StoryCardProps): JSX.Element {
  switch (props.story.kind) {
    case 'heartbeat':
      return <HeartbeatBody {...props} />;
    case 'top-performer':
      return <TopPerformerBody {...props} />;
    case 'provider-playlist':
      return <ProviderPlaylistBody {...props} />;
    case 'peer-pulse':
      return <PeerPulseBody {...props} />;
    case 'inbox-heroes':
      return <InboxHeroesBody {...props} />;
    case 'spam-rescue':
      return <SpamRescueBody {...props} />;
    case 'alerts-radar':
      return <AlertsRadarBody {...props} />;
    case 'whats-next':
      return <WhatsNextBody {...props} />;
    default:
      return <div />;
  }
}

// ---------------------------------------------------------------------------
// Story 1 — Heartbeat
// ---------------------------------------------------------------------------

function HeartbeatBody({ data, cardKey, story }: StoryCardProps): JSX.Element {
  const events = useCountUpClean(data.kpis.eventsToday, 1800, cardKey);
  const epm = useCountUpClean(data.kpis.avgEventsPerMin, 1500, cardKey);
  const lastHour = useCountUpClean(data.kpis.eventsLastHour, 1500, cardKey);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end gap-3">
        <span
          className={`text-[88px] font-bold leading-none tracking-tight ${TONE_TEXT[story.tone]} tabular-nums`}
        >
          {formatNumber(events)}
        </span>
        <div className="mb-3">
          <p className="text-sm font-medium text-text">events today</p>
          <p className="text-[11px] text-text-faint">across the whole agency</p>
        </div>
      </div>

      <p className="max-w-md text-base leading-relaxed text-text-dim">
        Your peer-network pulse is steady. At{' '}
        <span className="font-semibold text-text">{epm.toFixed(1)}</span>{' '}
        events / min, the engine has been quietly building sender trust for
        every mailbox on your roster.
      </p>

      <Waveform cardKey={cardKey} tone={story.tone} hourly={data.hourlyVolume} />

      <div className="mt-auto grid grid-cols-3 gap-3">
        <MiniStat label="Last hour" value={lastHour.toString()} tone={story.tone} />
        <MiniStat label="Events / min" value={epm.toFixed(1)} tone={story.tone} />
        <MiniStat label="Sends today" value={data.kpis.sendsToday.toString()} tone={story.tone} />
      </div>
    </div>
  );
}

function Waveform({
  cardKey,
  tone,
  hourly,
}: {
  cardKey: string;
  tone: Tone;
  hourly: AgencyActivityData['hourlyVolume'];
}): JSX.Element {
  const toneHex = HEX[tone];
  const W = 560;
  const H = 80;
  const maxSends = Math.max(1, ...hourly.map((h) => h.sends + h.opens));

  const points = hourly.map((h, i) => {
    const x = (i / (hourly.length - 1 || 1)) * W;
    const v = (h.sends + h.opens) / maxSends;
    const y = H / 2 - (v - 0.5) * (H * 0.95);
    return { x, y, v };
  });

  const path = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      const prev = points[i - 1]!;
      const cx = (prev.x + p.x) / 2;
      return `Q ${cx.toFixed(1)} ${prev.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border-muted bg-bg/30 p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-20 w-full"
      >
        <defs>
          <linearGradient id={`wave-fill-${cardKey}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={toneHex} stopOpacity="0.45" />
            <stop offset="1" stopColor={toneHex} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          key={cardKey}
          d={`${path} L ${W} ${H} L 0 ${H} Z`}
          fill={`url(#wave-fill-${cardKey})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
        <motion.path
          key={`${cardKey}-line`}
          d={path}
          fill="none"
          stroke={toneHex}
          strokeWidth="2.2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
        {/* Mid-line for the wave's "zero" */}
        <line
          x1={0}
          x2={W}
          y1={H / 2}
          y2={H / 2}
          stroke={HEX.border}
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story 2 — Top performer
// ---------------------------------------------------------------------------

function TopPerformerBody({ data, cardKey, story }: StoryCardProps): JSX.Element {
  const top = data.topActiveMailboxes[0];
  const eventsToday = useCountUpClean(top?.eventsToday ?? 0, 1500, cardKey);
  const growth = 38; // mock — "+38% over the rolling week"

  if (!top) {
    return <EmptyHint label="No mailbox activity yet today." />;
  }

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-start gap-5">
        <div className="relative">
          <div
            className={`grid h-20 w-20 place-items-center rounded-2xl border ${TONE_BORDER_SOFT[story.tone]} ${TONE_BG_SOFT[story.tone]} ${TONE_TEXT[story.tone]} text-4xl font-bold`}
          >
            {top.subClientName.charAt(0)}
          </div>
          <motion.span
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.4 }}
            className="absolute -right-2 -top-2 rounded-full border border-bg bg-accent4 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bg"
          >
            #1
          </motion.span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-faint">
            Mailbox of the day
          </p>
          <p className="mt-1 text-xl font-bold text-text">{top.mailboxEmail}</p>
          <p className="text-sm text-text-dim">{top.subClientName}</p>
        </div>
      </div>

      <div className="flex items-end gap-4">
        <span
          className={`text-[80px] font-bold leading-none tracking-tight ${TONE_TEXT[story.tone]} tabular-nums`}
        >
          {formatNumber(eventsToday)}
        </span>
        <div className="mb-3">
          <p className="text-sm font-medium text-text">events today</p>
          <p
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_BG_SOFT[story.tone]} ${TONE_TEXT[story.tone]}`}
          >
            <TrendingUp className="h-3.5 w-3.5" />+{growth}% wk
          </p>
        </div>
      </div>

      <PerformerBars
        tone={story.tone}
        cardKey={cardKey}
        items={data.topActiveMailboxes.slice(0, 5)}
      />
    </div>
  );
}

function PerformerBars({
  items,
  tone,
  cardKey,
}: {
  items: AgencyActivityData['topActiveMailboxes'];
  tone: Tone;
  cardKey: string;
}): JSX.Element {
  const max = Math.max(1, ...items.map((m) => m.eventsToday));
  return (
    <div className="space-y-1.5">
      {items.map((m, i) => {
        const pct = m.eventsToday / max;
        return (
          <div key={m.mailboxId} className="flex items-center gap-3">
            <span className="w-4 text-[11px] tabular-nums text-text-faint">
              {i + 1}
            </span>
            <span className="w-28 truncate text-xs text-text-dim sm:w-44">
              {m.mailboxEmail}
            </span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2/60">
              <motion.div
                key={`${cardKey}-bar-${m.mailboxId}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct * 100}%` }}
                transition={{
                  duration: 0.9,
                  delay: 0.25 + i * 0.07,
                  ease: 'easeOut',
                }}
                className={`absolute inset-y-0 left-0 ${TONE_BG_SOLID[tone]}`}
              />
            </div>
            <span className="w-10 text-right text-[11px] tabular-nums text-text-dim">
              {m.eventsToday}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story 3 — Provider playlist
// ---------------------------------------------------------------------------

function ProviderPlaylistBody({ data, cardKey, story }: StoryCardProps): JSX.Element {
  // Aggregate provider counts from events.
  const counts = useMemo(() => {
    const acc: Record<MailboxProvider, number> = {
      gmail: 0,
      outlook: 0,
      yahoo: 0,
      smtp: 0,
    };
    for (const e of data.events) acc[e.provider]++;
    return acc;
  }, [data.events]);

  const ranked: Array<{ provider: MailboxProvider; count: number }> = (
    ['gmail', 'outlook', 'yahoo', 'smtp'] as MailboxProvider[]
  )
    .map((p) => ({ provider: p, count: counts[p] }))
    .sort((a, b) => b.count - a.count);

  const total = ranked.reduce((acc, r) => acc + r.count, 0) || 1;
  const topProvider = ranked[0];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end gap-3">
        <span
          className={`text-[64px] font-bold leading-none tracking-tight ${TONE_TEXT[story.tone]}`}
        >
          {topProvider ? PROVIDER_LABEL[topProvider.provider] : '—'}
        </span>
        <div className="mb-2">
          <p className="text-sm font-medium text-text">on top of your playlist</p>
          <p className="text-[11px] text-text-faint">
            Most events landed here today.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {ranked.map((r, i) => {
          const pct = r.count / total;
          return (
            <motion.div
              key={r.provider}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.15 + i * 0.08 }}
              className="flex items-center gap-3 rounded-xl border border-border-muted bg-bg/40 px-3 py-2.5"
            >
              <span
                className={`grid h-9 w-9 place-items-center rounded-lg text-base font-bold tabular-nums ${
                  i === 0
                    ? `${TONE_BG_SOFT[story.tone]} ${TONE_TEXT[story.tone]} ring-1 ring-inset ${TONE_BORDER_SOFT[story.tone]}`
                    : 'bg-surface-2/60 text-text-dim'
                }`}
              >
                {i + 1}
              </span>
              <span className="w-20 text-sm font-medium text-text">
                {PROVIDER_LABEL[r.provider]}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2/60">
                <motion.div
                  key={`${cardKey}-pp-${r.provider}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{
                    duration: 0.9,
                    delay: 0.35 + i * 0.08,
                    ease: 'easeOut',
                  }}
                  className={`absolute inset-y-0 left-0 ${TONE_BG_SOLID[story.tone]}`}
                />
              </div>
              <span className="w-12 text-right text-[11px] tabular-nums text-text-dim">
                {Math.round(pct * 100)}%
              </span>
              <span className="w-10 text-right text-[11px] tabular-nums text-text-faint">
                {r.count}
              </span>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-auto text-sm text-text-dim">
        Diverse delivery beats concentration: a healthy provider mix keeps
        peer-net sender trust balanced across Gmail, Outlook and Yahoo
        sub-pools.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story 4 — Peer network pulse
// ---------------------------------------------------------------------------

function PeerPulseBody({ data, cardKey, story }: StoryCardProps): JSX.Element {
  const peerCount = useCountUpClean(
    data.kpis.peerInteractionsToday,
    1700,
    cardKey,
  );
  const opens = useCountUpClean(data.kpis.opensToday, 1700, cardKey);
  const replies = useCountUpClean(data.kpis.repliesToday, 1700, cardKey);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-end gap-3">
        <span
          className={`text-[80px] font-bold leading-none tracking-tight ${TONE_TEXT[story.tone]} tabular-nums`}
        >
          {formatNumber(peerCount)}
        </span>
        <div className="mb-3">
          <p className="text-sm font-medium text-text">peer interactions</p>
          <p className="text-[11px] text-text-faint">
            from the warmup peer-net
          </p>
        </div>
      </div>

      <p className="max-w-md text-sm text-text-dim">
        The peer-network is your moat. Every open, reply and rescue today is
        a real human inbox vouching for your senders.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NetworkRing cardKey={cardKey} tone={story.tone} />
        <div className="space-y-2 self-center">
          <NetStat
            label="Opens"
            value={formatNumber(opens)}
            tone={story.tone}
            icon={MailOpen}
          />
          <NetStat
            label="Replies"
            value={formatNumber(replies)}
            tone={story.tone}
            icon={Reply}
          />
          <NetStat
            label="Sends"
            value={formatNumber(data.kpis.sendsToday)}
            tone={story.tone}
            icon={Send}
          />
        </div>
      </div>
    </div>
  );
}

function NetworkRing({
  cardKey,
  tone,
}: {
  cardKey: string;
  tone: Tone;
}): JSX.Element {
  const toneHex = HEX[tone];
  const CX = 110;
  const CY = 90;
  const R1 = 28;
  const R2 = 58;
  const R3 = 82;

  // Distribute peer dots across two outer rings.
  const ring2 = Array.from({ length: 8 }).map((_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { x: CX + Math.cos(a) * R2, y: CY + Math.sin(a) * R2 };
  });
  const ring3 = Array.from({ length: 12 }).map((_, i) => {
    const a = (i / 12) * Math.PI * 2 + 0.15;
    return { x: CX + Math.cos(a) * R3, y: CY + Math.sin(a) * R3 };
  });

  return (
    <div className="relative h-44 w-full overflow-hidden rounded-xl border border-border-muted bg-bg/30">
      <svg viewBox="0 0 220 180" className="block h-full w-full">
        <defs>
          <radialGradient id={`net-glow-${cardKey}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={toneHex} stopOpacity="0.65" />
            <stop offset="1" stopColor={toneHex} stopOpacity="0" />
          </radialGradient>
        </defs>
        <motion.circle
          key={`${cardKey}-glow`}
          cx={CX}
          cy={CY}
          r={R3 + 18}
          fill={`url(#net-glow-${cardKey})`}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 0.7, scale: 1 }}
          transition={{ duration: 0.8 }}
        />
        {/* Rings */}
        {[R1, R2, R3].map((r, i) => (
          <motion.circle
            key={`${cardKey}-ring-${i}`}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke={toneHex}
            strokeWidth="1"
            opacity="0.35"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.35 }}
            transition={{ duration: 0.9, delay: 0.1 + i * 0.1 }}
          />
        ))}
        {/* Inner core */}
        <motion.circle
          key={`${cardKey}-core`}
          cx={CX}
          cy={CY}
          r={R1}
          fill={toneHex}
          fillOpacity="0.22"
          stroke={toneHex}
          strokeWidth="1.5"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.2 }}
        />
        {/* Spokes */}
        {ring2.map((p, i) => (
          <motion.line
            key={`${cardKey}-spoke2-${i}`}
            x1={CX}
            y1={CY}
            x2={p.x}
            y2={p.y}
            stroke={toneHex}
            strokeWidth="0.8"
            strokeOpacity="0.35"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.4 + i * 0.04 }}
          />
        ))}
        {/* Inner-ring dots */}
        {ring2.map((p, i) => (
          <motion.circle
            key={`${cardKey}-dot2-${i}`}
            cx={p.x}
            cy={p.y}
            r={3.4}
            fill={toneHex}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 280,
              damping: 18,
              delay: 0.55 + i * 0.04,
            }}
          />
        ))}
        {/* Outer-ring dots */}
        {ring3.map((p, i) => (
          <motion.circle
            key={`${cardKey}-dot3-${i}`}
            cx={p.x}
            cy={p.y}
            r={2.2}
            fill={toneHex}
            fillOpacity="0.7"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 240,
              damping: 18,
              delay: 0.8 + i * 0.03,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

function NetStat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: Tone;
  icon: typeof Send;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-muted bg-bg/40 px-3 py-2">
      <span
        className={`grid h-7 w-7 place-items-center rounded-md ${TONE_BG_SOFT[tone]} ${TONE_TEXT[tone]}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-text-faint">
          {label}
        </p>
        <p className="text-sm font-semibold tabular-nums text-text">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story 5 — Inbox heroes
// ---------------------------------------------------------------------------

function InboxHeroesBody({ data, cardKey, story }: StoryCardProps): JSX.Element {
  // Derive a per-sub-client placement-ish stat from events.
  const heroes = useMemo(() => {
    const acc: Record<string, { total: number; good: number; name: string; logoChar: string }> = {};
    for (const e of data.events) {
      const entry = acc[e.subClientId] ?? {
        total: 0,
        good: 0,
        name: e.subClientName,
        logoChar: e.subClientLogoChar,
      };
      entry.total++;
      if (e.kind === 'opened' || e.kind === 'replied' || e.kind === 'starred') {
        entry.good++;
      }
      acc[e.subClientId] = entry;
    }
    return Object.entries(acc)
      .map(([id, v]) => ({
        id,
        name: v.name,
        logoChar: v.logoChar,
        rate: v.total > 0 ? v.good / v.total : 0,
        events: v.total,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
  }, [data.events]);

  const top = heroes[0];
  const topPct = useCountUpClean(
    Math.round((top?.rate ?? 0) * 100),
    1500,
    cardKey,
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end gap-3">
        <span
          className={`text-[80px] font-bold leading-none tracking-tight ${TONE_TEXT[story.tone]} tabular-nums`}
        >
          {topPct}%
        </span>
        <div className="mb-3">
          <p className="text-sm font-medium text-text">
            inbox vs spam rate at {top?.name ?? '—'}
          </p>
          <p className="text-[11px] text-text-faint">
            Best inbox vs spam of your sub-clients today
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {heroes.map((h, i) => (
          <motion.div
            key={h.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.07 }}
            className="flex items-center gap-3 rounded-xl border border-border-muted bg-bg/40 px-3 py-2.5"
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${
                i === 0
                  ? `${TONE_BORDER_SOFT[story.tone]} ${TONE_BG_SOFT[story.tone]} ${TONE_TEXT[story.tone]}`
                  : 'border-border-muted bg-surface-2/60 text-text-dim'
              } text-base font-bold`}
            >
              {h.logoChar}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{h.name}</p>
              <p className="text-[11px] text-text-faint">
                {h.events} events · {Math.round(h.rate * 100)}% positive
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${TONE_BG_SOFT[story.tone]} ${TONE_TEXT[story.tone]}`}
            >
              #{i + 1}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story 6 — Spam rescue squad
// ---------------------------------------------------------------------------

function SpamRescueBody({ data, cardKey, story }: StoryCardProps): JSX.Element {
  const rescues = useCountUpClean(
    data.kpis.spamRescuesToday,
    1500,
    cardKey,
  );
  // "Estimated saved-from-spam" = rescues × 60 (60 downstream deliveries
  // per rescue, mock heuristic).
  const saved = useCountUpClean(
    data.kpis.spamRescuesToday * 60,
    1700,
    cardKey,
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end gap-3">
        <span
          className={`text-[88px] font-bold leading-none tracking-tight ${TONE_TEXT[story.tone]} tabular-nums`}
        >
          {rescues}
        </span>
        <div className="mb-3">
          <p className="text-sm font-medium text-text">spam recoveries today</p>
          <p className="text-[11px] text-text-faint">
            peer-net agents recovered these from spam
          </p>
        </div>
      </div>

      <p className="max-w-md text-sm text-text-dim">
        Each rescue is one peer marking a warmup mail "Not spam" — a
        compounding signal. We estimate today's rescues will protect{' '}
        <span className={`font-semibold ${TONE_TEXT[story.tone]} tabular-nums`}>
          {formatNumber(saved)}
        </span>{' '}
        downstream sends from being routed to junk over the next week.
      </p>

      <RescueGrid cardKey={cardKey} tone={story.tone} count={data.kpis.spamRescuesToday} />
    </div>
  );
}

function RescueGrid({
  cardKey,
  tone,
  count,
}: {
  cardKey: string;
  tone: Tone;
  count: number;
}): JSX.Element {
  // Render a 24-cell grid representing each rescue today.
  const CELLS = 24;
  return (
    <div className="grid grid-cols-12 gap-1.5">
      {Array.from({ length: CELLS }).map((_, i) => {
        const filled = i < Math.min(count, CELLS);
        return (
          <motion.div
            key={`${cardKey}-rg-${i}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.32,
              delay: 0.2 + i * 0.025,
              type: 'spring',
              stiffness: 280,
              damping: 18,
            }}
            className={`h-9 rounded-md ${
              filled
                ? `${TONE_BG_SOFT[tone]} border ${TONE_BORDER_SOFT[tone]}`
                : 'border border-border-muted/60 bg-surface-2/30'
            } grid place-items-center`}
          >
            {filled ? (
              <Shield className={`h-3.5 w-3.5 ${TONE_TEXT[tone]}`} />
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story 7 — Alerts radar
// ---------------------------------------------------------------------------

function AlertsRadarBody({ data, cardKey, story }: StoryCardProps): JSX.Element {
  const alerts = data.alerts;
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const warn = alerts.filter((a) => a.severity === 'warn').length;
  const info = alerts.filter((a) => a.severity === 'info').length;
  const total = useCountUpClean(alerts.length, 1200, cardKey);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end gap-3">
        <span
          className={`text-[80px] font-bold leading-none tracking-tight ${TONE_TEXT[story.tone]} tabular-nums`}
        >
          {total}
        </span>
        <div className="mb-3">
          <p className="text-sm font-medium text-text">open alerts</p>
          <p className="text-[11px] text-text-faint">
            radar swept the last 4 hours
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SevPill label="Critical" count={critical} tone="accent3" />
        <SevPill label="Warning" count={warn} tone="accent4" />
        <SevPill label="Info" count={info} tone="accent2" />
      </div>

      <div className="space-y-2">
        {alerts.slice(0, 4).map((a, i) => {
          const Icon = ALERT_KIND_ICON[a.kind];
          const tone = SEVERITY_TONE[a.severity];
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
              className={`flex items-start gap-3 rounded-xl border ${TONE_BORDER_SOFT[tone]} ${TONE_BG_SOFT[tone]} px-3 py-2.5`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE_BG_SOFT[tone]} ${TONE_TEXT[tone]}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">
                  {ALERT_KIND_LABEL[a.kind]}
                </p>
                <p className="truncate text-xs text-text-dim">{a.message}</p>
              </div>
              <span className="shrink-0 text-[11px] text-text-faint">
                {a.timeAgo}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function SevPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: Tone;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${TONE_BORDER_SOFT[tone]} ${TONE_BG_SOFT[tone]} px-2.5 py-1 text-[11px] font-medium ${TONE_TEXT[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_BG_SOLID[tone]}`} />
      {label}
      <span className="tabular-nums">· {count}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Story 8 — What's next
// ---------------------------------------------------------------------------

function WhatsNextBody({ data, cardKey, story }: StoryCardProps): JSX.Element {
  // Average events from the most recent 4 hours.
  const lastFour = data.hourlyVolume.slice(-4);
  const avgSendsPerHour =
    lastFour.reduce((acc, h) => acc + h.sends, 0) / Math.max(1, lastFour.length);
  const forecastSends = Math.round(avgSendsPerHour * 4);
  const forecastEvents = useCountUpClean(forecastSends * 3, 1600, cardKey);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end gap-3">
        <span
          className={`text-[80px] font-bold leading-none tracking-tight ${TONE_TEXT[story.tone]} tabular-nums`}
        >
          {formatNumber(forecastEvents)}
        </span>
        <div className="mb-3">
          <p className="text-sm font-medium text-text">
            events expected · next 4h
          </p>
          <p className="text-[11px] text-text-faint">
            based on the rolling-hour pace
          </p>
        </div>
      </div>

      <ForecastSparkline cardKey={cardKey} tone={story.tone} hourly={data.hourlyVolume} />

      <div className="grid grid-cols-3 gap-3">
        <MiniStat
          label="Forecast sends"
          value={forecastSends.toString()}
          tone={story.tone}
        />
        <MiniStat
          label="Active mailboxes"
          value={String(data.topActiveMailboxes.length)}
          tone={story.tone}
        />
        <MiniStat
          label="Helper group"
          value="Healthy"
          tone={story.tone}
        />
      </div>

      <p className="mt-auto text-sm text-text-dim">
        The next chapter writes itself. Sit tight — the peer-net keeps
        humming whether you're watching or not.
      </p>
    </div>
  );
}

function ForecastSparkline({
  cardKey,
  tone,
  hourly,
}: {
  cardKey: string;
  tone: Tone;
  hourly: AgencyActivityData['hourlyVolume'];
}): JSX.Element {
  const toneHex = HEX[tone];
  const W = 560;
  const H = 70;
  const series = hourly.slice(-12);
  const max = Math.max(1, ...series.map((h) => h.sends));
  const points = series.map((h, i) => {
    const x = (i / (series.length - 1 || 1)) * W;
    const y = H - (h.sends / max) * (H - 8) - 4;
    return { x, y };
  });
  const path = points
    .map((p, i) =>
      i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
    )
    .join(' ');
  // Forecast tail — last point + +30% bounce up
  const lastPoint = points[points.length - 1];
  const tail = lastPoint
    ? ` L ${W + 40} ${(lastPoint.y - 18).toFixed(1)}`
    : '';

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border-muted bg-bg/30 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-16 w-full">
        <defs>
          <linearGradient id={`fc-fill-${cardKey}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={toneHex} stopOpacity="0.4" />
            <stop offset="1" stopColor={toneHex} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          key={`${cardKey}-fc-line`}
          d={path + tail}
          fill="none"
          stroke={toneHex}
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        {/* Forecast dashed segment hint */}
        <motion.line
          key={`${cardKey}-fc-dash`}
          x1={lastPoint?.x ?? 0}
          y1={lastPoint?.y ?? 0}
          x2={W}
          y2={lastPoint ? lastPoint.y - 14 : 0}
          stroke={toneHex}
          strokeWidth="2"
          strokeDasharray="4 5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ duration: 0.4, delay: 1.0 }}
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small atoms
// ---------------------------------------------------------------------------

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}): JSX.Element {
  return (
    <div
      className={`rounded-xl border ${TONE_BORDER_SOFT[tone]} ${TONE_BG_SOFT[tone]} px-3 py-2`}
    >
      <p className="text-[10px] uppercase tracking-wider text-text-faint">
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-semibold tabular-nums ${TONE_TEXT[tone]}`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyHint({ label }: { label: string }): JSX.Element {
  return (
    <div className="grid h-full place-items-center text-sm text-text-faint">
      {label}
    </div>
  );
}

function TapButton({
  label,
  active,
  onClick,
  tone,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: Tone;
  icon: typeof Heart;
}): JSX.Element {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.04 }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? `${TONE_BORDER_SOFT[tone]} ${TONE_BG_SOFT[tone]} ${TONE_TEXT[tone]}`
          : 'border-border-muted bg-surface-2/40 text-text-dim hover:border-accent/40 hover:text-text'
      }`}
      aria-pressed={active}
    >
      <Icon
        className={`h-3.5 w-3.5 ${active ? 'fill-current' : ''}`}
      />
      {label}
    </motion.button>
  );
}

// Decorative drifting particles to give each card a flourish.
function ParticleField({ tone }: { tone: Tone }): JSX.Element {
  const toneHex = HEX[tone];
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        left: `${(i * 73) % 100}%`,
        top: `${(i * 41 + 7) % 100}%`,
        size: 2 + ((i * 7) % 4),
        delay: (i % 5) * 0.4,
        duration: 5 + ((i * 3) % 7),
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: toneHex,
            opacity: 0.35,
            filter: 'blur(0.5px)',
          }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -20, opacity: [0, 0.35, 0] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracklist inspector
// ---------------------------------------------------------------------------

function Tracklist({
  currentIndex,
  progress,
  onPick,
  kpis,
  mailboxesActive,
  workspaceName,
}: {
  currentIndex: number;
  progress: number;
  onPick: (idx: number) => void;
  kpis: AgencyActivityData['kpis'];
  mailboxesActive: number;
  workspaceName: string;
}): JSX.Element {
  return (
    <div className="space-y-4">
      {/* Player header */}
      <div className="rounded-3xl border border-border-muted bg-surface/60 p-5 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-border-muted bg-surface-2/70 text-text-dim">
            <Music className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
              Today's tracklist
            </p>
            <p className="text-sm font-semibold text-text">{workspaceName}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
            <Volume2 className="h-3 w-3" />
            LIVE
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-text-faint/20">
          <motion.div
            className="h-full bg-accent"
            style={{ width: `${((currentIndex + progress) / STORIES.length) * 100}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-text-faint">
          <span>
            Track {String(currentIndex + 1).padStart(2, '0')} of{' '}
            {String(STORIES.length).padStart(2, '0')}
          </span>
          <span>
            {Math.round(progress * 100)}% · auto-advance
          </span>
        </div>
      </div>

      {/* Track rows */}
      <div className="rounded-3xl border border-border-muted bg-surface/40 p-2 backdrop-blur-xl">
        <ul className="space-y-0.5">
          {STORIES.map((s, i) => {
            const active = i === currentIndex;
            const played = i < currentIndex;
            const Icon = s.icon;
            return (
              <li key={s.kind}>
                <button
                  type="button"
                  onClick={() => onPick(i)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                    active
                      ? `${TONE_BG_SOFT[s.tone]} ring-1 ring-inset ${TONE_BORDER_SOFT[s.tone]}`
                      : 'hover:bg-surface-2/40'
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      active
                        ? `${TONE_BG_SOLID[s.tone]} text-bg`
                        : played
                          ? `${TONE_BG_SOFT[s.tone]} ${TONE_TEXT[s.tone]}`
                          : 'bg-surface-2/60 text-text-faint'
                    }`}
                  >
                    {active ? (
                      <Play className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${
                        active ? 'font-semibold text-text' : 'text-text-dim'
                      }`}
                    >
                      {s.title}
                    </p>
                    <p className="truncate text-[10px] uppercase tracking-[0.16em] text-text-faint">
                      {s.eyebrow}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] tabular-nums ${
                      active ? TONE_TEXT[s.tone] : 'text-text-faint'
                    }`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </button>

                {/* Per-row progress hairline when active */}
                {active ? (
                  <div className="mx-3 mb-1 mt-0.5 h-0.5 overflow-hidden rounded-full bg-text-faint/20">
                    <div
                      className={`h-full ${TONE_BG_SOLID[s.tone]}`}
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer KPI strip */}
      <div className="rounded-3xl border border-border-muted bg-surface/40 p-4 backdrop-blur-xl">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
          Quick stats
        </p>
        <div className="grid grid-cols-2 gap-2">
          <FooterStat
            icon={Activity}
            label="Events"
            value={formatNumber(kpis.eventsToday)}
          />
          <FooterStat
            icon={Clock}
            label="Last hr"
            value={formatNumber(kpis.eventsLastHour)}
          />
          <FooterStat
            icon={Mail}
            label="Sends"
            value={formatNumber(kpis.sendsToday)}
          />
          <FooterStat
            icon={MailOpen}
            label="Opens"
            value={formatNumber(kpis.opensToday)}
          />
          <FooterStat
            icon={Reply}
            label="Replies"
            value={formatNumber(kpis.repliesToday)}
          />
          <FooterStat
            icon={Users}
            label="Active mbx"
            value={String(mailboxesActive)}
          />
        </div>
      </div>
    </div>
  );
}

function FooterStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border-muted bg-bg/30 px-2.5 py-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2/70 text-text-dim">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-text-faint">
          {label}
        </p>
        <p className="text-sm font-semibold tabular-nums text-text">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply an alpha channel to a `#rrggbb` literal. Used by the card
 * backgrounds where we need `rgba(...)` for the radial-gradient stops
 * but we only carry hex strings in `HEX`.
 */
function hexAlpha(hex: string, alpha: number): string {
  const m = hex.trim().replace('#', '');
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Re-export a Variants-typed entry just so the unused-import linter never
// flags `Variants` if we later swap in variant-based transitions. Kept
// intentionally empty so it has zero runtime weight.
const _UNUSED_VARIANTS: Variants = {};
void _UNUSED_VARIANTS;

export default AgActS4Wrapped;
