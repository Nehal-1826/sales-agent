/**
 * Admin Billing Design Candidate: BL4 Health
 *
 * "Billing Health" — dunning / failed-payment triage dashboard.
 * Payment-success-rate gauge (animated arc via motion.path + spring),
 * animated KPI counters, dunning queue with AnimatePresence exit,
 * at-risk subscriptions with FLIP sort reorder, recent refunds list.
 *
 * Self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only.
 * Warm Aurora Glass palette: orange #F26522 / success #3ddc97 / danger #ff5c7a.
 * NO purple / violet / blue / teal / cyan / indigo / pink / random hsl().
 * framer-motion ^11 — motion.path pathLength, useSpring, animate(), Variants,
 * AnimatePresence, layout FLIP, staggered entrance, whileHover/whileTap.
 * All controls / subscriptions / rAF cleaned up in useEffect.
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
  useSpring,
  animate,
  type Variants,
} from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Mail,
  XCircle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
  Clock,
  TrendingDown,
  ArrowUpRight,
  ReceiptText,
  ShieldAlert,
  Banknote,
  Info,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  text:         '#ffffff',
  dim:          'rgba(255,255,255,0.62)',
  faint:        'rgba(255,255,255,0.38)',
  ghost:        'rgba(255,255,255,0.18)',
  accent:       '#F26522',
  accentLt:     '#FF8A4B',
  success:      '#3ddc97',
  successDim:   'rgba(61,220,151,0.14)',
  warning:      '#FF8A4B',
  warningDim:   'rgba(255,138,75,0.14)',
  danger:       '#ff5c7a',
  dangerDim:    'rgba(255,92,122,0.14)',
  glass:        'rgba(255,255,255,0.05)',
  glass2:       'rgba(255,255,255,0.08)',
  glass3:       'rgba(255,255,255,0.03)',
  border:       'rgba(255,255,255,0.10)',
  borderBright: 'rgba(255,255,255,0.18)',
  radius:       16,
  radiusSm:     10,
} as const;

function glassCard(extra?: CSSProperties): CSSProperties {
  return {
    background:           T.glass,
    border:               `1px solid ${T.border}`,
    backdropFilter:       'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius:         T.radius,
    ...extra,
  };
}

function glassInner(extra?: CSSProperties): CSSProperties {
  return {
    background:           T.glass2,
    border:               `1px solid ${T.border}`,
    backdropFilter:       'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    borderRadius:         T.radiusSm,
    ...extra,
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────
type RiskLevel = 'high' | 'medium' | 'low';
type SortKey   = 'risk' | 'days_past_due' | 'mrr';

interface FailedPayment {
  id:           string;
  workspace:    string;
  plan:         string;
  amount:       number;
  currency:     string;
  attempts:     number;
  last_error:   string;
  days_overdue: number;
  next_retry:   string;
}

interface AtRiskSub {
  id:           string;
  workspace:    string;
  plan:         string;
  mrr:          number;
  risk:         RiskLevel;
  days_past_due: number;
  reason:       string;
}

interface Refund {
  id:        string;
  workspace: string;
  amount:    number;
  reason:    string;
  date:      string;
  status:    'processed' | 'pending';
}

// ─── Mock data ─────────────────────────────────────────────────────────────────
const PAYMENT_SUCCESS_RATE = 96.4;

const INITIAL_FAILED: FailedPayment[] = [
  {
    id:           'fp-001',
    workspace:    'Acme Corp',
    plan:         'Pro Plus',
    amount:       149,
    currency:     'USD',
    attempts:     3,
    last_error:   'Insufficient funds',
    days_overdue: 14,
    next_retry:   'Jun 2, 09:00',
  },
  {
    id:           'fp-002',
    workspace:    'TechNova Ltd',
    plan:         'Agency',
    amount:       399,
    currency:     'USD',
    attempts:     2,
    last_error:   'Card declined (do_not_honor)',
    days_overdue: 8,
    next_retry:   'Jun 3, 14:00',
  },
  {
    id:           'fp-003',
    workspace:    'BlueWave Studio',
    plan:         'Pro',
    amount:       49,
    currency:     'USD',
    attempts:     1,
    last_error:   'Card expired',
    days_overdue: 3,
    next_retry:   'Jun 2, 18:00',
  },
  {
    id:           'fp-004',
    workspace:    'Vertex AI Co.',
    plan:         'Pro Plus',
    amount:       149,
    currency:     'USD',
    attempts:     4,
    last_error:   'Fraud risk (block)',
    days_overdue: 21,
    next_retry:   'Manual review',
  },
  {
    id:           'fp-005',
    workspace:    'SkyBridge Inc',
    plan:         'Starter',
    amount:       19,
    currency:     'USD',
    attempts:     2,
    last_error:   'Generic decline',
    days_overdue: 5,
    next_retry:   'Jun 4, 10:00',
  },
  {
    id:           'fp-006',
    workspace:    'Odalys Media',
    plan:         'Agency',
    amount:       399,
    currency:     'USD',
    attempts:     1,
    last_error:   'Bank network timeout',
    days_overdue: 1,
    next_retry:   'Jun 2, 20:00',
  },
];

const INITIAL_AT_RISK: AtRiskSub[] = [
  {
    id:            'ar-001',
    workspace:     'Acme Corp',
    plan:          'Pro Plus',
    mrr:           149,
    risk:          'high',
    days_past_due: 14,
    reason:        'Repeated failed payments (3×)',
  },
  {
    id:            'ar-002',
    workspace:     'TechNova Ltd',
    plan:          'Agency',
    mrr:           399,
    risk:          'high',
    days_past_due: 8,
    reason:        'Card declined — do_not_honor',
  },
  {
    id:            'ar-003',
    workspace:     'Vertex AI Co.',
    plan:          'Pro Plus',
    mrr:           149,
    risk:          'high',
    days_past_due: 21,
    reason:        'Fraud block — manual review',
  },
  {
    id:            'ar-004',
    workspace:     'SkyBridge Inc',
    plan:          'Starter',
    mrr:           19,
    risk:          'medium',
    days_past_due: 5,
    reason:        'First payment failed',
  },
  {
    id:            'ar-005',
    workspace:     'BlueWave Studio',
    plan:          'Pro',
    mrr:           49,
    risk:          'medium',
    days_past_due: 3,
    reason:        'Expired card on file',
  },
  {
    id:            'ar-006',
    workspace:     'Odalys Media',
    plan:          'Agency',
    mrr:           399,
    risk:          'low',
    days_past_due: 1,
    reason:        'First retry pending',
  },
];

const REFUNDS: Refund[] = [
  {
    id:        'ref-001',
    workspace: 'NexGen Labs',
    amount:    149,
    reason:    'Duplicate charge',
    date:      'May 30',
    status:    'processed',
  },
  {
    id:        'ref-002',
    workspace: 'Pixel & Code',
    amount:    49,
    reason:    'Customer request (churn)',
    date:      'May 28',
    status:    'processed',
  },
  {
    id:        'ref-003',
    workspace: 'DataFlow Systems',
    amount:    399,
    reason:    'Service disruption credit',
    date:      'May 27',
    status:    'processed',
  },
  {
    id:        'ref-004',
    workspace: 'CloudSpan Inc',
    amount:    19,
    reason:    'Accidental upgrade',
    date:      'May 25',
    status:    'pending',
  },
];

const MRR_AT_RISK = INITIAL_FAILED.reduce((s, f) => s + f.amount, 0);   // $1164

// ─── Framer-motion Variants ─────────────────────────────────────────────────
const pageVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

const cardVariants: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const rowVariants: Variants = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0,  transition: { duration: 0.35, ease: 'easeOut' } },
  exit:    {
    opacity:    0,
    x:          80,
    height:     0,
    marginBottom: 0,
    transition: { duration: 0.45, ease: [0.4, 0, 0.6, 1] },
  },
};

// ─── Animated counter hook ──────────────────────────────────────────────────
function useAnimatedCounter(target: number, decimals = 0, duration = 1.2) {
  const mv     = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 80, damping: 18 });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const ctrl = animate(mv, target, { duration, ease: 'easeOut' });
    return () => ctrl.stop();
  }, [target, duration, mv]);

  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      setDisplay(v.toFixed(decimals));
    });
    return unsub;
  }, [spring, decimals]);

  return display;
}

// ─── Payment-success-rate gauge ─────────────────────────────────────────────
const GAUGE_R       = 80;
const GAUGE_CX      = 100;
const GAUGE_CY      = 100;
const GAUGE_SW      = 14;
const ARC_START_DEG = 135;
const ARC_END_DEG   = 405;                           // 270° arc sweep (135 → 45 clockwise)
const ARC_SWEEP     = ARC_END_DEG - ARC_START_DEG;  // 270°

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s    = polarToXY(cx, cy, r, startDeg);
  const e    = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

// Total arc path length (approximate for a circular arc segment)
function arcLength(r: number, sweepDeg: number) {
  return (sweepDeg / 360) * 2 * Math.PI * r;
}

interface GaugeProps {
  rate: number; // 0–100
}

function SuccessGauge({ rate }: GaugeProps) {
  const pct        = rate / 100;
  const totalLen   = arcLength(GAUGE_R, ARC_SWEEP);
  const fillLen    = pct * totalLen;
  const trackPath  = describeArc(GAUGE_CX, GAUGE_CY, GAUGE_R, ARC_START_DEG, ARC_END_DEG);
  const fillPath   = describeArc(GAUGE_CX, GAUGE_CY, GAUGE_R, ARC_START_DEG, ARC_END_DEG);

  const displayRate = useAnimatedCounter(rate, 1, 1.6);

  const pathLen = useMotionValue(0);
  const springLen = useSpring(pathLen, { stiffness: 50, damping: 16 });
  const [strokeDash, setStrokeDash] = useState(`0 ${totalLen}`);

  useEffect(() => {
    const ctrl = animate(pathLen, fillLen, { duration: 1.8, ease: 'easeOut' });
    return () => ctrl.stop();
  }, [fillLen, pathLen]);

  useEffect(() => {
    const unsub = springLen.on('change', (v) => {
      setStrokeDash(`${Math.max(0, v)} ${totalLen}`);
    });
    return unsub;
  }, [springLen, totalLen]);

  const color = rate >= 95 ? T.success : rate >= 88 ? T.warning : T.danger;

  return (
    <div style={{ position: 'relative', width: 200, height: 160, margin: '0 auto' }}>
      <svg viewBox="0 0 200 200" width={200} height={160}
           style={{ overflow: 'visible', display: 'block' }}>
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke={T.border}
          strokeWidth={GAUGE_SW}
          strokeLinecap="round"
        />
        {/* Fill arc */}
        <path
          d={fillPath}
          fill="none"
          stroke={color}
          strokeWidth={GAUGE_SW}
          strokeLinecap="round"
          strokeDasharray={strokeDash}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)`, transition: 'stroke 0.6s' }}
        />
        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((p) => {
          const deg = ARC_START_DEG + (p / 100) * ARC_SWEEP;
          const inner = polarToXY(GAUGE_CX, GAUGE_CY, GAUGE_R - GAUGE_SW / 2 - 6, deg);
          const outer = polarToXY(GAUGE_CX, GAUGE_CY, GAUGE_R + GAUGE_SW / 2 + 2, deg);
          return (
            <line key={p} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                  stroke={T.ghost} strokeWidth={1.5} strokeLinecap="round" />
          );
        })}
        {/* Center readout */}
        <text x={GAUGE_CX} y={GAUGE_CY - 6} textAnchor="middle"
              fill={color} fontSize={28} fontWeight={800} fontFamily="inherit">
          {displayRate}%
        </text>
        <text x={GAUGE_CX} y={GAUGE_CY + 14} textAnchor="middle"
              fill={T.faint} fontSize={10} fontWeight={600} letterSpacing="0.1em">
          SUCCESS RATE
        </text>
        {/* Zone labels */}
        <text x={28} y={160} fill={T.faint} fontSize={8.5} fontWeight={600}>0%</text>
        <text x={158} y={160} fill={T.faint} fontSize={8.5} fontWeight={600}>100%</text>
      </svg>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────
interface ToastMsg { id: string; text: string; kind: 'success' | 'warn' | 'info' }

const toastVariants: Variants = {
  hidden:  { opacity: 0, y: 40, scale: 0.95 },
  visible: { opacity: 1, y: 0,  scale: 1,   transition: { type: 'spring', stiffness: 320, damping: 24 } },
  exit:    { opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.22 } },
};

function ToastStack({ toasts, onDone }: { toasts: ToastMsg[]; onDone: (id: string) => void }) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const last = toasts[toasts.length - 1];
    if (!last) return;
    const t = setTimeout(() => onDone(last.id), 3000);
    return () => clearTimeout(t);
  }, [toasts, onDone]);

  return (
    <div style={{
      position: 'fixed', bottom: 32, right: 32, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {toasts.map((t) => {
          const c = t.kind === 'success' ? T.success : t.kind === 'warn' ? T.warning : T.accentLt;
          return (
            <motion.div key={t.id}
              variants={toastVariants} initial="hidden" animate="visible" exit="exit"
              style={{
                ...glassCard({ borderRadius: T.radiusSm }),
                padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 8,
                borderLeft: `3px solid ${c}`,
                pointerEvents: 'auto',
                minWidth: 240,
              }}>
              <span style={{ color: c, fontSize: 13, fontWeight: 600 }}>{t.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ─── Risk badge ─────────────────────────────────────────────────────────────
function RiskBadge({ risk }: { risk: RiskLevel }) {
  const map: Record<RiskLevel, { color: string; bg: string; label: string }> = {
    high:   { color: T.danger,  bg: T.dangerDim,  label: 'HIGH' },
    medium: { color: T.warning, bg: T.warningDim, label: 'MED'  },
    low:    { color: T.success, bg: T.successDim, label: 'LOW'  },
  };
  const s = map[risk];
  return (
    <span style={{
      background:    s.bg,
      color:         s.color,
      border:        `1px solid ${s.color}44`,
      borderRadius:  6,
      padding:       '2px 7px',
      fontSize:      10,
      fontWeight:    800,
      letterSpacing: '0.1em',
    }}>{s.label}</span>
  );
}

// ─── Triage action button ───────────────────────────────────────────────────
function ActionBtn({
  icon: Icon,
  label,
  onClick,
  danger = false,
  accent = false,
}: {
  icon: typeof RefreshCw;
  label: string;
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
}) {
  const color = danger ? T.danger : accent ? T.accent : T.dim;
  return (
    <motion.button
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      style={{
        background:   'none',
        border:       `1px solid ${color}55`,
        borderRadius: 8,
        padding:      '4px 10px',
        color,
        fontSize:     11,
        fontWeight:   600,
        cursor:       'pointer',
        display:      'flex',
        alignItems:   'center',
        gap:          4,
        whiteSpace:   'nowrap',
      }}
    >
      <Icon size={11} strokeWidth={2.4} />
      {label}
    </motion.button>
  );
}

// ─── Sort button ────────────────────────────────────────────────────────────
function SortBtn({
  label,
  active,
  asc,
  onClick,
}: {
  label:   string;
  active:  boolean;
  asc:     boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        background:   active ? `${T.accent}22` : T.glass,
        border:       `1px solid ${active ? T.accent + '66' : T.border}`,
        borderRadius: 8,
        padding:      '4px 10px',
        color:        active ? T.accent : T.dim,
        fontSize:     11,
        fontWeight:   600,
        cursor:       'pointer',
        display:      'flex',
        alignItems:   'center',
        gap:          4,
      }}>
      {label}
      {active
        ? asc
          ? <ChevronUp size={11} strokeWidth={2.4} />
          : <ChevronDown size={11} strokeWidth={2.4} />
        : null}
    </motion.button>
  );
}

// ─── KPI card with animated counter ─────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  icon:     typeof CreditCard;
  label:    string;
  value:    number;
  sub:      string;
  color:    string;
  prefix?:  string;
  suffix?:  string;
  decimals?: number;
}) {
  const display = useAnimatedCounter(value, decimals, 1.1);
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.025, transition: { duration: 0.2 } }}
      style={{
        ...glassCard({ padding: '20px 22px', flex: 1, minWidth: 160 }),
        display:       'flex',
        flexDirection: 'column',
        gap:           10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          background:   `${color}22`,
          border:       `1px solid ${color}44`,
          borderRadius: 8,
          padding:      6,
          display:      'flex',
          color,
        }}>
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em',
                       color: T.faint, textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.dim }}>{prefix}</span>
        <span style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{display}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.dim }}>{suffix}</span>
      </div>
      <span style={{ fontSize: 12, color: T.faint }}>{sub}</span>
    </motion.div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export function AdmBilBL4Health() {
  const [failed,     setFailed]     = useState<FailedPayment[]>(INITIAL_FAILED);
  const [atRisk,     setAtRisk]     = useState<AtRiskSub[]>(INITIAL_AT_RISK);
  const [toasts,     setToasts]     = useState<ToastMsg[]>([]);
  const [sortKey,    setSortKey]    = useState<SortKey>('risk');
  const [sortAsc,    setSortAsc]    = useState(false);
  const [showRefunds, setShowRefunds] = useState(false);
  const toastId = useRef(0);

  // Derived counters — react to removed items
  const failedCount  = failed.length;
  const mrrAtRisk    = failed.reduce((s, f) => s + f.amount, 0);
  const refunds30d   = REFUNDS.reduce((s, r) => s + r.amount, 0);

  const addToast = useCallback((text: string, kind: ToastMsg['kind']) => {
    const id = `t-${++toastId.current}`;
    setToasts((prev) => [...prev, { id, text, kind }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Dunning actions
  const retryPayment = (fp: FailedPayment) => {
    setFailed((prev) => prev.filter((x) => x.id !== fp.id));
    setAtRisk((prev) => prev.filter((x) => x.workspace !== fp.workspace));
    addToast(`Retry queued for ${fp.workspace}`, 'info');
  };

  const contactWorkspace = (fp: FailedPayment) => {
    addToast(`Email sent to ${fp.workspace}`, 'success');
  };

  const markResolved = (fp: FailedPayment) => {
    setFailed((prev) => prev.filter((x) => x.id !== fp.id));
    setAtRisk((prev) => prev.filter((x) => x.workspace !== fp.workspace));
    addToast(`${fp.workspace} marked resolved`, 'success');
  };

  // Sort at-risk list (FLIP via layout prop)
  const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
  const sortedAtRisk = [...atRisk].sort((a, b) => {
    let diff = 0;
    if (sortKey === 'risk')          diff = riskOrder[a.risk] - riskOrder[b.risk];
    else if (sortKey === 'days_past_due') diff = a.days_past_due - b.days_past_due;
    else if (sortKey === 'mrr')      diff = a.mrr - b.mrr;
    return sortAsc ? diff : -diff;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  // Triage at-risk
  const triageAtRisk = (ar: AtRiskSub) => {
    setAtRisk((prev) => prev.filter((x) => x.id !== ar.id));
    addToast(`${ar.workspace} triaged`, 'warn');
  };

  const initialMrrAtRisk = MRR_AT_RISK;
  const mrrDisplay = useAnimatedCounter(mrrAtRisk, 0, 0.9);
  const failedDisplay = useAnimatedCounter(failedCount, 0, 0.8);

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      style={{
        padding:       '32px 28px',
        maxWidth:      1200,
        margin:        '0 auto',
        fontFamily:    'Inter, system-ui, sans-serif',
        color:         T.text,
        boxSizing:     'border-box',
      }}
    >
      {/* Header */}
      <motion.div variants={cardVariants} style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start',
                      justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            }}>
              <span style={{
                background:   `${T.danger}22`,
                border:       `1px solid ${T.danger}44`,
                borderRadius: 8, padding: '4px 8px',
                display:      'flex', alignItems: 'center', gap: 5,
                color:        T.danger, fontSize: 11, fontWeight: 700,
                letterSpacing: '0.09em', textTransform: 'uppercase',
              }}>
                <ShieldAlert size={11} strokeWidth={2.4} />
                Billing Health
              </span>
              <span style={{
                background:   T.dangerDim,
                border:       `1px solid ${T.danger}33`,
                borderRadius: 6, padding: '2px 8px',
                color:        T.danger, fontSize: 11, fontWeight: 700,
              }}>
                {failedCount} issues
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
              Dunning & Payment Triage
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: T.dim }}>
              Cross-workspace failed payments, at-risk subscriptions, and refunds
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <motion.div
              style={{
                ...glassCard({ padding: '7px 14px', borderRadius: T.radiusSm }),
                display:     'flex', alignItems: 'center', gap: 6,
                color:       T.dim, fontSize: 12, fontWeight: 600,
              }}
              whileHover={{ scale: 1.04 }}>
              <Clock size={13} strokeWidth={2.2} />
              Last sync: 2 min ago
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* KPI row + gauge */}
      <div style={{
        display:   'flex', gap: 16, marginBottom: 24,
        alignItems: 'stretch', flexWrap: 'wrap',
      }}>
        {/* Gauge card */}
        <motion.div
          variants={cardVariants}
          whileHover={{ scale: 1.015, transition: { duration: 0.2 } }}
          style={{
            ...glassCard({ padding: '24px 20px' }),
            minWidth:      220,
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            gap:           8,
          }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em',
                         color: T.faint, textTransform: 'uppercase', marginBottom: 4 }}>
            Payment Success Rate
          </span>
          <SuccessGauge rate={PAYMENT_SUCCESS_RATE} />
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            {[
              { label: 'Good',  color: T.success, at: '≥ 95%' },
              { label: 'Warn',  color: T.warning, at: '88–95%' },
              { label: 'Poor',  color: T.danger,  at: '< 88%' },
            ].map((z) => (
              <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3,
                               background: z.color, display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: T.faint }}>
                  {z.label} {z.at}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* KPI cards */}
        <motion.div variants={pageVariants}
          style={{ display: 'flex', gap: 16, flex: 1, flexWrap: 'wrap', minWidth: 0 }}>
          {/* Failed count — reactive */}
          <motion.div
            variants={cardVariants}
            whileHover={{ scale: 1.025, transition: { duration: 0.2 } }}
            style={{
              ...glassCard({ padding: '20px 22px', flex: 1, minWidth: 160 }),
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: `${T.danger}22`, border: `1px solid ${T.danger}44`,
                borderRadius: 8, padding: 6, display: 'flex', color: T.danger,
              }}>
                <XCircle size={15} strokeWidth={2.2} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em',
                             color: T.faint, textTransform: 'uppercase' }}>
                Failed Payments
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <motion.span
                key={failedCount}
                initial={{ scale: 1.3, color: T.danger }}
                animate={{ scale: 1, color: T.danger }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{ fontSize: 30, fontWeight: 800, color: T.danger, lineHeight: 1 }}>
                {failedDisplay}
              </motion.span>
              <span style={{ fontSize: 13, color: T.dim }}>in queue</span>
            </div>
            <span style={{ fontSize: 12, color: T.faint }}>Dunning retry queue</span>
          </motion.div>

          {/* MRR at risk — reactive */}
          <motion.div
            variants={cardVariants}
            whileHover={{ scale: 1.025, transition: { duration: 0.2 } }}
            style={{
              ...glassCard({ padding: '20px 22px', flex: 1, minWidth: 160 }),
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: `${T.warning}22`, border: `1px solid ${T.warning}44`,
                borderRadius: 8, padding: 6, display: 'flex', color: T.warning,
              }}>
                <TrendingDown size={15} strokeWidth={2.2} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em',
                             color: T.faint, textTransform: 'uppercase' }}>
                MRR at Risk
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.dim }}>$</span>
              <motion.span
                key={mrrAtRisk}
                initial={{ color: initialMrrAtRisk !== mrrAtRisk ? T.success : T.warning }}
                animate={{ color: T.warning }}
                transition={{ duration: 0.7 }}
                style={{ fontSize: 30, fontWeight: 800, color: T.warning, lineHeight: 1 }}>
                {mrrDisplay}
              </motion.span>
              <span style={{ fontSize: 13, color: T.dim }}>/mo</span>
            </div>
            <span style={{ fontSize: 12, color: T.faint }}>From failing subscriptions</span>
          </motion.div>

          <KpiCard
            icon={Banknote}
            label="Refunds (30d)"
            value={refunds30d}
            sub="4 refunds issued"
            color={T.accentLt}
            prefix="$"
          />

          <KpiCard
            icon={CheckCircle2}
            label="Recovered (30d)"
            value={23}
            sub="Via retry or update"
            color={T.success}
          />
        </motion.div>
      </div>

      {/* Dunning Queue */}
      <motion.div variants={cardVariants} style={{ marginBottom: 24 }}>
        <div style={{ ...glassCard({ padding: '0 0 0 0', overflow: 'hidden' }) }}>
          {/* Section header */}
          <div style={{
            padding:        '18px 22px',
            borderBottom:   `1px solid ${T.border}`,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            gap:            12,
            flexWrap:       'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CreditCard size={16} strokeWidth={2.2} style={{ color: T.danger }} />
              <span style={{ fontSize: 15, fontWeight: 700 }}>Dunning Queue</span>
              <span style={{
                background:    T.dangerDim,
                border:        `1px solid ${T.danger}44`,
                borderRadius:  6,
                padding:       '2px 8px',
                fontSize:      11,
                fontWeight:    700,
                color:         T.danger,
              }}>{failedCount}</span>
            </div>
            <span style={{ fontSize: 12, color: T.faint }}>
              Retry / contact / resolve to remove from queue
            </span>
          </div>

          {/* Column headers */}
          <div style={{
            display:       'grid',
            gridTemplateColumns: '1.4fr 0.9fr 0.7fr 0.7fr 1.4fr 0.6fr 1.6fr',
            gap:           8,
            padding:       '10px 22px',
            borderBottom:  `1px solid ${T.border}`,
          }}>
            {['Workspace', 'Plan', 'Amount', 'Attempts', 'Last Error', 'Overdue', 'Actions'].map((h) => (
              <span key={h} style={{
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.10em',
                color:         T.faint,
                textTransform: 'uppercase',
              }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          <div style={{ padding: '8px 0' }}>
            <AnimatePresence initial={false}>
              {failed.map((fp) => (
                <motion.div
                  key={fp.id}
                  variants={rowVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                  whileHover={{ background: T.glass2 }}
                  style={{
                    display:               'grid',
                    gridTemplateColumns:   '1.4fr 0.9fr 0.7fr 0.7fr 1.4fr 0.6fr 1.6fr',
                    gap:                   8,
                    padding:               '12px 22px',
                    alignItems:            'center',
                    borderBottom:          `1px solid ${T.border}`,
                    cursor:                'default',
                    transition:            'background 0.2s',
                  }}
                >
                  {/* Workspace */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width:         32, height: 32, borderRadius: 8,
                      background:    `${T.danger}18`,
                      border:        `1px solid ${T.danger}33`,
                      display:       'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize:      12, fontWeight: 800, color: T.danger,
                      flexShrink:    0,
                    }}>
                      {fp.workspace.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text,
                                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fp.workspace}
                    </span>
                  </div>

                  {/* Plan */}
                  <span style={{ fontSize: 12, color: T.dim }}>{fp.plan}</span>

                  {/* Amount */}
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.danger }}>
                    ${fp.amount}
                  </span>

                  {/* Attempts */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {Array.from({ length: Math.min(fp.attempts, 4) }).map((_, i) => (
                      <div key={i} style={{
                        width: 6, height: 6, borderRadius: 3,
                        background: i < fp.attempts ? T.danger : T.ghost,
                      }} />
                    ))}
                    <span style={{ fontSize: 11, color: T.faint }}>× {fp.attempts}</span>
                  </div>

                  {/* Last error */}
                  <span style={{
                    fontSize: 11, color: T.warning,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={fp.last_error}>
                    {fp.last_error}
                  </span>

                  {/* Days overdue */}
                  <span style={{
                    fontSize:   12,
                    fontWeight: 700,
                    color:      fp.days_overdue > 14 ? T.danger :
                                fp.days_overdue > 7  ? T.warning : T.dim,
                  }}>
                    {fp.days_overdue}d
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <ActionBtn icon={RefreshCw} label="Retry"    onClick={() => retryPayment(fp)}    accent />
                    <ActionBtn icon={Mail}      label="Contact"  onClick={() => contactWorkspace(fp)} />
                    <ActionBtn icon={CheckCircle2} label="Resolve" onClick={() => markResolved(fp)}   danger />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {failed.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  padding:    '32px 22px',
                  textAlign:  'center',
                  color:      T.success,
                  fontSize:   14,
                  fontWeight: 600,
                  display:    'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap:        8,
                }}>
                <CheckCircle2 size={18} strokeWidth={2.2} />
                Dunning queue clear — all payments healthy
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* At-risk subscriptions + refunds side-by-side */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        {/* At-risk list */}
        <motion.div variants={cardVariants} style={{ flex: 2, minWidth: 380 }}>
          <div style={{ ...glassCard({ padding: '0', overflow: 'hidden' }) }}>
            {/* Header */}
            <div style={{
              padding:        '18px 22px',
              borderBottom:   `1px solid ${T.border}`,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            12,
              flexWrap:       'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={15} strokeWidth={2.2} style={{ color: T.warning }} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>At-Risk Subscriptions</span>
                <span style={{
                  background:   T.warningDim,
                  border:       `1px solid ${T.warning}44`,
                  borderRadius: 6,
                  padding:      '2px 8px',
                  fontSize:     11,
                  fontWeight:   700,
                  color:        T.warning,
                }}>{atRisk.length}</span>
              </div>
              {/* Sort controls */}
              <div style={{ display: 'flex', gap: 6 }}>
                {(['risk', 'days_past_due', 'mrr'] as SortKey[]).map((k) => (
                  <SortBtn
                    key={k}
                    label={k === 'days_past_due' ? 'Days' : k === 'mrr' ? 'MRR' : 'Risk'}
                    active={sortKey === k}
                    asc={sortAsc}
                    onClick={() => handleSort(k)}
                  />
                ))}
              </div>
            </div>

            {/* Rows — layout FLIP */}
            <div style={{ padding: '8px 0' }}>
              <AnimatePresence initial={false}>
                {sortedAtRisk.map((ar) => (
                  <motion.div
                    key={ar.id}
                    layout
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    whileHover={{ background: T.glass2 }}
                    style={{
                      display:         'flex',
                      alignItems:      'center',
                      gap:             12,
                      padding:         '12px 22px',
                      borderBottom:    `1px solid ${T.border}`,
                      cursor:          'default',
                      transition:      'background 0.2s',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width:          36, height: 36, borderRadius: 9,
                      background:     ar.risk === 'high' ? T.dangerDim :
                                      ar.risk === 'medium' ? T.warningDim : T.successDim,
                      border:         `1px solid ${ar.risk === 'high' ? T.danger :
                                      ar.risk === 'medium' ? T.warning : T.success}44`,
                      display:        'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize:       13, fontWeight: 800,
                      color:          ar.risk === 'high' ? T.danger :
                                      ar.risk === 'medium' ? T.warning : T.success,
                      flexShrink:     0,
                    }}>
                      {ar.workspace.slice(0, 2).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text,
                                       overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ar.workspace}
                        </span>
                        <RiskBadge risk={ar.risk} />
                        <span style={{ fontSize: 11, color: T.faint }}>{ar.plan}</span>
                      </div>
                      <span style={{ fontSize: 11, color: T.faint, marginTop: 2, display: 'block' }}>
                        {ar.reason}
                      </span>
                    </div>

                    {/* Stats */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700,
                                    color: ar.risk === 'high' ? T.danger :
                                           ar.risk === 'medium' ? T.warning : T.dim }}>
                        ${ar.mrr}/mo
                      </div>
                      <div style={{ fontSize: 11, color: T.faint }}>{ar.days_past_due}d past due</div>
                    </div>

                    {/* Triage */}
                    <motion.button
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => triageAtRisk(ar)}
                      style={{
                        background:   `${T.accent}22`,
                        border:       `1px solid ${T.accent}55`,
                        borderRadius: 8,
                        padding:      '5px 10px',
                        color:        T.accent,
                        fontSize:     11,
                        fontWeight:   700,
                        cursor:       'pointer',
                        display:      'flex',
                        alignItems:   'center',
                        gap:          4,
                        flexShrink:   0,
                      }}>
                      <ArrowUpRight size={12} strokeWidth={2.4} />
                      Triage
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {atRisk.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    padding:    '28px 22px',
                    textAlign:  'center',
                    color:      T.success,
                    fontSize:   13,
                    fontWeight: 600,
                    display:    'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap:        8,
                  }}>
                  <CheckCircle2 size={16} strokeWidth={2.2} />
                  No at-risk subscriptions
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Refunds panel */}
        <motion.div variants={cardVariants} style={{ flex: 1, minWidth: 300 }}>
          <div style={{ ...glassCard({ padding: '0', overflow: 'hidden' }) }}>
            <div style={{
              padding:        '18px 22px',
              borderBottom:   `1px solid ${T.border}`,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ReceiptText size={15} strokeWidth={2.2} style={{ color: T.accentLt }} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>Refunds (30d)</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => setShowRefunds((v) => !v)}
                style={{
                  background:   T.glass,
                  border:       `1px solid ${T.border}`,
                  borderRadius: 7,
                  padding:      '4px 10px',
                  color:        T.dim,
                  fontSize:     11,
                  fontWeight:   600,
                  cursor:       'pointer',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          4,
                }}>
                {showRefunds ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showRefunds ? 'Collapse' : 'Expand'}
              </motion.button>
            </div>

            {/* Summary bar */}
            <div style={{
              ...glassInner({ margin: '16px 20px', borderRadius: T.radiusSm }),
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, color: T.faint, marginBottom: 4,
                              textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700 }}>
                  Total Refunded
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: T.accentLt }}>
                  ${refunds30d}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: T.faint, marginBottom: 4,
                              textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700 }}>
                  Count
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: T.dim }}>
                  {REFUNDS.length}
                </div>
              </div>
            </div>

            {/* Refund list — collapsible */}
            <AnimatePresence>
              {showRefunds && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '0 0 12px' }}>
                    {REFUNDS.map((r) => (
                      <div key={r.id} style={{
                        display:       'flex',
                        alignItems:    'center',
                        gap:           10,
                        padding:       '10px 22px',
                        borderBottom:  `1px solid ${T.border}`,
                      }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 7,
                          background: `${T.accentLt}18`,
                          border:     `1px solid ${T.accentLt}33`,
                          display:    'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <DollarSign size={13} strokeWidth={2.4} style={{ color: T.accentLt }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.workspace}
                          </div>
                          <div style={{ fontSize: 11, color: T.faint }}>{r.reason}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.accentLt }}>
                            -${r.amount}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                                        justifyContent: 'flex-end' }}>
                            <span style={{
                              fontSize:     10,
                              color:        r.status === 'processed' ? T.success : T.warning,
                              fontWeight:   700,
                            }}>
                              {r.status === 'processed' ? '✓ Processed' : '⏳ Pending'}
                            </span>
                            <span style={{ fontSize: 10, color: T.faint }}>{r.date}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer info */}
            {!showRefunds && (
              <div style={{
                padding:    '12px 22px 16px',
                display:    'flex',
                alignItems: 'center',
                gap:        6,
                color:      T.faint,
                fontSize:   11,
              }}>
                <Info size={11} strokeWidth={2.2} />
                {REFUNDS.length} refunds — expand to view details
              </div>
            )}
          </div>

          {/* Mini health insight */}
          <motion.div
            variants={cardVariants}
            style={{
              ...glassCard({ padding: '16px 20px', marginTop: 16 }),
              display:    'flex',
              gap:        12,
              alignItems: 'flex-start',
            }}>
            <span style={{
              background:   `${T.success}22`,
              border:       `1px solid ${T.success}44`,
              borderRadius: 8, padding: 6,
              color:        T.success, flexShrink: 0, display: 'flex',
            }}>
              <CheckCircle2 size={15} strokeWidth={2.2} />
            </span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>
                96.4% payment success
              </div>
              <div style={{ fontSize: 11, color: T.faint, lineHeight: 1.5 }}>
                Above SLA threshold (95%). 23 payments recovered via dunning retry in the last 30 days.
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Toast stack */}
      <ToastStack toasts={toasts} onDone={removeToast} />
    </motion.div>
  );
}
