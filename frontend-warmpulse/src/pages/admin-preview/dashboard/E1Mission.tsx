/**
 * Admin Dashboard Design Candidate: E1 Mission Control
 *
 * "Mission Control" — a live operations cockpit that feels alive.
 * Top status bar (system state + Live/24h/7d toggle + live clock), a hero zone
 * with an animated sends-pulse area chart + three radial gauges, a KPI cluster,
 * plan-distribution + subsystem-status panels, and a right-hand live event
 * stream that ticks. NASA flight-ops energy, on warm WarmPulse brand.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only. Warm/neutral palette only.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Clock,
  CreditCard,
  Database,
  Gauge,
  Inbox,
  Mail,
  Radio,
  Reply,
  Server,
  Sparkles,
  Star,
  TrendingDown,
  Users,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Palette — warm + neutral only. NO blue/purple/violet/teal/cyan/indigo/pink.
// ---------------------------------------------------------------------------

const C = {
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.42)',
  ghost: 'rgba(255,255,255,0.28)',
  accent: '#F26522',
  accent2: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  glass: 'rgba(255,255,255,0.05)',
  glass2: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.07)',
} as const;

const GLASS: React.CSSProperties = {
  background: C.glass,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: 16,
};

const MONO =
  '"SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RangeId = 'live' | '24h' | '7d';

interface PulsePoint {
  t: string;
  sends: number;
}

interface Kpi {
  id: string;
  label: string;
  value: string;
  unit?: string;
  delta: string;
  positive: boolean;
  icon: typeof Users;
  spark: number[];
}

type SubStatus = 'ok' | 'warn' | 'down';

interface Subsystem {
  id: string;
  name: string;
  status: SubStatus;
  metric: string;
  icon: typeof Server;
}

interface PlanRow {
  name: string;
  workspaces: number;
  color: string;
}

type EventKind = 'sent' | 'reply' | 'open' | 'star' | 'rescue' | 'signup' | 'alert';

interface FeedEvent {
  id: number;
  kind: EventKind;
  text: string;
  meta: string;
  ageSec: number;
}

// ---------------------------------------------------------------------------
// Mock data — per range. Switching range swaps the entire pulse series.
// ---------------------------------------------------------------------------

/** 24 ticks of "now-ish" 1-min cadence used as the seed for the LIVE feed. */
const PULSE_LIVE: PulsePoint[] = [
  { t: '-23m', sends: 41 }, { t: '-22m', sends: 46 }, { t: '-21m', sends: 44 },
  { t: '-20m', sends: 52 }, { t: '-19m', sends: 49 }, { t: '-18m', sends: 58 },
  { t: '-17m', sends: 55 }, { t: '-16m', sends: 61 }, { t: '-15m', sends: 57 },
  { t: '-14m', sends: 64 }, { t: '-13m', sends: 60 }, { t: '-12m', sends: 69 },
  { t: '-11m', sends: 66 }, { t: '-10m', sends: 72 }, { t: '-9m', sends: 68 },
  { t: '-8m', sends: 75 }, { t: '-7m', sends: 71 }, { t: '-6m', sends: 80 },
  { t: '-5m', sends: 77 }, { t: '-4m', sends: 84 }, { t: '-3m', sends: 79 },
  { t: '-2m', sends: 88 }, { t: '-1m', sends: 83 }, { t: 'now', sends: 91 },
];

const PULSE_24H: PulsePoint[] = [
  { t: '00', sends: 1820 }, { t: '02', sends: 1240 }, { t: '04', sends: 980 },
  { t: '06', sends: 1560 }, { t: '08', sends: 3120 }, { t: '10', sends: 4480 },
  { t: '12', sends: 5210 }, { t: '14', sends: 4990 }, { t: '16', sends: 5380 },
  { t: '18', sends: 4120 }, { t: '20', sends: 3010 }, { t: '22', sends: 2240 },
];

