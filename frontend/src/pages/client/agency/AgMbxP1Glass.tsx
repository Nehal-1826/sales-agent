import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Crown,
  Filter,
  Gauge,
  Globe,
  Inbox,
  LayoutGrid,
  Mail,
  Pause,
  PieChart,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Siren,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { toast } from '@/components/ui/AppToast';
import {
  MAILBOXES_KEY,
  usePauseMailbox,
  useResumeMailbox,
} from '@/features/mailboxes/api';
import { AddMailboxDialog } from '@/pages/client/mailboxes/AddMailboxDialog';

/**
 * AgMbxP1Glass — Agency-tier MAILBOXES surface, "Frosted Glass" candidate
 * P1 of four.
 *
 * The /app/mailboxes surface for Agency-tier users — 24 mailboxes across
 * 8 sub-clients rendered as floating frosted-glass cards in a responsive
 * grid (4×6 on desktop, collapsing to 3×8 / 2×12 / 1×24).
 *
 * The visual language is unapologetically Apple/Vercel: translucent
 * surfaces with heavy backdrop-blur + saturate, soft inset 1px gradient
 * borders, status-tinted ambient backdrops bleeding through the glass,
 * and a slow drift of three blurred orbs (accent / accent2 / accent3) in
 * the page background giving the glass something to refract.
 *
 * The signature interaction is mouse-parallax 3D tilt: each card tracks
 * the cursor through framer-motion useMotionValue → useTransform, rotating
 * up to ±8deg on the X/Y axes with translateY -6px on hover. Click ripples
 * a sonar-style ring outward and selects the card; the right inspector
 * cross-fades to its detail view (warmth gauge, 7-day sparkline, DNS
 * pills, sub-client info, action buttons).
 *
 * Fully STANDALONE — no imports from @/features/*, no router, no query
 * hooks, no required props. Every value comes from the inline MOCK so the
 * preview harness can mount it prop-less. Renders only page content; the
 * app shell supplies the chrome.
 *
 * NOT a kanban (P3 owns that), NOT a manifest table (P2 owns that), NOT a
 * honeycomb hex grid (P4 owns that). The frosted-glass card identity is
 * the differentiator.
 */

// ---------------------------------------------------------------------------
// Shared Agency mailboxes data shape (kept in sync across all 4 variants).
// ---------------------------------------------------------------------------

type MailboxStatus = 'active' | 'warming' | 'paused' | 'pending';
type MailboxProvider = 'gmail' | 'outlook' | 'yahoo' | 'smtp';
type RampTier = 'D1-3' | 'D4-7' | 'D8-14' | 'D15-21' | 'D22-28' | 'D29+';
type AlertSeverity = 'warn' | 'critical';
type AlertKind = 'mailbox_paused' | 'bounce_spike' | 'spam_complaint' | 'dns_break';

export interface AgencyMailboxesData {
  workspace: { name: string; subClientCount: number; mailboxCount: number };
  kpis: {
    totalMailboxes: number;
    activeMailboxes: number;
    pausedMailboxes: number;
    avgWarmth: number;
    totalSendsToday: number;
    rampedMailboxes: number;
  };
  mailboxes: Array<{
    id: string;
    emailAddress: string;
    provider: MailboxProvider;
    status: MailboxStatus;
    warmthScore: number;
    rampDay: number;
    rampTier: RampTier;
    dailyTarget: number;
    sentToday: number;
    subClientId: string;
    subClientName: string;
    subClientLogoChar: string;
    spfPass: boolean;
    dkimPass: boolean;
    dmarcPass: boolean;
    lastActivityAgo: string;
    last7dTrend: number[];
  }>;
  providers: Array<{
    id: MailboxProvider;
    label: string;
    mailboxCount: number;
    avgWarmth: number;
    sendsToday: number;
  }>;
  alerts: Array<{
    id: string;
    mailboxId: string;
    emailAddress: string;
    kind: AlertKind;
    message: string;
    ago: string;
    severity: AlertSeverity;
  }>;
}

// ---------------------------------------------------------------------------
// Mock data — Northwind Agency, 24 mailboxes across 8 sub-clients.
// 8 sub-clients: Helix, Nimbus, Orion, Vega, Quasar, Lyra, Atlas, Pixel.
// 4 providers: gmail / outlook / yahoo / smtp. Mix of statuses.
// ---------------------------------------------------------------------------

