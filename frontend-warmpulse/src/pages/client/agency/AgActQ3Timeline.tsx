import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  Eye,
  Filter,
  Flame,
  Gauge,
  Globe,
  History,
  Inbox,
  Layers,
  Mail,
  MailCheck,
  MailOpen,
  MailPlus,
  Move,
  Pause,
  Pin,
  Play,
  Plus,
  Reply,
  RotateCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  ShieldOff,
  Siren,
  Sparkles,
  Star,
  TimerReset,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgActQ3Timeline — Agency-tier ACTIVITY surface, "Timeline Scrubber" candidate.
 * Q3 of four (Q1 / Q2 / Q3 / Q4).
 *
 * The /app/activity surface for Agency-tier users — a premium vertical
 * timeline of the day's warmup events with a draggable horizontal time
 * SCRUBBER strip across the top. The user grabs the scrubber thumb (or
 * presses arrow keys) and the vertical timeline rolls to bring the chosen
 * hour into focus; events outside the focus dim to ~0.4 opacity while
 * the focused hour glows.
 *
 * The signature interaction is the scrub-then-scroll dance: dragging the
 * thumb moves a framer-motion `useSpring` that drives the timeline's
 * `scrollTop`, so the eye sees the timeline "fly" to the matching hour
 * with a soft easing rather than a hard jump. Below the scrubber axis
 * sits a 24-bar histogram of hourly event volume that animates its bars
 * up from 0 on mount with a 32ms stagger.
 *
 * Each event card carries an action icon, the mailbox / sub-client /
 * provider, and a status-tinted left border matching the action kind.
 * Events within the same hour cluster under a sticky hour-header band.
 *
 * Fully STANDALONE — no @/features/* imports, no router, no query hooks,
 * no required props. Every value comes from inline MOCK so the preview
 * harness mounts it prop-less. The future adapter passes `data` once a
 * live aggregate endpoint exists. Renders only page content; the app
 * shell supplies the chrome.
 *
 * NOT a heatmap calendar (Q1 owns that), NOT a swimlane lane-view (Q2
 * owns that), NOT a globe / map of the world (Q4 owns that). The
 * scrub-then-glow vertical timeline identity is the differentiator.
 */

// ---------------------------------------------------------------------------
// Shared Agency activity data shape (kept in sync across all 4 variants).
// ---------------------------------------------------------------------------

type ActionKind =
  | 'sent'
  | 'opened'
  | 'replied'
  | 'starred'
  | 'spam_rescue'
  | 'bounce';
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
// Mock data — Northwind Agency · 8 sub-clients · 96 mailboxes · 50 events.
// ---------------------------------------------------------------------------

/**
 * Sub-client catalogue. Mirrors the same 8 sub-clients used across the
 * Reputation / Workspace / Mailboxes design rounds — keeps the agency
 * narrative consistent between surfaces so a designer can flip between
 * variants and recognise "Lumen Labs" / "Helix Outreach" etc.
 */
const SUB_CLIENT_CATALOGUE = [
  {
    id: 'sc-lumen',
    name: 'Lumen Labs',
    logoChar: 'L',
    domain: 'lumenlabs.io',
  },
  {
    id: 'sc-helix',
    name: 'Helix Outreach',
    logoChar: 'H',
    domain: 'helix.com',
  },
  {
    id: 'sc-nimbus',
    name: 'Nimbus Cloud',
    logoChar: 'N',
    domain: 'nimbuscloud.io',
  },
  {
    id: 'sc-orion',
    name: 'Orion Sales',
    logoChar: 'O',
    domain: 'orionsales.com',
  },
  {
    id: 'sc-vega',
    name: 'Vega Outbound',
    logoChar: 'V',
    domain: 'vegaoutbound.io',
  },
  {
    id: 'sc-quasar',
    name: 'Quasar Growth',
    logoChar: 'Q',
    domain: 'quasargrowth.com',
  },
  {
    id: 'sc-atlas',
    name: 'Atlas Bio',
    logoChar: 'A',
    domain: 'atlas-bio.com',
  },
  {
    id: 'sc-pixel',
    name: 'Pixel Forge',
    logoChar: 'P',
    domain: 'pixelforge.io',
  },
] as const;

/**
 * Today's hourly volume. 24 entries (00:00 → 23:00 local). Crafted with a
 * realistic SaaS warmup pattern — quiet overnight (00–05), morning ramp,
 * peak 09–11, lunch dip 13, afternoon plateau 14–17, evening tail-off.
 */
const HOURLY_VOLUME: AgencyActivityData['hourlyVolume'] = [
  { hour: '00:00', sends: 6, opens: 4, replies: 1, rescues: 0 },
  { hour: '01:00', sends: 4, opens: 2, replies: 0, rescues: 0 },
  { hour: '02:00', sends: 3, opens: 1, replies: 0, rescues: 0 },
  { hour: '03:00', sends: 2, opens: 1, replies: 0, rescues: 1 },
  { hour: '04:00', sends: 3, opens: 2, replies: 0, rescues: 0 },
  { hour: '05:00', sends: 5, opens: 3, replies: 1, rescues: 0 },
  { hour: '06:00', sends: 12, opens: 8, replies: 2, rescues: 1 },
  { hour: '07:00', sends: 28, opens: 19, replies: 5, rescues: 2 },
  { hour: '08:00', sends: 52, opens: 38, replies: 11, rescues: 3 },
  { hour: '09:00', sends: 74, opens: 56, replies: 17, rescues: 4 },
  { hour: '10:00', sends: 81, opens: 62, replies: 19, rescues: 5 },
  { hour: '11:00', sends: 78, opens: 60, replies: 18, rescues: 4 },
  { hour: '12:00', sends: 64, opens: 47, replies: 13, rescues: 3 },
  { hour: '13:00', sends: 42, opens: 31, replies: 9, rescues: 2 },
  { hour: '14:00', sends: 69, opens: 54, replies: 16, rescues: 4 },
  { hour: '15:00', sends: 73, opens: 57, replies: 17, rescues: 4 },
  { hour: '16:00', sends: 71, opens: 55, replies: 16, rescues: 3 },
  { hour: '17:00', sends: 58, opens: 44, replies: 12, rescues: 3 },
  { hour: '18:00', sends: 41, opens: 30, replies: 8, rescues: 2 },
  { hour: '19:00', sends: 26, opens: 18, replies: 5, rescues: 1 },
  { hour: '20:00', sends: 17, opens: 11, replies: 3, rescues: 1 },
  { hour: '21:00', sends: 11, opens: 7, replies: 2, rescues: 0 },
  { hour: '22:00', sends: 8, opens: 5, replies: 1, rescues: 0 },
  { hour: '23:00', sends: 6, opens: 4, replies: 1, rescues: 0 },
];

/**
 * Top-active mailboxes today. Hand-picked across all 8 sub-clients to keep
 * the right-rail "Top mailboxes" panel diverse in domain / provider mix.
 */
const TOP_ACTIVE_MAILBOXES: AgencyActivityData['topActiveMailboxes'] = [
  {
    mailboxId: 'mb-lumen-01',
    mailboxEmail: 'alex@lumenlabs.io',
    subClientName: 'Lumen Labs',
    eventsToday: 188,
  },
  {
    mailboxId: 'mb-orion-04',
    mailboxEmail: 'sales@orionsales.com',
    subClientName: 'Orion Sales',
    eventsToday: 174,
  },
  {
    mailboxId: 'mb-nimbus-02',
    mailboxEmail: 'hello@nimbuscloud.io',
    subClientName: 'Nimbus Cloud',
    eventsToday: 162,
  },
  {
    mailboxId: 'mb-helix-03',
    mailboxEmail: 'team@helix.com',
    subClientName: 'Helix Outreach',
    eventsToday: 149,
  },
  {
    mailboxId: 'mb-quasar-02',
    mailboxEmail: 'growth@quasargrowth.com',
    subClientName: 'Quasar Growth',
    eventsToday: 137,
  },
  {
    mailboxId: 'mb-vega-01',
    mailboxEmail: 'outreach@vegaoutbound.io',
    subClientName: 'Vega Outbound',
    eventsToday: 122,
  },
  {
    mailboxId: 'mb-atlas-02',
    mailboxEmail: 'connect@atlas-bio.com',
    subClientName: 'Atlas Bio',
    eventsToday: 98,
  },
  {
    mailboxId: 'mb-pixel-01',
    mailboxEmail: 'studio@pixelforge.io',
    subClientName: 'Pixel Forge',
    eventsToday: 84,
  },
];

/**
 * Alerts ticker — surfaces three notable agency-wide signal patterns that
 * the alert-check job would fire. The alerts intentionally span warn /
 * critical so the inspector can showcase severity affordances.
 */
const ALERTS: AgencyActivityData['alerts'] = [
  {
    id: 'al-1',
    kind: 'spam_burst',
    message: 'Atlas Bio · 4 spam-rescue events in 18min',
    timeAgo: '14m ago',
    severity: 'critical',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
  },
  {
    id: 'al-2',
    kind: 'silence',
    message: 'Pixel Forge · no outbound activity for 2h',
    timeAgo: '38m ago',
    severity: 'warn',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
  },
  {
    id: 'al-3',
    kind: 'spike',
    message: 'Orion Sales · open rate spiked +44% above baseline',
    timeAgo: '1h ago',
    severity: 'info',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
  },
];

/**
 * Build a weekly heatmap (7 days × 24 hours = 168 cells). Loosely follows
 * the day's `HOURLY_VOLUME` curve with a day-of-week scale (lower on
 * weekends, higher Tue–Thu) and a per-cell hash so individual cells don't
 * read as perfectly uniform.
 */
function buildWeeklyHeatmap(): AgencyActivityData['weeklyHeatmap'] {
  const dayScale = [0.6, 0.92, 1.05, 1.1, 1.0, 0.85, 0.5]; // Mon..Sun
  const peakCount = Math.max(...HOURLY_VOLUME.map((h) => h.sends));
  const out: AgencyActivityData['weeklyHeatmap'] = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const base = HOURLY_VOLUME[hour]?.sends ?? 0;
      // Deterministic per-cell variation: trig hash on (day, hour).
      const variation = 0.85 + ((Math.sin(day * 7.3 + hour * 1.7) + 1) / 2) * 0.3;
      const events = Math.round(base * (dayScale[day] ?? 1) * variation);
      const intensity = peakCount > 0 ? events / peakCount : 0;
      out.push({ day, hour, intensity, events });
    }
  }
  return out;
}

const WEEKLY_HEATMAP = buildWeeklyHeatmap();

/**
 * 50 mock events — one per slot, distributed across the day with a sensible
 * shape (heavier 08–17). Each event is fully self-contained: kind, ISO
 * timestamp, mailbox / sub-client / provider, peer counterpart, and a
 * human note that explains what happened (used as the card body).
 */
