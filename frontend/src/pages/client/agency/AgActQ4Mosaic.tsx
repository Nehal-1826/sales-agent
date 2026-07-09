import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  Flame,
  Inbox,
  Layers,
  Mail,
  MailX,
  MailOpen,
  Network,
  Reply,
  Search,
  Send,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
  X,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgActQ4Mosaic — Agency-tier ACTIVITY surface, design candidate #4
 * "Event Mosaic".
 *
 * The Agency Activity page is the live operations feed: every send, open,
 * reply, star, spam-rescue and bounce coming out of every mailbox under the
 * agency's roof. The Q4 design treats that feed as a *magazine front-page* —
 * a Pinterest / Behance / newsroom MASONRY of irregular event cards.
 *
 *   - A 4-column responsive masonry grid (`grid-auto-flow: dense` so cards
 *     fill gaps tightly). Mobile collapses to 1col so the irregularity reads
 *     on >=md only.
 *   - Card SIZE is data-driven:
 *       * FEATURE (2x2) — critical events: alerts, send spikes, milestone
 *         moments. Hero number, full event detail, sparkline.
 *       * MEDIUM (2x1)  — spam_rescue, bounce, and high-volume groups: peer
 *         interaction strip + mini bar.
 *       * COMPACT (1x1) — single ordinary events (sent / opened / replied /
 *         starred). Hero verb + tight metadata strip.
 *   - Each card carries a left-border accent in the action-kind palette
 *     (accent / accent2 / accent3 / accent4) and a status-tinted top hairline.
 *
 * Animations (framer-motion):
 *   - Mosaic mount: every card fades-up + drops in with a deterministic 1° to
 *     -1° rotation that settles to 0° over the 380ms entry, with a 36ms
 *     stagger across the visible cards.
 *   - Hover: -4px lift + accent shadow + 1.02 inner scale.
 *   - Click: accent ring; inspector cross-fades to the event detail. Feature
 *     cards expand inline (height grows) on click — siblings re-flow with
 *     `layout` FLIP.
 *   - Sort/Filter change: cards reorder with `layout` FLIP animation,
 *     wrapped in a `<LayoutGroup>` so siblings agree on the morph.
 *   - Inspector mini-sparkline: a cursor-tracking vertical guide + dot +
 *     tooltip, exactly the polish bar set by the radar / federation siblings.
 *
 * Distinct from sibling Q1 / Q2 / Q3 activity variants: this is NOT a
 * vertical river, NOT a calendar heatmap, NOT a swimlane timeline. The
 * IRREGULAR MASONRY of feature/medium/compact event cards is the signature.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * The :35001 preview harness mounts it prop-less; every value comes from
 * the inline MOCK const. The future live adapter passes `data` once an
 * agency-wide activity stream endpoint exists.
 *
 * Styling tokens (Tailwind, already wired): bg-bg, bg-surface, bg-surface-2,
 * text-text, text-text-dim, text-text-faint, border-border-muted, text-accent
 * (success / on), text-accent2 (info / accent), text-accent3 (danger / off),
 * text-accent4 (warning / pending). No new colours. lucide-react icons only.
 * No emojis.
 */

// ---------------------------------------------------------------------------
// Data shapes — SHARED across all four Agency activity variants
// ---------------------------------------------------------------------------
// Shape duplicated verbatim across all 4 Agency activity variants — keep in
// sync.

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
// MOCK data — Northwind Agency, 8 sub-clients, ~32 events, 24h volume series,
// 7-day x 24-hour heatmap, and four active alerts.
//
// The event mix is intentionally varied so the masonry shows off all three
// card sizes:
//   * FEATURE cards   — spike + spam_burst + silence alerts
//   * MEDIUM cards    — spam_rescue / bounce events and grouped activity
//   * COMPACT cards   — ordinary sent / opened / replied / starred events
// ---------------------------------------------------------------------------

const HOURLY_VOLUME: AgencyActivityData['hourlyVolume'] = [
  { hour: '00:00', sends: 142, opens: 88, replies: 12, rescues: 4 },
  { hour: '01:00', sends: 118, opens: 72, replies: 9, rescues: 3 },
  { hour: '02:00', sends: 96, opens: 60, replies: 7, rescues: 2 },
  { hour: '03:00', sends: 78, opens: 48, replies: 6, rescues: 2 },
  { hour: '04:00', sends: 64, opens: 40, replies: 5, rescues: 1 },
  { hour: '05:00', sends: 88, opens: 54, replies: 7, rescues: 2 },
  { hour: '06:00', sends: 124, opens: 78, replies: 11, rescues: 3 },
  { hour: '07:00', sends: 182, opens: 116, replies: 18, rescues: 5 },
  { hour: '08:00', sends: 244, opens: 154, replies: 24, rescues: 7 },
  { hour: '09:00', sends: 296, opens: 188, replies: 31, rescues: 8 },
  { hour: '10:00', sends: 332, opens: 212, replies: 35, rescues: 9 },
  { hour: '11:00', sends: 348, opens: 224, replies: 38, rescues: 10 },
  { hour: '12:00', sends: 312, opens: 200, replies: 33, rescues: 9 },
  { hour: '13:00', sends: 296, opens: 188, replies: 31, rescues: 8 },
  { hour: '14:00', sends: 318, opens: 204, replies: 34, rescues: 9 },
  { hour: '15:00', sends: 342, opens: 220, replies: 37, rescues: 10 },
  { hour: '16:00', sends: 358, opens: 230, replies: 40, rescues: 11 },
  { hour: '17:00', sends: 324, opens: 208, replies: 35, rescues: 9 },
  { hour: '18:00', sends: 268, opens: 172, replies: 28, rescues: 7 },
  { hour: '19:00', sends: 212, opens: 134, replies: 22, rescues: 6 },
  { hour: '20:00', sends: 184, opens: 116, replies: 18, rescues: 5 },
  { hour: '21:00', sends: 158, opens: 100, replies: 15, rescues: 4 },
  { hour: '22:00', sends: 132, opens: 84, replies: 12, rescues: 3 },
  { hour: '23:00', sends: 108, opens: 68, replies: 10, rescues: 3 },
];

function buildHeatmap(): AgencyActivityData['weeklyHeatmap'] {
  const out: AgencyActivityData['weeklyHeatmap'] = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      // Deterministic intensity: business hours stronger, weekend softer,
      // a small wave so neighbours don't read identical.
      const isWeekend = day === 0 || day === 6;
      const business = hour >= 8 && hour <= 19 ? 1 : 0.4;
      const wave = 0.5 + 0.5 * Math.sin((hour + day) * 0.6);
      const base = business * wave * (isWeekend ? 0.55 : 1);
      const intensity = Math.max(0, Math.min(1, base));
      out.push({
        day,
        hour,
        intensity,
        events: Math.round(intensity * 320 + (isWeekend ? 6 : 18)),
      });
    }
  }
  return out;
}

const WEEKLY_HEATMAP = buildHeatmap();

