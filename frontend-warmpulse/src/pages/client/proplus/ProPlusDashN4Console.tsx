import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronUp,
  Gauge,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/AppToast';
import {
  MAILBOXES_KEY,
  usePauseMailbox,
  useResumeMailbox,
} from '@/features/mailboxes/api';

/**
 * ProPlusDashN4Console — "Console (Master–Detail)" Pro-Plus dashboard.
 *
 * An interaction-driven two-pane workspace, the way an email client / IDE /
 * Postman is laid out — NOT a scrolling report and NOT a card grid.
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  GLOBAL SUMMARY BAR  (avg warmth · sends today · warming · PM)  │
 *   ├───────────────┬────────────────────────────────────────────────┤
 *   │  MASTER RAIL  │  DETAIL PANE                                    │
 *   │  search/sort  │  header (email · provider · ramp · actions)     │
 *   │  15 ranked    │  warmth trend · today stats · DNS row ·         │
 *   │  selectable   │  recent activity · Pro-Plus Postmaster/SNDS     │
 *   │  rows (scroll)│  (swaps with AnimatePresence on selected id)    │
 *   └───────────────┴────────────────────────────────────────────────┘
 *
 * The whole surface is a single fixed-height shell with NO page scroll: only
 * the master rail and the detail body scroll internally. Clicking a rail row
 * sets local state and animates the detail pane swapping in — there is no
 * router, no network, no query hooks and no required props. Every number is
 * inlined in MOCK so the isolated preview harness can mount it by name. The
 * first mailbox is selected by default.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';
type MailboxStatus = 'active' | 'warming' | 'paused';
type DnsState = 'pass' | 'warn' | 'fail';
type SignalState = 'good' | 'watch' | 'bad';
type ActivityAction = 'sent' | 'opened' | 'replied' | 'starred' | 'spam_rescued';

interface SparkPoint {
  i: number;
  v: number;
}

interface ActivityItem {
  id: string;
  minutesAgo: number;
  peer: string;
  action: ActivityAction;
}

interface DomainSignal {
  source: 'Postmaster' | 'SNDS';
  label: string;
  value: string;
  state: SignalState;
  detail: string;
  /** 0..100 strength meter. */
  strength: number;
}

export interface MailboxRecord {
  id: string;
  email: string;
  domain: string;
  provider: Provider;
  status: MailboxStatus;
  warmth: number;
  delta: number;
  day: number;
  rampTarget: number;
  sends: number;
  sendTarget: number;
  opens: number;
  replies: number;
  inboxPct: number;
  spamPct: number;
  dns: { spf: DnsState; dkim: DnsState; dmarc: DnsState };
  /** 14-point warmth sparkline (oldest → newest). */
  spark: number[];
  activity: ActivityItem[];
  signals: DomainSignal[];
}

export interface FleetSummary {
  avgWarmth: number;
  warmthDelta: number;
  mailboxCount: number;
  warmingCount: number;
  sendsToday: number;
  sendTarget: number;
  postmasterHealth: 'Healthy' | 'Watch' | 'At risk';
  sndsHealth: 'Green' | 'Yellow' | 'Red';
}

export interface ConsoleData {
  summary: FleetSummary;
  mailboxes: MailboxRecord[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro Plus numbers, 15 mailboxes
// ---------------------------------------------------------------------------

/** 14-pt warmth sparkline ending near `end`, climbing by `rise`, jittered. */
function spark(end: number, rise: number): number[] {
  return Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const v = end - rise + rise * t + Math.sin(i * 1.1 + end) * 1.8;
    return Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
  });
}

function pmSignals(rep: string, repState: SignalState, repStr: number): DomainSignal[] {
  return [
    {
      source: 'Postmaster',
      label: 'Gmail domain trust',
      value: rep,
      state: repState,
      detail:
        repState === 'good'
          ? 'Stable across the last 14 days'
          : 'Recovering — watch over next 7 days',
      strength: repStr,
    },
    {
      source: 'Postmaster',
      label: 'Gmail spam rate',
      value: repState === 'good' ? '0.06%' : '0.18%',
      state: repState === 'bad' ? 'watch' : 'good',
      detail: 'Hard threshold is 0.30%',
      strength: repState === 'good' ? 96 : 78,
    },
    {
      source: 'SNDS',
      label: 'Outlook IP / filter result',
      value: repState === 'good' ? 'Green' : 'Yellow',
      state: repState === 'good' ? 'good' : 'watch',
      detail: repState === 'good' ? '0 complaints in window' : '2 complaints in window',
      strength: repState === 'good' ? 93 : 71,
    },
  ];
}

function act(
  id: string,
  minutesAgo: number,
  peer: string,
  action: ActivityAction,
): ActivityItem {
  return { id, minutesAgo, peer, action };
}