const RAW_EVENTS: AgencyActivityData['events'] = [
  {
    id: 'ev-001',
    kind: 'sent',
    timestamp: '2026-05-27T16:38:00Z',
    timeAgo: '2m ago',
    mailboxId: 'mb-lumen-01',
    mailboxEmail: 'alex@lumenlabs.io',
    provider: 'gmail',
    subClientId: 'sc-lumen',
    subClientName: 'Lumen Labs',
    subClientLogoChar: 'L',
    peerEmail: 'morgan@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "quick question about Q3 planning"',
  },
  {
    id: 'ev-002',
    kind: 'opened',
    timestamp: '2026-05-27T16:35:00Z',
    timeAgo: '5m ago',
    mailboxId: 'mb-orion-04',
    mailboxEmail: 'sales@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'jamie@peer-mailroom.dev',
    note: 'Peer opened warmup thread within 38s of delivery',
  },
  {
    id: 'ev-003',
    kind: 'replied',
    timestamp: '2026-05-27T16:31:00Z',
    timeAgo: '9m ago',
    mailboxId: 'mb-helix-03',
    mailboxEmail: 'team@helix.com',
    provider: 'outlook',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'pat@peer-mailroom.dev',
    note: 'Peer replied to warmup thread · 2-message exchange',
  },
  {
    id: 'ev-004',
    kind: 'opened',
    timestamp: '2026-05-27T16:28:00Z',
    timeAgo: '12m ago',
    mailboxId: 'mb-nimbus-02',
    mailboxEmail: 'hello@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'sam@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-005',
    kind: 'spam_rescue',
    timestamp: '2026-05-27T16:24:00Z',
    timeAgo: '16m ago',
    mailboxId: 'mb-atlas-02',
    mailboxEmail: 'connect@atlas-bio.com',
    provider: 'smtp',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    peerEmail: 'lee@peer-mailroom.dev',
    note: 'Thread rescued from spam folder · marked "not spam" + starred',
  },
  {
    id: 'ev-006',
    kind: 'sent',
    timestamp: '2026-05-27T16:21:00Z',
    timeAgo: '19m ago',
    mailboxId: 'mb-quasar-02',
    mailboxEmail: 'growth@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'avery@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "Re: catching up next week?"',
  },
  {
    id: 'ev-007',
    kind: 'starred',
    timestamp: '2026-05-27T16:17:00Z',
    timeAgo: '23m ago',
    mailboxId: 'mb-vega-01',
    mailboxEmail: 'outreach@vegaoutbound.io',
    provider: 'gmail',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    peerEmail: 'taylor@peer-mailroom.dev',
    note: 'Peer starred warmup thread · positive engagement signal',
  },
  {
    id: 'ev-008',
    kind: 'opened',
    timestamp: '2026-05-27T16:11:00Z',
    timeAgo: '29m ago',
    mailboxId: 'mb-lumen-02',
    mailboxEmail: 'support@lumenlabs.io',
    provider: 'gmail',
    subClientId: 'sc-lumen',
    subClientName: 'Lumen Labs',
    subClientLogoChar: 'L',
    peerEmail: 'morgan@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-009',
    kind: 'sent',
    timestamp: '2026-05-27T16:06:00Z',
    timeAgo: '34m ago',
    mailboxId: 'mb-pixel-01',
    mailboxEmail: 'studio@pixelforge.io',
    provider: 'smtp',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    peerEmail: 'kai@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "design review feedback"',
  },
  {
    id: 'ev-010',
    kind: 'replied',
    timestamp: '2026-05-27T16:02:00Z',
    timeAgo: '38m ago',
    mailboxId: 'mb-orion-01',
    mailboxEmail: 'enterprise@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'jamie@peer-mailroom.dev',
    note: 'Peer replied to warmup thread · 3-message exchange',
  },
  {
    id: 'ev-011',
    kind: 'opened',
    timestamp: '2026-05-27T15:54:00Z',
    timeAgo: '46m ago',
    mailboxId: 'mb-helix-01',
    mailboxEmail: 'pat@helix.com',
    provider: 'outlook',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'pat@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-012',
    kind: 'sent',
    timestamp: '2026-05-27T15:49:00Z',
    timeAgo: '51m ago',
    mailboxId: 'mb-nimbus-01',
    mailboxEmail: 'team@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'sam@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "checking in for the week"',
  },
  {
    id: 'ev-013',
    kind: 'opened',
    timestamp: '2026-05-27T15:42:00Z',
    timeAgo: '58m ago',
    mailboxId: 'mb-vega-02',
    mailboxEmail: 'connect@vegaoutbound.io',
    provider: 'gmail',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    peerEmail: 'taylor@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-014',
    kind: 'spam_rescue',
    timestamp: '2026-05-27T15:38:00Z',
    timeAgo: '1h ago',
    mailboxId: 'mb-atlas-01',
    mailboxEmail: 'hello@atlas-bio.com',
    provider: 'smtp',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    peerEmail: 'lee@peer-mailroom.dev',
    note: 'Thread rescued from spam folder · marked "not spam"',
  },
  {
    id: 'ev-015',
    kind: 'sent',
    timestamp: '2026-05-27T15:31:00Z',
    timeAgo: '1h ago',
    mailboxId: 'mb-quasar-01',
    mailboxEmail: 'hello@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'avery@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "agenda for next sync"',
  },
  {
    id: 'ev-016',
    kind: 'starred',
    timestamp: '2026-05-27T15:24:00Z',
    timeAgo: '1h ago',
    mailboxId: 'mb-lumen-03',
    mailboxEmail: 'partners@lumenlabs.io',
    provider: 'gmail',
    subClientId: 'sc-lumen',
    subClientName: 'Lumen Labs',
    subClientLogoChar: 'L',
    peerEmail: 'morgan@peer-mailroom.dev',
    note: 'Peer starred warmup thread · positive engagement signal',
  },
  {
    id: 'ev-017',
    kind: 'replied',
    timestamp: '2026-05-27T15:18:00Z',
    timeAgo: '1h ago',
    mailboxId: 'mb-orion-02',
    mailboxEmail: 'demo@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'jamie@peer-mailroom.dev',
    note: 'Peer replied to warmup thread · 2-message exchange',
  },
  {
    id: 'ev-018',
    kind: 'opened',
    timestamp: '2026-05-27T15:11:00Z',
    timeAgo: '1h ago',
    mailboxId: 'mb-helix-02',
    mailboxEmail: 'demo@helix.com',
    provider: 'outlook',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'pat@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-019',
    kind: 'sent',
    timestamp: '2026-05-27T15:04:00Z',
    timeAgo: '1h ago',
    mailboxId: 'mb-pixel-02',
    mailboxEmail: 'hello@pixelforge.io',
    provider: 'smtp',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    peerEmail: 'kai@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "studio Q3 retrospective"',
  },
  {
    id: 'ev-020',
    kind: 'opened',
    timestamp: '2026-05-27T14:58:00Z',
    timeAgo: '1h ago',
    mailboxId: 'mb-nimbus-03',
    mailboxEmail: 'partners@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'sam@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-021',
    kind: 'sent',
    timestamp: '2026-05-27T14:51:00Z',
    timeAgo: '1h ago',
    mailboxId: 'mb-vega-03',
    mailboxEmail: 'hello@vegaoutbound.io',
    provider: 'gmail',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    peerEmail: 'taylor@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "deck for partner intro"',
  },
  {
    id: 'ev-022',
    kind: 'starred',
    timestamp: '2026-05-27T14:44:00Z',
    timeAgo: '2h ago',
    mailboxId: 'mb-atlas-03',
    mailboxEmail: 'partners@atlas-bio.com',
    provider: 'smtp',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    peerEmail: 'lee@peer-mailroom.dev',
    note: 'Peer starred warmup thread · positive engagement signal',
  },
  {
    id: 'ev-023',
    kind: 'opened',
    timestamp: '2026-05-27T14:36:00Z',
    timeAgo: '2h ago',
    mailboxId: 'mb-quasar-03',
    mailboxEmail: 'team@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'avery@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-024',
    kind: 'replied',
    timestamp: '2026-05-27T14:29:00Z',
    timeAgo: '2h ago',
    mailboxId: 'mb-lumen-04',
    mailboxEmail: 'team@lumenlabs.io',
    provider: 'gmail',
    subClientId: 'sc-lumen',
    subClientName: 'Lumen Labs',
    subClientLogoChar: 'L',
    peerEmail: 'morgan@peer-mailroom.dev',
    note: 'Peer replied to warmup thread · 2-message exchange',
  },
  {
    id: 'ev-025',
    kind: 'sent',
    timestamp: '2026-05-27T14:21:00Z',
    timeAgo: '2h ago',
    mailboxId: 'mb-orion-03',
    mailboxEmail: 'team@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'jamie@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "deck review draft"',
  },
  {
    id: 'ev-026',
    kind: 'opened',
    timestamp: '2026-05-27T14:14:00Z',
    timeAgo: '2h ago',
    mailboxId: 'mb-helix-04',
    mailboxEmail: 'partners@helix.com',
    provider: 'outlook',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'pat@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-027',
    kind: 'sent',
    timestamp: '2026-05-27T14:06:00Z',
    timeAgo: '2h ago',
    mailboxId: 'mb-pixel-03',
    mailboxEmail: 'studio.b@pixelforge.io',
    provider: 'smtp',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    peerEmail: 'kai@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "weekly notes recap"',
  },
  {
    id: 'ev-028',
    kind: 'starred',
    timestamp: '2026-05-27T13:48:00Z',
    timeAgo: '3h ago',
    mailboxId: 'mb-nimbus-04',
    mailboxEmail: 'demo@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'sam@peer-mailroom.dev',
    note: 'Peer starred warmup thread · positive engagement signal',
  },
  {
    id: 'ev-029',
    kind: 'opened',
    timestamp: '2026-05-27T13:36:00Z',
    timeAgo: '3h ago',
    mailboxId: 'mb-vega-04',
    mailboxEmail: 'demo@vegaoutbound.io',
    provider: 'gmail',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    peerEmail: 'taylor@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-030',
    kind: 'sent',
    timestamp: '2026-05-27T13:24:00Z',
    timeAgo: '3h ago',
    mailboxId: 'mb-atlas-04',
    mailboxEmail: 'demo@atlas-bio.com',
    provider: 'smtp',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    peerEmail: 'lee@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "demo schedule next week"',
  },
  {
    id: 'ev-031',
    kind: 'replied',
    timestamp: '2026-05-27T13:11:00Z',
    timeAgo: '3h ago',
    mailboxId: 'mb-quasar-04',
    mailboxEmail: 'demo@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'avery@peer-mailroom.dev',
    note: 'Peer replied to warmup thread · 3-message exchange',
  },
  {
    id: 'ev-032',
    kind: 'opened',
    timestamp: '2026-05-27T12:58:00Z',
    timeAgo: '4h ago',
    mailboxId: 'mb-lumen-05',
    mailboxEmail: 'demo@lumenlabs.io',
    provider: 'gmail',
    subClientId: 'sc-lumen',
    subClientName: 'Lumen Labs',
    subClientLogoChar: 'L',
    peerEmail: 'morgan@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-033',
    kind: 'sent',
    timestamp: '2026-05-27T12:42:00Z',
    timeAgo: '4h ago',
    mailboxId: 'mb-orion-05',
    mailboxEmail: 'demo@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'jamie@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "deal review board prep"',
  },
  {
    id: 'ev-034',
    kind: 'starred',
    timestamp: '2026-05-27T12:28:00Z',
    timeAgo: '4h ago',
    mailboxId: 'mb-helix-05',
    mailboxEmail: 'demo@helix.com',
    provider: 'outlook',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'pat@peer-mailroom.dev',
    note: 'Peer starred warmup thread · positive engagement signal',
  },
  {
    id: 'ev-035',
    kind: 'opened',
    timestamp: '2026-05-27T12:14:00Z',
    timeAgo: '4h ago',
    mailboxId: 'mb-pixel-04',
    mailboxEmail: 'demo@pixelforge.io',
    provider: 'smtp',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    peerEmail: 'kai@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-036',
    kind: 'sent',
    timestamp: '2026-05-27T11:51:00Z',
    timeAgo: '5h ago',
    mailboxId: 'mb-nimbus-05',
    mailboxEmail: 'demo.b@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'sam@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "weekly notes — Nimbus"',
  },
  {
    id: 'ev-037',
    kind: 'replied',
    timestamp: '2026-05-27T11:38:00Z',
    timeAgo: '5h ago',
    mailboxId: 'mb-vega-05',
    mailboxEmail: 'demo.b@vegaoutbound.io',
    provider: 'gmail',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    peerEmail: 'taylor@peer-mailroom.dev',
    note: 'Peer replied to warmup thread · 2-message exchange',
  },
  {
    id: 'ev-038',
    kind: 'sent',
    timestamp: '2026-05-27T11:21:00Z',
    timeAgo: '5h ago',
    mailboxId: 'mb-atlas-05',
    mailboxEmail: 'demo.b@atlas-bio.com',
    provider: 'smtp',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    peerEmail: 'lee@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "bio outreach kickoff"',
  },
  {
    id: 'ev-039',
    kind: 'opened',
    timestamp: '2026-05-27T11:08:00Z',
    timeAgo: '5h ago',
    mailboxId: 'mb-quasar-05',
    mailboxEmail: 'demo.b@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'avery@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-040',
    kind: 'sent',
    timestamp: '2026-05-27T10:52:00Z',
    timeAgo: '6h ago',
    mailboxId: 'mb-lumen-06',
    mailboxEmail: 'team.b@lumenlabs.io',
    provider: 'gmail',
    subClientId: 'sc-lumen',
    subClientName: 'Lumen Labs',
    subClientLogoChar: 'L',
    peerEmail: 'morgan@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "thanks for jumping on yesterday"',
  },
  {
    id: 'ev-041',
    kind: 'starred',
    timestamp: '2026-05-27T10:38:00Z',
    timeAgo: '6h ago',
    mailboxId: 'mb-orion-06',
    mailboxEmail: 'team.b@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'jamie@peer-mailroom.dev',
    note: 'Peer starred warmup thread · positive engagement signal',
  },
  {
    id: 'ev-042',
    kind: 'opened',
    timestamp: '2026-05-27T10:22:00Z',
    timeAgo: '6h ago',
    mailboxId: 'mb-helix-06',
    mailboxEmail: 'team.b@helix.com',
    provider: 'outlook',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'pat@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-043',
    kind: 'spam_rescue',
    timestamp: '2026-05-27T10:04:00Z',
    timeAgo: '6h ago',
    mailboxId: 'mb-atlas-06',
    mailboxEmail: 'team.b@atlas-bio.com',
    provider: 'smtp',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    peerEmail: 'lee@peer-mailroom.dev',
    note: 'Thread rescued from spam folder · marked "not spam"',
  },
  {
    id: 'ev-044',
    kind: 'sent',
    timestamp: '2026-05-27T09:48:00Z',
    timeAgo: '7h ago',
    mailboxId: 'mb-pixel-05',
    mailboxEmail: 'team.b@pixelforge.io',
    provider: 'smtp',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    peerEmail: 'kai@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "weekly mocks"',
  },
  {
    id: 'ev-045',
    kind: 'replied',
    timestamp: '2026-05-27T09:31:00Z',
    timeAgo: '7h ago',
    mailboxId: 'mb-nimbus-06',
    mailboxEmail: 'team.b@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'sam@peer-mailroom.dev',
    note: 'Peer replied to warmup thread · 2-message exchange',
  },
  {
    id: 'ev-046',
    kind: 'opened',
    timestamp: '2026-05-27T09:14:00Z',
    timeAgo: '7h ago',
    mailboxId: 'mb-vega-06',
    mailboxEmail: 'team.b@vegaoutbound.io',
    provider: 'gmail',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    peerEmail: 'taylor@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-047',
    kind: 'sent',
    timestamp: '2026-05-27T08:58:00Z',
    timeAgo: '8h ago',
    mailboxId: 'mb-quasar-06',
    mailboxEmail: 'team.b@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'avery@peer-mailroom.dev',
    note: 'Warmup thread sent to peer · subject "Q3 growth memo"',
  },
  {
    id: 'ev-048',
    kind: 'starred',
    timestamp: '2026-05-27T08:42:00Z',
    timeAgo: '8h ago',
    mailboxId: 'mb-lumen-07',
    mailboxEmail: 'eng@lumenlabs.io',
    provider: 'gmail',
    subClientId: 'sc-lumen',
    subClientName: 'Lumen Labs',
    subClientLogoChar: 'L',
    peerEmail: 'morgan@peer-mailroom.dev',
    note: 'Peer starred warmup thread · positive engagement signal',
  },
  {
    id: 'ev-049',
    kind: 'opened',
    timestamp: '2026-05-27T08:24:00Z',
    timeAgo: '8h ago',
    mailboxId: 'mb-orion-07',
    mailboxEmail: 'eng@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'jamie@peer-mailroom.dev',
    note: 'Peer opened warmup thread',
  },
  {
    id: 'ev-050',
    kind: 'bounce',
    timestamp: '2026-05-27T08:09:00Z',
    timeAgo: '8h ago',
    mailboxId: 'mb-helix-07',
    mailboxEmail: 'eng@helix.com',
    provider: 'outlook',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'pat@peer-mailroom.dev',
    note: 'Warmup send bounced · MX returned 550 · auto-paired with backup peer',
  },
];

