import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Gauge,
  Globe,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * ProPlusReputation — "Reputation Center" (Pro Plus tier).
 *
 * Fully standalone for the isolated preview harness: NO network / router /
 * query hooks, NO required props, inline MOCK. Renders ONLY page content —
 * the harness supplies the shell + sidebar.
 *
 * Layout (top → bottom):
 *   1. Header band — title + Pro Plus badge + "all sources flowing" chip
 *   2. KPI band — 4 deliverability headline tiles
 *   3. Pro Plus unlocks (the differentiators, featured first):
 *        · Google Postmaster ingest — 30d domain-reputation timeline,
 *          IP reputation, spam rate, auth pass rate (animated trend)
 *        · Microsoft SNDS ingest — IP status, complaint rate, trap hits,
 *          message volume (animated trend)
 *   4. Cross-mailbox health radar + composite gauge
 *   5. DNS health panel (SPF / DKIM / DMARC across every mailbox)
 *   6. Blacklist monitor (all-clear with one warn)
 *
 * Colour: existing Tailwind tokens only. Charts source the same RGB values
 * the chart theme uses (accent / accent2 / accent3 / accent4) so Recharts
 * stays on-palette without importing chart internals.
 */

// ---------------------------------------------------------------------------
// Palette — mirrors components/charts/theme.ts (token RGBs, no new colours).
// ---------------------------------------------------------------------------

const C = {
  accent: 'rgb(242, 101, 34)', // text-accent  — healthy / inbox
  accent2: 'rgb(255, 138, 75)', // text-accent2 — info
  accent3: 'rgb(255, 107, 74)', // text-accent3 — danger / warning
  accent4: 'rgb(255, 213, 79)', // text-accent4 — mid / watch
  muted: 'rgb(136, 136, 160)',
  grid: 'rgb(42, 42, 58)',
} as const;

type Tone = 'success' | 'warning' | 'danger';

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-accent',
  warning: 'text-accent4',
  danger: 'text-accent3',
};

const TONE_DOT: Record<Tone, string> = {
  success: 'bg-accent',
  warning: 'bg-accent4',
  danger: 'bg-accent3',
};

const TONE_COLOR: Record<Tone, string> = {
  success: C.accent,
  warning: C.accent4,
  danger: C.accent3,
};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function isoMinusDays(days: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - days);
  return d.toISOString().slice(0, 10);
}

interface PostmasterPoint extends Record<string, unknown> {
  date: string;
  /** 0–100 — High=92, Medium=70, Low=40, Bad=15 mapped for the chart. */
  reputation: number;
  spamRate: number; // percent
  authPass: number; // percent
}

/** 30-day Postmaster: domain reputation climbs Medium → High, spam decays. */
function buildPostmaster(): PostmasterPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const reputation = 62 + t * 32 + Math.sin(i * 0.7) * 2.4;
    const spamRate = Math.max(0.02, 0.34 - t * 0.31 + Math.sin(i * 1.1) * 0.02);
    const authPass = Math.min(100, 96.2 + t * 3.4 + Math.sin(i * 0.9) * 0.4);
    return {
      date: isoMinusDays(29 - i),
      reputation: Math.round(Math.max(0, Math.min(100, reputation)) * 10) / 10,
      spamRate: Math.round(spamRate * 1000) / 1000,
      authPass: Math.round(authPass * 10) / 10,
    };
  });
}

interface SndsRow extends Record<string, unknown> {
  date: string;
  volume: number;
  complaintRate: number; // percent
  trapHits: number;
}

/** 30-day SNDS: green IP, complaint rate hugs the floor, volume ramps. */
function buildSnds(): SndsRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const volume = Math.round(820 + t * 1480 + Math.sin(i * 1.2) * 90);
    const complaintRate =
      Math.max(0.001, 0.018 - t * 0.015 + Math.sin(i * 0.8) * 0.002);
    const trapHits = i > 22 && i < 25 ? 1 : 0;
    return {
      date: isoMinusDays(29 - i),
      volume,
      complaintRate: Math.round(complaintRate * 1000) / 1000,
      trapHits,
    };
  });
}

interface DnsRow {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}

interface RadarRow extends Record<string, unknown> {
  axis: string;
  founder: number;
  sales: number;
  success: number;
}

interface BlacklistRow {
  zone: string;
  scope: string;
  status: Tone;
  note: string;
}

interface Kpi {
  key: string;
  label: string;
  value: string;
  delta: number;
  deltaSuffix: string;
  tone: Tone;
  Icon: typeof Mail;
  progress: number;
  invert?: boolean;
}