const MOCK: ConsoleData = {
  summary: {
    avgWarmth: 84,
    warmthDelta: 2.6,
    mailboxCount: 15,
    warmingCount: 12,
    sendsToday: 648,
    sendTarget: 840,
    postmasterHealth: 'Healthy',
    sndsHealth: 'Green',
  },
  mailboxes: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      domain: 'acme.io',
      provider: 'gmail',
      status: 'active',
      warmth: 92,
      delta: 1.3,
      day: 29,
      rampTarget: 75,
      sends: 70,
      sendTarget: 75,
      opens: 58,
      replies: 21,
      inboxPct: 96.1,
      spamPct: 0.4,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      spark: spark(92, 8),
      activity: [
        act('a1', 1, 'maya.r@hubspot-peer.net', 'replied'),
        act('a2', 6, 'devon@peer-inbox.io', 'opened'),
        act('a3', 14, 'lina.k@peernet.co', 'sent'),
        act('a4', 27, 'omar@peer-inbox.io', 'starred'),
        act('a5', 41, 'jess@peernet.co', 'opened'),
      ],
      signals: pmSignals('High', 'good', 95),
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      domain: 'acme.io',
      provider: 'outlook',
      status: 'active',
      warmth: 90,
      delta: 2.0,
      day: 28,
      rampTarget: 72,
      sends: 66,
      sendTarget: 72,
      opens: 54,
      replies: 19,
      inboxPct: 95.0,
      spamPct: 0.6,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      spark: spark(90, 10),
      activity: [
        act('a1', 2, 'devon@peer-inbox.io', 'opened'),
        act('a2', 9, 'noah.b@peer-inbox.io', 'sent'),
        act('a3', 18, 'priya@peernet.co', 'replied'),
        act('a4', 33, 'ava@peernet.co', 'opened'),
        act('a5', 52, 'tom.h@peer-inbox.io', 'sent'),
      ],
      signals: pmSignals('High', 'good', 92),
    },
    {
      id: 'mb-3',
      email: 'success@acme.io',
      domain: 'acme.io',
      provider: 'gmail',
      status: 'active',
      warmth: 87,
      delta: 1.7,
      day: 26,
      rampTarget: 68,
      sends: 60,
      sendTarget: 68,
      opens: 48,
      replies: 16,
      inboxPct: 93.8,
      spamPct: 0.9,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'warn' },
      spark: spark(87, 9),
      activity: [
        act('a1', 4, 'lina.k@peernet.co', 'sent'),
        act('a2', 12, 'raj.p@peer-inbox.io', 'replied'),
        act('a3', 23, 'maya.r@hubspot-peer.net', 'opened'),
        act('a4', 38, 'jess@peernet.co', 'starred'),
        act('a5', 60, 'devon@peer-inbox.io', 'opened'),
      ],
      signals: pmSignals('High', 'good', 90),
    },
    {
      id: 'mb-4',
      email: 'partnerships@acme.io',
      domain: 'acme.io',
      provider: 'outlook',
      status: 'active',
      warmth: 85,
      delta: 2.9,
      day: 23,
      rampTarget: 50,
      sends: 48,
      sendTarget: 50,
      opens: 38,
      replies: 12,
      inboxPct: 93.0,
      spamPct: 1.0,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      spark: spark(85, 12),
      activity: [
        act('a1', 3, 'raj.p@peer-inbox.io', 'replied'),
        act('a2', 11, 'ava@peernet.co', 'opened'),
        act('a3', 26, 'noah.b@peer-inbox.io', 'sent'),
        act('a4', 44, 'priya@peernet.co', 'opened'),
        act('a5', 67, 'omar@peer-inbox.io', 'starred'),
      ],
      signals: pmSignals('High', 'good', 88),
    },
    {
      id: 'mb-5',
      email: 'hello@acme.co',
      domain: 'acme.co',
      provider: 'smtp',
      status: 'warming',
      warmth: 82,
      delta: 2.3,
      day: 20,
      rampTarget: 35,
      sends: 33,
      sendTarget: 35,
      opens: 25,
      replies: 8,
      inboxPct: 91.6,
      spamPct: 1.4,
      dns: { spf: 'pass', dkim: 'warn', dmarc: 'warn' },
      spark: spark(82, 11),
      activity: [
        act('a1', 5, 'omar@peer-inbox.io', 'starred'),
        act('a2', 16, 'jess@peernet.co', 'opened'),
        act('a3', 29, 'lina.k@peernet.co', 'sent'),
        act('a4', 48, 'devon@peer-inbox.io', 'opened'),
        act('a5', 71, 'maya.r@hubspot-peer.net', 'replied'),
      ],
      signals: pmSignals('Medium', 'watch', 74),
    },
    {
      id: 'mb-6',
      email: 'support@acme.co',
      domain: 'acme.co',
      provider: 'yahoo',
      status: 'warming',
      warmth: 78,
      delta: 1.9,
      day: 17,
      rampTarget: 35,
      sends: 31,
      sendTarget: 35,
      opens: 23,
      replies: 7,
      inboxPct: 90.2,
      spamPct: 1.8,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'warn' },
      spark: spark(78, 10),
      activity: [
        act('a1', 7, 'jess@peernet.co', 'spam_rescued'),
        act('a2', 19, 'tom.h@peer-inbox.io', 'opened'),
        act('a3', 31, 'ava@peernet.co', 'sent'),
        act('a4', 52, 'raj.p@peer-inbox.io', 'opened'),
        act('a5', 78, 'noah.b@peer-inbox.io', 'replied'),
      ],
      signals: pmSignals('Medium', 'watch', 70),
    },
    {
      id: 'mb-7',
      email: 'growth@acme.io',
      domain: 'acme.io',
      provider: 'gmail',
      status: 'warming',
      warmth: 71,
      delta: -1.1,
      day: 13,
      rampTarget: 20,
      sends: 18,
      sendTarget: 20,
      opens: 12,
      replies: 4,
      inboxPct: 87.5,
      spamPct: 2.6,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      spark: spark(71, -6),
      activity: [
        act('a1', 9, 'ava@peernet.co', 'opened'),
        act('a2', 21, 'priya@peernet.co', 'sent'),
        act('a3', 36, 'maya.r@hubspot-peer.net', 'opened'),
        act('a4', 58, 'devon@peer-inbox.io', 'sent'),
        act('a5', 84, 'lina.k@peernet.co', 'opened'),
      ],
      signals: pmSignals('Low', 'bad', 52),
    },
    {
      id: 'mb-8',
      email: 'billing@acme.co',
      domain: 'acme.co',
      provider: 'smtp',
      status: 'warming',
      warmth: 64,
      delta: 2.7,
      day: 8,
      rampTarget: 10,
      sends: 9,
      sendTarget: 10,
      opens: 6,
      replies: 2,
      inboxPct: 84.9,
      spamPct: 3.4,
      dns: { spf: 'pass', dkim: 'warn', dmarc: 'fail' },
      spark: spark(64, 9),
      activity: [
        act('a1', 12, 'tom.h@peer-inbox.io', 'starred'),
        act('a2', 28, 'noah.b@peer-inbox.io', 'opened'),
        act('a3', 44, 'jess@peernet.co', 'sent'),
        act('a4', 66, 'omar@peer-inbox.io', 'opened'),
        act('a5', 91, 'raj.p@peer-inbox.io', 'sent'),
      ],
      signals: pmSignals('Medium', 'watch', 66),
    },
    {
      id: 'mb-9',
      email: 'team@northwind.dev',
      domain: 'northwind.dev',
      provider: 'gmail',
      status: 'active',
      warmth: 89,
      delta: 1.5,
      day: 27,
      rampTarget: 70,
      sends: 64,
      sendTarget: 70,
      opens: 51,
      replies: 18,
      inboxPct: 94.7,
      spamPct: 0.7,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      spark: spark(89, 9),
      activity: [
        act('a1', 3, 'priya@peernet.co', 'replied'),
        act('a2', 13, 'devon@peer-inbox.io', 'opened'),
        act('a3', 25, 'maya.r@hubspot-peer.net', 'sent'),
        act('a4', 47, 'ava@peernet.co', 'opened'),
        act('a5', 69, 'lina.k@peernet.co', 'starred'),
      ],
      signals: pmSignals('High', 'good', 91),
    },
    {
      id: 'mb-10',
      email: 'ops@northwind.dev',
      domain: 'northwind.dev',
      provider: 'outlook',
      status: 'active',
      warmth: 86,
      delta: 2.1,
      day: 24,
      rampTarget: 50,
      sends: 47,
      sendTarget: 50,
      opens: 37,
      replies: 13,
      inboxPct: 93.4,
      spamPct: 0.9,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'warn' },
      spark: spark(86, 10),
      activity: [
        act('a1', 4, 'noah.b@peer-inbox.io', 'opened'),
        act('a2', 15, 'jess@peernet.co', 'sent'),
        act('a3', 27, 'raj.p@peer-inbox.io', 'replied'),
        act('a4', 49, 'tom.h@peer-inbox.io', 'opened'),
        act('a5', 73, 'omar@peer-inbox.io', 'sent'),
      ],
      signals: pmSignals('High', 'good', 89),
    },
    {
      id: 'mb-11',
      email: 'newsletter@northwind.dev',
      domain: 'northwind.dev',
      provider: 'gmail',
      status: 'warming',
      warmth: 75,
      delta: 1.4,
      day: 15,
      rampTarget: 35,
      sends: 30,
      sendTarget: 35,
      opens: 21,
      replies: 6,
      inboxPct: 89.1,
      spamPct: 2.1,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      spark: spark(75, 8),
      activity: [
        act('a1', 6, 'ava@peernet.co', 'opened'),
        act('a2', 18, 'lina.k@peernet.co', 'sent'),
        act('a3', 33, 'priya@peernet.co', 'opened'),
        act('a4', 55, 'devon@peer-inbox.io', 'sent'),
        act('a5', 80, 'maya.r@hubspot-peer.net', 'opened'),
      ],
      signals: pmSignals('Medium', 'watch', 72),
    },
    {
      id: 'mb-12',
      email: 'founder@brightloop.app',
      domain: 'brightloop.app',
      provider: 'gmail',
      status: 'active',
      warmth: 88,
      delta: 1.8,
      day: 25,
      rampTarget: 65,
      sends: 60,
      sendTarget: 65,
      opens: 48,
      replies: 17,
      inboxPct: 94.0,
      spamPct: 0.8,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      spark: spark(88, 9),
      activity: [
        act('a1', 2, 'maya.r@hubspot-peer.net', 'replied'),
        act('a2', 10, 'jess@peernet.co', 'opened'),
        act('a3', 22, 'devon@peer-inbox.io', 'sent'),
        act('a4', 43, 'raj.p@peer-inbox.io', 'opened'),
        act('a5', 64, 'ava@peernet.co', 'starred'),
      ],
      signals: pmSignals('High', 'good', 90),
    },
    {
      id: 'mb-13',
      email: 'sales@brightloop.app',
      domain: 'brightloop.app',
      provider: 'outlook',
      status: 'warming',
      warmth: 79,
      delta: 2.4,
      day: 18,
      rampTarget: 35,
      sends: 32,
      sendTarget: 35,
      opens: 24,
      replies: 8,
      inboxPct: 90.6,
      spamPct: 1.6,
      dns: { spf: 'pass', dkim: 'warn', dmarc: 'warn' },
      spark: spark(79, 11),
      activity: [
        act('a1', 5, 'tom.h@peer-inbox.io', 'opened'),
        act('a2', 17, 'noah.b@peer-inbox.io', 'sent'),
        act('a3', 30, 'priya@peernet.co', 'replied'),
        act('a4', 51, 'omar@peer-inbox.io', 'opened'),
        act('a5', 76, 'lina.k@peernet.co', 'sent'),
      ],
      signals: pmSignals('Medium', 'watch', 73),
    },
    {
      id: 'mb-14',
      email: 'paused@brightloop.app',
      domain: 'brightloop.app',
      provider: 'smtp',
      status: 'paused',
      warmth: 58,
      delta: 0.0,
      day: 6,
      rampTarget: 10,
      sends: 0,
      sendTarget: 10,
      opens: 0,
      replies: 0,
      inboxPct: 82.0,
      spamPct: 4.1,
      dns: { spf: 'warn', dkim: 'fail', dmarc: 'fail' },
      spark: spark(58, 3),
      activity: [
        act('a1', 240, 'jess@peernet.co', 'opened'),
        act('a2', 305, 'devon@peer-inbox.io', 'sent'),
        act('a3', 372, 'ava@peernet.co', 'opened'),
      ],
      signals: pmSignals('Low', 'bad', 48),
    },
    {
      id: 'mb-15',
      email: 'hello@brightloop.app',
      domain: 'brightloop.app',
      provider: 'yahoo',
      status: 'warming',
      warmth: 69,
      delta: 1.2,
      day: 11,
      rampTarget: 20,
      sends: 17,
      sendTarget: 20,
      opens: 11,
      replies: 3,
      inboxPct: 86.3,
      spamPct: 2.9,
      dns: { spf: 'pass', dkim: 'pass', dmarc: 'warn' },
      spark: spark(69, 7),
      activity: [
        act('a1', 8, 'ava@peernet.co', 'opened'),
        act('a2', 20, 'raj.p@peer-inbox.io', 'sent'),
        act('a3', 35, 'maya.r@hubspot-peer.net', 'opened'),
        act('a4', 57, 'tom.h@peer-inbox.io', 'sent'),
        act('a5', 82, 'noah.b@peer-inbox.io', 'opened'),
      ],
      signals: pmSignals('Medium', 'watch', 68),
    },
  ],
};

