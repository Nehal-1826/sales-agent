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
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/format';

/**
 * ProPlusDashV2Bento — "Bento Grid" design variant for the Pro Plus tier.
 *
 * A modern asymmetric bento-box dashboard (Linear / Vercel / Raycast vibe on
 * the dark theme): a large 2x2 animated warmth hero, medium chart tiles, small
 * KPI tiles, a wide live-activity tile, and a Pro-Plus-only Postmaster / SNDS
 * deliverability-signal tile. Everything is one 12-column CSS grid with
 * col-span / row-span sizing and a staggered Framer-Motion tile entrance.
 *
 * Fully STANDALONE — no network, router or query hooks, no required props. All
 * numbers come from the inline MOCK const so the preview harness can mount it
 * prop-less. Renders only the page content (heading + bento grid); the app
 * shell supplies the sidebar / chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

interface KpiTileData {
  key: string;
  label: string;
  value: number;
  suffix: string;
  decimals: number;
  delta: number;
  deltaUnit: string;
  Icon: typeof Mail;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
  /** Falling delta is the good direction (spam / bounce style metrics). */
  invert?: boolean;
}

interface WarmthVolumeRow {
  date: string;
  warmth: number;
  volume: number;
}

interface PlacementSlice {
  name: 'Inbox' | 'Promotions' | 'Spam';
  value: number;
  hex: string;
}

interface FeedEvent {
  id: string;
  minutesAgo: number;
  mailbox: string;
  peer: string;
  action: 'sent' | 'opened' | 'replied' | 'starred' | 'spam_rescued';
}

interface SignalRow {
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
  kpis: KpiTileData[];
  warmthVolume: WarmthVolumeRow[];
  placement: PlacementSlice[];
  feed: FeedEvent[];
  signals: SignalRow[];
}

// ---------------------------------------------------------------------------
// Theme constants (mirror tailwind.config.ts tokens as hex for recharts/SVG)
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
  surface2: '#1a1a26',
  borderMuted: '#2a2a3a',
  textDim: '#8888a0',
} as const;

const WARMTH_HEX = { high: HEX.accent, mid: HEX.accent4, low: HEX.accent3 } as const;

function warmthHex(score: number): string {
  if (score >= 75) return WARMTH_HEX.high;
  if (score >= 50) return WARMTH_HEX.mid;
  return WARMTH_HEX.low;
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

/** 30-day warmth ramp 62 → 88 with daily volume 250 → 700, jittered. */
function buildWarmthVolume(): WarmthVolumeRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const warmth = 62 + t * 26 + Math.sin(i * 0.7) * 1.9;
    const volume = 250 + t * 450 + Math.sin(i * 1.2) * 36;
    return {
      date: isoMinusDays(29 - i),
      warmth: Math.round(Math.max(0, Math.min(100, warmth))),
      volume: Math.round(Math.max(0, volume)),
    };
  });
}

