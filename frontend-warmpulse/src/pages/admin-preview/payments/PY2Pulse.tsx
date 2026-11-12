/**
 * Admin Payments Design Candidate: PY2 Payments Pulse
 *
 * "Payments Pulse" — cross-workspace payments analytics:
 * animated KPI strip (gross, net, refunded, success rate, txn count),
 * hand-built animated SVG volume trend (motion.path pathLength 0→1,
 * spring bars, 14d/30d toggle that re-animates), status breakdown donut
 * (animated strokeDasharray, hover detail), method split spring bars
 * (UPI/card/netbanking), success-rate gauge (animated arc), and a
 * recent-transactions feed with click→detail local state.
 *
 * Framer-motion throughout: animated KPI counters (formatMoney/formatNumber),
 * pathLength line reveal, spring bars, donut dash, gauge arc, staggered feed,
 * whileHover/whileTap everywhere. All controls/subscriptions cleaned up.
 *
 * Self-contained: inline style={{}} only, mock data only.
 * NO API / react-query / @/features / @/lib/api imports.
 * Aurora Glass dark palette — warm amber/orange only, no purple/blue/teal/cyan.
 * Indian standards: ₹ via formatMoney, DD/MM/YYYY via formatDate.
 */

import {
  useState,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
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
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  ChevronRight,
  Smartphone,
  Landmark,
  Banknote,
  IndianRupee,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text:        '#ffffff' as const,
  dim:         'rgba(255,255,255,0.62)' as const,
  faint:       'rgba(255,255,255,0.38)' as const,
  ghost:       'rgba(255,255,255,0.18)' as const,
  hairline:    'rgba(255,255,255,0.08)' as const,
  accent:      '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim:   'rgba(242,101,34,0.18)' as const,
  success:     '#3ddc97' as const,
  successDim:  'rgba(61,220,151,0.14)' as const,
  danger:      '#ff5c7a' as const,
  dangerDim:   'rgba(255,92,122,0.14)' as const,
  warning:     '#FF8A4B' as const,
  warningDim:  'rgba(255,138,75,0.14)' as const,
  neutral:     'rgba(255,255,255,0.28)' as const,
  neutralDim:  'rgba(255,255,255,0.08)' as const,
  glass: {
    background:           'rgba(255,255,255,0.05)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius:         16,
  } as CSSProperties,
  glassCard: {
    background:           'rgba(255,255,255,0.055)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRadius:         18,
  } as CSSProperties,
  glassDeep: {
    background:           'rgba(255,255,255,0.08)',
    border:               '1px solid rgba(255,255,255,0.14)',
    backdropFilter:       'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius:         22,
  } as CSSProperties,
  glassTight: {
    background:           'rgba(255,255,255,0.04)',
    border:               '1px solid rgba(255,255,255,0.08)',
    backdropFilter:       'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius:         10,
  } as CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type PayStatus = 'succeeded' | 'pending' | 'failed' | 'refunded';
type PayMethod = 'upi' | 'card' | 'netbanking';

interface Transaction {
  id:        string;
  workspace: string;
  email:     string;
  amount:    number;
  net:       number;
  status:    PayStatus;
  method:    PayMethod;
  plan:      string;
  date:      string; // ISO
}

interface DayVolume {
  date:  string; // ISO
  gross: number;
  count: number;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

// 30 days of daily payment volume (₹, realistic SaaS ramp, some weekday bumps)
const VOLUME_30D: DayVolume[] = [
  { date: '2026-05-02', gross: 28400,  count: 8  },
  { date: '2026-05-03', gross: 31200,  count: 9  },
  { date: '2026-05-04', gross: 19800,  count: 5  },
  { date: '2026-05-05', gross: 14300,  count: 4  },
  { date: '2026-05-06', gross: 36700,  count: 11 },
  { date: '2026-05-07', gross: 42100,  count: 13 },
  { date: '2026-05-08', gross: 38500,  count: 12 },
  { date: '2026-05-09', gross: 29600,  count: 9  },
  { date: '2026-05-10', gross: 33400,  count: 10 },
  { date: '2026-05-11', gross: 17200,  count: 5  },
  { date: '2026-05-12', gross: 12900,  count: 3  },
  { date: '2026-05-13', gross: 44800,  count: 14 },
  { date: '2026-05-14', gross: 51200,  count: 16 },
  { date: '2026-05-15', gross: 47600,  count: 15 },
  { date: '2026-05-16', gross: 39300,  count: 12 },
  { date: '2026-05-17', gross: 45100,  count: 14 },
  { date: '2026-05-18', gross: 21400,  count: 6  },
  { date: '2026-05-19', gross: 18700,  count: 5  },
  { date: '2026-05-20', gross: 53800,  count: 17 },
  { date: '2026-05-21', gross: 61400,  count: 19 },
  { date: '2026-05-22', gross: 58200,  count: 18 },
  { date: '2026-05-23', gross: 49700,  count: 15 },
  { date: '2026-05-24', gross: 55100,  count: 17 },
  { date: '2026-05-25', gross: 27300,  count: 8  },
  { date: '2026-05-26', gross: 22100,  count: 7  },
  { date: '2026-05-27', gross: 63800,  count: 20 },
  { date: '2026-05-28', gross: 72100,  count: 23 },
  { date: '2026-05-29', gross: 68400,  count: 21 },
  { date: '2026-05-30', gross: 59600,  count: 19 },
  { date: '2026-05-31', gross: 74300,  count: 24 },
];

// Status breakdown counts
const STATUS_COUNTS: Record<PayStatus, number> = {
  succeeded: 241,
  pending:    18,
  failed:     11,
  refunded:    8,
};

// Method split (UPI heaviest)
const METHOD_COUNTS: Record<PayMethod, number> = {
  upi:        157,
  card:        74,
  netbanking:  47,
};

// Recent 8 transactions
const RECENT_TXN: Transaction[] = [
  {
    id: 'txn_001', workspace: 'BrightWave Media',   email: 'alex@brightwave.io',
    amount: 29900, net: 28200, status: 'succeeded', method: 'upi',        plan: 'Agency',   date: '2026-05-31T14:23:00Z',
  },
  {
    id: 'txn_002', workspace: 'Velocity Reach',     email: 'priya@velocityreach.in',
    amount: 14900, net: 14100, status: 'succeeded', method: 'card',       plan: 'Pro Plus', date: '2026-05-31T11:07:00Z',
  },
  {
    id: 'txn_003', workspace: 'SendLoop Labs',      email: 'chris@sendloop.co',
    amount: 8900,  net: 0,     status: 'failed',    method: 'card',       plan: 'Pro',      date: '2026-05-31T09:45:00Z',
  },
  {
    id: 'txn_004', workspace: 'InboxForge',         email: 'tomasz@inboxforge.pl',
    amount: 3900,  net: 0,     status: 'pending',   method: 'netbanking', plan: 'Starter',  date: '2026-05-30T22:18:00Z',
  },
  {
    id: 'txn_005', workspace: 'Aufwind GmbH',       email: 'sara@aufwind.de',
    amount: 14900, net: 14100, status: 'succeeded', method: 'upi',        plan: 'Pro Plus', date: '2026-05-30T18:34:00Z',
  },
  {
    id: 'txn_006', workspace: 'Nordlicht Agency',   email: 'lena@nordlicht.agency',
    amount: 14900, net: 14900, status: 'refunded',  method: 'upi',        plan: 'Pro Plus', date: '2026-05-30T15:02:00Z',
  },
  {
    id: 'txn_007', workspace: 'OutreachPilot',      email: 'james@outreachpilot.com',
    amount: 3900,  net: 3700,  status: 'succeeded', method: 'netbanking', plan: 'Starter',  date: '2026-05-29T11:21:00Z',
  },
  {
    id: 'txn_008', workspace: 'DripCraft Studio',   email: 'natasha@dripcraft.io',
    amount: 29900, net: 28200, status: 'succeeded', method: 'upi',        plan: 'Agency',   date: '2026-05-29T08:55:00Z',
  },
];

// ─── Computed KPIs ────────────────────────────────────────────────────────────
const TOTAL_GROSS   = VOLUME_30D.reduce((s, d) => s + d.gross, 0);
const TOTAL_NET     = Math.round(TOTAL_GROSS * 0.946);
const TOTAL_REFUND  = Math.round(TOTAL_GROSS * 0.028);
const TOTAL_TXN     = VOLUME_30D.reduce((s, d) => s + d.count, 0);
const SUCCESS_RATE  = 96.2;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(s: PayStatus): string {
  if (s === 'succeeded') return T.success;
  if (s === 'pending')   return T.warning;
  if (s === 'failed')    return T.danger;
  return T.accent;
}
function statusBg(s: PayStatus): string {
  if (s === 'succeeded') return T.successDim;
  if (s === 'pending')   return T.warningDim;
  if (s === 'failed')    return T.dangerDim;
  return T.accentDim;
}
function statusLabel(s: PayStatus): string {
  if (s === 'succeeded') return 'Succeeded';
  if (s === 'pending')   return 'Pending';
  if (s === 'failed')    return 'Failed';
  return 'Refunded';
}
function statusIcon(s: PayStatus) {
  if (s === 'succeeded') return <CheckCircle2 size={11} />;
  if (s === 'pending')   return <Clock size={11} />;
  if (s === 'failed')    return <XCircle size={11} />;
  return <RotateCcw size={11} />;
}
function methodLabel(m: PayMethod): string {
  if (m === 'upi')        return 'UPI';
  if (m === 'card')       return 'Card';
  return 'Netbanking';
}
function methodIcon(m: PayMethod) {
  if (m === 'upi')        return <Smartphone size={12} />;
  if (m === 'card')       return <CreditCard size={12} />;
  return <Landmark size={12} />;
}
function methodColor(m: PayMethod): string {
  if (m === 'upi')        return T.success;
  if (m === 'card')       return T.accent;
  return T.accentLight;
}

// ─── Animated counter hook ────────────────────────────────────────────────────
function useAnimatedCounter(
  target: number,
  format: (v: number) => string,
): string {
  const mv      = useMotionValue(0);
  const [disp, setDisp] = useState('');
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(mv, target, {
      duration: 1.35,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) {
        setDisp(format(Math.round(latest)));
      },
    });
    return () => { ctrlRef.current?.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return disp || format(0);
}

// ─── SVG line chart helpers ───────────────────────────────────────────────────
const CHART_W = 600;
const CHART_H = 120;
const CHART_PAD_X = 8;
const CHART_PAD_Y = 12;

function buildPath(data: DayVolume[]): string {
  if (data.length === 0) return '';
  const maxV = Math.max(...data.map(d => d.gross));
  const pts = data.map((d, i) => {
    const x = CHART_PAD_X + (i / (data.length - 1)) * (CHART_W - 2 * CHART_PAD_X);
    const y = CHART_PAD_Y + (1 - d.gross / maxV) * (CHART_H - 2 * CHART_PAD_Y);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  // smooth using cubic bezier
  const coords = pts.map(p => {
    const [x, y] = p.split(',').map(Number);
    return { x: x ?? 0, y: y ?? 0 };
  });
  let d = `M ${coords[0]?.x ?? 0} ${coords[0]?.y ?? 0}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    if (!prev || !curr) continue;
    const cpx = prev.x + (curr.x - prev.x) * 0.5;
    d += ` C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`;
  }
  return d;
}

function buildAreaPath(data: DayVolume[]): string {
  if (data.length === 0) return '';
  const linePath = buildPath(data);
  const lastIdx = data.length - 1;
  const lastX = CHART_PAD_X + (lastIdx / Math.max(lastIdx, 1)) * (CHART_W - 2 * CHART_PAD_X);
  return `${linePath} L ${lastX} ${CHART_H} L ${CHART_PAD_X} ${CHART_H} Z`;
}

// ─── Donut helpers ────────────────────────────────────────────────────────────
const DONUT_R  = 52;
const DONUT_CX = 70;
const DONUT_CY = 70;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

function donutArcProps(startFrac: number, frac: number): { strokeDasharray: string; strokeDashoffset: number } {
  const dash   = frac * DONUT_CIRC;
  const gap    = DONUT_CIRC - dash;
  const offset = DONUT_CIRC * (1 - startFrac);
  return { strokeDasharray: `${dash.toFixed(2)} ${gap.toFixed(2)}`, strokeDashoffset: offset };
}

// ─── Gauge helpers ────────────────────────────────────────────────────────────
const GAUGE_R  = 60;
const GAUGE_CX = 75;
const GAUGE_CY = 75;
// arc from 200deg to 340deg (140deg sweep = bottom gap)
const GAP_DEG  = 80; // degrees cut from bottom
const START_DEG = 90 + GAP_DEG / 2;
const SWEEP_DEG = 360 - GAP_DEG;

function polarToXY(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function gaugeArcD(pct: number): string {
  const endDeg = START_DEG + (pct / 100) * SWEEP_DEG;
  const start  = polarToXY(GAUGE_CX, GAUGE_CY, GAUGE_R, START_DEG);
  const end    = polarToXY(GAUGE_CX, GAUGE_CY, GAUGE_R, endDeg);
  const large  = (pct / 100) * SWEEP_DEG > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${GAUGE_R} ${GAUGE_R} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function gaugeTrackD(): string {
  const start = polarToXY(GAUGE_CX, GAUGE_CY, GAUGE_R, START_DEG);
  const end   = polarToXY(GAUGE_CX, GAUGE_CY, GAUGE_R, START_DEG + SWEEP_DEG);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${GAUGE_R} ${GAUGE_R} 0 1 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

// ─── Variants ─────────────────────────────────────────────────────────────────
const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: (d: number) => ({
    opacity: 1, y: 0,
    transition: { delay: d, duration: 0.42, ease: [0.22, 1, 0.36, 1] },
  }),
};

const staggerRow: Variants = {
  hidden:  { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.06, duration: 0.36, ease: [0.22, 1, 0.36, 1] },
  }),
};

const detailSlide: Variants = {
  hidden:  { opacity: 0, height: 0, overflow: 'hidden' as const },
  visible: { opacity: 1, height: 'auto', overflow: 'hidden' as const, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, height: 0, overflow: 'hidden' as const, transition: { duration: 0.2 } },
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, color, delay,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      custom={delay}
      whileHover={{ y: -4, scale: 1.025, transition: { duration: 0.2 } }}
      style={{
        ...T.glassCard,
        padding:  '20px 24px',
        flex:     '1 1 170px',
        minWidth: 150,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <motion.div
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse 70% 60% at 10% 15%, ${color}25 0%, transparent 70%)`,
          pointerEvents: 'none',
          borderRadius: 'inherit',
        }}
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 9,
            background: `${color}20`, color,
          }}>
            {icon}
          </span>
          <span style={{ fontSize: 11, color: T.dim, fontWeight: 500, letterSpacing: '0.03em' }}>{label}</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-0.025em', lineHeight: 1 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 11, color: T.faint, marginTop: 5 }}>{sub}</div>}
      </div>
    </motion.div>
  );
}

