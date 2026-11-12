import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Eye,
  Flame,
  Gauge,
  Globe2,
  Grid3x3,
  Inbox,
  Mail,
  MailOpen,
  MessageCircle,
  Minus,
  PauseCircle,
  Reply,
  ShieldAlert,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Volume2,
  Waves,
  X,
  Zap,
} from 'lucide-react';

/**
 * AgActQ2Heatmap — Agency-tier Activity candidate Q2, "Activity Heatmap".
 *
 * The Agency Activity surface visualised as a GitHub-contribution-style
 * 7×24 grid. Each cell is a single (day-of-week × hour-of-day) bucket
 * over the past week. Cell INTENSITY (0..100) drives a 5-step opacity
 * scale on `bg-accent` — empty / low / med / high / peak. The grid is
 * the centrepiece: 7 rows (Mon..Sun, top→bottom in render but Mon at the
 * bottom of the y-axis label band per spec — see DAY_ORDER) × 24 cols
 * (00..23 hours). Cells are 28×28 with 4px gap, animated in row-by-row
 * with a left-to-right 20ms stagger on mount.
 *
 * INTERACTIONS:
 *   - Hover a cell → scale 1 → 1.15, a status-tinted halo blooms, a
 *     floating tooltip shows day + hour + event count + a 4-row
 *     breakdown (sent / opened / replied / rescued).
 *   - Click a cell → strong accent ring locks on, bottom EVENT PANEL
 *     slides up with the synthetic events that fell in that hour.
 *   - The 4 mini-heatmaps below the main grid (Sent / Opened / Replied /
 *     Rescued) sync to the same hover/click: hovering a cell in any
 *     grid lights the corresponding cell in the others. This makes
 *     pattern-matching across actions effortless.
 *
 * BELOW THE GRID:
 *   - "BREAKDOWN BY ACTION" — four mini-heatmaps stacked horizontally,
 *     each roughly half the cell size of the main grid. Each shows only
 *     one action's distribution.
 *   - "TODAY'S RHYTHM" — a 24-hour sparkline of the current day's
 *     volume. A cursor-tracked vertical guide + dot + tooltip surfaces
 *     the exact hour under the pointer.
 *
 * RIGHT INSPECTOR (lg:col-span-4):
 *   - Top active mailboxes (today)
 *   - Recent alerts ticker
 *   - Selected cell event detail (replaces the alerts ticker when a
 *     cell is locked)
 *
 * Fully STANDALONE — no router, no query hooks, no feature imports. The
 * harness mounts it prop-less; every value comes from inline MOCK unless
 * the caller passes `data`. Renders ONLY page content; the shell
 * supplies sidebar / chrome.
 *
 * NOT a timeline ribbon (Q1/Q3/Q4 own those). The heatmap identity —
 * GitHub-grid + sync mini-heatmaps + intensity legend — is the
 * differentiator.
 */

// ---------------------------------------------------------------------------
// Shared Agency activity data shape — keep in sync with sibling Q1/Q3/Q4.
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
// MOCK content — Northwind Agency / 8 sub-clients / 96 mailboxes.
// The weeklyHeatmap (168 entries: 7 days × 24 hours) is the centrepiece. The
// generator below produces a believable working-week shape: busier on weekday
// 9–17 windows, quieter overnight, two weekend dips with a small Saturday
// afternoon bump (where SDRs catch up on warmup queues).
// ---------------------------------------------------------------------------

function buildWeeklyHeatmap(): AgencyActivityData['weeklyHeatmap'] {
  // day: 0 = Monday, ..., 6 = Sunday.
  // hour: 0..23.
  // intensity: 0..100 — drives the cell opacity.
  // events: raw count for tooltip + click panel.
  const cells: AgencyActivityData['weeklyHeatmap'] = [];

  // Per-hour multiplier reflects a typical SaaS warmup engine cadence.
  // Quiet overnight (0–6), ramp-up 7–9, peak 10–13, dip 14, peak 15–17,
  // tail-off 18–22.
  const hourCurve = [
    8, 6, 4, 3, 3, 4, 12, 28, 58, 82, 96, 100, 95, 88, 74, 86, 92, 80, 56, 38,
    26, 18, 14, 10,
  ];

  // Per-day multiplier — weekdays full-bore, Saturday partial, Sunday low.
  const dayCurve = [
    1.0, // Mon
    1.05, // Tue
    1.08, // Wed
    0.97, // Thu
    0.88, // Fri
    0.42, // Sat
    0.18, // Sun
  ];

  // Seeded jitter so the grid feels organic, not lattice-perfect, but stays
  // deterministic across renders.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 0) % 100000) / 100000;
  };

  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const base = hourCurve[hour]! * dayCurve[day]!;
      // Wider jitter at low base values means the overnight hours flicker
      // around 0/low instead of locking at a single dead value.
      const jitter = (rand() - 0.5) * 14;
      const intensity = Math.max(0, Math.min(100, Math.round(base + jitter)));
      const events = Math.max(0, Math.round(intensity * 1.1 + rand() * 6));
      cells.push({ day, hour, intensity, events });
    }
  }

  // Special-case a couple of standout cells for narrative interest.
  // Wednesday 11:00 — peak warmup hour.
  const wed11 = cells.find((c) => c.day === 2 && c.hour === 11);
  if (wed11) {
    wed11.intensity = 100;
    wed11.events = 142;
  }
  // Tuesday 10:00 — high replies window.
  const tue10 = cells.find((c) => c.day === 1 && c.hour === 10);
  if (tue10) {
    tue10.intensity = 96;
    tue10.events = 128;
  }
  // Friday 16:00 — late-week peak.
  const fri16 = cells.find((c) => c.day === 4 && c.hour === 16);
  if (fri16) {
    fri16.intensity = 92;
    fri16.events = 121;
  }
  // Sunday 03:00 — dead zone marker.
  const sun03 = cells.find((c) => c.day === 6 && c.hour === 3);
  if (sun03) {
    sun03.intensity = 0;
    sun03.events = 0;
  }
  // Saturday 14:00 — weekend catch-up bump.
  const sat14 = cells.find((c) => c.day === 5 && c.hour === 14);
  if (sat14) {
    sat14.intensity = 58;
    sat14.events = 72;
  }
  return cells;
}

const WEEKLY_HEATMAP = buildWeeklyHeatmap();

function buildHourlyVolume(): AgencyActivityData['hourlyVolume'] {
  // Today's per-hour series — derived from the heatmap "Wednesday" curve
  // so the sparkline matches what the user expects to see for that row.
  // We expose `sends / opens / replies / rescues` as separate series for
  // the breakdown stack, even though the sparkline shows the sum.
  const rows: AgencyActivityData['hourlyVolume'] = [];
  for (let h = 0; h < 24; h += 1) {
    const cell = WEEKLY_HEATMAP.find((c) => c.day === 2 && c.hour === h);
    const total = cell?.events ?? 0;
    const sends = Math.round(total * 0.55);
    const opens = Math.round(total * 0.28);
    const replies = Math.round(total * 0.12);
    const rescues = Math.max(0, total - sends - opens - replies);
    rows.push({ hour: String(h).padStart(2, '0'), sends, opens, replies, rescues });
  }
  return rows;
}

const HOURLY_VOLUME = buildHourlyVolume();