const EVENTS: AgencyActivityData['events'] = [
  {
    id: 'ev-001',
    kind: 'spam_rescue',
    timestamp: '2026-05-27T17:42:11Z',
    timeAgo: '11s ago',
    mailboxId: 'mb-helix-1',
    mailboxEmail: 'sara@helix.com',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'peer-014@warmpulse.peer',
    note: 'Rescued from Gmail Promotions tab — moved to Primary',
  },
  {
    id: 'ev-002',
    kind: 'replied',
    timestamp: '2026-05-27T17:41:58Z',
    timeAgo: '24s ago',
    mailboxId: 'mb-orion-3',
    mailboxEmail: 'mike@orionsales.com',
    provider: 'outlook',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'peer-027@warmpulse.peer',
    note: 'Peer replied to thread #4218 — 2-message exchange',
  },
  {
    id: 'ev-003',
    kind: 'sent',
    timestamp: '2026-05-27T17:41:33Z',
    timeAgo: '49s ago',
    mailboxId: 'mb-nimbus-2',
    mailboxEmail: 'alex@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'peer-008@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-004',
    kind: 'opened',
    timestamp: '2026-05-27T17:41:12Z',
    timeAgo: '1m ago',
    mailboxId: 'mb-quasar-1',
    mailboxEmail: 'pat@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'peer-031@warmpulse.peer',
    note: 'Peer opened delivered thread within 14m of receipt',
  },
  {
    id: 'ev-005',
    kind: 'bounce',
    timestamp: '2026-05-27T17:40:46Z',
    timeAgo: '1m ago',
    mailboxId: 'mb-atlas-1',
    mailboxEmail: 'outreach@atlas-bio.com',
    provider: 'smtp',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    peerEmail: 'peer-019@warmpulse.peer',
    note: 'Soft bounce — peer mailbox over quota, will retry in 6h',
  },
  {
    id: 'ev-006',
    kind: 'sent',
    timestamp: '2026-05-27T17:40:22Z',
    timeAgo: '2m ago',
    mailboxId: 'mb-helix-1',
    mailboxEmail: 'sara@helix.com',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'peer-022@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-007',
    kind: 'starred',
    timestamp: '2026-05-27T17:39:54Z',
    timeAgo: '2m ago',
    mailboxId: 'mb-lyra-1',
    mailboxEmail: 'theo@lyrastudio.co',
    provider: 'gmail',
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    subClientLogoChar: 'L',
    peerEmail: 'peer-007@warmpulse.peer',
    note: 'Peer starred received thread — strong engagement signal',
  },
  {
    id: 'ev-008',
    kind: 'opened',
    timestamp: '2026-05-27T17:39:28Z',
    timeAgo: '3m ago',
    mailboxId: 'mb-orion-1',
    mailboxEmail: 'jane@orionsales.com',
    provider: 'outlook',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'peer-005@warmpulse.peer',
    note: 'Peer opened delivered thread within 7m of receipt',
  },
  {
    id: 'ev-009',
    kind: 'sent',
    timestamp: '2026-05-27T17:39:04Z',
    timeAgo: '3m ago',
    mailboxId: 'mb-vega-1',
    mailboxEmail: 'kim@vegaoutbound.io',
    provider: 'gmail',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    peerEmail: 'peer-013@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-010',
    kind: 'spam_rescue',
    timestamp: '2026-05-27T17:38:42Z',
    timeAgo: '4m ago',
    mailboxId: 'mb-pixel-1',
    mailboxEmail: 'eli@pixelforge.io',
    provider: 'yahoo',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    peerEmail: 'peer-029@warmpulse.peer',
    note: 'Rescued from Yahoo Spam folder — moved to Inbox',
  },
  {
    id: 'ev-011',
    kind: 'replied',
    timestamp: '2026-05-27T17:38:18Z',
    timeAgo: '4m ago',
    mailboxId: 'mb-helix-2',
    mailboxEmail: 'dean@helix.com',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'peer-002@warmpulse.peer',
    note: 'Peer replied to thread #4191 — 3-message exchange',
  },
  {
    id: 'ev-012',
    kind: 'sent',
    timestamp: '2026-05-27T17:37:54Z',
    timeAgo: '5m ago',
    mailboxId: 'mb-nimbus-2',
    mailboxEmail: 'alex@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'peer-018@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-013',
    kind: 'opened',
    timestamp: '2026-05-27T17:37:21Z',
    timeAgo: '5m ago',
    mailboxId: 'mb-quasar-2',
    mailboxEmail: 'dana@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'peer-012@warmpulse.peer',
    note: 'Peer opened delivered thread within 9m of receipt',
  },
  {
    id: 'ev-014',
    kind: 'sent',
    timestamp: '2026-05-27T17:36:58Z',
    timeAgo: '6m ago',
    mailboxId: 'mb-orion-2',
    mailboxEmail: 'mike@orionsales.com',
    provider: 'outlook',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'peer-024@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-015',
    kind: 'starred',
    timestamp: '2026-05-27T17:36:34Z',
    timeAgo: '6m ago',
    mailboxId: 'mb-helix-1',
    mailboxEmail: 'sara@helix.com',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'peer-009@warmpulse.peer',
    note: 'Peer starred received thread — strong engagement signal',
  },
  {
    id: 'ev-016',
    kind: 'opened',
    timestamp: '2026-05-27T17:36:08Z',
    timeAgo: '7m ago',
    mailboxId: 'mb-lyra-1',
    mailboxEmail: 'theo@lyrastudio.co',
    provider: 'gmail',
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    subClientLogoChar: 'L',
    peerEmail: 'peer-016@warmpulse.peer',
    note: 'Peer opened delivered thread within 12m of receipt',
  },
  {
    id: 'ev-017',
    kind: 'replied',
    timestamp: '2026-05-27T17:35:42Z',
    timeAgo: '7m ago',
    mailboxId: 'mb-vega-1',
    mailboxEmail: 'kim@vegaoutbound.io',
    provider: 'gmail',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    peerEmail: 'peer-021@warmpulse.peer',
    note: 'Peer replied to thread #4144 — 2-message exchange',
  },
  {
    id: 'ev-018',
    kind: 'sent',
    timestamp: '2026-05-27T17:35:18Z',
    timeAgo: '8m ago',
    mailboxId: 'mb-pixel-1',
    mailboxEmail: 'eli@pixelforge.io',
    provider: 'yahoo',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    peerEmail: 'peer-006@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-019',
    kind: 'spam_rescue',
    timestamp: '2026-05-27T17:34:52Z',
    timeAgo: '8m ago',
    mailboxId: 'mb-orion-1',
    mailboxEmail: 'jane@orionsales.com',
    provider: 'outlook',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'peer-033@warmpulse.peer',
    note: 'Rescued from Outlook Junk folder — moved to Inbox',
  },
  {
    id: 'ev-020',
    kind: 'opened',
    timestamp: '2026-05-27T17:34:28Z',
    timeAgo: '9m ago',
    mailboxId: 'mb-nimbus-1',
    mailboxEmail: 'wendy@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'peer-010@warmpulse.peer',
    note: 'Peer opened delivered thread within 5m of receipt',
  },
  {
    id: 'ev-021',
    kind: 'sent',
    timestamp: '2026-05-27T17:34:02Z',
    timeAgo: '9m ago',
    mailboxId: 'mb-quasar-1',
    mailboxEmail: 'pat@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'peer-001@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-022',
    kind: 'bounce',
    timestamp: '2026-05-27T17:33:36Z',
    timeAgo: '10m ago',
    mailboxId: 'mb-atlas-1',
    mailboxEmail: 'outreach@atlas-bio.com',
    provider: 'smtp',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    peerEmail: 'peer-026@warmpulse.peer',
    note: 'Hard bounce — peer mailbox no longer exists, removing from pool',
  },
  {
    id: 'ev-023',
    kind: 'replied',
    timestamp: '2026-05-27T17:33:10Z',
    timeAgo: '10m ago',
    mailboxId: 'mb-helix-2',
    mailboxEmail: 'dean@helix.com',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'peer-028@warmpulse.peer',
    note: 'Peer replied to thread #4112 — 2-message exchange',
  },
  {
    id: 'ev-024',
    kind: 'opened',
    timestamp: '2026-05-27T17:32:48Z',
    timeAgo: '11m ago',
    mailboxId: 'mb-orion-3',
    mailboxEmail: 'lara@orionsales.com',
    provider: 'outlook',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'peer-015@warmpulse.peer',
    note: 'Peer opened delivered thread within 6m of receipt',
  },
  {
    id: 'ev-025',
    kind: 'sent',
    timestamp: '2026-05-27T17:32:20Z',
    timeAgo: '12m ago',
    mailboxId: 'mb-lyra-1',
    mailboxEmail: 'theo@lyrastudio.co',
    provider: 'gmail',
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    subClientLogoChar: 'L',
    peerEmail: 'peer-020@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-026',
    kind: 'starred',
    timestamp: '2026-05-27T17:31:54Z',
    timeAgo: '12m ago',
    mailboxId: 'mb-orion-2',
    mailboxEmail: 'mike@orionsales.com',
    provider: 'outlook',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    peerEmail: 'peer-003@warmpulse.peer',
    note: 'Peer starred received thread — strong engagement signal',
  },
  {
    id: 'ev-027',
    kind: 'sent',
    timestamp: '2026-05-27T17:31:28Z',
    timeAgo: '13m ago',
    mailboxId: 'mb-nimbus-2',
    mailboxEmail: 'alex@nimbuscloud.io',
    provider: 'gmail',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    peerEmail: 'peer-011@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-028',
    kind: 'opened',
    timestamp: '2026-05-27T17:31:02Z',
    timeAgo: '14m ago',
    mailboxId: 'mb-helix-1',
    mailboxEmail: 'sara@helix.com',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'peer-017@warmpulse.peer',
    note: 'Peer opened delivered thread within 11m of receipt',
  },
  {
    id: 'ev-029',
    kind: 'replied',
    timestamp: '2026-05-27T17:30:38Z',
    timeAgo: '14m ago',
    mailboxId: 'mb-vega-1',
    mailboxEmail: 'kim@vegaoutbound.io',
    provider: 'gmail',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    peerEmail: 'peer-004@warmpulse.peer',
    note: 'Peer replied to thread #4087 — 3-message exchange',
  },
  {
    id: 'ev-030',
    kind: 'sent',
    timestamp: '2026-05-27T17:30:14Z',
    timeAgo: '15m ago',
    mailboxId: 'mb-quasar-2',
    mailboxEmail: 'dana@quasargrowth.com',
    provider: 'outlook',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    peerEmail: 'peer-023@warmpulse.peer',
    note: 'Warmup send dispatched via SMTP queue',
  },
  {
    id: 'ev-031',
    kind: 'spam_rescue',
    timestamp: '2026-05-27T17:29:48Z',
    timeAgo: '15m ago',
    mailboxId: 'mb-helix-2',
    mailboxEmail: 'dean@helix.com',
    provider: 'gmail',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    peerEmail: 'peer-030@warmpulse.peer',
    note: 'Rescued from Gmail Spam folder — moved to Primary',
  },
  {
    id: 'ev-032',
    kind: 'opened',
    timestamp: '2026-05-27T17:29:22Z',
    timeAgo: '16m ago',
    mailboxId: 'mb-pixel-1',
    mailboxEmail: 'eli@pixelforge.io',
    provider: 'yahoo',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    peerEmail: 'peer-025@warmpulse.peer',
    note: 'Peer opened delivered thread within 8m of receipt',
  },
];

const TOP_ACTIVE: AgencyActivityData['topActiveMailboxes'] = [
  {
    mailboxId: 'mb-helix-1',
    mailboxEmail: 'sara@helix.com',
    subClientName: 'Helix Outreach',
    eventsToday: 248,
  },
  {
    mailboxId: 'mb-orion-3',
    mailboxEmail: 'mike@orionsales.com',
    subClientName: 'Orion Sales',
    eventsToday: 224,
  },
  {
    mailboxId: 'mb-nimbus-2',
    mailboxEmail: 'alex@nimbuscloud.io',
    subClientName: 'Nimbus Cloud',
    eventsToday: 196,
  },
  {
    mailboxId: 'mb-quasar-1',
    mailboxEmail: 'pat@quasargrowth.com',
    subClientName: 'Quasar Growth',
    eventsToday: 184,
  },
  {
    mailboxId: 'mb-helix-2',
    mailboxEmail: 'dean@helix.com',
    subClientName: 'Helix Outreach',
    eventsToday: 172,
  },
  {
    mailboxId: 'mb-lyra-1',
    mailboxEmail: 'theo@lyrastudio.co',
    subClientName: 'Lyra Studio',
    eventsToday: 158,
  },
  {
    mailboxId: 'mb-orion-1',
    mailboxEmail: 'jane@orionsales.com',
    subClientName: 'Orion Sales',
    eventsToday: 142,
  },
  {
    mailboxId: 'mb-vega-1',
    mailboxEmail: 'kim@vegaoutbound.io',
    subClientName: 'Vega Outbound',
    eventsToday: 128,
  },
];

const ALERTS: AgencyActivityData['alerts'] = [
  {
    id: 'al-001',
    kind: 'spike',
    message: 'Helix Outreach saw 3.2x normal send volume in the last hour',
    timeAgo: '4m ago',
    severity: 'critical',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
  },
  {
    id: 'al-002',
    kind: 'spam_burst',
    message: 'Atlas Bio recorded 6 bounces in 12min — peer pool tightening',
    timeAgo: '12m ago',
    severity: 'warn',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
  },
  {
    id: 'al-003',
    kind: 'silence',
    message: 'Pixel Forge mailbox eli@pixelforge.io idle for 38min',
    timeAgo: '38m ago',
    severity: 'warn',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
  },
  {
    id: 'al-004',
    kind: 'spike',
    message: 'Orion Sales engagement up 42% versus 7d baseline',
    timeAgo: '1h ago',
    severity: 'info',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
  },
];