// ─── Volume trend chart ───────────────────────────────────────────────────────
function VolumeTrend({ range }: { range: 14 | 30 }) {
  const data       = range === 14 ? VOLUME_30D.slice(-14) : VOLUME_30D;
  const linePath   = buildPath(data);
  const areaPath   = buildAreaPath(data);
  const maxV       = Math.max(...data.map(d => d.gross));
  const [tick, setTick] = useState(0);

  // Re-trigger path animation when range changes
  useEffect(() => { setTick(t => t + 1); }, [range]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        preserveAspectRatio="none"
      >
        {/* area fill */}
        <defs>
          <linearGradient id="py2-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={T.accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={T.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          key={`area-${tick}`}
          d={areaPath}
          fill="url(#py2-area-grad)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.1 }}
        />

        {/* line */}
        <motion.path
          key={`line-${tick}`}
          d={linePath}
          fill="none"
          stroke={`url(#py2-line-grad)`}
          strokeWidth={2.5}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0.7 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ pathLength: { duration: 1.1, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.3 } }}
        />
        <defs>
          <linearGradient id="py2-line-grad" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor={T.accentLight} />
            <stop offset="100%" stopColor={T.accent} />
          </linearGradient>
        </defs>

        {/* day bars (spring, subtle) */}
        {data.map((d, i) => {
          const x = CHART_PAD_X + (i / (data.length - 1)) * (CHART_W - 2 * CHART_PAD_X);
          const barH = ((d.gross / maxV) * (CHART_H - 2 * CHART_PAD_Y)) * 0.32;
          return (
            <motion.rect
              key={`${d.date}-${tick}`}
              x={x - 4}
              y={CHART_H - barH}
              width={8}
              rx={3}
              height={0}
              fill={T.accent}
              fillOpacity={0.18}
              animate={{ height: barH, y: CHART_H - barH }}
              transition={{ type: 'spring', stiffness: 90, damping: 14, delay: 0.05 + i * 0.025 }}
            />
          );
        })}

        {/* dot at last point */}
        {(() => {
          const lastD = data[data.length - 1];
          if (!lastD) return null;
          const maxVal = Math.max(...data.map(d => d.gross));
          const lx = CHART_PAD_X + ((data.length - 1) / (data.length - 1)) * (CHART_W - 2 * CHART_PAD_X);
          const ly = CHART_PAD_Y + (1 - lastD.gross / maxVal) * (CHART_H - 2 * CHART_PAD_Y);
          return (
            <motion.circle
              key={`dot-${tick}`}
              cx={lx}
              cy={ly}
              r={5}
              fill={T.accent}
              stroke="#fff"
              strokeWidth={2}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.1, type: 'spring', stiffness: 300, damping: 20 }}
            />
          );
        })()}
      </svg>

      {/* x-axis labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingLeft: CHART_PAD_X, paddingRight: CHART_PAD_X }}>
        {[0, Math.floor(data.length / 2), data.length - 1].map(i => {
          const item = data[i];
          if (!item) return null;
          return (
            <span key={i} style={{ fontSize: 10, color: T.faint }}>{formatDate(item.date)}</span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────
const STATUS_ORDER: PayStatus[] = ['succeeded', 'pending', 'failed', 'refunded'];

function StatusDonut({ hoveredStatus, onHover }: {
  hoveredStatus: PayStatus | null;
  onHover: (s: PayStatus | null) => void;
}) {
  const total = Object.values(STATUS_COUNTS).reduce((a, b) => a + b, 0);
  const fracs = STATUS_ORDER.map(s => STATUS_COUNTS[s] / total);

  // cumulative start fractions
  let cumulative = 0;
  const segments = STATUS_ORDER.map((s, i) => {
    const frac  = fracs[i] ?? 0;
    const start = cumulative;
    cumulative += frac;
    return { s, frac, start };
  });

  return (
    <svg viewBox="0 0 140 140" style={{ width: 140, height: 140, flexShrink: 0 }}>
      {/* track */}
      <circle
        cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={14}
      />

      {/* animated segments */}
      {segments.map(({ s, frac, start }) => {
        const { strokeDasharray } = donutArcProps(start, frac);
        const offset = DONUT_CIRC * (1 - start);
        const isHovered = hoveredStatus === s;
        const color = statusColor(s);
        return (
          <motion.circle
            key={s}
            cx={DONUT_CX}
            cy={DONUT_CY}
            r={DONUT_R}
            fill="none"
            stroke={color}
            strokeWidth={isHovered ? 17 : 14}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            style={{ cursor: 'pointer', transformOrigin: `${DONUT_CX}px ${DONUT_CY}px`, rotate: '-90deg' }}
            initial={{ strokeDasharray: `0 ${DONUT_CIRC}` }}
            animate={{
              strokeDasharray,
              strokeWidth: isHovered ? 17 : 14,
              opacity: hoveredStatus && !isHovered ? 0.35 : 1,
            }}
            transition={{
              strokeDasharray: { duration: 1.1, ease: [0.22, 1, 0.36, 1] },
              strokeWidth:     { type: 'spring', stiffness: 300, damping: 24 },
              opacity:         { duration: 0.2 },
            }}
            onMouseEnter={() => onHover(s)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}

      {/* center text */}
      <text x={DONUT_CX} y={DONUT_CY - 6} textAnchor="middle" fill="#fff" fontSize={20} fontWeight={800}>
        {formatNumber(total)}
      </text>
      <text x={DONUT_CX} y={DONUT_CY + 12} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={9}>
        TRANSACTIONS
      </text>
    </svg>
  );
}

// ─── Success gauge ────────────────────────────────────────────────────────────
function SuccessGauge({ pct }: { pct: number }) {
  const [animPct, setAnimPct] = useState(0);
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);
  const mv = useMotionValue(0);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(mv, pct, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setAnimPct(v),
    });
    return () => { ctrlRef.current?.stop(); };
  }, [pct]); // eslint-disable-line react-hooks/exhaustive-deps

  const trackD = gaugeTrackD();
  const arcD   = gaugeArcD(animPct);
  const color  = animPct >= 95 ? T.success : animPct >= 85 ? T.warning : T.danger;

  return (
    <svg viewBox="0 0 150 150" style={{ width: 150, height: 150, flexShrink: 0 }}>
      <defs>
        <linearGradient id="py2-gauge-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"   stopColor={T.accentLight} />
          <stop offset="100%" stopColor={T.success} />
        </linearGradient>
      </defs>
      {/* track */}
      <path d={trackD} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={12} strokeLinecap="round" />
      {/* arc */}
      <path d={arcD}   fill="none" stroke="url(#py2-gauge-grad)"  strokeWidth={12} strokeLinecap="round" />
      {/* glow */}
      <path d={arcD}   fill="none" stroke={color} strokeWidth={20} strokeLinecap="round" strokeOpacity={0.12} />

      {/* pct label */}
      <text x={GAUGE_CX} y={GAUGE_CY + 6} textAnchor="middle" fill={color} fontSize={26} fontWeight={800}>
        {animPct.toFixed(1)}%
      </text>
      <text x={GAUGE_CX} y={GAUGE_CY + 24} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={9} letterSpacing={1}>
        SUCCESS RATE
      </text>
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmPayPY2Pulse() {
  const [range,     setRange]     = useState<14 | 30>(30);
  const [hovStat,   setHovStat]   = useState<PayStatus | null>(null);
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const totalTxn    = TOTAL_TXN;
  const successRate = SUCCESS_RATE;

  // Animated KPI counters
  const grossDisp  = useAnimatedCounter(TOTAL_GROSS,  (v) => formatMoney(v));
  const netDisp    = useAnimatedCounter(TOTAL_NET,    (v) => formatMoney(v));
  const refDisp    = useAnimatedCounter(TOTAL_REFUND, (v) => formatMoney(v));
  const txnDisp    = useAnimatedCounter(totalTxn,     (v) => formatNumber(v));
  const rateDisp   = useAnimatedCounter(successRate * 10, (v) => `${(v / 10).toFixed(1)}%`);

  // Method totals
  const methodTotal = Object.values(METHOD_COUNTS).reduce((a, b) => a + b, 0);
  const statusTotal = Object.values(STATUS_COUNTS).reduce((a, b) => a + b, 0);

  return (
    <div style={{
      minHeight: '100vh',
      color:     T.text,
      fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
      padding:    '32px 28px',
      position:   'relative',
      background: 'transparent',
    }}>

      {/* ambient top gradient */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 160,
        background: `linear-gradient(to bottom, rgba(242,101,34,0.12) 0%, transparent 100%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />
      {/* bottom glow */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: 700, height: 220,
        background: `radial-gradient(ellipse 80% 50% at 50% 100%, rgba(242,101,34,0.11) 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── PAGE HEADER ────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp} initial="hidden" animate="visible" custom={0}
        style={{ marginBottom: 28, position: 'relative', zIndex: 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
          <motion.div
            style={{
              width: 44, height: 44, borderRadius: 14,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 24px rgba(242,101,34,0.35)`,
            }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Activity size={22} color="#fff" />
          </motion.div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', color: T.text }}>
              Payments Pulse
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: T.faint }}>
              Cross-workspace payments analytics · super admin
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, position: 'relative', zIndex: 1 }}>
        <KpiCard icon={<IndianRupee size={15} />} label="Gross Volume"   value={grossDisp} sub="30-day total"        color={T.accent}   delay={0.07} />
        <KpiCard icon={<Banknote    size={15} />} label="Net Revenue"    value={netDisp}   sub="after fees"          color={T.success}  delay={0.13} />
        <KpiCard icon={<RotateCcw  size={15} />} label="Refunded"       value={refDisp}   sub="2.8% of gross"       color={T.warning}  delay={0.19} />
        <KpiCard icon={<TrendingUp size={15} />} label="Success Rate"   value={rateDisp}  sub="last 30 days"        color={T.success}  delay={0.25} />
        <KpiCard icon={<Activity   size={15} />} label="Transactions"   value={txnDisp}   sub="all workspaces"      color={T.accentLight} delay={0.31} />
      </div>

      {/* ── VOLUME TREND ───────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp} initial="hidden" animate="visible" custom={0.35}
        style={{ ...T.glassCard, padding: '22px 24px', marginBottom: 20, position: 'relative', zIndex: 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Payment Volume</div>
            <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>Daily gross receipts (₹)</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([14, 30] as const).map(r => (
              <motion.button
                key={r}
                onClick={() => setRange(r)}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding:     '5px 13px',
                  borderRadius: 8,
                  fontSize:    12,
                  fontWeight:  700,
                  cursor:      'pointer',
                  background:  range === r ? T.accentDim : 'transparent',
                  border:      range === r ? `1px solid ${T.accentLight}55` : `1px solid ${T.hairline}`,
                  color:       range === r ? T.accentLight : T.faint,
                }}
              >
                {r}d
              </motion.button>
            ))}
          </div>
        </div>
        <VolumeTrend range={range} />
      </motion.div>

      {/* ── LOWER ROW: Donut + Method Split + Gauge ────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 20, position: 'relative', zIndex: 1 }}>

        {/* STATUS DONUT */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={0.42}
          style={{ ...T.glassCard, padding: '22px 24px' }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Status Breakdown</div>
          <div style={{ fontSize: 11, color: T.faint, marginBottom: 16 }}>All transactions by outcome</div>

          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusDonut hoveredStatus={hovStat} onHover={setHovStat} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 120 }}>
              {STATUS_ORDER.map(s => {
                const cnt  = STATUS_COUNTS[s];
                const frac = cnt / statusTotal;
                const col  = statusColor(s);
                const isHov = hovStat === s;
                return (
                  <motion.div
                    key={s}
                    onMouseEnter={() => setHovStat(s)}
                    onMouseLeave={() => setHovStat(null)}
                    animate={{ opacity: hovStat && !isHov ? 0.4 : 1, x: isHov ? 4 : 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ cursor: 'default' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: isHov ? col : T.dim, fontWeight: isHov ? 700 : 500 }}>
                        <span style={{ color: col }}>{statusIcon(s)}</span>
                        {statusLabel(s)}
                      </span>
                      <span style={{ fontSize: 11, color: col, fontWeight: 700 }}>{formatNumber(cnt)}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: T.hairline, overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${frac * 100}%` }}
                        transition={{ type: 'spring', stiffness: 70, damping: 12, delay: 0.5 }}
                        style={{ height: '100%', borderRadius: 99, background: col }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* hover detail pill */}
          <AnimatePresence>
            {hovStat && (
              <motion.div
                key={hovStat}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
                style={{
                  marginTop: 14,
                  padding: '8px 14px',
                  borderRadius: 10,
                  background: statusBg(hovStat),
                  border: `1px solid ${statusColor(hovStat)}33`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: statusColor(hovStat),
                  fontWeight: 600,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {statusIcon(hovStat)}
                  {statusLabel(hovStat)}
                </span>
                <span>
                  {formatNumber(STATUS_COUNTS[hovStat])} txns ·{' '}
                  {((STATUS_COUNTS[hovStat] / statusTotal) * 100).toFixed(1)}%
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* METHOD SPLIT */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={0.47}
          style={{ ...T.glassCard, padding: '22px 24px' }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Method Split</div>
          <div style={{ fontSize: 11, color: T.faint, marginBottom: 20 }}>UPI · Card · Netbanking</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {(['upi', 'card', 'netbanking'] as PayMethod[]).map((m, idx) => {
              const cnt  = METHOD_COUNTS[m];
              const pct  = (cnt / methodTotal) * 100;
              const col  = methodColor(m);
              return (
                <div key={m}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: T.dim }}>
                      <span style={{ color: col }}>{methodIcon(m)}</span>
                      {methodLabel(m)}
                    </div>
                    <span style={{ fontSize: 12, color: col, fontWeight: 800 }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 10, borderRadius: 99, background: T.hairline, overflow: 'hidden', position: 'relative' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ type: 'spring', stiffness: 65, damping: 12, delay: 0.45 + idx * 0.1 }}
                      style={{
                        height: '100%',
                        borderRadius: 99,
                        background: `linear-gradient(90deg, ${col}, ${col}99)`,
                        boxShadow: `0 0 14px ${col}44`,
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: T.faint }}>{formatNumber(cnt)} transactions</span>
                    <span style={{ fontSize: 10, color: T.faint }}>of {formatNumber(methodTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* SUCCESS GAUGE */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={0.52}
          style={{ ...T.glassCard, padding: '22px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2, textAlign: 'center' }}>Success Rate</div>
          <div style={{ fontSize: 11, color: T.faint, marginBottom: 18, textAlign: 'center' }}>30-day payment success</div>

          <SuccessGauge pct={SUCCESS_RATE} />

          <div style={{ marginTop: 16, display: 'flex', gap: 16, justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.success }}>
                {formatNumber(STATUS_COUNTS.succeeded)}
              </div>
              <div style={{ fontSize: 10, color: T.faint }}>Succeeded</div>
            </div>
            <div style={{ width: 1, background: T.hairline }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.danger }}>
                {formatNumber(STATUS_COUNTS.failed)}
              </div>
              <div style={{ fontSize: 10, color: T.faint }}>Failed</div>
            </div>
            <div style={{ width: 1, background: T.hairline }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.warning }}>
                {formatNumber(STATUS_COUNTS.pending)}
              </div>
              <div style={{ fontSize: 10, color: T.faint }}>Pending</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── RECENT TRANSACTIONS ─────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp} initial="hidden" animate="visible" custom={0.56}
        style={{ ...T.glassCard, overflow: 'hidden', position: 'relative', zIndex: 1 }}
      >
        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Recent Transactions</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>Latest 8 · click to expand</div>
            </div>
            <motion.div
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: T.accentLight, fontWeight: 600,
                padding: '5px 10px', borderRadius: 8,
                background: T.accentDim, border: `1px solid ${T.accentLight}33`,
              }}
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <motion.div
                style={{ width: 6, height: 6, borderRadius: '50%', background: T.success }}
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              Live
            </motion.div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {RECENT_TXN.map((txn, idx) => {
            const isOpen = expanded === txn.id;
            const col    = statusColor(txn.status);
            return (
              <motion.div
                key={txn.id}
                variants={staggerRow}
                initial="hidden"
                animate="visible"
                custom={idx}
                style={{ borderBottom: idx < RECENT_TXN.length - 1 ? `1px solid ${T.hairline}` : 'none' }}
              >
                {/* main row */}
                <motion.div
                  onClick={() => setExpanded(isOpen ? null : txn.id)}
                  whileHover={{ backgroundColor: 'rgba(242,101,34,0.05)' }}
                  whileTap={{ scale: 0.995 }}
                  style={{
                    padding:    '14px 22px',
                    display:    'flex',
                    alignItems: 'center',
                    gap:        14,
                    cursor:     'pointer',
                    userSelect: 'none',
                  }}
                >
                  {/* workspace avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                    background: `linear-gradient(135deg, ${T.accent}99, ${T.accentLight}77)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: '#fff',
                  }}>
                    {txn.workspace[0]}
                  </div>

                  {/* workspace + plan */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {txn.workspace}
                    </div>
                    <div style={{ fontSize: 11, color: T.faint }}>{txn.plan} · {txn.email}</div>
                  </div>

                  {/* method */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: methodColor(txn.method), fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {methodIcon(txn.method)}
                    {methodLabel(txn.method)}
                  </div>

                  {/* amount */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: col }}>
                      {formatMoney(txn.amount)}
                    </div>
                    <div style={{ fontSize: 10, color: T.faint }}>{formatDate(txn.date)}</div>
                  </div>

                  {/* status chip */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 9px', borderRadius: 20,
                    background: statusBg(txn.status),
                    border: `1px solid ${col}33`,
                    fontSize: 10, fontWeight: 700, color: col,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {statusIcon(txn.status)}
                    {statusLabel(txn.status)}
                  </div>

                  {/* chevron */}
                  <motion.div
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    style={{ color: T.faint, flexShrink: 0, display: 'flex' }}
                  >
                    <ChevronRight size={14} />
                  </motion.div>
                </motion.div>

                {/* expanded detail */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      key={`detail-${txn.id}`}
                      variants={detailSlide}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <div style={{
                        padding: '14px 22px 16px 72px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        gap: 10,
                        background: 'rgba(255,255,255,0.025)',
                        borderTop: `1px solid ${T.hairline}`,
                      }}>
                        {[
                          { label: 'Transaction ID', value: txn.id },
                          { label: 'Gross Amount',   value: formatMoney(txn.amount) },
                          { label: 'Net Amount',     value: txn.net > 0 ? formatMoney(txn.net) : '—' },
                          { label: 'Method',         value: methodLabel(txn.method) },
                          { label: 'Status',         value: statusLabel(txn.status) },
                          { label: 'Date',           value: formatDate(txn.date) },
                          { label: 'Plan',           value: txn.plan },
                          { label: 'Email',          value: txn.email },
                        ].map(f => (
                          <div key={f.label} style={{ ...T.glassTight, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, color: T.faint, marginBottom: 3, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{f.label}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, wordBreak: 'break-all' }}>{f.value}</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* footer */}
        <div style={{
          padding: '12px 22px',
          borderTop: `1px solid ${T.hairline}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 12, color: T.faint }}>
            Showing 8 most recent transactions · All workspaces
          </span>
          <motion.div
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.accentLight, cursor: 'pointer', fontWeight: 600 }}
            whileHover={{ x: 3 }}
          >
            View all <ArrowUpRight size={12} />
          </motion.div>
        </div>
      </motion.div>

      {/* Method volume summary footer */}
      <motion.div
        variants={fadeUp} initial="hidden" animate="visible" custom={0.62}
        style={{ ...T.glass, padding: '16px 22px', marginTop: 16, position: 'relative', zIndex: 1 }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: T.faint, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            30-Day Snapshot
          </div>
          {[
            { label: 'Gross',        value: formatMoney(TOTAL_GROSS),   color: T.accent },
            { label: 'Net',          value: formatMoney(TOTAL_NET),     color: T.success },
            { label: 'Refunded',     value: formatMoney(TOTAL_REFUND),  color: T.warning },
            { label: 'Transactions', value: formatNumber(TOTAL_TXN),    color: T.accentLight },
            { label: 'Success Rate', value: `${SUCCESS_RATE}%`,         color: T.success },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: T.faint, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{item.label}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </motion.div>

    </div>
  );
}
