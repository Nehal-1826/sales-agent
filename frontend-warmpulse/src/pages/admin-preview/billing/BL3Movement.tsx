/**
 * Admin Billing Design Candidate: BL3 MRR Movement
 *
 * "MRR Movement" — the CFO waterfall view.
 * MRR waterfall (new + expansion − contraction − churn → ending MRR) with
 * spring-animated bars, animated counters, a hand-built SVG MRR trend chart
 * with motion.path pathLength animation, ARR KPI, quick-ratio, and an
 * upcoming-renewals list with FLIP reorder (sort by date / amount / risk)
 * and click-to-detail local state.
 *
 * Framer-motion: staggerChildren entrance, spring waterfall bars, useMotionValue
 * + animate for counters, motion.path pathLength for trend line, AnimatePresence
 * for detail panel, whileHover/whileTap, layout FLIP for renewals sort.
 * All controls cleaned up on unmount.
 *
 * Self-contained: inline style={{}} only. No API / react-query / @/features /
 * @/lib/api. Mock data only. Aurora Glass dark palette, warm palette only —
 * NO purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
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
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  RefreshCw,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Award,
  Clock,
  Building2,
} from 'lucide-react';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.40)' as const,
  ghost: 'rgba(255,255,255,0.22)' as const,
  accent: '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.18)' as const,
  accentGlow: 'rgba(242,101,34,0.35)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.14)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.13)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.14)' as const,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 16,
  } as CSSProperties,
  glassTight: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: 10,
  } as CSSProperties,
  glassDeep: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.13)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 20,
  } as CSSProperties,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
type PeriodId = 'may' | 'apr' | 'mar' | 'q1';
type SortKey = 'date' | 'amount' | 'risk';
type SortDir = 'asc' | 'desc';
type RiskLevel = 'low' | 'medium' | 'high';

interface WaterfallPeriod {
  label: string;
  startMrr: number;
  newMrr: number;
  expansion: number;
  contraction: number;
  churn: number;
  endMrr: number;
}

interface TrendPoint {
  month: string;
  mrr: number;
  arr: number;
}

interface Renewal {
  id: string;
  workspace: string;
  plan: string;
  amount: number;
  date: string;          // ISO YYYY-MM-DD
  seats: number;
  risk: RiskLevel;
  riskReason?: string;
  daysUntil: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const PERIODS: Record<PeriodId, WaterfallPeriod> = {
  may: {
    label: 'May 2026',
    startMrr: 21150,
    newMrr: 2100,
    expansion: 900,
    contraction: -400,
    churn: -650,
    endMrr: 23100,
  },
  apr: {
    label: 'April 2026',
    startMrr: 19200,
    newMrr: 1800,
    expansion: 620,
    contraction: -280,
    churn: -190,
    endMrr: 21150,
  },
  mar: {
    label: 'March 2026',
    startMrr: 17500,
    newMrr: 1940,
    expansion: 450,
    contraction: -390,
    churn: -300,
    endMrr: 19200,
  },
  q1: {
    label: 'Q1 2026',
    startMrr: 13800,
    newMrr: 5680,
    expansion: 1420,
    contraction: -890,
    churn: -510,
    endMrr: 19200,
  },
};

const PERIOD_IDS: PeriodId[] = ['may', 'apr', 'mar', 'q1'];

const TREND_DATA: TrendPoint[] = [
  { month: 'Jun',  mrr: 13200, arr: 158400 },
  { month: 'Jul',  mrr: 13800, arr: 165600 },
  { month: 'Aug',  mrr: 14600, arr: 175200 },
  { month: 'Sep',  mrr: 15400, arr: 184800 },
  { month: 'Oct',  mrr: 15900, arr: 190800 },
  { month: 'Nov',  mrr: 16700, arr: 200400 },
  { month: 'Dec',  mrr: 17000, arr: 204000 },
  { month: 'Jan',  mrr: 17500, arr: 210000 },
  { month: 'Feb',  mrr: 18300, arr: 219600 },
  { month: 'Mar',  mrr: 19200, arr: 230400 },
  { month: 'Apr',  mrr: 21150, arr: 253800 },
  { month: 'May',  mrr: 23100, arr: 277200 },
];

const RENEWALS: Renewal[] = [
  {
    id: 'r1',
    workspace: 'Apex Digital',
    plan: 'Agency',
    amount: 349,
    date: '2026-06-03',
    seats: 1,
    risk: 'low',
    daysUntil: 2,
  },
  {
    id: 'r2',
    workspace: 'Helix Growth',
    plan: 'Pro Plus',
    amount: 149,
    date: '2026-06-05',
    seats: 3,
    risk: 'high',
    riskReason: 'No logins in 22 days',
    daysUntil: 4,
  },
  {
    id: 'r3',
    workspace: 'Bright Signal',
    plan: 'Pro',
    amount: 79,
    date: '2026-06-07',
    seats: 2,
    risk: 'medium',
    riskReason: 'Support ticket open',
    daysUntil: 6,
  },
  {
    id: 'r4',
    workspace: 'Vortex Labs',
    plan: 'Agency',
    amount: 349,
    date: '2026-06-10',
    seats: 1,
    risk: 'low',
    daysUntil: 9,
  },
  {
    id: 'r5',
    workspace: 'ClearPath CRM',
    plan: 'Pro Plus',
    amount: 447,
    date: '2026-06-12',
    seats: 3,
    risk: 'high',
    riskReason: 'Downgrade intent signal',
    daysUntil: 11,
  },
  {
    id: 'r6',
    workspace: 'Orbit Systems',
    plan: 'Pro',
    amount: 79,
    date: '2026-06-15',
    seats: 1,
    risk: 'low',
    daysUntil: 14,
  },
  {
    id: 'r7',
    workspace: 'Nexus Partners',
    plan: 'Starter',
    amount: 29,
    date: '2026-06-18',
    seats: 1,
    risk: 'medium',
    riskReason: 'Low warmup activity',
    daysUntil: 17,
  },
  {
    id: 'r8',
    workspace: 'Summit Media',
    plan: 'Agency',
    amount: 349,
    date: '2026-06-22',
    seats: 1,
    risk: 'low',
    daysUntil: 21,
  },
];

// ─── Animated Counter Hook ────────────────────────────────────────────────────
function useAnimCounter(
  target: number,
  duration = 1.2,
  decimals = 0,
): string {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.stop();
    ctrlRef.current = animate(mv, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => {
      ctrlRef.current?.stop();
    };
  }, [target, duration, mv]);

  return display.toFixed(decimals);
}

// ─── SVG Trend Chart ─────────────────────────────────────────────────────────
interface TrendChartProps {
  data: TrendPoint[];
  animKey: string;
}

function TrendChart({ data, animKey }: TrendChartProps) {
  const W = 600;
  const H = 140;
  const pad = { t: 12, r: 8, b: 28, l: 48 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const values = data.map((d) => d.mrr);
  const minV = Math.min(...values) * 0.97;
  const maxV = Math.max(...values) * 1.02;
  const range = maxV - minV;

  const toX = (i: number) => pad.l + (i / (data.length - 1)) * innerW;
  const toY = (v: number) => pad.t + innerH - ((v - minV) / range) * innerH;

  // Build smooth cubic bezier path
  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.mrr) }));

  const pathD = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = points[i - 1]!;
    const cpx = (prev.x + pt.x) / 2;
    return `${acc} C ${cpx} ${prev.y} ${cpx} ${pt.y} ${pt.x} ${pt.y}`;
  }, '');

  // Fill path (closes below)
  const fillD =
    pathD +
    ` L ${points[points.length - 1]!.x} ${pad.t + innerH}` +
    ` L ${pad.l} ${pad.t + innerH} Z`;

  // Y-axis labels
  const yLabels = [minV, (minV + maxV) / 2, maxV].map((v) => ({
    v,
    y: toY(v),
    label: `$${(v / 1000).toFixed(0)}k`,
  }));

  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F26522" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#F26522" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="mrrClip">
            <rect x={pad.l} y={pad.t} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {yLabels.map((yl) => (
          <line
            key={yl.label}
            x1={pad.l}
            y1={yl.y}
            x2={pad.l + innerW}
            y2={yl.y}
            stroke="rgba(255,255,255,0.07)"
            strokeDasharray="3 4"
          />
        ))}

        {/* Y-axis labels */}
        {yLabels.map((yl) => (
          <text
            key={yl.label}
            x={pad.l - 6}
            y={yl.y + 4}
            textAnchor="end"
            fontSize={9}
            fill="rgba(255,255,255,0.38)"
            fontFamily="inherit"
          >
            {yl.label}
          </text>
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => (
          <text
            key={d.month}
            x={toX(i)}
            y={H - 4}
            textAnchor="middle"
            fontSize={9}
            fill="rgba(255,255,255,0.38)"
            fontFamily="inherit"
          >
            {d.month}
          </text>
        ))}

        {/* Fill */}
        <motion.path
          key={`fill-${animKey}`}
          d={fillD}
          fill="url(#mrrGrad)"
          clipPath="url(#mrrClip)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />

        {/* Line */}
        <motion.path
          key={`line-${animKey}`}
          d={pathD}
          fill="none"
          stroke="#F26522"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath="url(#mrrClip)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        />

        {/* Hover dots */}
        {points.map((pt, i) => (
          <g
            key={i}
            onMouseEnter={() => setHovered(i)}
            style={{ cursor: 'crosshair' }}
          >
            <rect
              x={pt.x - 14}
              y={pad.t}
              width={28}
              height={innerH}
              fill="transparent"
            />
            <motion.circle
              cx={pt.x}
              cy={pt.y}
              r={hovered === i ? 5 : 3}
              fill={hovered === i ? '#F26522' : 'rgba(242,101,34,0.7)'}
              stroke="rgba(255,255,255,0.9)"
              strokeWidth={hovered === i ? 1.5 : 0}
              animate={{
                r: hovered === i ? 5 : 3,
                fill: hovered === i ? '#F26522' : 'rgba(242,101,34,0.7)',
              }}
              transition={{ duration: 0.15 }}
            />
          </g>
        ))}

        {/* Tooltip */}
        {hovered !== null && points[hovered] && data[hovered] && (
          <g>
            <rect
              x={Math.min(
                Math.max(points[hovered]!.x - 38, pad.l),
                pad.l + innerW - 76,
              )}
              y={points[hovered]!.y - 40}
              width={76}
              height={32}
              rx={6}
              fill="rgba(20,20,24,0.92)"
              stroke="rgba(242,101,34,0.4)"
              strokeWidth={1}
            />
            <text
              x={Math.min(
                Math.max(points[hovered]!.x - 38, pad.l),
                pad.l + innerW - 76,
              ) + 38}
              y={points[hovered]!.y - 28}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="#F26522"
              fontFamily="inherit"
            >
              {data[hovered]!.month}
            </text>
            <text
              x={Math.min(
                Math.max(points[hovered]!.x - 38, pad.l),
                pad.l + innerW - 76,
              ) + 38}
              y={points[hovered]!.y - 14}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#fff"
              fontFamily="inherit"
            >
              ${(data[hovered]!.mrr / 1000).toFixed(1)}k
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ─── Waterfall Bar Component ──────────────────────────────────────────────────
interface WaterfallBarProps {
  label: string;
  value: number;
  maxAbs: number;
  color: string;
  colorDim: string;
  delay: number;
  isTotal?: boolean;
  totalValue?: number;
  baseline?: number;       // 0..1 within chart height
  chartHeight?: number;
}

function WaterfallBar({
  label,
  value,
  maxAbs,
  color,
  colorDim,
  delay,
  isTotal = false,
  totalValue,
  baseline = 0.5,
  chartHeight = 160,
}: WaterfallBarProps) {
  const absV = Math.abs(value);
  const frac = absV / maxAbs;
  const barPx = frac * chartHeight * 0.8;
  const isNeg = value < 0;
  const displayVal = isTotal ? (totalValue ?? value) : value;
  const formattedVal = `$${Math.abs(displayVal).toLocaleString()}`;
  const prefixed = displayVal >= 0 ? `+$${displayVal.toLocaleString()}` : `-$${Math.abs(displayVal).toLocaleString()}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
      }}
    >
      {/* Value label */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.3, duration: 0.4 }}
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: isTotal ? T.text : color,
          letterSpacing: '0.01em',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {isTotal ? formattedVal : prefixed}
      </motion.div>

      {/* Bar area */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: chartHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Baseline */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: chartHeight * baseline,
            height: 1,
            background: 'rgba(255,255,255,0.12)',
          }}
        />

        {/* Bar */}
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: barPx, opacity: 1 }}
          transition={{
            delay,
            duration: 0.7,
            type: 'spring',
            stiffness: 260,
            damping: 22,
          }}
          style={{
            position: 'absolute',
            left: '15%',
            right: '15%',
            [isNeg ? 'top' : 'bottom']: `${(1 - baseline) * 100}%`,
            background: isTotal
              ? `linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.06) 100%)`
              : `linear-gradient(${isNeg ? '180deg' : '0deg'}, ${color} 0%, ${colorDim} 100%)`,
            borderRadius: isNeg
              ? '0 0 6px 6px'
              : '6px 6px 0 0',
            border: isTotal
              ? '1px solid rgba(255,255,255,0.18)'
              : `1px solid ${color}44`,
          }}
          whileHover={{ filter: 'brightness(1.15)' }}
        />
      </div>

      {/* Label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.5, duration: 0.3 }}
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: T.faint,
          textAlign: 'center',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1.3,
        }}
      >
        {label}
      </motion.div>
    </div>
  );
}

// ─── Risk Badge ───────────────────────────────────────────────────────────────
function RiskBadge({ risk }: { risk: RiskLevel }) {
  const cfg: Record<RiskLevel, { label: string; bg: string; color: string }> = {
    low:    { label: 'Low',    bg: T.successDim, color: T.success },
    medium: { label: 'Medium', bg: T.warningDim, color: T.warning },
    high:   { label: 'High',   bg: T.dangerDim,  color: T.danger },
  };
  const c = cfg[risk];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '2px 7px',
        borderRadius: 6,
        background: c.bg,
        color: c.color,
        whiteSpace: 'nowrap',
      }}
    >
      {c.label}
    </span>
  );
}

// ─── Container Variants ───────────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 280, damping: 26 },
  },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdmBilBL3Movement() {
  const [period, setPeriod] = useState<PeriodId>('may');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedRenewal, setSelectedRenewal] = useState<Renewal | null>(null);
  const [trendAnimKey, setTrendAnimKey] = useState(0);

  const pd = PERIODS[period];

  // Re-animate trend when period changes
  useEffect(() => {
    setTrendAnimKey((k) => k + 1);
  }, [period]);

  // Animated counters
  const endMrrDisplay = useAnimCounter(pd.endMrr, 1.2);
  const arrDisplay = useAnimCounter(pd.endMrr * 12, 1.4);
  const netNewDisplay = useAnimCounter(pd.newMrr + pd.expansion + pd.contraction + pd.churn, 1.1);
  const churnPct = parseFloat(
    ((-pd.churn / pd.startMrr) * 100).toFixed(1)
  );
  const quickRatio = parseFloat(
    (((pd.newMrr + pd.expansion) / (-pd.contraction - pd.churn)) || 0).toFixed(2)
  );
  const churnDisplay = useAnimCounter(churnPct, 1.1, 1);
  const qrDisplay = useAnimCounter(quickRatio, 1.2, 2);

  // Sorted renewals
  const sortedRenewals = [...RENEWALS].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'date') cmp = a.daysUntil - b.daysUntil;
    else if (sortKey === 'amount') cmp = a.amount - b.amount;
    else {
      const riskOrder: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
      cmp = (riskOrder[a.risk] ?? 0) - (riskOrder[b.risk] ?? 0);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else { setSortKey(key); setSortDir('asc'); }
    },
    [sortKey],
  );

  // Waterfall config
  const maxAbs = Math.max(
    pd.startMrr,
    pd.newMrr,
    pd.expansion,
    Math.abs(pd.contraction),
    Math.abs(pd.churn),
    pd.endMrr,
  );

  const netNew = pd.newMrr + pd.expansion + pd.contraction + pd.churn;

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '24px 28px',
        boxSizing: 'border-box',
        fontFamily:
          '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
        color: T.text,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: T.accentDim,
                border: `1px solid ${T.accentGlow}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TrendingUp size={18} color={T.accent} />
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                background: `linear-gradient(135deg, #fff 40%, ${T.accentLight})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              MRR Movement
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.dim }}>
            Revenue waterfall · trend · upcoming renewals
          </p>
        </div>

        {/* Period toggle */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '4px',
            ...T.glassTight,
          }}
        >
          {PERIOD_IDS.map((pid) => (
            <motion.button
              key={pid}
              onClick={() => setPeriod(pid)}
              whileTap={{ scale: 0.94 }}
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                background: period === pid ? T.accent : 'transparent',
                color: period === pid ? '#fff' : T.dim,
                outline: 'none',
              }}
            >
              {PERIODS[pid].label.split(' ')[0]}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}
      >
        {/* MRR */}
        <motion.div variants={cardVariants} whileHover={{ y: -3 }} style={{ ...T.glass, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <DollarSign size={14} color={T.accent} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.faint }}>
              Ending MRR
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: T.text }}>
            ${Number(endMrrDisplay).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: T.success, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowUpRight size={12} />
            +{(((pd.endMrr - pd.startMrr) / pd.startMrr) * 100).toFixed(1)}% vs start
          </div>
        </motion.div>

        {/* ARR */}
        <motion.div variants={cardVariants} whileHover={{ y: -3 }} style={{ ...T.glass, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Award size={14} color={T.accentLight} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.faint }}>
              ARR
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: T.text }}>
            ${(Number(arrDisplay) / 1000).toFixed(0)}k
          </div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
            {pd.endMrr * 12 >= 1_000_000 ? 'Annualised run rate' : `$${(pd.endMrr * 12).toLocaleString()} / year`}
          </div>
        </motion.div>

        {/* Net New MRR */}
        <motion.div variants={cardVariants} whileHover={{ y: -3 }} style={{ ...T.glass, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Zap size={14} color={netNew >= 0 ? T.success : T.danger} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.faint }}>
              Net New MRR
            </span>
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: netNew >= 0 ? T.success : T.danger,
            }}
          >
            {netNew >= 0 ? '+' : '-'}${Math.abs(Number(netNewDisplay)).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
            new + expansion − contraction − churn
          </div>
        </motion.div>

        {/* Quick Ratio */}
        <motion.div variants={cardVariants} whileHover={{ y: -3 }} style={{ ...T.glass, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <RefreshCw size={14} color={T.warning} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.faint }}>
              Quick Ratio
            </span>
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: parseFloat(qrDisplay) >= 4 ? T.success : parseFloat(qrDisplay) >= 2 ? T.warning : T.danger,
            }}
          >
            {qrDisplay}×
          </div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: T.danger }}>Churn {churnDisplay}%</span>
            <span>/mo</span>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Waterfall + Trend Row ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>

        {/* Waterfall */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          style={{ ...T.glass, padding: '20px 20px 16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>MRR Waterfall</div>
              <div style={{ fontSize: 11, color: T.faint }}>{pd.label}</div>
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: 6,
                background: T.accentDim,
                color: T.accent,
              }}
            >
              MoM +{(((pd.endMrr - pd.startMrr) / pd.startMrr) * 100).toFixed(1)}%
            </div>
          </div>

          {/* Bar chart */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`wf-${period}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ display: 'flex', gap: 6, alignItems: 'stretch', height: '100%' }}
            >
              <WaterfallBar
                label="Start"
                value={pd.startMrr}
                maxAbs={maxAbs}
                color="rgba(255,255,255,0.55)"
                colorDim="rgba(255,255,255,0.25)"
                delay={0.0}
                isTotal
                totalValue={pd.startMrr}
                chartHeight={160}
                baseline={0.45}
              />
              <WaterfallBar
                label="New"
                value={pd.newMrr}
                maxAbs={maxAbs}
                color={T.success}
                colorDim="rgba(61,220,151,0.45)"
                delay={0.12}
                chartHeight={160}
                baseline={0.45}
              />
              <WaterfallBar
                label="Expansion"
                value={pd.expansion}
                maxAbs={maxAbs}
                color="#7EE8A2"
                colorDim="rgba(126,232,162,0.4)"
                delay={0.22}
                chartHeight={160}
                baseline={0.45}
              />
              <WaterfallBar
                label="Contraction"
                value={pd.contraction}
                maxAbs={maxAbs}
                color={T.warning}
                colorDim="rgba(255,138,75,0.4)"
                delay={0.32}
                chartHeight={160}
                baseline={0.45}
              />
              <WaterfallBar
                label="Churn"
                value={pd.churn}
                maxAbs={maxAbs}
                color={T.danger}
                colorDim="rgba(255,92,122,0.4)"
                delay={0.42}
                chartHeight={160}
                baseline={0.45}
              />
              <WaterfallBar
                label="End"
                value={pd.endMrr}
                maxAbs={maxAbs}
                color={T.accent}
                colorDim={T.accentDim}
                delay={0.54}
                isTotal
                totalValue={pd.endMrr}
                chartHeight={160}
                baseline={0.45}
              />
            </motion.div>
          </AnimatePresence>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 12 }}>
            {[
              { color: T.success, label: 'New MRR' },
              { color: '#7EE8A2', label: 'Expansion' },
              { color: T.warning, label: 'Contraction' },
              { color: T.danger, label: 'Churn' },
            ].map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                <span style={{ fontSize: 10, color: T.faint }}>{l.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Trend Chart */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          style={{ ...T.glass, padding: '20px 20px 16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>MRR Trend</div>
              <div style={{ fontSize: 11, color: T.faint }}>12-month rolling</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent }} />
              <span style={{ fontSize: 11, color: T.dim }}>Monthly Recurring Revenue</span>
            </div>
          </div>

          <TrendChart data={TREND_DATA} animKey={String(trendAnimKey)} />

          {/* Mini stats below chart */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginTop: 14,
            }}
          >
            {[
              { label: 'Growth MoM', value: '+9.2%', color: T.success },
              { label: '12-mo CAGR', value: '+74.8%', color: T.accentLight },
              { label: 'LTM Revenue', value: '$218k', color: T.text },
            ].map((s) => (
              <div
                key={s.label}
                style={{ ...T.glassTight, padding: '10px 12px' }}
              >
                <div style={{ fontSize: 11, color: T.faint, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Upcoming Renewals ─────────────────────────────────────────── */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        style={{ ...T.glass, padding: '20px' }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Upcoming Renewals</div>
            <div style={{ fontSize: 11, color: T.faint }}>Next 30 days · {RENEWALS.length} workspaces</div>
          </div>

          {/* Sort controls */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['date', 'amount', 'risk'] as SortKey[]).map((key) => (
              <motion.button
                key={key}
                onClick={() => handleSort(key)}
                whileTap={{ scale: 0.92 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 11px',
                  borderRadius: 7,
                  border: `1px solid ${sortKey === key ? T.accent + '60' : 'rgba(255,255,255,0.10)'}`,
                  background: sortKey === key ? T.accentDim : 'transparent',
                  color: sortKey === key ? T.accentLight : T.dim,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                  textTransform: 'capitalize',
                }}
              >
                {key}
                {sortKey === key ? (
                  sortDir === 'asc' ? (
                    <ChevronUp size={11} />
                  ) : (
                    <ChevronDown size={11} />
                  )
                ) : null}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Table header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 90px 80px 80px 70px',
            gap: 8,
            padding: '6px 12px',
            marginBottom: 4,
          }}
        >
          {['Workspace', 'Plan', 'Amount', 'Date', 'Days', 'Risk'].map((h) => (
            <span
              key={h}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: T.faint,
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Renewal rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <AnimatePresence>
            {sortedRenewals.map((r, i) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ delay: i * 0.04, duration: 0.28, type: 'spring', stiffness: 400, damping: 30 }}
                onClick={() => setSelectedRenewal((prev) => (prev?.id === r.id ? null : r))}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)', x: 2 }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 90px 80px 80px 70px',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 9,
                  cursor: 'pointer',
                  border: selectedRenewal?.id === r.id
                    ? `1px solid ${T.accent}50`
                    : '1px solid transparent',
                  background: selectedRenewal?.id === r.id
                    ? T.accentDim
                    : 'transparent',
                  alignItems: 'center',
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: 'rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Building2 size={13} color={T.dim} />
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: T.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.workspace}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: T.dim }}>{r.plan}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.accentLight }}>
                  ${r.amount.toLocaleString()}
                </span>
                <span style={{ fontSize: 11, color: T.dim }}>{r.date.slice(5)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} color={r.daysUntil <= 3 ? T.warning : T.faint} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: r.daysUntil <= 3 ? T.warning : T.dim,
                    }}
                  >
                    {r.daysUntil}d
                  </span>
                </div>
                <RiskBadge risk={r.risk} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedRenewal && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div
                style={{
                  ...T.glassDeep,
                  padding: '16px 18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: T.text,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Building2 size={16} color={T.accent} />
                    {selectedRenewal.workspace}
                    <RiskBadge risk={selectedRenewal.risk} />
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, auto)',
                      gap: '6px 20px',
                    }}
                  >
                    {[
                      { label: 'Plan',    value: selectedRenewal.plan },
                      { label: 'Amount',  value: `$${selectedRenewal.amount}/mo` },
                      { label: 'Seats',   value: String(selectedRenewal.seats) },
                      { label: 'Renews',  value: selectedRenewal.date },
                    ].map((kv) => (
                      <div key={kv.label}>
                        <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {kv.label}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{kv.value}</div>
                      </div>
                    ))}
                  </div>
                  {selectedRenewal.riskReason && (
                    <div
                      style={{
                        marginTop: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px',
                        borderRadius: 7,
                        background: T.dangerDim,
                        border: `1px solid ${T.danger}30`,
                      }}
                    >
                      <AlertTriangle size={12} color={T.danger} />
                      <span style={{ fontSize: 12, color: T.danger }}>{selectedRenewal.riskReason}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    whileHover={{ backgroundColor: T.accentDim }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 9,
                      border: `1px solid ${T.accent}60`,
                      background: 'transparent',
                      color: T.accentLight,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      outline: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Users size={13} />
                    View Workspace
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={(e) => { e.stopPropagation(); setSelectedRenewal(null); }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'transparent',
                      color: T.faint,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      outline: 'none',
                    }}
                  >
                    <X size={14} />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Movement Breakdown Strip ─────────────────────────────────── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}
      >
        {[
          {
            label: 'New MRR',
            value: pd.newMrr,
            icon: TrendingUp,
            color: T.success,
            dim: T.successDim,
            dir: 'up' as const,
            sub: 'New paid subscribers',
          },
          {
            label: 'Expansion MRR',
            value: pd.expansion,
            icon: ArrowUpRight,
            color: '#7EE8A2',
            dim: 'rgba(126,232,162,0.12)',
            dir: 'up' as const,
            sub: 'Upgrades this period',
          },
          {
            label: 'Contraction MRR',
            value: pd.contraction,
            icon: ArrowDownRight,
            color: T.warning,
            dim: T.warningDim,
            dir: 'down' as const,
            sub: 'Downgrades this period',
          },
          {
            label: 'Churned MRR',
            value: pd.churn,
            icon: TrendingDown,
            color: T.danger,
            dim: T.dangerDim,
            dir: 'down' as const,
            sub: 'Cancellations this period',
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              variants={cardVariants}
              whileHover={{ y: -3, boxShadow: `0 8px 32px ${item.dim}` }}
              style={{
                ...T.glassTight,
                padding: '14px 16px',
                borderLeft: `3px solid ${item.color}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: item.dim,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={13} color={item.color} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {item.label}
                </span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: item.color, letterSpacing: '-0.02em' }}>
                {item.dir === 'up' ? '+' : '-'}${Math.abs(item.value).toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>{item.sub}</div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Footer note ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: T.ghost,
          paddingBottom: 8,
        }}
      >
        Admin view · mock data · {pd.label} · sorted by {sortKey}
      </motion.div>
    </div>
  );
}