const MOCK: AgencyActivityData = {
  workspace: {
    name: 'Northwind Agency',
    subClientCount: 8,
    mailboxCount: 86,
  },
  kpis: {
    eventsToday: 4824,
    sendsToday: 2412,
    opensToday: 1538,
    repliesToday: 246,
    spamRescuesToday: 68,
    peerInteractionsToday: 3194,
    eventsLastHour: 312,
    avgEventsPerMin: 5.2,
  },
  events: EVENTS,
  hourlyVolume: HOURLY_VOLUME,
  weeklyHeatmap: WEEKLY_HEATMAP,
  topActiveMailboxes: TOP_ACTIVE,
  alerts: ALERTS,
};

/**
 * Skeleton fallback for the future live adapter — used when the API hasn't
 * loaded yet (or has failed) so we don't render mock data the user might
 * mistake for their own. Every collection is empty.
 */
export const AGENCY_ACTIVITY_SKELETON_Q4: AgencyActivityData = {
  workspace: {
    name: 'Your agency',
    subClientCount: 0,
    mailboxCount: 0,
  },
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
// Theme + palette helpers
// ---------------------------------------------------------------------------

/**
 * Hex equivalents of the Tailwind tokens. Used inside SVGs where the Tailwind
 * arbitrary-value classes can't reach. Kept in lockstep with tailwind.config.ts
 * — see sibling Agency variant files for the established palette.
 */
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

type AccentToken = 'accent' | 'accent2' | 'accent3' | 'accent4';

/**
 * Each action kind maps to a single accent token. The palette stays inside the
 * shared Tailwind palette — no new colours introduced.
 *
 *   - sent        → accent2 (info / outbound dispatch)
 *   - opened      → accent  (positive / engagement)
 *   - replied     → accent  (positive / engagement — strongest action)
 *   - starred     → accent4 (warning-yellow / "noticed", premium tint)
 *   - spam_rescue → accent3 (danger / corrective)
 *   - bounce      → accent3 (danger / failure)
 */
const ACTION_ACCENT: Record<ActionKind, AccentToken> = {
  sent: 'accent2',
  opened: 'accent',
  replied: 'accent',
  starred: 'accent4',
  spam_rescue: 'accent3',
  bounce: 'accent3',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  sent: 'Sent',
  opened: 'Opened',
  replied: 'Replied',
  starred: 'Starred',
  spam_rescue: 'Spam rescued',
  bounce: 'Bounced',
};

const ACTION_VERB: Record<ActionKind, string> = {
  sent: 'sent warmup',
  opened: 'opened thread',
  replied: 'replied to thread',
  starred: 'starred thread',
  spam_rescue: 'rescued from spam',
  bounce: 'bounce returned',
};

const ACTION_ICON: Record<ActionKind, typeof Send> = {
  sent: Send,
  opened: MailOpen,
  replied: Reply,
  starred: Star,
  spam_rescue: ShieldAlert,
  bounce: MailX,
};

const ACCENT_TEXT: Record<AccentToken, string> = {
  accent: 'text-accent',
  accent2: 'text-accent2',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
};

const ACCENT_BG_SOFT: Record<AccentToken, string> = {
  accent: 'bg-accent/10',
  accent2: 'bg-accent2/10',
  accent3: 'bg-accent3/10',
  accent4: 'bg-accent4/10',
};

const ACCENT_BG_CHIP: Record<AccentToken, string> = {
  accent: 'bg-accent/15',
  accent2: 'bg-accent2/15',
  accent3: 'bg-accent3/15',
  accent4: 'bg-accent4/15',
};

const ACCENT_BORDER_SOFT: Record<AccentToken, string> = {
  accent: 'border-accent/30',
  accent2: 'border-accent2/30',
  accent3: 'border-accent3/30',
  accent4: 'border-accent4/30',
};

const ACCENT_RING: Record<AccentToken, string> = {
  accent: 'ring-accent/40',
  accent2: 'ring-accent2/40',
  accent3: 'ring-accent3/40',
  accent4: 'ring-accent4/40',
};

const ACCENT_FROM: Record<AccentToken, string> = {
  accent: 'from-accent/25',
  accent2: 'from-accent2/25',
  accent3: 'from-accent3/25',
  accent4: 'from-accent4/25',
};

const ACCENT_VIA: Record<AccentToken, string> = {
  accent: 'via-accent/10',
  accent2: 'via-accent2/10',
  accent3: 'via-accent3/10',
  accent4: 'via-accent4/10',
};

const ACCENT_BORDER_LEFT: Record<AccentToken, string> = {
  accent: 'border-l-accent',
  accent2: 'border-l-accent2',
  accent3: 'border-l-accent3',
  accent4: 'border-l-accent4',
};

const ACCENT_SHADOW: Record<AccentToken, string> = {
  accent: 'shadow-[0_8px_30px_rgba(242, 101, 34,0.18)]',
  accent2: 'shadow-[0_8px_30px_rgba(255, 138, 75,0.18)]',
  accent3: 'shadow-[0_8px_30px_rgba(255,107,74,0.18)]',
  accent4: 'shadow-[0_8px_30px_rgba(255,213,79,0.18)]',
};

const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  spike: 'Volume spike',
  silence: 'Silence detected',
  spam_burst: 'Spam burst',
};

const ALERT_KIND_ICON: Record<AlertKind, typeof AlertTriangle> = {
  spike: TrendingUp,
  silence: AlertCircle,
  spam_burst: Siren,
};

const ALERT_SEVERITY_CLASS: Record<AlertSeverity, string> = {
  info: 'border-accent2/40 bg-accent2/10 text-accent2',
  warn: 'border-accent4/40 bg-accent4/10 text-accent4',
  critical: 'border-accent3/40 bg-accent3/10 text-accent3',
};

const ALERT_SEVERITY_DOT: Record<AlertSeverity, string> = {
  info: 'bg-accent2',
  warn: 'bg-accent4',
  critical: 'bg-accent3',
};

// ---------------------------------------------------------------------------
// Sizing logic — what makes a card "feature", "medium" or "compact"?
// ---------------------------------------------------------------------------

type CardSize = 'feature' | 'medium' | 'compact';

interface MosaicTile {
  kind: 'event' | 'group' | 'alert';
  id: string;
  size: CardSize;
  /** Single ordinary event (kind === 'event'). */
  event?: AgencyActivityData['events'][number];
  /** Grouped tight-window events from the same mailbox (kind === 'group'). */
  group?: {
    mailboxId: string;
    mailboxEmail: string;
    subClientName: string;
    subClientLogoChar: string;
    provider: MailboxProvider;
    events: AgencyActivityData['events'];
  };
  /** Alert event (kind === 'alert'). */
  alert?: AgencyActivityData['alerts'][number];
}

/**
 * Resolve the visual card size for a single event:
 *   - spam_burst alert → feature
 *   - spike      alert → feature
 *   - silence    alert → medium
 *   - spam_rescue / bounce events → medium
 *   - 5+ events from same mailbox in a tight window → grouped medium
 *   - single ordinary event → compact
 *
 * Promotion happens in `buildMosaic` once we've decided which events to
 * group; this helper just resolves the simple per-event case.
 */
function sizeFromEvent(ev: AgencyActivityData['events'][number]): CardSize {
  if (ev.kind === 'spam_rescue' || ev.kind === 'bounce') return 'medium';
  return 'compact';
}

function sizeFromAlert(al: AgencyActivityData['alerts'][number]): CardSize {
  if (al.kind === 'spike' || al.kind === 'spam_burst') return 'feature';
  return 'medium';
}

/**
 * Build the mosaic tile list:
 *   1. Inject alerts as feature/medium tiles (sized by severity & kind).
 *   2. Detect tight-window groups: 5+ events from the same mailbox within a
 *      ~3min window. Promote them into a grouped medium tile and drop their
 *      constituent events.
 *   3. Map remaining events 1:1 to event tiles using `sizeFromEvent`.
 *
 * The output is ordered newest-first by the first contained event's
 * timestamp (alerts respect their own ago label so they slot near the top).
 */
function buildMosaic(d: AgencyActivityData): MosaicTile[] {
  const tiles: MosaicTile[] = [];

  // 1) Alerts first — they get top-of-mosaic priority. We render up to 4 to
  // avoid drowning the canvas; the remainder live in the inspector ticker.
  d.alerts.slice(0, 4).forEach((al) => {
    tiles.push({
      kind: 'alert',
      id: `alert-${al.id}`,
      size: sizeFromAlert(al),
      alert: al,
    });
  });

  // 2) Tight-window group detection.
  // Bucket events by mailboxId, then walk them in order and collect runs of
  // 5+ where the first and last event are within 180s.
  const groupedEventIds = new Set<string>();
  const buckets = new Map<string, AgencyActivityData['events']>();
  for (const ev of d.events) {
    const arr = buckets.get(ev.mailboxId) ?? [];
    arr.push(ev);
    buckets.set(ev.mailboxId, arr);
  }
  buckets.forEach((arr, mailboxId) => {
    if (arr.length < 5) return;
    // Already newest-first in the source mock — sort defensively.
    const sorted = [...arr].sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
    );
    const earliest = new Date(sorted[sorted.length - 1]!.timestamp).getTime();
    const latest = new Date(sorted[0]!.timestamp).getTime();
    if (Math.abs(latest - earliest) > 1000 * 60 * 60) return; // 60min window
    if (sorted.length < 5) return;
    const sample = sorted[0]!;
    tiles.push({
      kind: 'group',
      id: `group-${mailboxId}`,
      size: 'medium',
      group: {
        mailboxId,
        mailboxEmail: sample.mailboxEmail,
        subClientName: sample.subClientName,
        subClientLogoChar: sample.subClientLogoChar,
        provider: sample.provider,
        events: sorted,
      },
    });
    sorted.forEach((ev) => groupedEventIds.add(ev.id));
  });

  // 3) Remaining single events.
  d.events.forEach((ev) => {
    if (groupedEventIds.has(ev.id)) return;
    tiles.push({
      kind: 'event',
      id: `event-${ev.id}`,
      size: sizeFromEvent(ev),
      event: ev,
    });
  });

  return tiles;
}