const EVENTS: AgencyActivityData['events'] = [
  {
    id: 'evt-1',
    kind: 'sent',
    timestamp: '2026-05-27T11:18:00Z',
    timeAgo: '3m ago',
    mailboxId: 'mb-helix-01',
    mailboxEmail: 'mira@helix-labs.io',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Labs',
    subClientLogoChar: 'HL',
    peerEmail: 'peer-42@warmpulse.net',
    note: 'Outbound warmup → Gmail peer',
  },
  {
    id: 'evt-2',
    kind: 'opened',
    timestamp: '2026-05-27T11:17:00Z',
    timeAgo: '4m ago',
    mailboxId: 'mb-nimbus-04',
    mailboxEmail: 'sales@nimbuscloud.app',
    provider: 'outlook',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'NC',
    peerEmail: 'peer-18@warmpulse.net',
    note: 'Peer opened thread within 90s',
  },
  {
    id: 'evt-3',
    kind: 'replied',
    timestamp: '2026-05-27T11:15:00Z',
    timeAgo: '6m ago',
    mailboxId: 'mb-orion-02',
    mailboxEmail: 'team@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'OS',
    peerEmail: 'peer-07@warmpulse.net',
    note: 'Reply landed (LLM generated)',
  },
  {
    id: 'evt-4',
    kind: 'starred',
    timestamp: '2026-05-27T11:14:00Z',
    timeAgo: '7m ago',
    mailboxId: 'mb-vega-01',
    mailboxEmail: 'outreach@vegaoutbound.io',
    provider: 'outlook',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'VO',
    peerEmail: 'peer-24@warmpulse.net',
    note: 'Peer starred + moved to Primary',
  },
  {
    id: 'evt-5',
    kind: 'spam_rescue',
    timestamp: '2026-05-27T11:12:00Z',
    timeAgo: '9m ago',
    mailboxId: 'mb-atlas-01',
    mailboxEmail: 'hello@atlas-bio.com',
    provider: 'gmail',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'AB',
    peerEmail: 'peer-31@warmpulse.net',
    note: 'Rescued from Spam by peer-31',
  },
  {
    id: 'evt-6',
    kind: 'sent',
    timestamp: '2026-05-27T11:09:00Z',
    timeAgo: '12m ago',
    mailboxId: 'mb-quasar-03',
    mailboxEmail: 'ben@quasargrowth.com',
    provider: 'gmail',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'QG',
    peerEmail: 'peer-12@warmpulse.net',
    note: 'Outbound warmup → Yahoo peer',
  },
  {
    id: 'evt-7',
    kind: 'opened',
    timestamp: '2026-05-27T11:07:00Z',
    timeAgo: '14m ago',
    mailboxId: 'mb-lyra-02',
    mailboxEmail: 'studio@lyrastudio.co',
    provider: 'gmail',
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    subClientLogoChar: 'LS',
    peerEmail: 'peer-39@warmpulse.net',
    note: 'Peer opened on first poll',
  },
  {
    id: 'evt-8',
    kind: 'replied',
    timestamp: '2026-05-27T11:05:00Z',
    timeAgo: '16m ago',
    mailboxId: 'mb-pixel-01',
    mailboxEmail: 'hi@pixelforge.io',
    provider: 'outlook',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'PF',
    peerEmail: 'peer-08@warmpulse.net',
    note: 'Threaded reply (Claude)',
  },
  {
    id: 'evt-9',
    kind: 'sent',
    timestamp: '2026-05-27T11:04:00Z',
    timeAgo: '17m ago',
    mailboxId: 'mb-helix-02',
    mailboxEmail: 'beth@helix-labs.io',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Labs',
    subClientLogoChar: 'HL',
    peerEmail: 'peer-44@warmpulse.net',
    note: 'Outbound warmup → Outlook peer',
  },
  {
    id: 'evt-10',
    kind: 'sent',
    timestamp: '2026-05-27T11:02:00Z',
    timeAgo: '19m ago',
    mailboxId: 'mb-orion-01',
    mailboxEmail: 'leads@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'OS',
    peerEmail: 'peer-15@warmpulse.net',
    note: 'Outbound warmup → Gmail peer',
  },
  {
    id: 'evt-11',
    kind: 'starred',
    timestamp: '2026-05-27T11:01:00Z',
    timeAgo: '20m ago',
    mailboxId: 'mb-nimbus-02',
    mailboxEmail: 'team@nimbuscloud.app',
    provider: 'outlook',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'NC',
    peerEmail: 'peer-22@warmpulse.net',
    note: 'Peer starred + replied (combo)',
  },
  {
    id: 'evt-12',
    kind: 'opened',
    timestamp: '2026-05-27T11:00:00Z',
    timeAgo: '21m ago',
    mailboxId: 'mb-quasar-02',
    mailboxEmail: 'kira@quasargrowth.com',
    provider: 'gmail',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'QG',
    peerEmail: 'peer-29@warmpulse.net',
    note: 'Peer opened on second poll',
  },
  {
    id: 'evt-13',
    kind: 'sent',
    timestamp: '2026-05-27T10:58:00Z',
    timeAgo: '23m ago',
    mailboxId: 'mb-vega-02',
    mailboxEmail: 'ops@vegaoutbound.io',
    provider: 'outlook',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'VO',
    peerEmail: 'peer-03@warmpulse.net',
    note: 'Outbound warmup → Outlook peer',
  },
  {
    id: 'evt-14',
    kind: 'replied',
    timestamp: '2026-05-27T10:56:00Z',
    timeAgo: '25m ago',
    mailboxId: 'mb-atlas-02',
    mailboxEmail: 'pr@atlas-bio.com',
    provider: 'gmail',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'AB',
    peerEmail: 'peer-46@warmpulse.net',
    note: 'Reply landed in Primary',
  },
  {
    id: 'evt-15',
    kind: 'sent',
    timestamp: '2026-05-27T10:54:00Z',
    timeAgo: '27m ago',
    mailboxId: 'mb-pixel-02',
    mailboxEmail: 'sales@pixelforge.io',
    provider: 'outlook',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'PF',
    peerEmail: 'peer-37@warmpulse.net',
    note: 'Outbound warmup → Gmail peer',
  },
  {
    id: 'evt-16',
    kind: 'spam_rescue',
    timestamp: '2026-05-27T10:51:00Z',
    timeAgo: '30m ago',
    mailboxId: 'mb-vega-03',
    mailboxEmail: 'team@vegaoutbound.io',
    provider: 'outlook',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'VO',
    peerEmail: 'peer-19@warmpulse.net',
    note: 'Rescued from Junk by peer-19',
  },
  {
    id: 'evt-17',
    kind: 'sent',
    timestamp: '2026-05-27T10:48:00Z',
    timeAgo: '33m ago',
    mailboxId: 'mb-lyra-01',
    mailboxEmail: 'hello@lyrastudio.co',
    provider: 'gmail',
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    subClientLogoChar: 'LS',
    peerEmail: 'peer-26@warmpulse.net',
    note: 'Outbound warmup → Outlook peer',
  },
  {
    id: 'evt-18',
    kind: 'opened',
    timestamp: '2026-05-27T10:45:00Z',
    timeAgo: '36m ago',
    mailboxId: 'mb-helix-03',
    mailboxEmail: 'eng@helix-labs.io',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Labs',
    subClientLogoChar: 'HL',
    peerEmail: 'peer-11@warmpulse.net',
    note: 'Peer opened thread',
  },
  {
    id: 'evt-19',
    kind: 'sent',
    timestamp: '2026-05-27T10:42:00Z',
    timeAgo: '39m ago',
    mailboxId: 'mb-quasar-01',
    mailboxEmail: 'hello@quasargrowth.com',
    provider: 'gmail',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'QG',
    peerEmail: 'peer-05@warmpulse.net',
    note: 'Outbound warmup → Yahoo peer',
  },
  {
    id: 'evt-20',
    kind: 'starred',
    timestamp: '2026-05-27T10:38:00Z',
    timeAgo: '43m ago',
    mailboxId: 'mb-orion-03',
    mailboxEmail: 'sdr@orionsales.com',
    provider: 'gmail',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'OS',
    peerEmail: 'peer-49@warmpulse.net',
    note: 'Peer starred for follow-up',
  },
  {
    id: 'evt-21',
    kind: 'sent',
    timestamp: '2026-05-27T10:35:00Z',
    timeAgo: '46m ago',
    mailboxId: 'mb-nimbus-01',
    mailboxEmail: 'support@nimbuscloud.app',
    provider: 'outlook',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'NC',
    peerEmail: 'peer-33@warmpulse.net',
    note: 'Outbound warmup → Yahoo peer',
  },
  {
    id: 'evt-22',
    kind: 'replied',
    timestamp: '2026-05-27T10:31:00Z',
    timeAgo: '50m ago',
    mailboxId: 'mb-pixel-03',
    mailboxEmail: 'design@pixelforge.io',
    provider: 'outlook',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'PF',
    peerEmail: 'peer-14@warmpulse.net',
    note: 'Threaded reply (Gemini)',
  },
  {
    id: 'evt-23',
    kind: 'sent',
    timestamp: '2026-05-27T10:28:00Z',
    timeAgo: '53m ago',
    mailboxId: 'mb-atlas-03',
    mailboxEmail: 'lab@atlas-bio.com',
    provider: 'gmail',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'AB',
    peerEmail: 'peer-21@warmpulse.net',
    note: 'Outbound warmup → Gmail peer',
  },
  {
    id: 'evt-24',
    kind: 'opened',
    timestamp: '2026-05-27T10:25:00Z',
    timeAgo: '56m ago',
    mailboxId: 'mb-vega-04',
    mailboxEmail: 'team@vegaoutbound.io',
    provider: 'outlook',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'VO',
    peerEmail: 'peer-40@warmpulse.net',
    note: 'Peer opened + read 8s',
  },
];

