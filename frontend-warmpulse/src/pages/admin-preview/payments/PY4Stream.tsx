/**
 * Admin Payments Design Candidate: PY4 Revenue Stream
 *
 * "Revenue Stream" — live pulse of money coming in.
 * Big cumulative collections ticker (useMotionValue + useSpring, formatted with
 * formatMoney), live transaction feed (AnimatePresence spring-slide rows,
 * pause/play toggle, interval cleanup), daily collections spring bar chart,
 * and a top-payers leaderboard with FLIP reorder by total paid or count.
 *
 * Framer-motion: useMotionValue/useSpring/animate for cumulative ticker,
 * AnimatePresence for live feed rows, layout FLIP on leaderboard reorder,
 * staggerChildren entrance, spring bar heights, whileHover/whileTap,
 * motion.path pathLength for SVG sparklines. All controls + subscriptions
 * + intervals cleaned up on unmount (StrictMode-safe).
 *
 * Self-contained: inline style={{}} only. No API / react-query / @/features /
 * @/lib/api. Only @/lib/format allowed from @/. Mock data only.
 * Aurora Glass dark palette, warm palette only —
 * NO purple/violet/blue/teal/cyan/indigo/pink.
 *
 * Indian standards: formatMoney (₹ INR), formatDate (DD/MM/YYYY),
 * formatNumber — all via @/lib/format.
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
  Zap,
  Play,
  Pause,
  CreditCard,
  Smartphone,
  Building2,
  TrendingUp,
  ChevronUp,
  ChevronDown,
  X,
  CheckCircle,
  XCircle,
  Clock,
  IndianRupee,
  BarChart3,
  Users,
  Star,
} from 'lucide-react';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';

// ─── Design Tokens ──────────────────────────────────────────────────────────────
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

// ─── Types ──────────────────────────────────────────────────────────────────────
type PayMethod = 'card' | 'upi' | 'netbanking';
type PayStatus = 'succeeded' | 'failed' | 'pending';
type LeaderMetric = 'total' | 'count';
type SortDir = 'asc' | 'desc';

interface TxnEvent {
  id: string;
  workspace: string;
  workspaceInitials: string;
  amount: number;
  method: PayMethod;
  status: PayStatus;
  plan: string;
  tsOffset: number; // seconds ago from "now" for display
  isoDate: string;
}

interface DailyBar {
  label: string; // "DD/MM"
  date: string;  // ISO
  total: number;
  count: number;
}

interface TopPayer {
  id: string;
  workspace: string;
  initials: string;
  totalPaid: number;
  txnCount: number;
  lastPaid: string; // ISO
  plan: string;
  sparkline: number[]; // 7 relative values 0..1
}

// ─── Mock Data ──────────────────────────────────────────────────────────────────

const WORKSPACE_POOL: { name: string; initials: string; plan: string }[] = [
  { name: 'Apex Digital',    initials: 'AD', plan: 'Agency' },
  { name: 'Helix Growth',    initials: 'HG', plan: 'Pro Plus' },
  { name: 'Bright Signal',   initials: 'BS', plan: 'Pro' },
  { name: 'Vortex Labs',     initials: 'VL', plan: 'Agency' },
  { name: 'ClearPath CRM',   initials: 'CC', plan: 'Pro Plus' },
  { name: 'Orbit Systems',   initials: 'OS', plan: 'Pro' },
  { name: 'Nexus Partners',  initials: 'NP', plan: 'Starter' },
  { name: 'Summit Media',    initials: 'SM', plan: 'Agency' },
  { name: 'Pulse Outreach',  initials: 'PO', plan: 'Pro' },
  { name: 'ZenSend Co.',     initials: 'ZS', plan: 'Pro Plus' },
];

const PLAN_AMOUNTS: Record<string, number[]> = {
  Agency:   [24900, 34900, 24900],
  'Pro Plus': [14900, 14900, 29800],
  Pro:       [7900,  7900,  15800],
  Starter:   [2900,  2900],
};

const METHOD_WEIGHTS = [0.55, 0.35, 0.10]; // realistic INR distribution

function weightedMethod(): PayMethod {
  const r = Math.random();
  if (r < METHOD_WEIGHTS[0]!) return 'card';
  if (r < (METHOD_WEIGHTS[0]! + METHOD_WEIGHTS[1]!)) return 'upi';
  return 'netbanking';
}

function statusForAmount(amount: number): PayStatus {
  const r = Math.random();
  if (amount > 20000) {
    return r < 0.92 ? 'succeeded' : r < 0.96 ? 'pending' : 'failed';
  }
  return r < 0.88 ? 'succeeded' : r < 0.94 ? 'pending' : 'failed';
}

// Seed deterministic-ish initial feed (14 transactions shown on load)
const INITIAL_FEED: TxnEvent[] = [
  { id: 'f01', workspace: 'Apex Digital',   workspaceInitials: 'AD', amount: 24900, method: 'card',       status: 'succeeded', plan: 'Agency',   tsOffset: 42,   isoDate: '2026-06-01T09:18:00+05:30' },
  { id: 'f02', workspace: 'ZenSend Co.',    workspaceInitials: 'ZS', amount: 14900, method: 'upi',        status: 'succeeded', plan: 'Pro Plus', tsOffset: 118,  isoDate: '2026-06-01T09:16:04+05:30' },
  { id: 'f03', workspace: 'Helix Growth',   workspaceInitials: 'HG', amount: 14900, method: 'card',       status: 'succeeded', plan: 'Pro Plus', tsOffset: 247,  isoDate: '2026-06-01T09:13:55+05:30' },
  { id: 'f04', workspace: 'Orbit Systems',  workspaceInitials: 'OS', amount: 7900,  method: 'upi',        status: 'succeeded', plan: 'Pro',      tsOffset: 390,  isoDate: '2026-06-01T09:11:32+05:30' },
  { id: 'f05', workspace: 'Summit Media',   workspaceInitials: 'SM', amount: 34900, method: 'netbanking', status: 'pending',   plan: 'Agency',   tsOffset: 512,  isoDate: '2026-06-01T09:09:30+05:30' },
  { id: 'f06', workspace: 'Bright Signal',  workspaceInitials: 'BS', amount: 7900,  method: 'card',       status: 'failed',    plan: 'Pro',      tsOffset: 680,  isoDate: '2026-06-01T09:06:42+05:30' },
  { id: 'f07', workspace: 'ClearPath CRM',  workspaceInitials: 'CC', amount: 29800, method: 'upi',        status: 'succeeded', plan: 'Pro Plus', tsOffset: 845,  isoDate: '2026-06-01T09:03:57+05:30' },
  { id: 'f08', workspace: 'Vortex Labs',    workspaceInitials: 'VL', amount: 24900, method: 'card',       status: 'succeeded', plan: 'Agency',   tsOffset: 1020, isoDate: '2026-06-01T09:01:02+05:30' },
  { id: 'f09', workspace: 'Nexus Partners', workspaceInitials: 'NP', amount: 2900,  method: 'upi',        status: 'succeeded', plan: 'Starter',  tsOffset: 1320, isoDate: '2026-06-01T08:57:42+05:30' },
  { id: 'f10', workspace: 'Pulse Outreach', workspaceInitials: 'PO', amount: 7900,  method: 'card',       status: 'succeeded', plan: 'Pro',      tsOffset: 1680, isoDate: '2026-06-01T08:52:02+05:30' },
  { id: 'f11', workspace: 'Apex Digital',   workspaceInitials: 'AD', amount: 34900, method: 'card',       status: 'succeeded', plan: 'Agency',   tsOffset: 2040, isoDate: '2026-06-01T08:46:02+05:30' },
  { id: 'f12', workspace: 'ZenSend Co.',    workspaceInitials: 'ZS', amount: 14900, method: 'upi',        status: 'pending',   plan: 'Pro Plus', tsOffset: 2400, isoDate: '2026-06-01T08:40:02+05:30' },
  { id: 'f13', workspace: 'Helix Growth',   workspaceInitials: 'HG', amount: 14900, method: 'card',       status: 'succeeded', plan: 'Pro Plus', tsOffset: 2820, isoDate: '2026-06-01T08:33:02+05:30' },
  { id: 'f14', workspace: 'Bright Signal',  workspaceInitials: 'BS', amount: 15800, method: 'netbanking', status: 'succeeded', plan: 'Pro',      tsOffset: 3300, isoDate: '2026-06-01T08:25:02+05:30' },
];

// 30-day daily collections (last 30 days ending 2026-06-01)
function buildDailyBars(): DailyBar[] {
  const base = [
    38200, 41500, 29800, 52100, 44700, 37900, 61400, 47300, 39800, 55200,
    42100, 48600, 35700, 67300, 51900, 43200, 58700, 46100, 72400, 54300,
    41800, 62900, 49700, 78100, 58400, 45600, 69200, 53800, 82500, 76400,
  ];
  const counts = [
    3, 4, 2, 5, 4, 3, 6, 4, 3, 5, 4, 4, 3, 6, 5, 4, 5, 4, 7, 5, 4, 6, 4, 7, 5, 4, 6, 5, 8, 7,
  ];
  const now = new Date('2026-06-01T00:00:00+05:30');
  return base.map((total, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    const label = formatDate(d);
    return { label: label.slice(0, 5), date: d.toISOString(), total, count: counts[i] ?? 3 };
  });
}

const DAILY_BARS = buildDailyBars();

const TOP_PAYERS: TopPayer[] = [
  { id: 'tp1', workspace: 'Apex Digital',   initials: 'AD', totalPaid: 347200, txnCount: 14, lastPaid: '2026-06-01T09:18:00+05:30', plan: 'Agency',   sparkline: [0.4, 0.6, 0.5, 0.8, 0.7, 0.9, 1.0] },
  { id: 'tp2', workspace: 'ZenSend Co.',    initials: 'ZS', totalPaid: 268400, txnCount: 18, lastPaid: '2026-06-01T09:16:04+05:30', plan: 'Pro Plus', sparkline: [0.3, 0.5, 0.4, 0.7, 0.6, 0.8, 0.9] },
  { id: 'tp3', workspace: 'ClearPath CRM', initials: 'CC', totalPaid: 238400, txnCount: 8,  lastPaid: '2026-06-01T09:03:57+05:30', plan: 'Pro Plus', sparkline: [0.5, 0.4, 0.7, 0.6, 0.9, 0.8, 1.0] },
  { id: 'tp4', workspace: 'Summit Media',   initials: 'SM', totalPaid: 209400, txnCount: 6,  lastPaid: '2026-06-01T09:09:30+05:30', plan: 'Agency',   sparkline: [0.6, 0.7, 0.5, 0.8, 0.7, 1.0, 0.9] },
  { id: 'tp5', workspace: 'Helix Growth',   initials: 'HG', totalPaid: 178800, txnCount: 12, lastPaid: '2026-06-01T09:13:55+05:30', plan: 'Pro Plus', sparkline: [0.2, 0.4, 0.6, 0.5, 0.7, 0.8, 1.0] },
  { id: 'tp6', workspace: 'Vortex Labs',    initials: 'VL', totalPaid: 149400, txnCount: 6,  lastPaid: '2026-06-01T09:01:02+05:30', plan: 'Agency',   sparkline: [0.4, 0.3, 0.6, 0.7, 0.8, 0.9, 1.0] },
  { id: 'tp7', workspace: 'Pulse Outreach', initials: 'PO', totalPaid: 118500, txnCount: 15, lastPaid: '2026-06-01T08:52:02+05:30', plan: 'Pro',      sparkline: [0.5, 0.6, 0.4, 0.7, 0.6, 0.9, 0.8] },
  { id: 'tp8', workspace: 'Orbit Systems',  initials: 'OS', totalPaid: 94800,  txnCount: 12, lastPaid: '2026-06-01T09:11:32+05:30', plan: 'Pro',      sparkline: [0.3, 0.5, 0.7, 0.6, 0.8, 0.7, 1.0] },
];

// Mock KPI totals
const CUMULATIVE_TOTAL = 18_74_500; // ₹18,74,500
const TODAY_COLLECTED = 76400;
const TODAY_COUNT = 7;
const SUCCESS_RATE = 91.4;
const AVG_TXN = 10800;

const MAX_FEED_ROWS = 12;
const FEED_INTERVAL_MS = 2800;

// ─── Framer-motion Variants ──────────────────────────────────────────────────────
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

const feedRowVariants: Variants = {
  hidden:  { opacity: 0, x: -40, scale: 0.96 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 360, damping: 28 },
  },
  exit: {
    opacity: 0,
    x: 40,
    scale: 0.94,
    transition: { duration: 0.22, ease: 'easeIn' },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────────

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function methodIcon(method: PayMethod): JSX.Element {
  if (method === 'card')       return <CreditCard  size={13} color={T.accentLight} />;
  if (method === 'upi')        return <Smartphone  size={13} color={T.success}     />;
  return                              <Building2   size={13} color={T.warning}      />;
}

function methodLabel(method: PayMethod): string {
  if (method === 'card')       return 'Card';
  if (method === 'upi')        return 'UPI';
  return 'NetBanking';
}

function statusBadge(status: PayStatus): JSX.Element {
  const cfg: Record<PayStatus, { bg: string; color: string; label: string; icon: JSX.Element }> = {
    succeeded: { bg: T.successDim, color: T.success, label: 'Success', icon: <CheckCircle size={10} /> },
    failed:    { bg: T.dangerDim,  color: T.danger,  label: 'Failed',  icon: <XCircle     size={10} /> },
    pending:   { bg: T.warningDim, color: T.warning, label: 'Pending', icon: <Clock       size={10} /> },
  };
  const c = cfg[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 6,
        background: c.bg,
        color: c.color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

// ─── Animated Counter Hook ────────────────────────────────────────────────────────
function useAnimCounter(target: number, duration = 1.2): number {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(mv, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => {
      ctrlRef.current?.stop();
    };
  }, [target, duration, mv]);

  return display;
}

// ─── Spring Ticker Hook ───────────────────────────────────────────────────────────
/** Returns a spring-smoothed display value that chases `target`. */
function useSpringValue(target: number): number {
  const mv = useMotionValue(target);
  const spring = useSpring(mv, { stiffness: 60, damping: 20 });
  const [display, setDisplay] = useState(target);
  const subRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    mv.set(target);
  }, [target, mv]);

  useEffect(() => {
    subRef.current = spring.on('change', (v: number) => setDisplay(v));
    return () => {
      subRef.current();
    };
  }, [spring]);

  return display;
}

