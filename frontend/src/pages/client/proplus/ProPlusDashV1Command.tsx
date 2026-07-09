import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Gauge,
  Inbox,
  Mail,
  MailOpen,
  Minus,
  Radar,
  Radio,
  Reply,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/format';

/**
 * ProPlusDashV1Command — "Command Center / ops cockpit" Pro-Plus dashboard.
 *
 * A mission-control surface for a 15-mailbox Pro Plus account. Distinct from
 * the existing ProPlusDashboard "Mission control" layout: this variant leads
 * with a full-bleed command bar (live status chips), a commanding warmth
 * gauge bolted to a system-status readout panel, a horizontal KPI telemetry
 * rail, a 30-day warmth+volume combo, a multi-mailbox HEALTH MATRIX (a card
 * grid with sparklines rather than a list), a live activity stream, and the
 * Pro-Plus signal strip (Google Postmaster + Microsoft SNDS) that is the tier
 * differentiator.
 *
 * Fully STANDALONE — no network, router or query hooks, no required props.
 * Every number comes from the inline MOCK const so the preview harness can
 * mount it prop-less. Renders only page content (heading + body); the harness
 * shell supplies the real sidebar/chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';

interface StatusChip {
  key: string;
  label: string;
  value: string;
  state: 'good' | 'watch' | 'bad';
}

interface KpiCard {
  key: string;
  label: string;
  value: number;
  /** Suffix appended after the animated count (e.g. '%'). */
  suffix: string;
  decimals: number;
  delta: number;
  deltaUnit: string;
  Icon: typeof Mail;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
  /** Falling delta is good (spam / bounce style metrics). */
  invert?: boolean;
  /** 0..100 progress for the footer telemetry bar. */
  progress: number;
}

interface WarmthVolumeRow {
  date: string;
  warmth: number;
  volume: number;
}

interface MailboxHealthRow {
  id: string;
  email: string;
  provider: Provider;
  warmth: number;
  delta: number;
  day: number;
  sentToday: number;
  target: number;
  inboxPct: number;
  spark: number[];
  status: 'active' | 'warming' | 'paused';
}

interface FeedEvent {
  id: string;
  minutesAgo: number;
  mailbox: string;
  peer: string;
  action: 'sent' | 'opened' | 'replied' | 'starred' | 'spam_rescued';
}

interface SignalCard {
  key: string;
  source: 'Postmaster' | 'SNDS' | 'Placement';
  label: string;
  value: string;
  status: 'good' | 'watch' | 'bad';
  detail: string;
  /** 0..100 strength meter. */
  strength: number;
}

interface DashboardData {
  avgWarmth: number;
  warmthDelta: number;
  mailboxCount: number;
  warmingCount: number;
  sentToday: number;
  sentTarget: number;
  uptimePct: number;
  chips: StatusChip[];
  kpis: KpiCard[];
  warmthVolume: WarmthVolumeRow[];
  mailboxes: MailboxHealthRow[];
  feed: FeedEvent[];
  signals: SignalCard[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro Plus numbers (avg warmth ~84, 15 mailboxes)
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function isoMinusDays(days: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 30-day warmth ramp 63 → 88 with daily volume 280 → 760, jittered. */
function buildWarmthVolume(): WarmthVolumeRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const warmth = 63 + t * 25 + Math.sin(i * 0.66) * 1.9;
    const volume = 280 + t * 480 + Math.sin(i * 1.25) * 42;
    return {
      date: isoMinusDays(29 - i),
      warmth: Math.round(Math.max(0, Math.min(100, warmth))),
      volume: Math.round(Math.max(0, volume)),
    };
  });
}

function spark(base: number, drift: number): number[] {
  return Array.from({ length: 16 }, (_, i) => {
    const v = base - drift + (drift / 15) * i + Math.sin(i * 1.05 + base) * 2.2;
    return Math.round(Math.max(0, Math.min(100, v)));
  });
}

