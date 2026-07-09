/**
 * Admin LLM Usage Design Candidate: L1 Usage Cockpit
 *
 * "Usage Cockpit" — a mission-control view of LLM token/cost/request analytics.
 * Provider priority: Gemini → Claude → Static templates. Cross-workspace super-admin
 * view of total tokens (in/out), cost, request count, latency, success rate, provider
 * split, model breakdown, top-consuming workspaces, and budget burn.
 *
 * Animation inventory:
 * - Animated number counters (useMotionValue + animate → .on('change') → setState, cleanup)
 * - Staggered entrance (container variants with staggerChildren)
 * - Hand-built animated SVG: motion.path pathLength 0→1 for token/cost trend line
 * - Spring-height bars (motion.div) for model breakdown
 * - Animated donut ring (strokeDasharray) for provider split
 * - whileHover/whileTap on cards and rows
 * - AnimatePresence for time-range re-enter
 * - GPU-friendly (transform + opacity only for hover/tap)
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={}. Mock data only.
 * Warm Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. NO purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useEffect,
  useState,
  type CSSProperties,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Zap,
  DollarSign,
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Building2,
  ChevronUp,
  ChevronDown,
  BarChart2,
  Gauge,
  ArrowUpRight,
} from 'lucide-react';

// ─── Design tokens ──────────────────────────────────────────────────────────

const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.42)' as const,
  ghost: 'rgba(255,255,255,0.22)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentHi: '#FF8A4B' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.13)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.13)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.13)' as const,
  amber: '#e8a838' as const,
  amberDim: 'rgba(232,168,56,0.13)' as const,
  neutral: 'rgba(255,255,255,0.52)' as const,
  neutralDim: 'rgba(255,255,255,0.07)' as const,
};

function glass(extra?: CSSProperties): CSSProperties {
  return {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
    ...extra,
  };
}

function glassInner(extra?: CSSProperties): CSSProperties {
  return {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    borderRadius: 12,
    ...extra,
  };
}

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: T.faint,
};

// ─── Mock data ───────────────────────────────────────────────────────────────

type Range = '14d' | '30d';

// Provider colors — warm/status palette only (no blue/purple)
const PROVIDER_COLORS = {
  Gemini: T.accent,       // orange
  Claude: T.amber,        // amber/warning
  Static: T.success,      // success/neutral
} as const;

type ProviderName = keyof typeof PROVIDER_COLORS;

interface ProviderStats {
  name: ProviderName;
  requests: number;
  tokens: number;
  cost: number;
  successRate: number;
  avgLatency: number; // seconds
  share: number; // 0-100
}

interface ModelRow {
  provider: ProviderName;
  model: string;
  tokens: number;
  cost: number;
  requests: number;
  avgLatency: number;
}

interface WorkspaceRow {
  name: string;
  domain: string;
  tokens: number;
  cost: number;
  requests: number;
  share: number; // % of total tokens
  hue: number;
}

interface TrendPoint {
  label: string;
  tokens: number;
  cost: number;
}

// 30-day series
const TREND_30D: TrendPoint[] = [
  { label: 'May 1',  tokens: 108000, cost: 0.92 },
  { label: 'May 2',  tokens: 134000, cost: 1.14 },
  { label: 'May 3',  tokens: 122000, cost: 1.03 },
  { label: 'May 4',  tokens: 148000, cost: 1.26 },
  { label: 'May 5',  tokens: 162000, cost: 1.38 },
  { label: 'May 6',  tokens: 175000, cost: 1.49 },
  { label: 'May 7',  tokens: 188000, cost: 1.60 },
  { label: 'May 8',  tokens: 172000, cost: 1.46 },
  { label: 'May 9',  tokens: 195000, cost: 1.66 },
  { label: 'May 10', tokens: 210000, cost: 1.79 },
  { label: 'May 11', tokens: 228000, cost: 1.94 },
  { label: 'May 12', tokens: 242000, cost: 2.06 },
  { label: 'May 13', tokens: 220000, cost: 1.87 },
  { label: 'May 14', tokens: 236000, cost: 2.01 },
  { label: 'May 15', tokens: 258000, cost: 2.19 },
  { label: 'May 16', tokens: 278000, cost: 2.37 },
  { label: 'May 17', tokens: 292000, cost: 2.48 },
  { label: 'May 18', tokens: 310000, cost: 2.64 },
  { label: 'May 19', tokens: 295000, cost: 2.51 },
  { label: 'May 20', tokens: 322000, cost: 2.74 },
  { label: 'May 21', tokens: 340000, cost: 2.89 },
  { label: 'May 22', tokens: 355000, cost: 3.02 },
  { label: 'May 23', tokens: 368000, cost: 3.13 },
  { label: 'May 24', tokens: 382000, cost: 3.25 },
  { label: 'May 25', tokens: 344000, cost: 2.93 },
  { label: 'May 26', tokens: 396000, cost: 3.37 },
  { label: 'May 27', tokens: 410000, cost: 3.49 },
  { label: 'May 28', tokens: 428000, cost: 3.64 },
  { label: 'May 29', tokens: 442000, cost: 3.76 },
  { label: 'May 30', tokens: 458000, cost: 3.89 },
];

const TREND_14D = TREND_30D.slice(16);

const PROVIDERS_30D: ProviderStats[] = [
  { name: 'Gemini', requests: 8680, tokens: 2940000, cost: 25.01, successRate: 99.2, avgLatency: 0.85, share: 70 },
  { name: 'Claude', requests: 3100, tokens: 1050000, cost: 12.18, successRate: 98.9, avgLatency: 1.92, share: 25 },
  { name: 'Static', requests: 620,  tokens:  210000, cost: 0.00,  successRate: 100,  avgLatency: 0.04, share: 5  },
];

const PROVIDERS_14D: ProviderStats[] = [
  { name: 'Gemini', requests: 4060, tokens: 1374000, cost: 11.68, successRate: 99.4, avgLatency: 0.82, share: 70 },
  { name: 'Claude', requests: 1450, tokens:  490700, cost: 5.69,  successRate: 99.1, avgLatency: 1.88, share: 25 },
  { name: 'Static', requests: 290,  tokens:   98700, cost: 0.00,  successRate: 100,  avgLatency: 0.04, share: 5  },
];

const MODELS: ModelRow[] = [
  { provider: 'Gemini', model: 'gemini-2.0-flash',   tokens: 2100000, cost: 17.85, requests: 6200, avgLatency: 0.78 },
  { provider: 'Gemini', model: 'gemini-1.5-pro',     tokens:  840000, cost:  7.16, requests: 2480, avgLatency: 0.96 },
  { provider: 'Claude', model: 'claude-3.5-haiku',   tokens:  720000, cost:  4.32, requests: 2120, avgLatency: 1.74 },
  { provider: 'Claude', model: 'claude-3.5-sonnet',  tokens:  330000, cost:  7.86, requests:  980, avgLatency: 2.24 },
  { provider: 'Static', model: 'static-template',    tokens:  210000, cost:  0.00, requests:  620, avgLatency: 0.04 },
];

const WORKSPACES: WorkspaceRow[] = [
  { name: 'Acme Corp',    domain: 'acme.co',        tokens: 680000, cost: 5.78, requests: 2010, share: 16.2, hue: 28  },
  { name: 'Northwind',   domain: 'northwind.io',    tokens: 570000, cost: 4.85, requests: 1680, share: 13.6, hue: 42  },
  { name: 'Beacon App',  domain: 'beacon.app',      tokens: 490000, cost: 4.17, requests: 1440, share: 11.7, hue: 15  },
  { name: 'Vendio',      domain: 'vendio.io',       tokens: 380000, cost: 3.23, requests: 1120, share: 9.1,  hue: 340 },
  { name: 'Lumen Labs',  domain: 'lumenlabs.dev',   tokens: 310000, cost: 2.64, requests:  910, share: 7.4,  hue: 20  },
  { name: 'Parable',     domain: 'parable.in',      tokens: 245000, cost: 2.08, requests:  720, share: 5.8,  hue: 5   },
  { name: 'Oxen Studio', domain: 'oxenstudio.com',  tokens: 192000, cost: 1.63, requests:  566, share: 4.6,  hue: 200 },
];

// Budget
const BUDGET = 80; // $ / month

// ─── Utility helpers ─────────────────────────────────────────────────────────

function abbrev(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtCost(v: number): string {
  return `$${v.toFixed(2)}`;
}

function fmtLatency(v: number): string {
  return `${v.toFixed(2)}s`;
}

// ─── Animated counter hook ───────────────────────────────────────────────────

function useAnimatedCounter(target: number, decimals = 0): string {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = mv.on('change', (v) => {
      setDisplay(decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString());
    });
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [target, decimals, mv]);

  return display;
}

// ─── SVG Trend Chart ─────────────────────────────────────────────────────────

interface TrendChartProps {
  series: TrendPoint[];
  field: 'tokens' | 'cost';
  color: string;
  rangeKey: Range;
}

function TrendChart({ series, field, color, rangeKey }: TrendChartProps) {
  const W = 560;
  const H = 130;
  const PAD = { top: 10, right: 12, bottom: 28, left: 44 };
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

  const values = series.map((p) => p[field]);
  const minVal = Math.min(...values) * 0.9;
  const maxVal = Math.max(...values) * 1.05;

  const toX = (i: number) => PAD.left + (i / (series.length - 1)) * inner.w;
  const toY = (v: number) => PAD.top + inner.h - ((v - minVal) / (maxVal - minVal)) * inner.h;

  const pathD = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(p[field]).toFixed(1)}`)
    .join(' ');

  const areaD =
    `M ${toX(0).toFixed(1)},${(PAD.top + inner.h).toFixed(1)} ` +
    series.map((p, i) => `L ${toX(i).toFixed(1)},${toY(p[field]).toFixed(1)}`).join(' ') +
    ` L ${toX(series.length - 1).toFixed(1)},${(PAD.top + inner.h).toFixed(1)} Z`;

  // Y-axis labels — 3 ticks
  const ticks = [minVal, (minVal + maxVal) / 2, maxVal];
  const gradId = `lg-${field}-${rangeKey}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.40" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD.left}
            y1={toY(t).toFixed(1)}
            x2={PAD.left + inner.w}
            y2={toY(t).toFixed(1)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
          <text
            x={PAD.left - 6}
            y={toY(t) + 4}
            textAnchor="end"
            fontSize="9"
            fill="rgba(255,255,255,0.32)"
          >
            {field === 'cost' ? `$${t.toFixed(1)}` : abbrev(t)}
          </text>
        </g>
      ))}

      {/* X-axis labels — every ~5 days */}
      {series.map((p, i) => {
        if (i % Math.ceil(series.length / 6) !== 0 && i !== series.length - 1) return null;
        return (
          <text
            key={i}
            x={toX(i)}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            fill="rgba(255,255,255,0.32)"
          >
            {p.label.replace('May ', 'M')}
          </text>
        );
      })}

      {/* Area fill */}
      <motion.path
        d={areaD}
        fill={`url(#${gradId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        key={`area-${rangeKey}`}
      />

      {/* Line */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        key={`line-${rangeKey}`}
      />

      {/* Latest dot */}
      <motion.circle
        cx={toX(series.length - 1)}
        cy={toY(values[values.length - 1] ?? 0)}
        r={4}
        fill={color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.5, type: 'spring', stiffness: 300, damping: 18 }}
        key={`dot-${rangeKey}`}
      />
    </svg>
  );
}

// ─── Provider donut (animated SVG) ──────────────────────────────────────────

function ProviderDonut({
  providers,
  rangeKey,
}: {
  providers: ProviderStats[];
  rangeKey: Range;
}) {
  const R = 38;
  const cx = 52;
  const cy = 52;
  const circ = 2 * Math.PI * R;

  let cumOffset = 0;
  const GAP = 2; // gap between segments in degrees

  return (
    <svg viewBox="0 0 104 104" style={{ width: 104, height: 104, flexShrink: 0 }}>
      {providers.map((p, i) => {
        const arcLen = ((p.share - GAP) / 100) * circ;
        const el = (
          <motion.circle
            key={`${rangeKey}-${p.name}`}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={PROVIDER_COLORS[p.name]}
            strokeWidth={10}
            strokeLinecap="butt"
            strokeDasharray={`${arcLen} ${circ - arcLen}`}
            strokeDashoffset={-cumOffset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
            initial={{ strokeDasharray: `0 ${circ}` }}
            animate={{ strokeDasharray: `${arcLen} ${circ - arcLen}` }}
            transition={{
              duration: 1.2,
              delay: 0.15 + i * 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        );
        cumOffset += (p.share / 100) * circ;
        return el;
      })}
      {/* Center label */}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">
        {providers.reduce((s, p) => s + p.requests, 0).toLocaleString()}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="8" fill={T.faint}>
        requests
      </text>
    </svg>
  );
}

// ─── Model spring bar ────────────────────────────────────────────────────────

type SortCol = 'tokens' | 'cost' | 'requests' | 'avgLatency';

function ModelTable({
  models,
  maxTokens,
}: {
  models: ModelRow[];
  maxTokens: number;
}) {
  const [sortCol, setSortCol] = useState<SortCol>('tokens');
  const [asc, setAsc] = useState(false);

  const sorted = [...models].sort((a, b) => {
    const av = a[sortCol];
    const bv = b[sortCol];
    return asc ? av - bv : bv - av;
  });

  const toggle = (col: SortCol) => {
    if (col === sortCol) setAsc(!asc);
    else { setSortCol(col); setAsc(false); }
  };

  const colHd = (col: SortCol, label: string) => (
    <button
      type="button"
      onClick={() => toggle(col)}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: sortCol === col ? T.accentHi : T.faint,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 0,
      }}
    >
      {label}
      {sortCol === col
        ? (asc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
        : null}
    </button>
  );

  const CONTAINER_VARIANTS: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
  };
  const ROW_VARIANTS: Variants = {
    hidden: { opacity: 0, x: -12 },
    visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 110px 88px 80px 76px',
          gap: 8,
          padding: '0 12px 8px',
          borderBottom: `1px solid ${T.hairline}`,
        }}
      >
        <span style={MICRO}>Model</span>
        {colHd('tokens',     'Tokens')}
        {colHd('cost',       'Cost')}
        {colHd('requests',   'Reqs')}
        {colHd('avgLatency', 'Latency')}
      </div>

      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}
      >
        {sorted.map((m) => {
          const barW = (m.tokens / maxTokens) * 100;
          const provColor = PROVIDER_COLORS[m.provider];
          return (
            <motion.div
              key={m.model}
              variants={ROW_VARIANTS}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8 }}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 110px 88px 80px 76px',
                gap: 8,
                padding: '8px 12px',
                alignItems: 'center',
                cursor: 'default',
              }}
            >
              {/* Model name + provider badge + bar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: provColor,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                    {m.model}
                  </span>
                </div>
                {/* Animated bar */}
                <div
                  style={{
                    height: 3,
                    background: 'rgba(255,255,255,0.07)',
                    borderRadius: 3,
                    overflow: 'hidden',
                    width: '100%',
                  }}
                >
                  <motion.div
                    style={{ height: '100%', background: provColor, borderRadius: 3, originX: 0 }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: barW / 100 }}
                    transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                  />
                </div>
              </div>

              <span style={{ fontSize: 12, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                {abbrev(m.tokens)}
              </span>
              <span style={{ fontSize: 12, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                {m.cost === 0 ? <span style={{ color: T.success }}>free</span> : fmtCost(m.cost)}
              </span>
              <span style={{ fontSize: 12, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                {m.requests.toLocaleString()}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                  color: m.avgLatency < 0.1 ? T.success : m.avgLatency > 2 ? T.warning : T.dim,
                }}
              >
                {fmtLatency(m.avgLatency)}
              </span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─── Budget burn bar ─────────────────────────────────────────────────────────

function BudgetBurn({ cost, budget }: { cost: number; budget: number }) {
  const pct = Math.min(100, (cost / budget) * 100);
  const color = pct > 90 ? T.danger : pct > 70 ? T.warning : T.accent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: T.faint, fontWeight: 600, letterSpacing: '0.05em' }}>
          Monthly budget
        </span>
        <span style={{ fontSize: 12, color: T.text, fontWeight: 700 }}>
          {fmtCost(cost)}{' '}
          <span style={{ color: T.faint, fontWeight: 400 }}>/ {fmtCost(budget)}</span>
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: 'rgba(255,255,255,0.07)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <motion.div
          style={{
            height: '100%',
            borderRadius: 8,
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            originX: 0,
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: T.faint }}>{pct.toFixed(1)}% used</span>
        <span style={{ fontSize: 11, color: T.faint }}>
          {fmtCost(budget - cost)} remaining
        </span>
      </div>
    </div>
  );
}

// ─── KPI chip with animated counter ─────────────────────────────────────────

interface KpiChipProps {
  icon: typeof Zap;
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  color?: string;
  delay?: number;
}

function KpiChip({ icon: Icon, label, value, decimals = 0, prefix = '', suffix = '', color = T.accent, delay = 0 }: KpiChipProps) {
  const display = useAnimatedCounter(value, decimals);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22, delay }}
      whileHover={{ y: -2, transition: { type: 'spring', stiffness: 340, damping: 24 } }}
      style={{
        ...glass({ borderRadius: 14, padding: '14px 18px', flex: 1, minWidth: 130 }),
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={14} color={color} strokeWidth={2.2} />
        </div>
        <span style={MICRO}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: T.text, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {prefix}{display}{suffix}
      </div>
    </motion.div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AdmLlmL1Cockpit() {
  const [range, setRange] = useState<Range>('30d');
  const [chartField, setChartField] = useState<'tokens' | 'cost'>('tokens');

  const providers = range === '30d' ? PROVIDERS_30D : PROVIDERS_14D;
  const trendData  = range === '30d' ? TREND_30D : TREND_14D;

  const totalTokens   = providers.reduce((s, p) => s + p.tokens, 0);
  const totalCost     = providers.reduce((s, p) => s + p.cost, 0);
  const totalRequests = providers.reduce((s, p) => s + p.requests, 0);

  // Weighted avg latency (by request share, excluding zero-latency static)
  const llmProviders = providers.filter((p) => p.avgLatency > 0.05);
  const totalLlmReqs = llmProviders.reduce((s, p) => s + p.requests, 0);
  const avgLatency = totalLlmReqs > 0
    ? llmProviders.reduce((s, p) => s + p.avgLatency * p.requests, 0) / totalLlmReqs
    : 0;

  // Overall success rate weighted by requests
  const successRate = totalRequests > 0
    ? providers.reduce((s, p) => s + p.successRate * p.requests, 0) / totalRequests
    : 0;

  const maxModelTokens = Math.max(...MODELS.map((m) => m.tokens));

  const budgetCost = range === '30d' ? totalCost : totalCost * (30 / 14);

  // Container variants for staggered entrance
  const CONTAINER: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07 } },
  };
  const CARD: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
  };

  return (
    <motion.div
      variants={CONTAINER}
      initial="hidden"
      animate="visible"
      style={{
        padding: '20px 24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        minHeight: '100vh',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
      }}
    >
      {/* ── Top bar ── */}
      <motion.div
        variants={CARD}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={MICRO}>Admin · LLM Usage</div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: T.text,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              marginTop: 4,
            }}
          >
            Usage Cockpit
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Time-range toggle */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 99,
              padding: 3,
              gap: 2,
            }}
          >
            {(['14d', '30d'] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: range === r ? T.accent : 'transparent',
                  color: range === r ? '#0a0a0f' : T.dim,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '5px 14px',
                  borderRadius: 99,
                  cursor: 'pointer',
                  transition: 'background 0.22s, color 0.22s',
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Budget indicator pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: budgetCost / BUDGET > 0.7 ? T.warningDim : T.successDim,
              border: `1px solid ${budgetCost / BUDGET > 0.7 ? T.warning : T.success}33`,
              borderRadius: 99,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 700,
              color: budgetCost / BUDGET > 0.7 ? T.warning : T.success,
            }}
          >
            <Gauge size={12} strokeWidth={2.4} />
            {((budgetCost / BUDGET) * 100).toFixed(0)}% of ${BUDGET} budget
          </div>
        </div>
      </motion.div>

      {/* ── KPI row ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={range}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
        >
          <KpiChip
            icon={Zap}
            label="Total tokens"
            value={totalTokens}
            color={T.accent}
            delay={0.05}
          />
          <KpiChip
            icon={DollarSign}
            label="Total cost"
            value={totalCost}
            decimals={2}
            prefix="$"
            color={T.warning}
            delay={0.10}
          />
          <KpiChip
            icon={BarChart2}
            label="Requests"
            value={totalRequests}
            color={T.accentHi}
            delay={0.15}
          />
          <KpiChip
            icon={Clock}
            label="Avg latency"
            value={avgLatency}
            decimals={2}
            suffix="s"
            color={avgLatency > 2 ? T.warning : T.success}
            delay={0.20}
          />
          <KpiChip
            icon={CheckCircle2}
            label="Success rate"
            value={successRate}
            decimals={1}
            suffix="%"
            color={successRate > 99 ? T.success : T.warning}
            delay={0.25}
          />
          <KpiChip
            icon={Gauge}
            label="Budget used"
            value={(budgetCost / BUDGET) * 100}
            decimals={1}
            suffix="%"
            color={(budgetCost / BUDGET) > 0.7 ? T.warning : T.success}
            delay={0.30}
          />
        </motion.div>
      </AnimatePresence>

      {/* ── Main chart + provider split row ── */}
      <motion.div
        variants={CARD}
        style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'stretch' }}
      >
        {/* Trend chart card */}
        <div style={glass({ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={14} color={T.accent} strokeWidth={2.2} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                {chartField === 'tokens' ? 'Token volume' : 'Cost'} · {range}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: 3,
                gap: 2,
              }}
            >
              {(['tokens', 'cost'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setChartField(f)}
                  style={{
                    appearance: 'none',
                    border: 'none',
                    background: chartField === f ? 'rgba(255,255,255,0.14)' : 'transparent',
                    color: chartField === f ? T.text : T.faint,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '3px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  {f === 'tokens' ? 'Tokens' : 'Cost'}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${range}-${chartField}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ height: 148, width: '100%' }}
            >
              <TrendChart
                series={trendData}
                field={chartField}
                color={chartField === 'tokens' ? T.accent : T.warning}
                rangeKey={range}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Provider split card */}
        <div style={glass({ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={14} color={T.accentHi} strokeWidth={2.2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Provider split</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ProviderDonut providers={providers} rangeKey={range} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {providers.map((p) => (
                <motion.div
                  key={`${range}-${p.name}`}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: PROVIDER_COLORS[p.name],
                        }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{p.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: T.faint }}>{p.share}%</span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                    <motion.div
                      style={{ height: '100%', background: PROVIDER_COLORS[p.name], borderRadius: 3, originX: 0 }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: p.share / 100 }}
                      transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                      key={`${range}-bar-${p.name}`}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: T.faint }}>{abbrev(p.tokens)} tok</span>
                    <span style={{ fontSize: 10, color: p.cost === 0 ? T.success : T.faint }}>
                      {p.cost === 0 ? 'free' : fmtCost(p.cost)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Model breakdown + Workspaces row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignItems: 'start' }}>
        {/* Model breakdown */}
        <motion.div variants={CARD} style={glass({ padding: '18px 20px' })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <BarChart2 size={14} color={T.accentHi} strokeWidth={2.2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Model breakdown</span>
            <span style={{ fontSize: 10, color: T.faint, marginLeft: 'auto' }}>click column to sort</span>
          </div>
          <ModelTable models={MODELS} maxTokens={maxModelTokens} />
        </motion.div>

        {/* Right column: workspaces + budget */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Top workspaces */}
          <motion.div variants={CARD} style={glass({ padding: '18px 18px' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Building2 size={14} color={T.accentHi} strokeWidth={2.2} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Top workspaces</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {WORKSPACES.slice(0, 6).map((ws, i) => (
                <motion.div
                  key={ws.domain}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.1 + i * 0.05 }}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 6px',
                    cursor: 'default',
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      background: `hsl(${ws.hue} 62% 52%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {ws.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ws.name}
                    </div>
                    {/* mini bar */}
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                      <motion.div
                        style={{ height: '100%', background: T.accent, borderRadius: 2, originX: 0 }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: ws.share / (WORKSPACES[0]?.share ?? 16.2) }}
                        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 + i * 0.05 }}
                      />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                      {abbrev(ws.tokens)}
                    </div>
                    <div style={{ fontSize: 9, color: T.faint }}>{ws.share.toFixed(1)}%</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Budget burn */}
          <motion.div variants={CARD} style={glass({ padding: '18px 18px' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <DollarSign size={14} color={T.accentHi} strokeWidth={2.2} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Budget burn</span>
            </div>
            <BudgetBurn cost={budgetCost} budget={BUDGET} />
          </motion.div>

          {/* Provider health */}
          <motion.div variants={CARD} style={glass({ padding: '18px 18px' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <CheckCircle2 size={14} color={T.success} strokeWidth={2.2} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Provider health</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {providers.map((p, i) => {
                const healthy = p.successRate >= 99;
                return (
                  <motion.div
                    key={`health-${p.name}`}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.15 + i * 0.07 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      background: healthy ? T.successDim : T.warningDim,
                      border: `1px solid ${healthy ? T.success : T.warning}22`,
                      borderRadius: 8,
                    }}
                  >
                    {healthy
                      ? <CheckCircle2 size={12} color={T.success} strokeWidth={2.4} />
                      : <AlertTriangle size={12} color={T.warning} strokeWidth={2.4} />}
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text, flex: 1 }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 11, color: healthy ? T.success : T.warning, fontVariantNumeric: 'tabular-nums' }}>
                      {p.successRate.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 10, color: T.faint }}>
                      {fmtLatency(p.avgLatency)}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Latency + success sparkline row ── */}
      <motion.div
        variants={CARD}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}
      >
        {[
          { label: 'Gemini avg latency',   value: PROVIDERS_30D[0]?.avgLatency ?? 0, unit: 's', color: T.accent,   icon: Clock },
          { label: 'Claude avg latency',   value: PROVIDERS_30D[1]?.avgLatency ?? 0, unit: 's', color: T.amber,    icon: Clock },
          { label: 'Overall success rate', value: PROVIDERS_30D.reduce((s, p) => s + p.successRate * p.requests, 0) / PROVIDERS_30D.reduce((s, p) => s + p.requests, 0), unit: '%', color: T.success, icon: CheckCircle2 },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            whileHover={{ scale: 1.015, transition: { type: 'spring', stiffness: 340, damping: 24 } }}
            whileTap={{ scale: 0.98 }}
            style={{
              ...glassInner({ padding: '14px 16px', borderRadius: 12 }),
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${stat.color}18`,
                border: `1px solid ${stat.color}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <stat.icon size={16} color={stat.color} strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.faint, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: stat.color, lineHeight: 1 }}>
                {stat.value.toFixed(stat.unit === '%' ? 1 : 2)}{stat.unit}
              </div>
            </div>
            <ArrowUpRight size={14} color={T.faint} strokeWidth={2} style={{ marginLeft: 'auto' }} />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