// ─── Miniature Sparkline SVG ──────────────────────────────────────────────────────
function Sparkline({ values, animKey }: { values: number[]; animKey: string }) {
  const W = 56;
  const H = 22;
  const pad = 2;
  const n = values.length;
  if (n < 2) return null;

  const toX = (i: number) => pad + (i / (n - 1)) * (W - pad * 2);
  const toY = (v: number) => H - pad - v * (H - pad * 2);

  const points = values.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const pathD = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = points[i - 1]!;
    const cpx = (prev.x + pt.x) / 2;
    return `${acc} C ${cpx} ${prev.y} ${cpx} ${pt.y} ${pt.x} ${pt.y}`;
  }, '');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, flexShrink: 0 }}>
      <motion.path
        key={animKey}
        d={pathD}
        fill="none"
        stroke={T.accent}
        strokeWidth={1.8}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
      />
      <circle cx={points[n - 1]!.x} cy={points[n - 1]!.y} r={2.5} fill={T.accent} />
    </svg>
  );
}

// ─── Daily Bar Chart ──────────────────────────────────────────────────────────────
function DailyBarsChart({ bars, windowDays }: { bars: DailyBar[]; windowDays: 14 | 30 }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const visible = bars.slice(bars.length - windowDays);
  const maxTotal = Math.max(...visible.map((b) => b.total), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 96, paddingBottom: 20, position: 'relative' }}>
      {visible.map((bar, i) => {
        const frac = bar.total / maxTotal;
        const isHov = hovered === i;
        return (
          <div
            key={bar.date}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              height: '100%',
              position: 'relative',
              cursor: 'default',
            }}
          >
            {/* Tooltip */}
            {isHov && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(20,18,16,0.95)',
                  border: `1px solid ${T.accentGlow}`,
                  borderRadius: 8,
                  padding: '6px 10px',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                  marginBottom: 4,
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: T.accent }}>{bar.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{formatMoney(bar.total)}</div>
                <div style={{ fontSize: 10, color: T.dim }}>{formatNumber(bar.count)} txns</div>
              </div>
            )}
            <motion.div
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: frac, opacity: 1 }}
              transition={{
                delay: i * 0.018,
                duration: 0.6,
                type: 'spring',
                stiffness: 240,
                damping: 22,
              }}
              style={{
                width: '100%',
                height: '100%',
                background: isHov
                  ? `linear-gradient(0deg, ${T.accent} 0%, ${T.accentLight} 100%)`
                  : `linear-gradient(0deg, rgba(242,101,34,0.7) 0%, rgba(255,138,75,0.45) 100%)`,
                borderRadius: '3px 3px 1px 1px',
                transformOrigin: 'bottom',
                boxShadow: isHov ? `0 0 12px ${T.accentGlow}` : 'none',
                transition: 'background 0.18s ease, box-shadow 0.18s ease',
              }}
            />
            {/* X label — show every 5th */}
            {i % 5 === 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 2,
                  fontSize: 8,
                  color: T.faint,
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                }}
              >
                {bar.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Live Indicator Dot ───────────────────────────────────────────────────────────
function LiveDot() {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12 }}>
      <motion.span
        animate={{ scale: [1, 2.2, 1], opacity: [0.7, 0, 0.7] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: T.success,
        }}
      />
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.success, flexShrink: 0, position: 'relative' }} />
    </span>
  );
}