const MOCK: DashboardData = {
  avgWarmth: 84,
  warmthDelta: 2.6,
  mailboxCount: 15,
  warmingCount: 12,
  sentToday: 648,
  sentTarget: 840,
  uptimePct: 99.97,
  chips: [
    { key: 'engine', label: 'Warmup engine', value: 'Running', state: 'good' },
    { key: 'peers', label: 'Helper network', value: '12 live', state: 'good' },
    { key: 'postmaster', label: 'Postmaster', value: 'Synced', state: 'good' },
    { key: 'snds', label: 'SNDS', value: 'Green', state: 'good' },
    { key: 'alerts', label: 'Open alerts', value: '1 watch', state: 'watch' },
  ],
  kpis: [
    {
      key: 'sends',
      label: 'Sends today',
      value: 648,
      suffix: '',
      decimals: 0,
      delta: 62,
      deltaUnit: 'vs avg',
      Icon: Send,
      tone: 'accent',
      progress: 77,
    },
    {
      key: 'inbox',
      label: 'Where emails land',
      value: 94.2,
      suffix: '%',
      decimals: 1,
      delta: 2.6,
      deltaUnit: 'pts wk',
      Icon: Inbox,
      tone: 'accent2',
      progress: 94,
    },
    {
      key: 'reply',
      label: 'Reply rate',
      value: 27.4,
      suffix: '%',
      decimals: 1,
      delta: 1.8,
      deltaUnit: 'pts wk',
      Icon: Reply,
      tone: 'accent4',
      progress: 27,
    },
    {
      key: 'spam',
      label: 'Spam rate',
      value: 1.1,
      suffix: '%',
      decimals: 1,
      delta: -0.7,
      deltaUnit: 'pts wk',
      Icon: ShieldCheck,
      tone: 'accent3',
      invert: true,
      progress: 11,
    },
    {
      key: 'warming',
      label: 'Mailboxes warming',
      value: 12,
      suffix: '/15',
      decimals: 0,
      delta: 1,
      deltaUnit: 'vs wk',
      Icon: Mail,
      tone: 'accent',
      progress: 80,
    },
    {
      key: 'uptime',
      label: 'Engine uptime',
      value: 99.97,
      suffix: '%',
      decimals: 2,
      delta: 0.04,
      deltaUnit: 'pts wk',
      Icon: Zap,
      tone: 'accent2',
      progress: 100,
    },
  ],
  warmthVolume: buildWarmthVolume(),
  mailboxes: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      provider: 'gmail',
      warmth: 92,
      delta: 1.3,
      day: 29,
      sentToday: 70,
      target: 75,
      inboxPct: 96.1,
      spark: spark(92, 8),
      status: 'active',
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'outlook',
      warmth: 90,
      delta: 2.0,
      day: 28,
      sentToday: 66,
      target: 72,
      inboxPct: 95.0,
      spark: spark(90, 10),
      status: 'active',
    },
    {
      id: 'mb-3',
      email: 'success@acme.io',
      provider: 'gmail',
      warmth: 87,
      delta: 1.7,
      day: 26,
      sentToday: 60,
      target: 68,
      inboxPct: 93.8,
      spark: spark(87, 9),
      status: 'active',
    },
    {
      id: 'mb-4',
      email: 'partnerships@acme.io',
      provider: 'outlook',
      warmth: 85,
      delta: 2.9,
      day: 23,
      sentToday: 56,
      target: 64,
      inboxPct: 93.0,
      spark: spark(85, 12),
      status: 'active',
    },
    {
      id: 'mb-5',
      email: 'hello@acme.co',
      provider: 'smtp',
      warmth: 82,
      delta: 2.3,
      day: 20,
      sentToday: 48,
      target: 58,
      inboxPct: 91.6,
      spark: spark(82, 11),
      status: 'warming',
    },
    {
      id: 'mb-6',
      email: 'support@acme.co',
      provider: 'yahoo',
      warmth: 78,
      delta: 1.9,
      day: 17,
      sentToday: 42,
      target: 52,
      inboxPct: 90.2,
      spark: spark(78, 10),
      status: 'warming',
    },
    {
      id: 'mb-7',
      email: 'growth@acme.io',
      provider: 'gmail',
      warmth: 71,
      delta: -1.1,
      day: 13,
      sentToday: 30,
      target: 44,
      inboxPct: 87.5,
      spark: spark(71, -6),
      status: 'warming',
    },
    {
      id: 'mb-8',
      email: 'billing@acme.co',
      provider: 'smtp',
      warmth: 64,
      delta: 2.7,
      day: 8,
      sentToday: 18,
      target: 24,
      inboxPct: 84.9,
      spark: spark(64, 9),
      status: 'warming',
    },
  ],
  feed: [
    { id: 'f1', minutesAgo: 1, mailbox: 'founder@acme.io', peer: 'maya.r@hubspot-peer.net', action: 'replied' },
    { id: 'f2', minutesAgo: 2, mailbox: 'sales@acme.io', peer: 'devon@peer-inbox.io', action: 'opened' },
    { id: 'f3', minutesAgo: 4, mailbox: 'success@acme.io', peer: 'lina.k@peernet.co', action: 'sent' },
    { id: 'f4', minutesAgo: 5, mailbox: 'hello@acme.co', peer: 'omar@peer-inbox.io', action: 'starred' },
    { id: 'f5', minutesAgo: 7, mailbox: 'support@acme.co', peer: 'jess@peernet.co', action: 'spam_rescued' },
    { id: 'f6', minutesAgo: 10, mailbox: 'partnerships@acme.io', peer: 'raj.p@peer-inbox.io', action: 'replied' },
    { id: 'f7', minutesAgo: 13, mailbox: 'growth@acme.io', peer: 'ava@peernet.co', action: 'opened' },
    { id: 'f8', minutesAgo: 16, mailbox: 'sales@acme.io', peer: 'noah.b@peer-inbox.io', action: 'sent' },
    { id: 'f9', minutesAgo: 19, mailbox: 'billing@acme.co', peer: 'tom.h@peer-inbox.io', action: 'starred' },
    { id: 'f10', minutesAgo: 23, mailbox: 'success@acme.io', peer: 'priya@peernet.co', action: 'replied' },
  ],
  signals: [
    {
      key: 'pm-rep',
      source: 'Postmaster',
      label: 'Gmail domain trust',
      value: 'High',
      status: 'good',
      detail: '5 Gmail mailboxes · stable 14d',
      strength: 94,
    },
    {
      key: 'pm-spam',
      source: 'Postmaster',
      label: 'Gmail spam rate',
      value: '0.06%',
      status: 'good',
      detail: 'Well under the 0.30% threshold',
      strength: 97,
    },
    {
      key: 'snds',
      source: 'SNDS',
      label: 'Outlook IP status',
      value: 'Green',
      status: 'good',
      detail: 'Filter result green · 0 complaints',
      strength: 92,
    },
    {
      key: 'placement',
      source: 'Placement',
      label: 'Last seed test',
      value: '95% inbox',
      status: 'watch',
      detail: '48/50 seeds · 1 promotions, 1 spam',
      strength: 88,
    },
  ],
};