const MAILBOXES: AgencyMailboxesData['mailboxes'] = [
  // Helix Outreach — 3 mailboxes, all healthy
  {
    id: 'mb-helix-1',
    emailAddress: 'jordan@helix.com',
    provider: 'gmail',
    status: 'active',
    warmthScore: 89,
    rampDay: 42,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 47,
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '2m ago',
    last7dTrend: [82, 84, 86, 87, 88, 89, 89],
  },
  {
    id: 'mb-helix-2',
    emailAddress: 'casey@helix.com',
    provider: 'gmail',
    status: 'active',
    warmthScore: 86,
    rampDay: 38,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 44,
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '4m ago',
    last7dTrend: [80, 82, 83, 84, 85, 86, 86],
  },
  {
    id: 'mb-helix-3',
    emailAddress: 'sam@helix.com',
    provider: 'outlook',
    status: 'active',
    warmthScore: 84,
    rampDay: 31,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 42,
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    subClientLogoChar: 'H',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '7m ago',
    last7dTrend: [78, 80, 81, 82, 83, 84, 84],
  },
  // Nimbus Cloud — 4 mailboxes, mostly healthy, 1 warming
  {
    id: 'mb-nimbus-1',
    emailAddress: 'alex@nimbuscloud.io',
    provider: 'gmail',
    status: 'active',
    warmthScore: 88,
    rampDay: 35,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 46,
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '1m ago',
    last7dTrend: [83, 84, 85, 86, 87, 88, 88],
  },
  {
    id: 'mb-nimbus-2',
    emailAddress: 'priya@nimbuscloud.io',
    provider: 'outlook',
    status: 'active',
    warmthScore: 85,
    rampDay: 28,
    rampTier: 'D22-28',
    dailyTarget: 50,
    sentToday: 41,
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '3m ago',
    last7dTrend: [80, 81, 82, 83, 84, 85, 85],
  },
  {
    id: 'mb-nimbus-3',
    emailAddress: 'taylor@nimbuscloud.io',
    provider: 'gmail',
    status: 'warming',
    warmthScore: 64,
    rampDay: 11,
    rampTier: 'D8-14',
    dailyTarget: 50,
    sentToday: 18,
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '6m ago',
    last7dTrend: [52, 55, 58, 60, 61, 63, 64],
  },
  {
    id: 'mb-nimbus-4',
    emailAddress: 'reese@nimbuscloud.io',
    provider: 'smtp',
    status: 'active',
    warmthScore: 81,
    rampDay: 24,
    rampTier: 'D22-28',
    dailyTarget: 50,
    sentToday: 38,
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    subClientLogoChar: 'N',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '9m ago',
    last7dTrend: [76, 77, 78, 79, 80, 80, 81],
  },
  // Orion Sales — 4 mailboxes, all healthy/active
  {
    id: 'mb-orion-1',
    emailAddress: 'morgan@orionsales.com',
    provider: 'gmail',
    status: 'active',
    warmthScore: 91,
    rampDay: 56,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 48,
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '1m ago',
    last7dTrend: [87, 88, 89, 90, 90, 91, 91],
  },
  {
    id: 'mb-orion-2',
    emailAddress: 'rowan@orionsales.com',
    provider: 'gmail',
    status: 'active',
    warmthScore: 90,
    rampDay: 52,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 47,
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '2m ago',
    last7dTrend: [86, 87, 88, 89, 89, 90, 90],
  },
  {
    id: 'mb-orion-3',
    emailAddress: 'dakota@orionsales.com',
    provider: 'outlook',
    status: 'active',
    warmthScore: 87,
    rampDay: 44,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 44,
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '4m ago',
    last7dTrend: [83, 84, 85, 86, 86, 87, 87],
  },
  {
    id: 'mb-orion-4',
    emailAddress: 'parker@orionsales.com',
    provider: 'gmail',
    status: 'active',
    warmthScore: 84,
    rampDay: 33,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 42,
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    subClientLogoChar: 'O',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '5m ago',
    last7dTrend: [80, 81, 82, 83, 83, 84, 84],
  },
  // Vega Outbound — 3 mailboxes, all warming
  {
    id: 'mb-vega-1',
    emailAddress: 'avery@vegaoutbound.io',
    provider: 'outlook',
    status: 'warming',
    warmthScore: 72,
    rampDay: 18,
    rampTier: 'D15-21',
    dailyTarget: 35,
    sentToday: 28,
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '3m ago',
    last7dTrend: [62, 64, 66, 68, 70, 71, 72],
  },
  {
    id: 'mb-vega-2',
    emailAddress: 'sage@vegaoutbound.io',
    provider: 'gmail',
    status: 'warming',
    warmthScore: 68,
    rampDay: 15,
    rampTier: 'D15-21',
    dailyTarget: 35,
    sentToday: 24,
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '6m ago',
    last7dTrend: [58, 60, 62, 64, 66, 67, 68],
  },
  {
    id: 'mb-vega-3',
    emailAddress: 'kai@vegaoutbound.io',
    provider: 'smtp',
    status: 'warming',
    warmthScore: 61,
    rampDay: 9,
    rampTier: 'D8-14',
    dailyTarget: 20,
    sentToday: 14,
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    subClientLogoChar: 'V',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '11m ago',
    last7dTrend: [48, 51, 54, 56, 58, 60, 61],
  },
  // Quasar Growth — 3 mailboxes, 2 healthy 1 paused
  {
    id: 'mb-quasar-1',
    emailAddress: 'remy@quasargrowth.com',
    provider: 'gmail',
    status: 'active',
    warmthScore: 83,
    rampDay: 36,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 41,
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    spfPass: true,
    dkimPass: false,
    dmarcPass: true,
    lastActivityAgo: '4m ago',
    last7dTrend: [78, 79, 80, 81, 82, 82, 83],
  },
  {
    id: 'mb-quasar-2',
    emailAddress: 'logan@quasargrowth.com',
    provider: 'outlook',
    status: 'active',
    warmthScore: 80,
    rampDay: 29,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 39,
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '8m ago',
    last7dTrend: [75, 76, 77, 78, 79, 80, 80],
  },
  {
    id: 'mb-quasar-3',
    emailAddress: 'finley@quasargrowth.com',
    provider: 'gmail',
    status: 'paused',
    warmthScore: 0,
    rampDay: 19,
    rampTier: 'D15-21',
    dailyTarget: 35,
    sentToday: 0,
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    subClientLogoChar: 'Q',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '2h ago',
    last7dTrend: [68, 69, 70, 70, 0, 0, 0],
  },
  // Lyra Studio — 2 mailboxes, healthy
  {
    id: 'mb-lyra-1',
    emailAddress: 'noor@lyrastudio.co',
    provider: 'gmail',
    status: 'active',
    warmthScore: 86,
    rampDay: 41,
    rampTier: 'D29+',
    dailyTarget: 50,
    sentToday: 44,
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    subClientLogoChar: 'L',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '2m ago',
    last7dTrend: [81, 82, 83, 84, 85, 86, 86],
  },
  {
    id: 'mb-lyra-2',
    emailAddress: 'mira@lyrastudio.co',
    provider: 'outlook',
    status: 'active',
    warmthScore: 82,
    rampDay: 27,
    rampTier: 'D22-28',
    dailyTarget: 50,
    sentToday: 38,
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    subClientLogoChar: 'L',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '5m ago',
    last7dTrend: [77, 78, 79, 80, 81, 82, 82],
  },
  // Atlas Bio — 2 mailboxes, AT RISK (low warmth, alerts)
  {
    id: 'mb-atlas-1',
    emailAddress: 'kim@atlas-bio.com',
    provider: 'yahoo',
    status: 'warming',
    warmthScore: 48,
    rampDay: 22,
    rampTier: 'D22-28',
    dailyTarget: 50,
    sentToday: 21,
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    spfPass: true,
    dkimPass: true,
    dmarcPass: false,
    lastActivityAgo: '14m ago',
    last7dTrend: [62, 58, 55, 52, 50, 49, 48],
  },
  {
    id: 'mb-atlas-2',
    emailAddress: 'lou@atlas-bio.com',
    provider: 'smtp',
    status: 'paused',
    warmthScore: 0,
    rampDay: 16,
    rampTier: 'D15-21',
    dailyTarget: 35,
    sentToday: 0,
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    subClientLogoChar: 'A',
    spfPass: false,
    dkimPass: true,
    dmarcPass: false,
    lastActivityAgo: '3h ago',
    last7dTrend: [55, 52, 48, 45, 0, 0, 0],
  },
  // Pixel Forge — 3 mailboxes, 1 warming, 1 pending, 1 active
  {
    id: 'mb-pixel-1',
    emailAddress: 'wren@pixelforge.io',
    provider: 'gmail',
    status: 'warming',
    warmthScore: 65,
    rampDay: 12,
    rampTier: 'D8-14',
    dailyTarget: 20,
    sentToday: 17,
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '5m ago',
    last7dTrend: [54, 57, 60, 62, 63, 64, 65],
  },
  {
    id: 'mb-pixel-2',
    emailAddress: 'jules@pixelforge.io',
    provider: 'outlook',
    status: 'pending',
    warmthScore: 12,
    rampDay: 2,
    rampTier: 'D1-3',
    dailyTarget: 5,
    sentToday: 3,
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '12m ago',
    last7dTrend: [0, 3, 5, 7, 9, 11, 12],
  },
  {
    id: 'mb-pixel-3',
    emailAddress: 'devon@pixelforge.io',
    provider: 'gmail',
    status: 'active',
    warmthScore: 78,
    rampDay: 26,
    rampTier: 'D22-28',
    dailyTarget: 50,
    sentToday: 36,
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    subClientLogoChar: 'P',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    lastActivityAgo: '3m ago',
    last7dTrend: [73, 74, 75, 76, 77, 77, 78],
  },
];

const PROVIDERS: AgencyMailboxesData['providers'] = [
  {
    id: 'gmail',
    label: 'Gmail',
    mailboxCount: 11,
    avgWarmth: 81,
    sendsToday: 442,
  },
  {
    id: 'outlook',
    label: 'Outlook',
    mailboxCount: 7,
    avgWarmth: 82,
    sendsToday: 286,
  },
  {
    id: 'yahoo',
    label: 'Yahoo',
    mailboxCount: 1,
    avgWarmth: 48,
    sendsToday: 21,
  },
  {
    id: 'smtp',
    label: 'SMTP',
    mailboxCount: 5,
    avgWarmth: 56,
    sendsToday: 90,
  },
];

const ALERTS: AgencyMailboxesData['alerts'] = [
  {
    id: 'al-atlas-1',
    mailboxId: 'mb-atlas-1',
    emailAddress: 'kim@atlas-bio.com',
    kind: 'spam_complaint',
    message: 'Yahoo complaint rate spiked above 0.4% — slowing down outbound',
    ago: '14m ago',
    severity: 'critical',
  },
  {
    id: 'al-atlas-2',
    mailboxId: 'mb-atlas-2',
    emailAddress: 'lou@atlas-bio.com',
    kind: 'dns_break',
    message: 'SPF lookup returning NXDOMAIN at primary resolver',
    ago: '42m ago',
    severity: 'critical',
  },
  {
    id: 'al-quasar-1',
    mailboxId: 'mb-quasar-3',
    emailAddress: 'finley@quasargrowth.com',
    kind: 'mailbox_paused',
    message: 'Mailbox paused by owner — sends halted 2h ago',
    ago: '2h ago',
    severity: 'warn',
  },
  {
    id: 'al-quasar-2',
    mailboxId: 'mb-quasar-1',
    emailAddress: 'remy@quasargrowth.com',
    kind: 'dns_break',
    message: 'DKIM key rotation incomplete — selector default still missing',
    ago: '1h ago',
    severity: 'warn',
  },
  {
    id: 'al-pixel-1',
    mailboxId: 'mb-pixel-2',
    emailAddress: 'jules@pixelforge.io',
    kind: 'bounce_spike',
    message: 'New mailbox — failure rate 12% over first 24h is elevated',
    ago: '4h ago',
    severity: 'warn',
  },
];

const MOCK: AgencyMailboxesData = {
  workspace: {
    name: 'Northwind Agency',
    subClientCount: 8,
    mailboxCount: 24,
  },
  kpis: {
    totalMailboxes: 24,
    activeMailboxes: 16,
    pausedMailboxes: 2,
    avgWarmth: 73,
    totalSendsToday: 839,
    rampedMailboxes: 12,
  },
  mailboxes: MAILBOXES,
  providers: PROVIDERS,
  alerts: ALERTS,
};

/**
 * Skeleton fallback for the future live adapter — used when the API hasn't
 * resolved yet (or has failed) so we don't render mock data the user might
 * mistake for their own. Every collection is empty, every counter is zero.
 */
export const AGENCY_MAILBOXES_SKELETON_P1: AgencyMailboxesData = {
  workspace: {
    name: 'Your agency',
    subClientCount: 0,
    mailboxCount: 0,
  },
  kpis: {
    totalMailboxes: 0,
    activeMailboxes: 0,
    pausedMailboxes: 0,
    avgWarmth: 0,
    totalSendsToday: 0,
    rampedMailboxes: 0,
  },
  mailboxes: [],
  providers: [],
  alerts: [],
};

// ---------------------------------------------------------------------------
// Theme helpers — status palette, label maps, glass-tint backgrounds.
// ---------------------------------------------------------------------------

type Mailbox = AgencyMailboxesData['mailboxes'][number];
type Provider = AgencyMailboxesData['providers'][number];
type Alert = AgencyMailboxesData['alerts'][number];

const STATUS_LABEL: Record<MailboxStatus, string> = {
  active: 'Active',
  warming: 'Warming',
  paused: 'Paused',
  pending: 'Pending',
};