const TOP_ACTIVE_MAILBOXES: AgencyActivityData['topActiveMailboxes'] = [
  {
    mailboxId: 'mb-helix-01',
    mailboxEmail: 'mira@helix-labs.io',
    subClientName: 'Helix Labs',
    eventsToday: 482,
  },
  {
    mailboxId: 'mb-orion-02',
    mailboxEmail: 'team@orionsales.com',
    subClientName: 'Orion Sales',
    eventsToday: 461,
  },
  {
    mailboxId: 'mb-nimbus-04',
    mailboxEmail: 'sales@nimbuscloud.app',
    subClientName: 'Nimbus Cloud',
    eventsToday: 412,
  },
  {
    mailboxId: 'mb-quasar-03',
    mailboxEmail: 'ben@quasargrowth.com',
    subClientName: 'Quasar Growth',
    eventsToday: 388,
  },
  {
    mailboxId: 'mb-helix-02',
    mailboxEmail: 'beth@helix-labs.io',
    subClientName: 'Helix Labs',
    eventsToday: 364,
  },
  {
    mailboxId: 'mb-pixel-01',
    mailboxEmail: 'hi@pixelforge.io',
    subClientName: 'Pixel Forge',
    eventsToday: 339,
  },
  {
    mailboxId: 'mb-lyra-02',
    mailboxEmail: 'studio@lyrastudio.co',
    subClientName: 'Lyra Studio',
    eventsToday: 312,
  },
  {
    mailboxId: 'mb-vega-01',
    mailboxEmail: 'outreach@vegaoutbound.io',
    subClientName: 'Vega Outbound',
    eventsToday: 297,
  },
];

const ALERTS: AgencyActivityData['alerts'] = [
  {
    id: 'al-1',
    kind: 'spam_burst',
    message: 'Atlas Bio: 4 spam-rescues in last 15m — peer rotation engaged',
    timeAgo: '8m ago',
    severity: 'critical',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
  },
  {
    id: 'al-2',
    kind: 'spike',
    message: 'Helix Labs: outbound volume +38% vs 7-day baseline',
    timeAgo: '22m ago',
    severity: 'info',
    subClientId: 'sc-helix',
    subClientName: 'Helix Labs',
  },
  {
    id: 'al-3',
    kind: 'silence',
    message: 'Pixel Forge: no inbound signal for 41m on 3 mailboxes',
    timeAgo: '41m ago',
    severity: 'warn',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
  },
  {
    id: 'al-4',
    kind: 'spike',
    message: 'Orion Sales: reply rate trending +12% over last hour',
    timeAgo: '1h ago',
    severity: 'info',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
  },
  {
    id: 'al-5',
    kind: 'silence',
    message: 'Vega Outbound: 2 mailboxes paused by peer-pool throttle',
    timeAgo: '1h ago',
    severity: 'warn',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
  },
];

const MOCK: AgencyActivityData = {
  workspace: {
    name: 'Northwind Agency',
    subClientCount: 8,
    mailboxCount: 96,
  },
  kpis: {
    eventsToday: 4280,
    sendsToday: 2410,
    opensToday: 1192,
    repliesToday: 482,
    spamRescuesToday: 38,
    peerInteractionsToday: 3618,
    eventsLastHour: 312,
    avgEventsPerMin: 5.2,
  },
  events: EVENTS,
  hourlyVolume: HOURLY_VOLUME,
  weeklyHeatmap: WEEKLY_HEATMAP,
  topActiveMailboxes: TOP_ACTIVE_MAILBOXES,
  alerts: ALERTS,
};

/**
 * Skeleton fallback used by the future live adapter — every collection
 * empty, all KPIs zero. Matches the shape so swapping data in/out
 * doesn't crash the component on first render before the API returns.
 */