const PULSE_7D: PulsePoint[] = [
  { t: 'Sun', sends: 58210 }, { t: 'Mon', sends: 67120 }, { t: 'Tue', sends: 70100 },
  { t: 'Wed', sends: 66430 }, { t: 'Thu', sends: 69880 }, { t: 'Fri', sends: 70950 },
  { t: 'Sat', sends: 71540 },
];

const PULSE_BY_RANGE: Record<RangeId, PulsePoint[]> = {
  live: PULSE_LIVE,
  '24h': PULSE_24H,
  '7d': PULSE_7D,
};

const RANGE_META: Record<RangeId, { total: string; sub: string }> = {
  live: { total: '91', sub: 'sends in the last minute' },
  '24h': { total: '71,540', sub: 'sends in the last 24 hours' },
  '7d': { total: '474,231', sub: 'sends across the last 7 days' },
};

const KPIS: Kpi[] = [
  {
    id: 'users',
    label: 'TOTAL USERS',
    value: '1,284',
    delta: '+6.2%',
    positive: true,
    icon: Users,
    spark: [48, 52, 50, 58, 63, 70, 72, 79, 84, 90, 96],
  },
  {
    id: 'mrr',
    label: 'MRR',
    value: '$48,250',
    delta: '+4.1%',
    positive: true,
    icon: CreditCard,
    spark: [32, 34, 36, 35, 39, 42, 44, 46, 48, 49, 51],
  },
  {
    id: 'mailboxes',
    label: 'ACTIVE MAILBOXES',
    value: '3,910',
    delta: '+2.8%',
    positive: true,
    icon: Inbox,
    spark: [58, 60, 64, 66, 70, 73, 75, 78, 80, 85, 88],
  },
  {
    id: 'sends',
    label: 'SENDS TODAY',
    value: '71,540',
    delta: '+9.0%',
    positive: true,
    icon: Mail,
    spark: [40, 45, 50, 55, 52, 60, 65, 70, 74, 80, 88],
  },
  {
    id: 'churn',
    label: 'CHURN (30d)',
    value: '1.9',
    unit: '%',
    delta: '-0.4pp',
    positive: true,
    icon: TrendingDown,
    spark: [33, 31, 30, 29, 28, 27, 26, 25, 24, 22, 19],
  },
];

const SUBSYSTEMS: Subsystem[] = [
  { id: 'api', name: 'API', status: 'ok', metric: '38ms p95', icon: Zap },
  { id: 'worker', name: 'Worker', status: 'ok', metric: '4 active', icon: Activity },
  { id: 'beat', name: 'Beat', status: 'ok', metric: '41s ago', icon: Clock },
  { id: 'db', name: 'Postgres', status: 'ok', metric: '12 conns', icon: Database },
  { id: 'smtp', name: 'SMTP / IMAP', status: 'warn', metric: '2 peers degraded', icon: Mail },
];

const PLANS: PlanRow[] = [
  { name: 'Starter', workspaces: 540, color: C.accent2 },
  { name: 'Pro', workspaces: 410, color: C.accent },
  { name: 'Pro Plus', workspaces: 220, color: C.success },
  { name: 'Agency', workspaces: 114, color: 'rgba(255,255,255,0.55)' },
];

/** Seed events for the live stream. Newer events get spliced in over time. */
const SEED_EVENTS: FeedEvent[] = [
  { id: 1, kind: 'reply', text: 'Peer replied to mailbox', meta: 'sales@northwind.io', ageSec: 6 },
  { id: 2, kind: 'sent', text: 'Warmup sent', meta: 'jordan@acme.dev → pool', ageSec: 14 },
  { id: 3, kind: 'open', text: 'Inbox open registered', meta: 'growth@lumen.app', ageSec: 23 },
  { id: 4, kind: 'rescue', text: 'Spam-rescue performed', meta: 'maya@brightlabs.co', ageSec: 38 },
  { id: 5, kind: 'star', text: 'Message starred', meta: 'ops@finchpay.com', ageSec: 52 },
  { id: 6, kind: 'signup', text: 'New workspace · Pro', meta: 'team@vectorhq.io', ageSec: 74 },
  { id: 7, kind: 'alert', text: 'Peer below reputation floor', meta: 'pool · default', ageSec: 96 },
  { id: 8, kind: 'sent', text: 'Warmup sent', meta: 'dev@castle.sh → pool', ageSec: 118 },
];