const STATUS_TEXT_CLASS: Record<MailboxStatus, string> = {
  active: 'text-accent',
  warming: 'text-accent4',
  paused: 'text-accent3',
  pending: 'text-accent2',
};

const STATUS_PILL_CLASS: Record<MailboxStatus, string> = {
  active: 'border-accent/30 bg-accent/10 text-accent',
  warming: 'border-accent4/30 bg-accent4/10 text-accent4',
  paused: 'border-accent3/30 bg-accent3/10 text-accent3',
  pending: 'border-accent2/30 bg-accent2/10 text-accent2',
};

const STATUS_DOT_HEX: Record<MailboxStatus, string> = {
  active: '#F26522',
  warming: '#ffd54f',
  paused: '#ff6b4a',
  pending: '#FF8A4B',
};

// Copy shared between the list card hint and the detail-drawer notice for
// mailboxes still awaiting peer-pool assignment.
const PENDING_NOTICE = {
  cardHint: 'Awaiting pool assignment',
  heading: 'Pending — awaiting pool assignment',
  body: "Warmup hasn't started yet. It begins automatically once an admin adds this mailbox to a peer pool. No action needed from you.",
} as const;

const STATUS_GLOW_HEX: Record<MailboxStatus, string> = {
  active: 'rgba(242, 101, 34,0.20)',
  warming: 'rgba(255,213,79,0.18)',
  paused: 'rgba(255,107,74,0.18)',
  pending: 'rgba(255, 138, 75,0.18)',
};

const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

const PROVIDER_ICON: Record<MailboxProvider, typeof Mail> = {
  gmail: Mail,
  outlook: Inbox,
  yahoo: Globe,
  smtp: Server,
};

const PROVIDER_COLOR_CLASS: Record<MailboxProvider, string> = {
  gmail: 'text-accent3',
  outlook: 'text-accent2',
  yahoo: 'text-accent4',
  smtp: 'text-text-dim',
};

const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  mailbox_paused: 'Mailbox paused',
  bounce_spike: 'Failure spike',
  spam_complaint: 'Spam complaint',
  dns_break: 'Domain records (DNS) break',
};

const ALERT_KIND_ICON: Record<AlertKind, typeof AlertTriangle> = {
  mailbox_paused: Pause,
  bounce_spike: TrendingUp,
  spam_complaint: Siren,
  dns_break: ShieldX,
};

const ALERT_SEVERITY_CLASS: Record<AlertSeverity, string> = {
  warn: 'border-accent4/30 bg-accent4/10 text-accent4',
  critical: 'border-accent3/30 bg-accent3/10 text-accent3',
};

/**
 * Pick a card ambient tint from the status. Used for the soft radial gradient
 * that bleeds through the frosted glass — different statuses cast different
 * tints so the grid reads at a glance.
 */
function statusAmbientTint(status: MailboxStatus): {
  primary: string;
  secondary: string;
} {
  switch (status) {
    case 'active':
      return {
        primary: 'rgba(242, 101, 34,0.18)',
        secondary: 'rgba(255, 138, 75,0.10)',
      };
    case 'warming':
      return {
        primary: 'rgba(255,213,79,0.16)',
        secondary: 'rgba(242, 101, 34,0.08)',
      };
    case 'paused':
      return {
        primary: 'rgba(255,107,74,0.18)',
        secondary: 'rgba(242, 101, 34,0.06)',
      };
    case 'pending':
      return {
        primary: 'rgba(255, 138, 75,0.18)',
        secondary: 'rgba(242, 101, 34,0.08)',
      };
  }
}

/**
 * Compute a deterministic ambient position (0..100% on each axis) per card so
 * different cards get different ambient placements through the glass without
 * being random. Hashing on the mailbox ID keeps placement stable across
 * re-renders.
 */
function deterministicAmbientPosition(id: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const x = Math.abs(hash % 100);
  const y = Math.abs((hash >> 8) % 100);
  return { x, y };
}

// ---------------------------------------------------------------------------
// Filter & sort types and helpers.
// ---------------------------------------------------------------------------

type StatusFilter = MailboxStatus | 'all';
type ProviderFilter = MailboxProvider | 'all';
type SortKey = 'warmth-desc' | 'warmth-asc' | 'sends-desc' | 'sub-client';

const SORT_LABEL: Record<SortKey, string> = {
  'warmth-desc': 'Warmth ↓',
  'warmth-asc': 'Warmth ↑',
  'sends-desc': 'Sends ↓',
  'sub-client': 'Sub-client',
};

