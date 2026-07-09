import { motion } from 'framer-motion';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Inbox,
  Mail,
  MailOpen,
  Minus,
  Reply,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Warmth30dArea } from '@/pages/client/dashboard/Warmth30dArea';
import { PlacementDonut } from '@/pages/client/dashboard/PlacementDonut';

/**
 * ProDashboardV2 — redesigned Pro-tier dashboard (review build).
 *
 * Renders STANDALONE with built-in MOCK data so it can be shown in an
 * isolated preview harness with no live API. The `data` prop is the same
 * shape derived from existing dashboard hooks (`useDashboardSummary`,
 * `useActivityFeed`, `useMailboxes`) so this can be wired to live data
 * later without touching the layout.
 *
 * Layout (top → bottom):
 *   1. Header band — title + plan badge + workspace summary chip
 *   2. Hero row — big warmth gauge w/ delta + inline sparkline   (5 cols)
 *               — KPI strip: sends/target, inbox %, reply rate,   (7 cols)
 *                 mailboxes warming
 *   3. Primary chart row — 30-day warmth area (8) + placement donut (4)
 *   4. Mailbox health — per-mailbox rows with mini sparklines
 *   5. Bottom row — live activity feed (7) + insights/alerts panel (5)
 */

// ---------------------------------------------------------------------------
// Data shape (mirrors features/dashboard/api.ts + mailbox list)
// ---------------------------------------------------------------------------

export interface ProDashboardMailbox {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
  warmth: number;
  delta: number;
  sentToday: number;
  dailyTarget: number;
  day: number;
  status: 'active' | 'paused' | 'pending' | 'completed';
  sparkline: number[];
}

export interface ProDashboardActivity {
  id: string;
  ts: string;
  mailbox: string;
  peer: string;
  action: 'sent' | 'opened' | 'replied' | 'starred' | 'spam_rescued';
}

export interface ProDashboardInsight {
  id: string;
  severity: 'good' | 'warn' | 'danger';
  title: string;
  body: string;
}

export interface ProDashboardData {
  warmth: number;
  warmthYesterday: number;
  warmthDelta: number;
  sentToday: number;
  sendTarget: number;
  opensToday: number;
  repliesToday: number;
  spamRescuesToday: number;
  placement: { inbox_pct: number; promotions_pct: number; spam_pct: number };
  trend30d: Array<{ date: string; warmth_score: number }>;
  mailboxes: ProDashboardMailbox[];
  activity: ProDashboardActivity[];
  insights: ProDashboardInsight[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-tier numbers for the preview harness
// ---------------------------------------------------------------------------

function buildTrend(): Array<{ date: string; warmth_score: number }> {
  const today = new Date('2026-05-17');
  // Smooth ramp 48 → 78 with mild jitter — reads like a real warmup curve.
  return Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const base = 48 + (i / 29) * 30;
    const wobble = Math.sin(i * 0.9) * 2.4;
    return {
      date: d.toISOString().slice(0, 10),
      warmth_score: Math.round(Math.max(0, Math.min(100, base + wobble))),
    };
  });
}

function spark(base: number): number[] {
  return Array.from({ length: 7 }, (_, i) =>
    Math.round(Math.max(0, Math.min(100, base - 6 + i + Math.sin(i * 1.4) * 3))),
  );
}

function tsAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export const MOCK: ProDashboardData = {
  warmth: 78,
  warmthYesterday: 75,
  warmthDelta: 2.6,
  sentToday: 96,
  sendTarget: 120,
  opensToday: 71,
  repliesToday: 28,
  spamRescuesToday: 3,
  placement: { inbox_pct: 91.4, promotions_pct: 6.1, spam_pct: 2.5 },
  trend30d: buildTrend(),
  mailboxes: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      provider: 'gmail',
      warmth: 86,
      delta: 1.8,
      sentToday: 40,
      dailyTarget: 50,
      day: 24,
      status: 'active',
      sparkline: spark(86),
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'outlook',
      warmth: 79,
      delta: 3.1,
      sentToday: 38,
      dailyTarget: 45,
      day: 18,
      status: 'active',
      sparkline: spark(79),
    },
    {
      id: 'mb-3',
      email: 'hello@acme.co',
      provider: 'smtp',
      warmth: 68,
      delta: -1.4,
      sentToday: 18,
      dailyTarget: 25,
      day: 9,
      status: 'active',
      sparkline: spark(68),
    },
  ],
  activity: [
    { id: 'a1', ts: tsAgo(1), mailbox: 'founder@acme.io', peer: 'maria.k@peernet.io', action: 'replied' },
    { id: 'a2', ts: tsAgo(4), mailbox: 'sales@acme.io', peer: 'devon@peernet.io', action: 'opened' },
    { id: 'a3', ts: tsAgo(7), mailbox: 'hello@acme.co', peer: 'aria.s@peernet.io', action: 'spam_rescued' },
    { id: 'a4', ts: tsAgo(12), mailbox: 'founder@acme.io', peer: 'liam@peernet.io', action: 'starred' },
    { id: 'a5', ts: tsAgo(18), mailbox: 'sales@acme.io', peer: 'noah.r@peernet.io', action: 'sent' },
    { id: 'a6', ts: tsAgo(26), mailbox: 'hello@acme.co', peer: 'emma@peernet.io', action: 'opened' },
    { id: 'a7', ts: tsAgo(35), mailbox: 'founder@acme.io', peer: 'oliver@peernet.io', action: 'replied' },
    { id: 'a8', ts: tsAgo(48), mailbox: 'sales@acme.io', peer: 'ava.m@peernet.io', action: 'sent' },
  ],
  insights: [
    {
      id: 'i1',
      severity: 'good',
      title: 'Where emails land holding at 91%',
      body: 'Above the 85% inbox delivery target across all three mailboxes. Sender trust is compounding well.',
    },
    {
      id: 'i2',
      severity: 'warn',
      title: 'hello@acme.co cooled 1.4 pts',
      body: 'Day 9 of building up — a small dip is normal, but watch the next 48h. Consider holding daily volume steady.',
    },
    {
      id: 'i3',
      severity: 'good',
      title: '3 spam recoveries today',
      body: 'Helper network pulled 3 messages back to the inbox, protecting sender trust automatically.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WARMTH_HEX = { hot: '#F26522', warm: '#ffd54f', cold: '#ff6b4a' } as const;

function warmthHex(score: number): string {
  if (score < 40) return WARMTH_HEX.cold;
  if (score < 70) return WARMTH_HEX.warm;
  return WARMTH_HEX.hot;
}

function warmthLabel(score: number): string {
  if (score < 40) return 'Cold';
  if (score < 70) return 'Warming';
  return 'Hot';
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const PROVIDER_LETTER: Record<ProDashboardMailbox['provider'], string> = {
  gmail: 'G',
  outlook: 'O',
  yahoo: 'Y',
  smtp: 'S',
};

const ACTIVITY_META: Record<
  ProDashboardActivity['action'],
  { Icon: typeof Mail; label: string; tone: string }
> = {
  sent: { Icon: Mail, label: 'sent to', tone: 'text-text-dim' },
  opened: { Icon: MailOpen, label: 'opened by', tone: 'text-accent2' },
  replied: { Icon: Reply, label: 'got a reply from', tone: 'text-accent' },
  starred: { Icon: Star, label: 'starred by', tone: 'text-accent4' },
  spam_rescued: { Icon: ShieldCheck, label: 'spam recovery via', tone: 'text-accent' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProDashboardV2({ data }: { data?: ProDashboardData }) {
  const d = data ?? MOCK;

  const openRate = d.sentToday > 0 ? Math.round((d.opensToday / d.sentToday) * 100) : 0;
  const replyRate = d.sentToday > 0 ? Math.round((d.repliesToday / d.sentToday) * 100) : 0;
  const sendPct = Math.min(100, Math.round((d.sentToday / Math.max(1, d.sendTarget)) * 100));
  const activeCount = d.mailboxes.filter((m) => m.status === 'active').length;

  const fade = (delay: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: 'easeOut' as const, delay },
  });

  return (
    <div className="space-y-5">
      {/* 1 — Header band */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">Dashboard</h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Live warmth, inbox vs spam and activity across {d.mailboxes.length} mailboxes.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">{activeCount} warming</span>
          <span className="text-border-muted">·</span>
          <span>helper network live</span>
        </div>
      </motion.header>

      {/* 2 — Hero + KPI strip */}
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
              progress={sendPct}
              tone="accent"
            />
            <KpiTile
              icon={<Inbox className="h-4 w-4" />}
              label="Inbox vs spam"
              value={`${d.placement.inbox_pct.toFixed(1)}%`}
              foot={`${d.placement.spam_pct.toFixed(1)}% spam`}
              progress={Math.round(d.placement.inbox_pct)}
              tone="accent"
            />
            <KpiTile
              icon={<Reply className="h-4 w-4" />}
              label="Reply rate"
              value={`${replyRate}%`}
              foot={`${openRate}% open rate`}
              progress={replyRate}
              tone="accent4"
            />
            <KpiTile
              icon={<Mail className="h-4 w-4" />}
              label="Mailboxes warming"
              value={`${activeCount}/${d.mailboxes.length}`}
              foot={`${d.spamRescuesToday} spam recoveries`}
              progress={Math.round((activeCount / Math.max(1, d.mailboxes.length)) * 100)}
              tone="accent2"
            />
          </div>
        </motion.div>
      </div>

      {/* 3 — Primary chart + placement */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.15)} className="lg:col-span-8">
          <Warmth30dArea points={d.trend30d} />
        </motion.div>
        <motion.div {...fade(0.18)} className="lg:col-span-4">
          <PlacementDonut placement={d.placement} />
        </motion.div>
      </div>

      {/* 4 — Per-mailbox health */}
      <motion.div {...fade(0.22)}>
        <Card>
          <CardContent className="p-0">
            <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-accent" />
                <h2 className="text-base font-semibold text-text">Mailbox health</h2>
              </div>
              <span className="text-xs text-text-dim">
                {d.mailboxes.length} connected · sorted by warmth
              </span>
            </header>
            <ul className="divide-y divide-white/5">
              {[...d.mailboxes]
                .sort((a, b) => b.warmth - a.warmth)
                .map((m, i) => (
                  <MailboxHealthRow key={m.id} m={m} index={i} />
                ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* 5 — Activity feed + insights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.26)} className="lg:col-span-7">
          <Card className="flex h-full flex-col">
            <CardContent className="flex flex-1 flex-col p-0">
              <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <h2 className="text-base font-semibold text-text">Live activity</h2>
                <span className="flex items-center gap-1.5 text-xs text-text-dim">
                  <span className="relative inline-flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                  Live
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
                      transition={{ duration: 0.25, delay: 0.28 + i * 0.03 }}
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
                      <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-text-dim">
                        {relTime(e.ts)}
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
                <TrendingUp className="h-4 w-4 text-accent" />
                <h2 className="text-base font-semibold text-text">Insights</h2>
              </header>
              <div className="space-y-2.5 p-4">
                {d.insights.map((ins, i) => (
                  <InsightRow key={ins.id} insight={ins} index={i} />
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

function WarmthHero({
  score,
  delta,
  trend,
  mailboxCount,
}: {
  score: number;
  delta: number;
  trend: Array<{ date: string; warmth_score: number }>;
  mailboxCount: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const color = warmthHex(pct);
  const size = 188;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    delta > 0 ? 'text-accent' : delta < 0 ? 'text-accent3' : 'text-text-dim';
  const sparkData = trend.map((p, i) => ({ i, v: p.warmth_score }));

  return (
    <Card className="relative h-full overflow-hidden">
      {/* radial glow behind the gauge */}
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
              <linearGradient id="pdv2-gauge" x1="0%" y1="0%" x2="100%" y2="100%">
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
              stroke="url(#pdv2-gauge)"
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
              fontSize="48"
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
          <p className="text-xs uppercase tracking-widest text-text-dim">
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
            <span className="text-text-dim">vs yesterday</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-dim">
            Mean across {mailboxCount} mailboxes. We target 70+ sustained for
            optimal inbox delivery.
          </p>
          <div className="mt-3 h-10 w-full">
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
        <p className="text-2xl font-semibold tabular-nums leading-none text-text">
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

function MailboxHealthRow({ m, index }: { m: ProDashboardMailbox; index: number }) {
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
      className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2/40 sm:grid-cols-[minmax(0,1.6fr)_1fr_1fr_auto]"
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
            Day {m.day} · {m.sentToday}/{m.dailyTarget} sent today
          </p>
        </div>
      </div>

      {/* warmth + bar (hidden on xs) */}
      <div className="hidden min-w-0 sm:block">
        <div className="flex items-center gap-2">
          <span
            className="text-lg font-semibold tabular-nums leading-none"
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
      <div className="hidden h-8 w-full sm:block">
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

      {/* status */}
      <div className="flex justify-end">
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
      </div>
    </motion.li>
  );
}

function InsightRow({
  insight,
  index,
}: {
  insight: ProDashboardInsight;
  index: number;
}) {
  const style =
    insight.severity === 'good'
      ? { border: 'border-accent/30', bg: 'bg-accent/5', text: 'text-accent', Icon: ShieldCheck }
      : insight.severity === 'warn'
        ? { border: 'border-accent4/30', bg: 'bg-accent4/5', text: 'text-accent4', Icon: TrendingUp }
        : { border: 'border-accent3/30', bg: 'bg-accent3/5', text: 'text-accent3', Icon: TrendingUp };
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
        <p className={`text-sm font-medium ${style.text}`}>{insight.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-dim">{insight.body}</p>
      </div>
    </motion.div>
  );
}

export default ProDashboardV2;