// ---------------------------------------------------------------------------
// Format + theme helpers
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
  surface2: '#1a1a26',
  borderMuted: '#2a2a3a',
  textDim: '#8888a0',
} as const;

function warmthHex(score: number): string {
  if (score >= 75) return HEX.accent;
  if (score >= 50) return HEX.accent4;
  return HEX.accent3;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  smtp: 'SMTP',
  yahoo: 'Yahoo',
};

const PROVIDER_LETTER: Record<Provider, string> = {
  gmail: 'G',
  outlook: 'O',
  smtp: 'S',
  yahoo: 'Y',
};

const STATUS_LABEL: Record<MailboxStatus, string> = {
  active: 'Active',
  warming: 'Warming',
  paused: 'Paused',
};

const STATUS_DOT: Record<MailboxStatus, string> = {
  active: 'bg-accent',
  warming: 'bg-accent4',
  paused: 'bg-text-dim',
};

const STATUS_TEXT: Record<MailboxStatus, string> = {
  active: 'text-accent',
  warming: 'text-accent4',
  paused: 'text-text-dim',
};

const DNS_META: Record<
  DnsState,
  { label: string; Icon: typeof CheckCircle2; tone: string; ring: string }
> = {
  pass: {
    label: 'Pass',
    Icon: CheckCircle2,
    tone: 'text-accent',
    ring: 'border-accent/30 bg-accent/10',
  },
  warn: {
    label: 'Warn',
    Icon: ShieldAlert,
    tone: 'text-accent4',
    ring: 'border-accent4/30 bg-accent4/10',
  },
  fail: {
    label: 'Fail',
    Icon: XCircle,
    tone: 'text-accent3',
    ring: 'border-accent3/30 bg-accent3/10',
  },
};

