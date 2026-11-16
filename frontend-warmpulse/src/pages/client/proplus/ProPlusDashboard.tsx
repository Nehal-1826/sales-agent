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
  Reply,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
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
 * ProPlusDashboard — "Cockpit" design for the Pro Plus tier.
 *
 * Pro Plus reality: up to 15 mailboxes, 75 sends/day/mailbox, Postmaster +
 * SNDS ingestion, and the Placement Tester. This view is the mission-control
 * surface: a warmth hero gauge, a KPI band, a 30-day warmth+volume combo, a
 * per-mailbox health table with sparklines, a live activity feed, and a
 * Pro-Plus-only "deliverability signals" strip teasing Postmaster / SNDS.
 *
 * Fully STANDALONE — no network, router or query hooks. All numbers come from
 * the inline MOCK const so the preview harness can mount it prop-less. Renders
 * just the page content (heading + body); the app shell supplies the sidebar.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';

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
  /** 0..100 progress for the footer bar. */
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
}

interface DashboardData {
  avgWarmth: number;
  warmthDelta: number;
  mailboxCount: number;
  warmingCount: number;
  sentToday: number;
  sentTarget: number;
  kpis: KpiCard[];
  warmthVolume: WarmthVolumeRow[];
  mailboxes: MailboxHealthRow[];
  feed: FeedEvent[];
  signals: SignalCard[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro Plus numbers
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function isoMinusDays(days: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 30-day warmth ramp 61 → 86 with daily volume 240 → 690, jittered. */
function buildWarmthVolume(): WarmthVolumeRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const warmth = 61 + t * 25 + Math.sin(i * 0.7) * 2;
    const volume = 240 + t * 450 + Math.sin(i * 1.2) * 38;
    return {
      date: isoMinusDays(29 - i),
      warmth: Math.round(Math.max(0, Math.min(100, warmth))),
      volume: Math.round(Math.max(0, volume)),
    };
  });
}

function spark(base: number, drift: number): number[] {
  return Array.from({ length: 14 }, (_, i) => {
    const v = base - drift + (drift / 13) * i + Math.sin(i * 1.1 + base) * 2.4;
    return Math.round(Math.max(0, Math.min(100, v)));
  });
}