// ---------------------------------------------------------------------------
// Status color maps
// ---------------------------------------------------------------------------

const statusColor: Record<SubStatus, string> = {
  ok: C.success,
  warn: C.warning,
  down: C.danger,
};

const statusLabel: Record<SubStatus, string> = {
  ok: 'Operational',
  warn: 'Degraded',
  down: 'Down',
};

const EVENT_STYLE: Record<EventKind, { color: string; icon: typeof Mail }> = {
  sent: { color: C.accent2, icon: Mail },
  reply: { color: C.success, icon: Reply },
  open: { color: C.dim as string, icon: Inbox },
  star: { color: C.warning, icon: Star },
  rescue: { color: C.accent, icon: Sparkles },
  signup: { color: C.success, icon: Users },
  alert: { color: C.danger, icon: AlertTriangle },
};

// New events the ticker rotates through (cycled with fresh ids/ages).
const ROTATION: Array<Pick<FeedEvent, 'kind' | 'text' | 'meta'>> = [
  { kind: 'sent', text: 'Warmup sent', meta: 'amir@northwind.io → pool' },
  { kind: 'reply', text: 'Peer replied to mailbox', meta: 'hello@dasha.co' },
  { kind: 'open', text: 'Inbox open registered', meta: 'sara@quill.io' },
  { kind: 'star', text: 'Message starred', meta: 'founders@nimbus.app' },
  { kind: 'rescue', text: 'Spam-rescue performed', meta: 'ops@harbor.dev' },
  { kind: 'sent', text: 'Warmup sent', meta: 'mike@parcel.io → pool' },
  { kind: 'signup', text: 'New workspace · Starter', meta: 'me@oakline.co' },
  { kind: 'reply', text: 'Peer replied to mailbox', meta: 'team@flux.gg' },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function describeArc(cx: number, cy: number, r: number, startAng: number, endAng: number): string {
  const toXY = (ang: number): [number, number] => {
    const a = ((ang - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [sx, sy] = toXY(startAng);
  const [ex, ey] = toXY(endAng);
  const large = endAng - startAng <= 180 ? 0 : 1;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

function relTime(sec: number): string {
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        color: C.faint,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      }}
    >
      <Icon size={11} strokeWidth={2.4} />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top status bar — system state + range toggle + live clock
// ---------------------------------------------------------------------------

function StatusBar({
  range,
  onRange,
}: {
  range: RangeId;
  onRange: (r: RangeId) => void;
}) {
  const clock = useNow(1000);
  const downCount = SUBSYSTEMS.filter((s) => s.status === 'down').length;
  const warnCount = SUBSYSTEMS.filter((s) => s.status === 'warn').length;
  const overall: SubStatus = downCount > 0 ? 'down' : warnCount > 0 ? 'warn' : 'ok';
  const overallColor = statusColor[overall];

  const hh = String(clock.getUTCHours()).padStart(2, '0');
  const mm = String(clock.getUTCMinutes()).padStart(2, '0');
  const ss = String(clock.getUTCSeconds()).padStart(2, '0');

  const ranges: Array<{ id: RangeId; label: string }> = [
    { id: 'live', label: 'Live' },
    { id: '24h', label: '24h' },
    { id: '7d', label: '7d' },
  ];

  return (
    <div
      style={{
        ...GLASS,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* faint scanning glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(420px 80px at 12% 0%, ${C.accent}1f, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Overall system pill */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '6px 12px',
          borderRadius: 999,
          background: `${overallColor}18`,
          border: `1px solid ${overallColor}55`,
        }}
      >
        <span style={{ position: 'relative', width: 9, height: 9, flexShrink: 0 }}>
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: overallColor,
              boxShadow: `0 0 8px ${overallColor}`,
            }}
          />
          <span
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              border: `1.5px solid ${overallColor}`,
              animation: 'wpPing 1.8s cubic-bezier(0,0,0.2,1) infinite',
            }}
          />
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.02em' }}>
          All systems {statusLabel[overall].toLowerCase()}
        </span>
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7 }}>
        <Radio size={13} strokeWidth={2.2} style={{ color: C.accent2 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.dim }}>Mission Control</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Live clock (monospace, UTC) */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 10,
          background: C.glass2,
          border: `1px solid ${C.borderSoft}`,
        }}
      >
        <Clock size={12} strokeWidth={2.2} style={{ color: C.faint }} />
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: '0.04em' }}>
          {hh}:{mm}:{ss}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '0.08em' }}>UTC</span>
      </div>

      {/* Range toggle — actually swaps the hero series */}
      <div
        role="tablist"
        aria-label="Time range"
        style={{
          position: 'relative',
          display: 'flex',
          gap: 3,
          padding: 3,
          borderRadius: 999,
          background: C.glass2,
          border: `1px solid ${C.borderSoft}`,
        }}
      >
        {ranges.map((r) => {
          const on = r.id === range;
          return (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onRange(r.id)}
              style={{
                appearance: 'none',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 999,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: on ? '#1a0d06' : C.dim,
                background: on ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})` : 'transparent',
                boxShadow: on ? `0 0 16px ${C.accent}66` : 'none',
                transition: 'all 0.18s ease',
              }}
            >
              {r.id === 'live' && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: on ? '#1a0d06' : C.success,
                    boxShadow: on ? 'none' : `0 0 6px ${C.success}`,
                  }}
                />
              )}
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sends-pulse hero chart (animated, range-driven, live counter)
// ---------------------------------------------------------------------------

function PulseTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const v = payload[0]?.value ?? 0;
  return (
    <div
      style={{
        background: 'rgba(18,14,12,0.94)',
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '8px 12px',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ color: C.faint, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, color: C.text, fontSize: 15, fontWeight: 700 }}>
        {v.toLocaleString()}{' '}
        <span style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>{unit}</span>
      </div>
    </div>
  );
}

function PulseHero({ range }: { range: RangeId }) {
  const baseData = PULSE_BY_RANGE[range];
  const meta = RANGE_META[range];

  // Live "sends/min" counter — only ticks while on the Live range.
  const [perMin, setPerMin] = useState<number>(91);
  // A rolling copy of the live series we mutate so the line visibly breathes.
  const [liveSeries, setLiveSeries] = useState<PulsePoint[]>(PULSE_LIVE);

  useEffect(() => {
    if (range !== 'live') return;
    const id = window.setInterval(() => {
      setPerMin((prev) => {
        const drift = Math.round((Math.random() - 0.45) * 9);
        const next = Math.min(120, Math.max(58, prev + drift));
        setLiveSeries((series) => {
          const shifted = series.slice(1);
          return [...shifted, { t: 'now', sends: next }];
        });
        return next;
      });
    }, 1600);
    return () => window.clearInterval(id);
  }, [range]);

  const data = range === 'live' ? liveSeries : baseData;
  const unit = range === 'live' ? 'sends/min' : 'sends';

  const peak = useMemo(() => Math.max(...data.map((d) => d.sends)), [data]);

  return (
    <div style={{ ...GLASS, padding: 22, position: 'relative', overflow: 'hidden' }}>
      {/* ambient orange glow behind chart */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: -40,
          bottom: -60,
          width: 420,
          height: 240,
          background: `radial-gradient(circle at 30% 80%, ${C.accent}26, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <SectionLabel icon={Activity}>Warmup send pulse</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 36,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                textShadow: `0 0 24px ${C.accent}55`,
              }}
            >
              {range === 'live' ? perMin.toLocaleString() : meta.total}
            </span>
            {range === 'live' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.success,
                  background: `${C.success}1a`,
                  border: `1px solid ${C.success}44`,
                  borderRadius: 999,
                  padding: '3px 9px',
                }}
              >
                <CircleDot size={10} strokeWidth={2.6} />
                LIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>{meta.sub}</div>
        </div>

        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <MiniStat label="Peak" value={peak.toLocaleString()} accent={C.accent2} />
          <MiniStat label="Avg / min" value="76" accent={C.dim as string} />
          <MiniStat label="Bounce" value="0.7%" accent={C.success} />
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: 'relative', height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.accent2} stopOpacity={0.42} />
                <stop offset="100%" stopColor={C.accent} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="pulseStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={C.accent} />
                <stop offset="100%" stopColor={C.accent2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="t"
              tick={{ fill: C.faint, fontSize: 10, fontFamily: MONO }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={18}
            />
            <YAxis
              tick={{ fill: C.faint, fontSize: 10, fontFamily: MONO }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
            />
            <Tooltip
              cursor={{ stroke: C.accent2, strokeWidth: 1, strokeDasharray: '4 4' }}
              content={<PulseTooltip unit={unit} />}
            />
            <Area
              type="monotone"
              dataKey="sends"
              stroke="url(#pulseStroke)"
              strokeWidth={2.4}
              fill="url(#pulseFill)"
              isAnimationActive={range !== 'live'}
              animationDuration={600}
              dot={false}
              activeDot={{ r: 4, fill: C.accent2, stroke: '#1a0d06', strokeWidth: 1.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 56 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.faint, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: accent, lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radial gauge (SVG arc) — animates to target on mount
// ---------------------------------------------------------------------------

function RadialGauge({
  label,
  pct,
  centerValue,
  centerSub,
  color,
  icon: Icon,
}: {
  label: string;
  pct: number;
  centerValue: string;
  centerSub: string;
  color: string;
  icon: typeof Gauge;
}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setVal(pct), 120);
    return () => window.clearTimeout(id);
  }, [pct]);

  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const r = 52;
  const startAng = 135;
  const sweep = 270;
  const endAng = startAng + (sweep * val) / 100;

  return (
    <div
      style={{
        ...GLASS,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        flex: '1 1 0',
        minWidth: 0,
      }}
    >
      <SectionLabel icon={Icon}>{label}</SectionLabel>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <path
            d={describeArc(cx, cy, r, startAng, startAng + sweep)}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={9}
            strokeLinecap="round"
          />
          <path
            d={describeArc(cx, cy, r, startAng, endAng)}
            fill="none"
            stroke={color}
            strokeWidth={9}
            strokeLinecap="round"
            style={{
              transition: 'all 1s cubic-bezier(0.34,1.2,0.64,1)',
              filter: `drop-shadow(0 0 6px ${color}aa)`,
            }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: C.text, lineHeight: 1 }}>
            {centerValue}
          </span>
          <span style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>{centerSub}</span>
        </div>
      </div>
    </div>
  );
}

function GaugeCluster() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <RadialGauge
        label="Inbox placement"
        pct={92}
        centerValue="92%"
        centerSub="inbox rate"
        color={C.success}
        icon={Inbox}
      />
      <RadialGauge
        label="Pool capacity"
        pct={74}
        centerValue="74%"
        centerSub="2.4k / 3.2k"
        color={C.warning}
        icon={Server}
      />
      <RadialGauge
        label="System health"
        pct={97}
        centerValue="97"
        centerSub="health score"
        color={C.accent}
        icon={Gauge}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card with inline sparkline
// ---------------------------------------------------------------------------

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const w = 64;
  const h = 26;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
  const color = positive ? C.success : C.danger;
  const gid = positive ? 'spkPos' : 'spkNeg';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.30" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${coords} ${w},${h}`} fill={`url(#${gid})`} />
      <polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const [hover, setHover] = useState(false);
  const Icon = kpi.icon;
  const deltaColor = kpi.positive ? C.success : C.danger;
  const DeltaIcon = kpi.positive ? ArrowUpRight : ArrowDownRight;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...GLASS,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        minWidth: 0,
        flex: '1 1 0',
        transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
        transform: hover ? 'translateY(-2px)' : 'none',
        borderColor: hover ? `${C.accent}66` : C.border,
        boxShadow: hover ? `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${C.accent}22` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel icon={Icon}>{kpi.label}</SectionLabel>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {kpi.value}
          {kpi.unit && <span style={{ fontSize: 13, color: C.dim, marginLeft: 1 }}>{kpi.unit}</span>}
        </span>
        <Sparkline points={kpi.spark} positive={kpi.positive} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <DeltaIcon size={12} strokeWidth={2.6} style={{ color: deltaColor }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: deltaColor }}>{kpi.delta}</span>
        <span style={{ fontSize: 10, color: C.ghost, marginLeft: 2 }}>vs prev 30d</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan distribution panel (horizontal meters)