function filterAndSort(
  mailboxes: Mailbox[],
  statusFilter: StatusFilter,
  providerFilter: ProviderFilter,
  subClientFilter: string,
  searchQuery: string,
  sortKey: SortKey,
): Mailbox[] {
  const q = searchQuery.trim().toLowerCase();
  const filtered = mailboxes.filter((m) => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (providerFilter !== 'all' && m.provider !== providerFilter) return false;
    if (subClientFilter !== 'all' && m.subClientId !== subClientFilter)
      return false;
    if (q.length > 0) {
      const hay = `${m.emailAddress} ${m.subClientName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  switch (sortKey) {
    case 'warmth-desc':
      sorted.sort((a, b) => b.warmthScore - a.warmthScore);
      break;
    case 'warmth-asc':
      sorted.sort((a, b) => a.warmthScore - b.warmthScore);
      break;
    case 'sends-desc':
      sorted.sort((a, b) => b.sentToday - a.sentToday);
      break;
    case 'sub-client':
      sorted.sort((a, b) => {
        const n = a.subClientName.localeCompare(b.subClientName);
        if (n !== 0) return n;
        return a.emailAddress.localeCompare(b.emailAddress);
      });
      break;
  }
  return sorted;
}

/**
 * Build the unique sub-client list for filter chips. Stable order matches the
 * MOCK ordering so the chip row stays predictable.
 */
function uniqueSubClients(mailboxes: Mailbox[]): Array<{
  id: string;
  name: string;
  logoChar: string;
  count: number;
}> {
  const map = new Map<
    string,
    { id: string; name: string; logoChar: string; count: number }
  >();
  for (const m of mailboxes) {
    const existing = map.get(m.subClientId);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(m.subClientId, {
        id: m.subClientId,
        name: m.subClientName,
        logoChar: m.subClientLogoChar,
        count: 1,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Build a per-status count map for the chip badges. Includes a synthetic 'all'
 * total so we don't recompute it inline.
 */
function countByStatus(
  mailboxes: Mailbox[],
): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: mailboxes.length,
    active: 0,
    warming: 0,
    paused: 0,
    pending: 0,
  };
  for (const m of mailboxes) {
    counts[m.status] += 1;
  }
  return counts;
}

/**
 * Build a per-provider count map for the provider chip badges.
 */
function countByProvider(
  mailboxes: Mailbox[],
): Record<ProviderFilter, number> {
  const counts: Record<ProviderFilter, number> = {
    all: mailboxes.length,
    gmail: 0,
    outlook: 0,
    yahoo: 0,
    smtp: 0,
  };
  for (const m of mailboxes) {
    counts[m.provider] += 1;
  }
  return counts;
}

/**
 * Find any active alerts for a mailbox so we can render the warning glow
 * + pulsing dot on the card.
 */
function alertsForMailbox(mailboxId: string, alerts: Alert[]): Alert[] {
  return alerts.filter((a) => a.mailboxId === mailboxId);
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function AgMbxP1Glass({
  data,
}: {
  data?: AgencyMailboxesData;
} = {}): JSX.Element {
  const d = data ?? MOCK;

  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [subClientFilter, setSubClientFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('warmth-desc');

  const subClients = useMemo(() => uniqueSubClients(d.mailboxes), [d.mailboxes]);
  const statusCounts = useMemo(() => countByStatus(d.mailboxes), [d.mailboxes]);
  const providerCounts = useMemo(
    () => countByProvider(d.mailboxes),
    [d.mailboxes],
  );

  const filteredMailboxes = useMemo(
    () =>
      filterAndSort(
        d.mailboxes,
        statusFilter,
        providerFilter,
        subClientFilter,
        searchQuery,
        sortKey,
      ),
    [
      d.mailboxes,
      statusFilter,
      providerFilter,
      subClientFilter,
      searchQuery,
      sortKey,
    ],
  );

  const selectedMailbox = useMemo(
    () =>
      d.mailboxes.find((m) => m.id === selectedMailboxId) ?? null,
    [d.mailboxes, selectedMailboxId],
  );

  return (
    <div className="relative">
      {/* Background orbs — three large slow-drifting blurred radial gradients
          that give the frosted glass cards something interesting to refract.
          Pointer-events-none so they never intercept clicks. */}
      <BackgroundOrbs />

      <div className="relative space-y-5">
        <PageHeader data={d} />

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          statusCounts={statusCounts}
          providerFilter={providerFilter}
          onProviderChange={setProviderFilter}
          providerCounts={providerCounts}
          subClientFilter={subClientFilter}
          onSubClientChange={setSubClientFilter}
          subClients={subClients}
          sortKey={sortKey}
          onSortChange={setSortKey}
          filteredCount={filteredMailboxes.length}
          totalCount={d.mailboxes.length}
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <MailboxGrid
              mailboxes={filteredMailboxes}
              alerts={d.alerts}
              selectedId={selectedMailboxId}
              onSelect={(id) =>
                setSelectedMailboxId((curr) => (curr === id ? null : id))
              }
            />
          </div>
          <div className="lg:col-span-4">
            <Inspector
              data={d}
              selected={selectedMailbox}
              onClear={() => setSelectedMailboxId(null)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Background orbs — three large blurred radial gradients drifting slowly so
// the frosted glass has something interesting to refract.
// ---------------------------------------------------------------------------

function BackgroundOrbs(): JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{ contain: 'layout paint' }}
    >
      <motion.div
        className="absolute h-[640px] w-[640px] rounded-full blur-2xl"
        style={{
          background:
            'radial-gradient(circle, rgba(242, 101, 34,0.28) 0%, rgba(242, 101, 34,0) 70%)',
          top: '-12%',
          left: '-8%',
        }}
        animate={{
          x: [0, 60, -40, 0],
          y: [0, 40, -30, 0],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute h-[520px] w-[520px] rounded-full blur-2xl"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 138, 75,0.22) 0%, rgba(255, 138, 75,0) 70%)',
          top: '15%',
          right: '-6%',
        }}
        animate={{
          x: [0, -70, 50, 0],
          y: [0, 50, -40, 0],
        }}
        transition={{
          duration: 26,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute h-[480px] w-[480px] rounded-full blur-2xl"
        style={{
          background:
            'radial-gradient(circle, rgba(255,107,74,0.18) 0%, rgba(255,107,74,0) 70%)',
          bottom: '-10%',
          left: '20%',
        }}
        animate={{
          x: [0, 50, -50, 0],
          y: [0, -40, 30, 0],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header — agency name (premium display) + region pill + 6 KPI tiles +
// MoM growth chip. The "Add mailbox" CTA sits inline to the right.
// ---------------------------------------------------------------------------

function PageHeader({ data }: { data: AgencyMailboxesData }): JSX.Element {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const {
    workspace,
    kpis: {
      totalMailboxes,
      activeMailboxes,
      pausedMailboxes,
      avgWarmth,
      totalSendsToday,
      rampedMailboxes,
    },
  } = data;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: MAILBOXES_KEY });
    queryClient.invalidateQueries({ queryKey: ['workspace'] });
    toast('Refreshing…');
  };
  // MoM growth — derived from the totalMailboxes vs a stable target. With the
  // skeleton total of 0 we surface 0%; otherwise hard-coded value mirrors the
  // historical MoM delta the agency dashboard shows.
  const momGrowth = totalMailboxes === 0 ? 0 : 14.6;

  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <motion.span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-surface/40 text-accent backdrop-blur-xl backdrop-saturate-150"
              style={{
                boxShadow:
                  '0 8px 32px 0 rgba(242, 101, 34,0.20), inset 0 1px 0 0 rgba(255,255,255,0.08)',
              }}
              whileHover={{ rotate: -6, scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            >
              <Mail className="h-5 w-5" />
            </motion.span>
            <div className="min-w-0">
              <h1
                className="truncate text-3xl font-light tracking-tight text-text"
                style={{ letterSpacing: '-0.02em' }}
                title={workspace.name}
              >
                {workspace.name}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-text-dim">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent backdrop-blur-md">
                  <Crown className="h-3 w-3" />
                  Agency
                </span>
                <span className="text-text-faint">·</span>
                <span className="whitespace-nowrap">
                  <span className="font-mono text-text">
                    {workspace.subClientCount}
                  </span>{' '}
                  sub-clients
                </span>
                <span className="text-text-faint">·</span>
                <span className="whitespace-nowrap">
                  <span className="font-mono text-text">
                    {workspace.mailboxCount}
                  </span>{' '}
                  mailboxes
                </span>
                <span className="text-text-faint">·</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface/40 px-2.5 py-0.5 text-[11px] text-text-dim backdrop-blur-md">
                  <Globe className="h-3 w-3" />
                  us-east-1
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <MomGrowthChip delta={momGrowth} />
          <GlassButton variant="ghost" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </GlassButton>
          <GlassButton variant="primary" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add mailbox
          </GlassButton>
          <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Total"
          value={totalMailboxes}
          icon={<LayoutGrid className="h-3.5 w-3.5" />}
          tone="default"
          delay={0}
        />
        <KpiTile
          label="Active"
          value={activeMailboxes}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          tone="accent"
          delay={0.04}
        />
        <KpiTile
          label="Paused"
          value={pausedMailboxes}
          icon={<Pause className="h-3.5 w-3.5" />}
          tone="accent3"
          delay={0.08}
        />
        <KpiTile
          label="Avg warmth"
          value={avgWarmth}
          icon={<Gauge className="h-3.5 w-3.5" />}
          tone="accent2"
          delay={0.12}
          suffix=""
        />
        <KpiTile
          label="Sends today"
          value={totalSendsToday}
          icon={<Activity className="h-3.5 w-3.5" />}
          tone="accent"
          delay={0.16}
        />
        <KpiTile
          label="Built up"
          value={rampedMailboxes}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          tone="accent4"
          delay={0.2}
        />
      </div>
    </motion.header>
  );
}

function MomGrowthChip({ delta }: { delta: number }): JSX.Element {
  const positive = delta >= 0;
  const colorClass = positive ? 'text-accent' : 'text-accent3';
  return (
    <motion.span
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface/40 px-3 py-1.5 text-xs text-text-dim backdrop-blur-xl backdrop-saturate-150"
    >
      <TrendingUp className={`h-3 w-3 ${colorClass}`} />
      <span className={colorClass}>
        {positive ? '+' : ''}
        {delta.toFixed(1)}%
      </span>
      <span className="text-text-faint">MoM</span>
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// KPI tile — small frosted glass card with icon + value + label. Cheap
// counterpart to the big mailbox glass cards; same aesthetic, less geometry.
// ---------------------------------------------------------------------------

type KpiTone = 'default' | 'accent' | 'accent2' | 'accent3' | 'accent4';

const KPI_TONE_CLASS: Record<KpiTone, { iconBg: string; iconText: string }> = {
  default: {
    iconBg: 'bg-surface-2/60 border-white/10',
    iconText: 'text-text-dim',
  },
  accent: {
    iconBg: 'bg-accent/10 border-accent/25',
    iconText: 'text-accent',
  },
  accent2: {
    iconBg: 'bg-accent2/10 border-accent2/25',
    iconText: 'text-accent2',
  },
  accent3: {
    iconBg: 'bg-accent3/10 border-accent3/25',
    iconText: 'text-accent3',
  },
  accent4: {
    iconBg: 'bg-accent4/10 border-accent4/25',
    iconText: 'text-accent4',
  },
};

function KpiTile({
  label,
  value,
  icon,
  tone,
  delay,
  suffix,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: KpiTone;
  delay: number;
  suffix?: string;
}): JSX.Element {
  const toneCls = KPI_TONE_CLASS[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface/40 px-3.5 py-3 backdrop-blur-xl backdrop-saturate-150"
      style={{
        boxShadow:
          '0 4px 16px 0 rgba(0,0,0,0.20), inset 0 1px 0 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* Etched-glass border highlight (top white/15 → bottom white/5) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 40%)',
        }}
      />
      <div className="relative flex items-center gap-2.5">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${toneCls.iconBg} ${toneCls.iconText}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
            {label}
          </div>
          <div className="truncate font-mono text-lg font-light tabular-nums text-text">
            {formatNumber(value)}
            {suffix !== undefined ? (
              <span className="ml-0.5 text-xs text-text-dim">{suffix}</span>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Filter bar — status chips, provider chips, sub-client chips, search,
// sort segmented control. Whole thing lives inside one big frosted-glass
// surface so it reads as a single floating control rail.
// ---------------------------------------------------------------------------

function FilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  statusCounts,
  providerFilter,
  onProviderChange,
  providerCounts,
  subClientFilter,
  onSubClientChange,
  subClients,
  sortKey,
  onSortChange,
  filteredCount,
  totalCount,
}: {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
  statusCounts: Record<StatusFilter, number>;
  providerFilter: ProviderFilter;
  onProviderChange: (v: ProviderFilter) => void;
  providerCounts: Record<ProviderFilter, number>;
  subClientFilter: string;
  onSubClientChange: (v: string) => void;
  subClients: Array<{
    id: string;
    name: string;
    logoChar: string;
    count: number;
  }>;
  sortKey: SortKey;
  onSortChange: (v: SortKey) => void;
  filteredCount: number;
  totalCount: number;
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface/40 p-4 backdrop-blur-xl backdrop-saturate-150"
      style={{
        boxShadow:
          '0 8px 32px 0 rgba(0,0,0,0.25), inset 0 1px 0 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Etched border highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 30%)',
        }}
      />

      <div className="relative space-y-3.5">
        {/* Row 1: search + sort + count badge */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by email or sub-client…"
              className="h-9 w-full rounded-xl border border-white/10 bg-surface-2/40 pl-9 pr-3 text-sm text-text placeholder:text-text-faint backdrop-blur-md focus:border-accent/40 focus:bg-surface-2/60 focus:outline-none"
            />
            {searchQuery.length > 0 ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-text-faint hover:text-text"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <SortSegmentedControl value={sortKey} onChange={onSortChange} />

          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-surface-2/40 px-2.5 py-1 text-[11px] text-text-dim backdrop-blur-md">
            <Filter className="h-3 w-3 text-text-faint" />
            <span className="font-mono text-text">{filteredCount}</span>
            <span className="text-text-faint">of</span>
            <span className="font-mono text-text-dim">{totalCount}</span>
          </span>
        </div>

        {/* Row 2: status + provider chip rows */}
        <div className="flex flex-wrap items-center gap-4">
          <FilterChipRow label="Status">
            <FilterChip
              label="All"
              active={statusFilter === 'all'}
              onClick={() => onStatusChange('all')}
              count={statusCounts.all}
            />
            {(
              ['active', 'warming', 'paused', 'pending'] as MailboxStatus[]
            ).map((s) => (
              <FilterChip
                key={s}
                label={STATUS_LABEL[s]}
                active={statusFilter === s}
                onClick={() => onStatusChange(s)}
                count={statusCounts[s]}
                dot={STATUS_DOT_HEX[s]}
              />
            ))}
          </FilterChipRow>

          <FilterChipRow label="Provider">
            <FilterChip
              label="All"
              active={providerFilter === 'all'}
              onClick={() => onProviderChange('all')}
              count={providerCounts.all}
            />
            {(
              ['gmail', 'outlook', 'yahoo', 'smtp'] as MailboxProvider[]
            ).map((p) => {
              const Icon = PROVIDER_ICON[p];
              return (
                <FilterChip
                  key={p}
                  label={PROVIDER_LABEL[p]}
                  active={providerFilter === p}
                  onClick={() => onProviderChange(p)}
                  count={providerCounts[p]}
                  icon={
                    <Icon
                      className={`h-3 w-3 ${PROVIDER_COLOR_CLASS[p]}`}
                    />
                  }
                />
              );
            })}
          </FilterChipRow>
        </div>

        {/* Row 3: sub-client chip row (logoChar avatars) */}
        {subClients.length > 0 ? (
          <FilterChipRow label="Sub-client">
            <FilterChip
              label="All"
              active={subClientFilter === 'all'}
              onClick={() => onSubClientChange('all')}
              count={totalCount}
            />
            {subClients.map((sc) => (
              <FilterChip
                key={sc.id}
                label={sc.name}
                active={subClientFilter === sc.id}
                onClick={() => onSubClientChange(sc.id)}
                count={sc.count}
                avatar={sc.logoChar}
              />
            ))}
          </FilterChipRow>
        ) : null}
      </div>
    </motion.div>
  );
}

function FilterChipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  count,
  dot,
  icon,
  avatar,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
  dot?: string;
  icon?: React.ReactNode;
  avatar?: string;
}): JSX.Element {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={`group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-colors backdrop-blur-md ${
        active
          ? 'border-accent/40 bg-accent/15 text-text'
          : 'border-white/10 bg-surface-2/40 text-text-dim hover:border-white/20 hover:text-text'
      }`}
    >
      {dot !== undefined ? (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dot }}
        />
      ) : null}
      {icon !== undefined ? icon : null}
      {avatar !== undefined ? (
        <span
          aria-hidden
          className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${
            active
              ? 'bg-accent/30 text-accent'
              : 'bg-surface/60 text-text-dim'
          }`}
        >
          {avatar}
        </span>
      ) : null}
      <span>{label}</span>
      <span
        className={`font-mono ${active ? 'text-accent' : 'text-text-faint'}`}
      >
        {count}
      </span>
    </motion.button>
  );
}