interface ProPlusReputationData {
  kpis: Kpi[];
  postmaster: PostmasterPoint[];
  snds: SndsRow[];
  dns: DnsRow[];
  radar: RadarRow[];
  blacklist: BlacklistRow[];
  composite: number;
}

const MOCK: ProPlusReputationData = {
  kpis: [
    {
      key: 'rep',
      label: 'Domain trust',
      value: 'High',
      delta: 2,
      deltaSuffix: 'tier · 30d',
      tone: 'success',
      Icon: ShieldCheck,
      progress: 94,
    },
    {
      key: 'spam',
      label: 'Postmaster spam rate',
      value: '0.03%',
      delta: -0.31,
      deltaSuffix: 'pts · 30d',
      tone: 'success',
      Icon: ShieldAlert,
      progress: 8,
      invert: true,
    },
    {
      key: 'complaint',
      label: 'SNDS complaint rate',
      value: '0.003%',
      delta: -0.015,
      deltaSuffix: 'pts · 30d',
      tone: 'success',
      Icon: TrendingDown,
      progress: 6,
      invert: true,
    },
    {
      key: 'auth',
      label: 'Auth pass rate',
      value: '99.6%',
      delta: 3.4,
      deltaSuffix: 'pts · 30d',
      tone: 'success',
      Icon: ShieldCheck,
      progress: 99,
    },
  ],
  postmaster: buildPostmaster(),
  snds: buildSnds(),
  dns: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      provider: 'gmail',
      spf: true,
      dkim: true,
      dmarc: true,
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'outlook',
      spf: true,
      dkim: true,
      dmarc: true,
    },
    {
      id: 'mb-3',
      email: 'success@acme.io',
      provider: 'gmail',
      spf: true,
      dkim: true,
      dmarc: false,
    },
    {
      id: 'mb-4',
      email: 'hello@acme.co',
      provider: 'smtp',
      spf: true,
      dkim: true,
      dmarc: true,
    },
  ],
  radar: [
    { axis: 'Warmth', founder: 88, sales: 82, success: 79 },
    { axis: 'SPF', founder: 100, sales: 100, success: 100 },
    { axis: 'DKIM', founder: 100, sales: 100, success: 100 },
    { axis: 'DMARC', founder: 100, sales: 100, success: 55 },
    { axis: 'Auth', founder: 100, sales: 100, success: 100 },
    { axis: 'Trust', founder: 94, sales: 90, success: 86 },
  ],
  blacklist: [
    { zone: 'Spamhaus ZEN', scope: 'acme.io · 3 IPs', status: 'success', note: 'Not listed' },
    { zone: 'Barracuda BRBL', scope: 'acme.io · 3 IPs', status: 'success', note: 'Not listed' },
    { zone: 'SpamCop SCBL', scope: 'acme.io · 3 IPs', status: 'success', note: 'Not listed' },
    {
      zone: 'SORBS DUHL',
      scope: 'acme.co · 1 IP',
      status: 'warning',
      note: 'Dynamic-range flag — delist requested',
    },
    { zone: 'Spamhaus DBL', scope: 'acme.co domain', status: 'success', note: 'Not listed' },
    { zone: 'Microsoft SNDS', scope: 'all sending IPs', status: 'success', note: 'Green tier' },
  ],
  composite: 91,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(v: unknown): string {
  if (typeof v !== 'string') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return formatDate(d);
}