// ---------------------------------------------------------------------------
// Sort + filter — drives the toolbar above the mosaic
// ---------------------------------------------------------------------------

type SortMode = 'newest' | 'most_critical' | 'by_subclient';
type FilterMode =
  | 'all'
  | 'sent'
  | 'opened'
  | 'replied'
  | 'starred'
  | 'spam_rescue'
  | 'bounce'
  | 'alerts';

const SORT_LABEL: Record<SortMode, string> = {
  newest: 'Newest',
  most_critical: 'Most critical',
  by_subclient: 'By sub-client',
};

const FILTER_LABEL: Record<FilterMode, string> = {
  all: 'All',
  sent: 'Sent',
  opened: 'Opened',
  replied: 'Replied',
  starred: 'Starred',
  spam_rescue: 'Spam rescues',
  bounce: 'Bounces',
  alerts: 'Alerts',
};

const FILTER_ICON: Record<FilterMode, typeof Mail> = {
  all: Layers,
  sent: Send,
  opened: MailOpen,
  replied: Reply,
  starred: Star,
  spam_rescue: ShieldAlert,
  bounce: MailX,
  alerts: AlertTriangle,
};

/** Newest-first by the first contained event timestamp (or alert ago). */
function tileSortKey(tile: MosaicTile): number {
  if (tile.kind === 'event') {
    return new Date(tile.event!.timestamp).getTime();
  }
  if (tile.kind === 'group') {
    return new Date(tile.group!.events[0]!.timestamp).getTime();
  }
  // Alerts get a synthetic recency by parsing minutes-ago strings.
  const ago = tile.alert!.timeAgo;
  const m = ago.match(/(\d+)\s*(s|m|h|d)/);
  if (!m) return Date.now();
  const v = Number(m[1]);
  const u = m[2];
  const ms =
    u === 's'
      ? v * 1000
      : u === 'm'
      ? v * 60 * 1000
      : u === 'h'
      ? v * 60 * 60 * 1000
      : v * 24 * 60 * 60 * 1000;
  return Date.now() - ms;
}

/** Severity / volume score so "most critical" can rank. */
function tileCriticalScore(tile: MosaicTile): number {
  if (tile.kind === 'alert') {
    if (tile.alert!.severity === 'critical') return 100;
    if (tile.alert!.severity === 'warn') return 80;
    return 60;
  }
  if (tile.kind === 'group') return 70;
  const ev = tile.event!;
  if (ev.kind === 'bounce') return 55;
  if (ev.kind === 'spam_rescue') return 45;
  if (ev.kind === 'replied') return 30;
  if (ev.kind === 'starred') return 28;
  if (ev.kind === 'opened') return 18;
  return 10; // sent
}

function tileSubClient(tile: MosaicTile): string {
  if (tile.kind === 'event') return tile.event!.subClientName;
  if (tile.kind === 'group') return tile.group!.subClientName;
  return tile.alert?.subClientName ?? 'Agency';
}

/**
 * Apply filter + sort to the tile list.
 *
 * Filtering is "by kind" — selecting "Replied" hides everything except event
 * tiles (and groups containing) replied events. "Alerts" shows only alert
 * tiles. "All" passes everything.
 */
function applySortFilter(
  tiles: MosaicTile[],
  sort: SortMode,
  filter: FilterMode,
  query: string,
): MosaicTile[] {
  let out = tiles;
  if (filter !== 'all') {
    if (filter === 'alerts') {
      out = out.filter((t) => t.kind === 'alert');
    } else {
      out = out.filter((t) => {
        if (t.kind === 'event') return t.event!.kind === filter;
        if (t.kind === 'group')
          return t.group!.events.some((e) => e.kind === filter);
        return false;
      });
    }
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    out = out.filter((t) => {
      if (t.kind === 'event')
        return (
          t.event!.mailboxEmail.toLowerCase().includes(q) ||
          t.event!.subClientName.toLowerCase().includes(q) ||
          t.event!.note.toLowerCase().includes(q)
        );
      if (t.kind === 'group')
        return (
          t.group!.mailboxEmail.toLowerCase().includes(q) ||
          t.group!.subClientName.toLowerCase().includes(q)
        );
      return (
        (t.alert!.message ?? '').toLowerCase().includes(q) ||
        (t.alert!.subClientName ?? '').toLowerCase().includes(q)
      );
    });
  }
  if (sort === 'newest') {
    out = [...out].sort((a, b) => tileSortKey(b) - tileSortKey(a));
  } else if (sort === 'most_critical') {
    out = [...out].sort((a, b) => tileCriticalScore(b) - tileCriticalScore(a));
  } else {
    out = [...out].sort((a, b) => tileSubClient(a).localeCompare(tileSubClient(b)));
  }
  return out;
}

/**
 * Resolve the CSS grid span for a card size.
 *
 *   feature → 2 cols x 2 rows (or full-width when one tile expands inline).
 *   medium  → 2 cols x 1 row.
 *   compact → 1 col x 1 row.
 *
 * Mobile (default → md) collapses to a single column; the mosaic irregularity
 * reads only on >=md screens where there's room.
 */
function spanClasses(size: CardSize, expanded: boolean): string {
  if (expanded) {
    return 'md:col-span-4 md:row-span-3';
  }
  switch (size) {
    case 'feature':
      return 'md:col-span-2 md:row-span-2';
    case 'medium':
      return 'md:col-span-2 md:row-span-1';
    default:
      return 'md:col-span-1 md:row-span-1';
  }
}

/**
 * Deterministic tiny rotation (-1° to +1°) for mount entry — looks "settled"
 * but unforced. Indexed by tile id hash so the same tile always lands the
 * same way on re-render.
 */
function entryRotationDeg(id: string, idx: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  const sign = (h + idx) % 2 === 0 ? 1 : -1;
  const mag = ((h >>> 3) % 7) / 7; // 0..1
  return sign * (0.4 + mag * 0.6); // -1.0..-0.4 or 0.4..1.0
}

// ---------------------------------------------------------------------------
// Compact pieces — KPI tile, sort/filter chips, mini meta strip
// ---------------------------------------------------------------------------

interface KpiTileProps {
  Icon: typeof Activity;
  label: string;
  value: string;
  accent: AccentToken;
  hint?: string;
  delta?: { value: number; positive: boolean };
}