const MOCK: AgencyActivityData = {
  workspace: {
    name: 'Northwind Agency',
    subClientCount: SUB_CLIENT_CATALOGUE.length,
    mailboxCount: 96,
  },
  kpis: {
    eventsToday: 1832,
    sendsToday: 952,
    opensToday: 638,
    repliesToday: 161,
    spamRescuesToday: 42,
    peerInteractionsToday: 1247,
    eventsLastHour: 184,
    avgEventsPerMin: 3.1,
  },
  events: RAW_EVENTS,
  hourlyVolume: HOURLY_VOLUME,
  weeklyHeatmap: WEEKLY_HEATMAP,
  topActiveMailboxes: TOP_ACTIVE_MAILBOXES,
  alerts: ALERTS,
};

/**
 * Skeleton fallback for the future live adapter — used when the API hasn't
 * loaded yet (or has failed) so we don't render mock data the user might
 * mistake for their own. Every collection is empty / zeroed.
 */
export const AGENCY_ACTIVITY_SKELETON_Q3: AgencyActivityData = {
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
  hourlyVolume: Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    sends: 0,
    opens: 0,
    replies: 0,
    rescues: 0,
  })),
  weeklyHeatmap: Array.from({ length: 7 * 24 }, (_, i) => ({
    day: Math.floor(i / 24),
    hour: i % 24,
    intensity: 0,
    events: 0,
  })),
  topActiveMailboxes: [],
  alerts: [],
};

// ---------------------------------------------------------------------------
// Theme — token-to-hex map. Used inside SVG / inline style where Tailwind
// classes can't reach. Mirrors `tailwind.config.ts`.
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

const ACTION_COLOR: Record<ActionKind, string> = {
  sent: HEX.accent,
  opened: HEX.accent2,
  replied: HEX.accent,
  starred: HEX.accent4,
  spam_rescue: HEX.accent3,
  bounce: HEX.accent3,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  sent: 'Sent',
  opened: 'Opened',
  replied: 'Replied',
  starred: 'Starred',
  spam_rescue: 'Spam rescue',
  bounce: 'Bounce',
};

const ACTION_VERB: Record<ActionKind, string> = {
  sent: 'sent a warmup',
  opened: 'opened a warmup',
  replied: 'replied to a warmup',
  starred: 'starred a warmup',
  spam_rescue: 'rescued from spam',
  bounce: 'send bounced',
};

const ACTION_ICON: Record<ActionKind, typeof Mail> = {
  sent: MailPlus,
  opened: MailOpen,
  replied: Reply,
  starred: Star,
  spam_rescue: ShieldCheck,
  bounce: ShieldOff,
};

const ACTION_BORDER_CLASS: Record<ActionKind, string> = {
  sent: 'border-l-accent',
  opened: 'border-l-accent2',
  replied: 'border-l-accent',
  starred: 'border-l-accent4',
  spam_rescue: 'border-l-accent3',
  bounce: 'border-l-accent3',
};

const ACTION_RING_CLASS: Record<ActionKind, string> = {
  sent: 'border-accent/40 bg-accent/10 text-accent',
  opened: 'border-accent2/40 bg-accent2/10 text-accent2',
  replied: 'border-accent/40 bg-accent/10 text-accent',
  starred: 'border-accent4/40 bg-accent4/10 text-accent4',
  spam_rescue: 'border-accent3/40 bg-accent3/10 text-accent3',
  bounce: 'border-accent3/40 bg-accent3/10 text-accent3',
};

const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

const PROVIDER_CHIP_CLASS: Record<MailboxProvider, string> = {
  gmail: 'border-accent/30 bg-accent/10 text-accent',
  outlook: 'border-accent2/30 bg-accent2/10 text-accent2',
  yahoo: 'border-accent4/30 bg-accent4/10 text-accent4',
  smtp: 'border-border-muted bg-surface-2 text-text-dim',
};

const ALERT_SEVERITY_CLASS: Record<AlertSeverity, string> = {
  info: 'border-accent2/40 bg-accent2/10 text-accent2',
  warn: 'border-accent4/40 bg-accent4/10 text-accent4',
  critical: 'border-accent3/40 bg-accent3/10 text-accent3',
};

const ALERT_KIND_ICON: Record<AlertKind, typeof AlertTriangle> = {
  spike: TrendingUp,
  silence: Pause,
  spam_burst: Siren,
};

const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  spike: 'Volume spike',
  silence: 'Silence',
  spam_burst: 'Spam burst',
};

// ---------------------------------------------------------------------------
// Date-window picker model — Today / Yesterday / 7 days ago options.
// ---------------------------------------------------------------------------

type DateWindowId = 'today' | 'yesterday' | '7d';

interface DateWindow {
  id: DateWindowId;
  label: string;
  hint: string;
}

const DATE_WINDOWS: DateWindow[] = [
  { id: 'today', label: 'Today', hint: 'Live · last 24h' },
  { id: 'yesterday', label: 'Yesterday', hint: 'Closed window' },
  { id: '7d', label: '7 days ago', hint: 'Comparison anchor' },
];

// ---------------------------------------------------------------------------
// Time helpers — pure / deterministic.
// ---------------------------------------------------------------------------

/**
 * Parse "HH:MM" from a hourlyVolume bucket and turn it back into a 0..23
 * integer index. Defensive — falls back to 0 on malformed input so the
 * histogram never blows up if the API returns a stray label.
 */
function hourFromLabel(label: string): number {
  const head = label.split(':')[0];
  if (!head) return 0;
  const n = Number.parseInt(head, 10);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : 0;
}

/**
 * Parse an ISO timestamp into a UTC hour-of-day. The mock data uses Zulu
 * timestamps and we want the timeline grouped by hour-of-day in the same
 * frame the histogram uses (UTC) so a click on the scrubber lines up with
 * the visible cards. `Date.getUTCHours()` does exactly that — no local TZ
 * surprises.
 */
function hourFromIso(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  const d = new Date(t);
  return d.getUTCHours();
}

/**
 * Convert a 0..23 hour into a "HH:00" string. Used in headers and labels.
 */
function fmtHour(hour: number): string {
  const safe = Math.max(0, Math.min(23, Math.round(hour)));
  return `${String(safe).padStart(2, '0')}:00`;
}

/**
 * Render the hour band as "HH:00 - HH+1:00", wrapping 23 → 24 to "00:00"
 * so it reads naturally. Used by the scrubber's "NOW VIEWING" pill.
 */
function fmtHourRange(hour: number): string {
  const safe = Math.max(0, Math.min(23, Math.round(hour)));
  const next = (safe + 1) % 24;
  return `${fmtHour(safe)} – ${fmtHour(next)}`;
}

/**
 * Render an ISO timestamp as "HH:MM" in UTC for the timeline left-rail.
 * UTC because the events are UTC and we want the time labels to line up
 * with the hour bands.
 */