function repTier(score: number): { label: string; tone: Tone } {
  if (score >= 85) return { label: 'High', tone: 'success' };
  if (score >= 60) return { label: 'Medium', tone: 'warning' };
  if (score >= 35) return { label: 'Low', tone: 'warning' };
  return { label: 'Bad', tone: 'danger' };
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

const PROVIDER_LETTER: Record<DnsRow['provider'], string> = {
  gmail: 'G',
  outlook: 'O',
  yahoo: 'Y',
  smtp: 'S',
};

const PROVIDER_TONE: Record<DnsRow['provider'], Tone> = {
  gmail: 'success',
  outlook: 'success',
  yahoo: 'warning',
  smtp: 'warning',
};

// Shared tooltip styling so every Recharts surface matches the dark theme.
const TOOLTIP_STYLE = {
  background: 'rgb(26, 26, 38)',
  border: `1px solid ${C.grid}`,
  borderRadius: 10,
  fontSize: 12,
  color: 'rgb(232, 232, 240)',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusReputation(): JSX.Element {
  const d = MOCK;
  const [radarFocus, setRadarFocus] = useState<'founder' | 'sales' | 'success' | null>(
    null,
  );

  const latestRep = d.postmaster[d.postmaster.length - 1]?.reputation ?? 0;
  const tier = repTier(latestRep);

  const dnsTotals = useMemo(() => {
    const total = d.dns.length;
    const count = (k: 'spf' | 'dkim' | 'dmarc') => d.dns.filter((r) => r[k]).length;
    return {
      total,
      spf: count('spf'),
      dkim: count('dkim'),
      dmarc: count('dmarc'),
    };
  }, [d.dns]);

  const blacklistClear = d.blacklist.filter((b) => b.status === 'success').length;
  const blacklistWarn = d.blacklist.filter((b) => b.status !== 'success').length;

  const latestSnds = d.snds[d.snds.length - 1];

  return (
    <div className="space-y-5">
      {/* Header band */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Sender Trust Center
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Real inbox-delivery signals from Gmail &amp; Outlook, domain records (DNS) health and
            block-list monitoring across {dnsTotals.total} mailboxes.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3.5 py-1.5 text-xs text-text-dim">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">Postmaster + SNDS</span>
          <span className="text-border-muted">·</span>
          <span>all sources flowing</span>
        </div>
      </motion.header>

      {/* KPI band */}
      <motion.div
        {...fade(0.05)}
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {d.kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} />
        ))}
      </motion.div>

      {/* Pro Plus unlocks — the differentiators, featured first */}
      <motion.div {...fade(0.1)} className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent3" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim">
            Pro Plus external signals
          </h2>
          <span className="rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent3">
            Unlocked
          </span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Google Postmaster ingest */}
        <motion.div {...fade(0.14)}>
          <Card className="h-full" noShimmer>
            <CardContent className="space-y-4 p-5">
              <header className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-text">
                      Google Postmaster
                    </h3>
                    <p className="text-xs text-text-dim">acme.io · domain trust</p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-text-dim">
                  <RefreshCw className="h-3 w-3 text-accent" />
                  synced 8m ago
                </span>
              </header>

              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Domain trust"
                  value={tier.label}
                  tone={tier.tone}
                  badge
                />
                <Stat
                  label="IP trust"
                  value="High"
                  tone="success"
                  badge
                />
                <Stat label="Spam rate" value="0.03%" tone="success" />
                <Stat label="Auth pass" value="99.6%" tone="success" />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-text-dim">
                  <span>30-day domain trust</span>
                  <span className="flex items-center gap-1 text-accent">
                    <TrendingUp className="h-3 w-3" />
                    Medium → High
                  </span>
                </div>
                <div className="h-[150px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={d.postmaster}
                      margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="ppr-pm-rep" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.accent} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke={C.grid}
                        strokeDasharray="3 6"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: C.muted, fontSize: 11 }}
                        tickFormatter={fmtDate}
                        axisLine={{ stroke: C.grid }}
                        tickLine={false}
                        minTickGap={28}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: C.muted, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(v) => fmtDate(v)}
                        formatter={(v: number) => [`${v}/100`, 'Trust score']}
                      />
                      <Area
                        type="monotone"
                        dataKey="reputation"
                        stroke={C.accent}
                        strokeWidth={2}
                        fill="url(#ppr-pm-rep)"
                        isAnimationActive
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs text-text-dim">
                  30-day spam rate (Gmail-reported)
                </div>
                <div className="h-[96px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={d.postmaster}
                      margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="ppr-pm-spam" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.accent4} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={C.accent4} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={[0, 0.4]} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(v) => fmtDate(v)}
                        formatter={(v: number) => [`${v}%`, 'Spam rate']}
                      />
                      <Area
                        type="monotone"
                        dataKey="spamRate"
                        stroke={C.accent4}
                        strokeWidth={2}
                        fill="url(#ppr-pm-spam)"
                        isAnimationActive
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Microsoft SNDS ingest */}
        <motion.div {...fade(0.18)}>
          <Card className="h-full" noShimmer>
            <CardContent className="space-y-4 p-5">
              <header className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent2/10 text-accent2">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-text">
                      Microsoft SNDS
                    </h3>
                    <p className="text-xs text-text-dim">
                      Outlook / Hotmail · per-IP filter data
                    </p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-text-dim">
                  <RefreshCw className="h-3 w-3 text-accent" />
                  synced 14m ago
                </span>
              </header>

              <div className="grid grid-cols-2 gap-3">
                <Stat label="IP status" value="Green" tone="success" badge />
                <Stat
                  label="Complaint rate"
                  value="0.003%"
                  tone="success"
                />
                <Stat
                  label="Trap hits (30d)"
                  value={String(d.snds.reduce((a, r) => a + r.trapHits, 0))}
                  tone="warning"
                />
                <Stat
                  label="Volume / day"
                  value={formatNumber(latestSnds?.volume ?? 0)}
                  tone="success"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-text-dim">
                  <span>30-day message volume</span>
                  <span className="flex items-center gap-1 text-accent">
                    <ArrowUpRight className="h-3 w-3" />
                    building up
                  </span>
                </div>
                <div className="h-[150px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={d.snds}
                      margin={{ top: 6, right: 6, left: -10, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="ppr-snds-vol" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.accent2} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={C.accent2} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke={C.grid}
                        strokeDasharray="3 6"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: C.muted, fontSize: 11 }}
                        tickFormatter={fmtDate}
                        axisLine={{ stroke: C.grid }}
                        tickLine={false}
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{ fill: C.muted, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(v) => fmtDate(v)}
                        formatter={(v: number) => [formatNumber(v), 'Messages']}
                      />
                      <Area
                        type="monotone"
                        dataKey="volume"
                        stroke={C.accent2}
                        strokeWidth={2}
                        fill="url(#ppr-snds-vol)"
                        isAnimationActive
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs text-text-dim">
                  30-day complaint rate (Microsoft-reported)
                </div>
                <div className="h-[96px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={d.snds}
                      margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="ppr-snds-cmp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.accent} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={[0, 0.02]} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(v) => fmtDate(v)}
                        formatter={(v: number) => [`${v}%`, 'Complaint rate']}
                      />
                      <Area
                        type="monotone"
                        dataKey="complaintRate"
                        stroke={C.accent}
                        strokeWidth={2}
                        fill="url(#ppr-snds-cmp)"
                        isAnimationActive
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Cross-mailbox health radar + composite gauge */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.22)} className="lg:col-span-8">
          <Card className="h-full" noShimmer>
            <CardContent className="space-y-3 p-5">
              <header className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-text">
                    Cross-mailbox health radar
                  </h3>
                </div>
                <span className="text-xs text-text-dim">
                  6 signals · 3 mailboxes
                </span>
              </header>
              <div className="h-[290px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={d.radar} outerRadius="72%">
                    <PolarGrid stroke={C.grid} />
                    <PolarAngleAxis
                      dataKey="axis"
                      tick={{ fill: C.muted, fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: C.muted, fontSize: 10 }}
                      axisLine={false}
                      stroke={C.grid}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Radar
                      name="founder@acme.io"
                      dataKey="founder"
                      stroke={C.accent}
                      fill={C.accent}
                      fillOpacity={radarFocus && radarFocus !== 'founder' ? 0.04 : 0.22}
                      strokeWidth={2}
                      isAnimationActive
                    />
                    <Radar
                      name="sales@acme.io"
                      dataKey="sales"
                      stroke={C.accent2}
                      fill={C.accent2}
                      fillOpacity={radarFocus && radarFocus !== 'sales' ? 0.04 : 0.2}
                      strokeWidth={2}
                      isAnimationActive
                    />
                    <Radar
                      name="success@acme.io"
                      dataKey="success"
                      stroke={C.accent4}
                      fill={C.accent4}
                      fillOpacity={radarFocus && radarFocus !== 'success' ? 0.04 : 0.18}
                      strokeWidth={2}
                      isAnimationActive
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { k: 'founder', label: 'founder@acme.io', c: C.accent },
                    { k: 'sales', label: 'sales@acme.io', c: C.accent2 },
                    { k: 'success', label: 'success@acme.io', c: C.accent4 },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.k}
                    type="button"
                    onMouseEnter={() => setRadarFocus(m.k)}
                    onMouseLeave={() => setRadarFocus(null)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      radarFocus === m.k
                        ? 'border-border-muted bg-surface-2 text-text'
                        : 'border-border-muted text-text-dim hover:text-text'
                    }`}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: m.c }}
                    />
                    {m.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fade(0.26)} className="lg:col-span-4">
          <Card className="h-full" noShimmer>
            <CardContent className="flex h-full flex-col items-center justify-center gap-2 p-5">
              <div className="flex items-center gap-2 self-start">
                <Gauge className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-text">
                  Composite health
                </h3>
              </div>
              <CompositeGauge value={d.composite} />
              <p className="text-center text-xs text-text-dim">
                Weighted blend of warmth, domain records (DNS), auth and external sender trust
                across every connected mailbox.
              </p>
              <div className="mt-1 flex w-full items-center justify-between rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-xs">
                <span className="text-text-dim">Trend (7d)</span>
                <span className="flex items-center gap-1 font-semibold text-accent">
                  <TrendingUp className="h-3 w-3" />
                  +4 pts
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* DNS health panel + blacklist monitor */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.3)} className="lg:col-span-7">
          <Card className="h-full" noShimmer>
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-text">
                    Domain records (DNS) authentication
                  </h3>
                </div>
                <span className="text-xs text-text-dim">
                  {dnsTotals.spf}/{dnsTotals.total} SPF ·{' '}
                  {dnsTotals.dkim}/{dnsTotals.total} DKIM ·{' '}
                  {dnsTotals.dmarc}/{dnsTotals.total} DMARC
                </span>
              </header>
              <ul className="divide-y divide-border-muted">
                {d.dns.map((row, i) => (
                  <motion.li
                    key={row.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.32 + i * 0.04 }}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-bg ${TONE_DOT[PROVIDER_TONE[row.provider]]}`}
                      aria-hidden
                    >
                      {PROVIDER_LETTER[row.provider]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                      {row.email}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <DnsPill label="SPF" ok={row.spf} />
                      <DnsPill label="DKIM" ok={row.dkim} />
                      <DnsPill label="DMARC" ok={row.dmarc} />
                    </div>
                  </motion.li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fade(0.34)} className="lg:col-span-5">
          <Card className="h-full" noShimmer>
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-text">
                    Block-list monitor
                  </h3>
                </div>
                <span className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-accent">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                    {blacklistClear} clear
                  </span>
                  <span className="flex items-center gap-1 text-accent4">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent4" />
                    {blacklistWarn} watch
                  </span>
                </span>
              </header>
              <ul className="divide-y divide-border-muted">
                {d.blacklist.map((b, i) => (
                  <motion.li
                    key={b.zone}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.36 + i * 0.04 }}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    {b.status === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 shrink-0 text-accent4" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {b.zone}
                      </p>
                      <p className="truncate text-xs text-text-dim">{b.scope}</p>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-semibold ${TONE_TEXT[b.status]}`}
                    >
                      {b.note}
                    </span>
                  </motion.li>
                ))}
              </ul>
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

function KpiTile({ kpi }: { kpi: Kpi }) {
  const good = kpi.invert ? kpi.delta < 0 : kpi.delta > 0;
  const DeltaIcon = kpi.delta >= 0 ? TrendingUp : TrendingDown;
  const deltaTone = good ? 'text-accent' : 'text-accent3';

  return (
    <Card className="h-full" noShimmer>
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-dim">
          <span className="truncate">{kpi.label}</span>
          <span className={TONE_TEXT[kpi.tone]}>
            <kpi.Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="flex items-end gap-2">
          <p className="text-2xl font-semibold tabular-nums leading-none text-text">
            {kpi.value}
          </p>
          <span
            className={`mb-0.5 flex items-center gap-0.5 text-xs font-medium ${deltaTone}`}
          >
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(kpi.delta)} {kpi.deltaSuffix}
          </span>
        </div>
        <div className="mt-auto h-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className={`h-full rounded-full ${TONE_DOT[kpi.tone]}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, kpi.progress))}%` }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  badge,
}: {
  label: string;
  value: string;
  tone: Tone;
  badge?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] text-text-dim">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        {badge ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_TEXT[tone]}`}
            style={{ background: `${TONE_COLOR[tone]}1f` }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: TONE_COLOR[tone] }}
            />
            {value}
          </span>
        ) : (
          <span className={`text-base font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

function DnsPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
        ok
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-accent3/30 bg-accent3/10 text-accent3'
      }`}
      title={`${label}: ${ok ? 'valid' : 'missing'}`}
    >
      {ok ? (
        <CheckCircle2 className="h-2.5 w-2.5" />
      ) : (
        <ShieldAlert className="h-2.5 w-2.5" />
      )}
      {label}
    </span>
  );
}

function CompositeGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const data = [{ name: 'v', value: clamped, fill: C.accent }];
  return (
    <div className="relative h-[180px] w-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="72%"
          outerRadius="100%"
          barSize={14}
          data={data}
          startAngle={210}
          endAngle={-30}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            background={{ fill: C.grid }}
            dataKey="value"
            cornerRadius={8}
            isAnimationActive
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular-nums text-text">
          {clamped}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-accent">
          excellent
        </span>
      </div>
    </div>
  );
}

export default ProPlusReputation;