const SIGNAL_TEXT: Record<SignalState, string> = {
  good: 'text-accent',
  watch: 'text-accent4',
  bad: 'text-accent3',
};

const SIGNAL_DOT: Record<SignalState, string> = {
  good: 'bg-accent',
  watch: 'bg-accent4',
  bad: 'bg-accent3',
};

const SIGNAL_BAR: Record<SignalState, string> = {
  good: 'bg-accent',
  watch: 'bg-accent4',
  bad: 'bg-accent3',
};

const ACTION_META: Record<
  ActivityAction,
  { label: string; Icon: typeof Mail; tone: string }
> = {
  sent: { label: 'sent to', Icon: Send, tone: 'text-text-dim' },
  opened: { label: 'opened by', Icon: MailOpen, tone: 'text-accent4' },
  replied: { label: 'replied by', Icon: Reply, tone: 'text-accent' },
  starred: { label: 'starred by', Icon: Star, tone: 'text-accent4' },
  spam_rescued: {
    label: 'recovered from spam by',
    Icon: ShieldCheck,
    tone: 'text-accent3',
  },
};

type SortKey = 'warmth' | 'name' | 'risk';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'warmth', label: 'Warmth' },
  { key: 'name', label: 'A–Z' },
  { key: 'risk', label: 'Risk' },
];