const MOCK: DashboardData = {
  avgWarmth: 82,
  warmthDelta: 2.6,
  mailboxCount: 15,
  warmingCount: 12,
  sentToday: 631,
  sentTarget: 840,
  kpis: [
    {
      key: 'sends',
      label: 'Sends today',
      value: 631,
      suffix: '',
      decimals: 0,
      delta: 61,
      deltaUnit: 'vs avg',
      Icon: Send,
      tone: 'accent',
    },
    {
      key: 'inbox',
      label: 'Where emails land',
      value: 93.7,
      suffix: '%',
      decimals: 1,
      delta: 2.9,
      deltaUnit: 'pts wk',
      Icon: Inbox,
      tone: 'accent2',
    },
    {
      key: 'reply',
      label: 'Reply rate',
      value: 26.4,
      suffix: '%',
      decimals: 1,
      delta: 1.7,
      deltaUnit: 'pts wk',
      Icon: Reply,
      tone: 'accent4',
    },
    {
      key: 'spam',
      label: 'Spam rate',
      value: 1.3,
      suffix: '%',
      decimals: 1,
      delta: -0.8,
      deltaUnit: 'pts wk',
      Icon: ShieldCheck,
      tone: 'accent3',
      invert: true,
    },
  ],
  warmthVolume: buildWarmthVolume(),
  placement: [
    { name: 'Inbox', value: 93.7, hex: HEX.accent },
    { name: 'Promotions', value: 5.0, hex: HEX.accent4 },
    { name: 'Spam', value: 1.3, hex: HEX.accent3 },
  ],
  feed: [
    { id: 'f1', minutesAgo: 1, mailbox: 'founder@acme.io', peer: 'maya.r@hubspot-peer.net', action: 'replied' },
    { id: 'f2', minutesAgo: 3, mailbox: 'sales@acme.io', peer: 'devon@peer-inbox.io', action: 'opened' },
    { id: 'f3', minutesAgo: 4, mailbox: 'success@acme.io', peer: 'lina.k@peernet.co', action: 'sent' },
    { id: 'f4', minutesAgo: 6, mailbox: 'hello@acme.co', peer: 'omar@peer-inbox.io', action: 'starred' },
    { id: 'f5', minutesAgo: 9, mailbox: 'support@acme.co', peer: 'jess@peernet.co', action: 'spam_rescued' },
    { id: 'f6', minutesAgo: 12, mailbox: 'partnerships@acme.io', peer: 'raj.p@peer-inbox.io', action: 'replied' },
    { id: 'f7', minutesAgo: 16, mailbox: 'growth@acme.io', peer: 'ava@peernet.co', action: 'opened' },
    { id: 'f8', minutesAgo: 19, mailbox: 'billing@acme.co', peer: 'tom.h@peer-inbox.io', action: 'sent' },
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
      value: '0.07%',
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
// Animation + format helpers
// ---------------------------------------------------------------------------

/** Staggered tile entrance — scale/fade up with a per-tile delay. */
const tile = (delay: number) => ({
  initial: { opacity: 0, y: 18, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay },
});

/** Eased count-up that runs once when the tile scrolls into view. */
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
  spam_rescued: {
    label: 'recovered from spam by',
    Icon: ShieldCheck,
    tone: 'text-accent3',
  },
};

/**
 * Gradient-border bento tile. A faint conic gradient sits behind the card and
 * shows through a 1px inset, giving the premium "lit edge" look without new
 * colour tokens (it's built from the existing accent hexes at low alpha).
 */
function BentoTile({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`group relative rounded-2xl p-px ${className ?? ''}`}
      style={{
        backgroundImage: `linear-gradient(150deg, ${HEX.accent}33, ${HEX.borderMuted}00 42%, ${HEX.accent2}26)`,
      }}
    >
      <Card
        className="h-full !rounded-[15px] !border-white/[0.05] !bg-surface/70"
        noShimmer
      >
        {children}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusDashV2Bento(): JSX.Element {
  const d = MOCK;

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Warmth bento
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

      {/* Bento grid: 12-col, asymmetric col/row spans */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-12 lg:auto-rows-[168px]">
        {/* 2x2 hero — animated warmth ring */}
        <motion.div
          {...tile(0.05)}
          className="col-span-2 lg:col-span-5 lg:row-span-2"
        >
          <BentoTile>
            <WarmthHeroTile
              value={d.avgWarmth}
              delta={d.warmthDelta}
              mailboxCount={d.mailboxCount}
              warmingCount={d.warmingCount}
              sentToday={d.sentToday}
              sentTarget={d.sentTarget}
            />
          </BentoTile>
        </motion.div>

        {/* 2x1 medium — warmth + volume combo */}
        <motion.div
          {...tile(0.1)}
          className="col-span-2 lg:col-span-7 lg:row-span-2"
        >
          <BentoTile>
            <WarmthVolumeTile rows={d.warmthVolume} />
          </BentoTile>
        </motion.div>

        {/* 4 × 1x1 KPI tiles */}
        {d.kpis.map((k, i) => (
          <motion.div
            key={k.key}
            {...tile(0.16 + i * 0.05)}
            className="col-span-1 lg:col-span-3 lg:row-span-1"
          >
            <BentoTile>
              <KpiTile kpi={k} />
            </BentoTile>
          </motion.div>
        ))}

        {/* 2x1 wide — live activity feed */}
        <motion.div
          {...tile(0.38)}
          className="col-span-2 lg:col-span-7 lg:row-span-2"
        >
          <BentoTile>
            <ActivityTile feed={d.feed} />
          </BentoTile>
        </motion.div>

        {/* 1x1-ish — placement donut */}
        <motion.div
          {...tile(0.44)}
          className="col-span-2 sm:col-span-1 lg:col-span-5 lg:row-span-2"
        >
          <BentoTile>
            <PlacementTile slices={d.placement} />
          </BentoTile>
        </motion.div>

        {/* 2x1 wide — Pro-Plus-only Postmaster / SNDS signal strip */}
        <motion.div
          {...tile(0.5)}
          className="col-span-2 lg:col-span-12 lg:row-span-2"
        >
          <BentoTile>
            <SignalTile signals={d.signals} />
          </BentoTile>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

function WarmthHeroTile({
  value,
  delta,
  mailboxCount,
  warmingCount,
  sentToday,
  sentTarget,
}: {
  value: number;
  delta: number;
  mailboxCount: number;
  warmingCount: number;
  sentToday: number;
  sentTarget: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const shown = useCountUp(value, 0, inView);
  const pct = Math.max(0, Math.min(100, value));
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    delta > 0 ? 'text-accent' : delta < 0 ? 'text-accent3' : 'text-text-dim';
  const sentPct = Math.round((sentToday / sentTarget) * 100);

  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div
      ref={ref}
      className="relative flex h-full flex-col justify-between overflow-hidden p-6"
    >
      {/* soft accent glow bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full"
        style={{ background: `radial-gradient(circle at center, ${warmthHex(value)}22 0%, transparent 72%)` }}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-dim">
          <Gauge className="h-4 w-4 text-accent" />
          Workspace warmth
        </div>
        <Badge variant="orange">
          <Sparkles className="h-3 w-3" />
          Pro Plus
        </Badge>
      </div>

      <div className="flex flex-1 items-center justify-center py-2">
        <div className="relative grid h-48 w-48 place-items-center">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={HEX.surface2}
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
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-[11px] uppercase tracking-wider text-text-dim">
              Avg warmth
            </span>
            <span className="text-5xl font-semibold tabular-nums leading-tight text-text">
              {Math.round(shown)}
            </span>
            <span
              className={`flex items-center gap-0.5 text-xs font-medium ${deltaTone}`}
            >
              <DeltaIcon className="h-3 w-3" />
              {delta > 0 ? '+' : ''}
              {delta} · 7d
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-surface-2/40 px-3 py-2.5">
          <p className="text-xs text-text-dim">Mailboxes warming</p>
          <p className="text-lg font-semibold tabular-nums text-text">
            {warmingCount}
            <span className="text-sm text-text-dim">/{mailboxCount}</span>
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-surface-2/40 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-dim">Daily target</p>
            <p className="text-xs tabular-nums text-text-dim">{sentPct}%</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              animate={inView ? { width: `${Math.min(100, sentPct)}%` } : {}}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ kpi }: { kpi: KpiTileData }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const shown = useCountUp(kpi.value, kpi.decimals, inView);
  const good = kpi.invert ? kpi.delta < 0 : kpi.delta > 0;
  const flat = kpi.delta === 0;
  const DeltaIcon = flat ? Minus : kpi.delta > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaTone = flat
    ? 'text-text-dim'
    : good
      ? 'text-accent'
      : 'text-accent3';
  const toneText = `text-${kpi.tone}`;

  return (
    <div ref={ref} className="flex h-full flex-col justify-between p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-dim">
        <span className="truncate">{kpi.label}</span>
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg bg-surface-2/60 ${toneText}`}
        >
          <kpi.Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="flex items-end gap-2">
        <p className="text-3xl font-semibold tabular-nums leading-none text-text">
          {shown.toFixed(kpi.decimals)}
          {kpi.suffix}
        </p>
      </div>
      <span
        className={`flex items-center gap-0.5 text-xs font-medium ${deltaTone}`}
      >
        <DeltaIcon className="h-3 w-3" />
        {Math.abs(kpi.delta)} {kpi.deltaUnit}
      </span>
    </div>
  );
}

function WarmthVolumeTile({ rows }: { rows: WarmthVolumeRow[] }) {
  return (
    <div className="flex h-full flex-col p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
      <div className="h-[260px] w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={rows}
            margin={{ top: 8, right: 6, bottom: 4, left: -10 }}
          >
            <defs>
              <linearGradient id="ppb-vol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.45} />
                <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="ppb-warmth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.28} />
                <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke={HEX.borderMuted}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fill: HEX.textDim, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: HEX.borderMuted }}
              minTickGap={28}
            />
            <YAxis
              yAxisId="left"
              domain={[0, 100]}
              tick={{ fill: HEX.textDim, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: HEX.textDim, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: '#12121a',
                border: `1px solid ${HEX.borderMuted}`,
                borderRadius: 10,
                fontSize: 12,
              }}
              labelStyle={{ color: HEX.textDim }}
              labelFormatter={(l) => fmtDate(String(l))}
              formatter={(val, name) =>
                name === 'Avg warmth'
                  ? [String(val), 'Avg warmth']
                  : [`${String(val)} sent`, 'Daily sends']
              }
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="volume"
              name="Daily sends"
              stroke={HEX.accent2}
              strokeWidth={1.5}
              fill="url(#ppb-vol)"
              animationDuration={1000}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="warmth"
              name="Avg warmth"
              stroke={HEX.accent}
              strokeWidth={2.4}
              fill="url(#ppb-warmth)"
              activeDot={{ r: 4 }}
              animationDuration={1300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PlacementTile({ slices }: { slices: PlacementSlice[] }) {
  const total = useMemo(
    () => slices.reduce((a, s) => a + s.value, 0),
    [slices],
  );
  const inbox = slices.find((s) => s.name === 'Inbox')?.value ?? 0;

  return (
    <div className="flex h-full flex-col p-5">
      <header className="mb-2 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold text-text">Where emails land</h2>
      </header>
      <p className="mb-1 text-sm text-text-dim">
        Where warmup mail is landing right now.
      </p>
      <div className="flex flex-1 items-center gap-4">
        <div className="relative h-[180px] w-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={82}
                paddingAngle={3}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                animationDuration={1100}
              >
                {slices.map((s) => (
                  <Cell key={s.name} fill={s.hex} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#12121a',
                  border: `1px solid ${HEX.borderMuted}`,
                  borderRadius: 10,
                  fontSize: 12,
                }}
                formatter={(val, name) => [
                  `${Number(val).toFixed(1)}%`,
                  String(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-text">
              {inbox.toFixed(1)}%
            </span>
            <span className="text-[11px] uppercase tracking-wider text-text-dim">
              inbox
            </span>
          </div>
        </div>
        <ul className="flex-1 space-y-2.5">
          {slices.map((s, i) => (
            <motion.li
              key={s.name}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.5 + i * 0.07 }}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2 text-sm text-text">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: s.hex }}
                  aria-hidden
                />
                {s.name}
              </span>
              <span className="text-sm font-semibold tabular-nums text-text">
                {((s.value / total) * 100).toFixed(1)}%
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ActivityTile({ feed }: { feed: FeedEvent[] }) {
  // Tiny rolling sparkline of activity intensity (events per recent bucket).
  const spark = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        i,
        v: 4 + Math.round(Math.sin(i * 0.8) * 2 + (i % 5)),
      })),
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
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
      <div className="h-12 w-full px-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spark} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={HEX.accent}
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 divide-y divide-white/5 overflow-hidden">
        {feed.map((e, i) => {
          const meta = ACTION_META[e.action];
          return (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.42 + i * 0.05 }}
              className="flex items-center gap-3 px-5 py-2.5"
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2/60 ${meta.tone}`}
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
    </div>
  );
}

function SignalTile({ signals }: { signals: SignalRow[] }) {
  const STATUS_TINT: Record<SignalRow['status'], string> = {
    good: 'text-accent',
    watch: 'text-accent4',
    bad: 'text-accent3',
  };
  const STATUS_DOT: Record<SignalRow['status'], string> = {
    good: 'bg-accent',
    watch: 'bg-accent4',
    bad: 'bg-accent3',
  };
  const SOURCE_ICON: Record<SignalRow['source'], typeof Mail> = {
    Postmaster: ShieldCheck,
    SNDS: Radar,
    Placement: Inbox,
  };

  return (
    <div className="flex h-full flex-col p-5">
      <header className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent3" />
        <h2 className="text-base font-semibold text-text">
          Pro Plus inbox-delivery signals
        </h2>
        <Badge variant="orange">Pro Plus only</Badge>
      </header>
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {signals.map((s, i) => {
          const SrcIcon = SOURCE_ICON[s.source];
          return (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.54 + i * 0.06 }}
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
    </div>
  );
}

export default ProPlusDashV2Bento;
