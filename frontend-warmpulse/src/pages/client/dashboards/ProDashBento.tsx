import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  Inbox,
  Mail,
  MailOpen,
  Minus,
  Reply,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

/**
 * ProDashBento — Pro-tier dashboard, "Bento Grid" variant.
 *
 * Standalone review build: renders entirely from the inline MOCK below
 * (no network / router / query hooks). Data shape mirrors the live
 * dashboard hooks so it can be wired to real data without layout changes.
 *
 * Asymmetric 12-col bento grid: warmth hero (5x2) · 30d trend (7x1) ·
 * today sends (4x1) · placement donut (3x1) · 4 KPI tiles (3x1 each) ·
 * mailbox health (7x2) · insights (5x2) · live activity (12x1).
 */

// ---------------------------------------------------------------------------
// Data shape (mirrors features/dashboard + mailbox list)
// ---------------------------------------------------------------------------

interface BentoMailbox {
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

interface BentoActivity {
  id: string;
  ts: string;
  mailbox: string;
  peer: string;
  action: 'sent' | 'opened' | 'replied' | 'starred' | 'spam_rescued';
}

interface BentoInsight {
  id: string;
  severity: 'good' | 'warn';
  title: string;
  body: string;
}

interface BentoData {
  warmth: number;
  warmthDelta: number;
  sentToday: number;
  sendTarget: number;
  opensToday: number;
  repliesToday: number;
  spamRescuesToday: number;
  placement: { inbox_pct: number; promotions_pct: number; spam_pct: number };
  trend30d: Array<{ date: string; warmth_score: number }>;
  mailboxes: BentoMailbox[];
  activity: BentoActivity[];
  insights: BentoInsight[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-tier numbers for the preview harness
// ---------------------------------------------------------------------------

function buildTrend(): Array<{ date: string; warmth_score: number }> {
  const today = new Date('2026-05-17');
  // Smooth ramp 51 → 81 with mild wobble — reads like a real warmup curve.
  return Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const base = 51 + (i / 29) * 30;
    const wobble = Math.sin(i * 0.85) * 2.6;
    return {
      date: d.toISOString().slice(0, 10),
      warmth_score: Math.round(Math.max(0, Math.min(100, base + wobble))),
    };
  });
}

function spark(base: number): number[] {
  return Array.from({ length: 8 }, (_, i) =>
    Math.round(Math.max(0, Math.min(100, base - 7 + i + Math.sin(i * 1.3) * 3))),
  );
}

function tsAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const MOCK: BentoData = {
  warmth: 79,
  warmthDelta: 2.4,
  sentToday: 104,
  sendTarget: 130,
  opensToday: 78,
  repliesToday: 31,
  spamRescuesToday: 4,
  placement: { inbox_pct: 92.3, promotions_pct: 5.2, spam_pct: 2.5 },
  trend30d: buildTrend(),
  mailboxes: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      provider: 'gmail',
      warmth: 88,
      delta: 1.9,
      sentToday: 42,
      dailyTarget: 50,
      day: 26,
      status: 'active',
      sparkline: spark(88),
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'outlook',
      warmth: 81,
      delta: 3.2,
      sentToday: 36,
      dailyTarget: 45,
      day: 19,
      status: 'active',
      sparkline: spark(81),
    },
    {
      id: 'mb-3',
      email: 'success@acme.co',
      provider: 'smtp',
      warmth: 74,
      delta: 0.6,
      sentToday: 18,
      dailyTarget: 25,
      day: 12,
      status: 'active',
      sparkline: spark(74),
    },
    {
      id: 'mb-4',
      email: 'hello@acme.dev',
      provider: 'yahoo',
      warmth: 63,
      delta: -1.3,
      sentToday: 8,
      dailyTarget: 20,
      day: 7,
      status: 'pending',
      sparkline: spark(63),
    },
  ],
  activity: [
    { id: 'a1', ts: tsAgo(1), mailbox: 'founder@acme.io', peer: 'maria.k@peernet.io', action: 'replied' },
    { id: 'a2', ts: tsAgo(3), mailbox: 'sales@acme.io', peer: 'devon@peernet.io', action: 'opened' },
    { id: 'a3', ts: tsAgo(6), mailbox: 'success@acme.co', peer: 'aria.s@peernet.io', action: 'spam_rescued' },
    { id: 'a4', ts: tsAgo(11), mailbox: 'founder@acme.io', peer: 'liam@peernet.io', action: 'starred' },
    { id: 'a5', ts: tsAgo(16), mailbox: 'sales@acme.io', peer: 'noah.r@peernet.io', action: 'sent' },
    { id: 'a6', ts: tsAgo(24), mailbox: 'hello@acme.dev', peer: 'emma@peernet.io', action: 'opened' },
    { id: 'a7', ts: tsAgo(33), mailbox: 'founder@acme.io', peer: 'oliver@peernet.io', action: 'replied' },
    { id: 'a8', ts: tsAgo(47), mailbox: 'success@acme.co', peer: 'ava.m@peernet.io', action: 'sent' },
  ],
  insights: [
    {
      id: 'i1',
      severity: 'good',
      title: 'Where emails land holding at 92%',
      body: 'Above the 85% inbox delivery target across all four mailboxes. Sender trust is compounding nicely.',
    },
    {
      id: 'i2',
      severity: 'warn',
      title: 'hello@acme.dev cooled 1.3 pts',
      body: 'Day 7 of building up — a small dip is expected early. Hold daily volume steady and watch the next 48h.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers — warmth maps to the existing accent tokens (no new colors)
// ---------------------------------------------------------------------------

type WarmthTone = 'accent' | 'accent4' | 'accent3';

function warmthTone(score: number): WarmthTone {
  if (score < 50) return 'accent3'; // cold
  if (score < 72) return 'accent4'; // warming
  return 'accent'; // hot
}

const TONE_HEX: Record<WarmthTone, string> = {
  accent: '#F26522',
  accent4: '#ffd54f',
  accent3: '#ff6b4a',
};

const TONE_TEXT: Record<WarmthTone, string> = {
  accent: 'text-accent',
  accent4: 'text-accent4',
  accent3: 'text-accent3',
};

function warmthLabel(score: number): string {
  if (score < 50) return 'Cold';
  if (score < 72) return 'Warming';
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

const PROVIDER_LETTER: Record<BentoMailbox['provider'], string> = {
  gmail: 'G',
  outlook: 'O',
  yahoo: 'Y',
  smtp: 'S',
};

const ACTIVITY_META: Record<
  BentoActivity['action'],
  { Icon: typeof Mail; label: string; tone: string }
> = {
  sent: { Icon: Mail, label: 'sent to', tone: 'text-text-dim' },
  opened: { Icon: MailOpen, label: 'opened by', tone: 'text-accent4' },
  replied: { Icon: Reply, label: 'got a reply from', tone: 'text-accent' },
  starred: { Icon: Star, label: 'starred by', tone: 'text-accent4' },
  spam_rescued: { Icon: ShieldCheck, label: 'spam recovery via', tone: 'text-accent' },
};

const STATUS_BADGE: Record<
  BentoMailbox['status'],
  { label: string; variant: 'green' | 'yellow' | 'blue' | 'neutral' }
> = {
  active: { label: 'Active', variant: 'green' },
  paused: { label: 'Paused', variant: 'yellow' },
  pending: { label: 'Warming', variant: 'blue' },
  completed: { label: 'Done', variant: 'neutral' },
};

// ---------------------------------------------------------------------------
// Shared bento-tile shell — rounded card w/ gradient-border + subtle depth
// ---------------------------------------------------------------------------

function Tile({
  className = '',
  delay,
  glow,
  children,
}: {
  className?: string;
  delay: number;
  glow?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1], delay }}
      className={[
        'group relative isolate flex flex-col overflow-hidden rounded-2xl',
        'border border-white/[0.07] bg-surface/60 backdrop-blur-xl backdrop-saturate-150',
        'shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.06)]',
        'transition-colors duration-300 hover:border-accent/30',
        className,
      ].join(' ')}
    >
      {/* gradient-border sheen on the top edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      {glow ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full opacity-[0.16]"
          style={{ background: `radial-gradient(circle at center, ${glow} 0%, transparent 72%)` }}
        />
      ) : null}
      {children}
    </motion.section>
  );
}

function TileHead({
  icon,
  title,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 px-5 pt-4">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-dim">
        <span className="text-accent">{icon}</span>
        {title}
      </span>
      {right}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProDashBento() {
  const d = MOCK;

  const openRate = d.sentToday > 0 ? Math.round((d.opensToday / d.sentToday) * 100) : 0;
  const replyRate = d.sentToday > 0 ? Math.round((d.repliesToday / d.sentToday) * 100) : 0;
  const sendPct = Math.min(100, Math.round((d.sentToday / Math.max(1, d.sendTarget)) * 100));
  const activeCount = d.mailboxes.filter((m) => m.status === 'active').length;
  const tone = warmthTone(d.warmth);

  const trendData = useMemo(
    () => d.trend30d.map((p) => ({ date: p.date, v: p.warmth_score })),
    [d.trend30d],
  );

  const placementData = useMemo(
    () => [
      { name: 'Inbox', value: d.placement.inbox_pct, fill: TONE_HEX.accent },
      { name: 'Promotions', value: d.placement.promotions_pct, fill: TONE_HEX.accent4 },
      { name: 'Spam', value: d.placement.spam_pct, fill: TONE_HEX.accent3 },
    ],
    [d.placement],
  );

  return (
    <div className="space-y-5">
      {/* Header band */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
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

      {/* ===================== BENTO GRID ===================== */}
      <div className="grid grid-cols-12 gap-4 [grid-auto-rows:minmax(150px,auto)]">
        {/* --- Hero warmth tile (2x2) --- */}
        <Tile
          delay={0.05}
          glow={TONE_HEX[tone]}
          className="col-span-12 row-span-2 sm:col-span-6 lg:col-span-5"
        >
          <WarmthHero
            score={d.warmth}
            delta={d.warmthDelta}
            tone={tone}
            mailboxCount={d.mailboxes.length}
          />
        </Tile>

        {/* --- 30-day trend (wide 7x1) --- */}
        <Tile delay={0.1} className="col-span-12 sm:col-span-6 lg:col-span-7">
          <TileHead
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            title="Warmth · last 30 days"
            right={
              <span className="rounded-full border border-border-muted bg-surface-2/70 px-2.5 py-0.5 font-mono text-[11px] text-text-faint">
                {trendData.length}d
              </span>
            }
          />
          <div className="mt-1 h-[200px] w-full px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="bento-trend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TONE_HEX.accent} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={TONE_HEX.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  cursor={{ stroke: '#2a2a3a', strokeWidth: 1 }}
                  contentStyle={{
                    background: '#12121a',
                    border: '1px solid #2a2a3a',
                    borderRadius: 10,
                    fontSize: 12,
                    color: '#e8e8f0',
                  }}
                  labelStyle={{ color: '#8888a0' }}
                  formatter={(value: number | string) => [`${value}`, 'Warmth']}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={TONE_HEX.accent}
                  strokeWidth={2.4}
                  fill="url(#bento-trend)"
                  isAnimationActive
                  animationDuration={1100}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Tile>

        {/* --- Today's sends (small 4x1) --- */}
        <Tile delay={0.14} className="col-span-12 sm:col-span-6 lg:col-span-4">
          <TileHead icon={<Target className="h-3.5 w-3.5" />} title="Today's sends" />
          <div className="flex flex-1 items-center gap-5 px-5 pb-5 pt-3">
            <RadialProgress pct={sendPct} />
            <div className="min-w-0">
              <p className="text-3xl font-semibold leading-none tabular-nums text-text">
                {d.sentToday}
                <span className="text-base font-medium text-text-dim">
                  /{d.sendTarget}
                </span>
              </p>
              <p className="mt-1.5 text-xs text-text-dim">
                {sendPct}% of daily target
              </p>
              <p className="mt-0.5 text-xs text-text-faint">
                {d.sendTarget - d.sentToday} sends remaining
              </p>
            </div>
          </div>
        </Tile>

        {/* --- Placement donut (small 3x1) --- */}
        <Tile delay={0.18} className="col-span-12 sm:col-span-6 lg:col-span-3">
          <TileHead icon={<Inbox className="h-3.5 w-3.5" />} title="Where emails land" />
          <div className="flex flex-1 items-center gap-3 px-4 pb-4 pt-2">
            <div className="relative h-[112px] w-[112px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={placementData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={52}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive
                    animationDuration={900}
                  >
                    {placementData.map((p) => (
                      <Cell key={p.name} fill={p.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-semibold leading-none tabular-nums text-text">
                  {d.placement.inbox_pct.toFixed(0)}%
                </span>
                <span className="text-[10px] uppercase tracking-wider text-text-faint">
                  inbox
                </span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
              {placementData.map((p) => (
                <li key={p.name} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: p.fill }}
                  />
                  <span className="flex-1 truncate text-text-dim">{p.name}</span>
                  <span className="font-mono tabular-nums text-text">
                    {p.value.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Tile>

        {/* --- 4 small KPI tiles (1x1 each) --- */}
        <KpiTile
          delay={0.22}
          icon={<Reply className="h-4 w-4" />}
          label="Reply rate"
          value={`${replyRate}%`}
          foot={`${d.repliesToday} replies today`}
          progress={replyRate}
          tone="accent"
        />
        <KpiTile
          delay={0.25}
          icon={<MailOpen className="h-4 w-4" />}
          label="Open rate"
          value={`${openRate}%`}
          foot={`${d.opensToday} opens today`}
          progress={openRate}
          tone="accent4"
        />
        <KpiTile
          delay={0.28}
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Spam recovery"
          value={`${d.spamRescuesToday}`}
          foot="Pulled back to inbox"
          progress={Math.min(100, d.spamRescuesToday * 16)}
          tone="accent"
        />
        <KpiTile
          delay={0.31}
          icon={<Mail className="h-4 w-4" />}
          label="Mailboxes"
          value={`${activeCount}/${d.mailboxes.length}`}
          foot={`${d.mailboxes.length - activeCount} still building up`}
          progress={Math.round((activeCount / Math.max(1, d.mailboxes.length)) * 100)}
          tone="accent4"
        />

        {/* --- Mailbox health (wide 7x1) --- */}
        <Tile delay={0.34} className="col-span-12 row-span-2 lg:col-span-7">
          <TileHead
            icon={<Activity className="h-3.5 w-3.5" />}
            title="Mailbox health"
            right={
              <span className="text-[11px] text-text-faint">
                {d.mailboxes.length} connected · by warmth
              </span>
            }
          />
          <ul className="mt-2 flex-1 divide-y divide-white/[0.05]">
            {[...d.mailboxes]
              .sort((a, b) => b.warmth - a.warmth)
              .map((m, i) => (
                <MailboxRow key={m.id} m={m} index={i} />
              ))}
          </ul>
        </Tile>

        {/* --- Insights (5x1, spans both health rows) --- */}
        <Tile delay={0.38} className="col-span-12 row-span-2 lg:col-span-5">
          <TileHead icon={<Sparkles className="h-3.5 w-3.5" />} title="Insights" />
          <div className="flex-1 space-y-2.5 p-4 pt-3">
            {d.insights.map((ins, i) => (
              <InsightRow key={ins.id} insight={ins} index={i} />
            ))}
            <div className="rounded-xl border border-white/[0.06] bg-surface-2/40 p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-text">
                <Flame className="h-3.5 w-3.5 text-accent4" />
                Sender trust momentum
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-dim">
                Workspace warmth up {d.warmthDelta.toFixed(1)} pts in 24h — at
                this pace all mailboxes clear 80+ within the week.
              </p>
            </div>
          </div>
        </Tile>

        {/* --- Live activity (full-width 12x1) --- */}
        <Tile delay={0.42} className="col-span-12">
          <TileHead
            icon={<Activity className="h-3.5 w-3.5" />}
            title="Live activity"
            right={
              <span className="flex items-center gap-1.5 text-[11px] text-text-dim">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                Live
              </span>
            }
          />
          <ul className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {d.activity.map((e, i) => {
              const meta = ACTIVITY_META[e.action];
              const Icon = meta.Icon;
              return (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.46 + i * 0.03 }}
                  className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-2.5 text-sm transition-colors hover:bg-surface-2/40"
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
                    {meta.label} <span className="text-text-dim">{e.peer}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-text-faint">
                    {relTime(e.ts)}
                  </span>
                </motion.li>
              );
            })}
          </ul>
        </Tile>
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
  tone,
  mailboxCount,
}: {
  score: number;
  delta: number;
  tone: WarmthTone;
  mailboxCount: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const color = TONE_HEX[tone];
  const size = 200;
  const stroke = 15;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    delta > 0 ? 'text-accent' : delta < 0 ? 'text-accent3' : 'text-text-dim';

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="relative shrink-0" role="img" aria-label={`Warmth score ${pct}`}>
        <motion.svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45 }}
        >
          <defs>
            <linearGradient id="bento-gauge" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.5" />
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
            stroke="url(#bento-gauge)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - dash }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 11px ${color}66)` }}
          />
          <text
            x="50%"
            y="46%"
            textAnchor="middle"
            fill="#e8e8f0"
            fontSize="52"
            fontWeight="700"
            fontFamily="Outfit, system-ui, sans-serif"
          >
            {pct}
          </text>
          <text
            x="50%"
            y="61%"
            textAnchor="middle"
            fill="#8888a0"
            fontSize="11"
            letterSpacing="0.2em"
            fontFamily="Outfit, system-ui, sans-serif"
          >
            WARMTH
          </text>
        </motion.svg>
      </div>

      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-text-dim">
          Workspace warmth
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight text-text">
          {warmthLabel(pct)}
        </h2>
        <div className="mt-2 flex items-center justify-center gap-2 text-sm">
          <span className={`flex items-center gap-1 font-semibold ${deltaTone}`}>
            <DeltaIcon className="h-4 w-4" />
            {Math.abs(delta).toFixed(1)} pts
          </span>
          <span className="text-text-dim">vs yesterday</span>
        </div>
        <p className="mx-auto mt-3 max-w-[260px] text-xs leading-relaxed text-text-dim">
          Mean across {mailboxCount} mailboxes. We target 72+ sustained for
          optimal inbox delivery.
        </p>
      </div>
    </div>
  );
}

function RadialProgress({ pct }: { pct: number }) {
  const size = 96;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
          stroke={TONE_HEX.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 0.95, ease: 'easeOut' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-base font-semibold tabular-nums text-text">{pct}%</span>
      </div>
    </div>
  );
}

function KpiTile({
  delay,
  icon,
  label,
  value,
  foot,
  progress,
  tone,
}: {
  delay: number;
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
  progress: number;
  tone: 'accent' | 'accent4';
}) {
  const barColor = tone === 'accent' ? 'bg-accent' : 'bg-accent4';
  const iconColor = tone === 'accent' ? 'text-accent' : 'text-accent4';
  return (
    <Tile delay={delay} className="col-span-6 lg:col-span-3">
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-text-dim">
          <span>{label}</span>
          <span className={iconColor}>{icon}</span>
        </div>
        <p className="text-2xl font-semibold leading-none tabular-nums text-text">
          {value}
        </p>
        <div className="mt-auto space-y-1.5 pt-1">
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className={`h-full rounded-full ${barColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: delay + 0.1 }}
            />
          </div>
          <p className="text-xs text-text-dim">{foot}</p>
        </div>
      </div>
    </Tile>
  );
}

function MailboxRow({ m, index }: { m: BentoMailbox; index: number }) {
  const tone = warmthTone(m.warmth);
  const color = TONE_HEX[tone];
  const sparkData = m.sparkline.map((v, i) => ({ i, v }));
  const badge = STATUS_BADGE[m.status];
  const DeltaIcon = m.delta > 0 ? ArrowUpRight : m.delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    m.delta > 0 ? 'text-accent' : m.delta < 0 ? 'text-accent3' : 'text-text-dim';

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.36 + index * 0.04 }}
      className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2/40 sm:grid-cols-[minmax(0,1.5fr)_1fr_88px_auto]"
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

      {/* warmth + bar */}
      <div className="hidden min-w-0 sm:block">
        <div className="flex items-center gap-2">
          <span
            className={`text-lg font-semibold leading-none tabular-nums ${TONE_TEXT[tone]}`}
          >
            {m.warmth}
          </span>
          <span className={`flex items-center gap-0.5 text-xs ${deltaTone}`}>
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(m.delta).toFixed(1)}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${m.warmth}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 + index * 0.04 }}
          />
        </div>
      </div>

      {/* sparkline */}
      <div className="hidden h-9 w-full sm:block">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`bento-mb-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.8}
              fill={`url(#bento-mb-${m.id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* status */}
      <div className="flex justify-end">
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
    </motion.li>
  );
}

function InsightRow({ insight, index }: { insight: BentoInsight; index: number }) {
  const style =
    insight.severity === 'good'
      ? {
          border: 'border-accent/30',
          bg: 'bg-accent/5',
          text: 'text-accent',
          Icon: ShieldCheck,
        }
      : {
          border: 'border-accent4/30',
          bg: 'bg-accent4/5',
          text: 'text-accent4',
          Icon: TrendingUp,
        };
  const Icon = style.Icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.4 + index * 0.05 }}
      className={`flex items-start gap-3 rounded-xl border p-3.5 ${style.border} ${style.bg}`}
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

export default ProDashBento;
