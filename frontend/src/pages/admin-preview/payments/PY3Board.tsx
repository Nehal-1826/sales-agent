/**
 * Admin Payments Design Candidate: PY3 Reconciliation Board
 *
 * "Reconciliation Board" — payments grouped into 4 Kanban-style lanes
 * (Succeeded / Pending / Failed / Refunded) for cross-workspace triage.
 * Admin can move cards between lanes (retry failed, confirm pending,
 * initiate refund) with full FLIP animation + re-spring lane headers.
 *
 * Framer-motion: animated counters, staggered card entrance, layout FLIP,
 * shared layoutId for cross-lane card glide, AnimatePresence enter/exit,
 * spring capacity bars, whileHover/whileTap, toast notifications.
 *
 * Self-contained: inline style={{}} only, mock data only.
 * NO API / react-query / @/features / @/lib/api imports.
 * Aurora Glass dark — warm palette: #F26522→#FF8A4B accent, #3ddc97 success,
 * #ff5c7a danger, no purple/blue/teal/cyan/indigo/pink.
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
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Search,
  CreditCard,
  Smartphone,
  Landmark,
  AlertTriangle,
  RotateCcw,
  ChevronRight,
  X,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Filter,
  SlidersHorizontal,
} from 'lucide-react';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';

// ─── Types ──────────────────────────────────────────────────────────────────

type TxnStatus = 'succeeded' | 'pending' | 'failed' | 'refunded';
type PayMethod = 'card' | 'upi' | 'netbanking';

interface Transaction {
  id: string;
  txnRef: string;
  workspace: string;
  email: string;
  amount: number;
  status: TxnStatus;
  method: PayMethod;
  plan: string;
  date: string;
  failReason?: string;
  retryCount?: number;
}

interface ToastMsg {
  id: string;
  text: string;
  type: 'success' | 'warning' | 'error';
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_TRANSACTIONS: Transaction[] = [
  // Succeeded
  {
    id: 'txn-001', txnRef: 'WP-2026-001234',
    workspace: 'Infratech Solutions', email: 'ops@infratech.in',
    amount: 4999, status: 'succeeded', method: 'card', plan: 'Growth',
    date: '2026-05-28T09:15:00+05:30',
  },
  {
    id: 'txn-002', txnRef: 'WP-2026-001235',
    workspace: 'Nexus Digital', email: 'billing@nexusdigital.in',
    amount: 9999, status: 'succeeded', method: 'upi', plan: 'Scale',
    date: '2026-05-27T14:30:00+05:30',
  },
  {
    id: 'txn-003', txnRef: 'WP-2026-001236',
    workspace: 'BlueSky Ventures', email: 'admin@bluesky.co.in',
    amount: 2499, status: 'succeeded', method: 'netbanking', plan: 'Starter',
    date: '2026-05-26T11:20:00+05:30',
  },
  {
    id: 'txn-004', txnRef: 'WP-2026-001237',
    workspace: 'TechForge Labs', email: 'payments@techforge.in',
    amount: 19999, status: 'succeeded', method: 'card', plan: 'Enterprise',
    date: '2026-05-25T16:45:00+05:30',
  },
  {
    id: 'txn-005', txnRef: 'WP-2026-001238',
    workspace: 'Quantum Leap Inc', email: 'ops@quantumleap.io',
    amount: 4999, status: 'succeeded', method: 'upi', plan: 'Growth',
    date: '2026-05-24T10:00:00+05:30',
  },
  // Pending
  {
    id: 'txn-006', txnRef: 'WP-2026-001239',
    workspace: 'Meridian Tech', email: 'cfo@meridiantech.in',
    amount: 9999, status: 'pending', method: 'netbanking', plan: 'Scale',
    date: '2026-05-29T08:50:00+05:30',
  },
  {
    id: 'txn-007', txnRef: 'WP-2026-001240',
    workspace: 'Apex Software', email: 'finance@apexsw.in',
    amount: 4999, status: 'pending', method: 'card', plan: 'Growth',
    date: '2026-05-29T12:10:00+05:30',
  },
  {
    id: 'txn-008', txnRef: 'WP-2026-001241',
    workspace: 'SunRise Corp', email: 'accounts@sunrise.co.in',
    amount: 2499, status: 'pending', method: 'upi', plan: 'Starter',
    date: '2026-05-30T07:30:00+05:30',
  },
  // Failed
  {
    id: 'txn-009', txnRef: 'WP-2026-001242',
    workspace: 'Ironclad Systems', email: 'billing@ironclad.in',
    amount: 9999, status: 'failed', method: 'card', plan: 'Scale',
    date: '2026-05-28T18:22:00+05:30',
    failReason: 'Insufficient funds', retryCount: 1,
  },
  {
    id: 'txn-010', txnRef: 'WP-2026-001243',
    workspace: 'Vertex Analytics', email: 'ops@vertexana.in',
    amount: 19999, status: 'failed', method: 'netbanking', plan: 'Enterprise',
    date: '2026-05-27T20:05:00+05:30',
    failReason: 'Bank declined — 3D Secure timeout', retryCount: 2,
  },
  {
    id: 'txn-011', txnRef: 'WP-2026-001244',
    workspace: 'Orion Platforms', email: 'billing@orion.io',
    amount: 4999, status: 'failed', method: 'upi', plan: 'Growth',
    date: '2026-05-29T09:45:00+05:30',
    failReason: 'UPI VPA not found', retryCount: 0,
  },
  // Refunded
  {
    id: 'txn-012', txnRef: 'WP-2026-001222',
    workspace: 'Pinnacle Works', email: 'admin@pinnacleworks.in',
    amount: 4999, status: 'refunded', method: 'card', plan: 'Growth',
    date: '2026-05-20T11:00:00+05:30',
  },
  {
    id: 'txn-013', txnRef: 'WP-2026-001218',
    workspace: 'Cascade Digital', email: 'billing@cascade.in',
    amount: 9999, status: 'refunded', method: 'upi', plan: 'Scale',
    date: '2026-05-18T14:15:00+05:30',
  },
  {
    id: 'txn-014', txnRef: 'WP-2026-001210',
    workspace: 'Stellar IO', email: 'ops@stellario.in',
    amount: 2499, status: 'refunded', method: 'netbanking', plan: 'Starter',
    date: '2026-05-15T09:30:00+05:30',
  },
  {
    id: 'txn-015', txnRef: 'WP-2026-001205',
    workspace: 'Nova Systems', email: 'finance@novasys.in',
    amount: 19999, status: 'refunded', method: 'card', plan: 'Enterprise',
    date: '2026-05-12T16:00:00+05:30',
  },
  {
    id: 'txn-016', txnRef: 'WP-2026-001201',
    workspace: 'Phoenix Digital', email: 'cfo@phoenixdigital.in',
    amount: 4999, status: 'refunded', method: 'upi', plan: 'Growth',
    date: '2026-05-10T13:20:00+05:30',
  },
];

// ─── Constants ───────────────────────────────────────────────────────────────

const LANE_META: Record<TxnStatus, {
  label: string;
  accent: string;
  dimAccent: string;
  bgAccent: string;
  Icon: typeof CheckCircle2;
  actions: { label: string; targetStatus: TxnStatus; icon: typeof RotateCcw }[];
}> = {
  succeeded: {
    label: 'Succeeded', accent: '#3ddc97', dimAccent: 'rgba(61,220,151,0.18)',
    bgAccent: 'rgba(61,220,151,0.06)', Icon: CheckCircle2,
    actions: [{ label: 'Refund', targetStatus: 'refunded', icon: RotateCcw }],
  },
  pending: {
    label: 'Pending', accent: '#FF8A4B', dimAccent: 'rgba(255,138,75,0.18)',
    bgAccent: 'rgba(255,138,75,0.06)', Icon: Clock,
    actions: [
      { label: 'Confirm', targetStatus: 'succeeded', icon: CheckCircle2 },
      { label: 'Reject', targetStatus: 'failed', icon: XCircle },
    ],
  },
  failed: {
    label: 'Failed', accent: '#ff5c7a', dimAccent: 'rgba(255,92,122,0.18)',
    bgAccent: 'rgba(255,92,122,0.06)', Icon: XCircle,
    actions: [{ label: 'Retry', targetStatus: 'pending', icon: RefreshCw }],
  },
  refunded: {
    label: 'Refunded', accent: '#aaa', dimAccent: 'rgba(170,170,170,0.15)',
    bgAccent: 'rgba(170,170,170,0.05)', Icon: RotateCcw,
    actions: [],
  },
};

const LANE_ORDER: TxnStatus[] = ['succeeded', 'pending', 'failed', 'refunded'];

const METHOD_ICONS: Record<PayMethod, typeof CreditCard> = {
  card: CreditCard,
  upi: Smartphone,
  netbanking: Landmark,
};

// ─── Animated counter ─────────────────────────────────────────────────────────

function AnimCounter({
  to, prefix = '', style,
}: {
  to: number; prefix?: string; style?: CSSProperties;
}) {
  const mv = useMotionValue(0);
  const spanRef = useRef<HTMLSpanElement>(null);
  const prevTo = useRef(to);

  useEffect(() => {
    if (prevTo.current === to) return;
    const ctrl = animate(mv, to, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (spanRef.current) {
          spanRef.current.textContent = prefix + formatNumber(Math.round(v));
        }
      },
    });
    prevTo.current = to;
    return () => ctrl.stop();
  }, [to, mv, prefix]);

  // First render — set immediately
  const displayVal = prefix + formatNumber(Math.round(mv.get() || to));

  return <span ref={spanRef} style={style}>{displayVal}</span>;
}

function AnimMoneyCounter({ to, style }: { to: number; style?: CSSProperties }) {
  const mv = useMotionValue(0);
  const spanRef = useRef<HTMLSpanElement>(null);
  const prevTo = useRef(to);

  useEffect(() => {
    if (prevTo.current === to) return;
    const ctrl = animate(mv, to, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (spanRef.current) {
          spanRef.current.textContent = formatMoney(Math.round(v));
        }
      },
    });
    prevTo.current = to;
    return () => ctrl.stop();
  }, [to, mv]);

  return <span ref={spanRef} style={style}>{formatMoney(Math.round(mv.get() || to))}</span>;
}

// ─── Spring bar ────────────────────────────────────────────────────────────────

function SpringBar({
  pct, accent, delay = 0,
}: { pct: number; accent: string; delay?: number }) {
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
      <motion.div
        initial={{ width: '0%' }}
        animate={{ width: `${Math.min(pct, 100)}%` }}
        transition={{ type: 'spring', stiffness: 90, damping: 18, delay }}
        style={{ height: '100%', background: accent, borderRadius: 4 }}
      />
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────

const toastVariants: Variants = {
  initial: { opacity: 0, y: 32, scale: 0.92 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 280, damping: 22 } },
  exit: { opacity: 0, y: 16, scale: 0.95, transition: { duration: 0.25 } },
};

function ToastStack({ toasts, onDismiss }: { toasts: ToastMsg[]; onDismiss: (id: string) => void }) {
  const colorsMap: Record<ToastMsg['type'], string> = {
    success: '#3ddc97',
    warning: '#FF8A4B',
    error: '#ff5c7a',
  };
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            variants={toastVariants}
            initial="initial" animate="animate" exit="exit"
            style={{
              background: 'rgba(20,18,30,0.97)',
              backdropFilter: 'blur(16px)',
              border: `1px solid ${colorsMap[t.type]}55`,
              borderRadius: 12,
              padding: '10px 16px',
              color: '#fff',
              fontSize: 13.5,
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${colorsMap[t.type]}22`,
              minWidth: 240, maxWidth: 340,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorsMap[t.type], flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t.text}</span>
            <button
              onClick={() => onDismiss(t.id)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Card Detail Panel ────────────────────────────────────────────────────────

const panelVariants: Variants = {
  hidden: { x: 380, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 220, damping: 26 } },
  exit: { x: 380, opacity: 0, transition: { duration: 0.22 } },
};

function DetailPanel({
  txn, onClose, onAction,
}: {
  txn: Transaction;
  onClose: () => void;
  onAction: (txn: Transaction, target: TxnStatus) => void;
}) {
  const meta = LANE_META[txn.status];
  const methodLabel = { card: 'Credit / Debit Card', upi: 'UPI', netbanking: 'Net Banking' }[txn.method];

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden" animate="visible" exit="exit"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 380, background: 'rgba(14,12,22,0.98)',
        backdropFilter: 'blur(24px)',
        borderLeft: `1px solid rgba(255,255,255,0.09)`,
        zIndex: 500, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '24px 24px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: meta.accent, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Transaction Detail
          </span>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
          >
            <X size={15} />
          </motion.button>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
          {formatMoney(txn.amount)}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{txn.txnRef}</div>
      </div>
      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <meta.Icon size={15} color={meta.accent} />
          <span style={{ fontSize: 13, color: meta.accent, fontWeight: 600 }}>{meta.label}</span>
        </div>
        {/* Detail rows */}
        {[
          ['Workspace', txn.workspace],
          ['Email', txn.email],
          ['Plan', txn.plan],
          ['Method', methodLabel],
          ['Date', formatDate(txn.date)],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 13 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
            <span style={{ color: '#fff', fontWeight: 500, maxWidth: 220, textAlign: 'right' }}>{val}</span>
          </div>
        ))}
        {txn.failReason && (
          <div style={{ background: 'rgba(255,92,122,0.1)', border: '1px solid rgba(255,92,122,0.25)', borderRadius: 10, padding: '10px 14px', marginTop: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#ff5c7a', fontWeight: 600, marginBottom: 4 }}>Failure Reason</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{txn.failReason}</div>
            {(txn.retryCount ?? 0) > 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                Retry attempts: {txn.retryCount}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Actions */}
      {meta.actions.length > 0 && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {meta.actions.map((action) => {
            const ActionIcon = action.icon;
            const targetMeta = LANE_META[action.targetStatus];
            return (
              <motion.button
                key={action.label}
                whileHover={{ scale: 1.02, backgroundColor: `${meta.accent}22` }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onAction(txn, action.targetStatus)}
                style={{
                  background: `${meta.accent}14`,
                  border: `1px solid ${meta.accent}44`,
                  borderRadius: 10, padding: '11px 16px',
                  color: meta.accent, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13.5, fontWeight: 600,
                }}
              >
                <ActionIcon size={15} />
                {action.label} → {targetMeta.label}
              </motion.button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── Transaction Card ─────────────────────────────────────────────────────────

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 22, delay: i * 0.06 },
  }),
  exit: { opacity: 0, scale: 0.9, y: -10, transition: { duration: 0.2 } },
};

function TxnCard({
  txn, index, onSelect, meta,
}: {
  txn: Transaction;
  index: number;
  onSelect: (txn: Transaction) => void;
  meta: typeof LANE_META[TxnStatus];
}) {
  const MethodIcon = METHOD_ICONS[txn.method] ?? CreditCard;
  const methodShort = { card: 'Card', upi: 'UPI', netbanking: 'NetBanking' }[txn.method];

  return (
    <motion.div
      layout
      layoutId={txn.id}
      key={txn.id}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      custom={index}
      whileHover={{ y: -2, boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${meta.accent}44` }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(txn)}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid rgba(255,255,255,0.08)`,
        borderRadius: 14,
        padding: '14px 16px',
        cursor: 'pointer',
        marginBottom: 10,
        backdropFilter: 'blur(10px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left accent stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, background: meta.accent, borderRadius: '14px 0 0 14px',
      }} />
      <div style={{ paddingLeft: 4 }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {txn.workspace}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {txn.email}
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: meta.accent, flexShrink: 0, marginLeft: 8 }}>
            {formatMoney(txn.amount)}
          </div>
        </div>
        {/* Bottom row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MethodIcon size={12} color="rgba(255,255,255,0.4)" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{methodShort}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>·</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{txn.plan}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {txn.failReason && (
              <AlertTriangle size={11} color="#ff5c7a" />
            )}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{formatDate(txn.date)}</span>
            <ChevronRight size={12} color="rgba(255,255,255,0.2)" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Lane ─────────────────────────────────────────────────────────────────────

const laneVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 200, damping: 24, delay: i * 0.08 },
  }),
};

function Lane({
  status, transactions, laneIndex, onSelect, totalGross,
}: {
  status: TxnStatus;
  transactions: Transaction[];
  laneIndex: number;
  onSelect: (txn: Transaction) => void;
  totalGross: number;
}) {
  const meta = LANE_META[status];
  const LaneIcon = meta.Icon;
  const laneTotal = transactions.reduce((s, t) => s + t.amount, 0);
  const pct = totalGross > 0 ? (laneTotal / totalGross) * 100 : 0;

  return (
    <motion.div
      layout
      variants={laneVariants}
      initial="hidden"
      animate="visible"
      custom={laneIndex}
      style={{
        flex: '0 0 300px',
        display: 'flex',
        flexDirection: 'column',
        background: meta.bgAccent,
        border: `1px solid ${meta.dimAccent}`,
        borderRadius: 18,
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 240px)',
        minHeight: 300,
      }}
    >
      {/* Lane header */}
      <div style={{
        padding: '16px 18px 12px',
        background: `linear-gradient(135deg, ${meta.dimAccent}, transparent)`,
        borderBottom: `1px solid ${meta.dimAccent}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <LaneIcon size={16} color={meta.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {meta.label}
          </span>
          <motion.div
            layout
            style={{
              marginLeft: 'auto',
              background: meta.dimAccent,
              border: `1px solid ${meta.accent}55`,
              borderRadius: 20, padding: '2px 9px',
              fontSize: 12, fontWeight: 700, color: meta.accent,
            }}
          >
            <AnimCounter to={transactions.length} />
          </motion.div>
        </div>
        <motion.div layout style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
          <AnimMoneyCounter to={laneTotal} />
        </motion.div>
        <SpringBar pct={pct} accent={meta.accent} delay={laneIndex * 0.1} />
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
          {formatNumber(Math.round(pct))}% of gross
        </div>
      </div>

      {/* Card scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', scrollbarWidth: 'thin' }}>
        <AnimatePresence mode="popLayout">
          {transactions.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}
            >
              No transactions
            </motion.div>
          ) : (
            transactions.map((txn, i) => (
              <TxnCard
                key={txn.id}
                txn={txn}
                index={i}
                onSelect={onSelect}
                meta={meta}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Summary KPI Strip ────────────────────────────────────────────────────────

const kpiVariants: Variants = {
  hidden: { opacity: 0, y: -18 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 22, delay: 0.05 + i * 0.07 },
  }),
};

function KPICard({
  label, value, sub, accent, Icon, index,
}: {
  label: string;
  value: number;
  sub?: string;
  accent: string;
  Icon: typeof TrendingUp;
  index: number;
}) {
  return (
    <motion.div
      variants={kpiVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      whileHover={{ y: -3, boxShadow: `0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px ${accent}44` }}
      style={{
        flex: '1 1 180px',
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid rgba(255,255,255,0.08)`,
        borderRadius: 16,
        padding: '16px 20px',
        backdropFilter: 'blur(10px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${accent}, transparent)`,
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {label}
        </span>
        <Icon size={15} color={accent} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
        <AnimMoneyCounter to={value} />
      </div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{sub}</div>}
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdmPayPY3Board() {
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<PayMethod | 'all'>('all');
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastTimer = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    const timers = toastTimer.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const addToast = useCallback((text: string, type: ToastMsg['type'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-3), { id, text, type }]);
    const handle = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimer.current.delete(id);
    }, 3800);
    toastTimer.current.set(id, handle);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = toastTimer.current.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      toastTimer.current.delete(id);
    }
  }, []);

  const handleAction = useCallback((txn: Transaction, targetStatus: TxnStatus) => {
    setTransactions((prev) =>
      prev.map((t) => t.id === txn.id ? { ...t, status: targetStatus } : t)
    );
    setSelectedTxn(null);
    const actionLabels: Record<TxnStatus, string> = {
      succeeded: 'Confirmed as Succeeded',
      pending: 'Moved to Pending / Retry',
      failed: 'Marked Failed',
      refunded: 'Refund Initiated',
    };
    addToast(`${txn.workspace} — ${actionLabels[targetStatus]}`, targetStatus === 'failed' ? 'error' : targetStatus === 'refunded' ? 'warning' : 'success');
  }, [addToast]);

  // Filtered + searched transactions
  const filtered = transactions.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || t.workspace.toLowerCase().includes(q)
      || t.email.toLowerCase().includes(q)
      || t.txnRef.toLowerCase().includes(q)
      || t.plan.toLowerCase().includes(q);
    const matchMethod = methodFilter === 'all' || t.method === methodFilter;
    return matchSearch && matchMethod;
  });

  // Grouped by lane
  const grouped: Record<TxnStatus, Transaction[]> = {
    succeeded: filtered.filter((t) => t.status === 'succeeded'),
    pending: filtered.filter((t) => t.status === 'pending'),
    failed: filtered.filter((t) => t.status === 'failed'),
    refunded: filtered.filter((t) => t.status === 'refunded'),
  };

  // KPI aggregates (over ALL transactions, not just filtered)
  const gross = transactions.filter((t) => t.status === 'succeeded').reduce((s, t) => s + t.amount, 0);
  const refunded = transactions.filter((t) => t.status === 'refunded').reduce((s, t) => s + t.amount, 0);
  const net = gross - refunded;
  const failedVal = transactions.filter((t) => t.status === 'failed').reduce((s, t) => s + t.amount, 0);
  const pending = transactions.filter((t) => t.status === 'pending').reduce((s, t) => s + t.amount, 0);
  const totalGross = transactions.reduce((s, t) => s + t.amount, 0);

  const containerStyle: CSSProperties = {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse 80% 60% at 15% 0%, rgba(242,101,34,0.12) 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 90% 100%, rgba(255,92,122,0.08) 0%, transparent 55%), #0d0b16',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    color: '#fff',
    padding: '28px 28px 48px',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'linear-gradient(135deg, #F26522, #FF8A4B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(242,101,34,0.4)',
          }}>
            <Layers size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>
              Payments — Reconciliation Board
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              Cross-workspace · Triage by status · Move cards to resolve
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.div
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.2, repeat: Infinity }}
              style={{ width: 7, height: 7, borderRadius: '50%', background: '#3ddc97' }}
            />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Live</span>
          </div>
        </div>
      </motion.div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <KPICard label="Gross Collected" value={gross} sub={`${formatNumber(transactions.filter(t => t.status === 'succeeded').length)} txns`} accent="#3ddc97" Icon={TrendingUp} index={0} />
        <KPICard label="Net Revenue" value={net} sub="After refunds" accent="#F26522" Icon={Activity} index={1} />
        <KPICard label="Failed at Risk" value={failedVal} sub={`${formatNumber(transactions.filter(t => t.status === 'failed').length)} needs retry`} accent="#ff5c7a" Icon={TrendingDown} index={2} />
        <KPICard label="Pending Clearance" value={pending} sub={`${formatNumber(transactions.filter(t => t.status === 'pending').length)} awaiting`} accent="#FF8A4B" Icon={Clock} index={3} />
        <KPICard label="Refunded" value={refunded} sub={`${formatNumber(transactions.filter(t => t.status === 'refunded').length)} txns`} accent="#aaa" Icon={RotateCcw} index={4} />
      </div>

      {/* Search + Filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        style={{
          display: 'flex', gap: 12, alignItems: 'center',
          marginBottom: 22, flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 12, padding: '10px 16px',
          flex: '1 1 240px', maxWidth: 360,
        }}>
          <Search size={15} color="rgba(255,255,255,0.35)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspace, email, ref…"
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: '#fff', fontSize: 13.5, width: '100%',
            }}
          />
          {search && (
            <motion.button
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 0, display: 'flex' }}
            >
              <X size={14} />
            </motion.button>
          )}
        </div>

        {/* Method filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <SlidersHorizontal size={14} color="rgba(255,255,255,0.3)" />
          {(['all', 'card', 'upi', 'netbanking'] as const).map((m) => {
            const active = methodFilter === m;
            const labels: Record<typeof m, string> = { all: 'All', card: 'Card', upi: 'UPI', netbanking: 'NetBanking' };
            return (
              <motion.button
                key={m}
                whileTap={{ scale: 0.94 }}
                onClick={() => setMethodFilter(m)}
                style={{
                  background: active ? 'rgba(242,101,34,0.2)' : 'rgba(255,255,255,0.05)',
                  border: active ? '1px solid rgba(242,101,34,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20, padding: '6px 13px',
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  color: active ? '#FF8A4B' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                }}
              >
                {labels[m]}
              </motion.button>
            );
          })}
        </div>

        {/* Result count */}
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
          {formatNumber(filtered.length)} transaction{filtered.length !== 1 ? 's' : ''}
        </span>
        <Filter size={13} color="rgba(255,255,255,0.2)" />
      </motion.div>

      {/* Board lanes */}
      <div style={{
        display: 'flex', gap: 16,
        overflowX: 'auto',
        paddingBottom: 12,
        scrollbarWidth: 'thin',
        alignItems: 'flex-start',
      }}>
        {LANE_ORDER.map((status, i) => (
          <Lane
            key={status}
            status={status}
            transactions={grouped[status]}
            laneIndex={i}
            onSelect={setSelectedTxn}
            totalGross={totalGross}
          />
        ))}
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selectedTxn && (
          <DetailPanel
            key={selectedTxn.id}
            txn={selectedTxn}
            onClose={() => setSelectedTxn(null)}
            onAction={handleAction}
          />
        )}
      </AnimatePresence>

      {/* Backdrop when panel open */}
      <AnimatePresence>
        {selectedTxn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedTxn(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 499,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(2px)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Toast stack */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
