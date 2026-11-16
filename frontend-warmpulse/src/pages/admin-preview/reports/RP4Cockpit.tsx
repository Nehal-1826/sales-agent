/**
 * Admin Reports Design Candidate: RP4 Reporting Cockpit
 *
 * "Reporting Cockpit" — platform-wide super-admin reporting overview:
 * animated KPI counters, type-breakdown animated donut, generation-over-time
 * SVG motion.path trend (14/30-day toggle re-animates), quick-generate panel
 * (type+format → spring progress bar → toast → prepends feed), recent-exports
 * feed with AnimatePresence staggered rows + download affordance, and upcoming
 * scheduled runs. Indian standards: ₹ via formatMoney, DD/MM/YYYY via formatDate,
 * counts via formatNumber.
 *
 * Animation inventory:
 * - Animated KPI counters (useMotionValue + animate → .on('change'), cleanup)
 * - Staggered entrance (motion container variants, staggerChildren)
 * - Animated donut (SVG strokeDasharray per-segment spring)
 * - Generation trend (motion.path pathLength 0→1 + area fade-in, re-keyed on range)
 * - Spring horizontal bars for type breakdown bar chart
 * - Quick-generate: motion.div spring progress fill → completion toast
 * - AnimatePresence stagger for recent-exports feed + toast notification
 * - whileHover/whileTap on interactive elements
 * - GPU-friendly (transform + opacity only)
 *
 * Self-contained: ONLY @/lib/format imported. All styles inline style={{}}.
 * Warm Aurora Glass palette: accent #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. NO purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
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
  FileText,
  Download,
  Calendar,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  DollarSign,
  Users,
  Mail,
  Activity,
  Cpu,
  BarChart2,
  RefreshCw,
  ChevronRight,
  Zap,
  Play,
  X,
} from 'lucide-react';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';

// ─── Design tokens ──────────────────────────────────────────────────────────

const T = {
  text:       '#ffffff',
  dim:        'rgba(255,255,255,0.62)',
  faint:      'rgba(255,255,255,0.42)',
  ghost:      'rgba(255,255,255,0.22)',
  hairline:   'rgba(255,255,255,0.08)',
  accent:     '#F26522',
  accentHi:   '#FF8A4B',
  success:    '#3ddc97',
  successDim: 'rgba(61,220,151,0.12)',
  warning:    '#FF8A4B',
  warningDim: 'rgba(255,138,75,0.12)',
  danger:     '#ff5c7a',
  dangerDim:  'rgba(255,92,122,0.12)',
  amber:      '#e8a838',
  amberDim:   'rgba(232,168,56,0.12)',
  gold:       '#c2a46e',
  goldDim:    'rgba(194,164,110,0.12)',
} as const;

function glass(extra?: CSSProperties): CSSProperties {
  return {
    background:          'rgba(255,255,255,0.05)',
    border:              '1px solid rgba(255,255,255,0.10)',
    backdropFilter:      'blur(10px)',
    WebkitBackdropFilter:'blur(10px)',
    borderRadius:        16,
    ...extra,
  };
}

function glassInner(extra?: CSSProperties): CSSProperties {
  return {
    background:          'rgba(255,255,255,0.08)',
    border:              '1px solid rgba(255,255,255,0.10)',
    backdropFilter:      'blur(6px)',
    WebkitBackdropFilter:'blur(6px)',
    borderRadius:        12,
    ...extra,
  };
}

const MICRO: CSSProperties = {
  fontSize:      10,
  fontWeight:    700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color:         T.faint,
};

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportType =
  | 'Revenue'
  | 'Subscriber Growth'
  | 'Warmup Usage'
  | 'Deliverability'
  | 'Peer Network Health'
  | 'LLM Cost';

type ExportFormat = 'CSV' | 'PDF' | 'XLSX';
type Range = '14d' | '30d';

// Per-type palette (warm/amber gradient steps only)
const TYPE_COLORS: Record<ReportType, string> = {
  'Revenue':             T.accent,
  'Subscriber Growth':   T.accentHi,
  'Warmup Usage':        T.amber,
  'Deliverability':      T.success,
  'Peer Network Health': T.gold,
  'LLM Cost':            T.warning,
};

// Format badge colors
const FORMAT_COLORS: Record<ExportFormat, { bg: string; text: string }> = {
  CSV:  { bg: 'rgba(61,220,151,0.14)',  text: T.success },
  PDF:  { bg: 'rgba(242,101,34,0.18)',  text: T.accent  },
  XLSX: { bg: 'rgba(232,168,56,0.16)',  text: T.amber   },
};

interface ExportRow {
  id:     string;
  name:   string;
  type:   ReportType;
  format: ExportFormat;
  size:   string;
  date:   string; // ISO
  by:     string;
  status: 'ready' | 'error';
}

interface ScheduledRun {
  id:     string;
  name:   string;
  type:   ReportType;
  format: ExportFormat;
  next:   string; // ISO
  cadence:string;
}

interface TrendPoint {
  label:  string;
  count:  number;
  revKr:  number; // revenue ₹k
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const TREND_30D: TrendPoint[] = [
  { label: '01/05', count: 14,  revKr: 182 },
  { label: '03/05', count: 18,  revKr: 234 },
  { label: '05/05', count: 11,  revKr: 143 },
  { label: '07/05', count: 22,  revKr: 286 },
  { label: '09/05', count: 19,  revKr: 247 },
  { label: '11/05', count: 27,  revKr: 351 },
  { label: '13/05', count: 24,  revKr: 312 },
  { label: '15/05', count: 31,  revKr: 403 },
  { label: '17/05', count: 29,  revKr: 377 },
  { label: '19/05', count: 36,  revKr: 468 },
  { label: '21/05', count: 33,  revKr: 429 },
  { label: '23/05', count: 41,  revKr: 533 },
  { label: '25/05', count: 38,  revKr: 494 },
  { label: '27/05', count: 45,  revKr: 585 },
  { label: '29/05', count: 42,  revKr: 546 },
  { label: '31/05', count: 52,  revKr: 676 },
];

const TREND_14D = TREND_30D.slice(8);

const TYPE_BREAKDOWN: { type: ReportType; count: number; pct: number }[] = [
  { type: 'Revenue',             count: 218, pct: 28 },
  { type: 'Warmup Usage',        count: 195, pct: 25 },
  { type: 'Subscriber Growth',   count: 148, pct: 19 },
  { type: 'Deliverability',      count: 117, pct: 15 },
  { type: 'LLM Cost',            count:  62, pct:  8 },
  { type: 'Peer Network Health', count:  39, pct:  5 },
];

const INITIAL_EXPORTS: ExportRow[] = [
  { id: 'e1', name: 'May 2026 Revenue Summary',        type: 'Revenue',             format: 'PDF',  size: '142 KB', date: '2026-05-31T14:22:00+05:30', by: 'devesh@warmpulse.io',    status: 'ready' },
  { id: 'e2', name: 'Q1 Subscriber Growth Report',     type: 'Subscriber Growth',   format: 'XLSX', size: '388 KB', date: '2026-05-30T11:08:00+05:30', by: 'amit.sharma@warmpulse.io', status: 'ready' },
  { id: 'e3', name: 'All-Workspace Warmup 30d',        type: 'Warmup Usage',        format: 'CSV',  size: '1.2 MB', date: '2026-05-29T16:45:00+05:30', by: 'devesh@warmpulse.io',    status: 'ready' },
  { id: 'e4', name: 'Deliverability Deep Dive',        type: 'Deliverability',      format: 'PDF',  size: '224 KB', date: '2026-05-28T09:30:00+05:30', by: 'priya.k@warmpulse.io',   status: 'ready' },
  { id: 'e5', name: 'LLM Cost Ledger May',             type: 'LLM Cost',            format: 'XLSX', size: '512 KB', date: '2026-05-27T13:55:00+05:30', by: 'devesh@warmpulse.io',    status: 'ready' },
  { id: 'e6', name: 'Peer Network Health Full Export', type: 'Peer Network Health', format: 'CSV',  size: '2.8 MB', date: '2026-05-26T08:15:00+05:30', by: 'amit.sharma@warmpulse.io', status: 'ready' },
  { id: 'e7', name: 'Revenue Breakdown April',         type: 'Revenue',             format: 'PDF',  size: '188 KB', date: '2026-05-25T17:40:00+05:30', by: 'priya.k@warmpulse.io',   status: 'ready' },
  { id: 'e8', name: 'Warmup Spike Investigation',      type: 'Warmup Usage',        format: 'CSV',  size: '860 KB', date: '2026-05-24T10:22:00+05:30', by: 'devesh@warmpulse.io',    status: 'error' },
];

const SCHEDULED_RUNS: ScheduledRun[] = [
  { id: 's1', name: 'Monthly Revenue PDF',         type: 'Revenue',           format: 'PDF',  next: '2026-06-01T09:00:00+05:30', cadence: 'Monthly' },
  { id: 's2', name: 'Weekly Warmup CSV',           type: 'Warmup Usage',      format: 'CSV',  next: '2026-06-02T08:00:00+05:30', cadence: 'Weekly'  },
  { id: 's3', name: 'Daily Deliverability XLSX',   type: 'Deliverability',    format: 'XLSX', next: '2026-06-01T07:30:00+05:30', cadence: 'Daily'   },
  { id: 's4', name: 'Bi-Weekly LLM Cost XLSX',     type: 'LLM Cost',          format: 'XLSX', next: '2026-06-07T10:00:00+05:30', cadence: 'Bi-weekly'},
];

const REPORT_TYPES: ReportType[] = [
  'Revenue',
  'Subscriber Growth',
  'Warmup Usage',
  'Deliverability',
  'Peer Network Health',
  'LLM Cost',
];

const EXPORT_FORMATS: ExportFormat[] = ['CSV', 'PDF', 'XLSX'];

// Type icons
const TYPE_ICONS: Record<ReportType, typeof FileText> = {
  'Revenue':             DollarSign,
  'Subscriber Growth':   Users,
  'Warmup Usage':        Mail,
  'Deliverability':      Activity,
  'Peer Network Health': RefreshCw,
  'LLM Cost':            Cpu,
};

// KPI mock values
const KPI_MTD_GENERATED = 247;
const KPI_ACTIVE_SCHEDULES = 12;
const KPI_EXPORTS_THIS_MONTH = 847;
const KPI_AVG_GEN_SECONDS = 3.4; // seconds

// ─── Motion variants ─────────────────────────────────────────────────────────

const PAGE_CONTAINER: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const CARD_ENTER: Variants = {
  hidden:   { opacity: 0, y: 22 },
  visible:  { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
};

const STAGGER_LIST: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055 } },
};

const ROW_ENTER: Variants = {
  hidden:  { opacity: 0, x: -14 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
  exit:    { opacity: 0, x: 14, transition: { duration: 0.22 } },
};

// ─── Animated counter hook ───────────────────────────────────────────────────

function useCounter(target: number, decimals = 0): string {
  const mv   = useMotionValue(0);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = mv.on('change', (v) => {
      if (decimals > 0) {
        setDisplay(v.toFixed(decimals));
      } else {
        setDisplay(formatNumber(Math.round(v)));
      }
    });
    return () => { ctrl.stop(); unsub(); };
  }, [target, decimals, mv]);

  return display;
}

// ─── KPI chip ────────────────────────────────────────────────────────────────

interface KpiChipProps {
  icon:     typeof FileText;
  label:    string;
  value:    number;
  decimals?:number;
  prefix?:  string;
  suffix?:  string;
  color?:   string;
  sub?:     string;
  delay?:   number;
}

function KpiChip({
  icon: Icon,
  label,
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  color = T.accent,
  sub = '',
  delay = 0,
}: KpiChipProps) {
  const display = useCounter(value, decimals);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22, delay }}
      whileHover={{ y: -3, transition: { type: 'spring', stiffness: 340, damping: 22 } }}
      whileTap={{ scale: 0.975 }}
      style={{
        ...glass({ padding: '16px 18px', borderRadius: 14, flex: 1, minWidth: 140 }),
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: `${color}1e`,
          border: `1px solid ${color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color={color} strokeWidth={2.2} />
        </div>
        <span style={MICRO}>{label}</span>
      </div>
      <div style={{
        fontSize: 26, fontWeight: 800, color: T.text,
        lineHeight: 1, letterSpacing: '-0.025em',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {prefix}{display}{suffix}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: T.faint }}>{sub}</div>
      )}
    </motion.div>
  );
}

// ─── Animated donut ──────────────────────────────────────────────────────────

function TypeDonut({ rangeKey }: { rangeKey: Range }) {
  const R    = 42;
  const cx   = 56;
  const cy   = 56;
  const circ = 2 * Math.PI * R;
  const GAP  = 1.8; // gap degrees

  let cumOffset = 0;

  return (
    <svg viewBox="0 0 112 112" style={{ width: 112, height: 112, flexShrink: 0 }}>
      {TYPE_BREAKDOWN.map((seg, i) => {
        const arcLen   = ((seg.pct - GAP) / 100) * circ;
        const element = (
          <motion.circle
            key={`${rangeKey}-donut-${seg.type}`}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={TYPE_COLORS[seg.type]}
            strokeWidth={11}
            strokeLinecap="butt"
            strokeDasharray={`${arcLen} ${circ - arcLen}`}
            strokeDashoffset={-cumOffset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
            initial={{ strokeDasharray: `0 ${circ}` }}
            animate={{ strokeDasharray: `${arcLen} ${circ - arcLen}` }}
            transition={{
              duration: 1.2,
              delay: 0.12 + i * 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        );
        cumOffset += (seg.pct / 100) * circ;
        return element;
      })}
      {/* Center */}
      <text
        x={cx} y={cy - 6}
        textAnchor="middle"
        fontSize="14"
        fontWeight="800"
        fill={T.text}
      >
        779
      </text>
      <text
        x={cx} y={cy + 10}
        textAnchor="middle"
        fontSize="8"
        fill={T.faint}
      >
        total MTD
      </text>
    </svg>
  );
}