const MOCK: DashboardData = {
  avgWarmth: 83,
  warmthDelta: 2.7,
  mailboxCount: 15,
  warmingCount: 11,
  sentToday: 612,
  sentTarget: 825,
  kpis: [
    {
      key: 'sends',
      label: 'Sends today',
      value: 612,
      suffix: '',
      decimals: 0,
      delta: 58,
      deltaUnit: 'vs avg',
      Icon: Send,
      tone: 'accent',
      progress: 74,
    },
    {
      key: 'inbox',
      label: 'Where emails land',
      value: 93.4,
      suffix: '%',
      decimals: 1,
      delta: 2.8,
      deltaUnit: 'pts wk',
      Icon: Inbox,
      tone: 'accent2',
      progress: 93,
    },
    {
      key: 'reply',
      label: 'Reply rate',
      value: 26.1,
      suffix: '%',
      decimals: 1,
      delta: 1.6,
      deltaUnit: 'pts wk',
      Icon: Reply,
      tone: 'accent4',
      progress: 26,
    },
    {
      key: 'spam',
      label: 'Spam rate',
      value: 1.4,
      suffix: '%',
      decimals: 1,
      delta: -0.9,
      deltaUnit: 'pts wk',
      Icon: ShieldCheck,
      tone: 'accent3',
      invert: true,
      progress: 14,
    },
    {
      key: 'warming',
      label: 'Mailboxes warming',
      value: 11,
      suffix: '/15',
      decimals: 0,
      delta: 2,
      deltaUnit: 'vs wk',
      Icon: Mail,
      tone: 'accent',
      progress: 73,
    },
  ],
  warmthVolume: buildWarmthVolume(),
  mailboxes: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      provider: 'gmail',
      warmth: 91,
      delta: 1.4,
      day: 28,
      sentToday: 68,
      target: 75,
      inboxPct: 95.6,
      spark: spark(91, 8),
      status: 'active',
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'outlook',
      warmth: 88,
      delta: 2.2,
      day: 26,
      sentToday: 64,
      target: 70,
      inboxPct: 94.1,
      spark: spark(88, 10),
      status: 'active',
    },
    {
      id: 'mb-3',
      email: 'success@acme.io',
      provider: 'gmail',
      warmth: 85,
      delta: 1.9,
      day: 24,
      sentToday: 58,
      target: 65,
      inboxPct: 93.0,
      spark: spark(85, 9),
      status: 'active',
    },
    {
      id: 'mb-4',
      email: 'partnerships@acme.io',
      provider: 'outlook',
      warmth: 82,
      delta: 3.1,
      day: 21,
      sentToday: 52,
      target: 60,
      inboxPct: 92.2,
      spark: spark(82, 12),
      status: 'warming',
    },
    {
      id: 'mb-5',
      email: 'hello@acme.co',
      provider: 'smtp',
      warmth: 79,
      delta: 2.4,
      day: 18,
      sentToday: 44,
      target: 55,
      inboxPct: 90.8,
      spark: spark(79, 11),
      status: 'warming',
    },
    {
      id: 'mb-6',
      email: 'support@acme.co',
      provider: 'yahoo',
      warmth: 74,
      delta: 2.0,
      day: 15,
      sentToday: 38,
      target: 50,
      inboxPct: 89.1,
      spark: spark(74, 10),
      status: 'warming',
    },
    {
      id: 'mb-7',
      email: 'growth@acme.io',
      provider: 'gmail',
      warmth: 68,
      delta: -1.2,
      day: 11,
      sentToday: 26,
      target: 40,
      inboxPct: 86.4,
      spark: spark(68, -6),
      status: 'warming',
    },
    {
      id: 'mb-8',
      email: 'billing@acme.co',
      provider: 'smtp',
      warmth: 61,
      delta: 2.8,
      day: 7,
      sentToday: 14,
      target: 20,
      inboxPct: 83.7,
      spark: spark(61, 9),
      status: 'warming',
    },
  ],
  feed: [
    { id: 'f1', minutesAgo: 1, mailbox: 'founder@acme.io', peer: 'maya.r@hubspot-peer.net', action: 'replied' },
    { id: 'f2', minutesAgo: 3, mailbox: 'sales@acme.io', peer: 'devon@peer-inbox.io', action: 'opened' },
    { id: 'f3', minutesAgo: 4, mailbox: 'success@acme.io', peer: 'lina.k@peernet.co', action: 'sent' },
    { id: 'f4', minutesAgo: 6, mailbox: 'hello@acme.co', peer: 'omar@peer-inbox.io', action: 'starred' },
    { id: 'f5', minutesAgo: 9, mailbox: 'support@acme.co', peer: 'jess@peernet.co', action: 'spam_rescued' },
    { id: 'f6', minutesAgo: 12, mailbox: 'partnerships@acme.io', peer: 'raj.p@peer-inbox.io', action: 'replied' },
    { id: 'f7', minutesAgo: 15, mailbox: 'growth@acme.io', peer: 'ava@peernet.co', action: 'opened' },
    { id: 'f8', minutesAgo: 18, mailbox: 'billing@acme.co', peer: 'tom.h@peer-inbox.io', action: 'sent' },
  ],
  signals: [
    {
      key: 'pm-rep',
      source: 'Postmaster',
      label: 'Gmail domain trust',
      value: 'High',
      status: 'good',
      detail: '4 Gmail mailboxes · stable 14d',
    },
    {
      key: 'pm-spam',
      source: 'Postmaster',
      label: 'Gmail spam rate',
      value: '0.08%',
      status: 'good',
      detail: 'Well under the 0.30% threshold',
    },
    {
      key: 'snds',
      source: 'SNDS',
      label: 'Outlook IP status',
      value: 'Green',
      status: 'good',
      detail: 'Filter result green · 0 complaints',
    },
    {
      key: 'placement',
      source: 'Placement',
      label: 'Last seed test',
      value: '94% inbox',
      status: 'watch',
      detail: '47/50 seeds · 2 promotions, 1 spam',
    },
  ],
};

// ---------------------------------------------------------------------------
// Animation helpers
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
    const dur = 1000;
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