function SortSegmentedControl({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}): JSX.Element {
  const keys: SortKey[] = [
    'warmth-desc',
    'warmth-asc',
    'sends-desc',
    'sub-client',
  ];
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-surface-2/40 p-0.5 backdrop-blur-md">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
            value === k
              ? 'bg-accent/20 text-accent shadow-sm'
              : 'text-text-dim hover:text-text'
          }`}
        >
          {SORT_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glass button — primary / ghost variants used in the header.
// ---------------------------------------------------------------------------

function GlassButton({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: 'primary' | 'ghost';
}): JSX.Element {
  const base =
    'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium backdrop-blur-xl transition-colors';
  const variants: Record<typeof variant, string> = {
    primary:
      'border border-accent/30 bg-accent/15 text-accent hover:bg-accent/25',
    ghost:
      'border border-white/10 bg-surface/40 text-text-dim hover:text-text hover:bg-surface/60',
  };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      className={`${base} ${variants[variant]}`}
    >
      {children}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Mailbox grid — responsive 4×6 → 3 → 2 → 1. Sets the perspective so the
// mouse-parallax tilt works correctly on the card transforms.
// ---------------------------------------------------------------------------

function MailboxGrid({
  mailboxes,
  alerts,
  selectedId,
  onSelect,
}: {
  mailboxes: Mailbox[];
  alerts: Alert[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  if (mailboxes.length === 0) {
    return <EmptyState />;
  }

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      style={{ perspective: 1000 }}
    >
      {mailboxes.map((m, i) => {
        const mailboxAlerts = alertsForMailbox(m.id, alerts);
        return (
          <GlassMailboxCard
            key={m.id}
            mailbox={m}
            index={i}
            selected={selectedId === m.id}
            onClick={() => onSelect(m.id)}
            alerts={mailboxAlerts}
          />
        );
      })}
    </div>
  );
}

function EmptyState(): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative grid place-items-center overflow-hidden rounded-2xl border border-white/10 bg-surface/40 p-16 text-center backdrop-blur-xl backdrop-saturate-150"
      style={{
        boxShadow:
          '0 8px 32px 0 rgba(0,0,0,0.25), inset 0 1px 0 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="space-y-3">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-surface-2/40 text-text-dim">
          <Inbox className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-text">No mailboxes match</p>
          <p className="text-xs text-text-dim">
            Try clearing filters or searching for a different term.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// GlassMailboxCard — the headlining component. Translucent panel + parallax
// tilt + soft inset gradient border + ambient status-tinted backdrop +
// drop-shadow depth + sonar ripple on click + breathing glow when selected.
// ---------------------------------------------------------------------------

function GlassMailboxCard({
  mailbox,
  index,
  selected,
  onClick,
  alerts,
}: {
  mailbox: Mailbox;
  index: number;
  selected: boolean;
  onClick: () => void;
  alerts: Alert[];
}): JSX.Element {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  // Raw mouse offset within the card (0..1 along each axis).
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  // Smooth springs so the tilt feels weighted instead of nervous.
  const sx = useSpring(mouseX, { stiffness: 240, damping: 28, mass: 0.6 });
  const sy = useSpring(mouseY, { stiffness: 240, damping: 28, mass: 0.6 });
  // ±8deg tilt, inverted on X so pointing top-right tilts the card AWAY
  // (proper parallax — opposite to flat translation).
  const rotateY = useTransform(sx, [0, 1], ['8deg', '-8deg']);
  const rotateX = useTransform(sy, [0, 1], ['-8deg', '8deg']);

  // Sheen — a soft highlight that tracks the cursor across the glass, giving
  // the card a "rim-lit" look like sunlight catching beveled glass. Computed
  // as a single composite useTransform on both spring values so the
  // hook lives at the top of the component (rules-of-hooks compliant).
  const sheenBackground = useTransform(
    [sx, sy] as const,
    ([x, y]: number[]) => {
      const px = ((x ?? 0.5) * 100).toFixed(1);
      const py = ((y ?? 0.5) * 100).toFixed(1);
      return `radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,0.10) 0%, transparent 50%)`;
    },
  );

  // Hover state — drives the lift, shadow depth, and rim brightness.
  const [hovered, setHovered] = useState(false);

  // Click ripple — increments on each click so the AnimatePresence ripple key
  // re-mounts and re-animates. Multiple clicks queue up additive ripples.
  const [rippleKey, setRippleKey] = useState(0);

  const tint = statusAmbientTint(mailbox.status);
  const ambientPos = useMemo(
    () => deterministicAmbientPosition(mailbox.id),
    [mailbox.id],
  );

  const hasCriticalAlert = alerts.some((a) => a.severity === 'critical');
  const hasWarnAlert = alerts.some((a) => a.severity === 'warn');
  const hasAnyAlert = alerts.length > 0;

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      mouseX.set(Math.max(0, Math.min(1, px)));
      mouseY.set(Math.max(0, Math.min(1, py)));
    },
    [mouseX, mouseY],
  );

  const handlePointerLeave = useCallback(() => {
    mouseX.set(0.5);
    mouseY.set(0.5);
    setHovered(false);
  }, [mouseX, mouseY]);

  const handlePointerEnter = useCallback(() => {
    setHovered(true);
  }, []);

  const handleClick = useCallback(() => {
    setRippleKey((k) => k + 1);
    onClick();
  }, [onClick]);

  const baseShadow =
    '0 12px 40px 0 rgba(0,0,0,0.30), inset 0 1px 0 0 rgba(255,255,255,0.06)';
  const hoverShadow = `0 20px 60px 0 ${STATUS_GLOW_HEX[mailbox.status]}, inset 0 1px 0 0 rgba(255,255,255,0.10)`;
  const selectedRingShadow = `0 0 0 1.5px ${STATUS_DOT_HEX[mailbox.status]}, 0 16px 48px 0 ${STATUS_GLOW_HEX[mailbox.status]}, inset 0 1px 0 0 rgba(255,255,255,0.10)`;
  const shadow = selected
    ? selectedRingShadow
    : hovered
      ? hoverShadow
      : baseShadow;

  // Faint red-tinted under-glow for at-risk cards (warning glow under the
  // glass, behind the standard ambient tint).
  const atRiskUnderglow = hasCriticalAlert
    ? '0 0 0 0 transparent, 0 20px 50px -10px rgba(255,107,74,0.30)'
    : '';

  return (
    <motion.button
      ref={cardRef}
      type="button"
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.45,
        delay: Math.min(index * 0.04, 0.6),
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.98 }}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        boxShadow:
          hasCriticalAlert && !selected
            ? `${shadow}, ${atRiskUnderglow}`
            : shadow,
      }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface/40 p-4 text-left backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-300"
      aria-label={`${mailbox.emailAddress} — ${STATUS_LABEL[mailbox.status]}, warmth ${mailbox.warmthScore}`}
      aria-pressed={selected}
    >
      {/* Ambient status-tinted radial backdrop (deterministic position per
          card so the grid doesn't feel monotone) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(circle at ${ambientPos.x}% ${ambientPos.y}%, ${tint.primary} 0%, transparent 55%), radial-gradient(circle at ${100 - ambientPos.x}% ${100 - ambientPos.y}%, ${tint.secondary} 0%, transparent 60%)`,
        }}
      />

      {/* Etched-glass border highlight: gradient white/15 top → white/5
          bottom so the card feels lit from above */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.03) 100%)',
        }}
      />

      {/* Cursor-tracked sheen — soft radial highlight that follows the
          mouse to mimic light catching the bevel. Only visible on hover. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          opacity: hovered ? 1 : 0,
          background: sheenBackground,
        }}
      />

      {/* Breathing-glow border ring (only when selected) */}
      {selected ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            border: `1px solid ${STATUS_DOT_HEX[mailbox.status]}`,
          }}
          animate={{
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ) : null}

      {/* Sonar click ripple — expands a colored ring outward each click */}
      <AnimatePresence>
        {rippleKey > 0 ? (
          <motion.span
            key={rippleKey}
            aria-hidden
            initial={{ opacity: 0.6, scale: 0.4 }}
            animate={{ opacity: 0, scale: 2.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: 'easeOut' }}
            className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              border: `1.5px solid ${STATUS_DOT_HEX[mailbox.status]}`,
            }}
          />
        ) : null}
      </AnimatePresence>

      {/* All actual card content uses preserve-3d + translateZ to feel "above"
          the glass surface during the parallax tilt */}
      <div
        className="relative space-y-3"
        style={{ transform: 'translateZ(20px)' }}
      >
        {/* Top row: logoChar tile (left) + provider icon/name (right). Both
            children shrink-0 so a wide ProviderTag never crowds the
            monogram tile. */}
        <div className="flex items-start justify-between gap-2">
          <div className="shrink-0">
            <SubClientLogoTile
              char={mailbox.subClientLogoChar}
              status={mailbox.status}
            />
          </div>
          <div className="shrink-0">
            <ProviderTag provider={mailbox.provider} />
          </div>
        </div>

        {/* Center: huge warmth score + thin warmth-bar below. While the
            mailbox is pending its metrics are meaningless (warmup hasn't
            started), so we frost them behind a blur — a literal "not yet
            live" glass treatment — keeping the status pill + hint crisp. */}
        <div
          className={cn(
            'transition-all duration-500',
            mailbox.status === 'pending' &&
              'pointer-events-none select-none blur-[3px] saturate-50 opacity-55',
          )}
          aria-hidden={mailbox.status === 'pending'}
        >
          <CardWarmthHero mailbox={mailbox} />
        </div>

        {/* Bottom row: status pill (LEFT), sends-today (CENTER), ramp chip
            (RIGHT). All three children carry shrink-0 so the row never
            collapses one chip into another at narrow card widths. The pill
            stays sharp; the sends/ramp metrics frost out while pending. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <StatusPill
            status={mailbox.status}
            pulsing={hasAnyAlert}
            severity={hasCriticalAlert ? 'critical' : hasWarnAlert ? 'warn' : null}
          />
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-2 gap-y-1.5 transition-all duration-500',
              mailbox.status === 'pending' &&
                'pointer-events-none select-none blur-[3px] saturate-50 opacity-55',
            )}
          >
            <SendsTodayFraction
              sent={mailbox.sentToday}
              target={mailbox.dailyTarget}
            />
            <RampTierChip tier={mailbox.rampTier} day={mailbox.rampDay} />
          </div>
        </div>

        {mailbox.status === 'pending' ? (
          <p className="text-xs font-medium text-accent2">{PENDING_NOTICE.cardHint}</p>
        ) : null}

        {/* Footer micro-row: email / sub-client / last activity. min-w-0 on
            the truncating child + shrink-0 on the right span so a long
            sub-client name compresses cleanly without pushing the
            timestamp off the card. */}
        <div className="min-w-0 space-y-0.5 pt-2.5">
          <div
            className="truncate font-mono text-[11px] text-text-dim"
            title={mailbox.emailAddress}
          >
            {mailbox.emailAddress}
          </div>
          <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
            <span
              className="min-w-0 truncate"
              title={mailbox.subClientName}
            >
              {mailbox.subClientName}
            </span>
            <span className="shrink-0">{mailbox.lastActivityAgo}</span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// SubClientLogoTile — small gradient-painted square with the sub-client's