function KpiTile({ Icon, label, value, accent, hint, delta }: KpiTileProps): JSX.Element {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className={`relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-3 py-2.5 ring-1 ring-transparent transition-colors hover:ring-border-muted`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px ${ACCENT_BG_CHIP[accent]}`}
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg ${ACCENT_BG_CHIP[accent]} ${ACCENT_TEXT[accent]}`}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        {delta ? (
          <span
            className={`flex items-center gap-1 text-[10px] font-medium ${
              delta.positive ? 'text-accent' : 'text-accent3'
            }`}
          >
            {delta.positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta.value).toFixed(1)}%
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-wider text-text-faint">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-xl font-semibold text-text">{value}</span>
        {hint ? <span className="text-[10px] text-text-faint">{hint}</span> : null}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// PageHeader — agency identity, KPI strip, MoM chip
// ---------------------------------------------------------------------------

function PageHeader({ data }: { data: AgencyActivityData }): JSX.Element {
  const k = data.kpis;
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-4"
    >
      {/* Top identity bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-accent/30 to-accent2/25 ring-1 ring-border-muted">
            <Building2 className="h-5 w-5 text-text" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-text-faint">
              <span>Agency</span>
              <span className="h-1 w-1 rounded-full bg-text-faint/60" aria-hidden />
              <span>Activity stream</span>
            </div>
            <div className="flex items-center gap-2 truncate">
              <span className="truncate text-lg font-semibold text-text">
                {data.workspace.name}
              </span>
              <span className="grid h-5 place-items-center rounded-full border border-accent2/40 bg-accent2/10 px-2 text-[10px] font-medium text-accent2">
                us-east-1
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="grid h-9 place-items-center rounded-full border border-accent/40 bg-accent/10 px-3 text-[11px] font-medium text-accent">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono text-[12px]">+12.8%</span>
              <span className="text-text-faint">MoM</span>
            </span>
          </div>
          <div className="grid h-9 place-items-center rounded-full border border-border-muted bg-surface px-3 text-[11px] text-text-dim">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono text-[12px] text-text">
                {k.avgEventsPerMin.toFixed(1)} / min
              </span>
              <span>avg</span>
            </span>
          </div>
          <div className="grid h-9 place-items-center rounded-full border border-border-muted bg-surface px-3 text-[11px] text-text-dim">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono text-[12px] text-text">
                {data.workspace.subClientCount}
              </span>
              <span>sub-clients</span>
              <span className="text-text-faint">·</span>
              <span className="font-mono text-[12px] text-text">
                {data.workspace.mailboxCount}
              </span>
              <span>mailboxes</span>
            </span>
          </div>
        </div>
      </div>

      {/* KPI strip — eight tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <KpiTile
          Icon={Activity}
          label="Events today"
          value={formatNumber(k.eventsToday)}
          accent="accent"
          delta={{ value: 12.8, positive: true }}
        />
        <KpiTile
          Icon={Send}
          label="Sends"
          value={formatNumber(k.sendsToday)}
          accent="accent2"
          delta={{ value: 9.4, positive: true }}
        />
        <KpiTile
          Icon={MailOpen}
          label="Opens"
          value={formatNumber(k.opensToday)}
          accent="accent"
          delta={{ value: 6.1, positive: true }}
        />
        <KpiTile
          Icon={Reply}
          label="Replies"
          value={formatNumber(k.repliesToday)}
          accent="accent"
          delta={{ value: 14.2, positive: true }}
        />
        <KpiTile
          Icon={ShieldAlert}
          label="Spam rescues"
          value={formatNumber(k.spamRescuesToday)}
          accent="accent3"
          delta={{ value: 4.6, positive: false }}
        />
        <KpiTile
          Icon={Network}
          label="Peer interactions"
          value={formatNumber(k.peerInteractionsToday)}
          accent="accent2"
          delta={{ value: 8.7, positive: true }}
        />
        <KpiTile
          Icon={Zap}
          label="Last hour"
          value={formatNumber(k.eventsLastHour)}
          accent="accent4"
          delta={{ value: 22.1, positive: true }}
        />
        <KpiTile
          Icon={Flame}
          label="Avg / minute"
          value={k.avgEventsPerMin.toFixed(1)}
          accent="accent4"
          hint="rolling 1h"
        />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sort + Filter Toolbar
// ---------------------------------------------------------------------------

interface SortFilterBarProps {
  sort: SortMode;
  filter: FilterMode;
  query: string;
  onSort: (s: SortMode) => void;
  onFilter: (f: FilterMode) => void;
  onQuery: (q: string) => void;
  visibleCount: number;
  totalCount: number;
}

function SortFilterBar({
  sort,
  filter,
  query,
  onSort,
  onFilter,
  onQuery,
  visibleCount,
  totalCount,
}: SortFilterBarProps): JSX.Element {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filters: FilterMode[] = [
    'all',
    'sent',
    'opened',
    'replied',
    'starred',
    'spam_rescue',
    'bounce',
    'alerts',
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.06 }}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-muted bg-surface/70 px-3 py-2 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-faint">
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Filter
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {filters.map((f) => {
            const Icon = FILTER_ICON[f];
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => onFilter(f)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  active
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
                }`}
                aria-pressed={active}
              >
                <Icon className="h-3 w-3" />
                <span>{FILTER_LABEL[f]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search events, mailboxes, sub-clients"
            className="h-8 w-64 rounded-full border border-border-muted bg-surface-2 pl-8 pr-3 text-[12px] text-text placeholder:text-text-faint focus:border-accent2/50 focus:outline-none"
          />
        </div>
        <div ref={sortRef} className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-3 text-[11px] text-text-dim hover:text-text"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Sort:</span>
            <span className="font-medium text-text">{SORT_LABEL[sort]}</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${sortOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          <AnimatePresence>
            {sortOpen ? (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.14 }}
                className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-border-muted bg-surface shadow-lg"
              >
                {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      onSort(s);
                      setSortOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] transition-colors ${
                      s === sort
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-dim hover:bg-surface-2 hover:text-text'
                    }`}
                  >
                    <span>{SORT_LABEL[s]}</span>
                    {s === sort ? (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    ) : null}
                  </button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="hidden h-8 items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-3 text-[11px] text-text-dim sm:flex">
          <span className="font-mono text-text">{visibleCount}</span>
          <span className="text-text-faint">/</span>
          <span className="font-mono text-text-faint">{totalCount}</span>
          <span>tiles</span>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Mini visual pieces — sparkline, peer pulse, provider chip, logo disc
// ---------------------------------------------------------------------------

interface MiniSparklineProps {
  series: number[];
  accent: AccentToken;
  width?: number;
  height?: number;
}

function MiniSparkline({
  series,
  accent,
  width = 120,
  height = 34,
}: MiniSparklineProps): JSX.Element {
  const max = Math.max(...series, 1);
  const min = Math.min(...series);
  const span = Math.max(max - min, 1);
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const path = series
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const lastX = (series.length - 1) * step;
  const lastY = height - ((series[series.length - 1]! - min) / span) * height;
  const accentColor = HEX[accent];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient
          id={`spark-${accent}-${series.length}-${series[0]}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.45" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        d={`${path} L ${width.toFixed(1)} ${height} L 0 ${height} Z`}
        fill={`url(#spark-${accent}-${series.length}-${series[0]})`}
        stroke="none"
      />
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        d={path}
        stroke={accentColor}
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
      />
      <motion.circle
        initial={{ opacity: 0, r: 0 }}
        animate={{ opacity: 1, r: 2.2 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        cx={lastX}
        cy={lastY}
        fill={accentColor}
      />
    </svg>
  );
}

function PeerPulse({ accent }: { accent: AccentToken }): JSX.Element {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
      <motion.span
        className={`absolute inset-0 rounded-full ${ACCENT_BG_CHIP[accent]}`}
        animate={{ scale: [1, 1.7, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
      />
      <span className={`relative h-2 w-2 rounded-full ${ACCENT_TEXT[accent]} bg-current`} />
    </span>
  );
}

function ProviderChip({
  provider,
  size = 'sm',
}: {
  provider: MailboxProvider;
  size?: 'sm' | 'xs';
}): JSX.Element {
  const cls =
    size === 'xs'
      ? 'h-4 px-1.5 text-[9px]'
      : 'h-5 px-2 text-[10px]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 text-text-dim ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-text-faint/80" aria-hidden />
      {PROVIDER_LABEL[provider]}
    </span>
  );
}

function LogoDisc({
  ch,
  accent,
  size = 'md',
}: {
  ch: string;
  accent: AccentToken;
  size?: 'sm' | 'md' | 'lg';
}): JSX.Element {
  const sz =
    size === 'lg'
      ? 'h-10 w-10 text-base'
      : size === 'sm'
      ? 'h-6 w-6 text-[10px]'
      : 'h-8 w-8 text-[11px]';
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl font-semibold tracking-wider text-text ring-1 ring-border-muted ${sz} ${ACCENT_BG_CHIP[accent]}`}
      aria-hidden
    >
      {ch}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Event Card — feature / medium / compact variants
// ---------------------------------------------------------------------------

interface EventCardProps {
  tile: MosaicTile;
  index: number;
  selected: boolean;
  expanded: boolean;
  onSelect: (id: string) => void;
  onExpand: (id: string | null) => void;
  /** Index modulo a small ring drives the entry-stagger delay. */
  entryDelay: number;
}

function EventCard(props: EventCardProps): JSX.Element {
  const { tile, index, selected, expanded, onSelect, onExpand, entryDelay } = props;
  const rot = entryRotationDeg(tile.id, index);

  const isExpandable = tile.size === 'feature' || tile.kind === 'alert';

  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onSelect(tile.id);
      if (isExpandable) {
        onExpand(expanded ? null : tile.id);
      }
    },
    [tile.id, expanded, isExpandable, onSelect, onExpand],
  );

  if (tile.kind === 'alert') {
    return (
      <AlertCard
        tile={tile}
        index={index}
        selected={selected}
        expanded={expanded}
        onClick={handleClick}
        entryDelay={entryDelay}
        rot={rot}
      />
    );
  }

  if (tile.kind === 'group') {
    return (
      <GroupCard
        tile={tile}
        index={index}
        selected={selected}
        onClick={handleClick}
        entryDelay={entryDelay}
        rot={rot}
      />
    );
  }

  // Single event card — branch on size.
  if (tile.size === 'medium') {
    return (
      <EventMediumCard
        tile={tile}
        index={index}
        selected={selected}
        onClick={handleClick}
        entryDelay={entryDelay}
        rot={rot}
      />
    );
  }

  return (
    <EventCompactCard
      tile={tile}
      index={index}
      selected={selected}
      onClick={handleClick}
      entryDelay={entryDelay}
      rot={rot}
    />
  );
}

// ---------------------------------------------------------------------------
// AlertCard — feature/medium variant for alert tiles
// ---------------------------------------------------------------------------

interface AlertCardProps {
  tile: MosaicTile;
  index: number;
  selected: boolean;
  expanded: boolean;
  onClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  entryDelay: number;
  rot: number;
}

function AlertCard({
  tile,
  selected,
  expanded,
  onClick,
  entryDelay,
  rot,
}: AlertCardProps): JSX.Element {
  const al = tile.alert!;
  const accent: AccentToken =
    al.severity === 'critical' ? 'accent3' : al.severity === 'warn' ? 'accent4' : 'accent2';
  const Icon = ALERT_KIND_ICON[al.kind];
  const HeroSeries = useMemo(
    () => HOURLY_VOLUME.slice(-12).map((h) => h.sends),
    [],
  );
  const heroNumber =
    al.kind === 'spike' ? '+312%' : al.kind === 'spam_burst' ? '6 / 12m' : '38m';
  const heroSub =
    al.kind === 'spike'
      ? 'send volume vs baseline'
      : al.kind === 'spam_burst'
      ? 'bounces within window'
      : 'mailbox silent';

  return (
    <motion.div
      layout
      layoutId={`tile-${tile.id}`}
      initial={{ opacity: 0, y: 16, rotate: rot, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{
        duration: 0.38,
        ease: 'easeOut',
        delay: entryDelay,
      }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`group relative col-span-1 cursor-pointer overflow-hidden rounded-2xl border border-l-2 ${ACCENT_BORDER_LEFT[accent]} border-border-muted bg-surface ${spanClasses(
        tile.size,
        expanded,
      )} ${selected ? `ring-2 ${ACCENT_RING[accent]}` : ''} transition-shadow hover:${ACCENT_SHADOW[accent]}`}
    >
      {/* Status top hairline */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px ${ACCENT_BG_CHIP[accent]}`} aria-hidden />
      {/* Backdrop gradient */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${ACCENT_FROM[accent]} ${ACCENT_VIA[accent]} to-transparent opacity-60`}
        aria-hidden
      />

      <motion.div className="relative h-full" whileHover={{ scale: 1.01 }}>
        <div className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${ALERT_SEVERITY_CLASS[al.severity]}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${ALERT_SEVERITY_DOT[al.severity]}`} aria-hidden />
              {al.severity === 'critical' ? 'Critical' : al.severity === 'warn' ? 'Warning' : 'Info'}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
              {al.timeAgo}
            </span>
          </div>

          <div className="flex items-start gap-3">
            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${ACCENT_BG_SOFT[accent]} ${ACCENT_TEXT[accent]} ring-1 ${ACCENT_RING[accent]}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-text-faint">
                {ALERT_KIND_LABEL[al.kind]}
              </div>
              <div className="mt-0.5 text-base font-semibold text-text">
                {al.subClientName ?? 'Agency-wide'}
              </div>
            </div>
          </div>

          <div className="text-sm leading-relaxed text-text">{al.message}</div>

          {/* Hero number */}
          <div className="mt-auto flex items-end justify-between gap-3">
            <div>
              <div
                className={`font-mono text-4xl font-semibold tracking-tight ${ACCENT_TEXT[accent]}`}
                style={{ letterSpacing: '-0.02em' }}
              >
                {heroNumber}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-text-faint">
                {heroSub}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <MiniSparkline series={HeroSeries} accent={accent} width={120} height={34} />
              <span className="font-mono text-[10px] text-text-faint">last 12h</span>
            </div>
          </div>

          {/* Expanded body */}
          <AnimatePresence>
            {expanded ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-xl border border-border-muted bg-surface-2/60 p-3 text-[11px] text-text-dim">
                  <div className="mb-1.5 flex items-center gap-1.5 text-text">
                    <Sparkles className="h-3 w-3 text-accent2" />
                    <span className="font-medium">Why this fired</span>
                  </div>
                  <ul className="space-y-1">
                    <li>
                      Detected {ALERT_KIND_LABEL[al.kind].toLowerCase()} pattern over rolling window.
                    </li>
                    <li>Severity escalates after 3 consecutive matching signals.</li>
                    <li>Click to acknowledge and silence for 30 minutes.</li>
                  </ul>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// GroupCard — medium tile rolling up a tight-window batch
// ---------------------------------------------------------------------------

interface GroupCardProps {
  tile: MosaicTile;
  index: number;
  selected: boolean;
  onClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  entryDelay: number;
  rot: number;
}

function GroupCard({ tile, selected, onClick, entryDelay, rot }: GroupCardProps): JSX.Element {
  const g = tile.group!;
  const accent: AccentToken = ACTION_ACCENT[g.events[0]!.kind] ?? 'accent2';
  const counts = useMemo(() => {
    const c: Record<ActionKind, number> = {
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescue: 0,
      bounce: 0,
    };
    g.events.forEach((ev) => {
      c[ev.kind] += 1;
    });
    return c;
  }, [g.events]);

  const totals: Array<[ActionKind, number]> = (Object.entries(counts) as Array<[ActionKind, number]>).filter(
    ([, v]) => v > 0,
  );
  const total = g.events.length;

  return (
    <motion.div
      layout
      layoutId={`tile-${tile.id}`}
      initial={{ opacity: 0, y: 16, rotate: rot, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.38, ease: 'easeOut', delay: entryDelay }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`group relative col-span-1 cursor-pointer overflow-hidden rounded-2xl border border-l-2 ${ACCENT_BORDER_LEFT[accent]} border-border-muted bg-surface ${spanClasses(
        tile.size,
        false,
      )} ${selected ? `ring-2 ${ACCENT_RING[accent]}` : ''} transition-shadow hover:${ACCENT_SHADOW[accent]}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px ${ACCENT_BG_CHIP[accent]}`} aria-hidden />
      <motion.div className="relative h-full" whileHover={{ scale: 1.01 }}>
        <div className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border ${ACCENT_BORDER_SOFT[accent]} ${ACCENT_BG_SOFT[accent]} px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${ACCENT_TEXT[accent]}`}
            >
              <Layers className="h-3 w-3" />
              Activity burst
            </span>
            <ProviderChip provider={g.provider} />
          </div>

          <div className="flex items-center gap-2.5">
            <LogoDisc ch={g.subClientLogoChar} accent={accent} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text">{g.subClientName}</div>
              <div className="truncate font-mono text-[11px] text-text-dim">{g.mailboxEmail}</div>
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div
                className={`font-mono text-3xl font-semibold tracking-tight ${ACCENT_TEXT[accent]}`}
                style={{ letterSpacing: '-0.02em' }}
              >
                {total}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-text-faint">
                events in window
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {totals.slice(0, 3).map(([k, v]) => {
                const Icon = ACTION_ICON[k];
                const a = ACTION_ACCENT[k];
                return (
                  <span
                    key={k}
                    className={`inline-flex items-center gap-1 rounded-full border ${ACCENT_BORDER_SOFT[a]} ${ACCENT_BG_SOFT[a]} px-2 py-0.5 text-[10px] ${ACCENT_TEXT[a]}`}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="font-mono">{v}</span>
                  </span>
                );
              })}
            </div>
          </div>

          <PeerInteractionStrip accent={accent} count={total} />
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Tiny horizontal "peer interaction" mini-bar — a stack of evenly-distributed
 * pulses meant to convey "this mailbox is busy". Twenty small dots, the
 * brighter ones representing recent activity.
 */
function PeerInteractionStrip({
  accent,
  count,
}: {
  accent: AccentToken;
  count: number;
}): JSX.Element {
  const bars = 18;
  const lit = Math.min(bars, Math.max(3, Math.round((count / 24) * bars)));
  return (
    <div className="mt-auto flex items-center gap-0.5">
      {Array.from({ length: bars }).map((_, i) => {
        const on = i < lit;
        return (
          <motion.span
            key={i}
            initial={{ scaleY: 0.3, opacity: 0 }}
            animate={{ scaleY: on ? 1 : 0.45, opacity: on ? 1 : 0.4 }}
            transition={{ duration: 0.28, delay: 0.02 * i }}
            className={`h-3 w-1 rounded-full ${on ? ACCENT_TEXT[accent] : 'text-text-faint'} bg-current`}
            style={{ transformOrigin: 'center' }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EventMediumCard — 2x1 tile for spam_rescue / bounce single events
// ---------------------------------------------------------------------------

interface EventMediumCardProps {
  tile: MosaicTile;
  index: number;
  selected: boolean;
  onClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  entryDelay: number;
  rot: number;
}

function EventMediumCard({
  tile,
  selected,
  onClick,
  entryDelay,
  rot,
}: EventMediumCardProps): JSX.Element {
  const ev = tile.event!;
  const accent = ACTION_ACCENT[ev.kind];
  const Icon = ACTION_ICON[ev.kind];

  return (
    <motion.div
      layout
      layoutId={`tile-${tile.id}`}
      initial={{ opacity: 0, y: 16, rotate: rot, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.38, ease: 'easeOut', delay: entryDelay }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`group relative col-span-1 cursor-pointer overflow-hidden rounded-2xl border border-l-2 ${ACCENT_BORDER_LEFT[accent]} border-border-muted bg-surface ${spanClasses(
        tile.size,
        false,
      )} ${selected ? `ring-2 ${ACCENT_RING[accent]}` : ''} transition-shadow hover:${ACCENT_SHADOW[accent]}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px ${ACCENT_BG_CHIP[accent]}`} aria-hidden />
      <motion.div className="relative h-full" whileHover={{ scale: 1.01 }}>
        <div className="flex h-full flex-col gap-2.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border ${ACCENT_BORDER_SOFT[accent]} ${ACCENT_BG_SOFT[accent]} px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${ACCENT_TEXT[accent]}`}
            >
              <Icon className="h-3 w-3" />
              {ACTION_LABEL[ev.kind]}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
              {ev.timeAgo}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <LogoDisc ch={ev.subClientLogoChar} accent={accent} size="md" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-text">{ev.subClientName}</div>
              <div className="truncate font-mono text-[11px] text-text-dim">{ev.mailboxEmail}</div>
            </div>
          </div>

          <div className="text-[12px] leading-relaxed text-text-dim">{ev.note}</div>

          <div className="mt-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PeerPulse accent={accent} />
              <span className="truncate font-mono text-[11px] text-text-faint">
                {ev.peerEmail ?? 'no peer'}
              </span>
            </div>
            <ProviderChip provider={ev.provider} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// EventCompactCard — 1x1 tile for routine single events
// ---------------------------------------------------------------------------

interface EventCompactCardProps {
  tile: MosaicTile;
  index: number;
  selected: boolean;
  onClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  entryDelay: number;
  rot: number;
}

function EventCompactCard({
  tile,
  selected,
  onClick,
  entryDelay,
  rot,
}: EventCompactCardProps): JSX.Element {
  const ev = tile.event!;
  const accent = ACTION_ACCENT[ev.kind];
  const Icon = ACTION_ICON[ev.kind];

  return (
    <motion.div
      layout
      layoutId={`tile-${tile.id}`}
      initial={{ opacity: 0, y: 16, rotate: rot, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.38, ease: 'easeOut', delay: entryDelay }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`group relative col-span-1 cursor-pointer overflow-hidden rounded-2xl border border-l-2 ${ACCENT_BORDER_LEFT[accent]} border-border-muted bg-surface ${spanClasses(
        tile.size,
        false,
      )} ${selected ? `ring-2 ${ACCENT_RING[accent]}` : ''} transition-shadow hover:${ACCENT_SHADOW[accent]}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px ${ACCENT_BG_CHIP[accent]}`} aria-hidden />
      <motion.div className="relative h-full" whileHover={{ scale: 1.02 }}>
        <div className="flex h-full flex-col justify-between gap-2 p-3.5">
          <div className="flex items-center justify-between gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full ${ACCENT_BG_SOFT[accent]} px-2 py-0.5 text-[10px] font-medium ${ACCENT_TEXT[accent]}`}
            >
              <Icon className="h-3 w-3" />
              {ACTION_LABEL[ev.kind]}
            </span>
            <span className="font-mono text-[10px] text-text-faint">{ev.timeAgo}</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <LogoDisc ch={ev.subClientLogoChar} accent={accent} size="sm" />
              <span className="truncate text-[11px] font-medium text-text">{ev.subClientName}</span>
            </div>
            <div className="truncate font-mono text-[10px] text-text-dim">{ev.mailboxEmail}</div>
          </div>

          <div className="flex items-center justify-between gap-1.5">
            <ProviderChip provider={ev.provider} size="xs" />
            <PeerPulse accent={accent} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// MosaicCanvas — the masonry grid container
// ---------------------------------------------------------------------------

interface MosaicCanvasProps {
  tiles: MosaicTile[];
  selectedId: string | null;
  expandedId: string | null;
  onSelect: (id: string) => void;
  onExpand: (id: string | null) => void;
}

function MosaicCanvas({
  tiles,
  selectedId,
  expandedId,
  onSelect,
  onExpand,
}: MosaicCanvasProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
      className="relative"
    >
      {/* Subtle gradient backdrop — magazine-style canvas */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-accent2/[0.04] via-transparent to-accent/[0.04]"
        aria-hidden
      />
      <div className="relative rounded-3xl border border-border-muted bg-surface/40 p-3 sm:p-4">
        <LayoutGroup>
          <motion.div
            layout
            className="grid grid-flow-row-dense grid-cols-1 gap-3 md:grid-cols-4 md:auto-rows-[136px]"
          >
            <AnimatePresence mode="popLayout">
              {tiles.map((tile, idx) => (
                <EventCard
                  key={tile.id}
                  tile={tile}
                  index={idx}
                  selected={selectedId === tile.id}
                  expanded={expandedId === tile.id}
                  onSelect={onSelect}
                  onExpand={onExpand}
                  entryDelay={Math.min(0.04 * (idx % 18), 0.72)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>

        {tiles.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 ring-1 ring-border-muted">
              <Inbox className="h-6 w-6 text-text-faint" aria-hidden />
            </div>
            <div className="mt-3 text-sm font-medium text-text">No tiles match the current filter</div>
            <div className="mt-1 text-xs text-text-faint">Adjust the filter or clear the search query.</div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Inspector — mosaic overview / selected detail
// ---------------------------------------------------------------------------

interface InspectorProps {
  data: AgencyActivityData;
  tiles: MosaicTile[];
  selected: MosaicTile | null;
  onSelect: (id: string | null) => void;
}

function Inspector({ data, tiles, selected, onSelect }: InspectorProps): JSX.Element {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.12 }}
      className="space-y-3"
    >
      <AnimatePresence mode="wait">
        {selected ? (
          <SelectedInspector
            key={`sel-${selected.id}`}
            tile={selected}
            data={data}
            onClose={() => onSelect(null)}
          />
        ) : (
          <OverviewInspector key="overview" data={data} tiles={tiles} />
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

// ---------------------------------------------------------------------------
// OverviewInspector — events-by-action + top mailboxes + alerts ticker
// ---------------------------------------------------------------------------

interface OverviewInspectorProps {
  data: AgencyActivityData;
  tiles: MosaicTile[];
}

function OverviewInspector({ data, tiles }: OverviewInspectorProps): JSX.Element {
  const breakdown = useMemo(() => {
    const counts: Record<ActionKind, number> = {
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescue: 0,
      bounce: 0,
    };
    data.events.forEach((ev) => {
      counts[ev.kind] += 1;
    });
    return counts;
  }, [data.events]);

  const total = Math.max(1, Object.values(breakdown).reduce((s, v) => s + v, 0));

  const featureCount = tiles.filter((t) => t.size === 'feature').length;
  const mediumCount = tiles.filter((t) => t.size === 'medium').length;
  const compactCount = tiles.filter((t) => t.size === 'compact').length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-3"
    >
      {/* Mosaic overview card */}
      <div className="rounded-2xl border border-border-muted bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/15 text-accent">
              <Layers className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-faint">Inspector</div>
              <div className="text-[13px] font-medium text-text">Mosaic overview</div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border-muted bg-surface-2/60 p-2.5 text-center">
            <div className="font-mono text-base font-semibold text-text">{featureCount}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-text-faint">Feature</div>
          </div>
          <div className="rounded-xl border border-border-muted bg-surface-2/60 p-2.5 text-center">
            <div className="font-mono text-base font-semibold text-text">{mediumCount}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-text-faint">Medium</div>
          </div>
          <div className="rounded-xl border border-border-muted bg-surface-2/60 p-2.5 text-center">
            <div className="font-mono text-base font-semibold text-text">{compactCount}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-text-faint">Compact</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-text-faint">
            <span>By action</span>
            <span className="font-mono text-text">{total}</span>
          </div>
          <div className="space-y-1.5">
            {(Object.entries(breakdown) as Array<[ActionKind, number]>).map(([k, v]) => {
              const accent = ACTION_ACCENT[k];
              const pct = (v / total) * 100;
              const Icon = ACTION_ICON[k];
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className={`grid h-5 w-5 place-items-center rounded-md ${ACCENT_BG_CHIP[accent]} ${ACCENT_TEXT[accent]}`}>
                    <Icon className="h-2.5 w-2.5" aria-hidden />
                  </span>
                  <span className="w-20 text-[11px] text-text-dim">{ACTION_LABEL[k]}</span>
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`h-full ${ACCENT_BG_CHIP[accent]}`}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[10px] text-text-dim">{v}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hourly volume sparkline w/ cursor tracking */}
      <HourlySparkCard hours={data.hourlyVolume} />

      {/* Top active mailboxes */}
      <div className="rounded-2xl border border-border-muted bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent2/15 text-accent2">
              <Flame className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="text-[12px] font-medium text-text">Most active mailboxes</div>
          </div>
          <span className="font-mono text-[10px] text-text-faint">today</span>
        </div>
        <div className="space-y-1.5">
          {data.topActiveMailboxes.slice(0, 5).map((m, idx) => (
            <motion.div
              key={m.mailboxId}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.04 }}
              className="flex items-center gap-2 rounded-xl border border-border-muted bg-surface-2/40 px-2 py-1.5"
            >
              <span className="grid h-5 w-5 place-items-center rounded-md bg-accent/15 font-mono text-[10px] font-semibold text-accent">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[11px] text-text">{m.mailboxEmail}</div>
                <div className="truncate text-[10px] text-text-faint">{m.subClientName}</div>
              </div>
              <span className="font-mono text-[11px] font-medium text-text">{m.eventsToday}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Alerts ticker */}
      <div className="rounded-2xl border border-border-muted bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent3/15 text-accent3">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="text-[12px] font-medium text-text">Alerts ticker</div>
          </div>
          <span className="font-mono text-[10px] text-text-faint">{data.alerts.length}</span>
        </div>
        <div className="space-y-1.5">
          {data.alerts.map((al, idx) => {
            const Icon = ALERT_KIND_ICON[al.kind];
            return (
              <motion.div
                key={al.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, delay: idx * 0.04 }}
                className="flex items-start gap-2 rounded-xl border border-border-muted bg-surface-2/40 px-2.5 py-2"
              >
                <span
                  className={`mt-0.5 grid h-5 w-5 place-items-center rounded-md border ${ALERT_SEVERITY_CLASS[al.severity]}`}
                >
                  <Icon className="h-2.5 w-2.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-text">
                      {al.subClientName ?? 'Agency'}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-text-faint">
                      {al.timeAgo}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-text-dim">{al.message}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// HourlySparkCard — cursor-tracking sparkline of hourly send volume
// ---------------------------------------------------------------------------

function HourlySparkCard({
  hours,
}: {
  hours: AgencyActivityData['hourlyVolume'];
}): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 280;
  const H = 80;
  const PAD_L = 4;
  const PAD_R = 4;
  const PAD_T = 8;
  const PAD_B = 8;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxV = Math.max(...hours.map((h) => h.sends), 1);
  const minV = Math.min(...hours.map((h) => h.sends));
  const span = Math.max(maxV - minV, 1);

  const pts = hours.map((h, i) => {
    const x = PAD_L + (i / Math.max(1, hours.length - 1)) * innerW;
    const y = PAD_T + (1 - (h.sends - minV) / span) * innerH;
    return { x, y, v: h.sends, hour: h.hour };
  });

  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const area = `${path} L ${pts[pts.length - 1]!.x.toFixed(1)} ${H - PAD_B} L ${pts[0]!.x.toFixed(1)} ${H - PAD_B} Z`;

  const onMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.clientX - rect.left) / rect.width) * W;
      const ratio = (x - PAD_L) / innerW;
      const idx = Math.max(0, Math.min(hours.length - 1, Math.round(ratio * (hours.length - 1))));
      setHoverIdx(idx);
    },
    [hours.length, innerW],
  );

  const hoverPt = hoverIdx != null ? pts[hoverIdx] : null;
  const hoverHour = hoverIdx != null ? hours[hoverIdx] : null;

  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent2/15 text-accent2">
            <Activity className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-faint">Hourly</div>
            <div className="text-[12px] font-medium text-text">Send volume — 24h</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">peak</span>
          <span className="font-mono text-[12px] text-text">{formatNumber(maxV)}</span>
        </div>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
          className="block cursor-crosshair"
        >
          <defs>
            <linearGradient id="hourly-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HEX.accent2} stopOpacity="0.4" />
              <stop offset="100%" stopColor={HEX.accent2} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            d={area}
            fill="url(#hourly-spark-fill)"
            stroke="none"
          />
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            d={path}
            stroke={HEX.accent2}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
          {hoverPt ? (
            <>
              <line
                x1={hoverPt.x}
                x2={hoverPt.x}
                y1={PAD_T}
                y2={H - PAD_B}
                stroke={HEX.accent2}
                strokeWidth={0.7}
                strokeDasharray="3 3"
                opacity={0.6}
              />
              <circle cx={hoverPt.x} cy={hoverPt.y} r={3.2} fill={HEX.accent2} />
              <circle cx={hoverPt.x} cy={hoverPt.y} r={6} fill={HEX.accent2} opacity={0.2} />
            </>
          ) : null}
        </svg>
        {hoverHour && hoverPt ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border-muted bg-surface px-2 py-1 text-[10px] text-text shadow-md"
            style={{
              left: `${(hoverPt.x / W) * 100}%`,
              top: -4,
            }}
          >
            <div className="font-mono text-text-faint">{hoverHour.hour}</div>
            <div className="font-mono">{formatNumber(hoverHour.sends)} sends</div>
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-text-faint">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectedInspector — shows the clicked tile's full payload
// ---------------------------------------------------------------------------

interface SelectedInspectorProps {
  tile: MosaicTile;
  data: AgencyActivityData;
  onClose: () => void;
}

function SelectedInspector({ tile, data, onClose }: SelectedInspectorProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.24 }}
      className="space-y-3"
    >
      {tile.kind === 'alert' ? (
        <SelectedAlertInspector tile={tile} onClose={onClose} />
      ) : tile.kind === 'group' ? (
        <SelectedGroupInspector tile={tile} onClose={onClose} />
      ) : (
        <SelectedEventInspector tile={tile} onClose={onClose} />
      )}

      {/* Sub-client mini-trend — always show below the focused detail. */}
      <SelectedSubclientTrend tile={tile} data={data} />
    </motion.div>
  );
}

function InspectorHeader({
  badge,
  title,
  subtitle,
  accent,
  onClose,
}: {
  badge: string;
  title: string;
  subtitle?: string;
  accent: AccentToken;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className={`text-[10px] uppercase tracking-wider ${ACCENT_TEXT[accent]}`}>{badge}</div>
        <div className="mt-0.5 text-base font-semibold text-text">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 truncate font-mono text-[11px] text-text-dim">{subtitle}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border-muted bg-surface-2 text-text-dim transition-colors hover:text-text"
        aria-label="Close inspector detail"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SelectedAlertInspector({
  tile,
  onClose,
}: {
  tile: MosaicTile;
  onClose: () => void;
}): JSX.Element {
  const al = tile.alert!;
  const accent: AccentToken =
    al.severity === 'critical' ? 'accent3' : al.severity === 'warn' ? 'accent4' : 'accent2';
  const Icon = ALERT_KIND_ICON[al.kind];
  return (
    <div className={`rounded-2xl border ${ACCENT_BORDER_SOFT[accent]} bg-surface p-4`}>
      <InspectorHeader
        badge={ALERT_KIND_LABEL[al.kind]}
        title={al.subClientName ?? 'Agency-wide'}
        accent={accent}
        onClose={onClose}
      />
      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-border-muted bg-surface-2/60 p-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${ACCENT_BG_CHIP[accent]} ${ACCENT_TEXT[accent]}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="text-[12px] leading-relaxed text-text">{al.message}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-faint">Severity</div>
          <div className={`mt-1 text-[12px] font-medium ${ACCENT_TEXT[accent]}`}>
            {al.severity === 'critical' ? 'Critical' : al.severity === 'warn' ? 'Warning' : 'Info'}
          </div>
        </div>
        <div className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-faint">Fired</div>
          <div className="mt-1 font-mono text-[12px] text-text">{al.timeAgo}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className={`grid h-8 flex-1 place-items-center rounded-full border ${ACCENT_BORDER_SOFT[accent]} ${ACCENT_BG_SOFT[accent]} text-[11px] font-medium ${ACCENT_TEXT[accent]} transition-transform hover:scale-[1.01]`}
        >
          Acknowledge alert
        </button>
        <button
          type="button"
          className="grid h-8 w-24 place-items-center rounded-full border border-border-muted bg-surface-2 text-[11px] text-text-dim transition-colors hover:text-text"
        >
          Silence 30m
        </button>
      </div>
    </div>
  );
}

function SelectedEventInspector({
  tile,
  onClose,
}: {
  tile: MosaicTile;
  onClose: () => void;
}): JSX.Element {
  const ev = tile.event!;
  const accent = ACTION_ACCENT[ev.kind];
  const Icon = ACTION_ICON[ev.kind];
  return (
    <div className={`rounded-2xl border ${ACCENT_BORDER_SOFT[accent]} bg-surface p-4`}>
      <InspectorHeader
        badge={ACTION_LABEL[ev.kind]}
        title={`${ev.subClientName} ${ACTION_VERB[ev.kind]}`}
        subtitle={ev.mailboxEmail}
        accent={accent}
        onClose={onClose}
      />
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-border-muted bg-surface-2/60 p-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ACCENT_BG_CHIP[accent]} ${ACCENT_TEXT[accent]}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-text-dim">{ev.note}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-faint">Provider</div>
          <div className="mt-1 text-[12px] font-medium text-text">{PROVIDER_LABEL[ev.provider]}</div>
        </div>
        <div className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-faint">When</div>
          <div className="mt-1 font-mono text-[12px] text-text">{ev.timeAgo}</div>
        </div>
        <div className="col-span-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-faint">Peer</div>
          <div className="mt-1 flex items-center gap-2">
            <PeerPulse accent={accent} />
            <span className="truncate font-mono text-[12px] text-text">
              {ev.peerEmail ?? 'no peer'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectedGroupInspector({
  tile,
  onClose,
}: {
  tile: MosaicTile;
  onClose: () => void;
}): JSX.Element {
  const g = tile.group!;
  const accent: AccentToken = ACTION_ACCENT[g.events[0]!.kind] ?? 'accent2';
  const counts: Record<ActionKind, number> = {
    sent: 0,
    opened: 0,
    replied: 0,
    starred: 0,
    spam_rescue: 0,
    bounce: 0,
  };
  g.events.forEach((ev) => {
    counts[ev.kind] += 1;
  });

  return (
    <div className={`rounded-2xl border ${ACCENT_BORDER_SOFT[accent]} bg-surface p-4`}>
      <InspectorHeader
        badge="Activity burst"
        title={g.subClientName}
        subtitle={g.mailboxEmail}
        accent={accent}
        onClose={onClose}
      />
      <div className="mt-3 rounded-xl border border-border-muted bg-surface-2/60 p-3">
        <div className="text-[10px] uppercase tracking-wider text-text-faint">In tight window</div>
        <div className={`mt-1 font-mono text-2xl font-semibold ${ACCENT_TEXT[accent]}`}>
          {g.events.length} events
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {(Object.entries(counts) as Array<[ActionKind, number]>)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => {
            const a = ACTION_ACCENT[k];
            const Icon = ACTION_ICON[k];
            return (
              <div key={k} className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-1.5">
                <span className="flex items-center gap-1.5">
                  <span className={`grid h-5 w-5 place-items-center rounded-md ${ACCENT_BG_CHIP[a]} ${ACCENT_TEXT[a]}`}>
                    <Icon className="h-2.5 w-2.5" aria-hidden />
                  </span>
                  <span className="text-[11px] text-text">{ACTION_LABEL[k]}</span>
                </span>
                <span className="font-mono text-[11px] text-text-dim">{v}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function SelectedSubclientTrend({
  tile,
  data,
}: {
  tile: MosaicTile;
  data: AgencyActivityData;
}): JSX.Element {
  // Synthetic per-tile 12h trend, just enough to give the inspector a
  // motion-y closer. We hash the tile id to a deterministic series so the
  // same selection always shows the same shape.
  const series = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < tile.id.length; i += 1) {
      seed = (seed * 31 + tile.id.charCodeAt(i)) >>> 0;
    }
    return Array.from({ length: 12 }, (_, i) => {
      const wave = 30 + 18 * Math.sin((i + (seed % 9)) * 0.7);
      const drift = (seed >>> (i % 4)) % 9;
      return Math.round(wave + drift);
    });
  }, [tile.id]);

  const accent: AccentToken =
    tile.kind === 'alert'
      ? tile.alert!.severity === 'critical'
        ? 'accent3'
        : tile.alert!.severity === 'warn'
        ? 'accent4'
        : 'accent2'
      : tile.kind === 'group'
      ? ACTION_ACCENT[tile.group!.events[0]!.kind] ?? 'accent2'
      : ACTION_ACCENT[tile.event!.kind];

  // Suppress unused-data warning while still keeping the prop available for
  // future per-sub-client lookups.
  void data;

  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-text-faint">
          Sub-client 12h trend
        </div>
        <div className="font-mono text-[10px] text-text-faint">events / hour</div>
      </div>
      <MiniSparkline series={series} accent={accent} width={300} height={56} />
      <div className="mt-2 flex items-center justify-between text-[10px] text-text-faint">
        <span>-12h</span>
        <span>-6h</span>
        <span>now</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgActQ4Mosaic(
  { data }: { data?: AgencyActivityData } = {},
): JSX.Element {
  const d = data ?? MOCK;
  const baseTiles = useMemo(() => buildMosaic(d), [d]);
  const [sort, setSort] = useState<SortMode>('newest');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const tiles = useMemo(
    () => applySortFilter(baseTiles, sort, filter, query),
    [baseTiles, sort, filter, query],
  );

  // Clear selection if the selected tile filtered out.
  useEffect(() => {
    if (selectedId && !tiles.find((t) => t.id === selectedId)) {
      setSelectedId(null);
      setExpandedId(null);
    }
  }, [tiles, selectedId]);

  const selected = useMemo(
    () => tiles.find((t) => t.id === selectedId) ?? null,
    [tiles, selectedId],
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedId((curr) => (curr === id ? null : id));
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader data={d} />
      <SortFilterBar
        sort={sort}
        filter={filter}
        query={query}
        onSort={setSort}
        onFilter={setFilter}
        onQuery={setQuery}
        visibleCount={tiles.length}
        totalCount={baseTiles.length}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <MosaicCanvas
            tiles={tiles}
            selectedId={selectedId}
            expandedId={expandedId}
            onSelect={handleSelect}
            onExpand={setExpandedId}
          />
        </div>
        <div className="lg:col-span-4">
          <Inspector
            data={d}
            tiles={tiles}
            selected={selected}
            onSelect={(id) => {
              if (id == null) {
                setSelectedId(null);
                setExpandedId(null);
              } else {
                setSelectedId(id);
              }
            }}
          />
        </div>
      </div>
      <MosaicFooter
        tiles={tiles}
        baseTiles={baseTiles}
        filter={filter}
        sort={sort}
        query={query}
        avgPerMin={d.kpis.avgEventsPerMin}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MosaicFooter — bottom strip with size-distribution + active filters recap
// ---------------------------------------------------------------------------

interface MosaicFooterProps {
  tiles: MosaicTile[];
  baseTiles: MosaicTile[];
  filter: FilterMode;
  sort: SortMode;
  query: string;
  avgPerMin: number;
}

function MosaicFooter({
  tiles,
  baseTiles,
  filter,
  sort,
  query,
  avgPerMin,
}: MosaicFooterProps): JSX.Element {
  const feature = tiles.filter((t) => t.size === 'feature').length;
  const medium = tiles.filter((t) => t.size === 'medium').length;
  const compact = tiles.filter((t) => t.size === 'compact').length;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.18 }}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-muted bg-surface/60 px-3 py-2 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 text-[11px] text-text-dim">
        <Calendar className="h-3.5 w-3.5 text-text-faint" aria-hidden />
        <span>
          Showing {tiles.length} of {baseTiles.length} tiles
        </span>
        {filter !== 'all' ? (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
            {FILTER_LABEL[filter]}
          </span>
        ) : null}
        {query ? (
          <span className="rounded-full border border-accent2/40 bg-accent2/10 px-2 py-0.5 text-[10px] text-accent2">
            &ldquo;{query}&rdquo;
          </span>
        ) : null}
        <span className="rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] text-text-faint">
          {SORT_LABEL[sort]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-text-faint">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
          Feature
          <span className="font-mono text-text">{feature}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent2" aria-hidden />
          Medium
          <span className="font-mono text-text">{medium}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent4" aria-hidden />
          Compact
          <span className="font-mono text-text">{compact}</span>
        </div>
        <span className="h-3 w-px bg-border-muted" aria-hidden />
        <div className="flex items-center gap-1.5">
          <ArrowDown className="h-3 w-3 text-text-faint" aria-hidden />
          <span>Newest first · {avgPerMin.toFixed(1)} / min</span>
        </div>
      </div>
    </motion.div>
  );
}

export default AgActQ4Mosaic;