// ─── ID Generator ─────────────────────────────────────────────────────────────────
let _idSeq = 100;
function nextId(): string {
  _idSeq += 1;
  return `live-${_idSeq}`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function generateTxn(): TxnEvent {
  const ws = pickRandom(WORKSPACE_POOL);
  const amounts = PLAN_AMOUNTS[ws.plan] ?? [7900];
  const amount = pickRandom(amounts) as number;
  const method = weightedMethod();
  const status = statusForAmount(amount);
  return {
    id: nextId(),
    workspace: ws.name,
    workspaceInitials: ws.initials,
    amount,
    method,
    status,
    plan: ws.plan,
    tsOffset: 0,
    isoDate: new Date().toISOString(),
  };
}

// ─── Workspace Avatar ─────────────────────────────────────────────────────────────
function WsAvatar({ initials, size = 32 }: { initials: string; size?: number }) {
  const seed = initials.charCodeAt(0) + (initials.charCodeAt(1) ?? 0);
  const hues = [22, 35, 14, 40, 28];
  const hue = hues[seed % hues.length] ?? 22;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: `hsl(${hue}, 72%, 36%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: size * 0.35,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '-0.01em',
      }}
    >
      {initials}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────────
export function AdmPayPY4Stream() {
  // ── Feed state ──────────────────────────────────────────────────────────────
  const [feed, setFeed] = useState<TxnEvent[]>([...INITIAL_FEED]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cumulative ticker ────────────────────────────────────────────────────────
  const [cumulativeTarget, setCumulativeTarget] = useState(CUMULATIVE_TOTAL);
  const springCumulative = useSpringValue(cumulativeTarget);

  // ── KPI counters ─────────────────────────────────────────────────────────────
  const todayCounterDisplay = useAnimCounter(TODAY_COLLECTED, 1.4);
  const txnCountDisplay     = useAnimCounter(TODAY_COUNT, 1.1);
  const successRateDisplay  = useAnimCounter(SUCCESS_RATE, 1.3);
  const avgTxnDisplay       = useAnimCounter(AVG_TXN, 1.2);

  // ── Leaderboard sort ─────────────────────────────────────────────────────────
  const [leaderMetric, setLeaderMetric] = useState<LeaderMetric>('total');
  const [leaderDir, setLeaderDir]       = useState<SortDir>('desc');
  const [selectedPayer, setSelectedPayer] = useState<TopPayer | null>(null);

  // ── Daily bars window ─────────────────────────────────────────────────────────
  const [barsWindow, setBarsWindow] = useState<14 | 30>(30);

  // ── Pause toggle ─────────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
  }, []);

  // ── Live feed interval ────────────────────────────────────────────────────────
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return;
      const txn = generateTxn();
      if (txn.status === 'succeeded') {
        setCumulativeTarget((prev) => prev + txn.amount);
      }
      setFeed((prev) => {
        const next = [txn, ...prev];
        return next.slice(0, MAX_FEED_ROWS);
      });
    }, FEED_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // ── Leaderboard sorted ────────────────────────────────────────────────────────
  const sortedPayers = [...TOP_PAYERS].sort((a, b) => {
    const av = leaderMetric === 'total' ? a.totalPaid : a.txnCount;
    const bv = leaderMetric === 'total' ? b.totalPaid : b.txnCount;
    return leaderDir === 'desc' ? bv - av : av - bv;
  });

  const handleLeaderSort = useCallback(
    (metric: LeaderMetric) => {
      if (metric === leaderMetric) setLeaderDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      else { setLeaderMetric(metric); setLeaderDir('desc'); }
    },
    [leaderMetric],
  );

  // ── Max for leaderboard bar ───────────────────────────────────────────────────
  const leaderMax = Math.max(
    ...sortedPayers.map((p) => leaderMetric === 'total' ? p.totalPaid : p.txnCount),
    1,
  );

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '24px 28px 40px',
        boxSizing: 'border-box',
        fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
        color: T.text,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
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
              <IndianRupee size={18} color={T.accent} />
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
              Revenue Stream
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.dim }}>
            Live payment pulse · all workspaces · simulated stream
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LiveDot />
          <span style={{ fontSize: 12, fontWeight: 600, color: T.success }}>LIVE</span>
          <div
            style={{
              width: 1,
              height: 18,
              background: 'rgba(255,255,255,0.12)',
              margin: '0 4px',
            }}
          />
          <motion.button
            onClick={togglePause}
            whileTap={{ scale: 0.9 }}
            whileHover={{ background: T.accentDim }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 9,
              border: `1px solid rgba(255,255,255,0.14)`,
              background: 'transparent',
              color: T.dim,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
              transition: 'background 0.18s ease',
            }}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? 'Resume' : 'Pause'}
          </motion.button>
        </div>
      </motion.div>

      {/* ── Cumulative Ticker Hero ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        style={{
          ...T.glassDeep,
          padding: '28px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20,
          background: 'linear-gradient(135deg, rgba(242,101,34,0.10) 0%, rgba(255,138,75,0.05) 50%, rgba(255,255,255,0.04) 100%)',
          border: `1px solid rgba(242,101,34,0.22)`,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Zap size={15} color={T.accent} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: T.accentLight,
              }}
            >
              Cumulative Collections
            </span>
            <LiveDot />
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 900,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              background: `linear-gradient(135deg, #fff 30%, ${T.accentLight} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatMoney(Math.round(springCumulative))}
          </div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 8 }}>
            Across all workspaces · mock simulation · refreshes every {(FEED_INTERVAL_MS / 1000).toFixed(1)}s
          </div>
        </div>

        {/* Right: mini stats */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'This month', value: formatMoney(5_63_800), color: T.text },
            { label: 'Last month', value: formatMoney(4_87_200), color: T.dim },
            { label: 'Growth',     value: '+15.7%',              color: T.success },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                ...T.glassTight,
                padding: '12px 16px',
                minWidth: 110,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 5 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}
      >
        {[
          {
            icon: IndianRupee,
            label: "Today's Collections",
            value: formatMoney(Math.round(todayCounterDisplay)),
            sub: `${formatDate('2026-06-01')}`,
            color: T.accent,
            dimBg: T.accentDim,
          },
          {
            icon: BarChart3,
            label: 'Transactions Today',
            value: formatNumber(Math.round(txnCountDisplay)),
            sub: 'Across all plans',
            color: T.accentLight,
            dimBg: T.accentDim,
          },
          {
            icon: CheckCircle,
            label: 'Success Rate',
            value: `${successRateDisplay.toFixed(1)}%`,
            sub: 'Last 30 days',
            color: T.success,
            dimBg: T.successDim,
          },
          {
            icon: TrendingUp,
            label: 'Avg Transaction',
            value: formatMoney(Math.round(avgTxnDisplay)),
            sub: 'All methods',
            color: T.warning,
            dimBg: T.warningDim,
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              variants={cardVariants}
              whileHover={{ y: -3, boxShadow: `0 8px 32px ${kpi.dimBg}` }}
              style={{ ...T.glass, padding: '18px 20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: kpi.dimBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={14} color={kpi.color} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: T.faint }}>
                  {kpi.label}
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: kpi.color, fontVariantNumeric: 'tabular-nums' }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>{kpi.sub}</div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Main Content Row: Feed + Bars ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16 }}>

        {/* ── Live Transaction Feed ──────────────────────────────────────── */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          style={{ ...T.glass, padding: '20px', display: 'flex', flexDirection: 'column', gap: 0 }}
        >
          {/* Feed header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Transaction Feed</span>
                <LiveDot />
              </div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>
                Last {MAX_FEED_ROWS} events · {paused ? 'paused' : 'streaming'}
              </div>
            </div>
            <motion.button
              onClick={togglePause}
              whileTap={{ scale: 0.88 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 7,
                border: `1px solid ${paused ? T.accentGlow : 'rgba(255,255,255,0.12)'}`,
                background: paused ? T.accentDim : 'transparent',
                color: paused ? T.accentLight : T.faint,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {paused ? <Play size={11} /> : <Pause size={11} />}
              {paused ? 'Resume' : 'Pause'}
            </motion.button>
          </div>

          {/* Feed rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
            <AnimatePresence initial={false}>
              {feed.map((txn) => (
                <motion.div
                  key={txn.id}
                  variants={feedRowVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 10px',
                    borderRadius: 9,
                    background: txn.status === 'succeeded'
                      ? 'rgba(61,220,151,0.04)'
                      : txn.status === 'failed'
                      ? 'rgba(255,92,122,0.05)'
                      : 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <WsAvatar initials={txn.workspaceInitials} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: T.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 130,
                        }}
                      >
                        {txn.workspace}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: T.faint,
                          background: 'rgba(255,255,255,0.07)',
                          padding: '1px 6px',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {txn.plan}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {methodIcon(txn.method)}
                      <span style={{ fontSize: 10, color: T.faint }}>{methodLabel(txn.method)}</span>
                      <span style={{ fontSize: 10, color: T.ghost }}>·</span>
                      <span style={{ fontSize: 10, color: T.faint }}>{formatAge(txn.tsOffset)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: txn.status === 'failed' ? T.danger : T.accentLight,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatMoney(txn.amount)}
                    </span>
                    {statusBadge(txn.status)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Daily Collections Bar Chart ────────────────────────────────── */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          style={{ ...T.glass, padding: '20px', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Daily Collections</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>Per-day totals</div>
            </div>
            {/* Window toggle */}
            <div style={{ display: 'flex', gap: 4, padding: '3px', ...T.glassTight }}>
              {([14, 30] as const).map((w) => (
                <motion.button
                  key={w}
                  onClick={() => setBarsWindow(w)}
                  whileTap={{ scale: 0.92 }}
                  style={{
                    padding: '4px 11px',
                    borderRadius: 7,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: barsWindow === w ? T.accent : 'transparent',
                    color: barsWindow === w ? '#fff' : T.dim,
                    outline: 'none',
                  }}
                >
                  {w}d
                </motion.button>
              ))}
            </div>
          </div>

          <DailyBarsChart bars={DAILY_BARS} windowDays={barsWindow} />

          {/* Summary row under chart */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              marginTop: 14,
            }}
          >
            {[
              { label: 'Peak day',  value: formatMoney(82500),  color: T.accent },
              { label: 'Avg/day',   value: formatMoney(54080),  color: T.text },
              { label: 'Period total', value: formatMoney(16_22_400), color: T.accentLight },
            ].map((s) => (
              <div
                key={s.label}
                style={{ ...T.glassTight, padding: '10px 12px', textAlign: 'center' }}
              >
                <div style={{ fontSize: 10, color: T.faint, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Method breakdown pills */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              { icon: <CreditCard size={11} />, label: 'Card',       pct: '55%', color: T.accentLight },
              { icon: <Smartphone size={11} />, label: 'UPI',        pct: '35%', color: T.success },
              { icon: <Building2  size={11} />, label: 'NetBanking', pct: '10%', color: T.warning },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 20,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  fontSize: 11,
                  color: m.color,
                  fontWeight: 600,
                }}
              >
                {m.icon}
                {m.label}
                <span style={{ color: T.faint, fontWeight: 400 }}>{m.pct}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Top Payers Leaderboard ─────────────────────────────────────────── */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        style={{ ...T.glass, padding: '20px' }}
      >
        {/* Leaderboard header */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Star size={14} color={T.accent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Top Paying Workspaces</span>
            </div>
            <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>
              Ranked by {leaderMetric === 'total' ? 'total paid' : 'transaction count'}
            </div>
          </div>

          {/* Sort controls */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['total', 'count'] as LeaderMetric[]).map((m) => (
              <motion.button
                key={m}
                onClick={() => handleLeaderSort(m)}
                whileTap={{ scale: 0.92 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 12px',
                  borderRadius: 7,
                  border: `1px solid ${leaderMetric === m ? T.accentGlow : 'rgba(255,255,255,0.10)'}`,
                  background: leaderMetric === m ? T.accentDim : 'transparent',
                  color: leaderMetric === m ? T.accentLight : T.dim,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {m === 'total' ? 'Total Paid' : 'Txn Count'}
                {leaderMetric === m && (
                  leaderDir === 'desc' ? <ChevronDown size={11} /> : <ChevronUp size={11} />
                )}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Leaderboard rows with FLIP */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <AnimatePresence initial={false}>
            {sortedPayers.map((payer, rank) => {
              const metricVal = leaderMetric === 'total' ? payer.totalPaid : payer.txnCount;
              const barFrac   = metricVal / leaderMax;
              const isSelected = selectedPayer?.id === payer.id;

              return (
                <motion.div
                  key={payer.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30, delay: rank * 0.03 }}
                  onClick={() => setSelectedPayer((prev) => (prev?.id === payer.id ? null : payer))}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)', x: 2 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: isSelected
                      ? `1px solid rgba(242,101,34,0.40)`
                      : '1px solid transparent',
                    background: isSelected ? T.accentDim : 'transparent',
                    transition: 'border-color 0.18s, background 0.18s',
                  }}
                >
                  {/* Rank badge */}
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: rank < 3 ? T.accentDim : 'rgba(255,255,255,0.06)',
                      border: rank < 3 ? `1px solid ${T.accentGlow}` : '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      color: rank < 3 ? T.accent : T.faint,
                      flexShrink: 0,
                    }}
                  >
                    {rank + 1}
                  </div>

                  <WsAvatar initials={payer.initials} size={34} />

                  {/* Name + plan */}
                  <div style={{ minWidth: 140, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{payer.workspace}</div>
                    <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{payer.plan}</div>
                  </div>

                  {/* Metric bar */}
                  <div style={{ flex: 1, minWidth: 80 }}>
                    <div
                      style={{
                        height: 5,
                        borderRadius: 3,
                        background: 'rgba(255,255,255,0.08)',
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barFrac * 100}%` }}
                        transition={{ duration: 0.6, type: 'spring', stiffness: 240, damping: 22 }}
                        style={{
                          height: '100%',
                          background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>

                  {/* Total paid */}
                  <div style={{ minWidth: 90, textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                      {leaderMetric === 'total'
                        ? formatMoney(payer.totalPaid)
                        : formatNumber(payer.txnCount)}
                    </div>
                    <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>
                      {leaderMetric === 'total'
                        ? `${formatNumber(payer.txnCount)} txns`
                        : formatMoney(payer.totalPaid)}
                    </div>
                  </div>

                  {/* Sparkline */}
                  <Sparkline values={payer.sparkline} animKey={`${payer.id}-${leaderMetric}`} />

                  {/* Last paid */}
                  <div style={{ minWidth: 80, textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: T.faint }}>Last paid</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.dim }}>
                      {formatDate(payer.lastPaid)}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* ── Selected payer detail panel ─────────────────────────────────── */}
        <AnimatePresence>
          {selectedPayer && (
            <motion.div
              key="payer-detail"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div
                style={{
                  ...T.glassDeep,
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <WsAvatar initials={selectedPayer.initials} size={38} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
                        {selectedPayer.workspace}
                      </div>
                      <div style={{ fontSize: 11, color: T.faint }}>{selectedPayer.plan} plan</div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '8px 16px',
                    }}
                  >
                    {[
                      { label: 'Total Paid',  value: formatMoney(selectedPayer.totalPaid) },
                      { label: 'Transactions', value: formatNumber(selectedPayer.txnCount) },
                      { label: 'Avg Txn',
                        value: formatMoney(Math.round(selectedPayer.totalPaid / Math.max(selectedPayer.txnCount, 1))) },
                      { label: 'Last Payment', value: formatDate(selectedPayer.lastPaid) },
                    ].map((kv) => (
                      <div key={kv.label}>
                        <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                          {kv.label}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{kv.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'flex-start' }}>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    whileHover={{ background: T.accentDim }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      borderRadius: 9,
                      border: `1px solid ${T.accentGlow}`,
                      background: 'transparent',
                      color: T.accentLight,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <Users size={13} />
                    View Workspace
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={(e) => { e.stopPropagation(); setSelectedPayer(null); }}
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

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.5 }}
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: T.ghost,
          paddingBottom: 4,
        }}
      >
        Admin · Payments · Revenue Stream · mock simulation · ₹ INR · {formatDate('2026-06-01')}
      </motion.div>
    </div>
  );
}