export const AGENCY_ACTIVITY_SKELETON_Q2: AgencyActivityData = {
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
// Theme helpers / constants
// ---------------------------------------------------------------------------

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const ACTION_LABEL: Record<ActionKind, string> = {
  sent: 'Sent',
  opened: 'Opened',
  replied: 'Replied',
  starred: 'Starred',
  spam_rescue: 'Rescued',
  bounce: 'Bounce',
};

const ACTION_ICON: Record<ActionKind, ComponentType<{ className?: string }>> = {
  sent: Mail,
  opened: MailOpen,
  replied: Reply,
  starred: Star,
  spam_rescue: ShieldAlert,
  bounce: AlertTriangle,
};

const ACTION_TONE: Record<ActionKind, string> = {
  sent: 'text-accent2',
  opened: 'text-accent',
  replied: 'text-accent',
  starred: 'text-accent4',
  spam_rescue: 'text-accent3',
  bounce: 'text-accent3',
};

const ACTION_RING: Record<ActionKind, string> = {
  sent: 'border-accent2/40 bg-accent2/10 text-accent2',
  opened: 'border-accent/40 bg-accent/10 text-accent',
  replied: 'border-accent/40 bg-accent/10 text-accent',
  starred: 'border-accent4/40 bg-accent4/10 text-accent4',
  spam_rescue: 'border-accent3/40 bg-accent3/10 text-accent3',
  bounce: 'border-accent3/40 bg-accent3/10 text-accent3',
};

const SEVERITY_RING: Record<AlertSeverity, string> = {
  info: 'border-accent2/30 bg-accent2/10 text-accent2',
  warn: 'border-accent4/30 bg-accent4/10 text-accent4',
  critical: 'border-accent3/30 bg-accent3/10 text-accent3',
};

const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

// ---------------------------------------------------------------------------
// Intensity → tailwind class mapping. Five tiers as required by spec.
//   empty(0)         → bg-surface-2
//   low(>0..25)      → bg-accent/15
//   med(>25..50)     → bg-accent/35
//   high(>50..75)    → bg-accent/55
//   peak(>75..100)   → bg-accent/85
// We use border classes to lift the lowest tier visually and a faint outline
// even for empty so the lattice never disappears entirely.
// ---------------------------------------------------------------------------

type IntensityTier = 'empty' | 'low' | 'med' | 'high' | 'peak';

function tierOf(intensity: number): IntensityTier {
  if (intensity <= 0) return 'empty';
  if (intensity <= 25) return 'low';
  if (intensity <= 50) return 'med';
  if (intensity <= 75) return 'high';
  return 'peak';
}

const TIER_CELL_CLASS: Record<IntensityTier, string> = {
  empty: 'bg-surface-2 border-border-muted/40',
  low: 'bg-accent/15 border-accent/15',
  med: 'bg-accent/35 border-accent/25',
  high: 'bg-accent/55 border-accent/35',
  peak: 'bg-accent/85 border-accent/55',
};

const TIER_LABEL: Record<IntensityTier, string> = {
  empty: 'None',
  low: 'Low',
  med: 'Med',
  high: 'High',
  peak: 'Peak',
};

// Mini-grid colour scale per action — sent uses accent2, opens use accent,
// replies use accent, rescues use accent3. The intensity scaling rule is
// identical, only the hue differs.
type MiniAction = Extract<ActionKind, 'sent' | 'opened' | 'replied' | 'spam_rescue'>;

const MINI_TIER_CLASS: Record<MiniAction, Record<IntensityTier, string>> = {
  sent: {
    empty: 'bg-surface-2 border-border-muted/40',
    low: 'bg-accent2/15 border-accent2/15',
    med: 'bg-accent2/35 border-accent2/25',
    high: 'bg-accent2/55 border-accent2/35',
    peak: 'bg-accent2/85 border-accent2/55',
  },
  opened: {
    empty: 'bg-surface-2 border-border-muted/40',
    low: 'bg-accent/15 border-accent/15',
    med: 'bg-accent/35 border-accent/25',
    high: 'bg-accent/55 border-accent/35',
    peak: 'bg-accent/85 border-accent/55',
  },
  replied: {
    empty: 'bg-surface-2 border-border-muted/40',
    low: 'bg-accent/15 border-accent/15',
    med: 'bg-accent/35 border-accent/25',
    high: 'bg-accent/55 border-accent/35',
    peak: 'bg-accent/85 border-accent/55',
  },
  spam_rescue: {
    empty: 'bg-surface-2 border-border-muted/40',
    low: 'bg-accent3/15 border-accent3/15',
    med: 'bg-accent3/35 border-accent3/25',
    high: 'bg-accent3/55 border-accent3/35',
    peak: 'bg-accent3/85 border-accent3/55',
  },
};

const MINI_HEAD_LABEL: Record<MiniAction, string> = {
  sent: 'Sent',
  opened: 'Opened',
  replied: 'Replied',
  spam_rescue: 'Rescued',
};

const MINI_HEAD_ICON: Record<MiniAction, ComponentType<{ className?: string }>> = {
  sent: Mail,
  opened: MailOpen,
  replied: Reply,
  spam_rescue: ShieldAlert,
};

const MINI_HEAD_TONE: Record<MiniAction, string> = {
  sent: 'text-accent2',
  opened: 'text-accent',
  replied: 'text-accent',
  spam_rescue: 'text-accent3',
};

const MINI_HEAD_RING: Record<MiniAction, string> = {
  sent: 'border-accent2/30 bg-accent2/10 text-accent2',
  opened: 'border-accent/30 bg-accent/10 text-accent',
  replied: 'border-accent/30 bg-accent/10 text-accent',
  spam_rescue: 'border-accent3/30 bg-accent3/10 text-accent3',
};

// ---------------------------------------------------------------------------
// Number / time formatters
// ---------------------------------------------------------------------------

function fmtCount(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return n.toString();
}

function fmtCountFull(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgActQ2Heatmap({
  data,
}: { data?: AgencyActivityData } = {}): JSX.Element {
  const d = data ?? MOCK;
  return <HeatmapShell data={d} />;
}

// ---------------------------------------------------------------------------
// Shell — wires the header band, main grid, breakdown row, sparkline and
// the right inspector together. State for hover + selection is owned here
// so the mini-heatmaps and inspector can sync to it.
// ---------------------------------------------------------------------------

type CellRef = { day: number; hour: number } | null;

function HeatmapShell({ data }: { data: AgencyActivityData }) {
  const [hoverCell, setHoverCell] = useState<CellRef>(null);
  const [selectedCell, setSelectedCell] = useState<CellRef>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // Inspector switches between "alerts + top mailboxes" and "selected-cell
  // event detail" based on whether a cell is locked.
  const onSelectCell = useCallback((cell: CellRef) => {
    setSelectedCell((prev) => {
      if (
        cell &&
        prev &&
        prev.day === cell.day &&
        prev.hour === cell.hour
      ) {
        return null;
      }
      return cell;
    });
  }, []);

  const closeEventPanel = useCallback(() => setSelectedCell(null), []);

  // Synthetic per-cell events: we draw from the global EVENTS array and
  // bucket them into the clicked cell. In a live build this would be a
  // server filter (eventsByDayHour) — here we slice + label.
  const eventsForSelectedCell = useMemo(() => {
    if (!selectedCell) return [] as AgencyActivityData['events'];
    // Deterministic slice based on the cell coordinates so different cells
    // surface different events.
    const seed = selectedCell.day * 24 + selectedCell.hour;
    const cell = data.weeklyHeatmap.find(
      (c) => c.day === selectedCell.day && c.hour === selectedCell.hour,
    );
    const count = Math.min(data.events.length, Math.max(2, Math.round((cell?.events ?? 0) / 18)));
    const offset = seed % Math.max(1, data.events.length);
    return Array.from({ length: count }, (_, i) => data.events[(offset + i) % data.events.length]!);
  }, [selectedCell, data]);

  return (
    <div className="space-y-5">
      <HeaderBand
        data={data}
        weekOffset={weekOffset}
        onPrev={() => setWeekOffset((o) => o - 1)}
        onNext={() => setWeekOffset((o) => o + 1)}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="space-y-4 lg:col-span-8">
          <MainHeatmapCanvas
            data={data}
            hoverCell={hoverCell}
            selectedCell={selectedCell}
            onHover={setHoverCell}
            onSelect={onSelectCell}
          />
          <BreakdownStrip
            data={data}
            hoverCell={hoverCell}
            selectedCell={selectedCell}
            onHover={setHoverCell}
            onSelect={onSelectCell}
          />
          <TodayRhythmStrip data={data} />
          <AnimatePresence>
            {selectedCell ? (
              <EventDetailPanel
                key={`${selectedCell.day}-${selectedCell.hour}`}
                cell={selectedCell}
                events={eventsForSelectedCell}
                onClose={closeEventPanel}
              />
            ) : null}
          </AnimatePresence>
        </div>

        <div className="lg:col-span-4">
          <InspectorRail
            data={data}
            selectedCell={selectedCell}
            selectedEvents={eventsForSelectedCell}
            onCloseSelection={closeEventPanel}
          />
        </div>
      </motion.div>

      <FooterLegend />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header band: agency identity + region pill + 8 KPI tiles + MoM chip + week
// picker. The week picker is decorative (the future API will accept a
// `weekStart` param) — Next is always disabled because "you can't see the
// future".
// ---------------------------------------------------------------------------

function HeaderBand({
  data,
  weekOffset,
  onPrev,
  onNext,
}: {
  data: AgencyActivityData;
  weekOffset: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const weekLabel = useMemo(() => {
    if (weekOffset === 0) return 'This week';
    if (weekOffset === -1) return 'Last week';
    if (weekOffset === 1) return 'Next week';
    if (weekOffset < 0) return `${Math.abs(weekOffset)} weeks ago`;
    return `${weekOffset} weeks ahead`;
  }, [weekOffset]);

  // Synthetic MoM chip — the spec asks for one. The real source will be the
  // events-rollup aggregate compared to 30d prior.
  const momPct = 4.6;

  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Grid3x3 className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {data.workspace.name || 'Your agency'}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent2/30 bg-accent2/10 px-2 py-0.5 text-xs font-medium text-accent2">
              <Sparkles className="h-3 w-3" />
              Agency
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface/60 px-2.5 py-0.5 text-[11px] text-text-dim backdrop-blur-xl">
              <Globe2 className="h-3 w-3" />
              Global · all regions
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface/60 px-2.5 py-0.5 text-[11px] text-text-dim backdrop-blur-xl">
              <Users className="h-3 w-3" />
              {data.workspace.subClientCount} sub-clients ·{' '}
              {data.workspace.mailboxCount} mailboxes
            </span>
          </div>
          <p className="text-sm text-text-dim">
            Activity heatmap — 7 days × 24 hours. Hover any cell for a
            breakdown, click to lock the bottom panel onto that window.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <WeekPicker
            label={weekLabel}
            offset={weekOffset}
            onPrev={onPrev}
            onNext={onNext}
          />
          <DeltaChip delta={momPct} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiTile
          icon={Activity}
          label="Events today"
          value={fmtCountFull(data.kpis.eventsToday)}
          sub="All actions, all sub-clients"
          accent="accent"
        />
        <KpiTile
          icon={Mail}
          label="Sends today"
          value={fmtCountFull(data.kpis.sendsToday)}
          sub="Outbound warmup"
          accent="accent2"
        />
        <KpiTile
          icon={MailOpen}
          label="Opens today"
          value={fmtCountFull(data.kpis.opensToday)}
          sub="Peer engagement"
          accent="accent"
        />
        <KpiTile
          icon={Reply}
          label="Replies today"
          value={fmtCountFull(data.kpis.repliesToday)}
          sub="Threaded responses"
          accent="accent"
        />
        <KpiTile
          icon={ShieldAlert}
          label="Spam rescues"
          value={fmtCountFull(data.kpis.spamRescuesToday)}
          sub="Pulled from Junk"
          accent="accent3"
        />
        <KpiTile
          icon={Users}
          label="Peer events"
          value={fmtCountFull(data.kpis.peerInteractionsToday)}
          sub="Network interactions"
          accent="accent2"
        />
        <KpiTile
          icon={Clock}
          label="Last hour"
          value={fmtCountFull(data.kpis.eventsLastHour)}
          sub="Most recent window"
          accent="accent4"
        />
        <KpiTile
          icon={Gauge}
          label="Events / min"
          value={data.kpis.avgEventsPerMin.toFixed(1)}
          sub="Rolling 24h avg"
          accent="accent"
        />
      </div>
    </motion.header>
  );
}

function WeekPicker({
  label,
  offset,
  onPrev,
  onNext,
}: {
  label: string;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const nextDisabled = offset >= 0;
  return (
    <div className="flex items-center gap-1 rounded-full border border-border-muted bg-surface/60 p-1 backdrop-blur-xl">
      <button
        type="button"
        onClick={onPrev}
        className="grid h-7 w-7 place-items-center rounded-full text-text-dim hover:bg-surface-2 hover:text-text"
        aria-label="Previous week"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="flex items-center gap-1.5 px-2 text-[11px] font-medium text-text">
        <CalendarRange className="h-3 w-3 text-text-dim" />
        {label}
      </span>
      <button
        type="button"
        onClick={nextDisabled ? undefined : onNext}
        disabled={nextDisabled}
        className={`grid h-7 w-7 place-items-center rounded-full ${
          nextDisabled
            ? 'cursor-not-allowed text-text-faint'
            : 'text-text-dim hover:bg-surface-2 hover:text-text'
        }`}
        aria-label="Next week"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  const positive = delta > 0;
  const flat = delta === 0;
  const Icon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? 'border-border-muted bg-surface-2/60 text-text-dim'
    : positive
      ? 'border-accent/30 bg-accent/10 text-accent'
      : 'border-accent3/30 bg-accent3/10 text-accent3';
  return (
    <span
      className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs backdrop-blur-xl ${tone}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="font-mono font-semibold tabular-nums">
        {positive ? '+' : ''}
        {delta.toFixed(1)}%
      </span>
      <span className="text-text-dim">MoM</span>
    </span>
  );
}

type KpiAccent = 'accent' | 'accent2' | 'accent3' | 'accent4' | 'dim';

const KPI_TONE: Record<KpiAccent, string> = {
  accent: 'text-accent',
  accent2: 'text-accent2',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
  dim: 'text-text-dim',
};

const KPI_TONE_BG: Record<KpiAccent, string> = {
  accent: 'border-accent/30 bg-accent/5',
  accent2: 'border-accent2/30 bg-accent2/5',
  accent3: 'border-accent3/30 bg-accent3/5',
  accent4: 'border-accent4/30 bg-accent4/5',
  dim: 'border-border-muted bg-surface-2/40',
};

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  accent: KpiAccent;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg border ${KPI_TONE_BG[accent]} ${KPI_TONE[accent]}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
          {label}
        </span>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-text">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-text-dim">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main heatmap canvas — header axis + the 7×24 grid + intensity legend.
// ---------------------------------------------------------------------------

const CELL = 28; // cell side length in px
const GAP = 4; // gap between cells in px
const ROW_HEIGHT = CELL + GAP;
const COL_WIDTH = CELL + GAP;

function MainHeatmapCanvas({
  data,
  hoverCell,
  selectedCell,
  onHover,
  onSelect,
}: {
  data: AgencyActivityData;
  hoverCell: CellRef;
  selectedCell: CellRef;
  onHover: (cell: CellRef) => void;
  onSelect: (cell: CellRef) => void;
}) {
  // Index by [day][hour] so the cell row renders are O(1) lookups.
  const grid = useMemo(() => indexHeatmap(data.weeklyHeatmap), [data.weeklyHeatmap]);
  const totalEventsThisWeek = useMemo(
    () => data.weeklyHeatmap.reduce((s, c) => s + c.events, 0),
    [data.weeklyHeatmap],
  );

  return (
    <section className="rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-accent" />
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-text-dim">
              Weekly activity heatmap
            </h2>
          </div>
          <p className="mt-1 text-sm text-text">
            {fmtCountFull(totalEventsThisWeek)} events across 168 hours
          </p>
        </div>
        <IntensityLegend />
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="inline-block min-w-full">
          <HourAxis />
          <HeatmapGrid
            grid={grid}
            hoverCell={hoverCell}
            selectedCell={selectedCell}
            onHover={onHover}
            onSelect={onSelect}
          />
          <DayLabels />
        </div>
      </div>
    </section>
  );
}

function indexHeatmap(cells: AgencyActivityData['weeklyHeatmap']) {
  const out: Array<Array<AgencyActivityData['weeklyHeatmap'][number] | undefined>> = [];
  for (let d = 0; d < 7; d += 1) {
    out.push(new Array(24).fill(undefined));
  }
  cells.forEach((c) => {
    if (c.day >= 0 && c.day < 7 && c.hour >= 0 && c.hour < 24) {
      out[c.day]![c.hour] = c;
    }
  });
  return out;
}

function HourAxis() {
  // Label every 3 hours per spec. The labels are positioned over the
  // *centre* of the corresponding cell.
  const labels: Array<{ hour: number; left: number }> = [];
  for (let h = 0; h < 24; h += 3) {
    labels.push({ hour: h, left: h * COL_WIDTH + CELL / 2 });
  }
  // Day label gutter on the left
  const gutter = 44;
  const totalWidth = gutter + 24 * COL_WIDTH;
  return (
    <div className="relative h-5" style={{ width: totalWidth }}>
      {labels.map((l) => (
        <span
          key={l.hour}
          className="absolute -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint"
          style={{ left: gutter + l.left, top: 0 }}
        >
          {String(l.hour).padStart(2, '0')}
        </span>
      ))}
    </div>
  );
}

function DayLabels() {
  // The grid renders day=0 (Monday) at the bottom row per spec, so the
  // day-labels column is essentially baked into HeatmapGrid; this strip
  // sits below the grid as a 0..23 reminder.
  const gutter = 44;
  const totalWidth = gutter + 24 * COL_WIDTH;
  const ticks: Array<{ hour: number; left: number }> = [];
  for (let h = 0; h < 24; h += 1) {
    ticks.push({ hour: h, left: h * COL_WIDTH + CELL / 2 });
  }
  return (
    <div className="relative mt-3 h-4" style={{ width: totalWidth }}>
      {ticks.map((t) => (
        <span
          key={t.hour}
          className={`absolute -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.1em] ${
            t.hour % 3 === 0 ? 'text-text-dim' : 'text-text-faint/60'
          }`}
          style={{ left: gutter + t.left, top: 0 }}
        >
          {String(t.hour).padStart(2, '0')}
        </span>
      ))}
    </div>
  );
}

function HeatmapGrid({
  grid,
  hoverCell,
  selectedCell,
  onHover,
  onSelect,
}: {
  grid: Array<Array<AgencyActivityData['weeklyHeatmap'][number] | undefined>>;
  hoverCell: CellRef;
  selectedCell: CellRef;
  onHover: (cell: CellRef) => void;
  onSelect: (cell: CellRef) => void;
}) {
  // Render with day=6 (Sun) at TOP and day=0 (Mon) at BOTTOM per spec:
  //   "7 rows ... bottom→top: Mon Tue Wed Thu Fri Sat Sun"
  // Therefore the topmost row in the DOM is Sun (day=6) and the bottommost
  // is Mon (day=0).
  const rows = [6, 5, 4, 3, 2, 1, 0] as const;
  const gutter = 44;
  const totalWidth = gutter + 24 * COL_WIDTH;
  const totalHeight = 7 * ROW_HEIGHT;
  return (
    <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
      {rows.map((day, rowIdx) => (
        <div key={day} className="flex items-center gap-1" style={{ height: ROW_HEIGHT }}>
          <span
            className="w-10 shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim"
            style={{ paddingRight: 6 }}
          >
            {DAY_ORDER[day]}
          </span>
          <div className="relative flex" style={{ gap: GAP }}>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = grid[day]?.[hour];
              const intensity = cell?.intensity ?? 0;
              const events = cell?.events ?? 0;
              const isHover =
                hoverCell?.day === day && hoverCell?.hour === hour;
              const isSelected =
                selectedCell?.day === day && selectedCell?.hour === hour;
              const staggerOrder = rowIdx * 24 + hour;
              return (
                <HeatmapCell
                  key={`${day}-${hour}`}
                  day={day}
                  hour={hour}
                  intensity={intensity}
                  events={events}
                  isHover={isHover}
                  isSelected={isSelected}
                  staggerOrder={staggerOrder}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function HeatmapCell({
  day,
  hour,
  intensity,
  events,
  isHover,
  isSelected,
  staggerOrder,
  onHover,
  onSelect,
}: {
  day: number;
  hour: number;
  intensity: number;
  events: number;
  isHover: boolean;
  isSelected: boolean;
  staggerOrder: number;
  onHover: (cell: CellRef) => void;
  onSelect: (cell: CellRef) => void;
}) {
  const tier = tierOf(intensity);
  const cellClass = TIER_CELL_CLASS[tier];
  const cellRef = useRef<HTMLDivElement | null>(null);

  return (
    <motion.div
      ref={cellRef}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{
        opacity: 1,
        scale: isHover ? 1.15 : isSelected ? 1.1 : 1,
      }}
      transition={{
        duration: 0.22,
        delay: 0.04 + staggerOrder * 0.005,
        ease: 'easeOut',
      }}
      whileTap={{ scale: 0.95 }}
      onMouseEnter={() => onHover({ day, hour })}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect({ day, hour })}
      className={`relative cursor-pointer rounded-[6px] border ${cellClass} ${
        isSelected
          ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface'
          : isHover
            ? 'ring-1 ring-accent/40'
            : ''
      }`}
      style={{ width: CELL, height: CELL }}
      role="button"
      aria-label={`${DAY_ORDER[day]} ${hourLabel(hour)} — ${events} events`}
    >
      {/* hover halo */}
      <AnimatePresence>
        {isHover ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1.45 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-0 rounded-[10px] bg-accent/15 blur-md"
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      {/* selection ring pulse */}
      <AnimatePresence>
        {isSelected ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1.25 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 rounded-[10px] border-2 border-accent/70"
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      {/* hover tooltip — positioned above the cell */}
      <AnimatePresence>
        {isHover ? (
          <HoverTooltip day={day} hour={hour} events={events} />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function HoverTooltip({
  day,
  hour,
  events,
}: {
  day: number;
  hour: number;
  events: number;
}) {
  const breakdown = useMemo(() => {
    // Derive a synthetic per-action breakdown from the total. Real source:
    // hourly per-action histogram.
    const sent = Math.round(events * 0.55);
    const opened = Math.round(events * 0.28);
    const replied = Math.round(events * 0.12);
    const rescued = Math.max(0, events - sent - opened - replied);
    return { sent, opened, replied, rescued };
  }, [events]);
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.94 }}
      animate={{ opacity: 1, y: -10, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.94 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-none absolute left-1/2 -top-2 z-30 w-44 -translate-x-1/2 -translate-y-full rounded-xl border border-border-muted bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur-xl"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim">
          {DAY_ORDER[day]} · {hourLabel(hour)}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-text">
          {events}
        </span>
      </div>
      <div className="mt-2 space-y-1 text-[11px]">
        <BreakdownRow icon={Mail} tone="text-accent2" label="Sent" value={breakdown.sent} />
        <BreakdownRow
          icon={MailOpen}
          tone="text-accent"
          label="Opened"
          value={breakdown.opened}
        />
        <BreakdownRow
          icon={Reply}
          tone="text-accent"
          label="Replied"
          value={breakdown.replied}
        />
        <BreakdownRow
          icon={ShieldAlert}
          tone="text-accent3"
          label="Rescued"
          value={breakdown.rescued}
        />
      </div>
      {/* down-arrow tail */}
      <span
        className="absolute left-1/2 -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-border-muted bg-surface/95"
        aria-hidden
      />
    </motion.div>
  );
}

function BreakdownRow({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-text-dim">
        <Icon className={`h-3 w-3 ${tone}`} />
        {label}
      </span>
      <span className="font-mono tabular-nums text-text">{value}</span>
    </div>
  );
}

function IntensityLegend() {
  const tiers: IntensityTier[] = ['empty', 'low', 'med', 'high', 'peak'];
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-dim">
        Intensity
      </span>
      <div className="flex items-center gap-1.5">
        {tiers.map((t) => (
          <div key={t} className="flex flex-col items-center gap-0.5">
            <span
              className={`block h-3.5 w-5 rounded-[3px] border ${TIER_CELL_CLASS[t]}`}
            />
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-text-faint">
              {TIER_LABEL[t]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breakdown by action — 4 mini-heatmaps stacked horizontally on lg, two-up
// on md. Each mini-heatmap has half-sized cells and a smaller axis.
// ---------------------------------------------------------------------------

function BreakdownStrip({
  data,
  hoverCell,
  selectedCell,
  onHover,
  onSelect,
}: {
  data: AgencyActivityData;
  hoverCell: CellRef;
  selectedCell: CellRef;
  onHover: (cell: CellRef) => void;
  onSelect: (cell: CellRef) => void;
}) {
  const actions: MiniAction[] = ['sent', 'opened', 'replied', 'spam_rescue'];
  const grid = useMemo(() => indexHeatmap(data.weeklyHeatmap), [data.weeklyHeatmap]);
  // Action-mix ratios used to scale the per-action intensity from the total.
  const RATIOS: Record<MiniAction, number> = {
    sent: 0.55,
    opened: 0.28,
    replied: 0.12,
    spam_rescue: 0.05,
  };
  return (
    <section className="rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <Waves className="h-3.5 w-3.5 text-accent2" />
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-text-dim">
          Breakdown by action
        </h2>
        <span className="text-xs text-text-dim">
          · same 7×24 grid, one action at a time
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => (
          <MiniHeatmap
            key={action}
            action={action}
            ratio={RATIOS[action]}
            grid={grid}
            hoverCell={hoverCell}
            selectedCell={selectedCell}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

const MINI_CELL = 12;
const MINI_GAP = 2;

function MiniHeatmap({
  action,
  ratio,
  grid,
  hoverCell,
  selectedCell,
  onHover,
  onSelect,
}: {
  action: MiniAction;
  ratio: number;
  grid: Array<Array<AgencyActivityData['weeklyHeatmap'][number] | undefined>>;
  hoverCell: CellRef;
  selectedCell: CellRef;
  onHover: (cell: CellRef) => void;
  onSelect: (cell: CellRef) => void;
}) {
  const Icon = MINI_HEAD_ICON[action];
  const label = MINI_HEAD_LABEL[action];
  const tone = MINI_HEAD_TONE[action];
  const ring = MINI_HEAD_RING[action];

  // Sum the synthetic per-action contributions across the week to surface a
  // total in the header.
  const total = useMemo(() => {
    let s = 0;
    for (let day = 0; day < 7; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const cell = grid[day]?.[hour];
        s += Math.round((cell?.events ?? 0) * ratio);
      }
    }
    return s;
  }, [grid, ratio]);

  const rows = [6, 5, 4, 3, 2, 1, 0] as const;
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${ring}`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span className={`font-mono text-[11px] tabular-nums ${tone}`}>
          {fmtCount(total)}
        </span>
      </div>
      <div className="flex flex-col gap-[2px]">
        {rows.map((day) => (
          <div key={day} className="flex items-center gap-1">
            <span
              className="w-7 shrink-0 text-right font-mono text-[8px] uppercase tracking-[0.1em] text-text-faint"
              style={{ paddingRight: 4 }}
            >
              {DAY_ORDER[day]}
            </span>
            <div className="flex" style={{ gap: MINI_GAP }}>
              {Array.from({ length: 24 }, (_, hour) => {
                const cell = grid[day]?.[hour];
                const scaled = Math.round((cell?.intensity ?? 0) * (ratio * 2));
                const tier = tierOf(scaled);
                const isHover =
                  hoverCell?.day === day && hoverCell?.hour === hour;
                const isSelected =
                  selectedCell?.day === day && selectedCell?.hour === hour;
                return (
                  <motion.div
                    key={`${action}-${day}-${hour}`}
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      scale: isHover ? 1.25 : isSelected ? 1.1 : 1,
                    }}
                    transition={{ duration: 0.2 }}
                    onMouseEnter={() => onHover({ day, hour })}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => onSelect({ day, hour })}
                    className={`cursor-pointer rounded-[3px] border ${MINI_TIER_CLASS[action][tier]} ${
                      isSelected
                        ? 'ring-1 ring-accent ring-offset-1 ring-offset-surface'
                        : isHover
                          ? 'ring-1 ring-accent/40'
                          : ''
                    }`}
                    style={{ width: MINI_CELL, height: MINI_CELL }}
                    aria-label={`${label} ${DAY_ORDER[day]} ${hourLabel(hour)}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[8px] uppercase tracking-[0.1em] text-text-faint">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Today's Rhythm" — hourly volume sparkline for the current day.
// Cursor-tracking vertical guide + dot + tooltip.
// ---------------------------------------------------------------------------

const SPARK_HEIGHT = 96;
const SPARK_PAD_TOP = 12;
const SPARK_PAD_BOTTOM = 24;
const SPARK_PAD_LEFT = 36;
const SPARK_PAD_RIGHT = 12;

function TodayRhythmStrip({ data }: { data: AgencyActivityData }) {
  const series = data.hourlyVolume;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    if (!svgRef.current) return;
    const update = () => {
      const w = svgRef.current?.parentElement?.clientWidth ?? 720;
      setWidth(Math.max(360, w));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svgRef.current.parentElement!);
    return () => observer.disconnect();
  }, []);

  const totals = useMemo(
    () => series.map((s) => s.sends + s.opens + s.replies + s.rescues),
    [series],
  );
  const maxVal = Math.max(1, ...totals);

  const innerWidth = Math.max(1, width - SPARK_PAD_LEFT - SPARK_PAD_RIGHT);
  const innerHeight = SPARK_HEIGHT - SPARK_PAD_TOP - SPARK_PAD_BOTTOM;

  const points = totals.map((v, i) => ({
    x: SPARK_PAD_LEFT + (innerWidth * i) / Math.max(1, totals.length - 1),
    y: SPARK_PAD_TOP + innerHeight * (1 - v / maxVal),
    value: v,
    hour: i,
  }));

  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const bottom = SPARK_PAD_TOP + innerHeight;
    const lp = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    return `${lp} L ${points[points.length - 1]!.x.toFixed(1)} ${bottom.toFixed(1)} L ${points[0]!.x.toFixed(1)} ${bottom.toFixed(1)} Z`;
  }, [points, innerHeight]);

  const onSvgMouseMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    if (x < SPARK_PAD_LEFT || x > width - SPARK_PAD_RIGHT) {
      setHoverIdx(null);
      return;
    }
    const ratio = (x - SPARK_PAD_LEFT) / innerWidth;
    const idx = Math.round(ratio * (totals.length - 1));
    setHoverIdx(Math.max(0, Math.min(totals.length - 1, idx)));
  };

  const yTicks = useMemo(() => {
    const steps = 4;
    const arr: Array<{ y: number; v: number }> = [];
    for (let i = 0; i <= steps; i += 1) {
      const v = Math.round((maxVal * i) / steps);
      const y = SPARK_PAD_TOP + innerHeight * (1 - i / steps);
      arr.push({ y, v });
    }
    return arr;
  }, [maxVal, innerHeight]);

  const xTicks = useMemo(() => {
    return [0, 6, 12, 18, 23].map((h) => ({
      x: SPARK_PAD_LEFT + (innerWidth * h) / 23,
      h,
    }));
  }, [innerWidth]);

  const totalToday = totals.reduce((s, n) => s + n, 0);
  const peakHour = totals.indexOf(maxVal);

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverRow = hoverIdx !== null ? series[hoverIdx] : null;

  return (
    <section className="rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-accent4" />
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-text-dim">
            Today's rhythm
          </h2>
          <span className="text-xs text-text-dim">
            · {fmtCountFull(totalToday)} events · peak {hourLabel(peakHour)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-text-dim">
          <LegendDot label="Sent" tone="bg-accent2" />
          <LegendDot label="Opened" tone="bg-accent" />
          <LegendDot label="Replied" tone="bg-accent/70" />
          <LegendDot label="Rescued" tone="bg-accent3" />
        </div>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height={SPARK_HEIGHT}
          viewBox={`0 0 ${width} ${SPARK_HEIGHT}`}
          onMouseMove={onSvgMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
          className="block"
        >
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F26522" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#F26522" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={SPARK_PAD_LEFT}
                x2={width - SPARK_PAD_RIGHT}
                y1={t.y}
                y2={t.y}
                stroke="#2a2a3a"
                strokeWidth={1}
                strokeDasharray="2 4"
                opacity={0.5}
              />
              <text
                x={SPARK_PAD_LEFT - 6}
                y={t.y + 3}
                textAnchor="end"
                fontSize={9}
                fill="#5a5a72"
                fontFamily="monospace"
              >
                {t.v}
              </text>
            </g>
          ))}

          <motion.path
            d={areaPath}
            fill="url(#sparkFill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
          <motion.path
            d={linePath}
            fill="none"
            stroke="#F26522"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.85, ease: 'easeOut' }}
          />

          {/* Dots — small, accent-tinted, faint outline */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={2.2}
              fill="#F26522"
              stroke="#13131d"
              strokeWidth={1}
              opacity={hoverIdx === i ? 1 : 0.7}
            />
          ))}

          {xTicks.map((t) => (
            <text
              key={t.h}
              x={t.x}
              y={SPARK_HEIGHT - 6}
              textAnchor="middle"
              fontSize={9}
              fill="#8888a0"
              fontFamily="monospace"
            >
              {String(t.h).padStart(2, '0')}
            </text>
          ))}

          {hoverPoint ? (
            <g>
              <line
                x1={hoverPoint.x}
                x2={hoverPoint.x}
                y1={SPARK_PAD_TOP}
                y2={SPARK_PAD_TOP + innerHeight}
                stroke="#F26522"
                strokeWidth={1}
                opacity={0.7}
                strokeDasharray="3 3"
              />
              <circle
                cx={hoverPoint.x}
                cy={hoverPoint.y}
                r={4.5}
                fill="#F26522"
                stroke="#13131d"
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>

        <AnimatePresence>
          {hoverPoint && hoverRow ? (
            <SparklineTooltip
              x={hoverPoint.x}
              y={hoverPoint.y}
              row={hoverRow}
              total={hoverPoint.value}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}

function SparklineTooltip({
  x,
  y,
  row,
  total,
}: {
  x: number;
  y: number;
  row: AgencyActivityData['hourlyVolume'][number];
  total: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.14 }}
      className="pointer-events-none absolute z-30 w-44 -translate-x-1/2 -translate-y-full rounded-xl border border-border-muted bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur-xl"
      style={{ left: x, top: y - 14 }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim">
          {row.hour}:00 today
        </span>
        <span className="font-mono text-[11px] tabular-nums text-text">
          {total}
        </span>
      </div>
      <div className="mt-2 space-y-1 text-[11px]">
        <BreakdownRow icon={Mail} tone="text-accent2" label="Sent" value={row.sends} />
        <BreakdownRow icon={MailOpen} tone="text-accent" label="Opened" value={row.opens} />
        <BreakdownRow icon={Reply} tone="text-accent" label="Replied" value={row.replies} />
        <BreakdownRow
          icon={ShieldAlert}
          tone="text-accent3"
          label="Rescued"
          value={row.rescues}
        />
      </div>
    </motion.div>
  );
}

function LegendDot({ label, tone }: { label: string; tone: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Right inspector — top active mailboxes + alerts ticker + selected-cell
// event detail (slides in when a cell is locked).
// ---------------------------------------------------------------------------

function InspectorRail({
  data,
  selectedCell,
  selectedEvents,
  onCloseSelection,
}: {
  data: AgencyActivityData;
  selectedCell: CellRef;
  selectedEvents: AgencyActivityData['events'];
  onCloseSelection: () => void;
}) {
  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {selectedCell ? (
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <SelectionPanel
              cell={selectedCell}
              events={selectedEvents}
              onClose={onCloseSelection}
            />
          </motion.div>
        ) : (
          <motion.div
            key="alerts"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <AlertsTicker alerts={data.alerts} />
          </motion.div>
        )}
      </AnimatePresence>

      <TopActiveMailboxes
        mailboxes={data.topActiveMailboxes}
        maxEvents={Math.max(...data.topActiveMailboxes.map((m) => m.eventsToday), 1)}
      />
    </div>
  );
}

function SelectionPanel({
  cell,
  events,
  onClose,
}: {
  cell: NonNullable<CellRef>;
  events: AgencyActivityData['events'];
  onClose: () => void;
}) {
  const sum = useMemo(() => events.length, [events]);
  const distribution = useMemo(() => {
    const counts: Record<ActionKind, number> = {
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescue: 0,
      bounce: 0,
    };
    events.forEach((e) => {
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    });
    return counts;
  }, [events]);

  return (
    <div className="rounded-2xl border border-accent/40 bg-surface/60 p-4 backdrop-blur-xl ring-1 ring-accent/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
              <Target className="h-3.5 w-3.5" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              Locked window
            </span>
          </div>
          <p className="mt-1.5 font-mono text-lg font-semibold text-text">
            {DAY_ORDER[cell.day]} · {hourLabel(cell.hour)}
          </p>
          <p className="text-xs text-text-dim">
            {sum} events surfaced from this window
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-full border border-border-muted bg-surface text-text-dim hover:bg-surface-2 hover:text-text"
          aria-label="Close selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <DistRow
          icon={Mail}
          tone="text-accent2"
          label="Sent"
          value={distribution.sent}
          total={sum}
        />
        <DistRow
          icon={MailOpen}
          tone="text-accent"
          label="Opened"
          value={distribution.opened}
          total={sum}
        />
        <DistRow
          icon={Reply}
          tone="text-accent"
          label="Replied"
          value={distribution.replied}
          total={sum}
        />
        <DistRow
          icon={Star}
          tone="text-accent4"
          label="Starred"
          value={distribution.starred}
          total={sum}
        />
        <DistRow
          icon={ShieldAlert}
          tone="text-accent3"
          label="Rescued"
          value={distribution.spam_rescue}
          total={sum}
        />
        <DistRow
          icon={AlertTriangle}
          tone="text-accent3"
          label="Bounce"
          value={distribution.bounce}
          total={sum}
        />
      </div>

      <p className="mt-3 text-[11px] text-text-faint">
        Inspector switched to selection view — click the cell again to
        unlock and bring back the alerts ticker.
      </p>
    </div>
  );
}

function DistRow({
  icon: Icon,
  tone,
  label,
  value,
  total,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-2">
      <div className="flex items-center justify-between text-[11px] text-text-dim">
        <span className="flex items-center gap-1.5">
          <Icon className={`h-3 w-3 ${tone}`} />
          {label}
        </span>
        <span className="font-mono tabular-nums text-text">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className={`h-full rounded-full ${
            tone === 'text-accent2'
              ? 'bg-accent2'
              : tone === 'text-accent4'
                ? 'bg-accent4'
                : tone === 'text-accent3'
                  ? 'bg-accent3'
                  : 'bg-accent'
          }`}
        />
      </div>
    </div>
  );
}

function AlertsTicker({ alerts }: { alerts: AgencyActivityData['alerts'] }) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface/40 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-accent3" />
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-text-dim">
            Recent alerts
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-faint">
          {alerts.length} active
        </span>
      </div>
      <div className="space-y-2">
        {alerts.length === 0 ? (
          <EmptyAlertsRow />
        ) : (
          alerts.map((a, i) => <AlertRow key={a.id} alert={a} delay={i * 0.04} />)
        )}
      </div>
    </div>
  );
}

function EmptyAlertsRow() {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/30 p-4 text-center">
      <CircleDot className="mx-auto h-4 w-4 text-text-faint" />
      <p className="mt-1 text-xs text-text-dim">No active alerts</p>
    </div>
  );
}

function AlertRow({
  alert,
  delay,
}: {
  alert: AgencyActivityData['alerts'][number];
  delay: number;
}) {
  const ring = SEVERITY_RING[alert.severity];
  const Icon =
    alert.kind === 'spike'
      ? TrendingUp
      : alert.kind === 'silence'
        ? PauseCircle
        : ShieldAlert;
  const kindLabel =
    alert.kind === 'spike'
      ? 'Spike'
      : alert.kind === 'silence'
        ? 'Silence'
        : 'Spam burst';
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay, ease: 'easeOut' }}
      className="rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2.5"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 grid h-6 w-6 place-items-center rounded-lg border ${ring}`}
        >
          <Icon className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[10px] text-text-dim">
            <span className="font-mono uppercase tracking-[0.14em]">
              {kindLabel}
            </span>
            <span className="font-mono tabular-nums">{alert.timeAgo}</span>
          </div>
          {alert.subClientName ? (
            <p className="mt-0.5 text-[11px] text-text">
              {alert.subClientName}
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-text-dim">{alert.message}</p>
        </div>
      </div>
    </motion.div>
  );
}

function TopActiveMailboxes({
  mailboxes,
  maxEvents,
}: {
  mailboxes: AgencyActivityData['topActiveMailboxes'];
  maxEvents: number;
}) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface/40 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-3.5 w-3.5 text-accent2" />
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-text-dim">
            Top active mailboxes
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-faint">today</span>
      </div>
      <div className="space-y-2">
        {mailboxes.length === 0 ? (
          <div className="rounded-xl border border-border-muted bg-surface-2/30 p-4 text-center text-xs text-text-dim">
            No mailbox activity yet
          </div>
        ) : (
          mailboxes.map((m, i) => (
            <MailboxRow
              key={m.mailboxId}
              mailbox={m}
              rank={i + 1}
              maxEvents={maxEvents}
              delay={0.04 * i}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MailboxRow({
  mailbox,
  rank,
  maxEvents,
  delay,
}: {
  mailbox: AgencyActivityData['topActiveMailboxes'][number];
  rank: number;
  maxEvents: number;
  delay: number;
}) {
  const pct = maxEvents === 0 ? 0 : Math.round((mailbox.eventsToday / maxEvents) * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: 'easeOut' }}
      className="rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border-muted bg-surface text-[11px] font-mono font-semibold text-text-dim">
            {String(rank).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-text">
              {mailbox.mailboxEmail}
            </p>
            <p className="truncate text-[11px] text-text-dim">
              {mailbox.subClientName}
            </p>
          </div>
        </div>
        <span className="font-mono text-[12px] tabular-nums text-accent2">
          {fmtCount(mailbox.eventsToday)}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, delay: delay + 0.1, ease: 'easeOut' }}
          className="h-full rounded-full bg-accent2"
        />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// EventDetailPanel — slides up under the main canvas when a cell is locked.
// ---------------------------------------------------------------------------

function EventDetailPanel({
  cell,
  events,
  onClose,
}: {
  cell: NonNullable<CellRef>;
  events: AgencyActivityData['events'];
  onClose: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: 18, height: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      className="overflow-hidden rounded-2xl border border-accent/40 bg-surface/50 backdrop-blur-xl ring-1 ring-accent/20"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted bg-surface/60 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
            <Zap className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-text-dim">
              Events in this window
            </h3>
            <p className="text-sm text-text">
              {DAY_ORDER[cell.day]} · {hourLabel(cell.hour)} ·{' '}
              <span className="text-text-dim">{events.length} events</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-full border border-border-muted bg-surface text-text-dim hover:bg-surface-2 hover:text-text"
          aria-label="Close event panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-5">
        {events.length === 0 ? (
          <div className="rounded-xl border border-border-muted bg-surface-2/30 p-6 text-center">
            <CircleDot className="mx-auto h-5 w-5 text-text-faint" />
            <p className="mt-2 text-xs text-text-dim">
              No events in this window
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {events.map((e, i) => (
              <EventCard key={`${e.id}-${i}`} event={e} delay={i * 0.03} />
            ))}
          </div>
        )}
      </div>
    </motion.section>
  );
}

function EventCard({
  event,
  delay,
}: {
  event: AgencyActivityData['events'][number];
  delay: number;
}) {
  const Icon = ACTION_ICON[event.kind];
  const ring = ACTION_RING[event.kind];
  const tone = ACTION_TONE[event.kind];
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay, ease: 'easeOut' }}
      className="flex items-start gap-2.5 rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2.5"
    >
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${ring}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-[10px] text-text-dim">
          <span className={`font-mono uppercase tracking-[0.14em] ${tone}`}>
            {ACTION_LABEL[event.kind]}
          </span>
          <span className="font-mono tabular-nums">{event.timeAgo}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-text">
          {event.mailboxEmail}
        </p>
        <p className="truncate text-[11px] text-text-dim">
          {event.subClientName} · {PROVIDER_LABEL[event.provider]}
        </p>
        <p className="mt-1 text-[11px] text-text-faint">{event.note}</p>
      </div>
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// Footer legend strip — explains the grid + interaction hints.
// ---------------------------------------------------------------------------

function FooterLegend() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="rounded-2xl border border-border-muted bg-surface/40 p-4 backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-dim">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <Grid3x3 className="h-3 w-3 text-accent" />
            <span className="font-mono uppercase tracking-[0.12em] text-text-faint">
              How to read
            </span>
          </span>
          <span>
            Each cell is one (day × hour) window over the past week. Darker
            =&nbsp;quieter, brighter =&nbsp;more events.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FootChip icon={Eye} label="Hover — quick breakdown" />
          <FootChip icon={Zap} label="Click — lock window + events" />
          <FootChip icon={MessageCircle} label="Mini-grids sync" />
        </div>
      </div>
    </motion.div>
  );
}

function FootChip({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/40 px-2.5 py-1 text-[10px] text-text-dim">
      <Icon className="h-3 w-3 text-accent" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Unused exports retained to keep the candidate file self-contained. (None
// at the moment — Building2 is referenced indirectly via the avatar slot
// placeholder if we ever bring sub-client breakdown rows in.)
// ---------------------------------------------------------------------------

// Keep Building2 reachable so an editor that auto-prunes unused imports
// doesn't yank it; we anticipate using it in a future "per sub-client mini
// row" extension of the TopActiveMailboxes list.
const _UNUSED_BUILDING2 = Building2;
void _UNUSED_BUILDING2;
// Trend down icon is reserved for an upcoming "weekly delta vs prior" pill.
const _UNUSED_TRENDDOWN = TrendingDown;
void _UNUSED_TRENDDOWN;