// ─── Generation trend chart (hand-built SVG) ─────────────────────────────────

interface TrendChartProps {
  series:   TrendPoint[];
  rangeKey: Range;
}

function TrendChart({ series, rangeKey }: TrendChartProps) {
  const W   = 520;
  const H   = 120;
  const PAD = { top: 10, right: 14, bottom: 26, left: 36 };
  const iW  = W - PAD.left - PAD.right;
  const iH  = H - PAD.top  - PAD.bottom;

  const counts  = series.map((p) => p.count);
  const minV    = 0;
  const maxV    = Math.max(...counts) * 1.15;

  const toX = (i: number) =>
    PAD.left + (series.length < 2 ? 0 : (i / (series.length - 1)) * iW);
  const toY = (v: number) =>
    PAD.top + iH - ((v - minV) / (maxV - minV || 1)) * iH;

  const linePath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(p.count).toFixed(1)}`)
    .join(' ');

  const areaPath =
    `M ${toX(0).toFixed(1)},${(PAD.top + iH).toFixed(1)} ` +
    series.map((p, i) => `L ${toX(i).toFixed(1)},${toY(p.count).toFixed(1)}`).join(' ') +
    ` L ${toX(series.length - 1).toFixed(1)},${(PAD.top + iH).toFixed(1)} Z`;

  const gradId   = `rp4-trend-${rangeKey}`;
  const yTicks   = [0, Math.round(maxV / 2), Math.round(maxV)];
  const lastIdx  = series.length - 1;
  const lastVal  = counts[lastIdx] ?? 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={T.accent}  stopOpacity="0.40" />
          <stop offset="100%" stopColor={T.accent}  stopOpacity="0"    />
        </linearGradient>
      </defs>

      {/* Y-grid + labels */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD.left} y1={toY(t).toFixed(1)}
            x2={PAD.left + iW} y2={toY(t).toFixed(1)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1"
          />
          <text
            x={PAD.left - 5} y={toY(t) + 4}
            textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.32)"
          >
            {t}
          </text>
        </g>
      ))}

      {/* X labels */}
      {series.map((p, i) => {
        const step = Math.ceil(series.length / 6);
        if (i % step !== 0 && i !== lastIdx) return null;
        return (
          <text
            key={i}
            x={toX(i)} y={H - 4}
            textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.32)"
          >
            {p.label}
          </text>
        );
      })}

      {/* Area */}
      <motion.path
        key={`area-${rangeKey}`}
        d={areaPath}
        fill={`url(#${gradId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.15 }}
      />

      {/* Line */}
      <motion.path
        key={`line-${rangeKey}`}
        d={linePath}
        fill="none"
        stroke={T.accent}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
      />

      {/* Latest dot */}
      <motion.circle
        key={`dot-${rangeKey}`}
        cx={toX(lastIdx)}
        cy={toY(lastVal)}
        r={4.5}
        fill={T.accent}
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="1.5"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.6, type: 'spring', stiffness: 320, damping: 18 }}
      />
    </svg>
  );
}