export function ProPlusDashboard(): JSX.Element {
  const d = MOCK;

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Mission control
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Warmth, inbox delivery and live signal across {d.mailboxCount}{' '}
            mailboxes · {d.sentToday}/{d.sentTarget} sent today.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">
            {d.warmingCount}/{d.mailboxCount} warming
          </span>
          <span className="text-border-muted">·</span>
          <span>Postmaster + SNDS live</span>
        </div>
      </motion.header>

      {/* Hero gauge + KPI band */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.05)} className="lg:col-span-4">
          <WarmthHero value={d.avgWarmth} delta={d.warmthDelta} />
        </motion.div>
        <motion.div
          {...fade(0.1)}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-8 lg:grid-cols-3 xl:grid-cols-5"
        >
          {d.kpis.map((k) => (
            <KpiTile key={k.key} kpi={k} />
          ))}
        </motion.div>
      </div>

      {/* Warmth + volume combo */}
      <motion.div {...fade(0.15)}>
        <WarmthVolumeChart rows={d.warmthVolume} />
      </motion.div>

      {/* Mailbox health + activity feed */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.2)} className="lg:col-span-7">
          <MailboxHealthTable rows={d.mailboxes} />
        </motion.div>
        <motion.div {...fade(0.25)} className="lg:col-span-5">
          <ActivityFeed feed={d.feed} />
        </motion.div>
      </div>

      {/* Pro Plus signal strip */}
      <motion.div {...fade(0.3)}>
        <SignalStrip signals={d.signals} />
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WarmthHero({ value, delta }: { value: number; delta: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const shown = useCountUp(value, 0, inView);
  const pct = Math.max(0, Math.min(100, value));
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    delta > 0 ? 'text-accent' : delta < 0 ? 'text-accent3' : 'text-text-dim';

  // Conic-gradient ring; the sweep angle animates via Framer's number tween.
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <Card className="flex h-full flex-col items-center justify-center gap-4 p-6" noShimmer>
      <div ref={ref} className="relative grid h-44 w-44 place-items-center">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="var(--wp-surface-2, #1a1a26)"
            strokeWidth="9"
          />
          <motion.circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={warmthHex(value)}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={inView ? { strokeDashoffset: C - (pct / 100) * C } : {}}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider text-text-dim">
            Avg warmth
          </span>
          <span className="text-4xl font-semibold tabular-nums leading-tight text-text">
            {Math.round(shown)}
          </span>
          <span className={`flex items-center gap-0.5 text-xs font-medium ${deltaTone}`}>
            <DeltaIcon className="h-3 w-3" />
            {delta > 0 ? '+' : ''}
            {delta} · 7d
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-text-dim">
        <Gauge className="h-3.5 w-3.5 text-accent" />
        Workspace warmth across 15 mailboxes
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
    <Card className="h-full" style={{}} noShimmer>
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
        <span className="flex items-center gap-1.5 rounded-full border border-border-muted px-2.5 py-1 text-xs text-text-dim">
          <TrendingUp className="h-3 w-3 text-accent" />
          30d
        </span>
      </header>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
            <defs>
              <linearGradient id="ppd-vol" x1="0" y1="0" x2="0" y2="1">
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
              width={36}
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
              fill="url(#ppd-vol)"
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
    <div className="h-9 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
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

function MailboxHealthTable({ rows }: { rows: MailboxHealthRow[] }) {
  const ranked = useMemo(
    () => [...rows].sort((a, b) => b.warmth - a.warmth),
    [rows],
  );
  return (
    <Card className="h-full" noShimmer>
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">Mailbox health</h2>
        </div>
        <span className="text-xs text-text-dim">{rows.length} active</span>
      </header>
      <ul className="divide-y divide-white/5">
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
            <motion.li
              key={m.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.25 + i * 0.05 }}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60"
            >
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
                <p className="text-xs text-text-dim">
                  Day {m.day}/28 · {m.sentToday}/{m.target} sent · {m.inboxPct}%
                  inbox
                </p>
              </div>
              <div className="hidden sm:block">
                <MiniSpark data={m.spark} color={color} />
              </div>
              <div className="shrink-0 text-right">
                <p
                  className="text-base font-semibold tabular-nums leading-none"
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
            </motion.li>
          );
        })}
      </ul>
    </Card>
  );
}

function ActivityFeed({ feed }: { feed: FeedEvent[] }) {
  return (
    <Card className="h-full" noShimmer>
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">Live activity</h2>
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
              transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
              className="flex items-center gap-3 px-5 py-3"
            >
              <span className={`shrink-0 ${meta.tone}`}>
                <meta.Icon className="h-4 w-4" />
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
  const SOURCE_ICON: Record<SignalCard['source'], typeof Mail> = {
    Postmaster: ShieldCheck,
    SNDS: Radar,
    Placement: Inbox,
  };

  return (
    <Card className="p-5" noShimmer>
      <header className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent3" />
        <h2 className="text-base font-semibold text-text">
          Pro Plus inbox-delivery signals
        </h2>
        <Badge variant="orange">Pro Plus only</Badge>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {signals.map((s, i) => {
          const SrcIcon = SOURCE_ICON[s.source];
          return (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.32 + i * 0.06 }}
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
              <p className="mt-1 text-xs text-text-dim">{s.detail}</p>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

export default ProPlusDashboard;
