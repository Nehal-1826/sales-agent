import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Gauge as GaugeIcon,
  Inbox,
  Mail,
  MailOpen,
  Minus,
  Radio,
  Reply,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * ProDashCommand — Pro-tier "Command Center / Ops Cockpit" dashboard.
 *
 * Renders FULLY STANDALONE with built-in MOCK data — no network, no router,
 * no fetching hooks — so it can be dropped into an isolated preview harness.
 *
 * Bar to beat: the Starter dashboard is a single-mailbox focus card. This
 * view is deliberately denser and multi-mailbox: a commanding warmth hero
 * with live telemetry chips, a tight KPI rail, a 30-day warmth curve with
 * placement gauges, a per-mailbox health matrix, and a live activity stream
 * with an alerts/insights column — mission-control for a power operator.
 *
 * Layout (top → bottom):
 *   1. Command bar       — title + Pro badge + live network status strip
 *   2. Hero + telemetry  — big warmth gauge (5) + 4-up KPI rail (7)
 *   3. Warmth ops chart  — 30-day area + placement gauges sidebar (8 / 4)
 *   4. Mailbox matrix    — per-mailbox health table w/ sparklines
 *   5. Stream + alerts   — live activity feed (7) + insights column (5)
 */

// ---------------------------------------------------------------------------
// Data shape (mirrors features/dashboard/api.ts + mailbox list)
// ---------------------------------------------------------------------------

interface CmdMailbox {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
  warmth: number;
  delta: number;
  sentToday: number;
  dailyTarget: number;
  day: number;
  inboxPct: number;
  status: 'active' | 'paused' | 'pending' | 'completed';
  sparkline: number[];
}

interface CmdActivity {
  id: string;
  ts: string;
  mailbox: string;
  peer: string;
  action: 'sent' | 'opened' | 'replied' | 'starred' | 'spam_rescued';
}

interface CmdAlert {
  id: string;
  severity: 'good' | 'warn' | 'danger';
  title: string;
  body: string;
}

interface CmdData {
  warmth: number;
  warmthDelta: number;
  sentToday: number;
  sendTarget: number;
  opensToday: number;
  repliesToday: number;
  spamRescuesToday: number;
  peersOnline: number;
  peersTotal: number;
  placement: { inbox_pct: number; promotions_pct: number; spam_pct: number };
  trend30d: Array<{ date: string; warmth: number; sends: number }>;
  mailboxes: CmdMailbox[];
  activity: CmdActivity[];
  alerts: CmdAlert[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-tier numbers for the preview harness
// ---------------------------------------------------------------------------

function buildTrend(): CmdData['trend30d'] {
  const today = new Date('2026-05-17');
  // Smooth ramp 54 → 84 with mild jitter — reads like a real warmup curve.
  return Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const base = 54 + (i / 29) * 30;
    const wobble = Math.sin(i * 0.8) * 2.6;
    return {
      date: d.toISOString().slice(5, 10),
      warmth: Math.round(Math.max(0, Math.min(100, base + wobble))),
      sends: Math.round(70 + (i / 29) * 60 + Math.sin(i * 1.3) * 8),
    };
  });
}

function spark(base: number): number[] {
  return Array.from({ length: 12 }, (_, i) =>
    Math.round(Math.max(0, Math.min(100, base - 7 + i * 0.7 + Math.sin(i * 1.3) * 3))),
  );
}

function tsAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const MOCK: CmdData = {
  warmth: 81,
  warmthDelta: 2.4,
  sentToday: 138,
  sendTarget: 165,
  opensToday: 104,
  repliesToday: 41,
  spamRescuesToday: 5,
  peersOnline: 47,
  peersTotal: 52,
  placement: { inbox_pct: 92.6, promotions_pct: 5.1, spam_pct: 2.3 },
  trend30d: buildTrend(),
  mailboxes: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      provider: 'gmail',
      warmth: 89,
      delta: 1.6,
      sentToday: 48,
      dailyTarget: 50,
      day: 27,
      inboxPct: 95.1,
      status: 'active',
      sparkline: spark(89),
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'outlook',
      warmth: 83,
      delta: 2.9,
      sentToday: 42,
      dailyTarget: 50,
      day: 21,
      inboxPct: 93.4,
      status: 'active',
      sparkline: spark(83),
    },
    {
      id: 'mb-3',
      email: 'support@acme.io',
      provider: 'gmail',
      warmth: 76,
      delta: 3.4,
      sentToday: 30,
      dailyTarget: 40,
      day: 14,
      inboxPct: 90.2,
      status: 'active',
      sparkline: spark(76),
    },
    {
      id: 'mb-4',
      email: 'hello@acme.co',
      provider: 'smtp',
      warmth: 67,
      delta: -1.7,
      sentToday: 18,
      dailyTarget: 25,
      day: 8,
      inboxPct: 84.6,
      status: 'active',
      sparkline: spark(67),
    },
    {
      id: 'mb-5',
      email: 'team@acme.dev',
      provider: 'yahoo',
      warmth: 58,
      delta: 0,
      sentToday: 0,
      dailyTarget: 20,
      day: 4,
      inboxPct: 79.8,
      status: 'paused',
      sparkline: spark(58),
    },
  ],
  activity: [
    { id: 'a1', ts: tsAgo(0), mailbox: 'founder@acme.io', peer: 'maria.k@peernet.io', action: 'replied' },
    { id: 'a2', ts: tsAgo(2), mailbox: 'sales@acme.io', peer: 'devon@peernet.io', action: 'opened' },
    { id: 'a3', ts: tsAgo(4), mailbox: 'support@acme.io', peer: 'aria.s@peernet.io', action: 'spam_rescued' },
    { id: 'a4', ts: tsAgo(6), mailbox: 'founder@acme.io', peer: 'liam@peernet.io', action: 'starred' },
    { id: 'a5', ts: tsAgo(9), mailbox: 'sales@acme.io', peer: 'noah.r@peernet.io', action: 'sent' },
    { id: 'a6', ts: tsAgo(13), mailbox: 'hello@acme.co', peer: 'emma@peernet.io', action: 'opened' },
    { id: 'a7', ts: tsAgo(17), mailbox: 'support@acme.io', peer: 'oliver@peernet.io', action: 'replied' },
    { id: 'a8', ts: tsAgo(22), mailbox: 'founder@acme.io', peer: 'ava.m@peernet.io', action: 'sent' },
    { id: 'a9', ts: tsAgo(28), mailbox: 'sales@acme.io', peer: 'mia.w@peernet.io', action: 'starred' },
    { id: 'a10', ts: tsAgo(36), mailbox: 'hello@acme.co', peer: 'ethan@peernet.io', action: 'spam_rescued' },
  ],
  alerts: [
    {
      id: 'i1',
      severity: 'good',
      title: 'Where emails land holding at 92.6%',
      body: 'Above the 85% inbox delivery target across the fleet. Sender trust is compounding well.',
    },
    {
      id: 'i2',
      severity: 'warn',
      title: 'hello@acme.co cooled 1.7 pts',
      body: 'Day 8 of building up — a small dip is normal. Hold daily volume steady and watch the next 48h.',
    },
    {
      id: 'i3',
      severity: 'danger',
      title: 'team@acme.dev is paused',
      body: 'Warmup stopped at day 4. Resume it to keep building sender trust before sending real campaigns.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WARMTH_HEX = { hot: '#F26522', warm: '#ffd54f', cold: '#ff6b4a' } as const;

function warmthHex(score: number): string {
  if (score < 45) return WARMTH_HEX.cold;
  if (score < 72) return WARMTH_HEX.warm;
  return WARMTH_HEX.hot;
}

function warmthLabel(score: number): string {
  if (score < 45) return 'Cold';
  if (score < 72) return 'Warming';
  return 'Optimal';
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

const PROVIDER_LETTER: Record<CmdMailbox['provider'], string> = {
  gmail: 'G',
  outlook: 'O',
  yahoo: 'Y',
  smtp: 'S',
};

const ACTIVITY_META: Record<
  CmdActivity['action'],
  { Icon: typeof Mail; label: string; tone: string }
> = {
  sent: { Icon: Mail, label: 'sent to', tone: 'text-text-dim' },
  opened: { Icon: MailOpen, label: 'opened by', tone: 'text-accent2' },
  replied: { Icon: Reply, label: 'got a reply from', tone: 'text-accent' },
  starred: { Icon: Star, label: 'starred by', tone: 'text-accent4' },
  spam_rescued: { Icon: ShieldCheck, label: 'spam recovery via', tone: 'text-accent' },
};

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProDashCommand({ data }: { data?: CmdData }) {
  const d = data ?? MOCK;

  const stats = useMemo(() => {
    const openRate = d.sentToday > 0 ? Math.round((d.opensToday / d.sentToday) * 100) : 0;
    const replyRate = d.sentToday > 0 ? Math.round((d.repliesToday / d.sentToday) * 100) : 0;
    const sendPct = Math.min(100, Math.round((d.sentToday / Math.max(1, d.sendTarget)) * 100));
    const activeCount = d.mailboxes.filter((m) => m.status === 'active').length;
    return { openRate, replyRate, sendPct, activeCount };
  }, [d]);

  return (
    <div className="space-y-4">
      {/* 1 — Command bar */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Command Center
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Live warmth, inbox vs spam and activity across {d.mailboxes.length} mailboxes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip
            icon={<Radio className="h-3.5 w-3.5" />}
            label={`${d.peersOnline}/${d.peersTotal} helpers online`}
            live
          />
          <StatusChip
            icon={<Zap className="h-3.5 w-3.5" />}
            label={`${stats.activeCount} warming`}
          />
          <StatusChip
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Engine healthy"
          />
        </div>
      </motion.header>

      {/* 2 — Hero + KPI telemetry rail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.05)} className="lg:col-span-5">
          <WarmthHero
            score={d.warmth}
            delta={d.warmthDelta}
            trend={d.trend30d}
            mailboxCount={d.mailboxes.length}
          />
        </motion.div>

        <motion.div {...fade(0.1)} className="lg:col-span-7">
          <div className="grid h-full grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiTile
              icon={<Zap className="h-4 w-4" />}
              label="Sends today"
              value={`${d.sentToday}`}
              foot={`of ${d.sendTarget} target`}
              progress={stats.sendPct}
              tone="accent"
            />
            <KpiTile
              icon={<Inbox className="h-4 w-4" />}
              label="Inbox vs spam"
              value={`${d.placement.inbox_pct.toFixed(1)}%`}
              foot={`${d.placement.spam_pct.toFixed(1)}% to spam`}
              progress={Math.round(d.placement.inbox_pct)}
              tone="accent"
            />
            <KpiTile
              icon={<Reply className="h-4 w-4" />}
              label="Reply rate"
              value={`${stats.replyRate}%`}
              foot={`${stats.openRate}% open rate`}
              progress={stats.replyRate}
              tone="accent4"
            />
            <KpiTile
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Spam recovery"
              value={`${d.spamRescuesToday}`}
              foot="auto-pulled to inbox"
              progress={Math.min(100, d.spamRescuesToday * 12)}
              tone="accent3"
            />
          </div>
        </motion.div>
      </div>

      {/* 3 — Warmth ops chart + placement gauges */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.15)} className="lg:col-span-8">
          <WarmthOpsChart trend={d.trend30d} />
        </motion.div>
        <motion.div {...fade(0.18)} className="lg:col-span-4">
          <PlacementPanel placement={d.placement} />
        </motion.div>
      </div>

      {/* 4 — Per-mailbox health matrix */}
      <motion.div {...fade(0.22)}>
        <Card>
          <CardContent className="p-0">
            <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-accent" />
                <h2 className="text-base font-semibold text-text">Mailbox matrix</h2>
              </div>
              <span className="text-xs text-text-dim">
                {d.mailboxes.length} connected · {stats.activeCount} warming
              </span>
            </header>
            {/* Column header (md+) */}
            <div className="hidden grid-cols-[minmax(0,1.7fr)_0.9fr_1.2fr_1fr_1fr_auto] gap-4 border-b border-white/5 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim md:grid">
              <span>Mailbox</span>
              <span>Warmth</span>
              <span>12-pt trend</span>
              <span>Sent / target</span>
              <span>Inbox %</span>
              <span className="text-right">Status</span>
            </div>
            <ul className="divide-y divide-white/5">
              {[...d.mailboxes]
                .sort((a, b) => b.warmth - a.warmth)
                .map((m, i) => (
                  <MailboxMatrixRow key={m.id} m={m} index={i} />
                ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* 5 — Live activity stream + alerts column */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.26)} className="lg:col-span-7">
          <Card className="flex h-full flex-col">
            <CardContent className="flex flex-1 flex-col p-0">
              <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <h2 className="text-base font-semibold text-text">Live activity stream</h2>
                <span className="flex items-center gap-1.5 text-xs text-text-dim">
                  <PulseDot />
                  Streaming
                </span>
              </header>
              <ul className="divide-y divide-white/5">
                {d.activity.map((e, i) => {
                  const meta = ACTIVITY_META[e.action];
                  const Icon = meta.Icon;
                  return (
                    <motion.li
                      key={e.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.28 + i * 0.025 }}
                      className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-surface-2/40"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2/60 ${meta.tone}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-text-dim">
                        <strong className="font-medium text-text">
                          {e.mailbox.split('@')[0]}
                        </strong>{' '}
                        {meta.label}{' '}
                        <span className="text-text-dim">{e.peer}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-text-dim">
                        {relTime(e.ts)} ago
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fade(0.3)} className="lg:col-span-5">
          <Card className="h-full">
            <CardContent className="p-0">
              <header className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
                <AlertTriangle className="h-4 w-4 text-accent4" />
                <h2 className="text-base font-semibold text-text">Alerts &amp; insights</h2>
              </header>
              <div className="space-y-2.5 p-4">
                {d.alerts.map((a, i) => (
                  <AlertRow key={a.id} alert={a} index={i} />
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PulseDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
    </span>
  );
}

function StatusChip({
  icon,
  label,
  live,
}: {
  icon: React.ReactNode;
  label: string;
  live?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
      {live ? <PulseDot /> : <span className="text-accent">{icon}</span>}
      <span className="font-medium text-text">{label}</span>
    </span>
  );
}

function WarmthHero({
  score,
  delta,
  trend,
  mailboxCount,
}: {
  score: number;
  delta: number;
  trend: CmdData['trend30d'];
  mailboxCount: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const color = warmthHex(pct);
  const size = 196;
  const stroke = 15;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    delta > 0 ? 'text-accent' : delta < 0 ? 'text-accent3' : 'text-text-dim';
  const sparkData = trend.map((p, i) => ({ i, v: p.warmth }));

  return (
    <Card className="relative h-full overflow-hidden">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-30"
        style={{ background: `radial-gradient(circle at center, ${color} 0%, transparent 72%)` }}
      />
      <CardContent className="relative flex h-full flex-col items-center gap-5 p-6 sm:flex-row sm:items-center sm:gap-7">
        <div className="relative shrink-0" role="img" aria-label={`Warmth score ${pct}`}>
          <motion.svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <defs>
              <linearGradient id="pdc-gauge" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity="1" />
                <stop offset="100%" stopColor={color} stopOpacity="0.55" />
              </linearGradient>
            </defs>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#1a1a26"
              strokeWidth={stroke}
              fill="none"
            />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="url(#pdc-gauge)"
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ - dash }}
              transition={{ duration: 1, ease: 'easeOut' }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ filter: `drop-shadow(0 0 10px ${color}66)` }}
            />
            <text
              x="50%"
              y="45%"
              textAnchor="middle"
              fill="#e8e8f0"
              fontSize="50"
              fontWeight="700"
              fontFamily="Outfit, system-ui, sans-serif"
            >
              {pct}
            </text>
            <text
              x="50%"
              y="60%"
              textAnchor="middle"
              fill="#8888a0"
              fontSize="11"
              letterSpacing="0.18em"
              fontFamily="Outfit, system-ui, sans-serif"
            >
              WARMTH
            </text>
          </motion.svg>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest text-text-dim sm:justify-start">
            <GaugeIcon className="h-3.5 w-3.5" />
            Workspace warmth
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-text">
            {warmthLabel(pct)}
          </h2>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm sm:justify-start">
            <span className={`flex items-center gap-1 font-semibold ${deltaTone}`}>
              <DeltaIcon className="h-4 w-4" />
              {Math.abs(delta).toFixed(1)} pts
            </span>
            <span className="text-text-dim">vs yesterday · 24h</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-dim">
            Mean across {mailboxCount} mailboxes. Target 70+ sustained for optimal
            inbox delivery.
          </p>
          <div className="mt-3 h-12 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiTile({
  icon,
  label,
  value,
  foot,
  progress,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
  progress: number;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
}) {
  const barColor =
    tone === 'accent'
      ? 'bg-accent'
      : tone === 'accent2'
        ? 'bg-accent2'
        : tone === 'accent4'
          ? 'bg-accent4'
          : 'bg-accent3';
  const iconColor =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : tone === 'accent4'
          ? 'text-accent4'
          : 'text-accent3';
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-dim">
          <span>{label}</span>
          <span className={iconColor}>{icon}</span>
        </div>
        <p className="font-mono text-2xl font-semibold tabular-nums leading-none text-text">
          {value}
        </p>
        <div className="mt-auto space-y-1.5 pt-1">
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className={`h-full rounded-full ${barColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          </div>
          <p className="text-xs text-text-dim">{foot}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function WarmthOpsChart({ trend }: { trend: CmdData['trend30d'] }) {
  const latest = trend[trend.length - 1]?.warmth ?? 0;
  const first = trend[0]?.warmth ?? 0;
  const gain = latest - first;
  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-dim">
              <TrendingUp className="h-3.5 w-3.5 text-accent" />
              30-day warmth · daily sends
            </p>
            <h2 className="mt-1 text-base font-semibold text-text">
              Workspace warmup curve
            </h2>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-text-dim">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Warmth
            </span>
            <span className="flex items-center gap-1.5 text-text-dim">
              <span className="h-2 w-2 rounded-full bg-accent2" />
              Sends
            </span>
            <span className="font-mono font-semibold text-accent">
              +{gain} pts / 30d
            </span>
          </div>
        </header>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
              <defs>
                <linearGradient id="pdc-warmth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F26522" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pdc-sends" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF8A4B" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#FF8A4B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: '#5a5a72', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={5}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#5a5a72', fontSize: 10 }}
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
                itemStyle={{ color: '#e8e8f0' }}
              />
              <Area
                type="monotone"
                dataKey="sends"
                stroke="#FF8A4B"
                strokeWidth={1.5}
                fill="url(#pdc-sends)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="warmth"
                stroke="#F26522"
                strokeWidth={2.4}
                fill="url(#pdc-warmth)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function PlacementPanel({
  placement,
}: {
  placement: CmdData['placement'];
}) {
  const rows: Array<{ label: string; pct: number; tone: string; bar: string }> = [
    { label: 'Inbox', pct: placement.inbox_pct, tone: 'text-accent', bar: 'bg-accent' },
    {
      label: 'Promotions',
      pct: placement.promotions_pct,
      tone: 'text-accent4',
      bar: 'bg-accent4',
    },
    { label: 'Spam', pct: placement.spam_pct, tone: 'text-accent3', bar: 'bg-accent3' },
  ];
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <header className="mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">Where emails land</h2>
        </header>
        <div className="mb-5 flex items-baseline gap-2">
          <span className="font-mono text-4xl font-bold tabular-nums text-text">
            {placement.inbox_pct.toFixed(1)}
            <span className="text-2xl text-text-dim">%</span>
          </span>
          <span className="text-xs text-text-dim">landing in inbox</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${placement.inbox_pct}%` }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
          <motion.div
            className="bg-accent4"
            initial={{ width: 0 }}
            animate={{ width: `${placement.promotions_pct}%` }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
          />
          <motion.div
            className="bg-accent3"
            initial={{ width: 0 }}
            animate={{ width: `${placement.spam_pct}%` }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
          />
        </div>
        <ul className="mt-auto space-y-3 pt-5">
          {rows.map((r) => (
            <li key={r.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-text-dim">
                  <span className={`h-2 w-2 rounded-full ${r.bar}`} />
                  {r.label}
                </span>
                <span className={`font-mono font-semibold tabular-nums ${r.tone}`}>
                  {r.pct.toFixed(1)}%
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${r.bar}`}
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function MailboxMatrixRow({ m, index }: { m: CmdMailbox; index: number }) {
  const color = warmthHex(m.warmth);
  const sparkData = m.sparkline.map((v, i) => ({ i, v }));
  const statusBadge: { label: string; variant: 'green' | 'yellow' | 'blue' | 'neutral' } =
    m.status === 'paused'
      ? { label: 'Paused', variant: 'yellow' }
      : m.status === 'pending'
        ? { label: 'Warming', variant: 'blue' }
        : m.status === 'completed'
          ? { label: 'Done', variant: 'neutral' }
          : { label: 'Active', variant: 'green' };
  const DeltaIcon = m.delta > 0 ? ArrowUpRight : m.delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    m.delta > 0 ? 'text-accent' : m.delta < 0 ? 'text-accent3' : 'text-text-dim';

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.24 + index * 0.04 }}
      className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2/40 md:grid-cols-[minmax(0,1.7fr)_0.9fr_1.2fr_1fr_1fr_auto]"
    >
      {/* identity */}
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-bg"
          style={{ background: color }}
          aria-hidden
        >
          {PROVIDER_LETTER[m.provider]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{m.email}</p>
          <p className="text-xs text-text-dim">
            Day {m.day} · {m.provider}
          </p>
        </div>
      </div>

      {/* warmth (hidden on xs) */}
      <div className="hidden min-w-0 md:block">
        <div className="flex items-baseline gap-1.5">
          <span
            className="font-mono text-lg font-semibold tabular-nums leading-none"
            style={{ color }}
          >
            {m.warmth}
          </span>
          <span className={`flex items-center gap-0.5 text-xs ${deltaTone}`}>
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(m.delta).toFixed(1)}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full"
            style={{ width: `${m.warmth}%`, background: color }}
          />
        </div>
      </div>

      {/* sparkline (hidden on xs) */}
      <div className="hidden h-8 w-full md:block">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* sent / target (hidden on xs) */}
      <div className="hidden md:block">
        <p className="font-mono text-sm tabular-nums text-text">
          {m.sentToday}
          <span className="text-text-dim">/{m.dailyTarget}</span>
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent2"
            style={{
              width: `${Math.min(100, (m.sentToday / Math.max(1, m.dailyTarget)) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* inbox % (hidden on xs) */}
      <div className="hidden md:block">
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${
            m.inboxPct >= 85 ? 'text-accent' : 'text-accent4'
          }`}
        >
          {m.inboxPct.toFixed(1)}%
        </span>
      </div>

      {/* status */}
      <div className="flex justify-end">
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
      </div>
    </motion.li>
  );
}

function AlertRow({ alert, index }: { alert: CmdAlert; index: number }) {
  const style =
    alert.severity === 'good'
      ? { border: 'border-accent/30', bg: 'bg-accent/5', text: 'text-accent', Icon: ShieldCheck }
      : alert.severity === 'warn'
        ? {
            border: 'border-accent4/30',
            bg: 'bg-accent4/5',
            text: 'text-accent4',
            Icon: TrendingUp,
          }
        : {
            border: 'border-accent3/30',
            bg: 'bg-accent3/5',
            text: 'text-accent3',
            Icon: AlertTriangle,
          };
  const Icon = style.Icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.32 + index * 0.05 }}
      className={`flex items-start gap-3 rounded-lg border p-3 ${style.border} ${style.bg}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2/60 ${style.text}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${style.text}`}>{alert.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-dim">{alert.body}</p>
      </div>
    </motion.div>
  );
}

export default ProDashCommand;
