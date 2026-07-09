/**
 * Admin Plans & Pricing Design Candidate: PL3 Revenue Cockpit
 *
 * "Revenue Cockpit" — a mission-control view combining revenue/adoption analytics
 * with full plan management. Top KPI row (animated counters), 6-month MRR trend
 * (hand-built animated SVG area chart with range toggle), a revenue-by-plan donut
 * (animated SVG strokeDasharray) + subscribers spring bars, and plan management
 * cards with inline edit (AnimatePresence), create/delete (layout reflow), and
 * click-to-highlight cross-linking between charts and plan cards.
 *
 * Framer-motion techniques:
 *  - useMotionValue + animate() for KPI counters with cleanup
 *  - motion.path pathLength spring animations for SVG area chart
 *  - Animated SVG strokeDasharray for donut segments (spring)
 *  - Spring bars for subscribers distribution
 *  - Staggered entrance (containerVariants / itemVariants)
 *  - whileHover / whileTap on every interactive element
 *  - AnimatePresence for inline plan editor expand/collapse
 *  - AnimatePresence for create/delete plan layout reflow (layout prop)
 *  - Toast stack with animated enter/exit
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}} (+ framer-motion props). Mock data only.
 * Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97, danger #ff5c7a,
 * warning #FF8A4B. NO purple/violet/blue/teal/cyan/indigo/pink, no random hsl().
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
  Users,
  DollarSign,
  Percent,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  BarChart2,
  Layers,
  Star,
  Zap,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.42)' as const,
  ghost: 'rgba(255,255,255,0.22)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentHi: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.15)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.12)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.12)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.12)' as const,
  amber: '#c2a46e' as const,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,
  glassInner: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    borderRadius: 12,
  } as CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type PlanId = 'free' | 'starter' | 'pro' | 'proplus' | 'agency';
type RangeKey = '3m' | '6m' | '12m';

interface Plan {
  id: PlanId;
  name: string;
  price: number;           // 0 = free
  subscribers: number;
  mrr: number;
  color: string;
  features: string[];
  mailboxes: number;
  dailyCap: number;
  tokenCap: string;
  highlighted?: boolean;
}

interface TrendPoint {
  label: string;
  mrr: number;
}

interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'warning' | 'danger';
}

// ─── Mock plans ──────────────────────────────────────────────────────────────
const INITIAL_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    subscribers: 94,
    mrr: 0,
    color: T.ghost,
    features: ['1 mailbox', 'Peer pool (default)', 'LLM content (Gemini)', 'DNS validator'],
    mailboxes: 1,
    dailyCap: 20,
    tokenCap: '100k',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    subscribers: 68,
    mrr: 1972,
    color: T.amber,
    features: ['3 mailboxes', 'Peer pool (default)', 'LLM content (Gemini)', 'DNS validator', 'Inbox-placement tester', '30-day audit retention'],
    mailboxes: 3,
    dailyCap: 50,
    tokenCap: '250k',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 79,
    subscribers: 112,
    mrr: 8848,
    color: T.accentHi,
    features: ['10 mailboxes', 'Peer pool (default)', 'LLM content (Gemini + Claude)', 'DNS validator', 'Inbox-placement tester', 'Scheduled reports (CSV)', '90-day audit retention'],
    mailboxes: 10,
    dailyCap: 200,
    tokenCap: '1.5M',
    highlighted: true,
  },
  {
    id: 'proplus',
    name: 'Pro Plus',
    price: 149,
    subscribers: 58,
    mrr: 8642,
    color: T.accent,
    features: ['25 mailboxes', 'Premium peer pool', 'LLM content (Gemini + Claude)', 'DNS validator', 'Inbox-placement tester', 'Scheduled reports (CSV + PDF)', 'Priority support', '1-year audit retention'],
    mailboxes: 25,
    dailyCap: 500,
    tokenCap: '5M',
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 299,
    subscribers: 22,
    mrr: 6578,
    color: T.success,
    features: ['Unlimited mailboxes', 'Enterprise peer pool', 'LLM content (Gemini + Claude)', 'DNS validator', 'Inbox-placement tester', 'Scheduled reports (CSV + PDF)', 'Priority support + Custom SLA', 'Unlimited audit retention', 'Impersonation & multi-workspace'],
    mailboxes: 9999,
    dailyCap: 9999,
    tokenCap: '50M',
  },
];

// ─── Mock MRR trend data (per range) ─────────────────────────────────────────
const MRR_3M: TrendPoint[] = [
  { label: 'Mar', mrr: 21800 },
  { label: 'Apr', mrr: 23100 },
  { label: 'May', mrr: 26040 },
];
const MRR_6M: TrendPoint[] = [
  { label: 'Dec', mrr: 14200 },
  { label: 'Jan', mrr: 16400 },
  { label: 'Feb', mrr: 18900 },
  { label: 'Mar', mrr: 21800 },
  { label: 'Apr', mrr: 23100 },
  { label: 'May', mrr: 26040 },
];
const MRR_12M: TrendPoint[] = [
  { label: 'Jun\'25', mrr: 7200 },
  { label: 'Jul',    mrr: 8800 },
  { label: 'Aug',    mrr: 10600 },
  { label: 'Sep',    mrr: 12400 },
  { label: 'Oct',    mrr: 13800 },
  { label: 'Nov',    mrr: 14200 },
  { label: 'Dec',    mrr: 14200 },
  { label: 'Jan',    mrr: 16400 },
  { label: 'Feb',    mrr: 18900 },
  { label: 'Mar',    mrr: 21800 },
  { label: 'Apr',    mrr: 23100 },
  { label: 'May',    mrr: 26040 },
];

const MRR_BY_RANGE: Record<RangeKey, TrendPoint[]> = {
  '3m': MRR_3M,
  '6m': MRR_6M,
  '12m': MRR_12M,
};

// ─── Framer-motion variants ───────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

const kpiVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, type: 'spring', stiffness: 320, damping: 26 },
  }),
};

const toastVariants: Variants = {
  hidden: { opacity: 0, y: -20, scale: 0.94 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 26 } },
  exit: { opacity: 0, y: -16, scale: 0.93, transition: { duration: 0.18 } },
};

const planCardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: 20 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 22 },
  },
  exit: {
    opacity: 0, scale: 0.88, y: -16,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

const editorVariants: Variants = {
  hidden: { opacity: 0, height: 0, y: -8 },
  visible: {
    opacity: 1, height: 'auto', y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 22 },
  },
  exit: {
    opacity: 0, height: 0, y: -8,
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};

// ─── Animated counter hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1.2): number {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(mv, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = mv.on('change', (v) => setDisplay(Math.round(v)));
    return () => {
      controls.stop();
      unsub();
    };
  }, [mv, target, duration]);
  return display;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMrr(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ─── SVG Area Chart (hand-built, motion.path pathLength) ──────────────────────
interface AreaChartProps {
  data: TrendPoint[];
  rangeKey: RangeKey;
  accentColor: string;
}

function AnimatedAreaChart({ data, rangeKey, accentColor }: AreaChartProps) {
  const W = 580;
  const H = 140;
  const PAD = { top: 10, right: 16, bottom: 28, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const minMrr = 0;
  const maxMrr = Math.max(...data.map((d) => d.mrr)) * 1.15;

  const xOf = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const yOf = (v: number) => PAD.top + chartH - ((v - minMrr) / (maxMrr - minMrr)) * chartH;

  // Build SVG path strings
  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(d.mrr).toFixed(1)}`)
    .join(' ');

  const areaPath = [
    ...data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(d.mrr).toFixed(1)}`),
    `L ${xOf(data.length - 1).toFixed(1)} ${(PAD.top + chartH).toFixed(1)}`,
    `L ${PAD.left.toFixed(1)} ${(PAD.top + chartH).toFixed(1)}`,
    'Z',
  ].join(' ');

  // Y grid lines (4 ticks)
  const yTicks = [0, 0.33, 0.66, 1].map((t) => ({
    y: PAD.top + chartH - t * chartH,
    label: fmtMrr(Math.round(minMrr + t * (maxMrr - minMrr))),
  }));

  // Hovered point
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) * (W / rect.width) - PAD.left;
    const step = chartW / Math.max(data.length - 1, 1);
    const idx = Math.round(Math.max(0, Math.min(data.length - 1, x / step)));
    setHoveredIdx(idx);
  }, [data.length, chartW]);

  const handleMouseLeave = useCallback(() => setHoveredIdx(null), []);

  const gradId = `areaGrad-${rangeKey}`;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: H, display: 'block', overflow: 'visible' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity={0.38} />
          <stop offset="100%" stopColor={accentColor} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Y grid */}
      {yTicks.map((t) => (
        <g key={t.label}>
          <line
            x1={PAD.left}
            y1={t.y}
            x2={W - PAD.right}
            y2={t.y}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3 4"
          />
          <text
            x={PAD.left - 6}
            y={t.y + 4}
            textAnchor="end"
            fill="rgba(255,255,255,0.38)"
            fontSize={9.5}
            fontFamily="system-ui"
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* X labels */}
      {data.map((d, i) => (
        <text
          key={d.label}
          x={xOf(i)}
          y={H - 6}
          textAnchor="middle"
          fill="rgba(255,255,255,0.38)"
          fontSize={9.5}
          fontFamily="system-ui"
        >
          {d.label}
        </text>
      ))}

      {/* Animated area fill */}
      <motion.path
        key={`area-${rangeKey}`}
        d={areaPath}
        fill={`url(#${gradId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />

      {/* Animated line */}
      <motion.path
        key={`line-${rangeKey}`}
        d={linePath}
        fill="none"
        stroke={accentColor}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Data dots */}
      {data.map((d, i) => (
        <motion.circle
          key={`dot-${i}-${rangeKey}`}
          cx={xOf(i)}
          cy={yOf(d.mrr)}
          r={hoveredIdx === i ? 5 : 3}
          fill={hoveredIdx === i ? accentColor : 'rgba(255,255,255,0.25)'}
          stroke={accentColor}
          strokeWidth={hoveredIdx === i ? 2 : 1.5}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.7 + i * 0.04, type: 'spring', stiffness: 400, damping: 20 }}
          style={{ cursor: 'default' }}
        />
      ))}

      {/* Hover tooltip */}
      <AnimatePresence>
        {hoveredIdx !== null && data[hoveredIdx] && (() => {
          const d = data[hoveredIdx]!;
          const cx = xOf(hoveredIdx);
          const cy = yOf(d.mrr);
          const boxW = 94;
          const boxH = 38;
          const boxX = Math.min(Math.max(cx - boxW / 2, PAD.left), W - PAD.right - boxW);
          const boxY = cy - boxH - 10;
          return (
            <motion.g
              key="tooltip"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.13 }}
            >
              <rect
                x={boxX}
                y={boxY}
                width={boxW}
                height={boxH}
                rx={7}
                fill="rgba(20,18,24,0.94)"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
              />
              <text x={boxX + boxW / 2} y={boxY + 14} textAnchor="middle" fill="rgba(255,255,255,0.50)" fontSize={9.5} fontFamily="system-ui">
                {d.label}
              </text>
              <text x={boxX + boxW / 2} y={boxY + 29} textAnchor="middle" fill={accentColor} fontSize={12.5} fontWeight={700} fontFamily="system-ui">
                ${d.mrr.toLocaleString()}
              </text>
              {/* vertical guide */}
              <line x1={cx} y1={cy + 5} x2={cx} y2={H - PAD.bottom} stroke={accentColor} strokeOpacity={0.25} strokeWidth={1} strokeDasharray="3 3" />
            </motion.g>
          );
        })()}
      </AnimatePresence>
    </svg>
  );
}

// ─── Donut Segment (animated SVG strokeDasharray) ─────────────────────────────
interface DonutSegmentProps {
  cx: number;
  cy: number;
  r: number;
  strokeDasharray: string;
  strokeDashoffset: number;
  color: string;
  delay: number;
}

function DonutSegment({ cx, cy, r, strokeDasharray, strokeDashoffset, color, delay }: DonutSegmentProps) {
  const circumference = 2 * Math.PI * r;
  const mv = useMotionValue(0);
  const [dashVal, setDashVal] = useState(0);

  const targetDash = parseFloat(strokeDasharray.split(' ')[0] ?? '0');

  useEffect(() => {
    const controls = animate(mv, targetDash, {
      duration: 0.85,
      delay,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = mv.on('change', (v) => setDashVal(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [mv, targetDash, delay]);

  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={18}
      strokeDasharray={`${dashVal} ${circumference}`}
      strokeDashoffset={strokeDashoffset}
      strokeLinecap="round"
      style={{ transition: 'none' }}
    />
  );
}

// ─── Subscribers Spring Bar ────────────────────────────────────────────────────
interface SpringBarProps {
  value: number;
  max: number;
  color: string;
  delay: number;
}

function SpringBar({ value, max, color, delay }: SpringBarProps) {
  const mv = useMotionValue(0);
  const [pct, setPct] = useState(0);
  const target = max > 0 ? (value / max) * 100 : 0;

  useEffect(() => {
    const controls = animate(mv, target, {
      duration: 0.8,
      delay,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = mv.on('change', (v) => setPct(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [mv, target, delay]);

  return (
    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 4,
          background: color,
          transition: 'none',
        }}
      />
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delta?: string;
  positive?: boolean;
  icon: typeof DollarSign;
  accentColor: string;
  index: number;
}

function KpiCard({ label, value, prefix, suffix, delta, positive, icon: Icon, accentColor, index }: KpiCardProps) {
  const count = useCountUp(value);

  return (
    <motion.div
      custom={index}
      variants={kpiVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 420, damping: 22 } }}
      style={{
        ...T.glass,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -24,
          right: -18,
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}26 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.13em',
          textTransform: 'uppercase',
          color: T.faint,
        }}>
          {label}
        </span>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 8,
          background: `${accentColor}22`,
          color: accentColor,
        }}>
          <Icon size={14} strokeWidth={2.2} />
        </span>
      </div>
      <div style={{
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        color: T.text,
      }}>
        {prefix}{count.toLocaleString()}{suffix}
      </div>
      {delta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {positive
            ? <TrendingUp size={11} style={{ color: T.success }} />
            : <ChevronDown size={11} style={{ color: T.danger }} />}
          <span style={{ fontSize: 11, fontWeight: 700, color: positive ? T.success : T.danger }}>
            {delta}
          </span>
          <span style={{ fontSize: 10, color: T.faint }}>vs last month</span>
        </div>
      )}
    </motion.div>
  );
}

// ─── Plan Editor ──────────────────────────────────────────────────────────────
interface PlanEditorProps {
  plan: Plan;
  onSave: (updated: Plan) => void;
  onCancel: () => void;
}

function PlanEditor({ plan, onSave, onCancel }: PlanEditorProps) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.price));
  const [mailboxes, setMailboxes] = useState(String(plan.mailboxes >= 9999 ? '∞' : plan.mailboxes));
  const [dailyCap, setDailyCap] = useState(String(plan.dailyCap >= 9999 ? '∞' : plan.dailyCap));

  const handleSave = () => {
    const parsedPrice = parseInt(price, 10);
    const parsedMb = mailboxes === '∞' ? 9999 : parseInt(mailboxes, 10);
    const parsedCap = dailyCap === '∞' ? 9999 : parseInt(dailyCap, 10);
    onSave({
      ...plan,
      name: name.trim() || plan.name,
      price: isNaN(parsedPrice) ? plan.price : parsedPrice,
      mailboxes: isNaN(parsedMb) ? plan.mailboxes : parsedMb,
      dailyCap: isNaN(parsedCap) ? plan.dailyCap : parsedCap,
    });
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 8,
    color: T.text,
    fontSize: 12.5,
    padding: '7px 10px',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: T.faint,
    marginBottom: 4,
    display: 'block',
  };

  return (
    <motion.div
      variants={editorVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        marginTop: 14,
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 12,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}>
        <div>
          <span style={labelStyle}>Plan Name</span>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <span style={labelStyle}>Price / mo ($)</span>
          <input
            style={inputStyle}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            type="number"
            min="0"
          />
        </div>
        <div>
          <span style={labelStyle}>Mailboxes</span>
          <input
            style={inputStyle}
            value={mailboxes}
            onChange={(e) => setMailboxes(e.target.value)}
          />
        </div>
        <div>
          <span style={labelStyle}>Daily Cap</span>
          <input
            style={inputStyle}
            value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)}
          />
        </div>
        <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <motion.button
            type="button"
            onClick={onCancel}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: T.dim,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            <X size={12} />
            Cancel
          </motion.button>
          <motion.button
            type="button"
            onClick={handleSave}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 14px',
              borderRadius: 8,
              border: 'none',
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            <Check size={12} />
            Save
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────
interface PlanCardProps {
  plan: Plan;
  isHighlighted: boolean;
  onEdit: (id: PlanId) => void;
  onDelete: (id: PlanId) => void;
  onSaveEdit: (updated: Plan) => void;
  onCancelEdit: () => void;
  isEditing: boolean;
  onClick: (id: PlanId) => void;
}

function PlanCard({ plan, isHighlighted, onEdit, onDelete, onSaveEdit, onCancelEdit, isEditing, onClick }: PlanCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      layout
      variants={planCardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => onClick(plan.id)}
      whileHover={{ y: -2 }}
      style={{
        ...T.glass,
        padding: '18px 20px',
        cursor: 'pointer',
        position: 'relative',
        outline: isHighlighted
          ? `2px solid ${plan.color}`
          : hovered
            ? '1px solid rgba(255,255,255,0.18)'
            : '1px solid rgba(255,255,255,0.10)',
        outlineOffset: isHighlighted ? -2 : 0,
        transition: 'outline 0.2s ease',
        boxShadow: isHighlighted ? `0 0 22px ${plan.color}28` : 'none',
      }}
    >
      {/* Plan highlight badge */}
      {plan.highlighted && (
        <div style={{
          position: 'absolute',
          top: -1,
          right: 18,
          background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
          borderRadius: '0 0 8px 8px',
          padding: '3px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 9.5,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          <Star size={9} strokeWidth={2.4} />
          Popular
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: plan.color,
            boxShadow: `0 0 8px ${plan.color}80`,
            flexShrink: 0,
          }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: '-0.015em' }}>
              {plan.name}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: plan.color, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              {plan.price === 0 ? 'Free' : `$${plan.price}`}
              {plan.price > 0 && (
                <span style={{ fontSize: 11, fontWeight: 500, color: T.faint, marginLeft: 3 }}>/mo</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <motion.button
            type="button"
            onClick={() => onEdit(plan.id)}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${isEditing ? T.accent + '60' : 'rgba(255,255,255,0.12)'}`,
              background: isEditing ? T.accentDim : 'transparent',
              color: isEditing ? T.accent : T.dim,
            }}
          >
            <Edit3 size={13} strokeWidth={2.2} />
          </motion.button>
          <motion.button
            type="button"
            onClick={() => onDelete(plan.id)}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid rgba(255,92,122,0.25)',
              background: 'transparent',
              color: T.danger,
            }}
          >
            <Trash2 size={13} strokeWidth={2.2} />
          </motion.button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        marginBottom: 12,
      }}>
        {[
          { label: 'Subscribers', value: plan.subscribers.toLocaleString(), icon: Users },
          { label: 'MRR', value: plan.mrr > 0 ? `$${plan.mrr.toLocaleString()}` : '$0', icon: DollarSign },
          { label: 'Mailboxes', value: plan.mailboxes >= 9999 ? '∞' : String(plan.mailboxes), icon: CreditCard },
          { label: 'Daily cap', value: plan.dailyCap >= 9999 ? '∞' : String(plan.dailyCap), icon: Zap },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 8,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <s.icon size={11} style={{ color: plan.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.faint }}>
                {s.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>
                {s.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Feature list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {plan.features.slice(0, 4).map((f) => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: T.dim }}>
            <CheckCircle2 size={10} style={{ color: plan.color, flexShrink: 0 }} />
            {f}
          </div>
        ))}
        {plan.features.length > 4 && (
          <div style={{ fontSize: 10.5, color: T.faint, marginTop: 2 }}>
            +{plan.features.length - 4} more features
          </div>
        )}
      </div>

      {/* Inline editor */}
      <AnimatePresence>
        {isEditing && (
          <div onClick={(e) => e.stopPropagation()}>
            <PlanEditor
              plan={plan}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
            />
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Add Plan Button ──────────────────────────────────────────────────────────
interface AddPlanButtonProps {
  onClick: () => void;
}

function AddPlanButton({ onClick }: AddPlanButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03, borderColor: T.accent }}
      whileTap={{ scale: 0.97 }}
      style={{
        appearance: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.02)',
        border: '2px dashed rgba(255,255,255,0.14)',
        borderRadius: 16,
        color: T.faint,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        minHeight: 160,
        padding: '20px',
        transition: 'border-color 0.18s ease',
      }}
    >
      <Plus size={22} strokeWidth={1.8} style={{ color: T.accent }} />
      <span>New Plan</span>
    </motion.button>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
interface DonutChartProps {
  plans: Plan[];
  highlightedId: PlanId | null;
  onSelect: (id: PlanId) => void;
  metric: 'mrr' | 'subscribers';
}

function DonutChart({ plans, highlightedId, onSelect, metric }: DonutChartProps) {
  const r = 64;
  const cx = 80;
  const cy = 80;
  const circumference = 2 * Math.PI * r;

  const total = plans.reduce((s, p) => s + (metric === 'mrr' ? p.mrr : p.subscribers), 0);

  // Build segments
  let offset = -circumference * 0.25; // start at top
  const segments = plans.map((p) => {
    const val = metric === 'mrr' ? p.mrr : p.subscribers;
    const pct = total > 0 ? val / total : 0;
    const dash = pct * circumference * 0.95;  // gap of 5%
    const gap = circumference - dash;
    const seg = { plan: p, dash, gap, offset, pct };
    offset += pct * circumference;
    return seg;
  });

  const highlightedPlan = plans.find((p) => p.id === highlightedId);
  const centerLabel = highlightedPlan
    ? metric === 'mrr'
      ? `$${(highlightedPlan.mrr / 1000).toFixed(1)}k`
      : String(highlightedPlan.subscribers)
    : metric === 'mrr'
      ? `$${(total / 1000).toFixed(1)}k`
      : String(total);
  const centerSub = highlightedPlan ? highlightedPlan.name : (metric === 'mrr' ? 'Total MRR' : 'Total');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg viewBox="0 0 160 160" style={{ width: 160, height: 160, flexShrink: 0 }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={18} />

        {/* Segments */}
        {segments.map((seg) => (
          <DonutSegment
            key={seg.plan.id}
            cx={cx}
            cy={cy}
            r={r}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={-seg.offset}
            color={seg.plan.id === highlightedId || highlightedId === null
              ? seg.plan.color
              : seg.plan.color + '44'
            }
            delay={segments.indexOf(seg) * 0.1}
          />
        ))}

        {/* Center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" fill={T.text} fontSize={15} fontWeight={800} fontFamily="system-ui" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {centerLabel}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill={T.faint} fontSize={9.5} fontFamily="system-ui">
          {centerSub}
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {segments.map((seg) => (
          <motion.div
            key={seg.plan.id}
            onClick={() => onSelect(seg.plan.id)}
            whileHover={{ x: 3 }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              opacity: highlightedId === null || highlightedId === seg.plan.id ? 1 : 0.45,
              transition: 'opacity 0.2s ease',
            }}
          >
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: seg.plan.color,
              flexShrink: 0,
              boxShadow: highlightedId === seg.plan.id ? `0 0 8px ${seg.plan.color}` : 'none',
            }} />
            <span style={{ flex: 1, fontSize: 11, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {seg.plan.name}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {(seg.pct * 100).toFixed(0)}%
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Subscribers Bars ─────────────────────────────────────────────────────────
interface SubsBarsProps {
  plans: Plan[];
  highlightedId: PlanId | null;
  onSelect: (id: PlanId) => void;
}

function SubsBars({ plans, highlightedId, onSelect }: SubsBarsProps) {
  const maxSubs = Math.max(...plans.map((p) => p.subscribers));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plans.map((p, i) => (
        <motion.div
          key={p.id}
          onClick={() => onSelect(p.id)}
          whileHover={{ x: 3 }}
          whileTap={{ scale: 0.98 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            opacity: highlightedId === null || highlightedId === p.id ? 1 : 0.4,
            transition: 'opacity 0.2s ease',
          }}
        >
          <div style={{ width: 54, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.dim }}>{p.name}</span>
          </div>
          <SpringBar value={p.subscribers} max={maxSubs} color={p.color} delay={i * 0.08} />
          <div style={{ width: 28, textAlign: 'right', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
              {p.subscribers}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── New Plan Creator ─────────────────────────────────────────────────────────
interface NewPlanFormProps {
  onAdd: (plan: Plan) => void;
  onClose: () => void;
}

function NewPlanForm({ onAdd, onClose }: NewPlanFormProps) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const handleAdd = () => {
    if (!name.trim()) return;
    const parsedPrice = parseInt(price, 10);
    const newPlan: Plan = {
      id: uid() as PlanId,
      name: name.trim(),
      price: isNaN(parsedPrice) ? 0 : parsedPrice,
      subscribers: 0,
      mrr: 0,
      color: T.amber,
      features: ['1 mailbox', 'Peer pool (default)', 'LLM content (Gemini)'],
      mailboxes: 1,
      dailyCap: 50,
      tokenCap: '100k',
    };
    onAdd(newPlan);
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 8,
    color: T.text,
    fontSize: 12.5,
    padding: '8px 11px',
    outline: 'none',
    fontFamily: 'inherit',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 16 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
        }}
      />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...T.glass,
          position: 'relative',
          zIndex: 1,
          padding: '24px 28px',
          width: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text }}>New Plan</h3>
          <motion.button
            type="button"
            onClick={onClose}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: T.dim,
            }}
          >
            <X size={14} />
          </motion.button>
        </div>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint, display: 'block', marginBottom: 5 }}>
            Plan Name
          </span>
          <input
            style={inputStyle}
            placeholder="e.g. Team"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint, display: 'block', marginBottom: 5 }}>
            Price / month ($)
          </span>
          <input
            style={inputStyle}
            placeholder="0 for free"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            type="number"
            min="0"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <motion.button
            type="button"
            onClick={onClose}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: T.dim,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </motion.button>
          <motion.button
            type="button"
            onClick={handleAdd}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            <Plus size={12} />
            Create Plan
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdmPlanPL3Cockpit() {
  const [plans, setPlans] = useState<Plan[]>(INITIAL_PLANS);
  const [highlightedId, setHighlightedId] = useState<PlanId | null>(null);
  const [editingId, setEditingId] = useState<PlanId | null>(null);
  const [mrrRange, setMrrRange] = useState<RangeKey>('6m');
  const [donutMetric, setDonutMetric] = useState<'mrr' | 'subscribers'>('mrr');
  const [showNewPlanForm, setShowNewPlanForm] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      toastTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const pushToast = useCallback((message: string, tone: Toast['tone']) => {
    const id = uid();
    setToasts((prev) => [...prev, { id, message, tone }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
    toastTimers.current.push(timer);
  }, []);

  // KPI calculations
  const totalMrr = plans.reduce((s, p) => s + p.mrr, 0);
  const totalSubs = plans.reduce((s, p) => s + p.subscribers, 0);
  const payingSubs = plans.filter((p) => p.price > 0).reduce((s, p) => s + p.subscribers, 0);
  const payingPct = totalSubs > 0 ? Math.round((payingSubs / totalSubs) * 100) : 0;
  const arpu = payingSubs > 0 ? Math.round(totalMrr / payingSubs) : 0;

  const handleToggleHighlight = useCallback((id: PlanId) => {
    setHighlightedId((prev) => (prev === id ? null : id));
  }, []);

  const handleEditStart = useCallback((id: PlanId) => {
    setEditingId((prev) => (prev === id ? null : id));
  }, []);

  const handleSaveEdit = useCallback((updated: Plan) => {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingId(null);
    pushToast(`"${updated.name}" updated`, 'success');
  }, [pushToast]);

  const handleCancelEdit = useCallback(() => setEditingId(null), []);

  const handleDelete = useCallback((id: PlanId) => {
    const plan = plans.find((p) => p.id === id);
    setPlans((prev) => prev.filter((p) => p.id !== id));
    if (highlightedId === id) setHighlightedId(null);
    if (editingId === id) setEditingId(null);
    pushToast(`"${plan?.name ?? 'Plan'}" deleted`, 'danger');
  }, [plans, highlightedId, editingId, pushToast]);

  const handleAddPlan = useCallback((plan: Plan) => {
    setPlans((prev) => [...prev, plan]);
    setShowNewPlanForm(false);
    pushToast(`"${plan.name}" created`, 'success');
  }, [pushToast]);

  const trendData = MRR_BY_RANGE[mrrRange];

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1320,
        margin: '0 auto',
        padding: '0 4px 48px',
        color: T.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
      }}
    >
      {/* ── Toast Stack ────────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}>
        <AnimatePresence>
          {toasts.map((toast) => {
            const toastColor = toast.tone === 'success' ? T.success : toast.tone === 'danger' ? T.danger : T.warning;
            return (
              <motion.div
                key={toast.id}
                variants={toastVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{
                  padding: '9px 18px',
                  borderRadius: 10,
                  background: toast.tone === 'success'
                    ? T.successDim
                    : toast.tone === 'danger'
                      ? T.dangerDim
                      : T.warningDim,
                  border: `1px solid ${toastColor}55`,
                  color: toastColor,
                  fontSize: 13,
                  fontWeight: 600,
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  pointerEvents: 'all',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                {toast.tone === 'success' && <CheckCircle2 size={14} />}
                {toast.tone === 'danger' && <AlertTriangle size={14} />}
                {toast.tone === 'warning' && <AlertTriangle size={14} />}
                {toast.message}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Layers size={14} strokeWidth={2.4} style={{ color: T.accent }} />
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: T.accent,
          }}>
            Admin · Plans &amp; Pricing
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.025em', margin: 0, lineHeight: 1.1 }}>
              Revenue Cockpit
            </h1>
            <p style={{ fontSize: 12.5, color: T.dim, marginTop: 5, marginBottom: 0 }}>
              Plan management + revenue analytics — one unified view
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              fontWeight: 700,
              color: T.success,
              background: T.successDim,
              border: `1px solid ${T.success}30`,
              borderRadius: 999,
              padding: '4px 10px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.success, boxShadow: `0 0 6px ${T.success}` }} />
              Live · 1 Jun 2026
            </span>
            <motion.button
              type="button"
              onClick={() => setShowNewPlanForm(true)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 10,
                border: 'none',
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 700,
                fontFamily: 'inherit',
                boxShadow: `0 4px 16px ${T.accent}40`,
              }}
            >
              <Plus size={13} strokeWidth={2.4} />
              New Plan
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 20,
      }}>
        <KpiCard
          label="Total MRR"
          value={totalMrr}
          prefix="$"
          delta="+12.4%"
          positive
          icon={DollarSign}
          accentColor={T.accent}
          index={0}
        />
        <KpiCard
          label="ARPU"
          value={arpu}
          prefix="$"
          delta="+$4.20"
          positive
          icon={BarChart2}
          accentColor={T.accentHi}
          index={1}
        />
        <KpiCard
          label="Total Subscribers"
          value={totalSubs}
          delta="+18"
          positive
          icon={Users}
          accentColor={T.success}
          index={2}
        />
        <KpiCard
          label="Paying %"
          value={payingPct}
          suffix="%"
          delta="+2.1pp"
          positive
          icon={Percent}
          accentColor={T.amber}
          index={3}
        />
      </div>

      {/* ── Analytics Row (MRR Trend + Donut + Subs Bars) ──────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr',
        gap: 14,
        marginBottom: 20,
      }}>
        {/* MRR Trend */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          style={{ ...T.glass, padding: '20px 22px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <TrendingUp size={13} style={{ color: T.accent, opacity: 0.8 }} />
              <span style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: T.dim,
              }}>
                MRR Trend
              </span>
            </div>
            {/* Range toggle */}
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}>
              {(['3m', '6m', '12m'] as RangeKey[]).map((r) => (
                <motion.button
                  key={r}
                  type="button"
                  onClick={() => setMrrRange(r)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    appearance: 'none',
                    cursor: 'pointer',
                    background: mrrRange === r
                      ? `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`
                      : 'transparent',
                    color: mrrRange === r ? '#fff' : T.faint,
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 11px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    transition: 'all 0.16s ease',
                  }}
                >
                  {r}
                </motion.button>
              ))}
            </div>
          </div>
          <AnimatedAreaChart data={trendData} rangeKey={mrrRange} accentColor={T.accent} />
        </motion.div>

        {/* Revenue by Plan Donut */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          style={{ ...T.glass, padding: '20px 22px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.dim }}>
              {donutMetric === 'mrr' ? 'MRR Split' : 'Subscribers Split'}
            </span>
            {/* Metric toggle */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['mrr', 'subscribers'] as const).map((m) => (
                <motion.button
                  key={m}
                  type="button"
                  onClick={() => setDonutMetric(m)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    appearance: 'none',
                    cursor: 'pointer',
                    padding: '3px 8px',
                    borderRadius: 5,
                    border: `1px solid ${donutMetric === m ? T.accent + '60' : 'rgba(255,255,255,0.10)'}`,
                    background: donutMetric === m ? T.accentDim : 'transparent',
                    color: donutMetric === m ? T.accent : T.faint,
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    transition: 'all 0.15s ease',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {m === 'mrr' ? '$' : 'S'}
                </motion.button>
              ))}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={donutMetric}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22 }}
            >
              <DonutChart
                plans={plans}
                highlightedId={highlightedId}
                onSelect={handleToggleHighlight}
                metric={donutMetric}
              />
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Subscribers per Plan bars */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          style={{ ...T.glass, padding: '20px 22px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
            <Users size={13} style={{ color: T.accentHi, opacity: 0.8 }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.dim }}>
              Subscribers / Plan
            </span>
          </div>
          <SubsBars
            plans={plans}
            highlightedId={highlightedId}
            onSelect={handleToggleHighlight}
          />
          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 10, color: T.faint }}>Total</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
              {totalSubs} subscribers
            </span>
          </div>
        </motion.div>
      </div>

      {/* ── Section Header ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <CreditCard size={13} style={{ color: T.accent, opacity: 0.8 }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.dim }}>
            Plan Management
          </span>
          <span style={{
            background: T.accentDim,
            color: T.accent,
            border: `1px solid ${T.accent}44`,
            borderRadius: 5,
            padding: '2px 7px',
            fontSize: 10.5,
            fontWeight: 700,
          }}>
            {plans.length} plans
          </span>
        </div>
        {highlightedId && (
          <motion.button
            type="button"
            onClick={() => setHighlightedId(null)}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)',
              color: T.dim,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            <X size={11} />
            Clear selection
          </motion.button>
        )}
      </motion.div>

      {/* ── Plan Cards Grid ───────────────────────────────────────────────── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
        }}
      >
        <AnimatePresence mode="popLayout">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isHighlighted={highlightedId === plan.id}
              isEditing={editingId === plan.id}
              onEdit={handleEditStart}
              onDelete={handleDelete}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onClick={handleToggleHighlight}
            />
          ))}
        </AnimatePresence>

        {/* Add Plan button */}
        <motion.div variants={itemVariants}>
          <AddPlanButton onClick={() => setShowNewPlanForm(true)} />
        </motion.div>
      </motion.div>

      {/* ── Plan Stats Summary ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
        style={{ ...T.glass, padding: '18px 22px', marginTop: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <ChevronUp size={13} style={{ color: T.accentHi, opacity: 0.8 }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.dim }}>
            Plan Revenue Breakdown
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
            <thead>
              <tr>
                {['Plan', 'Price', 'Subscribers', 'MRR Contribution', 'Share of MRR', 'ARPU', 'Status'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 12px',
                      textAlign: h === 'Plan' ? 'left' : 'right',
                      color: T.faint,
                      fontWeight: 700,
                      fontSize: 9.5,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      borderBottom: '1px solid rgba(255,255,255,0.07)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((plan, idx) => {
                const mrrShare = totalMrr > 0 ? (plan.mrr / totalMrr * 100).toFixed(1) : '0.0';
                const planArpu = plan.subscribers > 0 && plan.price > 0
                  ? `$${Math.round(plan.mrr / plan.subscribers)}`
                  : plan.price === 0 ? 'Free' : '—';

                return (
                  <motion.tr
                    key={plan.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: 0.5 + idx * 0.05 } }}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                    onClick={() => handleToggleHighlight(plan.id)}
                    style={{
                      cursor: 'pointer',
                      background: highlightedId === plan.id ? 'rgba(255,255,255,0.04)' : 'transparent',
                      outline: highlightedId === plan.id ? `1px solid ${plan.color}33` : 'none',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: plan.color, flexShrink: 0 }} />
                        {plan.name}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                      {plan.price === 0 ? 'Free' : `$${plan.price}/mo`}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                      {plan.subscribers}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: plan.mrr > 0 ? T.accent : T.faint, fontVariantNumeric: 'tabular-nums' }}>
                      {plan.mrr > 0 ? `$${plan.mrr.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
                        <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${mrrShare}%`, background: plan.color, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.text, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {mrrShare}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                      {planArpu}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        color: plan.subscribers > 0 ? T.success : T.faint,
                        background: plan.subscribers > 0 ? T.successDim : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${plan.subscribers > 0 ? T.success + '35' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 5,
                        padding: '2px 7px',
                      }}>
                        {plan.subscribers > 0 ? <CheckCircle2 size={9} strokeWidth={2.5} /> : null}
                        {plan.subscribers > 0 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ── New Plan Form Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewPlanForm && (
          <NewPlanForm
            onAdd={handleAddPlan}
            onClose={() => setShowNewPlanForm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