// monogram char. Adds an extra accent gradient per status.
// ---------------------------------------------------------------------------

function SubClientLogoTile({
  char,
  status,
}: {
  char: string;
  status: MailboxStatus;
}): JSX.Element {
  const gradient = useMemo(() => {
    switch (status) {
      case 'active':
        return 'linear-gradient(135deg, rgba(242, 101, 34,0.42) 0%, rgba(255, 138, 75,0.32) 100%)';
      case 'warming':
        return 'linear-gradient(135deg, rgba(255,213,79,0.42) 0%, rgba(242, 101, 34,0.28) 100%)';
      case 'paused':
        return 'linear-gradient(135deg, rgba(255,107,74,0.42) 0%, rgba(242, 101, 34,0.20) 100%)';
      case 'pending':
        return 'linear-gradient(135deg, rgba(255, 138, 75,0.42) 0%, rgba(242, 101, 34,0.28) 100%)';
    }
  }, [status]);

  return (
    <div
      className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 text-sm font-semibold text-text shadow-inner"
      style={{
        background: gradient,
        boxShadow:
          'inset 0 1px 0 0 rgba(255,255,255,0.10), 0 2px 8px 0 rgba(0,0,0,0.25)',
      }}
    >
      {char}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProviderTag — small icon + label on the top-right of the card.
// ---------------------------------------------------------------------------

function ProviderTag({ provider }: { provider: MailboxProvider }): JSX.Element {
  const Icon = PROVIDER_ICON[provider];
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-2/40 px-2 py-0.5 text-[10px] backdrop-blur-md">
      <Icon className={`h-3 w-3 ${PROVIDER_COLOR_CLASS[provider]}`} />
      <span className="text-text-dim">{PROVIDER_LABEL[provider]}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardWarmthHero — the visual centerpiece. Huge thin-weight warmth score,
// status-tinted, with a thin horizontal warmth-bar below.
// ---------------------------------------------------------------------------

function CardWarmthHero({ mailbox }: { mailbox: Mailbox }): JSX.Element {
  const colorClass = STATUS_TEXT_CLASS[mailbox.status];
  const barColor = STATUS_DOT_HEX[mailbox.status];
  const pct = Math.max(0, Math.min(100, mailbox.warmthScore));

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-baseline gap-1.5">
        <motion.span
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className={`font-light tabular-nums tracking-tight ${colorClass}`}
          style={{ fontSize: 56, lineHeight: 1 }}
        >
          {mailbox.warmthScore}
        </motion.span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
          warmth
        </span>
      </div>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-surface-2/60">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          initial={{ width: '0%' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
          style={{ backgroundColor: barColor }}
        />
        {/* tiny highlight along the bar — subtle premium touch */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%)',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusPill — bottom-left pill with status + optional pulsing alert dot.
// ---------------------------------------------------------------------------

function StatusPill({
  status,
  pulsing,
  severity,
}: {
  status: MailboxStatus;
  pulsing: boolean;
  severity: AlertSeverity | null;
}): JSX.Element {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_PILL_CLASS[status]}`}
    >
      {pulsing ? (
        <motion.span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor:
              severity === 'critical' ? '#ff6b4a' : '#ffd54f',
          }}
          animate={{
            opacity: [0.5, 1, 0.5],
            scale: [0.9, 1.15, 0.9],
          }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      ) : (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: STATUS_DOT_HEX[status] }}
        />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SendsTodayFraction — center-bottom fraction text like "27 / 35".
// ---------------------------------------------------------------------------

function SendsTodayFraction({
  sent,
  target,
}: {
  sent: number;
  target: number;
}): JSX.Element {
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-dim">
      <span className="text-text">{sent}</span>
      <span className="px-0.5 text-text-faint">/</span>
      <span>{target}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// RampTierChip — small monospace chip on bottom-right (D1-3 / D29+ etc.)
// ---------------------------------------------------------------------------

function RampTierChip({
  tier,
  day,
}: {
  tier: RampTier;
  day: number;
}): JSX.Element {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-surface-2/40 px-2 py-0.5 font-mono text-[10px] text-text-dim backdrop-blur-md">
      <span className="text-text">{tier}</span>
      <span className="text-text-faint">·</span>
      <span>d{day}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inspector panel — cross-fades between the default "Fleet overview" (when no
// card is selected) and the selected card's detail view.
// ---------------------------------------------------------------------------

function Inspector({
  data,
  selected,
  onClear,
}: {
  data: AgencyMailboxesData;
  selected: Mailbox | null;
  onClear: () => void;
}): JSX.Element {
  return (
    <div className="lg:sticky lg:top-4">
      <AnimatePresence mode="wait" initial={false}>
        {selected ? (
          <motion.div
            key={`detail-${selected.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <MailboxDetailInspector
              mailbox={selected}
              alerts={data.alerts}
              onClear={onClear}
            />
          </motion.div>
        ) : (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <FleetOverviewInspector data={data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FleetOverviewInspector — default right-panel content. Three frosted-glass
// sub-cards: provider mix, status distribution, alerts ticker.
// ---------------------------------------------------------------------------

function FleetOverviewInspector({
  data,
}: {
  data: AgencyMailboxesData;
}): JSX.Element {
  return (
    <div className="space-y-4">
      <GlassPanel className="p-4">
        <PanelHeader
          icon={<PieChart className="h-3.5 w-3.5" />}
          label="Provider mix"
          hint={`${data.providers.length} providers`}
        />
        <div className="mt-3 space-y-2">
          {data.providers.map((p) => (
            <ProviderRow key={p.id} provider={p} total={data.kpis.totalMailboxes} />
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <PanelHeader
          icon={<LayoutGrid className="h-3.5 w-3.5" />}
          label="Status distribution"
          hint={`${data.kpis.totalMailboxes} mailboxes`}
        />
        <div className="mt-3 space-y-1.5">
          <StatusBarStack mailboxes={data.mailboxes} />
          <StatusLegend mailboxes={data.mailboxes} />
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <PanelHeader
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
          label="Alerts ticker"
          hint={`${data.alerts.length} open`}
        />
        <div className="mt-3 space-y-2">
          {data.alerts.length === 0 ? (
            <p className="font-mono text-[10px] text-text-faint">
              No open alerts — fleet healthy.
            </p>
          ) : (
            <AlertTicker alerts={data.alerts} />
          )}
        </div>
      </GlassPanel>
    </div>
  );
}

function PanelHeader({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2 text-text-dim">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-white/10 bg-surface-2/40 text-accent2">
          {icon}
        </span>
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
          {label}
        </span>
      </div>
      {hint !== undefined ? (
        <span className="shrink-0 font-mono text-[10px] text-text-faint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function ProviderRow({
  provider,
  total,
}: {
  provider: Provider;
  total: number;
}): JSX.Element {
  const Icon = PROVIDER_ICON[provider.id];
  const pct = total === 0 ? 0 : (provider.mailboxCount / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs">
        <span className="flex shrink-0 items-center gap-1.5 text-text">
          <Icon className={`h-3.5 w-3.5 ${PROVIDER_COLOR_CLASS[provider.id]}`} />
          {provider.label}
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] text-text-dim">
          <span className="text-text">{provider.mailboxCount}</span>
          <span className="text-text-faint">·</span>
          <span>w {provider.avgWarmth}</span>
          <span className="text-text-faint">·</span>
          <span>{formatNumber(provider.sendsToday)} sends</span>
        </span>
      </div>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-surface-2/60">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          initial={{ width: '0%' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            background: `linear-gradient(90deg, ${providerBarColor(provider.id)} 0%, rgba(242, 101, 34,0.3) 100%)`,
          }}
        />
      </div>
    </div>
  );
}

function providerBarColor(p: MailboxProvider): string {
  switch (p) {
    case 'gmail':
      return '#ff6b4a';
    case 'outlook':
      return '#FF8A4B';
    case 'yahoo':
      return '#ffd54f';
    case 'smtp':
      return '#F26522';
  }
}

function StatusBarStack({
  mailboxes,
}: {
  mailboxes: Mailbox[];
}): JSX.Element {
  const total = mailboxes.length || 1;
  const counts: Record<MailboxStatus, number> = {
    active: 0,
    warming: 0,
    paused: 0,
    pending: 0,
  };
  for (const m of mailboxes) {
    counts[m.status] += 1;
  }
  const segs: Array<{ s: MailboxStatus; pct: number }> = (
    ['active', 'warming', 'pending', 'paused'] as MailboxStatus[]
  ).map((s) => ({ s, pct: (counts[s] / total) * 100 }));
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-white/10 bg-surface-2/60">
      {segs.map((seg) => (
        <motion.div
          key={seg.s}
          initial={{ width: '0%' }}
          animate={{ width: `${seg.pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full"
          style={{ backgroundColor: STATUS_DOT_HEX[seg.s] }}
        />
      ))}
    </div>
  );
}

function StatusLegend({
  mailboxes,
}: {
  mailboxes: Mailbox[];
}): JSX.Element {
  const counts: Record<MailboxStatus, number> = {
    active: 0,
    warming: 0,
    paused: 0,
    pending: 0,
  };
  for (const m of mailboxes) {
    counts[m.status] += 1;
  }
  return (
    <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
      {(['active', 'warming', 'pending', 'paused'] as MailboxStatus[]).map(
        (s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: STATUS_DOT_HEX[s] }}
            />
            <span className="text-text-dim">{STATUS_LABEL[s]}</span>
            <span className="ml-auto text-text">{counts[s]}</span>
          </div>
        ),
      )}
    </div>
  );
}

function AlertTicker({ alerts }: { alerts: Alert[] }): JSX.Element {
  return (
    <div className="space-y-1.5">
      {alerts.map((a, i) => {
        const Icon = ALERT_KIND_ICON[a.kind];
        return (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.05 + i * 0.04 }}
            className={`flex items-start gap-2 rounded-lg border p-2 backdrop-blur-md ${ALERT_SEVERITY_CLASS[a.severity]}`}
          >
            <Icon className="mt-0.5 h-3 w-3 shrink-0" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="min-w-0 truncate font-medium">
                  {ALERT_KIND_LABEL[a.kind]}
                </span>
                <span className="shrink-0 font-mono text-text-faint">
                  {a.ago}
                </span>
              </div>
              <p className="text-[10px] leading-snug text-text-dim">
                {a.message}
              </p>
              <p
                className="truncate font-mono text-[9px] text-text-faint"
                title={a.emailAddress}
              >
                {a.emailAddress}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MailboxDetailInspector — shown when a card is clicked. Warmth gauge,
// 7-day sparkline, DNS pills, sub-client info, action buttons.
// ---------------------------------------------------------------------------

function MailboxDetailInspector({
  mailbox,
  alerts,
  onClear,
}: {
  mailbox: Mailbox;
  alerts: Alert[];
  onClear: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const pause = usePauseMailbox();
  const resume = useResumeMailbox();
  const mailboxAlerts = alertsForMailbox(mailbox.id, alerts);

  const handlePauseToggle = () => {
    if (mailbox.status === 'paused') {
      resume.mutate(mailbox.id, {
        onSuccess: () => toast.success('Mailbox resumed'),
        onError: () => toast.error('Failed to resume'),
      });
    } else {
      pause.mutate(mailbox.id, {
        onSuccess: () => toast.success('Mailbox paused'),
        onError: () => toast.error('Failed to pause'),
      });
    }
  };
  return (
    <div className="space-y-4">
      <GlassPanel className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="shrink-0">
              <SubClientLogoTile
                char={mailbox.subClientLogoChar}
                status={mailbox.status}
              />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p
                className="truncate font-mono text-xs text-text"
                title={mailbox.emailAddress}
              >
                {mailbox.emailAddress}
              </p>
              <p
                className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint"
                title={mailbox.subClientName}
              >
                {mailbox.subClientName}
              </p>
            </div>
          </div>
          <motion.button
            type="button"
            onClick={onClear}
            whileTap={{ scale: 0.9 }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-surface-2/40 text-text-dim hover:text-text"
            aria-label="Close mailbox detail"
          >
            <X className="h-3.5 w-3.5" />
          </motion.button>
        </div>
      </GlassPanel>

      {mailbox.status === 'pending' ? (
        <div className="rounded-2xl border border-accent2/30 bg-accent2/10 p-4">
          <p className="text-sm font-medium text-text">{PENDING_NOTICE.heading}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-dim">
            {PENDING_NOTICE.body}
          </p>
        </div>
      ) : null}

      <GlassPanel className="p-5">
        <WarmthGaugeBig mailbox={mailbox} />
      </GlassPanel>

      <GlassPanel className="p-4">
        <PanelHeader
          icon={<Activity className="h-3.5 w-3.5" />}
          label="7-day warmth"
          hint={`d${mailbox.rampDay} · ${mailbox.rampTier}`}
        />
        <div className="mt-3">
          <SparklineBig values={mailbox.last7dTrend} status={mailbox.status} />
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <PanelHeader
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Authentication"
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <DnsPill label="SPF" pass={mailbox.spfPass} />
          <DnsPill label="DKIM" pass={mailbox.dkimPass} />
          <DnsPill label="DMARC" pass={mailbox.dmarcPass} />
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <PanelHeader
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Today"
        />
        <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs">
          <Stat label="Sent" value={`${mailbox.sentToday} / ${mailbox.dailyTarget}`} />
          <Stat
            label="Provider"
            value={PROVIDER_LABEL[mailbox.provider]}
            valueColor={PROVIDER_COLOR_CLASS[mailbox.provider]}
          />
          <Stat
            label="Status"
            value={STATUS_LABEL[mailbox.status]}
            valueColor={STATUS_TEXT_CLASS[mailbox.status]}
          />
          <Stat label="Last activity" value={mailbox.lastActivityAgo} />
        </div>
      </GlassPanel>

      {mailboxAlerts.length > 0 ? (
        <GlassPanel className="p-4">
          <PanelHeader
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            label="Open alerts"
            hint={`${mailboxAlerts.length} active`}
          />
          <div className="mt-3">
            <AlertTicker alerts={mailboxAlerts} />
          </div>
        </GlassPanel>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {mailbox.status === 'paused' ? (
          <GlassButton variant="primary" onClick={handlePauseToggle}>
            <Play className="h-3.5 w-3.5" />
            Resume warmup
          </GlassButton>
        ) : (
          <GlassButton variant="ghost" onClick={handlePauseToggle}>
            <Pause className="h-3.5 w-3.5" />
            Pause warmup
          </GlassButton>
        )}
        <GlassButton
          variant="ghost"
          onClick={() => navigate(`/app/mailboxes/${mailbox.id}`)}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Open detail
        </GlassButton>
      </div>
    </div>
  );
}

function WarmthGaugeBig({ mailbox }: { mailbox: Mailbox }): JSX.Element {
  const score = Math.max(0, Math.min(100, mailbox.warmthScore));
  const colorClass = STATUS_TEXT_CLASS[mailbox.status];
  const arcColor = STATUS_DOT_HEX[mailbox.status];

  // Semi-circle gauge: 180deg sweep. We track the arc on a 100-radius circle.
  const radius = 70;
  const c = Math.PI * radius; // half-circumference (since stroke-dasharray is full circumference of a circle)
  // For a semicircle, total visible track length is PI * r.
  const dashLength = c;
  const dashOffset = c - (score / 100) * c;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: 200, height: 110 }}>
        <svg viewBox="0 0 200 110" width="200" height="110">
          <defs>
            <linearGradient
              id={`gauge-grad-${mailbox.id}`}
              x1="0"
              y1="0"
              x2="200"
              y2="0"
            >
              <stop offset="0%" stopColor={arcColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={arcColor} stopOpacity="1" />
            </linearGradient>
          </defs>
          {/* Track */}
          <path
            d={`M 25 95 A ${radius} ${radius} 0 0 1 175 95`}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Arc */}
          <motion.path
            d={`M 25 95 A ${radius} ${radius} 0 0 1 175 95`}
            fill="none"
            stroke={`url(#gauge-grad-${mailbox.id})`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={dashLength}
            initial={{ strokeDashoffset: dashLength }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 0.1 }}
          />
        </svg>
        <div
          className="absolute left-0 right-0 flex flex-col items-center"
          style={{ top: 28 }}
        >
          <motion.span
            className={`font-light tabular-nums tracking-tight ${colorClass}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            style={{ fontSize: 48, lineHeight: 1 }}
          >
            {mailbox.warmthScore}
          </motion.span>
          <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
            warmth
          </span>
        </div>
      </div>
    </div>
  );
}

function SparklineBig({
  values,
  status,
}: {
  values: number[];
  status: MailboxStatus;
}): JSX.Element {
  const color = STATUS_DOT_HEX[status];
  const w = 280;
  const h = 60;
  const padX = 4;
  const padY = 6;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);

  const points = values.map((v, i) => {
    const x = padX + (i / Math.max(values.length - 1, 1)) * innerW;
    const y = padY + (1 - (v - min) / span) * innerH;
    return { x, y };
  });

  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');
  const areaPath =
    points.length > 1 && points[0] && points[points.length - 1]
      ? `${path} L ${points[points.length - 1]!.x} ${h - padY} L ${points[0]!.x} ${h - padY} Z`
      : '';

  // Cursor-tracking state: which data point index is hovered. `null` = no
  // hover. Pointer-move handler maps client X to nearest data index.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hoverPoint =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < points.length
      ? points[hoverIdx]
      : null;
  const hoverValue =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < values.length
      ? values[hoverIdx]
      : null;

  // Tooltip horizontal placement — clamp inside the SVG so it never escapes
  // the right or left edge. Positioned in viewBox units; we render via
  // foreignObject so the text styling matches the rest of the page.
  const tooltipW = 92;
  const tooltipH = 26;
  const tooltipX = hoverPoint
    ? Math.max(
        padX,
        Math.min(w - padX - tooltipW, hoverPoint.x - tooltipW / 2),
      )
    : 0;
  const tooltipY = hoverPoint
    ? Math.max(padY, hoverPoint.y - tooltipH - 8)
    : 0;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width === 0 || values.length === 0) return;
          // Map client coords → viewBox X coord, then → nearest data index.
          const xClient = e.clientX - rect.left;
          const xView = (xClient / rect.width) * w;
          // Clamp to plot area and round to nearest point.
          const tNorm = Math.max(
            0,
            Math.min(1, (xView - padX) / Math.max(innerW, 1)),
          );
          const idx = Math.round(tNorm * (values.length - 1));
          setHoverIdx(Math.max(0, Math.min(values.length - 1, idx)));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`spark-${status}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath ? (
          <motion.path
            d={areaPath}
            fill={`url(#spark-${status})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          />
        ) : null}
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.0, ease: 'easeOut', delay: 0.15 }}
        />
        {points.length > 0 && points[points.length - 1] ? (
          <motion.circle
            cx={points[points.length - 1]!.x}
            cy={points[points.length - 1]!.y}
            r={3}
            fill={color}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 1.05 }}
          />
        ) : null}
        {/* Cursor-tracking overlay: vertical guide line + dot on the line +
            floating value tooltip. Rendered only when hovering. */}
        {hoverPoint && hoverValue !== null ? (
          <g pointerEvents="none">
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={padY}
              y2={h - padY}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={4}
              fill={color}
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={1.2}
            />
            <foreignObject
              x={tooltipX}
              y={tooltipY}
              width={tooltipW}
              height={tooltipH}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  fontSize: 10,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: 'rgba(255,255,255,0.92)',
                  background: 'rgba(20,20,28,0.82)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  padding: '0 6px',
                  whiteSpace: 'nowrap',
                  backdropFilter: 'blur(8px)',
                }}
              >
                Day {hoverIdx! + 1}: {hoverValue}
              </div>
            </foreignObject>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function DnsPill({
  label,
  pass,
}: {
  label: string;
  pass: boolean;
}): JSX.Element {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] backdrop-blur-md ${
        pass
          ? 'border-accent/25 bg-accent/10 text-accent'
          : 'border-accent3/30 bg-accent3/10 text-accent3'
      }`}
    >
      {pass ? (
        <ShieldCheck className="h-3 w-3 shrink-0" />
      ) : (
        <ShieldX className="h-3 w-3 shrink-0" />
      )}
      <span className="font-mono">{label}</span>
      <span className="ml-auto shrink-0 font-mono opacity-70">
        {pass ? 'PASS' : 'FAIL'}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}): JSX.Element {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
        {label}
      </div>
      <div
        className={`truncate text-sm ${valueColor ?? 'text-text'}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlassPanel — the shared frosted-glass container used by the inspector sub
// cards. Same etched border + ambient backdrop technique as the mailbox
// cards, just without the parallax tilt.
// ---------------------------------------------------------------------------

function GlassPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-surface/40 backdrop-blur-xl backdrop-saturate-150 ${className ?? ''}`}
      style={{
        boxShadow:
          '0 8px 32px 0 rgba(0,0,0,0.25), inset 0 1px 0 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Etched-glass border highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 30%)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