// ---------------------------------------------------------------------------
// Animation + format helpers
// ---------------------------------------------------------------------------

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: 'easeOut' as const, delay },
});

/** Eased count-up that runs once when scrolled into view. */
function useCountUp(target: number, decimals: number, run: boolean): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Number((target * eased).toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, decimals, run]);
  return val;
}

const PROVIDER_LETTER: Record<Provider, string> = {
  gmail: 'G',
  outlook: 'O',
  smtp: 'S',
  yahoo: 'Y',
};

const WARMTH_HEX = { high: '#F26522', mid: '#ffd54f', low: '#ff6b4a' } as const;

function warmthHex(score: number): string {
  if (score >= 75) return WARMTH_HEX.high;
  if (score >= 50) return WARMTH_HEX.mid;
  return WARMTH_HEX.low;
}

function fmtDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : formatDate(d);
}

const STATE_DOT: Record<StatusChip['state'], string> = {
  good: 'bg-accent',
  watch: 'bg-accent4',
  bad: 'bg-accent3',
};

const STATE_TEXT: Record<StatusChip['state'], string> = {
  good: 'text-accent',
  watch: 'text-accent4',
  bad: 'text-accent3',
};

const STATUS_LABEL: Record<MailboxHealthRow['status'], string> = {
  active: 'Active',
  warming: 'Warming',
  paused: 'Paused',
};