function fmtAgo(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  return `${h}h ago`;
}

function DeltaPill({ delta }: { delta: number }) {
  const flat = delta === 0;
  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? 'text-text-dim'
    : delta > 0
      ? 'text-accent'
      : 'text-accent3';
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${tone}`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ProPlusDashN4ConsoleProps {
  data?: ConsoleData;
  /**
   * Live wrapper callback to open the AddMailboxDialog. Optional so the
   * isolated :35001 preview harness can still mount this prop-less — the
   * button still renders but no-ops in the preview.
   */
  onAdd?: () => void;
}

export function ProPlusDashN4Console({
  data,
  onAdd,
}: ProPlusDashN4ConsoleProps = {}): JSX.Element {
  // Live wrapper passes real workspace data; the isolated :35001 preview
  // harness mounts this prop-less, so fall back to MOCK to keep it working.
  const { summary, mailboxes } = data ?? MOCK;

  const [selectedId, setSelectedId] = useState<string>(mailboxes[0]!.id);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('warmth');

  // --- Mailbox actions (Pause / Resume / Sync) ----------------------------
  // Mutations dispatch unconditionally — the :35001 preview uses MOCK ids
  // (`mb-N`) so any call there will 404 silently, which is fine. Sync now
  // just invalidates the mailbox queries so the list re-fetches.
  const pauseMutation = usePauseMailbox();
  const resumeMutation = useResumeMailbox();
  const qc = useQueryClient();
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handlePause = (id: string) => {
    pauseMutation.mutate(id, {
      onSuccess: () => toast.success('Mailbox paused'),
      onError: () => toast.error('Failed to pause mailbox'),
    });
  };
  const handleResume = (id: string) => {
    resumeMutation.mutate(id, {
      onSuccess: () => toast.success('Mailbox resumed'),
      onError: () => toast.error('Failed to resume mailbox'),
    });
  };
  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      await qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
      await qc.invalidateQueries({ queryKey: [...MAILBOXES_KEY, id] });
      toast.success('Syncing mailbox…');
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncingId(null);
    }
  };
  const pausePendingId =
    pauseMutation.isPending ? pauseMutation.variables ?? null : null;
  const resumePendingId =
    resumeMutation.isPending ? resumeMutation.variables ?? null : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? mailboxes.filter(
          (m) =>
            m.email.toLowerCase().includes(q) ||
            m.domain.toLowerCase().includes(q) ||
            PROVIDER_LABEL[m.provider].toLowerCase().includes(q),
        )
      : mailboxes.slice();
    const sorted = filtered.sort((a, b) => {
      if (sortKey === 'name') return a.email.localeCompare(b.email);
      if (sortKey === 'risk') return a.warmth - b.warmth; // riskiest first
      return b.warmth - a.warmth; // warmth (default): hottest first
    });
    return sorted;
  }, [mailboxes, query, sortKey]);

  const selected =
    mailboxes.find((m) => m.id === selectedId) ?? mailboxes[0]!;

  const sendPct = Math.round(
    (summary.sendsToday / summary.sendTarget) * 100,
  );

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[640px] flex-col gap-3">
      {/* ---- Global summary bar (spans both panes) ---- */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-white/[0.07] bg-surface/60 px-5 py-3 backdrop-blur-xl"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Inbox className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-text">
                Mailbox console
              </h1>
              <Badge variant="orange">
                <Sparkles className="h-3 w-3" />
                Pro Plus
              </Badge>
            </div>
            <p className="text-xs text-text-dim">
              {summary.mailboxCount} mailboxes · select one to inspect
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <SummaryStat
            label="Avg warmth"
            value={String(summary.avgWarmth)}
            extra={<DeltaPill delta={summary.warmthDelta} />}
          />
          <span className="hidden h-8 w-px bg-border-muted sm:block" />
          <SummaryStat
            label="Sends today"
            value={`${summary.sendsToday}`}
            sub={`/ ${summary.sendTarget} · ${sendPct}%`}
          />
          <span className="hidden h-8 w-px bg-border-muted sm:block" />
          <SummaryStat
            label="Warming"
            value={`${summary.warmingCount}`}
            sub={`/ ${summary.mailboxCount}`}
          />
          <span className="hidden h-8 w-px bg-border-muted sm:block" />
          <div className="flex items-center gap-2">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            <span className="text-text-dim">
              Postmaster{' '}
              <span className="font-semibold text-accent">
                {summary.postmasterHealth}
              </span>{' '}
              · SNDS{' '}
              <span className="font-semibold text-accent">
                {summary.sndsHealth}
              </span>
            </span>
          </div>
        </div>
      </motion.header>

      {/* ---- Two-pane workspace ---- */}
      {/* The 19rem master rail + detail pane can't fit side-by-side in ~320px;
          on phones the pair scrolls horizontally inside this wrapper at a
          usable min-width instead of overflowing the page. ≥lg is unchanged. */}
      <div className="min-h-0 flex-1 overflow-x-auto lg:overflow-visible">
      <div className="flex h-full min-w-[52rem] gap-3 lg:min-w-0">
        {/* MASTER RAIL */}
        <motion.aside
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.05 }}
          className="flex w-[19rem] shrink-0 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-surface/60 backdrop-blur-xl"
        >
          {/* Search + sort + add */}
          <div className="shrink-0 space-y-2.5 border-b border-white/5 p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search mailboxes…"
                  aria-label="Search mailboxes"
                  className="w-full rounded-lg border border-border-muted bg-surface-2/60 py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-accent/50 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => onAdd?.()}
                aria-label="Add mailbox"
                title="Add mailbox"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[0.7rem] uppercase tracking-wider text-text-dim">
                Sort
              </span>
              {SORTS.map((s) => {
                const on = s.key === sortKey;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSortKey(s.key)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      on
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-dim hover:bg-surface-2/60 hover:text-text'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ranked, selectable list (internal scroll) */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-text-dim">
                No mailboxes match “{query}”.
              </p>
            ) : (
              <ul className="p-2">
                {visible.map((m, i) => (
                  <RailRow
                    key={m.id}
                    mailbox={m}
                    selected={m.id === selectedId}
                    index={i}
                    onSelect={() => setSelectedId(m.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-white/5 px-4 py-2.5 text-[0.7rem] text-text-dim">
            Showing {visible.length} of {mailboxes.length}
          </div>
        </motion.aside>

        {/* DETAIL PANE */}
        <motion.section
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
          className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-surface/60 backdrop-blur-xl"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex h-full flex-col"
            >
              <DetailHeader
                mailbox={selected}
                onPause={() => handlePause(selected.id)}
                onResume={() => handleResume(selected.id)}
                onSync={() => handleSync(selected.id)}
                pausePending={pausePendingId === selected.id}
                resumePending={resumePendingId === selected.id}
                syncPending={syncingId === selected.id}
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <DetailBody mailbox={selected} />
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.section>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary bar stat
// ---------------------------------------------------------------------------

function SummaryStat({
  label,
  value,
  sub,
  extra,
}: {
  label: string;
  value: string;
  sub?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.7rem] uppercase tracking-wider text-text-dim">
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold tabular-nums leading-none text-text">
          {value}
        </span>
        {sub ? (
          <span className="text-xs tabular-nums text-text-dim">{sub}</span>
        ) : null}
        {extra}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Master rail row
// ---------------------------------------------------------------------------

function RailRow({
  mailbox,
  selected,
  index,
  onSelect,
}: {
  mailbox: MailboxRecord;
  selected: boolean;
  index: number;
  onSelect: () => void;
}) {
  const color = warmthHex(mailbox.warmth);
  const first = mailbox.spark[0] ?? mailbox.warmth;
  const last = mailbox.spark[mailbox.spark.length - 1] ?? mailbox.warmth;
  const trendUp = last >= first;

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.025 }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected}
        className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
          selected
            ? 'bg-accent/10'
            : 'hover:bg-surface-2/60'
        }`}
      >
        {/* active edge marker */}
        {selected ? (
          <motion.span
            layoutId="rail-active-edge"
            className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent"
          />
        ) : null}

        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold text-bg"
          style={{ background: color }}
          aria-hidden
        >
          {PROVIDER_LETTER[mailbox.provider]}
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm ${
              selected ? 'font-semibold text-text' : 'font-medium text-text'
            }`}
          >
            {mailbox.email}
          </p>
          <p className="flex items-center gap-1.5 text-[0.7rem] text-text-dim">
            <span
              className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[mailbox.status]}`}
              aria-hidden
            />
            {STATUS_LABEL[mailbox.status]} · D{mailbox.day}/28
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span
            className="text-sm font-semibold tabular-nums leading-none"
            style={{ color }}
          >
            {mailbox.warmth}
          </span>
          <span
            className={`mt-1 inline-flex items-center gap-0.5 text-[0.7rem] ${
              trendUp ? 'text-accent' : 'text-accent3'
            }`}
          >
            {trendUp ? (
              <ArrowUpRight className="h-2.5 w-2.5" />
            ) : (
              <ArrowDownRight className="h-2.5 w-2.5" />
            )}
            {Math.abs(mailbox.delta).toFixed(1)}
          </span>
        </div>
      </button>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Detail header