// ---------------------------------------------------------------------------

function PlanDistribution() {
  const total = PLANS.reduce((s, p) => s + p.workspaces, 0);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setGrown(true), 120);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div style={{ ...GLASS, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel icon={Users}>Plan distribution</SectionLabel>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim }}>
          {total.toLocaleString()} workspaces
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {PLANS.map((p) => {
          const pct = Math.round((p.workspaces / total) * 100);
          return (
            <div key={p.name}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: C.dim, fontWeight: 500 }}>{p.name}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>
                    {p.workspaces.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 10, color: C.faint, width: 26, textAlign: 'right' }}>{pct}%</span>
                </span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: grown ? `${pct}%` : '0%',
                    borderRadius: 4,
                    background: `linear-gradient(90deg, ${p.color}, ${p.color}cc)`,
                    boxShadow: `0 0 10px ${p.color}66`,
                    transition: 'width 0.9s cubic-bezier(0.34,1.2,0.64,1)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subsystem status grid
// ---------------------------------------------------------------------------

function SubsystemGrid() {
  return (
    <div style={{ ...GLASS, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionLabel icon={Server}>Subsystem status</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 10,
        }}
      >
        {SUBSYSTEMS.map((s) => {
          const color = statusColor[s.status];
          const Icon = s.icon;
          return (
            <div
              key={s.id}
              style={{
                background: C.glass2,
                border: `1px solid ${s.status === 'ok' ? C.borderSoft : `${color}55`}`,
                borderRadius: 12,
                padding: '11px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {s.status !== 'ok' && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `radial-gradient(120px 40px at 100% 0%, ${color}22, transparent 70%)`,
                    pointerEvents: 'none',
                  }}
                />
              )}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon size={13} strokeWidth={2.2} style={{ color: C.faint }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{s.name}</span>
                </div>
                <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      background: color,
                      boxShadow: `0 0 7px ${color}`,
                    }}
                  />
                  {s.status !== 'ok' && (
                    <span
                      style={{
                        position: 'absolute',
                        inset: -3,
                        borderRadius: '50%',
                        border: `1.5px solid ${color}`,
                        animation: 'wpPing 1.8s cubic-bezier(0,0,0.2,1) infinite',
                      }}
                    />
                  )}
                </span>
              </div>
              <span style={{ position: 'relative', fontFamily: MONO, fontSize: 11, color: C.dim }}>{s.metric}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live event stream (ticks: ages climb, new events splice in at top)
// ---------------------------------------------------------------------------

function LiveEventStream({ paused }: { paused: boolean }) {
  const [events, setEvents] = useState<FeedEvent[]>(SEED_EVENTS);
  const counter = useRef<number>(100);
  const rotIdx = useRef<number>(0);
  const [flashId, setFlashId] = useState<number | null>(null);

  useEffect(() => {
    // Age every event each second.
    const ageId = window.setInterval(() => {
      setEvents((prev) => prev.map((e) => ({ ...e, ageSec: e.ageSec + 1 })));
    }, 1000);
    return () => window.clearInterval(ageId);
  }, []);

  useEffect(() => {
    if (paused) return;
    // Splice a fresh event in at the top on an interval.
    const id = window.setInterval(() => {
      const tmpl = ROTATION[rotIdx.current % ROTATION.length]!;
      rotIdx.current += 1;
      counter.current += 1;
      const next: FeedEvent = { id: counter.current, ...tmpl, ageSec: 0 };
      setFlashId(next.id);
      setEvents((prev) => [next, ...prev].slice(0, 9));
      window.setTimeout(() => setFlashId(null), 900);
    }, 2600);
    return () => window.clearInterval(id);
  }, [paused]);

  const perMinNote = useNow(60000);
  const sentLastMin = useMemo(
    () => 70 + (perMinNote.getMinutes() % 23),
    [perMinNote],
  );

  return (
    <div style={{ ...GLASS, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel icon={Activity}>Live event stream</SectionLabel>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: paused ? C.faint : C.success,
            background: paused ? C.glass2 : `${C.success}1a`,
            border: `1px solid ${paused ? C.borderSoft : `${C.success}44`}`,
            borderRadius: 999,
            padding: '3px 9px',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: paused ? C.faint : C.success,
              boxShadow: paused ? 'none' : `0 0 6px ${C.success}`,
            }}
          />
          {paused ? 'PAUSED' : 'STREAMING'}
        </span>
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: 11,
          color: C.dim,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingBottom: 10,
          borderBottom: `1px solid ${C.borderSoft}`,
        }}
      >
        <Zap size={11} strokeWidth={2.4} style={{ color: C.accent2 }} />
        <span style={{ color: C.accent2, fontWeight: 700 }}>{sentLastMin}</span> events/min · last 60s
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', flex: 1, minHeight: 0 }}>
        {events.map((e) => {
          const style = EVENT_STYLE[e.kind];
          const EvIcon = style.icon;
          const isNew = e.id === flashId;
          return (
            <div
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 8px',
                borderRadius: 10,
                background: isNew ? `${style.color}16` : 'transparent',
                transition: 'background 0.6s ease',
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${style.color}1c`,
                  border: `1px solid ${style.color}3a`,
                  color: style.color,
                }}
              >
                <EvIcon size={13} strokeWidth={2.2} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: C.text,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {e.text}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: C.faint,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {e.meta}
                </div>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.ghost, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {relTime(e.ageSec)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdmDshE1Mission() {
  const [range, setRange] = useState<RangeId>('live');
  // Stream pauses automatically off the Live range — keeps it feeling honest.
  const streamPaused = range !== 'live';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* keyframes for pings + breathing — scoped via a single style tag */}
      <style>{`
        @keyframes wpPing {
          0%   { transform: scale(0.7); opacity: 0.9; }
          80%  { transform: scale(1.9); opacity: 0; }
          100% { transform: scale(1.9); opacity: 0; }
        }
      `}</style>

      {/* Top status bar */}
      <StatusBar range={range} onRange={setRange} />

      {/* Hero zone: pulse chart (wide) + gauge stack */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.9fr) minmax(180px, 0.85fr)',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <PulseHero range={range} />
        <GaugeCluster />
      </div>

      {/* KPI cluster */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        {KPIS.map((k) => (
          <KpiCard key={k.id} kpi={k} />
        ))}
      </div>

      {/* Lower zone: left column (plan dist + subsystems) + right live stream */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.55fr) minmax(280px, 1fr)',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PlanDistribution />
          <SubsystemGrid />
        </div>
        <LiveEventStream paused={streamPaused} />
      </div>

      {/* Footer note */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: C.ghost,
          fontSize: 11,
          fontFamily: MONO,
          paddingTop: 2,
        }}
      >
        <CheckCircle2 size={12} strokeWidth={2.2} style={{ color: C.success }} />
        Telemetry nominal · 1,107 workspaces · refreshed {range === 'live' ? 'live' : range}
      </div>
    </div>
  );
}

export default AdmDshE1Mission;