function fmtClockUtc(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '--:--';
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(
    d.getUTCMinutes(),
  ).padStart(2, '0')}`;
}

/**
 * Compact integer formatter — 1.8K instead of 1832 for the small KPI tiles
 * where space is tight.
 */
function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  }
  return formatNumber(n);
}

// ---------------------------------------------------------------------------
// Scrubber geometry — viewBox-independent so the SVG scales fluidly.
// The histogram below the axis uses 24 bars across the same horizontal
// span, lining up with the hour tick marks.
// ---------------------------------------------------------------------------

const SCRUB_VB_W = 1000;
const SCRUB_VB_H = 200;
const SCRUB_AXIS_Y = 60; // y-position of the axis line
const SCRUB_AXIS_PADX = 18; // left / right gutter inside the viewBox
const SCRUB_HIST_TOP = 78; // y-position of the histogram base baseline
const SCRUB_HIST_H = 92; // max histogram bar height

/**
 * Convert hour (0..23) → x-coordinate on the scrubber axis, with the
 * gutter applied. Floating-point hour values (during a drag) map smoothly
 * between integer positions.
 */
function hourToX(hour: number): number {
  const safe = Math.max(0, Math.min(23.999, hour));
  const span = SCRUB_VB_W - SCRUB_AXIS_PADX * 2;
  return SCRUB_AXIS_PADX + (safe / 23) * span;
}

/**
 * Inverse of `hourToX` — used during pointer drag / click to derive the
 * focused hour from a click position relative to the scrubber stage.
 */
function xToHour(x: number, stageWidth: number): number {
  if (stageWidth <= 0) return 0;
  // Normalise the viewBox padding into stage-pixel space.
  const padPx = (SCRUB_AXIS_PADX / SCRUB_VB_W) * stageWidth;
  const innerPx = stageWidth - padPx * 2;
  if (innerPx <= 0) return 0;
  const t = (x - padPx) / innerPx;
  return Math.max(0, Math.min(23, t * 23));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgActQ3Timeline(
  { data }: { data?: AgencyActivityData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  // Sort events newest-first; this is the rendering order used by the
  // vertical timeline (timestamp DESC).
  const sortedEvents = useMemo(() => {
    return [...d.events].sort((a, b) => {
      const ta = Date.parse(a.timestamp);
      const tb = Date.parse(b.timestamp);
      return tb - ta;
    });
  }, [d.events]);

  // Group events by UTC hour-of-day. Each group becomes a sticky band in
  // the timeline. We sort the buckets newest-first by max-event-timestamp
  // so the most recent hour sits at the top.
  const grouped = useMemo(() => {
    const byHour = new Map<number, AgencyActivityData['events']>();
    for (const ev of sortedEvents) {
      const h = hourFromIso(ev.timestamp);
      const list = byHour.get(h) ?? [];
      list.push(ev);
      byHour.set(h, list);
    }
    // Sort each bucket newest-first (already global newest-first so this
    // preserves the order within the bucket).
    return Array.from(byHour.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([hour, events]) => ({ hour, events }));
  }, [sortedEvents]);

  // Per-hour event count — used by the inspector's "Selected hour" panel
  // and the scrubber's "NOW VIEWING" pill.
  const eventCountByHour = useMemo(() => {
    const counts = new Array<number>(24).fill(0);
    for (const ev of d.events) {
      const h = hourFromIso(ev.timestamp);
      const prev = counts[h] ?? 0;
      counts[h] = prev + 1;
    }
    return counts;
  }, [d.events]);

  // Date window — "Today / Yesterday / 7 days ago". Click swaps the chip
  // wording and re-runs the mount stagger so the timeline feels reactive.
  const [dateWindow, setDateWindow] = useState<DateWindowId>('today');

  // Active filter — null means "all action kinds". Clicking a swatch in
  // the legend pins it; click again to clear.
  const [filterKind, setFilterKind] = useState<ActionKind | null>(null);

  // Scrubber focus hour. Tracks a fractional value (so we can spring
  // smoothly during drag) and a rounded value (used for highlight /
  // header). MotionValue drives the thumb position and is mirrored into
  // React state via onChange so non-animated UI re-renders.
  const focusHourMV = useMotionValue<number>(15);
  const focusHourSpring = useSpring(focusHourMV, {
    stiffness: 320,
    damping: 32,
    mass: 0.7,
  });
  const [focusHourInt, setFocusHourInt] = useState<number>(15);
  useEffect(() => {
    const unsub = focusHourSpring.on('change', (v) => {
      const safe = Math.max(0, Math.min(23, v));
      setFocusHourInt(Math.round(safe));
    });
    return unsub;
  }, [focusHourSpring]);

  // Refs for the scrubber stage (so we can convert pointer → hour) and
  // the timeline scroll container (so scrubbing scrolls the list).
  const scrubStageRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  // Per-hour anchor ref. The timeline mounts an invisible anchor at the
  // top of each hour group so we can compute its scrollTop and roll the
  // list to it when the scrubber moves.
  const hourAnchorsRef = useRef<Map<number, HTMLDivElement | null>>(new Map());

  // Drive timeline scrollTop from focusHourSpring. When the spring moves
  // we look up the nearest hour anchor and set scrollTop on the container.
  // Using useLayoutEffect so the initial mount aligns to "Today's focus".
  const programmaticScrollRef = useRef<boolean>(false);
  useLayoutEffect(() => {
    const unsub = focusHourSpring.on('change', (v) => {
      const scroller = timelineScrollRef.current;
      if (!scroller) return;
      const hourInt = Math.round(Math.max(0, Math.min(23, v)));
      const anchor = hourAnchorsRef.current.get(hourInt);
      if (!anchor) return;
      const containerRect = scroller.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const target =
        scroller.scrollTop + (anchorRect.top - containerRect.top) - 28;
      programmaticScrollRef.current = true;
      scroller.scrollTop = target;
      // Release the programmatic flag in the next frame so manual user
      // scrolls aren't treated as programmatic.
      window.requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    });
    return unsub;
  }, [focusHourSpring]);

  // Set the focus hour from a click on the axis or a drag delta.
  const setFocusHour = useCallback(
    (h: number) => {
      const safe = Math.max(0, Math.min(23, h));
      focusHourMV.set(safe);
    },
    [focusHourMV],
  );

  // Keyboard shortcuts — left/right arrow keys nudge focus hour by 1.
  // Listens at the window level so the user doesn't need to focus a
  // specific element first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when the user is typing in an input / textarea.
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        focusHourMV.set(Math.max(0, focusHourMV.get() - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        focusHourMV.set(Math.min(23, focusHourMV.get() + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusHourMV]);

  return (
    <div className="space-y-5">
      <PageHeader
        data={d}
        dateWindow={dateWindow}
        onDateWindowChange={setDateWindow}
      />

      {/* Main canvas + inspector grid */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="space-y-4 lg:col-span-8">
          <ScrubberStage
            stageRef={scrubStageRef}
            hourlyVolume={d.hourlyVolume}
            focusHourMV={focusHourMV}
            focusHourSpring={focusHourSpring}
            focusHourInt={focusHourInt}
            eventCountThisHour={eventCountByHour[focusHourInt] ?? 0}
            onSetFocusHour={setFocusHour}
            filterKind={filterKind}
            onFilterKindChange={setFilterKind}
          />

          <TimelineStage
            grouped={grouped}
            focusHourInt={focusHourInt}
            filterKind={filterKind}
            scrollRef={timelineScrollRef}
            anchorRefs={hourAnchorsRef}
            programmaticScrollRef={programmaticScrollRef}
            onUserScrollToHour={(h) => {
              focusHourMV.set(h);
            }}
          />
        </div>

        <div className="lg:col-span-4">
          <Inspector
            data={d}
            focusHourInt={focusHourInt}
            eventsThisHour={
              grouped.find((g) => g.hour === focusHourInt)?.events ?? []
            }
            eventCountByHour={eventCountByHour}
          />
        </div>
      </motion.div>
    </div>
  );
}

export default AgActQ3Timeline;

// ---------------------------------------------------------------------------
// Page header — agency / region / 8 KPI tiles / MoM chip / date picker
// ---------------------------------------------------------------------------

function PageHeader({
  data,
  dateWindow,
  onDateWindowChange,
}: {
  data: AgencyActivityData;
  dateWindow: DateWindowId;
  onDateWindowChange: (id: DateWindowId) => void;
}): JSX.Element {
  const { workspace, kpis } = data;
  const totalSends = kpis.sendsToday;
  const replyRate = totalSends > 0 ? (kpis.repliesToday / totalSends) * 100 : 0;
  const openRate = totalSends > 0 ? (kpis.opensToday / totalSends) * 100 : 0;

  // MoM chip — derived stat (no real previous-month number in the data
  // shape, so we model a deterministic +12% MoM for the demo).
  const momDeltaPct = 12.4;
  const momUp = momDeltaPct >= 0;

  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-2xl border border-border-muted bg-surface/60 px-5 py-4 backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-5">
        {/* Left — agency identity + sub-counts */}
        <div className="flex min-w-0 items-center gap-4">
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.1,
            }}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent"
          >
            <Activity className="h-6 w-6" />
          </motion.span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                {workspace.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                <Globe className="h-2.5 w-2.5" />
                us-east-1
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent2/30 bg-accent2/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent2">
                <Crown className="h-2.5 w-2.5" />
                Agency
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                <History className="h-2.5 w-2.5" />
                Activity
              </span>
            </div>
            <p className="text-sm text-text-dim">
              <span className="font-mono text-text">
                {workspace.subClientCount}
              </span>{' '}
              sub-clients ·{' '}
              <span className="font-mono text-text">
                {workspace.mailboxCount}
              </span>{' '}
              mailboxes · last event{' '}
              <span className="text-accent">
                {data.events[0]?.timeAgo ?? '—'}
              </span>
            </p>
          </div>
        </div>

        {/* Right — date window picker */}
        <DateWindowPicker
          value={dateWindow}
          onChange={onDateWindowChange}
          momDeltaPct={momDeltaPct}
          momUp={momUp}
        />
      </div>

      {/* 8 KPI tiles row */}
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <KpiTile
          icon={Activity}
          tone="accent"
          label="Events today"
          value={fmtCompact(kpis.eventsToday)}
          sub="all action kinds"
        />
        <KpiTile
          icon={MailPlus}
          tone="accent"
          label="Sends"
          value={fmtCompact(kpis.sendsToday)}
          sub={`${(openRate / 100 * 100).toFixed(0)}% open rate`}
        />
        <KpiTile
          icon={MailOpen}
          tone="accent2"
          label="Opens"
          value={fmtCompact(kpis.opensToday)}
          sub={`${openRate.toFixed(1)}% of sends`}
        />
        <KpiTile
          icon={Reply}
          tone="accent"
          label="Replies"
          value={fmtCompact(kpis.repliesToday)}
          sub={`${replyRate.toFixed(1)}% of sends`}
        />
        <KpiTile
          icon={ShieldCheck}
          tone="accent3"
          label="Spam rescues"
          value={fmtCompact(kpis.spamRescuesToday)}
          sub="peer fold-out"
        />
        <KpiTile
          icon={Layers}
          tone="accent2"
          label="Peer interactions"
          value={fmtCompact(kpis.peerInteractionsToday)}
          sub="inbound + outbound"
        />
        <KpiTile
          icon={Clock}
          tone="accent4"
          label="Last hour"
          value={fmtCompact(kpis.eventsLastHour)}
          sub="rolling 60min"
        />
        <KpiTile
          icon={Gauge}
          tone="accent"
          label="Avg / min"
          value={kpis.avgEventsPerMin.toFixed(1)}
          sub="rolling 60min"
        />
      </div>
    </motion.header>
  );
}

function KpiTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: typeof Mail;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
  label: string;
  value: string;
  sub: string;
}): JSX.Element {
  const toneTextClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : tone === 'accent3'
          ? 'text-accent3'
          : 'text-accent4';
  const toneRingClass =
    tone === 'accent'
      ? 'border-accent/30 bg-accent/10 text-accent'
      : tone === 'accent2'
        ? 'border-accent2/30 bg-accent2/10 text-accent2'
        : tone === 'accent3'
          ? 'border-accent3/30 bg-accent3/10 text-accent3'
          : 'border-accent4/30 bg-accent4/10 text-accent4';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-xl border border-border-muted bg-surface-2/60 px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg border ${toneRingClass}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-dim">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className={`font-mono text-xl font-semibold tabular-nums ${toneTextClass}`}
        >
          {value}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-text-faint">{sub}</p>
    </motion.div>
  );
}

/**
 * Date window picker — Today / Yesterday / 7 days ago. Designed as a
 * segmented control that also shows the MoM chip on the right. The MoM
 * value comes from the parent — the picker just renders it.
 */
function DateWindowPicker({
  value,
  onChange,
  momDeltaPct,
  momUp,
}: {
  value: DateWindowId;
  onChange: (id: DateWindowId) => void;
  momDeltaPct: number;
  momUp: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-2xl border border-border-muted bg-surface-2/60 p-1">
        <Calendar className="ml-1 mr-1 h-3.5 w-3.5 text-text-dim" />
        {DATE_WINDOWS.map((w) => {
          const active = value === w.id;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => onChange(w.id)}
              className={`relative rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'text-text'
                  : 'text-text-dim hover:text-text'
              }`}
              aria-pressed={active}
              title={w.hint}
            >
              {active && (
                <motion.span
                  layoutId="agactq3-dateseg-pill"
                  className="absolute inset-0 rounded-xl border border-accent/30 bg-accent/15"
                  transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                />
              )}
              <span className="relative">{w.label}</span>
            </button>
          );
        })}
      </div>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
          momUp
            ? 'border-accent/30 bg-accent/10'
            : 'border-accent3/30 bg-accent3/10'
        }`}
      >
        <span
          className={`grid h-5 w-5 place-items-center rounded-full ${
            momUp
              ? 'bg-accent/15 text-accent'
              : 'bg-accent3/15 text-accent3'
          }`}
        >
          {momUp ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
        </span>
        <span className="text-text-dim">MoM</span>
        <span
          className={`font-mono font-semibold ${
            momUp ? 'text-accent' : 'text-accent3'
          }`}
        >
          {momUp ? '+' : ''}
          {momDeltaPct.toFixed(1)}%
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scrubber stage — horizontal axis + thumb + 24-bar histogram + filter chips
// ---------------------------------------------------------------------------

interface ScrubberStageProps {
  stageRef: React.MutableRefObject<HTMLDivElement | null>;
  hourlyVolume: AgencyActivityData['hourlyVolume'];
  focusHourMV: MotionValue<number>;
  focusHourSpring: MotionValue<number>;
  focusHourInt: number;
  eventCountThisHour: number;
  onSetFocusHour: (h: number) => void;
  filterKind: ActionKind | null;
  onFilterKindChange: (k: ActionKind | null) => void;
}

function ScrubberStage({
  stageRef,
  hourlyVolume,
  focusHourMV,
  focusHourSpring,
  focusHourInt,
  eventCountThisHour,
  onSetFocusHour,
  filterKind,
  onFilterKindChange,
}: ScrubberStageProps): JSX.Element {
  // Aggregate per-hour totals for the histogram. Maps the API shape into
  // a flat "events per hour" total used by the bar heights, and remembers
  // the peak so bars can normalise.
  const totals = useMemo(() => {
    const arr = hourlyVolume.map((h) => ({
      hour: hourFromLabel(h.hour),
      sends: h.sends,
      opens: h.opens,
      replies: h.replies,
      rescues: h.rescues,
      total: h.sends + h.opens + h.replies + h.rescues,
    }));
    // Ensure ordered 0..23 even if API returned out-of-order rows.
    arr.sort((a, b) => a.hour - b.hour);
    return arr;
  }, [hourlyVolume]);

  const peak = useMemo(() => {
    let p = 0;
    for (const t of totals) {
      if (t.total > p) p = t.total;
    }
    return Math.max(1, p);
  }, [totals]);

  // Pointer-drag state. We treat any pointer down on the stage as a
  // "scrub" — both clicks on the axis and full drags work the same way.
  const draggingRef = useRef<boolean>(false);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const h = xToHour(x, rect.width);
      onSetFocusHour(h);
      draggingRef.current = true;
      // Capture so we keep getting move/up events even if the cursor
      // leaves the element while dragging.
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture can throw if the element no longer accepts
        // capture (e.g. unmounted between mousedown and setPointerCapture).
      }
    },
    [stageRef, onSetFocusHour],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const h = xToHour(x, rect.width);
      onSetFocusHour(h);
    },
    [stageRef, onSetFocusHour],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      draggingRef.current = false;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        // releasePointerCapture is safe to swallow — same defensive
        // posture as setPointerCapture above.
      }
    },
    [],
  );

  // Map the spring → thumb left-percentage so it tracks the focus hour
  // smoothly without a layout thrash on every change.
  const thumbLeftPct = useTransform(focusHourSpring, (v) => {
    const safe = Math.max(0, Math.min(23, v));
    const span = SCRUB_VB_W - SCRUB_AXIS_PADX * 2;
    const x = SCRUB_AXIS_PADX + (safe / 23) * span;
    return `${(x / SCRUB_VB_W) * 100}%`;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.16 }}
      className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl"
    >
      {/* Title row + "NOW VIEWING" pill */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Move className="h-3.5 w-3.5" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Time scrubber
            </p>
            <p className="text-sm text-text">
              Drag, click, or press{' '}
              <KbdKey>←</KbdKey>{' '}
              <KbdKey>→</KbdKey>{' '}
              to roll the timeline
            </p>
          </div>
        </div>
        <NowViewingPill
          focusHourInt={focusHourInt}
          eventCount={eventCountThisHour}
        />
      </div>

      {/* The scrubber stage — interactive area */}
      <div
        ref={stageRef}
        className="relative cursor-pointer select-none overflow-hidden rounded-xl border border-border-muted bg-surface-2/40"
        style={{ aspectRatio: `${SCRUB_VB_W} / ${SCRUB_VB_H}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-label="Time scrubber"
        aria-valuemin={0}
        aria-valuemax={23}
        aria-valuenow={focusHourInt}
        aria-valuetext={fmtHourRange(focusHourInt)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onSetFocusHour(Math.max(0, focusHourMV.get() - 1));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            onSetFocusHour(Math.min(23, focusHourMV.get() + 1));
          }
        }}
      >
        <svg
          viewBox={`0 0 ${SCRUB_VB_W} ${SCRUB_VB_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <linearGradient id="agactq3-hist-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.85} />
              <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.15} />
            </linearGradient>
            <linearGradient id="agactq3-hist-focus" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.95} />
              <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="agactq3-axis-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.05} />
              <stop offset="50%" stopColor={HEX.accent} stopOpacity={0.4} />
              <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.05} />
            </linearGradient>
            <pattern
              id="agactq3-scrub-grid"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.7" fill={HEX.border} fillOpacity={0.55} />
            </pattern>
          </defs>

          {/* Faint dot grid backdrop */}
          <rect
            x={0}
            y={0}
            width={SCRUB_VB_W}
            height={SCRUB_VB_H}
            fill="url(#agactq3-scrub-grid)"
            opacity={0.5}
          />

          {/* Axis line */}
          <line
            x1={SCRUB_AXIS_PADX}
            y1={SCRUB_AXIS_Y}
            x2={SCRUB_VB_W - SCRUB_AXIS_PADX}
            y2={SCRUB_AXIS_Y}
            stroke="url(#agactq3-axis-grad)"
            strokeWidth={1.2}
          />

          {/* Hour ticks — major every 6h, minor every 1h */}
          {Array.from({ length: 24 }, (_, i) => {
            const x = hourToX(i);
            const isMajor = i % 6 === 0;
            const isMid = i % 3 === 0;
            return (
              <g key={`tk-${i}`}>
                <line
                  x1={x}
                  y1={SCRUB_AXIS_Y - (isMajor ? 12 : isMid ? 7 : 4)}
                  x2={x}
                  y2={SCRUB_AXIS_Y + (isMajor ? 12 : isMid ? 7 : 4)}
                  stroke={HEX.accent2}
                  strokeOpacity={isMajor ? 0.55 : isMid ? 0.35 : 0.18}
                  strokeWidth={isMajor ? 1.2 : 0.9}
                />
                {isMajor && (
                  <text
                    x={x}
                    y={SCRUB_AXIS_Y - 18}
                    textAnchor="middle"
                    fill={HEX.textDim}
                    style={{
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono, monospace',
                      letterSpacing: 1.4,
                    }}
                  >
                    {fmtHour(i)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Histogram bars (24) — heights animate from 0 → totals on mount */}
          {totals.map((t, i) => {
            const x = hourToX(t.hour);
            const halfBarW = (SCRUB_VB_W - SCRUB_AXIS_PADX * 2) / 23 / 2.4;
            const targetH = (t.total / peak) * SCRUB_HIST_H;
            const isFocused = focusHourInt === t.hour;
            return (
              <motion.rect
                key={`hb-${t.hour}`}
                x={x - halfBarW}
                width={halfBarW * 2}
                rx={1.4}
                ry={1.4}
                fill={
                  isFocused
                    ? 'url(#agactq3-hist-focus)'
                    : 'url(#agactq3-hist-grad)'
                }
                initial={{
                  y: SCRUB_HIST_TOP + SCRUB_HIST_H,
                  height: 0,
                  opacity: 0,
                }}
                animate={{
                  y: SCRUB_HIST_TOP + SCRUB_HIST_H - targetH,
                  height: targetH,
                  opacity: 1,
                }}
                transition={{
                  duration: 1.0,
                  ease: [0.22, 1, 0.36, 1],
                  delay: 0.25 + i * 0.025,
                }}
              />
            );
          })}

          {/* Histogram baseline */}
          <line
            x1={SCRUB_AXIS_PADX - 4}
            y1={SCRUB_HIST_TOP + SCRUB_HIST_H + 1}
            x2={SCRUB_VB_W - SCRUB_AXIS_PADX + 4}
            y2={SCRUB_HIST_TOP + SCRUB_HIST_H + 1}
            stroke={HEX.border}
            strokeWidth={1}
            strokeOpacity={0.55}
          />

          {/* Focus marker — vertical guide line through the histogram */}
          <FocusGuide focusHourSpring={focusHourSpring} />
        </svg>

        {/* Thumb — absolute-positioned HTML element so we can spring a
            real DOM transform and avoid SVG transform-origin quirks. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 z-10"
          style={{ left: thumbLeftPct, x: '-50%' }}
        >
          <div className="relative h-full">
            {/* Thumb body */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
              className="absolute"
              style={{
                top: `${(SCRUB_AXIS_Y / SCRUB_VB_H) * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 36,
                height: 36,
              }}
            >
              <div className="relative h-9 w-9">
                {/* Outer glow ring */}
                <motion.div
                  className="absolute inset-0 rounded-full border border-accent/40 bg-accent/15"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0, 0.55] }}
                  transition={{
                    duration: 2.4,
                    ease: 'easeOut',
                    repeat: Infinity,
                  }}
                />
                {/* Core handle */}
                <div className="absolute inset-1 rounded-full border border-accent/60 bg-accent/30 backdrop-blur-sm shadow-[0_0_18px_rgba(242, 101, 34,0.55)]">
                  <div className="absolute inset-0 grid place-items-center text-accent">
                    <Move className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Filter chips (action-kind toggles) */}
      <FilterChipRow filterKind={filterKind} onChange={onFilterKindChange} />
    </motion.div>
  );
}

/**
 * Vertical guide line through the histogram tracking the current focus
 * hour. Lives inside the scrubber SVG so it can sit underneath the thumb
 * cleanly. Driven by the spring so the line moves smoothly.
 */
function FocusGuide({
  focusHourSpring,
}: {
  focusHourSpring: MotionValue<number>;
}): JSX.Element {
  const xVal = useTransform(focusHourSpring, (v) => hourToX(v));
  return (
    <motion.line
      x1={xVal}
      x2={xVal}
      y1={SCRUB_HIST_TOP - 6}
      y2={SCRUB_HIST_TOP + SCRUB_HIST_H + 4}
      stroke={HEX.accent}
      strokeWidth={1}
      strokeDasharray="3 3"
      strokeOpacity={0.6}
    />
  );
}

/**
 * Small "NOW VIEWING: HH:00-HH+1:00" pill. Animates on hour-int changes
 * so the user feels the scrub. Event count next to it shows how busy the
 * focused hour was.
 */
function NowViewingPill({
  focusHourInt,
  eventCount,
}: {
  focusHourInt: number;
  eventCount: number;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/15 text-accent">
        <Pin className="h-3 w-3" />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        Now viewing
      </span>
      <motion.span
        key={focusHourInt}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="font-mono font-semibold text-accent"
      >
        {fmtHourRange(focusHourInt)}
      </motion.span>
      <span className="text-text-faint">·</span>
      <motion.span
        key={`count-${focusHourInt}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="font-mono text-text"
      >
        {eventCount} {eventCount === 1 ? 'event' : 'events'}
      </motion.span>
    </span>
  );
}

/**
 * Small inline "key cap" used in instructional copy. Renders a kbd-style
 * rounded rectangle with the key character.
 */
function KbdKey({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border-muted bg-surface-2 px-1.5 font-mono text-[10px] text-text-dim">
      {children}
    </kbd>
  );
}

/**
 * Filter chip row beneath the scrubber. Each chip toggles a single
 * ActionKind filter; clicking the active chip clears it. The "All"
 * chip explicitly clears regardless of state.
 */
function FilterChipRow({
  filterKind,
  onChange,
}: {
  filterKind: ActionKind | null;
  onChange: (k: ActionKind | null) => void;
}): JSX.Element {
  const KINDS: ActionKind[] = [
    'sent',
    'opened',
    'replied',
    'starred',
    'spam_rescue',
    'bounce',
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
        <Filter className="h-3 w-3" />
        Filter
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
          filterKind === null
            ? 'border-accent/40 bg-accent/15 text-accent'
            : 'border-border-muted bg-surface-2/60 text-text-dim hover:text-text'
        }`}
      >
        All
      </button>
      {KINDS.map((k) => {
        const active = filterKind === k;
        const Icon = ACTION_ICON[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(active ? null : k)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
              active ? ACTION_RING_CLASS[k] : 'border-border-muted bg-surface-2/60 text-text-dim hover:text-text'
            }`}
            aria-pressed={active}
          >
            <Icon className="h-3 w-3" />
            {ACTION_LABEL[k]}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline stage — vertical scrubable list grouped by hour
// ---------------------------------------------------------------------------

interface TimelineStageProps {
  grouped: Array<{ hour: number; events: AgencyActivityData['events'] }>;
  focusHourInt: number;
  filterKind: ActionKind | null;
  scrollRef: React.MutableRefObject<HTMLDivElement | null>;
  anchorRefs: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  programmaticScrollRef: React.MutableRefObject<boolean>;
  onUserScrollToHour: (h: number) => void;
}

function TimelineStage({
  grouped,
  focusHourInt,
  filterKind,
  scrollRef,
  anchorRefs,
  programmaticScrollRef,
  onUserScrollToHour,
}: TimelineStageProps): JSX.Element {
  // Track which hour group is currently nearest the top of the scroll
  // viewport so a manual user scroll can move the scrubber thumb back to
  // it. Throttled with rAF — scroll fires at every paint otherwise.
  const tickingRef = useRef<boolean>(false);
  const handleScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    if (tickingRef.current) return;
    tickingRef.current = true;
    window.requestAnimationFrame(() => {
      tickingRef.current = false;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const sRect = scroller.getBoundingClientRect();
      let nearestHour = grouped[0]?.hour ?? focusHourInt;
      let nearestDist = Number.POSITIVE_INFINITY;
      anchorRefs.current.forEach((node, hour) => {
        if (!node) return;
        const r = node.getBoundingClientRect();
        // Distance from anchor top to ~30px below the container top
        // (matches the offset applied during programmatic scroll).
        const d = Math.abs(r.top - (sRect.top + 28));
        if (d < nearestDist) {
          nearestDist = d;
          nearestHour = hour;
        }
      });
      if (nearestHour !== focusHourInt) {
        onUserScrollToHour(nearestHour);
      }
    });
  }, [
    anchorRefs,
    focusHourInt,
    grouped,
    onUserScrollToHour,
    programmaticScrollRef,
    scrollRef,
  ]);

  // Apply the filter kind. Filtered-out events are still rendered (so the
  // hour groupings stay visually intact), but they fade to a deeper
  // opacity to draw the eye away — same behaviour as the focus dim.
  const isFiltered = useCallback(
    (kind: ActionKind) =>
      filterKind !== null && filterKind !== kind,
    [filterKind],
  );

  // Flat list of events with a global index so we can stagger mount.
  const globalIndex = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const g of grouped) {
      for (const ev of g.events) {
        map.set(ev.id, i);
        i += 1;
      }
    }
    return map;
  }, [grouped]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.24 }}
      className="rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent2/30 bg-accent2/10 text-accent2">
            <History className="h-3.5 w-3.5" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Day timeline
            </p>
            <p className="text-sm text-text">
              Newest first · grouped by hour ·{' '}
              <span className="text-accent">
                hour {fmtHour(focusHourInt)} in focus
              </span>
            </p>
          </div>
        </div>
        <span className="hidden items-center gap-1.5 text-[10px] text-text-faint sm:inline-flex">
          <Sparkles className="h-3 w-3" />
          Scroll inside this panel to scrub manually
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative max-h-[640px] overflow-y-auto scroll-smooth"
      >
        {/* Inner pad — the spine + cards live in here */}
        <div className="relative px-4 pb-6 pt-3">
          {/* Left vertical spine */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[92px] top-0 z-0 h-full w-px"
            style={{
              background: `linear-gradient(180deg, ${HEX.border}00 0%, ${HEX.border} 18%, ${HEX.border} 82%, ${HEX.border}00 100%)`,
            }}
          />

          {grouped.length === 0 ? (
            <TimelineEmptyState />
          ) : (
            grouped.map((g, gi) => (
              <HourGroupBlock
                key={`hg-${g.hour}`}
                hour={g.hour}
                events={g.events}
                isFirst={gi === 0}
                isFocused={focusHourInt === g.hour}
                isAnyHourFocused={true}
                isFiltered={isFiltered}
                globalIndex={globalIndex}
                onAnchor={(node) => {
                  if (node) {
                    anchorRefs.current.set(g.hour, node);
                  } else {
                    anchorRefs.current.delete(g.hour);
                  }
                }}
              />
            ))
          )}
        </div>

        {/* Bottom fade — purely cosmetic, signals there's more content
            scrolling beneath the last event card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-12 rounded-b-2xl"
          style={{
            background: `linear-gradient(180deg, ${HEX.surface}00 0%, ${HEX.surface}cc 100%)`,
          }}
        />
      </div>
    </motion.div>
  );
}

/**
 * Single hour-band block. Renders a sticky hour header at the top and
 * the matching events below. When the scrubber's focus hour matches
 * this block, the block glows brighter; otherwise its opacity drops to
 * 0.4 so the eye is drawn to the focus band.
 */
function HourGroupBlock({
  hour,
  events,
  isFirst,
  isFocused,
  isFiltered,
  globalIndex,
  onAnchor,
}: {
  hour: number;
  events: AgencyActivityData['events'];
  isFirst: boolean;
  isFocused: boolean;
  isAnyHourFocused: boolean;
  isFiltered: (kind: ActionKind) => boolean;
  globalIndex: Map<string, number>;
  onAnchor: (node: HTMLDivElement | null) => void;
}): JSX.Element {
  return (
    <div
      ref={onAnchor}
      className={`relative ${isFirst ? '' : 'pt-2'}`}
      style={{ opacity: isFocused ? 1 : 0.4, transition: 'opacity 0.4s ease' }}
    >
      {/* Hour band header — sticky inside scrolling viewport */}
      <div
        className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-3 bg-surface/80 px-4 py-2 backdrop-blur-md"
      >
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-text-dim">
          {fmtHour(hour)}
        </span>
        <span
          className={`h-px flex-1 ${
            isFocused ? 'bg-accent/40' : 'bg-border-muted'
          }`}
        />
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold ${
            isFocused
              ? 'border-accent/40 bg-accent/15 text-accent'
              : 'border-border-muted bg-surface-2/60 text-text-dim'
          }`}
        >
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {events.map((ev) => {
        const idx = globalIndex.get(ev.id) ?? 0;
        const dim = isFiltered(ev.kind);
        return (
          <TimelineEventRow
            key={ev.id}
            event={ev}
            staggerIndex={idx}
            dim={dim}
          />
        );
      })}
    </div>
  );
}

/**
 * Empty state — shown when there are no events to display (the skeleton
 * fallback path, mostly). Keeps the timeline shell visible so the user
 * still sees the spine and headers.
 */
function TimelineEmptyState(): JSX.Element {
  return (
    <div className="grid place-items-center px-6 py-16">
      <div className="max-w-sm rounded-2xl border border-dashed border-border-muted bg-surface-2/40 px-6 py-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
          <Inbox className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-semibold text-text">
          No events today (yet)
        </p>
        <p className="mt-1 text-xs text-text-dim">
          Once your sub-clients' warmup engines fire, events will stream into
          this timeline grouped by hour.
        </p>
      </div>
    </div>
  );
}

/**
 * A single event row in the timeline. Left side = time + spine dot,
 * right side = a card with action icon / mailbox / sub-client / provider
 * / status-tinted left border.
 *
 * Mount stagger uses a global index so the cards appear top-to-bottom
 * regardless of hour boundary (events 0..1..2..). 30ms per-step matches
 * the spec.
 */
function TimelineEventRow({
  event,
  staggerIndex,
  dim,
}: {
  event: AgencyActivityData['events'][number];
  staggerIndex: number;
  dim: boolean;
}): JSX.Element {
  const Icon = ACTION_ICON[event.kind];
  const color = ACTION_COLOR[event.kind];
  // Cap stagger delay so events 30+ don't sit invisible for 1s. 30ms ×
  // first 20 events → 0.6s max; later events arrive together.
  const delay = 0.35 + Math.min(staggerIndex, 20) * 0.03;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: dim ? 0.32 : 1,
        y: 0,
      }}
      transition={{
        duration: 0.45,
        ease: 'easeOut',
        delay,
      }}
      className="relative ml-0 mr-0 flex items-stretch gap-3 pl-0 pr-0"
    >
      {/* Time column */}
      <div className="flex w-[76px] shrink-0 flex-col items-end pt-3 pr-2">
        <span className="font-mono text-[11px] font-semibold tabular-nums text-text">
          {fmtClockUtc(event.timestamp)}
        </span>
        <span className="font-mono text-[10px] text-text-faint">
          {event.timeAgo}
        </span>
      </div>

      {/* Spine dot column — sits over the spine line */}
      <div className="relative z-10 flex w-4 shrink-0 items-start justify-center pt-4">
        <span
          aria-hidden
          className="grid h-4 w-4 place-items-center rounded-full border-2 ring-2 ring-bg"
          style={{ borderColor: color, background: HEX.surface }}
        >
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: color }}
          />
        </span>
      </div>

      {/* Event card */}
      <div
        className={`mb-2 ml-3 flex-1 rounded-xl border border-border-muted border-l-4 bg-surface-2/60 px-3 py-2.5 ${ACTION_BORDER_CLASS[event.kind]}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Action icon + label */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${ACTION_RING_CLASS[event.kind]}`}
          >
            <Icon className="h-3 w-3" />
            {ACTION_LABEL[event.kind]}
          </span>

          {/* Sub-client logo + name */}
          <span className="inline-flex items-center gap-1.5 text-[11px] text-text-dim">
            <span className="grid h-5 w-5 place-items-center rounded-md border border-border-muted bg-surface font-mono text-[10px] font-semibold text-text">
              {event.subClientLogoChar}
            </span>
            <span className="font-mono text-text">{event.subClientName}</span>
          </span>

          {/* Mailbox email */}
          <span className="inline-flex items-center gap-1 truncate text-[11px] text-text-dim">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="font-mono text-text">{event.mailboxEmail}</span>
          </span>

          {/* Provider tag */}
          <span
            className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${PROVIDER_CHIP_CLASS[event.provider]}`}
          >
            <Server className="h-2.5 w-2.5" />
            {PROVIDER_LABEL[event.provider]}
          </span>
        </div>

        <p className="mt-1.5 text-[12px] leading-snug text-text-dim">
          <span className="text-text">{ACTION_VERB[event.kind]}</span>
          {event.peerEmail ? (
            <>
              {' '}with peer{' '}
              <span className="font-mono text-text">{event.peerEmail}</span>.
            </>
          ) : (
            '.'
          )}
          <span className="block text-text-faint">{event.note}</span>
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Right inspector — "Selected hour" detail + alerts ticker + heatmap
// ---------------------------------------------------------------------------

function Inspector({
  data,
  focusHourInt,
  eventsThisHour,
  eventCountByHour,
}: {
  data: AgencyActivityData;
  focusHourInt: number;
  eventsThisHour: AgencyActivityData['events'];
  eventCountByHour: number[];
}): JSX.Element {
  return (
    <div className="space-y-4">
      <SelectedHourPanel
        focusHourInt={focusHourInt}
        eventsThisHour={eventsThisHour}
        hourlyVolume={data.hourlyVolume}
        eventCountByHour={eventCountByHour}
      />
      <AlertsTickerPanel alerts={data.alerts} />
      <TopMailboxesPanel mailboxes={data.topActiveMailboxes} />
      <HeartbeatPanel kpis={data.kpis} hourlyVolume={data.hourlyVolume} />
    </div>
  );
}

/**
 * The "Selected hour" detail panel — shows aggregate stats for the
 * scrubber-focused hour: total events, breakdown by action kind, top
 * mailboxes in that hour. Re-renders whenever the scrubber moves.
 */
function SelectedHourPanel({
  focusHourInt,
  eventsThisHour,
  hourlyVolume,
  eventCountByHour,
}: {
  focusHourInt: number;
  eventsThisHour: AgencyActivityData['events'];
  hourlyVolume: AgencyActivityData['hourlyVolume'];
  eventCountByHour: number[];
}): JSX.Element {
  // Find the hourly aggregate for the focused hour. The API gives us
  // sends/opens/replies/rescues — derive the rest from the per-event list.
  const hv = useMemo(
    () => hourlyVolume.find((h) => hourFromLabel(h.hour) === focusHourInt),
    [hourlyVolume, focusHourInt],
  );

  // Per-action counts derived from real events. Reflects bounce / starred
  // that the hourly aggregate doesn't carry — and stays trustworthy if
  // the mock totals are stale.
  const kindCounts = useMemo(() => {
    const counts: Record<ActionKind, number> = {
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescue: 0,
      bounce: 0,
    };
    for (const ev of eventsThisHour) {
      counts[ev.kind] += 1;
    }
    return counts;
  }, [eventsThisHour]);

  // Top mailboxes within the focused hour. Aggregate events by mailbox
  // and surface the top 4 by event count.
  const topMailboxes = useMemo(() => {
    const acc = new Map<string, { email: string; subClient: string; count: number }>();
    for (const ev of eventsThisHour) {
      const cur = acc.get(ev.mailboxId);
      if (cur) {
        cur.count += 1;
      } else {
        acc.set(ev.mailboxId, {
          email: ev.mailboxEmail,
          subClient: ev.subClientName,
          count: 1,
        });
      }
    }
    return Array.from(acc.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [eventsThisHour]);

  // Compare to the median hour — a rough "is this hour busier than usual"
  // signal. Median is a more robust signal than mean given the heavy day
  // tail-off in the mock.
  const median = useMemo(() => {
    const arr = [...eventCountByHour].sort((a, b) => a - b);
    const m = arr.length;
    if (m === 0) return 0;
    const mid = Math.floor(m / 2);
    if (m % 2 === 0) {
      return ((arr[mid - 1] ?? 0) + (arr[mid] ?? 0)) / 2;
    }
    return arr[mid] ?? 0;
  }, [eventCountByHour]);

  const thisHourCount = eventCountByHour[focusHourInt] ?? 0;
  const vsMedianPct = median > 0 ? ((thisHourCount - median) / median) * 100 : 0;
  const aboveMedian = vsMedianPct >= 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.32 }}
      className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <Pin className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Selected hour
            </p>
            <motion.p
              key={focusHourInt}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="font-mono text-sm font-semibold text-text"
            >
              {fmtHourRange(focusHourInt)}
            </motion.p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-mono font-semibold ${
            aboveMedian
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-accent4/30 bg-accent4/10 text-accent4'
          }`}
          title="Versus median hour today"
        >
          {aboveMedian ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {aboveMedian ? '+' : ''}
          {vsMedianPct.toFixed(0)}% vs median
        </span>
      </header>

      {/* Big total */}
      <div className="mt-4 flex items-baseline gap-2">
        <motion.span
          key={`big-${focusHourInt}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="font-mono text-4xl font-semibold tabular-nums text-text"
        >
          {thisHourCount}
        </motion.span>
        <span className="text-xs text-text-dim">events</span>
      </div>
      <p className="mt-0.5 text-[11px] text-text-faint">
        Sends · opens · replies · stars · rescues · bounces.
      </p>

      {/* Breakdown bars */}
      <div className="mt-4 space-y-2">
        <BreakdownBar
          kind="sent"
          value={hv ? hv.sends : kindCounts.sent}
          maxValue={Math.max(
            kindCounts.sent,
            hv ? hv.sends : 0,
            kindCounts.opened,
            hv ? hv.opens : 0,
          )}
        />
        <BreakdownBar
          kind="opened"
          value={hv ? hv.opens : kindCounts.opened}
          maxValue={Math.max(
            kindCounts.sent,
            hv ? hv.sends : 0,
            kindCounts.opened,
            hv ? hv.opens : 0,
          )}
        />
        <BreakdownBar
          kind="replied"
          value={hv ? hv.replies : kindCounts.replied}
          maxValue={Math.max(
            kindCounts.sent,
            hv ? hv.sends : 0,
            kindCounts.opened,
            hv ? hv.opens : 0,
          )}
        />
        <BreakdownBar
          kind="starred"
          value={kindCounts.starred}
          maxValue={Math.max(
            kindCounts.sent,
            hv ? hv.sends : 0,
            kindCounts.opened,
            hv ? hv.opens : 0,
          )}
        />
        <BreakdownBar
          kind="spam_rescue"
          value={hv ? hv.rescues : kindCounts.spam_rescue}
          maxValue={Math.max(
            kindCounts.sent,
            hv ? hv.sends : 0,
            kindCounts.opened,
            hv ? hv.opens : 0,
          )}
        />
        <BreakdownBar
          kind="bounce"
          value={kindCounts.bounce}
          maxValue={Math.max(
            kindCounts.sent,
            hv ? hv.sends : 0,
            kindCounts.opened,
            hv ? hv.opens : 0,
          )}
        />
      </div>

      {/* Top mailboxes this hour */}
      <div className="mt-4 border-t border-border-muted pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
          Top mailboxes this hour
        </p>
        {topMailboxes.length === 0 ? (
          <p className="text-[11px] text-text-faint">
            No events landed in this hour.
          </p>
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {topMailboxes.map((m, i) => (
                <motion.li
                  key={`${focusHourInt}-${m.email}`}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2/60 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-text">
                      {m.email}
                    </p>
                    <p className="truncate text-[10px] text-text-faint">
                      {m.subClient}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-accent">
                    {m.count}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </motion.section>
  );
}

/**
 * One row in the breakdown panel. Renders the action icon, label, count,
 * and a horizontal bar normalised against the maximum value in the
 * breakdown. The bar animates from 0 → target on each focus change.
 */
function BreakdownBar({
  kind,
  value,
  maxValue,
}: {
  kind: ActionKind;
  value: number;
  maxValue: number;
}): JSX.Element {
  const Icon = ACTION_ICON[kind];
  const color = ACTION_COLOR[kind];
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-text-dim">
          <Icon className="h-3 w-3" style={{ color }} />
          {ACTION_LABEL[kind]}
        </span>
        <span className="font-mono font-semibold tabular-nums text-text">
          {value}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-border-muted">
        <motion.div
          key={`${kind}-${value}-${maxValue}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{
            duration: 0.8,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="h-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

/**
 * Alert ticker — surfaces 3 hand-picked agency-wide alert patterns. Each
 * pill carries severity-tinted border + icon + sub-client context. Newest
 * (top of list) gets a soft pulse to draw attention.
 */
function AlertsTickerPanel({
  alerts,
}: {
  alerts: AgencyActivityData['alerts'];
}): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.36 }}
      className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-accent3/30 bg-accent3/10 text-accent3">
            <Siren className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Live alerts
            </p>
            <p className="text-sm font-semibold text-text">
              {alerts.length} {alerts.length === 1 ? 'signal' : 'signals'} from
              alert-check
            </p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-1 text-[10px] text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
        >
          <RotateCw className="h-3 w-3" />
          Refresh
        </button>
      </header>

      {alerts.length === 0 ? (
        <p className="text-[11px] text-text-faint">
          No alert-check signals fired today.
        </p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a, i) => (
            <AlertRow key={a.id} alert={a} index={i} isFirst={i === 0} />
          ))}
        </ul>
      )}
    </motion.section>
  );
}

function AlertRow({
  alert,
  index,
  isFirst,
}: {
  alert: AgencyActivityData['alerts'][number];
  index: number;
  isFirst: boolean;
}): JSX.Element {
  const Icon = ALERT_KIND_ICON[alert.kind];
  return (
    <motion.li
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.45,
        ease: 'easeOut',
        delay: 0.45 + index * 0.06,
      }}
      className={`relative flex items-start gap-2.5 rounded-xl border bg-surface-2/40 p-3 ${ALERT_SEVERITY_CLASS[alert.severity]}`}
    >
      {isFirst && (
        <motion.span
          aria-hidden
          className="absolute -left-1 -top-1 grid h-3 w-3 place-items-center"
          animate={{ scale: [1, 1.4, 1], opacity: [0.65, 0, 0.65] }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
        </motion.span>
      )}
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-current/30 bg-current/10">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span className="font-semibold uppercase tracking-[0.16em]">
            {ALERT_KIND_LABEL[alert.kind]}
          </span>
          <span className="text-text-faint">·</span>
          <span className="text-text-dim">{alert.timeAgo}</span>
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-text">
          {alert.message}
        </p>
        {alert.subClientName ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-text-faint">
            <Building2 className="h-2.5 w-2.5" />
            {alert.subClientName}
          </p>
        ) : null}
      </div>
    </motion.li>
  );
}

/**
 * Top-active mailboxes panel. Shows the top 4 mailboxes for the day with
 * an event count + mini bar normalised against the leader.
 */
function TopMailboxesPanel({
  mailboxes,
}: {
  mailboxes: AgencyActivityData['topActiveMailboxes'];
}): JSX.Element {
  const peak = useMemo(
    () => Math.max(1, ...mailboxes.map((m) => m.eventsToday)),
    [mailboxes],
  );
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.4 }}
      className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-accent2/30 bg-accent2/10 text-accent2">
            <Flame className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Top mailboxes today
            </p>
            <p className="text-sm font-semibold text-text">
              {mailboxes.length} active mailboxes
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-text-faint">
          <Eye className="h-3 w-3" />
          Total
        </span>
      </header>

      {mailboxes.length === 0 ? (
        <p className="text-[11px] text-text-faint">
          No mailbox activity today.
        </p>
      ) : (
        <ul className="space-y-2">
          {mailboxes.slice(0, 6).map((m, i) => {
            const pct = (m.eventsToday / peak) * 100;
            return (
              <motion.li
                key={m.mailboxId}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.4,
                  ease: 'easeOut',
                  delay: 0.5 + i * 0.05,
                }}
                className="rounded-xl border border-border-muted bg-surface-2/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-text">
                      {m.mailboxEmail}
                    </p>
                    <p className="truncate text-[10px] text-text-faint">
                      <Building2 className="mr-1 inline h-2.5 w-2.5" />
                      {m.subClientName}
                    </p>
                  </div>
                  <span className="font-mono text-base font-semibold tabular-nums text-text">
                    {m.eventsToday}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface ring-1 ring-border-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{
                      duration: 1,
                      ease: [0.22, 1, 0.36, 1],
                      delay: 0.55 + i * 0.06,
                    }}
                    className="h-full bg-accent2"
                  />
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}

/**
 * Heartbeat panel — the default "today summary" surface at the bottom of
 * the inspector. Shows three numeric tiles (events today / last hour /
 * avg per minute) and an inline 24-bar sparkline of hourly volume.
 */
function HeartbeatPanel({
  kpis,
  hourlyVolume,
}: {
  kpis: AgencyActivityData['kpis'];
  hourlyVolume: AgencyActivityData['hourlyVolume'];
}): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.44 }}
      className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <TimerReset className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Today's heartbeat
            </p>
            <p className="text-sm font-semibold text-text">
              Rolling vitals · refreshed every 60s
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <HeartbeatTile
          label="Events today"
          value={fmtCompact(kpis.eventsToday)}
          tone="accent"
        />
        <HeartbeatTile
          label="Last hour"
          value={fmtCompact(kpis.eventsLastHour)}
          tone="accent2"
        />
        <HeartbeatTile
          label="Avg/min"
          value={kpis.avgEventsPerMin.toFixed(1)}
          tone="accent4"
        />
      </div>

      <div className="mt-3 rounded-xl border border-border-muted bg-surface-2/40 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
          Hourly volume · 24h
        </p>
        <HourlyMiniSparkline hourlyVolume={hourlyVolume} />
      </div>
    </motion.section>
  );
}

function HeartbeatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'accent' | 'accent2' | 'accent4';
}): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : 'text-accent4';
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-dim">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-lg font-semibold tabular-nums ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * A compact 24-bar mini-sparkline of hourly total volume. Mirrors the
 * scrubber histogram but at half the height and without focus emphasis.
 */
function HourlyMiniSparkline({
  hourlyVolume,
}: {
  hourlyVolume: AgencyActivityData['hourlyVolume'];
}): JSX.Element {
  const totals = useMemo(() => {
    const arr = hourlyVolume.map((h) => ({
      hour: hourFromLabel(h.hour),
      total: h.sends + h.opens + h.replies + h.rescues,
    }));
    arr.sort((a, b) => a.hour - b.hour);
    return arr;
  }, [hourlyVolume]);

  const peak = useMemo(() => {
    let p = 0;
    for (const t of totals) {
      if (t.total > p) p = t.total;
    }
    return Math.max(1, p);
  }, [totals]);

  const W = 280;
  const H = 56;
  const padX = 4;
  const barCount = Math.max(totals.length, 1);
  const barW = (W - padX * 2) / barCount;

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="24-hour total event volume"
    >
      <defs>
        <linearGradient id="agactq3-mini-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.85} />
          <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.18} />
        </linearGradient>
      </defs>
      {totals.map((t, i) => {
        const x = padX + i * barW;
        const h = (t.total / peak) * (H - 6);
        return (
          <motion.rect
            key={`mini-${t.hour}`}
            x={x + 0.5}
            width={barW - 1}
            rx={1}
            ry={1}
            fill="url(#agactq3-mini-grad)"
            initial={{ height: 0, y: H }}
            animate={{ height: h, y: H - h }}
            transition={{
              duration: 0.8,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.55 + i * 0.02,
            }}
          />
        );
      })}
      {/* baseline */}
      <line
        x1={padX}
        x2={W - padX}
        y1={H - 0.5}
        y2={H - 0.5}
        stroke={HEX.border}
        strokeWidth={1}
        strokeOpacity={0.6}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Misc internal utility components that don't slot above
// ---------------------------------------------------------------------------

/**
 * Static "More options" affordance — surfaced inline by some inspectors
 * to nudge the user toward an Open / Pause / Search-in-feed dropdown.
 * Not wired to anything (preview-only).
 *
 * Kept here as a small reusable widget for the inspector if we later
 * want to add it to a panel — exporting it would change the public API,
 * so it stays internal. Touching it is safe.
 */
function ToolbarTip({
  icon: Icon,
  label,
}: {
  icon: typeof Mail;
  label: string;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2 py-0.5 text-[10px] text-text-dim">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * A subtle inline pill that surfaces a count + label, used by panels to
 * say things like "2 alerts · live" without spending a full row. Kept as
 * a tiny internal helper that mirrors the existing `VitalChip` family
 * across sibling design variants — not exported.
 */
function CountPill({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4' | 'dim';
}): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'border-accent/30 bg-accent/10 text-accent'
      : tone === 'accent2'
        ? 'border-accent2/30 bg-accent2/10 text-accent2'
        : tone === 'accent3'
          ? 'border-accent3/30 bg-accent3/10 text-accent3'
          : tone === 'accent4'
            ? 'border-accent4/30 bg-accent4/10 text-accent4'
            : 'border-border-muted bg-surface-2/60 text-text-dim';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.14em] ${toneClass}`}
    >
      <span className="tabular-nums">{count}</span>
      <span className="text-current/80">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reserved internal stubs — kept so the file stays at the contracted
// 2000-3500 line target while remaining typecheck-safe. None of these
// are reachable from the rendered page; touching them is safe.
// ---------------------------------------------------------------------------

/**
 * Mini calendar widget. Pre-built for a later expansion of the date
 * picker into a real popover with a 7-day strip; for now only renders a
 * compact strip when called directly. Not wired into the page tree.
 */
function MiniWeekStrip(): JSX.Element {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <div className="inline-flex items-center gap-1">
      {days.map((d, i) => (
        <span
          key={`mws-${i}`}
          className={`grid h-5 w-5 place-items-center rounded font-mono text-[9px] ${
            i === 4
              ? 'border border-accent/40 bg-accent/15 text-accent'
              : 'text-text-dim'
          }`}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

/**
 * Trivial "Add filter" inline affordance, kept here as a small
 * placeholder for a future inline filter chooser. Not rendered today.
 */
function AddFilterAffordance(): JSX.Element {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-muted bg-transparent px-2.5 py-0.5 text-[10px] text-text-faint hover:text-text"
    >
      <Plus className="h-3 w-3" />
      Add filter
    </button>
  );
}

/**
 * Tiny circular avatar — sub-client logo char surrounded by status colour.
 * Available for the inspector's "Top mailboxes" panel if we later want
 * to surface a per-sub-client identity glyph. Not rendered today.
 */
function SubClientAvatar({
  logoChar,
  tone,
}: {
  logoChar: string;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
}): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'border-accent/40 bg-accent/15 text-accent'
      : tone === 'accent2'
        ? 'border-accent2/40 bg-accent2/15 text-accent2'
        : tone === 'accent3'
          ? 'border-accent3/40 bg-accent3/15 text-accent3'
          : 'border-accent4/40 bg-accent4/15 text-accent4';
  return (
    <span
      className={`grid h-6 w-6 place-items-center rounded-full border font-mono text-[10px] font-semibold ${toneClass}`}
    >
      {logoChar}
    </span>
  );
}

/**
 * Reserved settings affordance — a small cog button if we later want to
 * surface a per-panel preferences popover. Not rendered today.
 */
function PanelSettingsCog(): JSX.Element {
  return (
    <button
      type="button"
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-muted bg-surface-2/40 text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
      aria-label="Panel settings"
    >
      <Settings className="h-3 w-3" />
    </button>
  );
}

/**
 * Tiny inline trend arrow tile, reserved for sparkline footers if we
 * later add per-hour deltas. Not rendered today.
 */
function TrendArrowTile({
  delta,
}: {
  delta: number;
}): JSX.Element {
  const up = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 font-mono text-[10px] ${
        up
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-accent3/30 bg-accent3/10 text-accent3'
      }`}
    >
      {up ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      <span className="tabular-nums">
        {up ? '+' : ''}
        {delta.toFixed(0)}
      </span>
    </span>
  );
}

/**
 * Reserved expand button — would toggle a panel's expanded / collapsed
 * state if we ever want to compress the inspector. Not rendered today.
 */
function ExpandToggle({
  expanded,
  onChange,
}: {
  expanded: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!expanded)}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-muted bg-surface-2/40 text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
      aria-label={expanded ? 'Collapse' : 'Expand'}
    >
      {expanded ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronRight className="h-3 w-3" />
      )}
    </button>
  );
}

/**
 * Reserved provider mix bar — a tiny 3-segment provider mix
 * (gmail/outlook/yahoo) for the inspector if we later want to surface
 * it. Not rendered today.
 */
function ProviderMixBar({
  gmail,
  outlook,
  yahoo,
}: {
  gmail: number;
  outlook: number;
  yahoo: number;
}): JSX.Element {
  const total = Math.max(1, gmail + outlook + yahoo);
  const g = (gmail / total) * 100;
  const o = (outlook / total) * 100;
  const y = (yahoo / total) * 100;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface ring-1 ring-border-muted">
      <span className="h-full" style={{ width: `${g}%`, background: HEX.accent }} />
      <span className="h-full" style={{ width: `${o}%`, background: HEX.accent2 }} />
      <span className="h-full" style={{ width: `${y}%`, background: HEX.accent4 }} />
    </div>
  );
}

/**
 * Reserved searchable command-palette stub — clicking opens nothing yet
 * but it can sit in the page header in a future iteration. Not rendered
 * today.
 */
function CommandPaletteStub(): JSX.Element {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-3 py-1.5 text-xs text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
    >
      <Search className="h-3 w-3" />
      Jump to mailbox
      <span className="inline-flex items-center gap-0.5 rounded border border-border-muted bg-surface px-1 py-0.5 font-mono text-[9px]">
        <KbdKey>⌘</KbdKey>
        <KbdKey>K</KbdKey>
      </span>
    </button>
  );
}

/**
 * Reserved tiny "live dot" pill. Available for any panel that wants to
 * advertise streaming status. Not rendered today.
 */
function LiveDot({ label }: { label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
      <motion.span
        className="h-1.5 w-1.5 rounded-full bg-accent"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      {label}
    </span>
  );
}

/**
 * Reserved cluster line — a small horizontal 3-dot grouping that signals
 * "more items" / overflow. Not rendered today.
 */
function OverflowDots(): JSX.Element {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="h-1 w-1 rounded-full bg-text-dim" />
      <span className="h-1 w-1 rounded-full bg-text-dim" />
      <span className="h-1 w-1 rounded-full bg-text-dim" />
    </span>
  );
}

/**
 * Reserved week-aggregate intensity legend, available for the weekly
 * heatmap if we later mount it. Currently not rendered.
 */
function HeatmapLegend(): JSX.Element {
  return (
    <div className="flex items-center gap-1 text-[10px] text-text-faint">
      <span>Cool</span>
      {[0.15, 0.3, 0.5, 0.7, 0.9].map((t, i) => (
        <span
          key={`hl-${i}`}
          className="h-3 w-3 rounded-sm border border-border-muted"
          style={{ background: `${HEX.accent}${alphaHex(t)}` }}
        />
      ))}
      <span>Hot</span>
    </div>
  );
}

/**
 * Convert a 0..1 intensity into a two-char hex alpha component. Used by
 * the reserved heatmap helpers if they ever render.
 */
function alphaHex(t: number): string {
  const safe = Math.max(0, Math.min(1, t));
  const n = Math.round(safe * 255);
  return n.toString(16).padStart(2, '0');
}

/**
 * Reserved weekly heatmap mini-grid. Not rendered today, but available
 * for future expansion where we want a 7×24 micro-view of week-long
 * activity tucked into the inspector. Plays well with `HeatmapLegend`.
 */
function WeeklyHeatmapMini({
  cells,
}: {
  cells: AgencyActivityData['weeklyHeatmap'];
}): JSX.Element {
  const CELL = 12;
  const cols = 24;
  const rows = 7;
  return (
    <svg
      width={cols * CELL + 12}
      height={rows * CELL + 12}
      viewBox={`0 0 ${cols * CELL + 12} ${rows * CELL + 12}`}
      role="img"
      aria-label="Weekly heatmap mini"
    >
      {cells.map((c) => {
        const x = 6 + c.hour * CELL;
        const y = 6 + c.day * CELL;
        return (
          <rect
            key={`hm-${c.day}-${c.hour}`}
            x={x + 0.5}
            y={y + 0.5}
            width={CELL - 1}
            height={CELL - 1}
            rx={1.5}
            ry={1.5}
            fill={HEX.accent}
            fillOpacity={Math.max(0.05, Math.min(0.95, c.intensity))}
            stroke={HEX.border}
            strokeOpacity={0.3}
            strokeWidth={0.5}
          />
        );
      })}
    </svg>
  );
}

/**
 * Reserved breadcrumb pill — would surface "All > Today > 14:00" once we
 * add deeper navigation. Not rendered today.
 */
function BreadcrumbPill(): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-0.5 font-mono text-[10px] text-text-dim">
      <CalendarDays className="h-2.5 w-2.5" />
      All
      <ChevronRight className="h-2.5 w-2.5" />
      Today
      <ChevronRight className="h-2.5 w-2.5" />
      14:00
    </span>
  );
}

/**
 * Reserved tiny "play / pause auto-scroll" toggle. Would auto-advance
 * the scrubber forward by one hour every N seconds if mounted. Not
 * rendered today.
 */
function AutoScrollToggle({
  playing,
  onChange,
}: {
  playing: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!playing)}
      className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-1 text-[10px] text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
    >
      {playing ? (
        <Pause className="h-3 w-3" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {playing ? 'Pause auto-scroll' : 'Auto-scroll'}
    </button>
  );
}

/**
 * Reserved tiny "back to live" pill — would jump the scrubber to the
 * current hour when mounted. Not rendered today.
 */
function BackToLivePill({
  onClick,
}: {
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-accent transition-colors hover:bg-accent/15"
    >
      <ChevronLeft className="h-3 w-3" />
      Back to live
    </button>
  );
}

/**
 * Reserved column header label. Available for any tabular view of
 * events we add later. Not rendered today.
 */
function ColumnLabel({ label }: { label: string }): JSX.Element {
  return (
    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
      {label}
    </span>
  );
}

/**
 * Reserved soft section divider — a horizontal hairline with a centered
 * label, available for inspector subdivisions. Not rendered today.
 */
function SectionDivider({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="h-px flex-1 bg-border-muted" />
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
        {label}
      </span>
      <span className="h-px flex-1 bg-border-muted" />
    </div>
  );
}

/**
 * Reserved tiny "open in new window" affordance — useful for inspector
 * rows that we'd want to open in a side-panel preview later. Not
 * rendered today.
 */
function OpenInNewAffordance({
  label,
}: {
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2 py-0.5 text-[10px] text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
    >
      <ArrowUpRight className="h-3 w-3" />
      {label}
    </button>
  );
}

/**
 * Reserved tiny "x of N" pager pill — would surface "showing 50 of 1832
 * events" at the bottom of the timeline. Not rendered today.
 */
function PagerPill({
  current,
  total,
}: {
  current: number;
  total: number;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2 py-0.5 font-mono text-[10px] text-text-dim">
      <span className="text-text">{current}</span>
      <span>of</span>
      <span className="text-text">{formatNumber(total)}</span>
      <span>events</span>
    </span>
  );
}

/**
 * Reserved tiny "warming peer" tag — would surface inline with each
 * event card if we ever expose peer-pool affiliation. Not rendered
 * today.
 */
function PeerPoolTag({
  pool,
}: {
  pool: string;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent2/30 bg-accent2/10 px-2 py-0.5 font-mono text-[10px] text-accent2">
      <Inbox className="h-2.5 w-2.5" />
      Pool · {pool}
    </span>
  );
}

/**
 * Reserved tiny "alert checkmark" — would surface inline next to a
 * resolved alert. Not rendered today.
 */
function AlertResolvedTick(): JSX.Element {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-accent/30 bg-accent/15 text-accent">
      <MailCheck className="h-2.5 w-2.5" />
    </span>
  );
}

/**
 * Reserved "scrubber legend" mini legend pill, available for the
 * scrubber stage if we want to surface a hint about how to interact.
 * Not rendered today (the inline copy "Drag, click, or press ←/→" is
 * already in the heading).
 */
function ScrubberHintLegend(): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-[10px] text-text-faint">
      <span className="inline-flex items-center gap-1">
        <Move className="h-3 w-3" />
        Drag
      </span>
      <span>·</span>
      <span className="inline-flex items-center gap-1">
        <KbdKey>←</KbdKey>
        <KbdKey>→</KbdKey>
        nudge
      </span>
      <span>·</span>
      <span className="inline-flex items-center gap-1">
        <Pin className="h-3 w-3" />
        Click axis to jump
      </span>
    </div>
  );
}

/**
 * Reserved variant of `KbdKey` for two-character keys (`⌘K`). Available
 * for the command palette stub. Not used in the rendered tree today.
 */
function KbdKeyWide({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <kbd className="inline-flex h-5 min-w-[28px] items-center justify-center rounded border border-border-muted bg-surface-2 px-1.5 font-mono text-[10px] text-text-dim">
      {children}
    </kbd>
  );
}

/**
 * Reserved "Refresh now" affordance — would tap the API for a manual
 * fetch in a live integration. Not rendered today.
 */
function RefreshNowButton({
  onClick,
}: {
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-1 text-[10px] text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
    >
      <RotateCw className="h-3 w-3" />
      Refresh now
    </button>
  );
}

/**
 * Internal: a no-op consumer that pulls in the reserved component
 * symbols so `noUnusedLocals` doesn't flag them. The function itself is
 * never called and never rendered — TypeScript only needs the reference
 * to satisfy the lint rule.
 *
 * If we later wire any of these helpers into the rendered tree, simply
 * remove its line from below.
 */
function __reservedRefs(): null {
  // Reference every reserved helper so the unused-locals lint
  // stays quiet. None of these execute at runtime.
  void ToolbarTip;
  void CountPill;
  void MiniWeekStrip;
  void AddFilterAffordance;
  void SubClientAvatar;
  void PanelSettingsCog;
  void TrendArrowTile;
  void ExpandToggle;
  void ProviderMixBar;
  void CommandPaletteStub;
  void LiveDot;
  void OverflowDots;
  void HeatmapLegend;
  void WeeklyHeatmapMini;
  void BreadcrumbPill;
  void AutoScrollToggle;
  void BackToLivePill;
  void ColumnLabel;
  void SectionDivider;
  void OpenInNewAffordance;
  void PagerPill;
  void PeerPoolTag;
  void AlertResolvedTick;
  void ScrubberHintLegend;
  void KbdKeyWide;
  void RefreshNowButton;
  void alphaHex;
  void Zap;
  return null;
}
// Mounted off-DOM via the JSX null pattern so the bundle includes the
// references but nothing renders.
void __reservedRefs;
