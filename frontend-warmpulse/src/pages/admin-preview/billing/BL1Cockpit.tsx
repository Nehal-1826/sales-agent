/**
 * Admin Billing Design Candidate: BL1 Revenue Cockpit
 *
 * "Revenue Cockpit" — a premium super-admin cross-workspace view of platform
 * revenue + subscriptions: MRR/ARR, active subscriptions, ARPU, churn %,
 * failed payments, 12-month revenue trend, MRR-by-plan split, and a staggered
 * recent-payments feed with failed-payment alert callout.
 *
 * Animation inventory:
 * - Animated counters (useMotionValue + animate → .on('change') → setState, cleanup)
 * - Hand-built animated SVG: motion.path pathLength 0→1 for MRR trend; range toggle re-animates
 * - Spring bars for MRR-by-plan breakdown; animated donut ring for plan split
 * - Staggered entrance via container Variants + staggerChildren
 * - whileHover / whileTap on cards, rows, and buttons
 * - AnimatePresence for payment detail expand + alert toast + range-switch re-mount
 * - GPU-friendly (transform + opacity only for hover/tap)
 * - Cleanup: animate() controls stopped, mv.on() unsubscribed, rAF cancelled on unmount
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={}. Mock data only.
 * Warm Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. NO purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useEffect,
  useState,
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
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  ChevronDown,
  BarChart2,
  Activity,
  Building2,
  ArrowUpRight,
  Zap,
  X,
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
  gold: '#c89b3c' as const,
  goldDim: 'rgba(200,155,60,0.13)' as const,
};

// Plan palette — warm/amber gradient steps only
const PLAN_COLORS: Record<string, string> = {
  Free: 'rgba(255,255,255,0.28)',
  Starter: '#e8a838',
  Pro: '#F26522',
  'Pro Plus': '#FF8A4B',
  Agency: '#ff5c7a',
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

type Range = '6m' | '12m';

// 12-month MRR trend (realistic ramp Jan→Dec for a SaaS)
const MRR_TREND_12M = [
  { label: 'Jan', mrr: 9200 },
  { label: 'Feb', mrr: 11400 },
  { label: 'Mar', mrr: 13100 },
  { label: 'Apr', mrr: 15600 },
  { label: 'May', mrr: 17200 },
  { label: 'Jun', mrr: 18900 },
  { label: 'Jul', mrr: 19800 },
  { label: 'Aug', mrr: 20400 },
  { label: 'Sep', mrr: 21600 },
  { label: 'Oct', mrr: 22900 },
  { label: 'Nov', mrr: 23700 },
  { label: 'Dec', mrr: 24380 },
];

const MRR_TREND_6M = MRR_TREND_12M.slice(6);

// MRR by plan
const PLAN_MRR = [
  { plan: 'Starter',  mrr: 3190,  subs: 110 },
  { plan: 'Pro',      mrr: 7140,  subs: 84  },
  { plan: 'Pro Plus', mrr: 8540,  subs: 61  },
  { plan: 'Agency',   mrr: 5510,  subs: 28  },
];
const TOTAL_MRR = PLAN_MRR.reduce((a, p) => a + p.mrr, 0); // 24380

// KPI values
const KPI_MRR    = 24380;
const KPI_ARR    = KPI_MRR * 12;
const KPI_SUBS   = 430;   // free + paid active
const KPI_ARPU   = Math.round(KPI_MRR / 283); // paid subs ~283
const KPI_CHURN  = 2.1;   // %
const KPI_FAILED = 7;     // failed payments

// Recent payments feed
type PayStatus = 'succeeded' | 'pending' | 'failed' | 'refunded';

interface Payment {
  id: string;
  workspace: string;
  email: string;
  plan: string;
  amount: number;
  status: PayStatus;
  ts: string;
  hue: number; // warm hue for avatar gradient
}

const PAYMENTS: Payment[] = [
  { id: 'p1',  workspace: 'Acme Corp',    email: 'alex@acme.co',           plan: 'Pro Plus', amount: 140, status: 'succeeded', ts: '2 min ago',    hue: 28  },
  { id: 'p2',  workspace: 'Beacon App',   email: 'tk@beacon.app',          plan: 'Agency',   amount: 199, status: 'succeeded', ts: '11 min ago',   hue: 20  },
  { id: 'p3',  workspace: 'Northwind',    email: 'priya@northwind.io',     plan: 'Pro',       amount: 85,  status: 'pending',   ts: '34 min ago',   hue: 42  },
  { id: 'p4',  workspace: 'Oxen Studio',  email: 'el@oxenstudio.com',      plan: 'Starter',  amount: 29,  status: 'failed',    ts: '1 hr ago',     hue: 15  },
  { id: 'p5',  workspace: 'Kavach',       email: 'rk@kavach.co.in',        plan: 'Starter',  amount: 29,  status: 'succeeded', ts: '2 hr ago',     hue: 36  },
  { id: 'p6',  workspace: 'Vendio',       email: 'sofia@vendio.io',        plan: 'Pro',       amount: 85,  status: 'succeeded', ts: '3 hr ago',     hue: 22  },
  { id: 'p7',  workspace: 'Hibou',        email: 'mei@hibou.co',           plan: 'Agency',   amount: 199, status: 'refunded',  ts: '5 hr ago',     hue: 10  },
  { id: 'p8',  workspace: 'Lumen Labs',   email: 'marcus@lumenlabs.dev',   plan: 'Pro Plus', amount: 140, status: 'succeeded', ts: 'yesterday',    hue: 30  },
];

const FAILED_PAYMENTS = PAYMENTS.filter((p) => p.status === 'failed');

// ─── Utility ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n}`;
}

function fmtLarge(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── Status helpers ──────────────────────────────────────────────────────────

function statusColor(s: PayStatus): string {
  if (s === 'succeeded') return T.success;
  if (s === 'pending') return T.warning;
  return T.danger;
}

function statusBg(s: PayStatus): string {
  if (s === 'succeeded') return T.successDim;
  if (s === 'pending') return T.warningDim;
  return T.dangerDim;
}

// ─── Animated counter hook ───────────────────────────────────────────────────

function useAnimatedCounter(
  target: number,
  options?: { decimals?: number; prefix?: string; suffix?: string; duration?: number }
): string {
  const { decimals = 0, prefix = '', suffix = '', duration = 1.4 } = options ?? {};
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(`${prefix}0${suffix}`);

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = mv.on('change', (v) => {
      const rounded = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
      setDisplay(`${prefix}${rounded}${suffix}`);
    });
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [target, decimals, prefix, suffix, duration, mv]);

  return display;
}

// ─── Framer Variants ─────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function WorkspaceAvatar({ name, hue }: { name: string; hue: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: `linear-gradient(135deg, hsl(${hue} 72% 54%), hsl(${hue + 20} 65% 44%))`,
        fontSize: 11,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
        letterSpacing: '0.04em',
      }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

interface StatusChipProps {
  status: PayStatus;
}
function StatusChip({ status }: StatusChipProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: statusColor(status),
        background: statusBg(status),
        border: `1px solid ${statusColor(status)}44`,
        whiteSpace: 'nowrap',
      }}
    >
      {status === 'succeeded' && <CheckCircle2 size={9} strokeWidth={2.5} />}
      {status === 'failed' && <AlertTriangle size={9} strokeWidth={2.5} />}
      {status === 'refunded' && <RefreshCw size={9} strokeWidth={2.5} />}
      {status}
    </span>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  delta: string;
  up: boolean | null;
  icon: typeof DollarSign;
  accent?: string;
  accentDim?: string;
}

function KpiCard({ label, value, delta, up, icon: Icon, accent, accentDim }: KpiCardProps) {
  const col = accent ?? T.accent;
  const bg = accentDim ?? 'rgba(242,101,34,0.10)';
  return (
    <motion.div
      variants={fadeUpVariants}
      whileHover={{ scale: 1.025, y: -2 }}
      whileTap={{ scale: 0.98 }}
      style={{
        ...glass({ borderRadius: 14 }),
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: 'default',
        flex: '1 1 0',
        minWidth: 130,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={MICRO}>{label}</span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={13} strokeWidth={2.2} color={col} />
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      {up !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            color: up ? T.success : T.danger,
          }}
        >
          {up ? <TrendingUp size={11} strokeWidth={2.2} /> : <TrendingDown size={11} strokeWidth={2.2} />}
          {delta}
        </div>
      )}
    </motion.div>
  );
}

// ─── MRR Trend Chart ─────────────────────────────────────────────────────────

interface TrendChartProps {
  range: Range;
}

function TrendChart({ range }: TrendChartProps) {
  const data = range === '12m' ? MRR_TREND_12M : MRR_TREND_6M;
  const W = 560;
  const H = 160;
  const PAD = { top: 18, right: 16, bottom: 32, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxMrr = Math.max(...data.map((d) => d.mrr));
  const minMrr = Math.min(...data.map((d) => d.mrr)) * 0.85;
  const range_ = maxMrr - minMrr;

  const toX = (i: number) => PAD.left + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH - ((v - minMrr) / range_) * chartH;

  const linePoints = data.map((d, i) => `${toX(i)},${toY(d.mrr)}`).join(' ');
  const firstPt = data[0];
  const lastPt = data[data.length - 1];
  const areaPath =
    `M ${PAD.left},${PAD.top + chartH} ` +
    data.map((d, i) => `L ${toX(i)},${toY(d.mrr)}`).join(' ') +
    ` L ${toX(data.length - 1)},${PAD.top + chartH} Z`;

  // Y-axis ticks
  const yTicks = [minMrr, (minMrr + maxMrr) / 2, maxMrr];

  // Hover state
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const relX = (e.clientX - rect.left) * (W / rect.width) - PAD.left;
      const step = chartW / (data.length - 1);
      const idx = Math.max(0, Math.min(data.length - 1, Math.round(relX / step)));
      setHovIdx(idx);
    },
    [data.length, chartW, PAD.left, W]
  );

  const gradId = `mrr-area-${range}`;
  const lineId = `mrr-line-${range}`;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 160, overflow: 'visible', display: 'block' }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={T.accent} stopOpacity="0.01" />
          </linearGradient>
          <filter id="mrr-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t) => (
          <line
            key={t}
            x1={PAD.left}
            y1={toY(t)}
            x2={W - PAD.right}
            y2={toY(t)}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((t) => (
          <text
            key={t}
            x={PAD.left - 6}
            y={toY(t) + 4}
            textAnchor="end"
            fill="rgba(255,255,255,0.35)"
            fontSize={9}
            fontFamily="inherit"
          >
            {fmtCurrency(t)}
          </text>
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => (
          <text
            key={d.label}
            x={toX(i)}
            y={H - 6}
            textAnchor="middle"
            fill={hovIdx === i ? T.accentHi : 'rgba(255,255,255,0.35)'}
            fontSize={9}
            fontFamily="inherit"
            style={{ transition: 'fill 0.15s' }}
          >
            {d.label}
          </text>
        ))}

        {/* Animated area fill */}
        <AnimatePresence mode="wait">
          <motion.path
            key={`area-${range}`}
            d={areaPath}
            fill={`url(#${gradId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          />
        </AnimatePresence>

        {/* Animated line — pathLength trick */}
        <AnimatePresence mode="wait">
          <motion.polyline
            key={`line-${lineId}`}
            points={linePoints}
            fill="none"
            stroke={T.accent}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#mrr-glow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            exit={{ pathLength: 0, opacity: 0 }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ pathLength: 0 }}
          />
        </AnimatePresence>

        {/* Data dots */}
        {data.map((d, i) => (
          <motion.circle
            key={`dot-${i}-${range}`}
            cx={toX(i)}
            cy={toY(d.mrr)}
            r={hovIdx === i ? 5 : 3}
            fill={hovIdx === i ? T.accentHi : T.accent}
            stroke={hovIdx === i ? '#fff' : 'transparent'}
            strokeWidth={1.5}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.9 + i * 0.04, duration: 0.3 }}
            style={{ cursor: 'crosshair' }}
          />
        ))}

        {/* Hover crosshair */}
        {hovIdx !== null && data[hovIdx] != null && (
          <>
            <line
              x1={toX(hovIdx)}
              y1={PAD.top}
              x2={toX(hovIdx)}
              y2={PAD.top + chartH}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          </>
        )}

        {/* Start + end value callout */}
        {firstPt != null && (
          <text x={PAD.left} y={toY(firstPt.mrr) - 6} textAnchor="start" fill={T.faint} fontSize={9} fontFamily="inherit">
            {fmtCurrency(firstPt.mrr)}
          </text>
        )}
        {lastPt != null && (
          <text x={toX(data.length - 1)} y={toY(lastPt.mrr) - 6} textAnchor="end" fill={T.accentHi} fontSize={10} fontWeight="700" fontFamily="inherit">
            {fmtCurrency(lastPt.mrr)}
          </text>
        )}
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {hovIdx !== null && data[hovIdx] != null && (
          <motion.div
            key={`tip-${hovIdx}`}
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'absolute',
              top: 8,
              left: Math.min(Math.max(0, (hovIdx / (data.length - 1)) * 100 - 10), 75) + '%',
              pointerEvents: 'none',
              ...glassInner({ borderRadius: 10, padding: '8px 12px' }),
              minWidth: 110,
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: 11, color: T.dim, marginBottom: 2 }}>{data[hovIdx]!.label}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>
              ${(data[hovIdx]!.mrr).toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: T.success, marginTop: 2 }}>
              MRR
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Plan MRR Donut ──────────────────────────────────────────────────────────

function PlanDonut() {
  const [hovPlan, setHovPlan] = useState<string | null>(null);
  const R = 54;
  const STROKE = 12;
  const C_VAL = 2 * Math.PI * R;
  let offset = 0;

  const segments = PLAN_MRR.map((p) => {
    const share = p.mrr / TOTAL_MRR;
    const len = share * C_VAL;
    const seg = { ...p, share, len, offset, color: PLAN_COLORS[p.plan] ?? T.accent };
    offset += len;
    return seg;
  });

  const hov = segments.find((s) => s.plan === hovPlan);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      {/* Donut */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width={130} height={130} viewBox="0 0 130 130">
          {/* Track */}
          <circle cx={65} cy={65} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE} />
          {segments.map((seg, i) => (
            <motion.circle
              key={seg.plan}
              cx={65}
              cy={65}
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={hovPlan === seg.plan ? STROKE + 3 : STROKE}
              strokeDasharray={`${seg.len} ${C_VAL - seg.len}`}
              strokeDashoffset={-seg.offset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', cursor: 'pointer' }}
              initial={{ strokeDasharray: `0 ${C_VAL}`, opacity: 0 }}
              animate={{
                strokeDasharray: `${seg.len} ${C_VAL - seg.len}`,
                opacity: hovPlan && hovPlan !== seg.plan ? 0.4 : 1,
              }}
              transition={{ duration: 0.8, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              onMouseEnter={() => setHovPlan(seg.plan)}
              onMouseLeave={() => setHovPlan(null)}
            />
          ))}
          {/* Center text */}
          <text x={65} y={60} textAnchor="middle" fill={T.text} fontSize={16} fontWeight={700} fontFamily="inherit">
            {hov ? `$${(hov.mrr / 1000).toFixed(1)}k` : '$24.4k'}
          </text>
          <text x={65} y={76} textAnchor="middle" fill={T.faint} fontSize={9} fontFamily="inherit" letterSpacing="0.08em">
            {hov ? hov.plan.toUpperCase() : 'TOTAL MRR'}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {segments.map((seg) => (
          <motion.div
            key={seg.plan}
            onMouseEnter={() => setHovPlan(seg.plan)}
            onMouseLeave={() => setHovPlan(null)}
            animate={{ opacity: hovPlan && hovPlan !== seg.plan ? 0.45 : 1 }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'default' }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: seg.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: T.dim, flex: 1 }}>{seg.plan}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
              ${seg.mrr.toLocaleString()}
            </span>
            <span style={{ fontSize: 10, color: T.faint, minWidth: 32, textAlign: 'right' }}>
              {Math.round(seg.share * 100)}%
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Plan MRR Bars ───────────────────────────────────────────────────────────

function PlanBars() {
  const maxMrr = Math.max(...PLAN_MRR.map((p) => p.mrr));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {PLAN_MRR.map((p, i) => {
        const pct = (p.mrr / maxMrr) * 100;
        const col = PLAN_COLORS[p.plan] ?? T.accent;
        return (
          <div key={p.plan} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: col,
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 12, color: T.dim }}>{p.plan}</span>
                <span style={{ fontSize: 10, color: T.faint }}>{p.subs} subs</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                ${p.mrr.toLocaleString()}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.07)',
                overflow: 'hidden',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  height: '100%',
                  background: `linear-gradient(90deg, ${col}cc, ${col})`,
                  borderRadius: 3,
                  boxShadow: `0 0 8px ${col}55`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Recent Payments Feed ────────────────────────────────────────────────────

interface PaymentRowProps {
  payment: Payment;
  index: number;
}

function PaymentRow({ payment: p }: PaymentRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      variants={rowVariants}
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
      style={{
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'background 0.2s',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded((x) => !x)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.07)' : 'none',
        }}
      >
        <WorkspaceAvatar name={p.workspace} hue={p.hue} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: T.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {p.workspace}
          </div>
          <div style={{ fontSize: 11, color: T.faint }}>{p.email}</div>
        </div>
        <span
          style={{
            fontSize: 11,
            color: T.dim,
            padding: '2px 8px',
            borderRadius: 20,
            background: `${PLAN_COLORS[p.plan] ?? T.accent}22`,
            border: `1px solid ${PLAN_COLORS[p.plan] ?? T.accent}44`,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {p.plan}
        </span>
        <StatusChip status={p.status} />
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: T.text,
            textAlign: 'right',
            minWidth: 52,
          }}
        >
          ${p.amount}
        </div>
        <div style={{ fontSize: 10, color: T.faint, minWidth: 68, textAlign: 'right' }}>
          {p.ts}
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          style={{ color: T.faint, flexShrink: 0 }}
        >
          <ChevronDown size={14} strokeWidth={2} />
        </motion.div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                display: 'flex',
                gap: 24,
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              {[
                { label: 'Transaction ID', value: `txn_${p.id}_2026` },
                { label: 'Gateway', value: 'Stripe' },
                { label: 'Currency', value: 'USD' },
                { label: 'Net amount', value: `$${(p.amount * 0.971 - 0.3).toFixed(2)}` },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ ...MICRO, marginBottom: 2 }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: T.dim, fontFamily: 'monospace' }}>
                    {item.value}
                  </span>
                </div>
              ))}
              {p.status === 'failed' && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: `1px solid ${T.danger}66`,
                      background: T.dangerDim,
                      color: T.danger,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <RefreshCw size={11} strokeWidth={2.5} />
                    Retry now
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Failed Payment Alert Callout ────────────────────────────────────────────

interface AlertCalloutProps {
  onDismiss: () => void;
  onRetryAll: () => void;
  toastMsg: string | null;
}

function AlertCallout({ onDismiss, onRetryAll, toastMsg }: AlertCalloutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        ...glassInner({ borderRadius: 12 }),
        background: T.dangerDim,
        border: `1px solid ${T.danger}55`,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
        position: 'relative',
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: 'rgba(255,92,122,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <AlertTriangle size={16} strokeWidth={2.2} color={T.danger} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2 }}>
          {KPI_FAILED} failed payments require attention
        </div>
        <div style={{ fontSize: 11, color: T.dim }}>
          These workspaces may lose access soon. Auto-retry scheduled in 24h.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={onRetryAll}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            background: T.danger,
            border: 'none',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <RefreshCw size={12} strokeWidth={2.5} />
          Retry all
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={onDismiss}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid rgba(255,92,122,0.35)',
            background: 'transparent',
            color: T.danger,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <X size={13} strokeWidth={2.4} />
        </motion.button>
      </div>

      {/* Retry toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'absolute',
              bottom: -44,
              right: 0,
              ...glassInner({ borderRadius: 10, padding: '8px 14px' }),
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: T.success,
              fontWeight: 600,
              zIndex: 20,
              whiteSpace: 'nowrap',
            }}
          >
            <CheckCircle2 size={13} strokeWidth={2.4} color={T.success} />
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdmBilBL1Cockpit() {
  const [range, setRange] = useState<Range>('12m');
  const [showAlert, setShowAlert] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated counter strings
  const mrrStr = useAnimatedCounter(KPI_MRR, { prefix: '$', duration: 1.6 });
  const subsStr = useAnimatedCounter(KPI_SUBS, { duration: 1.4 });
  const arpuStr = useAnimatedCounter(KPI_ARPU, { prefix: '$', duration: 1.3 });
  const churnStr = useAnimatedCounter(KPI_CHURN, { decimals: 1, suffix: '%', duration: 1.2 });
  const failedStr = useAnimatedCounter(KPI_FAILED, { duration: 1.1 });

  const handleRetryAll = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(`Queued ${KPI_FAILED} retries — check back in 5 min`);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  return (
    <div
      style={{
        padding: '24px 28px',
        maxWidth: 1100,
        margin: '0 auto',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: T.text,
      }}
    >
      {/* ── Page header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 26,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={MICRO}>Admin · Billing</span>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: T.success,
                display: 'inline-block',
                boxShadow: `0 0 6px ${T.success}`,
              }}
            />
            <span style={{ ...MICRO, color: T.success }}>Live</span>
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              margin: 0,
              letterSpacing: '-0.025em',
              background: `linear-gradient(135deg, ${T.text} 40%, rgba(255,255,255,0.6))`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Revenue Cockpit
          </h1>
          <p style={{ fontSize: 13, color: T.faint, margin: '4px 0 0' }}>
            Platform subscription overview · June 2026
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            style={{
              ...glassInner({ borderRadius: 9, padding: '7px 14px' }),
              border: '1px solid rgba(255,255,255,0.12)',
              color: T.dim,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArrowUpRight size={13} strokeWidth={2.2} />
            Export CSV
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04, background: T.accentHi }}
            whileTap={{ scale: 0.96 }}
            style={{
              padding: '7px 16px',
              borderRadius: 9,
              background: T.accent,
              border: 'none',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Zap size={13} strokeWidth={2.2} />
            Reconcile
          </motion.button>
        </div>
      </motion.div>

      {/* ── Failed payment alert ── */}
      <AnimatePresence>
        {showAlert && (
          <AlertCallout
            onDismiss={() => setShowAlert(false)}
            onRetryAll={handleRetryAll}
            toastMsg={toastMsg}
          />
        )}
      </AnimatePresence>

      {/* ── KPI row ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 22,
          flexWrap: 'wrap',
        }}
      >
        <KpiCard
          label="MRR"
          value={mrrStr}
          delta="+8.4% vs last month"
          up={true}
          icon={DollarSign}
          accent={T.accent}
          accentDim="rgba(242,101,34,0.12)"
        />
        <KpiCard
          label="ARR (projected)"
          value={`$${fmtLarge(KPI_ARR)}`}
          delta="+8.4% annualised"
          up={true}
          icon={TrendingUp}
          accent={T.accentHi}
          accentDim="rgba(255,138,75,0.12)"
        />
        <KpiCard
          label="Active subscriptions"
          value={subsStr}
          delta="+12 this month"
          up={true}
          icon={Users}
          accent={T.amber}
          accentDim={T.amberDim}
        />
        <KpiCard
          label="ARPU / month"
          value={arpuStr}
          delta="+$3.20 vs last month"
          up={true}
          icon={BarChart2}
          accent={T.gold}
          accentDim={T.goldDim}
        />
        <KpiCard
          label="Monthly churn"
          value={churnStr}
          delta="-0.3pp vs last month"
          up={false}
          icon={Activity}
          accent={T.success}
          accentDim={T.successDim}
        />
        <KpiCard
          label="Failed payments"
          value={failedStr}
          delta="need retry"
          up={null}
          icon={CreditCard}
          accent={T.danger}
          accentDim={T.dangerDim}
        />
      </motion.div>

      {/* ── Middle row: chart + plan split ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* MRR Trend */}
        <motion.div
          variants={fadeUpVariants}
          initial="hidden"
          animate="show"
          style={glass({ padding: '20px 22px' })}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div>
              <div style={MICRO}>MRR Trend</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 3 }}>
                Monthly Recurring Revenue
              </div>
            </div>
            {/* Range toggle */}
            <div
              style={{
                display: 'flex',
                gap: 2,
                background: 'rgba(255,255,255,0.07)',
                borderRadius: 8,
                padding: 3,
              }}
            >
              {(['6m', '12m'] as Range[]).map((r) => (
                <motion.button
                  key={r}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setRange(r)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: range === r ? T.accent : 'transparent',
                    color: range === r ? '#fff' : T.dim,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'background 0.2s, color 0.2s',
                    letterSpacing: '0.04em',
                  }}
                >
                  {r}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Re-animate on range change via AnimatePresence + key */}
          <AnimatePresence mode="wait">
            <motion.div
              key={range}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <TrendChart range={range} />
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Plan split */}
        <motion.div
          variants={fadeUpVariants}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.12 }}
          style={glass({ padding: '20px 22px' })}
        >
          <div style={MICRO}>MRR by Plan</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 3, marginBottom: 18 }}>
            Subscription breakdown
          </div>

          {/* Donut + legend */}
          <PlanDonut />

          <div
            style={{
              height: 1,
              background: 'rgba(255,255,255,0.07)',
              margin: '16px 0',
            }}
          />

          {/* Bars */}
          <PlanBars />
        </motion.div>
      </div>

      {/* ── Recent Payments ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={glass({ padding: '20px 22px' })}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <div style={MICRO}>Recent Payments</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 3 }}>
              Live transaction feed
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Status filter chips */}
            {(['All', 'Succeeded', 'Failed'] as const).map((label, i) => (
              <motion.button
                key={label}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: `1px solid ${i === 0 ? T.accent + '88' : 'rgba(255,255,255,0.12)'}`,
                  background: i === 0 ? 'rgba(242,101,34,0.12)' : 'transparent',
                  color: i === 0 ? T.accent : T.faint,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                {label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 12px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            marginBottom: 4,
          }}
        >
          {['Workspace', 'Plan', 'Status', 'Amount', 'Time', ''].map((h) => (
            <span
              key={h}
              style={{
                ...MICRO,
                flex: h === 'Workspace' ? 1 : undefined,
                minWidth: h === 'Amount' ? 52 : h === 'Time' ? 68 : undefined,
                textAlign: ['Amount', 'Time'].includes(h) ? 'right' : 'left',
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Staggered payment rows */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {PAYMENTS.map((p, i) => (
            <PaymentRow key={p.id} payment={p} index={i} />
          ))}
        </motion.div>

        {/* Footer summary */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: T.faint }}>
            Showing {PAYMENTS.length} most recent ·{' '}
            <span style={{ color: T.success }}>
              {PAYMENTS.filter((p) => p.status === 'succeeded').length} succeeded
            </span>{' '}
            ·{' '}
            <span style={{ color: T.danger }}>
              {FAILED_PAYMENTS.length} failed
            </span>
          </span>
          <motion.button
            whileHover={{ scale: 1.04, color: T.text }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              color: T.dim,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            View all transactions
            <ArrowUpRight size={13} strokeWidth={2.2} />
          </motion.button>
        </motion.div>
      </motion.div>

      {/* ── Bottom stat row: workspace breakdown ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ ...glass({ padding: '20px 22px' }), marginTop: 16 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <div style={MICRO}>Top Workspaces</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 3 }}>
              Highest-value accounts by MRR contribution
            </div>
          </div>
          <span style={{ fontSize: 12, color: T.faint, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Building2 size={13} strokeWidth={2} />
            283 paid workspaces
          </span>
        </div>

        {/* Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 80px 80px 120px',
              gap: 8,
              padding: '0 12px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {['Workspace', 'Plan', 'MRR', 'Seats', 'Status'].map((h) => (
              <span key={h} style={MICRO}>{h}</span>
            ))}
          </div>

          {[
            { ws: 'Globex International', plan: 'Agency',   mrr: 199, seats: 28, hue: 22, status: 'active' as const },
            { ws: 'Acme Corp',            plan: 'Pro Plus', mrr: 140, seats: 14, hue: 28, status: 'active' as const },
            { ws: 'Beacon App',           plan: 'Agency',   mrr: 199, seats: 22, hue: 20, status: 'active' as const },
            { ws: 'Northwind IO',         plan: 'Pro Plus', mrr: 140, seats: 11, hue: 42, status: 'active' as const },
            { ws: 'Vendio',               plan: 'Pro',      mrr: 85,  seats: 6,  hue: 36, status: 'active' as const },
            { ws: 'Oxen Studio',          plan: 'Starter',  mrr: 29,  seats: 2,  hue: 15, status: 'past_due' as const },
          ].map((row, i) => (
            <motion.div
              key={row.ws}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 80px 80px 120px',
                gap: 8,
                padding: '11px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 8,
                cursor: 'default',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <WorkspaceAvatar name={row.ws} hue={row.hue} />
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{row.ws}</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: PLAN_COLORS[row.plan] ?? T.accent,
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: `${PLAN_COLORS[row.plan] ?? T.accent}22`,
                  border: `1px solid ${PLAN_COLORS[row.plan] ?? T.accent}44`,
                  display: 'inline-block',
                }}
              >
                {row.plan}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                ${row.mrr}/mo
              </span>
              <span style={{ fontSize: 12, color: T.dim }}>{row.seats} seats</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: row.status === 'active' ? T.success : T.danger,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {row.status === 'active' ? (
                  <CheckCircle2 size={11} strokeWidth={2.5} />
                ) : (
                  <AlertTriangle size={11} strokeWidth={2.5} />
                )}
                {row.status}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