// ---------------------------------------------------------------------------

function DetailHeader({
  mailbox,
  onPause,
  onResume,
  onSync,
  pausePending,
  resumePending,
  syncPending,
}: {
  mailbox: MailboxRecord;
  onPause: () => void;
  onResume: () => void;
  onSync: () => void;
  pausePending: boolean;
  resumePending: boolean;
  syncPending: boolean;
}) {
  const color = warmthHex(mailbox.warmth);
  const rampPct = Math.round((mailbox.day / 28) * 100);

  return (
    <header className="shrink-0 border-b border-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-base font-semibold text-bg"
            style={{ background: color }}
            aria-hidden
          >
            {PROVIDER_LETTER[mailbox.provider]}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight text-text">
              {mailbox.email}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
              <span>{PROVIDER_LABEL[mailbox.provider]}</span>
              <span className="text-border-muted">·</span>
              <span
                className={`inline-flex items-center gap-1.5 ${STATUS_TEXT[mailbox.status]}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[mailbox.status]}`}
                  aria-hidden
                />
                {STATUS_LABEL[mailbox.status]}
              </span>
              <span className="text-border-muted">·</span>
              <span className="tabular-nums">{mailbox.domain}</span>
            </div>
          </div>
        </div>

        {/* quick actions */}
        <div className="flex shrink-0 items-center gap-2">
          {mailbox.status === 'paused' ? (
            <button
              type="button"
              onClick={onResume}
              disabled={resumePending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resumePending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {resumePending ? 'Resuming…' : 'Resume'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              disabled={pausePending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-text-dim transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pausePending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
              {pausePending ? 'Pausing…' : 'Pause'}
            </button>
          )}
          <button
            type="button"
            onClick={onSync}
            disabled={syncPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-text-dim transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {syncPending ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {/* ramp progress */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-text-dim">
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-accent" />
            Build-up day{' '}
            <span className="font-semibold text-text">{mailbox.day}</span> / 28
          </span>
          <span className="tabular-nums">
            target {mailbox.rampTarget}/day
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            key={`ramp-${mailbox.id}`}
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${rampPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
          />
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Detail body
// ---------------------------------------------------------------------------

function DetailBody({ mailbox }: { mailbox: MailboxRecord }) {
  const color = warmthHex(mailbox.warmth);
  const sparkData: SparkPoint[] = mailbox.spark.map((v, i) => ({ i, v }));
  const sparkMin = Math.max(
    0,
    Math.floor(Math.min(...mailbox.spark) - 4),
  );

  const stats: Array<{
    key: string;
    label: string;
    value: string;
    sub: string;
    Icon: typeof Mail;
  }> = [
    {
      key: 'sends',
      label: 'Sends today',
      value: `${mailbox.sends}`,
      sub: `of ${mailbox.sendTarget} target`,
      Icon: Send,
    },
    {
      key: 'opens',
      label: 'Opens',
      value: `${mailbox.opens}`,
      sub:
        mailbox.sends > 0
          ? `${Math.min(100, Math.round((mailbox.opens / mailbox.sends) * 100))}% open rate`
          : 'No sends yet',
      Icon: MailOpen,
    },
    {
      key: 'replies',
      label: 'Replies',
      value: `${mailbox.replies}`,
      sub:
        mailbox.sends > 0
          ? `${Math.min(100, Math.round((mailbox.replies / mailbox.sends) * 100))}% reply rate`
          : 'No sends yet',
      Icon: Reply,
    },
    {
      key: 'inbox',
      label: 'Where emails land',
      value: `${mailbox.inboxPct.toFixed(1)}%`,
      sub: `${mailbox.spamPct.toFixed(1)}% spam`,
      Icon: Inbox,
    },
  ];

  return (
    <div className="space-y-5 p-5">
      {/* Warmth trend + today stats */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* trend chart */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-text">
                Warmth trend
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-lg font-semibold tabular-nums leading-none"
                style={{ color }}
              >
                {mailbox.warmth}
              </span>
              <DeltaPill delta={mailbox.delta} />
              <span className="rounded-full border border-border-muted px-2 py-0.5 text-[0.7rem] text-text-dim">
                14d
              </span>
            </div>
          </div>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sparkData}
                margin={{ top: 6, right: 6, bottom: 0, left: -20 }}
              >
                <defs>
                  <linearGradient
                    id={`ppn4-warmth-${mailbox.id}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="i"
                  tick={{ fill: HEX.textDim, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `D${14 - Number(v)}`}
                  minTickGap={20}
                />
                <YAxis
                  domain={[sparkMin, 100]}
                  tick={{ fill: HEX.textDim, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  cursor={{ stroke: HEX.borderMuted, strokeWidth: 1 }}
                  contentStyle={{
                    background: '#12121a',
                    border: `1px solid ${HEX.borderMuted}`,
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: HEX.textDim }}
                  labelFormatter={(l) => `${14 - Number(l)} days ago`}
                  formatter={(val: number | string) => [
                    String(val),
                    'Warmth',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  name="Warmth"
                  stroke={color}
                  strokeWidth={2.2}
                  fill={`url(#ppn4-warmth-${mailbox.id})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* today stats stack */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          {stats.map((s, i) => (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
              className="rounded-xl border border-border-muted bg-surface-2/40 p-3.5"
            >
              <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-wider text-text-dim">
                <span className="truncate">{s.label}</span>
                <s.Icon className="h-3.5 w-3.5 text-accent" />
              </div>
              <p className="mt-1.5 text-xl font-semibold tabular-nums leading-none text-text">
                {s.value}
              </p>
              <p className="mt-1 text-xs text-text-dim">{s.sub}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* DNS row */}
      <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-text">
            Domain records (DNS) authentication
          </h3>
          <span className="text-xs text-text-dim">
            for {mailbox.domain}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(['spf', 'dkim', 'dmarc'] as const).map((rec, i) => {
            const state = mailbox.dns[rec];
            const meta = DNS_META[state];
            return (
              <motion.div
                key={rec}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.28, delay: 0.12 + i * 0.05 }}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${meta.ring}`}
              >
                <meta.Icon className={`h-4 w-4 shrink-0 ${meta.tone}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text">
                    {rec}
                  </p>
                  <p className={`text-xs ${meta.tone}`}>{meta.label}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Recent activity + Pro-Plus signal block */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* recent activity */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40">
          <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-text">
                Recent activity
              </h3>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-text-dim">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              helper net
            </span>
          </header>
          {mailbox.activity.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-dim">
              No recent helper activity — this mailbox is paused.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {mailbox.activity.map((e, i) => {
                const meta = ACTION_META[e.action];
                return (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.28, delay: 0.15 + i * 0.05 }}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border-muted bg-surface-2/60 ${meta.tone}`}
                    >
                      <meta.Icon className="h-3.5 w-3.5" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm text-text">
                      <span className="text-text-dim">{meta.label}</span>{' '}
                      <span className="font-medium">{e.peer}</span>
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-text-dim">
                      {fmtAgo(e.minutesAgo)}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Pro-Plus Postmaster / SNDS signal block */}
        <div className="rounded-xl border border-accent3/20 bg-surface-2/40">
          <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent3" />
              <h3 className="text-sm font-semibold text-text">
                Postmaster &amp; SNDS
              </h3>
            </div>
            <Badge variant="orange">Pro Plus</Badge>
          </header>
          <div className="space-y-2.5 p-4">
            <p className="text-xs text-text-dim">
              Domain-level signal for{' '}
              <span className="text-text">{mailbox.domain}</span> · refreshed
              hourly
            </p>
            {mailbox.signals.map((sig, i) => (
              <motion.div
                key={`${sig.source}-${sig.label}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: 0.15 + i * 0.06 }}
                className="rounded-lg border border-border-muted bg-bg/40 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wider text-text-dim">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${SIGNAL_DOT[sig.state]}`}
                      aria-hidden
                    />
                    {sig.source}
                  </span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${SIGNAL_TEXT[sig.state]}`}
                  >
                    {sig.value}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-text">{sig.label}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className={`h-full rounded-full ${SIGNAL_BAR[sig.state]}`}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.max(0, Math.min(100, sig.strength))}%`,
                    }}
                    transition={{
                      duration: 0.8,
                      ease: 'easeOut',
                      delay: 0.2 + i * 0.06,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[0.7rem] text-text-dim">
                  {sig.detail}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* footer hint */}
      <div className="flex items-center justify-center gap-1.5 pt-1 text-[0.7rem] text-text-dim">
        <ChevronUp className="h-3 w-3" />
        Select another mailbox in the rail to inspect it
      </div>
    </div>
  );
}

export default ProPlusDashN4Console;