const STATUS_TONE: Record<MailboxHealthRow['status'], string> = {
  active: 'text-accent',
  warming: 'text-accent4',
  paused: 'text-text-dim',
};

const ACTION_META: Record<
  FeedEvent['action'],
  { label: string; Icon: typeof Mail; tone: string }
> = {
  sent: { label: 'sent to', Icon: Send, tone: 'text-text-dim' },
  opened: { label: 'opened by', Icon: MailOpen, tone: 'text-accent2' },
  replied: { label: 'replied by', Icon: Reply, tone: 'text-accent' },
  starred: { label: 'starred by', Icon: Star, tone: 'text-accent4' },
  spam_rescued: { label: 'recovered from spam by', Icon: ShieldCheck, tone: 'text-accent3' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusDashV1Command(): JSX.Element {
  const d = MOCK;
  const sentPct = Math.round((d.sentToday / d.sentTarget) * 100);

  return (
    <div className="space-y-5">
      {/* Command bar — title + Pro Plus badge + live status chip rail */}
      <motion.header
        {...fade(0)}
        className="overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 p-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                <Radio className="h-4 w-4" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                Command center
              </h1>
              <Badge variant="orange">
                <Sparkles className="h-3 w-3" />
                Pro Plus
              </Badge>
            </div>
            <p className="text-sm text-text-dim">
              Live warmth, inbox delivery and helper-network telemetry across{' '}
              {d.mailboxCount} mailboxes · {d.sentToday}/{d.sentTarget} sent
              today ({sentPct}%).
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface-2/50 px-3.5 py-1.5 text-xs text-text-dim">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span className="font-medium text-text">All systems nominal</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/5 px-5 py-3">
          {d.chips.map((c, i) => (
            <motion.span
              key={c.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.08 + i * 0.05 }}
              className="inline-flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-1.5 text-xs"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[c.state]}`}
                aria-hidden
              />
              <span className="text-text-dim">{c.label}</span>
              <span className={`font-semibold ${STATE_TEXT[c.state]}`}>
                {c.value}
              </span>
            </motion.span>
          ))}
        </div>
      </motion.header>

      {/* Warmth gauge + system-status readout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.05)} className="lg:col-span-4">
          <WarmthGauge value={d.avgWarmth} delta={d.warmthDelta} />
        </motion.div>
        <motion.div {...fade(0.1)} className="lg:col-span-8">
          <StatusReadout
            sentToday={d.sentToday}
            sentTarget={d.sentTarget}
            warmingCount={d.warmingCount}
            mailboxCount={d.mailboxCount}
            uptimePct={d.uptimePct}
          />
        </motion.div>
      </div>

      {/* KPI telemetry rail */}
      <motion.div
        {...fade(0.15)}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      >
        {d.kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} />
        ))}
      </motion.div>

      {/* Warmth + volume combo */}
      <motion.div {...fade(0.2)}>
        <WarmthVolumeChart rows={d.warmthVolume} />
      </motion.div>

      {/* Mailbox health matrix + live activity stream */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.25)} className="lg:col-span-7">
          <MailboxHealthMatrix rows={d.mailboxes} />
        </motion.div>
        <motion.div {...fade(0.3)} className="lg:col-span-5">
          <ActivityStream feed={d.feed} />
        </motion.div>
      </div>

      {/* Pro Plus deliverability signal strip */}
      <motion.div {...fade(0.35)}>
        <SignalStrip signals={d.signals} />
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WarmthGauge({ value, delta }: { value: number; delta: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const shown = useCountUp(value, 0, inView);
  const pct = Math.max(0, Math.min(100, value));
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    delta > 0 ? 'text-accent' : delta < 0 ? 'text-accent3' : 'text-text-dim';

  // Conic ring drawn as an SVG stroke whose dash-offset tweens in.
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <Card className="flex h-full flex-col items-center justify-center gap-5 p-6" noShimmer>
      <div className="flex w-full items-center justify-between text-xs uppercase tracking-wider text-text-dim">
        <span className="flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5 text-accent" />
          Workspace warmth
        </span>
        <span className="rounded-full border border-border-muted px-2 py-0.5">
          15 mailboxes
        </span>
      </div>
      <div ref={ref} className="relative grid h-48 w-48 place-items-center">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="var(--wp-surface-2, #1a1a26)"
            strokeWidth="10"
          />
          <motion.circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={warmthHex(value)}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={inView ? { strokeDashoffset: C - (pct / 100) * C } : {}}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-4xl font-semibold tabular-nums leading-tight text-text">
            {Math.round(shown)}
          </span>
          <span className="text-[0.65rem] uppercase tracking-wider text-text-dim">
            of 100
          </span>
          <span className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${deltaTone}`}>
            <DeltaIcon className="h-3 w-3" />
            {delta > 0 ? '+' : ''}
            {delta} · 7d
          </span>
        </div>
      </div>
      <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2 text-xs text-text-dim">
        <ShieldCheck className="h-3.5 w-3.5 text-accent" />
        Healthy — above the 75 inbox-safe band
      </div>
    </Card>
  );
}

function StatusReadout({
  sentToday,
  sentTarget,
  warmingCount,
  mailboxCount,
  uptimePct,
}: {
  sentToday: number;
  sentTarget: number;
  warmingCount: number;
  mailboxCount: number;
  uptimePct: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const sentPct = Math.max(0, Math.min(100, Math.round((sentToday / sentTarget) * 100)));
  const warmPct = Math.max(0, Math.min(100, Math.round((warmingCount / mailboxCount) * 100)));

  const meters: Array<{
    key: string;
    label: string;
    Icon: typeof Mail;
    headline: string;
    sub: string;
    pct: number;
    tone: 'accent' | 'accent2' | 'accent4';
  }> = [
    {
      key: 'quota',
      label: 'Daily send limit',
      Icon: Target,
      headline: `${sentToday} / ${sentTarget}`,
      sub: `${sentPct}% of today's ceiling`,
      pct: sentPct,
      tone: 'accent',
    },
    {
      key: 'fleet',
      label: 'Fleet warming',
      Icon: Mail,
      headline: `${warmingCount} / ${mailboxCount}`,
      sub: `${warmPct}% of mailboxes active`,
      pct: warmPct,
      tone: 'accent2',
    },
    {
      key: 'uptime',
      label: 'Engine uptime',
      Icon: Zap,
      headline: `${uptimePct}%`,
      sub: 'Beat heartbeat < 60s ago',
      pct: Math.round(uptimePct),
      tone: 'accent4',
    },
  ];

  const TONE_TEXT = {
    accent: 'text-accent',
    accent2: 'text-accent2',
    accent4: 'text-accent4',
  } as const;
  const TONE_BAR = {
    accent: 'bg-accent',
    accent2: 'bg-accent2',
    accent4: 'bg-accent4',
  } as const;

  return (
    <Card className="h-full" noShimmer>
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">System status</h2>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-text-dim">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          live
        </span>
      </header>
      <div ref={ref} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        {meters.map((m, i) => (
          <div
            key={m.key}
            className="flex flex-col gap-2 rounded-xl border border-border-muted bg-surface-2/40 p-4"
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-dim">
              <span className="truncate">{m.label}</span>
              <span className={TONE_TEXT[m.tone]}>
                <m.Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="text-2xl font-semibold tabular-nums leading-none text-text">
              {m.headline}
            </p>
            <p className="text-xs text-text-dim">{m.sub}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className={`h-full rounded-full ${TONE_BAR[m.tone]}`}
                initial={{ width: 0 }}
                animate={inView ? { width: `${m.pct}%` } : {}}
                transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 + i * 0.08 }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function KpiTile({ kpi }: { kpi: KpiCard }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const shown = useCountUp(kpi.value, kpi.decimals, inView);
  const good = kpi.invert ? kpi.delta < 0 : kpi.delta > 0;
  const flat = kpi.delta === 0;
  const DeltaIcon = flat ? Minus : kpi.delta > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaTone = flat ? 'text-text-dim' : good ? 'text-accent' : 'text-accent3';
  const toneText = `text-${kpi.tone}`;
  const toneBar = `bg-${kpi.tone}`;

  return (
    <Card className="h-full" noShimmer>
      <div ref={ref} className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-dim">
          <span className="truncate">{kpi.label}</span>
          <span className={toneText}>
            <kpi.Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="flex items-end gap-2">
          <p className="text-2xl font-semibold tabular-nums leading-none text-text">
            {shown.toFixed(kpi.decimals)}
            {kpi.suffix}
          </p>
          <span className={`mb-0.5 flex items-center gap-0.5 text-xs font-medium ${deltaTone}`}>
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(kpi.delta)} {kpi.deltaUnit}
          </span>
        </div>
        <div className="mt-auto h-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className={`h-full rounded-full ${toneBar}`}
            initial={{ width: 0 }}
            animate={inView ? { width: `${Math.max(0, Math.min(100, kpi.progress))}%` } : {}}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
          />
        </div>
      </div>
    </Card>
  );
}

function WarmthVolumeChart({ rows }: { rows: WarmthVolumeRow[] }) {
  return (
    <Card className="p-5" noShimmer>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-text">
            Warmth &amp; sending volume
          </h2>
          <p className="text-sm text-text-dim">
            30-day workspace warmth (line) vs daily warmup sends (bars).
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-dim">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Avg warmth
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent2" />
            Daily sends
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-border-muted px-2.5 py-1">
            <TrendingUp className="h-3 w-3 text-accent" />
            30d
          </span>
        </div>
      </header>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
            <defs>
              <linearGradient id="ppcmd-vol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF8A4B" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#FF8A4B" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fill: '#8888a0', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#2a2a3a' }}
              minTickGap={24}
            />
            <YAxis
              yAxisId="left"
              domain={[0, 100]}
              tick={{ fill: '#8888a0', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#8888a0', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: '#12121a',
                border: '1px solid #2a2a3a',
                borderRadius: 10,
                fontSize: 12,
              }}
              labelStyle={{ color: '#8888a0' }}
              labelFormatter={(l) => fmtDate(String(l))}
              formatter={(val, name) =>
                name === 'Avg warmth'
                  ? [String(val), 'Avg warmth']
                  : [`${String(val)} sent`, 'Daily sends']
              }
            />
            <Bar
              yAxisId="right"
              dataKey="volume"
              name="Daily sends"
              fill="url(#ppcmd-vol)"
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
              animationDuration={900}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="warmth"
              name="Avg warmth"
              stroke="none"
              fill="#F26522"
              fillOpacity={0.08}
              animationDuration={900}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="warmth"
              name="Avg warmth"
              stroke="#F26522"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4 }}
              animationDuration={1300}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MiniSpark({ data, color }: { data: number[]; color: string }) {
  const pts = useMemo(() => data.map((v, i) => ({ i, v })), [data]);
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MailboxHealthMatrix({ rows }: { rows: MailboxHealthRow[] }) {
  const ranked = useMemo(
    () => [...rows].sort((a, b) => b.warmth - a.warmth),
    [rows],
  );
  return (
    <Card className="h-full" noShimmer>
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">
            Mailbox health matrix
          </h2>
        </div>
        <span className="text-xs text-text-dim">{rows.length} mailboxes</span>
      </header>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {ranked.map((m, i) => {
          const color = warmthHex(m.warmth);
          const DeltaIcon =
            m.delta > 0 ? ArrowUpRight : m.delta < 0 ? ArrowDownRight : Minus;
          const deltaTone =
            m.delta > 0
              ? 'text-accent'
              : m.delta < 0
                ? 'text-accent3'
                : 'text-text-dim';
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.28 + i * 0.04 }}
              className="rounded-xl border border-border-muted bg-surface-2/40 p-4 transition-colors hover:border-accent/30"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-bg"
                  style={{ background: color }}
                  aria-hidden
                >
                  {PROVIDER_LETTER[m.provider]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">
                    {m.email}
                  </p>
                  <p className={`text-xs ${STATUS_TONE[m.status]}`}>
                    {STATUS_LABEL[m.status]} · Day {m.day}/29
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className="text-lg font-semibold tabular-nums leading-none"
                    style={{ color }}
                  >
                    {m.warmth}
                  </p>
                  <span
                    className={`flex items-center justify-end gap-0.5 text-xs ${deltaTone}`}
                  >
                    <DeltaIcon className="h-3 w-3" />
                    {Math.abs(m.delta).toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <MiniSpark data={m.spark} color={color} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-text-dim">
                <span className="tabular-nums">
                  {m.sentToday}/{m.target} sent
                </span>
                <span className="tabular-nums">{m.inboxPct}% inbox</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

function ActivityStream({ feed }: { feed: FeedEvent[] }) {
  return (
    <Card className="h-full" noShimmer>
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">
            Live activity stream
          </h2>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-text-dim">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          helper network
        </span>
      </header>
      <ul className="divide-y divide-white/5">
        {feed.map((e, i) => {
          const meta = ACTION_META[e.action];
          return (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.32 + i * 0.04 }}
              className="flex items-center gap-3 px-5 py-3"
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border-muted bg-surface-2/50 ${meta.tone}`}
              >
                <meta.Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">
                  <span className="font-medium">{e.mailbox}</span>{' '}
                  <span className="text-text-dim">{meta.label}</span>{' '}
                  <span className="text-text-dim">{e.peer}</span>
                </p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-text-dim">
                {e.minutesAgo}m ago
              </span>
            </motion.li>
          );
        })}
      </ul>
    </Card>
  );
}

function SignalStrip({ signals }: { signals: SignalCard[] }) {
  const STATUS_TINT: Record<SignalCard['status'], string> = {
    good: 'text-accent',
    watch: 'text-accent4',
    bad: 'text-accent3',
  };
  const STATUS_DOT: Record<SignalCard['status'], string> = {
    good: 'bg-accent',
    watch: 'bg-accent4',
    bad: 'bg-accent3',
  };
  const STATUS_BAR: Record<SignalCard['status'], string> = {
    good: 'bg-accent',
    watch: 'bg-accent4',
    bad: 'bg-accent3',
  };
  const SOURCE_ICON: Record<SignalCard['source'], typeof Mail> = {
    Postmaster: ShieldCheck,
    SNDS: Radar,
    Placement: Inbox,
  };

  return (
    <Card className="p-5" noShimmer>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent3" />
        <h2 className="text-base font-semibold text-text">
          Pro Plus inbox-delivery signals
        </h2>
        <Badge variant="orange">Pro Plus only</Badge>
        <span className="ml-auto text-xs text-text-dim">
          Google Postmaster + Microsoft SNDS · refreshed hourly
        </span>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {signals.map((s, i) => {
          const SrcIcon = SOURCE_ICON[s.source];
          return (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.36 + i * 0.06 }}
              className="rounded-xl border border-border-muted bg-surface-2/40 p-4"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-dim">
                <span className="flex items-center gap-1.5">
                  <SrcIcon className="h-3.5 w-3.5" />
                  {s.source}
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${STATUS_DOT[s.status]}`}
                  aria-hidden
                />
              </div>
              <p className="mt-2 text-sm text-text-dim">{s.label}</p>
              <p
                className={`text-xl font-semibold tabular-nums ${STATUS_TINT[s.status]}`}
              >
                {s.value}
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className={`h-full rounded-full ${STATUS_BAR[s.status]}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, s.strength))}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut', delay: 0.4 + i * 0.06 }}
                />
              </div>
              <p className="mt-1.5 text-xs text-text-dim">{s.detail}</p>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

export default ProPlusDashV1Command;