// ─── Quick-generate panel ────────────────────────────────────────────────────

interface GenerateToastProps {
  message: string;
  onClose: () => void;
}

function GenerateToast({ message, onClose }: GenerateToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3800);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,   scale: 1   }}
      exit={{    opacity: 0, y: -8,  scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      style={{
        position:   'fixed',
        top:        20,
        right:      24,
        zIndex:     9999,
        ...glassInner({ padding: '12px 16px', borderRadius: 12 }),
        display:    'flex',
        alignItems: 'center',
        gap:        10,
        minWidth:   260,
        boxShadow: '0 8px 32px rgba(0,0,0,0.50)',
        border:     `1px solid ${T.success}44`,
      }}
    >
      <CheckCircle2 size={16} color={T.success} strokeWidth={2.2} />
      <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: T.faint, display: 'flex' }}
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}

interface QuickGenerateProps {
  onGenerated: (row: ExportRow) => void;
}

function QuickGeneratePanel({ onGenerated }: QuickGenerateProps) {
  const [selType,   setSelType]   = useState<ReportType>('Revenue');
  const [selFormat, setSelFormat] = useState<ExportFormat>('PDF');
  const [progress,  setProgress]  = useState(0);
  const [running,   setRunning]   = useState(false);
  const [toastMsg,  setToastMsg]  = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const handleGenerate = () => {
    if (running) return;
    setRunning(true);
    setProgress(0);
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const pct     = Math.min(1, elapsed / 2200);
      setProgress(pct);
      if (pct < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setRunning(false);
        const newRow: ExportRow = {
          id:     `gen-${Date.now()}`,
          name:   `${selType} — ${new Date().toLocaleDateString('en-GB')}`,
          type:   selType,
          format: selFormat,
          size:   selFormat === 'PDF' ? '156 KB' : selFormat === 'XLSX' ? '420 KB' : '1.1 MB',
          date:   new Date().toISOString(),
          by:     'devesh@warmpulse.io',
          status: 'ready',
        };
        onGenerated(newRow);
        setToastMsg(`${selType} (${selFormat}) ready — added to exports`);
        setProgress(0);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const TypeIcon = TYPE_ICONS[selType];
  const typeColor = TYPE_COLORS[selType];

  return (
    <>
      <AnimatePresence>
        {toastMsg && (
          <GenerateToast
            key="gen-toast"
            message={toastMsg}
            onClose={() => setToastMsg(null)}
          />
        )}
      </AnimatePresence>

      <div style={{
        ...glass({ padding: '18px 20px', borderRadius: 16 }),
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={14} color={T.accentHi} strokeWidth={2.2} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Quick Generate</span>
        </div>

        {/* Type selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...MICRO, letterSpacing: '0.09em' }}>Report type</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {REPORT_TYPES.map((t) => {
              const TIcon = TYPE_ICONS[t];
              const col   = TYPE_COLORS[t];
              const active = t === selType;
              return (
                <motion.button
                  key={t}
                  type="button"
                  onClick={() => setSelType(t)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: active ? `${col}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${active ? col + '66' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 8,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    color: active ? col : T.faint,
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    transition: 'all 0.18s ease',
                  }}
                >
                  <TIcon size={11} strokeWidth={2.2} />
                  {t}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Format selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...MICRO, letterSpacing: '0.09em' }}>Format</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {EXPORT_FORMATS.map((f) => {
              const fc     = FORMAT_COLORS[f];
              const active = f === selFormat;
              return (
                <motion.button
                  key={f}
                  type="button"
                  onClick={() => setSelFormat(f)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    background: active ? fc.bg : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${active ? fc.text + '55' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 8,
                    padding: '5px 14px',
                    cursor: 'pointer',
                    color: active ? fc.text : T.faint,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    transition: 'all 0.18s ease',
                  }}
                >
                  {f}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Summary preview */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          background: `${typeColor}10`,
          border: `1px solid ${typeColor}28`,
          borderRadius: 10,
        }}>
          <TypeIcon size={14} color={typeColor} strokeWidth={2.2} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
              {selType} · {selFormat}
            </div>
            <div style={{ fontSize: 10, color: T.faint }}>
              Platform-wide · Today · {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {running && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: T.faint }}>Generating…</span>
              <span style={{ fontSize: 11, color: T.accentHi, fontWeight: 700 }}>
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div style={{
              height: 5, background: 'rgba(255,255,255,0.07)',
              borderRadius: 5, overflow: 'hidden',
            }}>
              <motion.div
                style={{
                  height: '100%', borderRadius: 5,
                  background: `linear-gradient(90deg, ${T.accent}, ${T.accentHi})`,
                  originX: 0,
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: progress }}
                transition={{ ease: 'linear', duration: 0.05 }}
              />
            </div>
          </div>
        )}

        {/* Generate button */}
        <motion.button
          type="button"
          onClick={handleGenerate}
          disabled={running}
          whileHover={running ? {} : { scale: 1.02 }}
          whileTap={running ? {} : { scale: 0.97 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: running
              ? 'rgba(255,255,255,0.06)'
              : `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
            border: 'none',
            borderRadius: 10,
            padding: '10px 0',
            cursor: running ? 'not-allowed' : 'pointer',
            color: running ? T.faint : '#fff',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.02em',
            transition: 'background 0.22s',
          }}
        >
          {running
            ? <><Loader2 size={14} strokeWidth={2.2} style={{ animation: 'spin 0.9s linear infinite' }} /> Generating…</>
            : <><Play size={14} strokeWidth={2.2} /> Generate Report</>
          }
        </motion.button>

        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    </>
  );
}

// ─── Recent exports feed ─────────────────────────────────────────────────────

interface ExportFeedProps {
  exports: ExportRow[];
}

function ExportFeed({ exports }: ExportFeedProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <AnimatePresence initial={false}>
        {exports.map((row) => {
          const TIcon  = TYPE_ICONS[row.type];
          const tColor = TYPE_COLORS[row.type];
          const fColor = FORMAT_COLORS[row.format];

          return (
            <motion.div
              key={row.id}
              variants={ROW_ENTER}
              initial="hidden"
              animate="visible"
              exit="exit"
              layout
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10 }}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        10,
                padding:    '9px 10px',
                cursor:     'default',
              }}
            >
              {/* Type icon */}
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: `${tColor}18`,
                border: `1px solid ${tColor}28`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <TIcon size={14} color={tColor} strokeWidth={2.2} />
              </div>

              {/* Name + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: T.text,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {row.name}
                </div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>
                  {formatDate(row.date)} · {row.by.split('@')[0] ?? row.by}
                </div>
              </div>

              {/* Format badge */}
              <span style={{
                background: fColor.bg,
                color: fColor.text,
                border: `1px solid ${fColor.text}33`,
                borderRadius: 5,
                padding: '2px 7px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}>
                {row.format}
              </span>

              {/* Size */}
              <span style={{ fontSize: 10, color: T.faint, minWidth: 44, textAlign: 'right', flexShrink: 0 }}>
                {row.size}
              </span>

              {/* Status / download */}
              {row.status === 'error' ? (
                <div title="Generation failed" style={{ flexShrink: 0 }}>
                  <AlertCircle size={14} color={T.danger} strokeWidth={2} />
                </div>
              ) : (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.15, color: T.accentHi }}
                  whileTap={{ scale: 0.9 }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: T.faint, display: 'flex', padding: 4, flexShrink: 0,
                  }}
                  title="Download"
                >
                  <Download size={13} strokeWidth={2.2} />
                </motion.button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ─── Scheduled runs panel ────────────────────────────────────────────────────

function ScheduledRunsPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <motion.div variants={STAGGER_LIST} initial="hidden" animate="visible">
        {SCHEDULED_RUNS.map((run, i) => {
          const TIcon  = TYPE_ICONS[run.type];
          const tColor = TYPE_COLORS[run.type];
          const fColor = FORMAT_COLORS[run.format];

          return (
            <motion.div
              key={run.id}
              variants={ROW_ENTER}
              custom={i}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px',
                cursor: 'default',
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: `${tColor}15`,
                border: `1px solid ${tColor}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <TIcon size={13} color={tColor} strokeWidth={2.2} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {run.name}
                </div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>
                  Next: {formatDate(run.next)} · {run.cadence}
                </div>
              </div>

              <span style={{
                background: fColor.bg, color: fColor.text,
                border: `1px solid ${fColor.text}33`,
                borderRadius: 5, padding: '2px 6px',
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>
                {run.format}
              </span>

              <ChevronRight size={13} color={T.ghost} strokeWidth={2} style={{ flexShrink: 0 }} />
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AdmRptRP4Cockpit() {
  const [range,   setRange]   = useState<Range>('30d');
  const [exports, setExports] = useState<ExportRow[]>(INITIAL_EXPORTS);

  const trendData = range === '30d' ? TREND_30D : TREND_14D;

  const handleGenerated = useCallback((row: ExportRow) => {
    setExports((prev) => [row, ...prev]);
  }, []);

  // Revenue KPI formatted via formatMoney
  const revenueKr = 24_18_500; // ₹24,18,500

  return (
    <motion.div
      variants={PAGE_CONTAINER}
      initial="hidden"
      animate="visible"
      style={{
        padding: '20px 24px 36px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        minHeight: '100vh',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        color: T.text,
      }}
    >
      {/* ── Top bar ── */}
      <motion.div
        variants={CARD_ENTER}
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}
      >
        <div>
          <div style={MICRO}>Admin · Reports</div>
          <h1 style={{
            margin: 0, marginTop: 4,
            fontSize: 22, fontWeight: 800,
            color: T.text, letterSpacing: '-0.025em', lineHeight: 1.2,
          }}>
            Reporting Cockpit
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Range toggle */}
          <div style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 99, padding: 3, gap: 2,
          }}>
            {(['14d', '30d'] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                style={{
                  background: range === r ? T.accent : 'transparent',
                  color: range === r ? '#fff' : T.dim,
                  border: 'none', borderRadius: 99,
                  padding: '5px 14px',
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.22s, color 0.22s',
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Revenue pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(242,101,34,0.12)',
            border: '1px solid rgba(242,101,34,0.28)',
            borderRadius: 99, padding: '5px 12px',
            fontSize: 11, fontWeight: 700, color: T.accentHi,
          }}>
            <TrendingUp size={12} strokeWidth={2.4} />
            MTD Revenue: {formatMoney(revenueKr)}
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
          transition={{ duration: 0.28 }}
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
        >
          <KpiChip
            icon={FileText}
            label="Reports MTD"
            value={KPI_MTD_GENERATED}
            color={T.accent}
            sub="across all types"
            delay={0.04}
          />
          <KpiChip
            icon={Calendar}
            label="Active Schedules"
            value={KPI_ACTIVE_SCHEDULES}
            color={T.amber}
            sub="auto-recurring"
            delay={0.09}
          />
          <KpiChip
            icon={Download}
            label="Exports Month"
            value={KPI_EXPORTS_THIS_MONTH}
            color={T.success}
            sub="CSV + PDF + XLSX"
            delay={0.14}
          />
          <KpiChip
            icon={Clock}
            label="Avg Gen Time"
            value={KPI_AVG_GEN_SECONDS}
            decimals={1}
            suffix="s"
            color={KPI_AVG_GEN_SECONDS < 5 ? T.success : T.warning}
            sub="per report"
            delay={0.19}
          />
        </motion.div>
      </AnimatePresence>

      {/* ── Middle row: donut + breakdown + trend ── */}
      <motion.div
        variants={CARD_ENTER}
        style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14, alignItems: 'stretch' }}
      >
        {/* Left: type breakdown */}
        <div style={glass({ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={14} color={T.accentHi} strokeWidth={2.2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>By Report Type</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <TypeDonut rangeKey={range} />

            {/* Legend + bars */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 4 }}>
              {TYPE_BREAKDOWN.map((seg, i) => {
                const col = TYPE_COLORS[seg.type];
                return (
                  <motion.div
                    key={seg.type}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 22, delay: 0.15 + i * 0.08 }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: col, display: 'inline-block', flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 11, color: T.dim, fontWeight: 500 }}>
                          {seg.type.length > 16 ? seg.type.slice(0, 15) + '…' : seg.type}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: T.text, fontWeight: 700 }}>
                        {formatNumber(seg.count)}
                      </span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                      <motion.div
                        style={{ height: '100%', background: col, borderRadius: 3, originX: 0 }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: seg.pct / 100 }}
                        transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.2 + i * 0.07 }}
                        key={`bar-${range}-${seg.type}`}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: generation trend */}
        <div style={glass({ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={14} color={T.accent} strokeWidth={2.2} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                Reports Generated · {range}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{
                background: 'rgba(61,220,151,0.13)',
                border: '1px solid rgba(61,220,151,0.28)',
                borderRadius: 6, padding: '2px 8px',
                fontSize: 11, fontWeight: 700, color: T.success,
              }}>
                +18% vs prev
              </span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={range}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={{ height: 148, width: '100%' }}
            >
              <TrendChart series={trendData} rangeKey={range} />
            </motion.div>
          </AnimatePresence>

          {/* Micro stat row */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: 'Peak day',  value: String(Math.max(...trendData.map((p) => p.count))), color: T.accent  },
              { label: 'Avg/day',   value: String(Math.round(trendData.reduce((s, p) => s + p.count, 0) / (trendData.length || 1))), color: T.accentHi },
              { label: 'Total',     value: formatNumber(trendData.reduce((s, p) => s + p.count, 0)), color: T.amber },
              { label: 'Revenue MTD', value: formatMoney(revenueKr, { decimals: 0 }), color: T.success },
            ].map((m) => (
              <div key={m.label} style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, padding: '6px 8px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 9, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Bottom row: quick-generate + exports feed + schedules ── */}
      <motion.div
        variants={CARD_ENTER}
        style={{ display: 'grid', gridTemplateColumns: '280px 1fr 280px', gap: 14, alignItems: 'start' }}
      >
        {/* Quick generate */}
        <QuickGeneratePanel onGenerated={handleGenerated} />

        {/* Recent exports feed */}
        <div style={glass({ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Download size={14} color={T.accentHi} strokeWidth={2.2} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Recent Exports</span>
            </div>
            <span style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 5, padding: '2px 8px',
              fontSize: 10, fontWeight: 700, color: T.dim,
            }}>
              {exports.length} files
            </span>
          </div>

          <ExportFeed exports={exports} />
        </div>

        {/* Scheduled runs */}
        <div style={glass({ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={14} color={T.amber} strokeWidth={2.2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Upcoming Schedules</span>
          </div>

          <ScheduledRunsPanel />

          {/* Summary footer */}
          <div style={{
            paddingTop: 10,
            borderTop: `1px solid rgba(255,255,255,0.07)`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, color: T.faint }}>
              {KPI_ACTIVE_SCHEDULES} active schedules total
            </span>
            <motion.button
              type="button"
              whileHover={{ color: T.accentHi }}
              whileTap={{ scale: 0.95 }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.accent, fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 4, padding: 0,
              }}
            >
              View all <ChevronRight size={11} strokeWidth={2.4} />
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Format summary row ── */}
      <motion.div
        variants={CARD_ENTER}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}
      >
        {(
          [
            { format: 'CSV'  as ExportFormat, count: 388, size: '4.2 GB', icon: FileText,  desc: 'Raw data exports'       },
            { format: 'PDF'  as ExportFormat, count: 241, size: '892 MB', icon: FileText,  desc: 'Formatted summaries'    },
            { format: 'XLSX' as ExportFormat, count: 218, size: '1.8 GB', icon: BarChart2, desc: 'Spreadsheet reports'    },
          ] as { format: ExportFormat; count: number; size: string; icon: typeof FileText; desc: string }[]
        ).map(({ format, count, size, icon: Ic, desc }) => {
          const fc = FORMAT_COLORS[format];
          return (
            <motion.div
              key={format}
              whileHover={{ y: -2, transition: { type: 'spring', stiffness: 340, damping: 24 } }}
              whileTap={{ scale: 0.98 }}
              style={{
                ...glassInner({ padding: '14px 16px', borderRadius: 12 }),
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'default',
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: fc.bg,
                border: `1px solid ${fc.text}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Ic size={16} color={fc.text} strokeWidth={2.2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: fc.text }}>{format}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>
                    {formatNumber(count)}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{desc}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.dim }}>{size}</div>
                <div style={{ fontSize: 9, color: T.faint }}>storage used</div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
