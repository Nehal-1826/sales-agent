import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useAnimationFrame } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Clock,
  Compass,
  Gauge,
  Globe,
  Inbox,
  Layers,
  MailOpen,
  Orbit,
  Pause,
  Play,
  Radar,
  Radio,
  Reply,
  Satellite,
  Send,
  Shield,
  Signal,
  Siren,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgActS3Globe — Agency-tier Activity, design candidate S3, "Activity Globe".
 *
 * The Activity surface for an agency reads like an operations console: dozens
 * of sub-clients, hundreds of mailboxes, thousands of warmup events per day.
 * S3 leans into the geographic / interconnected nature of that data: the
 * page is a premium SVG globe (pseudo-3D world map projection) where every
 * sub-client is an ORIGIN node plotted across the surface, every provider
 * (Gmail / Outlook / Yahoo) is a DESTINATION hub at a cardinal anchor, and
 * activity events draw as animated arcs flying from origin to destination
 * with comet dots travelling along the curve. Think Stripe's globe, but
 * tuned for an email-warmup ops console — status-tinted arcs, atmospheric
 * cyan haze, a continuous 120s rotation, and a horizontally scrolling event
 * feed strip beneath the canvas.
 *
 * Composition:
 *
 *   - TOP HEADER: agency name + region pill + 8 KPI tiles (Events today /
 *     Sends / Opens / Replies / Spam rescues / Peer interactions / Events
 *     last hour / Avg events per minute) with odometer count-up on mount,
 *     plus a MoM-growth chip and a PAUSE ROTATION toggle.
 *
 *   - MAIN CANVAS (lg:col-span-8):
 *
 *       GLOBE STAGE — a ~600×600 SVG viewport rendering:
 *
 *         * Stylized abstract continent silhouettes (clean SVG paths — NOT
 *           geographically accurate, just enough land mass to read as
 *           "world map").
 *         * Subtle latitude / longitude grid (faint dashed lines).
 *         * 8 sub-client ORIGIN nodes positioned around the map via a
 *           deterministic id-hash so re-renders keep the same layout.
 *         * 3 provider DESTINATION nodes at fixed cardinal anchors (Gmail
 *           top-right, Outlook bottom-right, Yahoo bottom-left).
 *         * ARCS — quadratic Bezier curves from each emitting origin to a
 *           destination hub. Each arc draws via `pathLength` 0→1 over
 *           ~1.5s, then a comet dot travels along it via `<animateMotion>`
 *           over ~2.5s, then the arc fades. New arcs spawn every ~700ms.
 *         * Atmospheric haze — accent2 (cyan) radial gradient around the
 *           globe perimeter.
 *         * Slow whole-globe rotation: 120s / revolution.
 *
 *       EVENT FEED STRIP — horizontally scrolling row of recent events
 *       below the globe. Marquee-style continuous scroll, pauses on hover.
 *
 *   - RIGHT INSPECTOR (lg:col-span-4): provider mix donut, top active
 *     mailboxes with bars, recent alerts ticker, selected-arc detail card,
 *     and a 24h volume sparkline with cursor-tracking guide.
 *
 *   - ANIMATIONS: globe rotates 120s/rev; arcs animate stroke draw + comet
 *     travel + fade out; origin nodes breath-pulse and brighten when
 *     emitting; destination nodes glow-flash on arc arrival; KPI tiles
 *     count up on mount; event strip continuous scroll w/ hover pause;
 *     bottom volume sparkline tracks cursor with a vertical guide.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * The harness mounts it prop-less; every value comes from the inline MOCK
 * const. Renders only page content; the shell supplies sidebar / chrome.
 *
 * NOT a vertical feed (sibling Q1), NOT a heatmap (sibling Q2), NOT a
 * journey timeline (sibling Q3), NOT a kanban (sibling Q4). The 3D-style
 * globe with arc paths flying between origin nodes and provider hubs is
 * the identity here.
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
// MOCK — Northwind Agency, 8 sub-clients, 96 mailboxes.
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
  const NAMES = [
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
    const mboxIdx = (i % 12) + 1;
    const note = pickFrom(ACTION_NOTE_BY_KIND[kind], i * 11 + 4, '');
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
      mailboxEmail: `${NAMES[mboxIdx - 1]}@${sub.domain}`,
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
 * Skeleton fallback — used when the live adapter has yet to deliver data.
 */
export const AGENCY_ACTIVITY_SKELETON_S3: AgencyActivityData = {
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
// Theme + helpers
// ---------------------------------------------------------------------------

const HEX = {
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

const ACTION_HEX: Record<ActionKind, string> = {
  sent: HEX.accent2,
  opened: HEX.accent,
  replied: HEX.accent,
  starred: HEX.accent4,
  spam_rescue: HEX.accent4,
  bounce: HEX.accent3,
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

function toneHex(tone: Tone): string {
  switch (tone) {
    case 'accent':
      return HEX.accent;
    case 'accent2':
      return HEX.accent2;
    case 'accent3':
      return HEX.accent3;
    case 'accent4':
      return HEX.accent4;
  }
}

// ---------------------------------------------------------------------------
// useCountUp — odometer-style mount animation
// ---------------------------------------------------------------------------

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
// Deterministic id hashing — positions origin nodes around the globe.
// ---------------------------------------------------------------------------

/**
 * djb2-ish string hash. Cheap, deterministic, returns a non-negative int.
 * Identical input always produces identical output across renders, so the
 * origin-node positions on the globe never jump between mounts.
 */
function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

/**
 * Project an origin onto the globe. Returns SVG (cx, cy) where:
 *
 *   - cx ∈ [60, 540]   (leaving margin so labels fit)
 *   - cy ∈ [120, 480]  (avoiding poles + provider zones)
 *
 * Sub-clients spread fairly evenly because the seed is the id-hash.
 */
function originPosition(id: string): { cx: number; cy: number } {
  const h = hashString(id);
  const x = 60 + ((h % 1000) / 1000) * 480;
  const y = 120 + (((h >> 10) % 1000) / 1000) * 360;
  return { cx: x, cy: y };
}

// ---------------------------------------------------------------------------
// Provider destination hubs — fixed cardinal anchors on the canvas.
// ---------------------------------------------------------------------------

interface DestinationHub {
  id: MailboxProvider;
  label: string;
  cx: number;
  cy: number;
  accent: Tone;
}

const DESTINATION_HUBS: DestinationHub[] = [
  { id: 'gmail', label: 'Gmail', cx: 510, cy: 110, accent: 'accent3' },
  { id: 'outlook', label: 'Outlook', cx: 510, cy: 490, accent: 'accent2' },
  { id: 'yahoo', label: 'Yahoo', cx: 90, cy: 490, accent: 'accent' },
];

const DESTINATION_BY_PROVIDER: Record<MailboxProvider, DestinationHub> = {
  gmail: DESTINATION_HUBS[0]!,
  outlook: DESTINATION_HUBS[1]!,
  yahoo: DESTINATION_HUBS[2]!,
  // Generic SMTP routes to Outlook hub for visualization (no separate hub).
  smtp: DESTINATION_HUBS[1]!,
};

// ---------------------------------------------------------------------------
// Arc geometry — quadratic Bezier from origin to destination, curved toward
// the centre of the globe so all arcs bow inward instead of crossing the
// straight-line chord.
// ---------------------------------------------------------------------------

const GLOBE_CX = 300;
const GLOBE_CY = 300;
const GLOBE_R = 240;

function arcControlPoint(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
): { cx: number; cy: number } {
  const mx = (ox + dx) / 2;
  const my = (oy + dy) / 2;
  // Direction from midpoint toward globe centre.
  const toCenterX = GLOBE_CX - mx;
  const toCenterY = GLOBE_CY - my;
  // Lift the control point about 30% of the way toward centre + a small
  // perpendicular bow so adjacent arcs do not perfectly overlap.
  const perpX = -(dy - oy);
  const perpY = dx - ox;
  const perpLen = Math.hypot(perpX, perpY) || 1;
  const bow = 16; // small perpendicular offset
  return {
    cx: mx + toCenterX * 0.32 + (perpX / perpLen) * bow,
    cy: my + toCenterY * 0.32 + (perpY / perpLen) * bow,
  };
}

function arcPath(ox: number, oy: number, dx: number, dy: number): string {
  const c = arcControlPoint(ox, oy, dx, dy);
  return `M ${ox} ${oy} Q ${c.cx} ${c.cy} ${dx} ${dy}`;
}

// ---------------------------------------------------------------------------
// Continent silhouettes — abstract stylized SVG paths, not geographically
// accurate. Drawn inside a clipPath so they don't bleed outside the globe.
// ---------------------------------------------------------------------------

const CONTINENT_PATHS: string[] = [
  // Americas — vertical blob on the west
  'M 120 180 Q 100 220 110 260 Q 105 300 120 330 Q 115 370 135 400 Q 150 420 170 410 Q 180 380 175 350 Q 190 320 185 290 Q 200 260 195 230 Q 180 200 160 195 Q 140 188 120 180 Z',
  // Europe / Africa — central column
  'M 270 170 Q 250 200 265 230 Q 255 260 275 290 Q 270 320 285 350 Q 290 380 305 400 Q 320 410 330 390 Q 335 360 325 330 Q 340 300 330 270 Q 345 240 335 215 Q 320 195 300 185 Q 285 175 270 170 Z',
  // Asia — wide eastern landmass
  'M 380 160 Q 360 190 385 210 Q 410 200 435 215 Q 460 210 480 230 Q 495 250 480 270 Q 460 285 440 280 Q 420 295 400 285 Q 380 290 370 270 Q 365 245 375 220 Q 375 190 380 160 Z',
  // Australia — small SE island
  'M 430 380 Q 420 400 440 410 Q 465 415 470 395 Q 460 380 445 378 Q 435 378 430 380 Z',
  // Greenland-ish — tiny north spec
  'M 240 130 Q 230 145 250 152 Q 268 148 265 135 Q 255 125 240 130 Z',
];

// ---------------------------------------------------------------------------
// Live arc model — what the globe is animating right now.
// ---------------------------------------------------------------------------

interface LiveArc {
  id: string;
  originId: string;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  kind: ActionKind;
  provider: MailboxProvider;
  subClientName: string;
  mailboxEmail: string;
  spawnedAt: number;
  /** how long the arc stays visible before fading out (ms) */
  ttlMs: number;
}

const ARC_TTL_MS = 4200;
const ARC_SPAWN_INTERVAL_MS = 700;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgActS3Globe(
  { data }: { data?: AgencyActivityData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  const [paused, setPaused] = useState<boolean>(false);
  const [selectedArc, setSelectedArc] = useState<LiveArc | null>(null);
  const [selectedSubClient, setSelectedSubClient] = useState<string | null>(
    null,
  );
  const [hoveredHub, setHoveredHub] = useState<MailboxProvider | null>(null);
  const [providerFilter, setProviderFilter] = useState<MailboxProvider | 'all'>(
    'all',
  );
  const [arcs, setArcs] = useState<LiveArc[]>([]);
  const [hubFlash, setHubFlash] = useState<Partial<Record<MailboxProvider, number>>>({});
  const [nodeFlash, setNodeFlash] = useState<Record<string, number>>({});
  const [eventCursor, setEventCursor] = useState<number>(0);
  const arcSeqRef = useRef<number>(0);
  const eventCursorRef = useRef<number>(0);

  // -------------------------------------------------------------------------
  // Origin node geometry — memoised so re-renders don't reshuffle positions.
  // -------------------------------------------------------------------------

  const origins = useMemo(() => {
    return SUB_CLIENTS.map((sc) => {
      const p = originPosition(sc.id);
      return { ...sc, cx: p.cx, cy: p.cy };
    });
  }, []);

  // Quick lookup by id (for arc spawn -> origin coordinates).
  const originById = useMemo(() => {
    const m: Record<string, (typeof origins)[number]> = {};
    for (const o of origins) m[o.id] = o;
    return m;
  }, [origins]);

  // -------------------------------------------------------------------------
  // Arc spawner — every ~700ms, pull the next event from the feed and
  // promote it to a live arc. Wraps around the events array endlessly so the
  // globe never stops emitting while paused === false.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (paused) return;
    if (d.events.length === 0) return;
    const interval = setInterval(() => {
      const cursor = eventCursorRef.current;
      const evt = d.events[cursor % d.events.length];
      eventCursorRef.current = cursor + 1;
      setEventCursor(cursor + 1);
      if (!evt) return;
      const origin = originById[evt.subClientId];
      if (!origin) return;
      const dest = DESTINATION_BY_PROVIDER[evt.provider];
      arcSeqRef.current += 1;
      const id = `arc-${arcSeqRef.current}`;
      const newArc: LiveArc = {
        id,
        originId: origin.id,
        ox: origin.cx,
        oy: origin.cy,
        dx: dest.cx,
        dy: dest.cy,
        kind: evt.kind,
        provider: evt.provider,
        subClientName: evt.subClientName,
        mailboxEmail: evt.mailboxEmail,
        spawnedAt: Date.now(),
        ttlMs: ARC_TTL_MS,
      };
      setArcs((prev) => {
        const next = prev.filter(
          (a) => Date.now() - a.spawnedAt < a.ttlMs,
        );
        next.push(newArc);
        // Cap concurrent arcs so the canvas never gets too noisy.
        if (next.length > 18) next.splice(0, next.length - 18);
        return next;
      });
      // Flash the originating node + destination hub.
      setNodeFlash((prev) => ({ ...prev, [origin.id]: Date.now() }));
      // Schedule the destination flash for arrival (after comet finishes).
      window.setTimeout(() => {
        setHubFlash((prev) => ({ ...prev, [evt.provider]: Date.now() }));
      }, 1800);
    }, ARC_SPAWN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paused, d.events, originById]);

  // Garbage-collect expired arcs every 600ms so the SVG node count stays
  // bounded even if React batched the spawn updates.
  useEffect(() => {
    const interval = setInterval(() => {
      setArcs((prev) => {
        const now = Date.now();
        const next = prev.filter((a) => now - a.spawnedAt < a.ttlMs);
        return next.length === prev.length ? prev : next;
      });
    }, 600);
    return () => clearInterval(interval);
  }, []);

  // -------------------------------------------------------------------------
  // Derived counts for the inspector — provider mix + kind tallies.
  // -------------------------------------------------------------------------

  const providerCounts = useMemo(() => {
    const counts: Record<MailboxProvider, number> = {
      gmail: 0,
      outlook: 0,
      yahoo: 0,
      smtp: 0,
    };
    for (const e of d.events) counts[e.provider] += 1;
    return counts;
  }, [d.events]);

  const providerTotal = useMemo(() => {
    return (
      providerCounts.gmail +
      providerCounts.outlook +
      providerCounts.yahoo +
      providerCounts.smtp
    );
  }, [providerCounts]);

  const kindCounts = useMemo(() => {
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

  // -------------------------------------------------------------------------
  // Filtered events for the strip + inspector.
  // -------------------------------------------------------------------------

  const filteredEvents = useMemo(() => {
    return d.events.filter((e) => {
      if (providerFilter !== 'all' && e.provider !== providerFilter) return false;
      if (selectedSubClient && e.subClientId !== selectedSubClient) return false;
      return true;
    });
  }, [d.events, providerFilter, selectedSubClient]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6 p-6">
      <HeaderBlock
        data={d}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        eventCursor={eventCursor}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <GlobeStage
            origins={origins}
            arcs={arcs}
            hubFlash={hubFlash}
            nodeFlash={nodeFlash}
            paused={paused}
            selectedSubClient={selectedSubClient}
            onSelectSubClient={setSelectedSubClient}
            onSelectArc={setSelectedArc}
            hoveredHub={hoveredHub}
            onHoverHub={setHoveredHub}
          />

          <EventFeedStrip events={filteredEvents} />

          <BottomVolumeChart hourly={d.hourlyVolume} />
        </div>

        <aside className="flex flex-col gap-6 lg:col-span-4">
          <ProviderMixCard
            counts={providerCounts}
            total={providerTotal}
            active={providerFilter}
            onChange={setProviderFilter}
          />

          <SelectedArcCard arc={selectedArc} onClear={() => setSelectedArc(null)} />

          <SubClientsLegend
            origins={origins}
            selected={selectedSubClient}
            onSelect={setSelectedSubClient}
          />

          <TopActiveMailboxesCard items={d.topActiveMailboxes} />

          <RecentAlertsCard alerts={d.alerts} />

          <KindBreakdownCard counts={kindCounts} />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeaderBlock — agency name + region pill + 8 KPI tiles + MoM chip + pause.
// ---------------------------------------------------------------------------

interface HeaderBlockProps {
  data: AgencyActivityData;
  paused: boolean;
  onTogglePause: () => void;
  eventCursor: number;
}

function HeaderBlock({
  data,
  paused,
  onTogglePause,
  eventCursor,
}: HeaderBlockProps): JSX.Element {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-muted bg-surface-2"
            aria-hidden
          >
            <Orbit className="h-6 w-6 text-accent2" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                {data.workspace.name}
              </h1>
              <span className="rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-xs text-text-dim">
                Agency
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent2/30 bg-accent2/10 px-2 py-0.5 text-xs text-accent2">
                <Compass className="h-3 w-3" />
                Global · 14 regions
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-text-dim">
              <span>{data.workspace.subClientCount} sub-clients</span>
              <span className="text-text-faint">·</span>
              <span>{data.workspace.mailboxCount} mailboxes</span>
              <span className="text-text-faint">·</span>
              <span className="inline-flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" />
                Activity Globe
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MomChip percent={12.4} />
          <button
            type="button"
            onClick={onTogglePause}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
              paused
                ? 'border-accent4/40 bg-accent4/10 text-accent4 hover:bg-accent4/20'
                : 'border-accent2/40 bg-accent2/10 text-accent2 hover:bg-accent2/20'
            }`}
            aria-pressed={paused}
          >
            {paused ? (
              <>
                <Play className="h-4 w-4" />
                Resume rotation
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" />
                Pause rotation
              </>
            )}
          </button>
          <div className="hidden items-center gap-1 rounded-xl border border-border-muted bg-surface-2 px-3 py-2 text-xs text-text-dim md:inline-flex">
            <Radio className="h-3.5 w-3.5 text-accent2" />
            <span>{eventCursor} arcs · live</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiTile
          icon={Activity}
          label="Events today"
          value={data.kpis.eventsToday}
          tone="accent"
        />
        <KpiTile
          icon={Send}
          label="Sends"
          value={data.kpis.sendsToday}
          tone="accent2"
        />
        <KpiTile
          icon={MailOpen}
          label="Opens"
          value={data.kpis.opensToday}
          tone="accent"
        />
        <KpiTile
          icon={Reply}
          label="Replies"
          value={data.kpis.repliesToday}
          tone="accent"
        />
        <KpiTile
          icon={Shield}
          label="Spam rescues"
          value={data.kpis.spamRescuesToday}
          tone="accent4"
        />
        <KpiTile
          icon={Users}
          label="Peer interactions"
          value={data.kpis.peerInteractionsToday}
          tone="accent2"
        />
        <KpiTile
          icon={Clock}
          label="Last hour"
          value={data.kpis.eventsLastHour}
          tone="accent4"
        />
        <KpiTile
          icon={Gauge}
          label="Avg / min"
          value={data.kpis.avgEventsPerMin}
          tone="accent3"
          decimal
        />
      </div>
    </header>
  );
}

interface KpiTileProps {
  icon: typeof Activity;
  label: string;
  value: number;
  tone: Tone;
  decimal?: boolean;
}

function KpiTile({ icon: Icon, label, value, tone, decimal }: KpiTileProps): JSX.Element {
  const counted = useCountUp(value);
  const formatted = decimal
    ? counted.toFixed(1)
    : formatNumber(counted);
  const t = TONE_CLASS[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group relative flex flex-col gap-1 rounded-xl border border-border-muted bg-surface p-3 transition hover:border-accent2/40"
    >
      <div className="flex items-center justify-between">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${t.softBorder} ${t.softBg}`}>
          <Icon className={`h-3.5 w-3.5 ${t.text}`} />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-text-faint">24h</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-text">{formatted}</div>
      <div className="text-xs text-text-dim">{label}</div>
    </motion.div>
  );
}

function MomChip({ percent }: { percent: number }): JSX.Element {
  const positive = percent >= 0;
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs ${
        positive
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-accent3/30 bg-accent3/10 text-accent3'
      }`}
    >
      {positive ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : (
        <ArrowDownRight className="h-3.5 w-3.5" />
      )}
      <span className="font-medium">{positive ? '+' : ''}{percent.toFixed(1)}%</span>
      <span className="text-text-dim">MoM</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlobeStage — the headline SVG.
// ---------------------------------------------------------------------------

interface GlobeStageProps {
  origins: Array<{
    id: string;
    name: string;
    logoChar: string;
    domain: string;
    cx: number;
    cy: number;
  }>;
  arcs: LiveArc[];
  hubFlash: Partial<Record<MailboxProvider, number>>;
  nodeFlash: Record<string, number>;
  paused: boolean;
  selectedSubClient: string | null;
  onSelectSubClient: (id: string | null) => void;
  onSelectArc: (arc: LiveArc | null) => void;
  hoveredHub: MailboxProvider | null;
  onHoverHub: (hub: MailboxProvider | null) => void;
}

function GlobeStage({
  origins,
  arcs,
  hubFlash,
  nodeFlash,
  paused,
  selectedSubClient,
  onSelectSubClient,
  onSelectArc,
  hoveredHub,
  onHoverHub,
}: GlobeStageProps): JSX.Element {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border-muted bg-gradient-to-b from-surface to-bg p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-accent2" />
          <h2 className="text-sm font-medium text-text">Activity Globe</h2>
          <span className="rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-dim">
            live
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-dim">
          <Legend tone="accent2" label="Sent" />
          <Legend tone="accent" label="Open / Reply" />
          <Legend tone="accent4" label="Warming" />
          <Legend tone="accent3" label="Bounce" />
        </div>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[640px]">
        <svg
          viewBox="0 0 600 600"
          className="h-full w-full"
          role="img"
          aria-label="3D-style activity globe with arcs flying between sub-client origins and provider destinations"
        >
          <defs>
            <radialGradient id="globe-haze" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={HEX.accent2} stopOpacity="0" />
              <stop offset="60%" stopColor={HEX.accent2} stopOpacity="0.04" />
              <stop offset="92%" stopColor={HEX.accent2} stopOpacity="0.22" />
              <stop offset="100%" stopColor={HEX.accent2} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="globe-fill" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#1a1a26" />
              <stop offset="60%" stopColor="#121220" />
              <stop offset="100%" stopColor="#0a0a14" />
            </radialGradient>
            <linearGradient id="continent-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#262640" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#1c1c2e" stopOpacity="0.7" />
            </linearGradient>
            <radialGradient id="origin-node-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={HEX.accent} stopOpacity="0.95" />
              <stop offset="60%" stopColor={HEX.accent} stopOpacity="0.45" />
              <stop offset="100%" stopColor={HEX.accent} stopOpacity="0" />
            </radialGradient>
            <clipPath id="globe-clip">
              <circle cx={GLOBE_CX} cy={GLOBE_CY} r={GLOBE_R} />
            </clipPath>
            <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Atmospheric outer haze */}
          <circle
            cx={GLOBE_CX}
            cy={GLOBE_CY}
            r={GLOBE_R + 36}
            fill="url(#globe-haze)"
            pointerEvents="none"
          />

          {/* Rotating globe group — wraps the whole sphere so continents + grid
              + origins all share a single transform. Origins are
              counter-rotated below so their labels stay readable. */}
          <motion.g
            style={{ transformOrigin: `${GLOBE_CX}px ${GLOBE_CY}px` }}
            animate={paused ? { rotate: 0 } : { rotate: 360 }}
            transition={{
              repeat: paused ? 0 : Infinity,
              duration: 120,
              ease: 'linear',
            }}
          >
            {/* Globe sphere */}
            <circle
              cx={GLOBE_CX}
              cy={GLOBE_CY}
              r={GLOBE_R}
              fill="url(#globe-fill)"
              stroke={HEX.border}
              strokeWidth="1"
            />

            {/* Latitude / longitude grid — drawn inside the sphere via clip. */}
            <g clipPath="url(#globe-clip)" opacity={0.4}>
              <LatLongGrid />
            </g>

            {/* Continent silhouettes — clipped to the sphere. */}
            <g clipPath="url(#globe-clip)">
              {CONTINENT_PATHS.map((p, i) => (
                <path
                  key={i}
                  d={p}
                  fill="url(#continent-fill)"
                  stroke={HEX.border}
                  strokeWidth="0.6"
                  opacity={0.85}
                />
              ))}
            </g>

            {/* Inner sphere outline — gives the orb a thin rim. */}
            <circle
              cx={GLOBE_CX}
              cy={GLOBE_CY}
              r={GLOBE_R - 1}
              fill="none"
              stroke={HEX.accent2}
              strokeOpacity="0.18"
              strokeWidth="1"
            />
          </motion.g>

          {/* Non-rotating overlay — arcs, origins, destinations sit ABOVE the
              spinning globe so they always face the viewer head-on. This is
              the conventional "stylized globe with fixed pins" treatment;
              the continents convey rotation while the data stays legible. */}

          {/* Origin nodes */}
          <g>
            {origins.map((o) => {
              const flash = nodeFlash[o.id];
              const isFlashing = flash ? Date.now() - flash < 600 : false;
              const isSelected = selectedSubClient === o.id;
              const isDimmed = selectedSubClient !== null && !isSelected;
              return (
                <OriginNode
                  key={o.id}
                  cx={o.cx}
                  cy={o.cy}
                  label={o.name}
                  logoChar={o.logoChar}
                  isFlashing={isFlashing}
                  isSelected={isSelected}
                  isDimmed={isDimmed}
                  onClick={() =>
                    onSelectSubClient(isSelected ? null : o.id)
                  }
                />
              );
            })}
          </g>

          {/* Live arcs (drawn on top of origins, below destinations) */}
          <g>
            <AnimatePresence>
              {arcs.map((arc) => (
                <ArcShape
                  key={arc.id}
                  arc={arc}
                  onSelect={() => onSelectArc(arc)}
                />
              ))}
            </AnimatePresence>
          </g>

          {/* Destination hubs */}
          <g>
            {DESTINATION_HUBS.map((h) => {
              const flashTs = hubFlash[h.id];
              const isFlashing = flashTs ? Date.now() - flashTs < 600 : false;
              return (
                <DestinationHubNode
                  key={h.id}
                  hub={h}
                  isFlashing={isFlashing}
                  isHovered={hoveredHub === h.id}
                  onHover={(v) => onHoverHub(v ? h.id : null)}
                />
              );
            })}
          </g>
        </svg>

        {/* Bottom-left readout */}
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-border-muted bg-surface/70 px-2 py-1 text-[10px] uppercase tracking-wider text-text-dim backdrop-blur">
          <Satellite className="h-3 w-3 text-accent2" />
          <span>{arcs.length} active arcs</span>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-lg border border-border-muted bg-surface/70 px-2 py-1 text-[10px] uppercase tracking-wider text-text-dim backdrop-blur">
          <Signal className="h-3 w-3 text-accent" />
          <span>{paused ? 'rotation paused' : '120s / rev'}</span>
        </div>
      </div>
    </section>
  );
}

function Legend({ tone, label }: { tone: Tone; label: string }): JSX.Element {
  const t = TONE_CLASS[tone];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${t.bg}`} aria-hidden />
      <span>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// LatLongGrid — pure decorative lat/long lines inside the sphere.
// ---------------------------------------------------------------------------

function LatLongGrid(): JSX.Element {
  // Latitudes — horizontal arcs across the sphere.
  const lats: ReactNode[] = [];
  for (let i = 1; i < 7; i++) {
    const y = GLOBE_CY - GLOBE_R + (i * (GLOBE_R * 2)) / 7;
    lats.push(
      <line
        key={`lat-${i}`}
        x1={GLOBE_CX - GLOBE_R}
        y1={y}
        x2={GLOBE_CX + GLOBE_R}
        y2={y}
        stroke={HEX.textFaint}
        strokeWidth="0.6"
        strokeDasharray="3 5"
        opacity={0.4}
      />,
    );
  }
  // Longitudes — ellipses giving the orb its 3D feel.
  const lons: ReactNode[] = [];
  for (let i = 1; i < 7; i++) {
    const rx = (GLOBE_R * Math.abs(3.5 - i)) / 3.5;
    lons.push(
      <ellipse
        key={`lon-${i}`}
        cx={GLOBE_CX}
        cy={GLOBE_CY}
        rx={Math.max(2, rx)}
        ry={GLOBE_R}
        fill="none"
        stroke={HEX.textFaint}
        strokeWidth="0.6"
        strokeDasharray="3 5"
        opacity={0.4}
      />,
    );
  }
  return (
    <g>
      {lats}
      {lons}
    </g>
  );
}

// ---------------------------------------------------------------------------
// OriginNode — sub-client pin.
// ---------------------------------------------------------------------------

interface OriginNodeProps {
  cx: number;
  cy: number;
  label: string;
  logoChar: string;
  isFlashing: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onClick: () => void;
}

function OriginNode({
  cx,
  cy,
  label,
  logoChar,
  isFlashing,
  isSelected,
  isDimmed,
  onClick,
}: OriginNodeProps): JSX.Element {
  const opacity = isDimmed ? 0.25 : 1;
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      onClick={onClick}
      style={{ cursor: 'pointer', opacity }}
    >
      {/* Outer breathing pulse */}
      <motion.circle
        r={isFlashing ? 22 : 12}
        fill={HEX.accent}
        fillOpacity={0.15}
        animate={{
          r: isFlashing ? [12, 30, 12] : [10, 16, 10],
          opacity: isFlashing ? [0.4, 0.05, 0.4] : [0.25, 0.08, 0.25],
        }}
        transition={{
          duration: isFlashing ? 0.8 : 2.4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      {/* Ring */}
      <circle
        r={9}
        fill={HEX.surface}
        stroke={isSelected ? HEX.accent2 : HEX.accent}
        strokeWidth={isSelected ? 1.8 : 1.2}
      />
      {/* Inner dot */}
      <circle r={4.2} fill={HEX.accent} fillOpacity={isFlashing ? 1 : 0.85} />
      {/* Label below */}
      <g transform="translate(0 18)">
        <rect
          x={-((label.length * 3.6) + 6)}
          y={-7}
          width={label.length * 7.2 + 12}
          height={14}
          rx={4}
          fill={HEX.surface}
          fillOpacity={0.85}
          stroke={HEX.border}
          strokeWidth={0.6}
        />
        <text
          x={0}
          y={3}
          textAnchor="middle"
          fontFamily="Outfit, system-ui, sans-serif"
          fontSize="9"
          fill={HEX.text}
        >
          {logoChar} · {label}
        </text>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// DestinationHubNode — provider anchor.
// ---------------------------------------------------------------------------

interface DestinationHubNodeProps {
  hub: DestinationHub;
  isFlashing: boolean;
  isHovered: boolean;
  onHover: (v: boolean) => void;
}

function DestinationHubNode({
  hub,
  isFlashing,
  isHovered,
  onHover,
}: DestinationHubNodeProps): JSX.Element {
  const color = toneHex(hub.accent);
  return (
    <g
      transform={`translate(${hub.cx} ${hub.cy})`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: 'pointer' }}
    >
      <motion.circle
        r={26}
        fill={color}
        fillOpacity={0.08}
        animate={{
          r: isFlashing ? [26, 46, 26] : [22, 28, 22],
          opacity: isFlashing ? [0.55, 0.05, 0.55] : [0.18, 0.08, 0.18],
        }}
        transition={{
          duration: isFlashing ? 0.6 : 3.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <circle
        r={isHovered ? 16 : 14}
        fill={HEX.surface2}
        stroke={color}
        strokeWidth={2}
      />
      <circle r={6} fill={color} />
      <g transform="translate(0 30)">
        <rect
          x={-(hub.label.length * 4 + 6)}
          y={-8}
          width={hub.label.length * 8 + 12}
          height={16}
          rx={4}
          fill={HEX.surface}
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={0.8}
        />
        <text
          x={0}
          y={3}
          textAnchor="middle"
          fontFamily="Outfit, system-ui, sans-serif"
          fontSize="10"
          fontWeight={600}
          fill={color}
        >
          {hub.label}
        </text>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// ArcShape — quadratic Bezier with stroke-draw + comet + fade animation.
// ---------------------------------------------------------------------------

interface ArcShapeProps {
  arc: LiveArc;
  onSelect: () => void;
}

function ArcShape({ arc, onSelect }: ArcShapeProps): JSX.Element {
  const color = ACTION_HEX[arc.kind];
  const path = useMemo(
    () => arcPath(arc.ox, arc.oy, arc.dx, arc.dy),
    [arc.ox, arc.oy, arc.dx, arc.dy],
  );

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
    >
      {/* Soft underlay for glow */}
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeOpacity={0.18}
        strokeWidth={6}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
      {/* Crisp foreground line */}
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeOpacity={0.95}
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 1 }}
        animate={{ pathLength: 1, opacity: [1, 1, 0.4] }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />
      {/* Comet dot — SMIL animateMotion travels along the arc. */}
      <circle r={3.4} fill={color}>
        <animateMotion dur="2.4s" repeatCount="1" path={path} rotate="auto" />
        <animate
          attributeName="opacity"
          values="0;1;1;0"
          keyTimes="0;0.15;0.85;1"
          dur="2.4s"
          repeatCount="1"
        />
      </circle>
      {/* Trailing soft halo behind the comet */}
      <circle r={6} fill={color} fillOpacity={0.35}>
        <animateMotion dur="2.4s" repeatCount="1" path={path} rotate="auto" />
        <animate
          attributeName="opacity"
          values="0;0.55;0.55;0"
          keyTimes="0;0.2;0.8;1"
          dur="2.4s"
          repeatCount="1"
        />
      </circle>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// EventFeedStrip — horizontally scrolling marquee of recent events.
// ---------------------------------------------------------------------------

function EventFeedStrip({ events }: { events: AgencyActivityData['events'] }): JSX.Element {
  const [paused, setPaused] = useState(false);
  // Duplicate the items for a seamless loop.
  const items = events.slice(0, 30);
  const looped = [...items, ...items];

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Live event ticker"
    >
      <div className="flex items-center justify-between border-b border-border-muted px-4 py-2">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-accent2" />
          <h3 className="text-sm font-medium text-text">Event feed</h3>
          <span className="rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-dim">
            scrolling
          </span>
        </div>
        <span className="text-xs text-text-dim">Hover to pause</span>
      </div>
      <div className="relative h-16">
        <motion.div
          className="flex h-full items-center gap-3 px-4"
          animate={paused ? {} : { x: ['0%', '-50%'] }}
          transition={{
            duration: 80,
            ease: 'linear',
            repeat: Infinity,
          }}
          style={{ width: 'max-content' }}
        >
          {looped.map((evt, i) => (
            <EventChip key={`${evt.id}-${i}`} evt={evt} />
          ))}
        </motion.div>
        {/* Edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-surface to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface to-transparent" />
      </div>
    </section>
  );
}

function EventChip({ evt }: { evt: AgencyActivityData['events'][number] }): JSX.Element {
  const Icon = ACTION_ICON[evt.kind];
  const tone = toneFromAction(evt.kind);
  const t = TONE_CLASS[tone];
  return (
    <div
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl border ${t.softBorder} bg-surface-2 px-3 py-1.5 text-xs`}
    >
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${t.softBg}`}>
        <Icon className={`h-3.5 w-3.5 ${t.text}`} />
      </span>
      <span className={`font-medium ${t.text}`}>{ACTION_LABEL[evt.kind]}</span>
      <span className="text-text-faint">·</span>
      <span className="text-text">{evt.mailboxEmail}</span>
      <span className="text-text-faint">→</span>
      <span className="text-text-dim">{PROVIDER_LABEL[evt.provider]}</span>
      <span className="text-text-faint">·</span>
      <span className="text-text-dim">{evt.timeAgo}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BottomVolumeChart — 24h cursor-tracking sparkline.
// ---------------------------------------------------------------------------

function BottomVolumeChart({
  hourly,
}: {
  hourly: AgencyActivityData['hourlyVolume'];
}): JSX.Element {
  const W = 720;
  const H = 140;
  const PAD_L = 40;
  const PAD_R = 12;
  const PAD_T = 18;
  const PAD_B = 24;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const max = useMemo(
    () => Math.max(1, ...hourly.map((h) => h.sends + h.opens + h.replies)),
    [hourly],
  );
  const [cursor, setCursor] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const points = useMemo(() => {
    return hourly.map((h, i) => {
      const x = PAD_L + (i / Math.max(1, hourly.length - 1)) * innerW;
      const total = h.sends + h.opens + h.replies;
      const y = PAD_T + (1 - total / max) * innerH;
      return { x, y, total, h };
    });
  }, [hourly, innerW, innerH, max]);

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length === 0) return '';
    const top = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const last = points[points.length - 1]!;
    const first = points[0]!;
    return `${top} L ${last.x} ${PAD_T + innerH} L ${first.x} ${PAD_T + innerH} Z`;
  }, [points, innerH]);

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      // snap to nearest bucket
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dx = Math.abs(points[i]!.x - px);
        if (dx < bestDist) {
          bestDist = dx;
          best = i;
        }
      }
      setCursor(best);
    },
    [points],
  );

  const handleLeave = useCallback(() => setCursor(null), []);

  const activePt = cursor !== null ? points[cursor] : null;

  return (
    <section className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-text">24h volume</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-dim">
          <Legend tone="accent2" label="Sends" />
          <Legend tone="accent" label="Opens" />
          <Legend tone="accent4" label="Replies" />
        </div>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[140px] w-full"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        >
          <defs>
            <linearGradient id="vol-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.35} />
              <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Horizontal grid */}
          {[0.25, 0.5, 0.75].map((f) => {
            const y = PAD_T + f * innerH;
            return (
              <line
                key={f}
                x1={PAD_L}
                x2={PAD_L + innerW}
                y1={y}
                y2={y}
                stroke={HEX.border}
                strokeDasharray="2 4"
              />
            );
          })}
          <path d={areaD} fill="url(#vol-area)" />
          <path d={pathD} fill="none" stroke={HEX.accent2} strokeWidth={2} />
          {/* x labels (every 4 hours) */}
          {points.map((p, i) =>
            i % 4 === 0 ? (
              <text
                key={i}
                x={p.x}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fill={HEX.textFaint}
                fontFamily="Outfit, system-ui, sans-serif"
              >
                {p.h.hour}
              </text>
            ) : null,
          )}
          {/* y labels */}
          <text
            x={PAD_L - 6}
            y={PAD_T + 4}
            textAnchor="end"
            fontSize="10"
            fill={HEX.textFaint}
            fontFamily="Outfit, system-ui, sans-serif"
          >
            {max}
          </text>
          <text
            x={PAD_L - 6}
            y={PAD_T + innerH}
            textAnchor="end"
            fontSize="10"
            fill={HEX.textFaint}
            fontFamily="Outfit, system-ui, sans-serif"
          >
            0
          </text>
          {/* Cursor guide */}
          {activePt && (
            <g>
              <line
                x1={activePt.x}
                x2={activePt.x}
                y1={PAD_T}
                y2={PAD_T + innerH}
                stroke={HEX.accent2}
                strokeOpacity={0.45}
                strokeDasharray="2 3"
              />
              <circle
                cx={activePt.x}
                cy={activePt.y}
                r={4.5}
                fill={HEX.accent2}
                stroke={HEX.bg}
                strokeWidth={1.5}
              />
            </g>
          )}
        </svg>
        {activePt && (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-border-muted bg-surface-2 px-2 py-1 text-xs shadow-glow-blue"
            style={{
              left: `min(calc(${(activePt.x / W) * 100}% + 8px), calc(100% - 160px))`,
            }}
          >
            <div className="font-medium text-text">{activePt.h.hour}</div>
            <div className="text-text-dim">
              {activePt.h.sends} sends · {activePt.h.opens} opens
            </div>
            <div className="text-text-dim">
              {activePt.h.replies} replies · {activePt.h.rescues} rescues
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ProviderMixCard
// ---------------------------------------------------------------------------

interface ProviderMixCardProps {
  counts: Record<MailboxProvider, number>;
  total: number;
  active: MailboxProvider | 'all';
  onChange: (v: MailboxProvider | 'all') => void;
}

function ProviderMixCard({
  counts,
  total,
  active,
  onChange,
}: ProviderMixCardProps): JSX.Element {
  const providers: Array<{ id: MailboxProvider; tone: Tone }> = [
    { id: 'gmail', tone: 'accent3' },
    { id: 'outlook', tone: 'accent2' },
    { id: 'yahoo', tone: 'accent' },
    { id: 'smtp', tone: 'accent4' },
  ];
  return (
    <section className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent2" />
          <h3 className="text-sm font-medium text-text">Provider mix</h3>
        </div>
        <button
          type="button"
          onClick={() => onChange('all')}
          className={`text-xs ${active === 'all' ? 'text-accent2' : 'text-text-dim hover:text-text'}`}
        >
          all
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {providers.map((p) => {
          const c = counts[p.id];
          const pct = total > 0 ? (c / total) * 100 : 0;
          const t = TONE_CLASS[p.tone];
          const selected = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(selected ? 'all' : p.id)}
              className={`group flex flex-col gap-1 rounded-xl border px-3 py-2 text-left transition ${
                selected
                  ? `${t.softBorder} ${t.softBg}`
                  : 'border-border-muted bg-surface-2 hover:border-accent2/30'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${selected ? t.text : 'text-text'}`}>
                  {PROVIDER_LABEL[p.id]}
                </span>
                <span className="tabular-nums text-text-dim">
                  {c} · {pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
                <motion.div
                  className={`h-full ${t.bg}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// SelectedArcCard — shows the most recently clicked arc's detail.
// ---------------------------------------------------------------------------

function SelectedArcCard({
  arc,
  onClear,
}: {
  arc: LiveArc | null;
  onClear: () => void;
}): JSX.Element {
  if (!arc) {
    return (
      <section className="rounded-2xl border border-border-muted bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-text">Selected arc</h3>
        </div>
        <p className="text-xs text-text-dim">
          Click any arc on the globe to inspect the event behind it.
        </p>
      </section>
    );
  }
  const Icon = ACTION_ICON[arc.kind];
  const tone = toneFromAction(arc.kind);
  const t = TONE_CLASS[tone];
  return (
    <section className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-text">Selected arc</h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-text-faint hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${t.softBg}`}>
            <Icon className={`h-3.5 w-3.5 ${t.text}`} />
          </span>
          <span className={`font-medium ${t.text}`}>{ACTION_LABEL[arc.kind]}</span>
          <span className="text-text-faint">·</span>
          <span className="text-text-dim">{PROVIDER_LABEL[arc.provider]}</span>
        </div>
        <div className="text-text">{arc.mailboxEmail}</div>
        <div className="text-xs text-text-dim">{arc.subClientName}</div>
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-text-faint">
          <Clock className="h-3 w-3" />
          spawned just now
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// SubClientsLegend
// ---------------------------------------------------------------------------

function SubClientsLegend({
  origins,
  selected,
  onSelect,
}: {
  origins: Array<{ id: string; name: string; logoChar: string }>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-text">Sub-clients</h3>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`text-xs ${selected === null ? 'text-accent' : 'text-text-dim hover:text-text'}`}
        >
          all
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {origins.map((o) => {
          const isSel = selected === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(isSel ? null : o.id)}
              className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs transition ${
                isSel
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border-muted bg-surface-2 text-text hover:border-accent/30'
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-medium ${
                  isSel ? 'bg-accent/20 text-accent' : 'bg-bg text-text-dim'
                }`}
              >
                {o.logoChar}
              </span>
              <span className="truncate">{o.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TopActiveMailboxesCard
// ---------------------------------------------------------------------------

function TopActiveMailboxesCard({
  items,
}: {
  items: AgencyActivityData['topActiveMailboxes'];
}): JSX.Element {
  const max = useMemo(
    () => Math.max(1, ...items.map((i) => i.eventsToday)),
    [items],
  );
  return (
    <section className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-accent2" />
        <h3 className="text-sm font-medium text-text">Top active mailboxes</h3>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((m) => {
          const pct = (m.eventsToday / max) * 100;
          return (
            <li key={m.mailboxId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex flex-col">
                  <span className="text-text">{m.mailboxEmail}</span>
                  <span className="text-[10px] text-text-faint">
                    {m.subClientName}
                  </span>
                </div>
                <span className="tabular-nums text-text-dim">
                  {formatNumber(m.eventsToday)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                <motion.div
                  className="h-full bg-accent2"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// RecentAlertsCard — cross-fading ticker over alerts.
// ---------------------------------------------------------------------------

function RecentAlertsCard({
  alerts,
}: {
  alerts: AgencyActivityData['alerts'];
}): JSX.Element {
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (alerts.length <= 1) return;
    const t = setInterval(() => {
      setCursor((c) => (c + 1) % alerts.length);
    }, 4500);
    return () => clearInterval(t);
  }, [alerts.length]);

  return (
    <section className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Siren className="h-4 w-4 text-accent3" />
          <h3 className="text-sm font-medium text-text">Recent alerts</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-faint">
          {alerts.length} open
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {alerts.map((al, i) => {
          const Icon = ALERT_KIND_ICON[al.kind];
          const tone = toneFromSeverity(al.severity);
          const t = TONE_CLASS[tone];
          const isFocused = i === cursor;
          return (
            <motion.div
              key={al.id}
              animate={{
                opacity: isFocused ? 1 : 0.55,
                scale: isFocused ? 1 : 0.99,
              }}
              transition={{ duration: 0.4 }}
              className={`flex items-start gap-2 rounded-xl border ${
                isFocused ? t.softBorder : 'border-border-muted'
              } ${isFocused ? t.softBg : 'bg-surface-2'} px-3 py-2`}
            >
              <span className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md ${t.softBg}`}>
                <Icon className={`h-3.5 w-3.5 ${t.text}`} />
              </span>
              <div className="flex flex-1 flex-col">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-medium ${t.text}`}>
                    {ALERT_KIND_LABEL[al.kind]}
                  </span>
                  <span className="text-text-faint">{al.timeAgo}</span>
                </div>
                <div className="text-xs text-text">{al.message}</div>
                {al.subClientName && (
                  <div className="text-[10px] text-text-faint">
                    {al.subClientName}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// KindBreakdownCard — small kind-count grid.
// ---------------------------------------------------------------------------

function KindBreakdownCard({
  counts,
}: {
  counts: Record<ActionKind, number>;
}): JSX.Element {
  const items: ActionKind[] = [
    'sent',
    'opened',
    'replied',
    'starred',
    'spam_rescue',
    'bounce',
  ];
  const total = items.reduce((s, k) => s + counts[k], 0);
  return (
    <section className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-medium text-text">Kind breakdown</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((k) => {
          const Icon = ACTION_ICON[k];
          const tone = toneFromAction(k);
          const t = TONE_CLASS[tone];
          const c = counts[k];
          const pct = total > 0 ? (c / total) * 100 : 0;
          return (
            <div
              key={k}
              className={`flex items-center gap-2 rounded-xl border ${t.softBorder} ${t.softBg} px-2 py-1.5`}
            >
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${t.softBg}`}>
                <Icon className={`h-3.5 w-3.5 ${t.text}`} />
              </span>
              <div className="flex flex-1 flex-col">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text">{ACTION_LABEL[k]}</span>
                  <span className="tabular-nums text-text-dim">{c}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-bg">
                  <motion.div
                    className={`h-full ${t.bg}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default AgActS3Globe;

// ---------------------------------------------------------------------------
// Notes on the variant identity (kept inline so future maintainers can see
// what S3 is supposed to be without opening the spec):
//
//   * Identity = GLOBE. The 600×600 SVG canvas with continents + arcs is the
//     hero. Replacing it with anything else (a table, a grid, a list) means
//     this variant has lost its reason to exist.
//
//   * Q1 sibling owns the streaming-feed identity, Q2 owns the heatmap, Q3
//     owns the journey timeline, Q4 owns the kanban-per-action. The four
//     variants ship together so a designer can compare strong-but-distinct
//     interpretations of the same data shape.
//
//   * No `@/features/*` imports — every helper / hook / component is inline
//     so the design-preview harness can mount this file on its own without
//     pulling in the live data layer. Same constraint applies to every
//     sibling candidate in this folder.
//
//   * Tailwind tokens ONLY — the project's design system is closed under
//     the (bg / surface / surface-2 / text / accent / accent2 / accent3 /
//     accent4 / border-muted) palette. Default Tailwind colors are
//     intentionally absent from the canvas.
//
//   * lucide-react is the only icon source. No emoji.
//
//   * Random-feeling positions are seeded by a deterministic hash of the
//     sub-client id so re-renders, hot-reloads, and test snapshots don't
//     reshuffle the layout.
//
//   * The SMIL <animateMotion> on the comet dot was chosen over a JS
//     `requestAnimationFrame` per-arc because the browser composites it
//     off-thread, keeping framerate steady even with ~15 concurrent arcs.
//     framer-motion drives every non-path-following animation (KPI counts,
//     hub flashes, arc opacity).
// ---------------------------------------------------------------------------
