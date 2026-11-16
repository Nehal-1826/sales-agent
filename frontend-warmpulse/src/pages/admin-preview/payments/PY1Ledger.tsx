/**
 * Admin Payments Design Candidate: PY1 Transaction Ledger
 *
 * "Transaction Ledger" — cross-workspace payment transactions table:
 * animated KPI header (gross collected, net, refunded, success rate, txn count),
 * searchable + filterable + sortable ledger with FLIP row reordering (layout prop),
 * and a rich detail drawer that slides in per-row (copy txn id, mock refund + toast,
 * export CSV). All rupee values via formatMoney, all dates via formatDate.
 *
 * Framer-motion: animated counters (useMotionValue + animate), staggered row
 * entrance, AnimatePresence FLIP on filter/sort, spring drawer, whileHover/whileTap.
 *
 * Self-contained: inline style={{}} only, mock data only, no API/react-query.
 * Aurora Glass dark palette — warm orange only, no purple/blue/teal/cyan.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
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
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Download,
  Copy,
  Check,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Receipt,
  Filter,
  CreditCard,
  Smartphone,
  Building2,
  IndianRupee,
  TrendingUp,
  Percent,
  Hash,
  Calendar,
  ChevronRight,
  Banknote,
} from 'lucide-react';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';

// ─── Design tokens ──────────────────────────────────────────────────────────────
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

// ─── Types ──────────────────────────────────────────────────────────────────────
type TxnStatus = 'succeeded' | 'pending' | 'failed' | 'refunded';
type PayMethod  = 'card' | 'upi' | 'netbanking';
type PlanName   = 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';
type SortKey    = 'amount' | 'date' | 'status' | 'workspace' | 'plan';
type SortDir    = 'asc' | 'desc';

interface Transaction {
  id:          string;
  txnId:       string;
  workspace:   string;
  email:       string;
  plan:        PlanName;
  amount:      number;
  status:      TxnStatus;
  date:        string;   // ISO
  method:      PayMethod;
  description: string;
  refundDate:  string | null;
  refundAmt:   number | null;
}

// ─── Mock data — 20 transactions ─────────────────────────────────────────────
const MOCK_TXNS: Transaction[] = [
  {
    id: 'txn_01', txnId: 'WP-PAY-20260601-A1F3',
    workspace: 'BrightWave Media',    email: 'alex@brightwave.io',
    plan: 'Agency',   amount: 24900, status: 'succeeded', date: '2026-06-01T08:12:00+05:30',
    method: 'card',       description: 'Monthly plan — Agency',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_02', txnId: 'WP-PAY-20260601-B7D9',
    workspace: 'Aufwind Solutions',   email: 'sara.m@aufwind.io',
    plan: 'Pro Plus', amount: 14900, status: 'succeeded', date: '2026-06-01T07:45:00+05:30',
    method: 'upi',        description: 'Monthly plan — Pro Plus',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_03', txnId: 'WP-PAY-20260531-C2E8',
    workspace: 'SendLoop Labs',       email: 'chris@sendloop.co',
    plan: 'Pro',      amount:  8900, status: 'failed',    date: '2026-05-31T18:30:00+05:30',
    method: 'card',       description: 'Monthly plan — Pro (card declined)',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_04', txnId: 'WP-PAY-20260531-D4K1',
    workspace: 'Nordlicht Agency',    email: 'lena@nordlicht.agency',
    plan: 'Agency',   amount: 24900, status: 'pending',   date: '2026-05-31T16:00:00+05:30',
    method: 'netbanking', description: 'Monthly plan — Agency (processing)',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_05', txnId: 'WP-PAY-20260530-E9G6',
    workspace: 'OutreachPilot',       email: 'james@outreachpilot.com',
    plan: 'Starter',  amount:  3900, status: 'succeeded', date: '2026-05-30T11:22:00+05:30',
    method: 'upi',        description: 'Monthly plan — Starter',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_06', txnId: 'WP-PAY-20260529-F3H2',
    workspace: 'MailForge India',     email: 'priya@mailforge.in',
    plan: 'Pro Plus', amount: 14900, status: 'refunded',  date: '2026-05-29T09:05:00+05:30',
    method: 'card',       description: 'Monthly plan — Pro Plus (billing dispute)',
    refundDate: '2026-05-30T10:00:00+05:30', refundAmt: 14900,
  },
  {
    id: 'txn_07', txnId: 'WP-PAY-20260528-G7J4',
    workspace: 'Growthify HQ',        email: 'rahul@growthify.io',
    plan: 'Agency',   amount: 24900, status: 'succeeded', date: '2026-05-28T14:50:00+05:30',
    method: 'netbanking', description: 'Monthly plan — Agency',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_08', txnId: 'WP-PAY-20260527-H1L9',
    workspace: 'Qureight Tech',       email: 'neha@qureight.com',
    plan: 'Pro',      amount:  8900, status: 'succeeded', date: '2026-05-27T10:15:00+05:30',
    method: 'upi',        description: 'Monthly plan — Pro',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_09', txnId: 'WP-PAY-20260526-I5M3',
    workspace: 'Stacksend',           email: 'arjun@stacksend.in',
    plan: 'Starter',  amount:  3900, status: 'failed',    date: '2026-05-26T19:40:00+05:30',
    method: 'card',       description: 'Monthly plan — Starter (insufficient funds)',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_10', txnId: 'WP-PAY-20260525-J8N6',
    workspace: 'Replyfast',           email: 'vikram@replyfast.io',
    plan: 'Pro Plus', amount: 14900, status: 'succeeded', date: '2026-05-25T08:20:00+05:30',
    method: 'upi',        description: 'Monthly plan — Pro Plus',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_11', txnId: 'WP-PAY-20260524-K2P1',
    workspace: 'Inboxcraft Co.',      email: 'ananya@inboxcraft.co',
    plan: 'Agency',   amount: 24900, status: 'succeeded', date: '2026-05-24T13:10:00+05:30',
    method: 'card',       description: 'Monthly plan — Agency',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_12', txnId: 'WP-PAY-20260523-L6Q4',
    workspace: 'PulseGrowth',         email: 'deepak@pulsegrowth.in',
    plan: 'Pro',      amount:  8900, status: 'refunded',  date: '2026-05-23T11:00:00+05:30',
    method: 'netbanking', description: 'Monthly plan — Pro (request by user)',
    refundDate: '2026-05-24T09:30:00+05:30', refundAmt: 8900,
  },
  {
    id: 'txn_13', txnId: 'WP-PAY-20260522-M9R7',
    workspace: 'Boostmail Studio',    email: 'kiran@boostmail.studio',
    plan: 'Starter',  amount:  3900, status: 'succeeded', date: '2026-05-22T17:05:00+05:30',
    method: 'upi',        description: 'Monthly plan — Starter',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_14', txnId: 'WP-PAY-20260521-N4S2',
    workspace: 'Senderloop',          email: 'mohit@senderloop.app',
    plan: 'Pro Plus', amount: 14900, status: 'pending',   date: '2026-05-21T15:50:00+05:30',
    method: 'netbanking', description: 'Monthly plan — Pro Plus (processing)',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_15', txnId: 'WP-PAY-20260520-O7T5',
    workspace: 'WarmSpark',           email: 'pooja@warmspark.io',
    plan: 'Agency',   amount: 24900, status: 'succeeded', date: '2026-05-20T09:30:00+05:30',
    method: 'card',       description: 'Monthly plan — Agency',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_16', txnId: 'WP-PAY-20260519-P1U8',
    workspace: 'MailDrive Labs',      email: 'ravi@maildrive.in',
    plan: 'Pro',      amount:  8900, status: 'succeeded', date: '2026-05-19T12:45:00+05:30',
    method: 'upi',        description: 'Monthly plan — Pro',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_17', txnId: 'WP-PAY-20260518-Q5V3',
    workspace: 'Velocit Email',       email: 'sneha@velocit.io',
    plan: 'Starter',  amount:  3900, status: 'failed',    date: '2026-05-18T20:10:00+05:30',
    method: 'card',       description: 'Monthly plan — Starter (expired card)',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_18', txnId: 'WP-PAY-20260517-R8W6',
    workspace: 'IndiaMail Pro',       email: 'suresh@indiamail.pro',
    plan: 'Pro Plus', amount: 14900, status: 'succeeded', date: '2026-05-17T07:55:00+05:30',
    method: 'netbanking', description: 'Monthly plan — Pro Plus',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_19', txnId: 'WP-PAY-20260516-S2X1',
    workspace: 'CampaignReach',       email: 'aditya@campaignreach.in',
    plan: 'Agency',   amount: 24900, status: 'succeeded', date: '2026-05-16T14:20:00+05:30',
    method: 'upi',        description: 'Monthly plan — Agency',
    refundDate: null, refundAmt: null,
  },
  {
    id: 'txn_20', txnId: 'WP-PAY-20260515-T6Y4',
    workspace: 'SparkSend HQ',        email: 'divya@sparksend.co',
    plan: 'Pro',      amount:  8900, status: 'refunded',  date: '2026-05-15T16:35:00+05:30',
    method: 'card',       description: 'Monthly plan — Pro (user cancellation)',
    refundDate: '2026-05-16T11:00:00+05:30', refundAmt: 8900,
  },
];

// ─── Animation variants ─────────────────────────────────────────────────────────
const rowVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.045, duration: 0.38, ease: [0.22, 1, 0.36, 1] },
  }),
  exit: { opacity: 0, x: -20, scale: 0.97, transition: { duration: 0.22 } },
};

const drawerVariants: Variants = {
  hidden:  { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 280, damping: 32 } },
  exit:    { x: '100%', opacity: 0, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } },
};

const kpiVariants: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.06 + i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

const toastVariants: Variants = {
  hidden:  { opacity: 0, y: 24, scale: 0.92 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 28 } },
  exit:    { opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.2 } },
};

// ─── Helpers ────────────────────────────────────────────────────────────────────
function statusColor(s: TxnStatus) {
  if (s === 'succeeded') return T.success;
  if (s === 'pending')   return T.warning;
  if (s === 'failed')    return T.danger;
  return T.faint;  // refunded
}
function statusDim(s: TxnStatus) {
  if (s === 'succeeded') return T.successDim;
  if (s === 'pending')   return T.warningDim;
  if (s === 'failed')    return T.dangerDim;
  return T.neutralDim;
}
function StatusIcon({ s }: { s: TxnStatus }) {
  const sz = 13;
  if (s === 'succeeded') return <CheckCircle2 size={sz} />;
  if (s === 'pending')   return <Clock size={sz} />;
  if (s === 'failed')    return <XCircle size={sz} />;
  return <RotateCcw size={sz} />;
}
function MethodIcon({ m }: { m: PayMethod }) {
  if (m === 'upi')        return <Smartphone size={14} />;
  if (m === 'netbanking') return <Building2  size={14} />;
  return <CreditCard size={14} />;
}
function methodLabel(m: PayMethod) {
  if (m === 'upi')        return 'UPI';
  if (m === 'netbanking') return 'Netbanking';
  return 'Card';
}
function planColor(p: PlanName) {
  if (p === 'Agency')   return T.accent;
  if (p === 'Pro Plus') return T.accentLight;
  if (p === 'Pro')      return T.warning;
  return T.faint;
}

// ─── Animated counter hook ───────────────────────────────────────────────────
function useCounter(target: number, formatFn: (v: number) => string, delay = 0) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(formatFn(0));
  useEffect(() => {
    const unsub = mv.on('change', (v) => setDisplay(formatFn(Math.round(v))));
    const ctrl = animate(mv, target, {
      duration: 1.4,
      delay,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [target, delay, mv, formatFn]);
  return display;
}

// ─── KPI card ────────────────────────────────────────────────────────────────
interface KpiProps {
  label: string;
  target: number;
  formatFn: (v: number) => string;
  icon: ReactNode;
  accent?: boolean;
  index: number;
  sub?: string;
}
function KpiCard({ label, target, formatFn, icon, accent, index, sub }: KpiProps) {
  const display = useCounter(target, formatFn, index * 0.1);
  return (
    <motion.div
      custom={index}
      variants={kpiVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.025, transition: { duration: 0.18 } }}
      style={{
        ...T.glassCard,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        flex: 1,
        minWidth: 0,
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* shimmer streak */}
      <motion.div
        style={{
          position: 'absolute', top: 0, left: '-80%',
          width: '60%', height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.045), transparent)',
          pointerEvents: 'none',
        }}
        animate={{ left: ['−80%', '160%'] }}
        transition={{ duration: 2.6, delay: index * 0.3 + 0.5, ease: 'easeInOut' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <span style={{
          color: accent ? T.accent : T.faint,
          display: 'flex', alignItems: 'center',
        }}>
          {icon}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ? T.accent : T.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {display}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: T.faint }}>{sub}</div>
      )}
    </motion.div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────
interface DrawerProps {
  txn: Transaction;
  onClose: () => void;
  onToast: (msg: string, kind: 'success' | 'warn' | 'error') => void;
}
function DetailDrawer({ txn, onClose, onToast }: DrawerProps) {
  const [copied, setCopied] = useState(false);
  const [refundStage, setRefundStage] = useState<'idle' | 'confirm' | 'processing' | 'done'>('idle');

  const copyTxnId = useCallback(() => {
    void navigator.clipboard.writeText(txn.txnId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onToast(`Copied: ${txn.txnId}`, 'success');
  }, [txn.txnId, onToast]);

  const handleRefund = useCallback(() => {
    if (refundStage === 'idle') { setRefundStage('confirm'); return; }
    if (refundStage === 'confirm') {
      setRefundStage('processing');
      setTimeout(() => {
        setRefundStage('done');
        onToast(`Refund of ${formatMoney(txn.amount)} initiated (mock)`, 'success');
      }, 1400);
    }
  }, [refundStage, txn.amount, onToast]);

  const canRefund = txn.status === 'succeeded' && refundStage !== 'done';

  const row = (label: string, value: ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '9px 0', borderBottom: `1px solid ${T.hairline}` }}>
      <span style={{ fontSize: 12, color: T.faint, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: T.text, textAlign: 'right' }}>{value}</span>
    </div>
  );

  return (
    <motion.div
      variants={drawerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 380,
        ...T.glassDeep,
        borderRadius: '22px 0 0 22px',
        borderRight: 'none',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '22px 24px 16px', borderBottom: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Transaction Detail</div>
          <div style={{ fontSize: 12, color: T.faint, marginTop: 2, fontFamily: 'monospace' }}>{txn.txnId}</div>
        </div>
        <motion.button
          whileHover={{ scale: 1.1, background: 'rgba(255,255,255,0.10)' }}
          whileTap={{ scale: 0.94 }}
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.hairline}`, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.dim }}
        >
          <X size={15} />
        </motion.button>
      </div>

      {/* Amount hero */}
      <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: statusDim(txn.status),
          border: `1px solid ${statusColor(txn.status)}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: statusColor(txn.status), flexShrink: 0,
        }}>
          <StatusIcon s={txn.status} />
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: txn.status === 'refunded' ? T.faint : T.text, letterSpacing: '-0.03em' }}>
            {formatMoney(txn.amount)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
              color: statusColor(txn.status),
              background: statusDim(txn.status),
              padding: '2px 8px', borderRadius: 20,
              textTransform: 'uppercase',
            }}>
              {txn.status}
            </span>
            <span style={{ fontSize: 11, color: T.faint }}>{txn.description}</span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 16px' }}>
        {row('Workspace', <span style={{ fontWeight: 600 }}>{txn.workspace}</span>)}
        {row('Email', <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{txn.email}</span>)}
        {row('Plan', (
          <span style={{ color: planColor(txn.plan), fontWeight: 600 }}>{txn.plan}</span>
        ))}
        {row('Method', (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <MethodIcon m={txn.method} />
            {methodLabel(txn.method)}
          </span>
        ))}
        {row('Date', formatDate(txn.date))}
        {txn.refundDate && row('Refund date', formatDate(txn.refundDate))}
        {txn.refundAmt != null && row('Refunded amount', (
          <span style={{ color: T.danger }}>{formatMoney(txn.refundAmt)}</span>
        ))}
        {row('Transaction ID', (
          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{txn.txnId}</span>
        ))}
      </div>

      {/* Actions */}
      <div style={{ padding: '14px 24px 22px', borderTop: `1px solid ${T.hairline}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Copy TXN ID */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={copyTxnId}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 0', borderRadius: 10,
            background: T.accentDim, border: `1px solid ${T.accent}44`,
            color: T.accentLight, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy Transaction ID'}
        </motion.button>

        {/* Refund */}
        <AnimatePresence mode="wait">
          {canRefund && (
            <motion.button
              key={refundStage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleRefund}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 0', borderRadius: 10,
                background: refundStage === 'confirm' ? T.dangerDim : T.neutralDim,
                border: `1px solid ${refundStage === 'confirm' ? T.danger + '55' : T.hairline}`,
                color: refundStage === 'confirm' ? T.danger : T.dim,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {refundStage === 'processing'
                ? <><RefreshCw size={14} /><span>Processing…</span></>
                : refundStage === 'confirm'
                  ? <><AlertTriangle size={14} /><span>Confirm Refund {formatMoney(txn.amount)}</span></>
                  : <><RotateCcw size={14} /><span>Initiate Refund</span></>
              }
            </motion.button>
          )}
          {refundStage === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                textAlign: 'center', fontSize: 13, color: T.success,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 0',
              }}
            >
              <CheckCircle2 size={14} /> Refund initiated (mock)
            </motion.div>
          )}
        </AnimatePresence>

        {/* Export row */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onToast('Export CSV triggered (mock)', 'success')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 0', borderRadius: 10,
            background: 'transparent', border: `1px solid ${T.hairline}`,
            color: T.faint, fontSize: 13, cursor: 'pointer',
          }}
        >
          <Download size={14} /> Export this transaction
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
interface ToastMsg { id: number; text: string; kind: 'success' | 'warn' | 'error' }
function Toast({ msg }: { msg: ToastMsg }) {
  const col = msg.kind === 'success' ? T.success : msg.kind === 'warn' ? T.warning : T.danger;
  return (
    <motion.div
      variants={toastVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        ...T.glassDeep,
        padding: '12px 18px',
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 13, color: T.text,
        borderLeft: `3px solid ${col}`,
        pointerEvents: 'none',
      }}
    >
      <span style={{ color: col, display: 'flex' }}>
        {msg.kind === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      </span>
      {msg.text}
    </motion.div>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={12} style={{ opacity: 0.35 }} />;
  return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function AdmPayPY1Ledger() {
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusF]  = useState<TxnStatus | 'all'>('all');
  const [methodFilter, setMethodF]  = useState<PayMethod | 'all'>('all');
  const [planFilter, setPlanF]      = useState<PlanName | 'all'>('all');
  const [sortKey, setSortKey]       = useState<SortKey>('date');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [selected, setSelected]     = useState<Transaction | null>(null);
  const [toasts, setToasts]         = useState<ToastMsg[]>([]);
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const toastIdRef = useRef(0);

  const pushToast = useCallback((text: string, kind: 'success' | 'warn' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts(p => [...p, { id, text, kind }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  // ── derived KPIs ──────────────────────────────────────────────────────────
  const gross     = MOCK_TXNS.filter(t => t.status === 'succeeded').reduce((s, t) => s + t.amount, 0);
  const refunded  = MOCK_TXNS.filter(t => t.status === 'refunded').reduce((s, t) => s + (t.refundAmt ?? 0), 0);
  const net       = gross - refunded;
  const total     = MOCK_TXNS.length;
  const succeeded = MOCK_TXNS.filter(t => t.status === 'succeeded').length;
  const rate      = Math.round((succeeded / total) * 100);

  // ── filter + sort ─────────────────────────────────────────────────────────
  const rows = MOCK_TXNS
    .filter(t => {
      const q = search.toLowerCase();
      const matchSearch = !q || t.workspace.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || t.txnId.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchMethod = methodFilter === 'all' || t.method === methodFilter;
      const matchPlan   = planFilter   === 'all' || t.plan   === planFilter;
      const matchFrom   = !dateFrom || t.date >= dateFrom;
      const matchTo     = !dateTo   || t.date <= dateTo + 'T23:59:59';
      return matchSearch && matchStatus && matchMethod && matchPlan && matchFrom && matchTo;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'amount')    cmp = a.amount - b.amount;
      else if (sortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortKey === 'workspace') cmp = a.workspace.localeCompare(b.workspace);
      else if (sortKey === 'plan') cmp = a.plan.localeCompare(b.plan);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  const colHdr = (label: string, key: SortKey) => (
    <motion.th
      whileHover={{ color: T.text }}
      onClick={() => toggleSort(key)}
      style={{
        padding: '11px 14px', textAlign: 'left', cursor: 'pointer',
        fontSize: 11, fontWeight: 600, color: sortKey === key ? T.accentLight : T.dim,
        textTransform: 'uppercase', letterSpacing: '0.07em',
        userSelect: 'none', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </motion.th>
  );

  const pill = (label: string, active: boolean, onClick: () => void) => (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        background: active ? T.accentDim : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? T.accent + '55' : T.hairline}`,
        color: active ? T.accentLight : T.dim,
      }}
    >
      {label}
    </motion.button>
  );

  // total for filtered rows
  const filteredGross = rows.filter(r => r.status === 'succeeded').reduce((s, r) => s + r.amount, 0);

  return (
    <div style={{ padding: '28px 28px 60px', minHeight: '100vh', position: 'relative' }}>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 11,
              background: T.accentDim, border: `1px solid ${T.accent}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent,
            }}>
              <Receipt size={18} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0, letterSpacing: '-0.02em' }}>
              Transaction Ledger
            </h1>
          </div>
          <p style={{ fontSize: 13, color: T.dim, margin: 0 }}>
            Cross-workspace payment transactions — all plans, all methods
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => pushToast('Exporting CSV… (mock)', 'success')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 10,
            background: T.accentDim, border: `1px solid ${T.accent}55`,
            color: T.accentLight, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Download size={14} /> Export CSV
        </motion.button>
      </motion.div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <KpiCard label="Gross Collected" target={gross}    formatFn={formatMoney} icon={<IndianRupee size={16} />} accent index={0} sub="succeeded txns only" />
        <KpiCard label="Net Revenue"     target={net}      formatFn={formatMoney} icon={<TrendingUp   size={16} />}        index={1} sub="gross minus refunds" />
        <KpiCard label="Total Refunded"  target={refunded} formatFn={formatMoney} icon={<RotateCcw    size={16} />}        index={2} />
        <KpiCard label="Success Rate"    target={rate}     formatFn={(v) => `${v}%`} icon={<Percent size={16} />}         index={3} sub={`${succeeded} of ${total} txns`} />
        <KpiCard label="Total Txns"      target={total}    formatFn={formatNumber} icon={<Hash         size={16} />}       index={4} />
      </div>

      {/* Filters */}
      <motion.div
        layout
        style={{ ...T.glass, padding: '14px 18px', marginBottom: 16 }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.faint, pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search workspace, email, txn ID…"
              style={{
                width: '100%', paddingLeft: 32, paddingRight: search ? 30 : 12,
                paddingTop: 8, paddingBottom: 8, borderRadius: 9, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.hairline}`,
                color: T.text, fontSize: 13, outline: 'none',
              }}
            />
            {search && (
              <X size={13} onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: T.faint, cursor: 'pointer' }} />
            )}
          </div>

          {/* Filter toggle */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowFilters(f => !f)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
              background: showFilters ? T.accentDim : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showFilters ? T.accent + '55' : T.hairline}`,
              color: showFilters ? T.accentLight : T.dim, fontSize: 13, fontWeight: 500,
            }}
          >
            <Filter size={13} /> Filters
            {(statusFilter !== 'all' || methodFilter !== 'all' || planFilter !== 'all' || dateFrom || dateTo) && (
              <span style={{ background: T.accent, color: '#fff', borderRadius: 20, width: 16, height: 16, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {[statusFilter !== 'all', methodFilter !== 'all', planFilter !== 'all', !!dateFrom, !!dateTo].filter(Boolean).length}
              </span>
            )}
          </motion.button>

          {/* Result count */}
          <span style={{ fontSize: 12, color: T.faint, whiteSpace: 'nowrap' }}>
            {formatNumber(rows.length)} txn{rows.length !== 1 ? 's' : ''} · {formatMoney(filteredGross)}
          </span>
        </div>

        {/* Expanded filter row */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.2 } }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ paddingTop: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {/* Status */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Status</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(['all', 'succeeded', 'pending', 'failed', 'refunded'] as const).map(s =>
                      pill(s === 'all' ? 'All' : s, statusFilter === s, () => setStatusF(s))
                    )}
                  </div>
                </div>
                {/* Method */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Method</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(['all', 'card', 'upi', 'netbanking'] as const).map(m =>
                      pill(m === 'all' ? 'All' : methodLabel(m), methodFilter === m, () => setMethodF(m))
                    )}
                  </div>
                </div>
                {/* Plan */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Plan</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(['all', 'Starter', 'Pro', 'Pro Plus', 'Agency'] as const).map(p =>
                      pill(p === 'all' ? 'All' : p, planFilter === p, () => setPlanF(p))
                    )}
                  </div>
                </div>
                {/* Date range */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Date Range</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Calendar size={13} style={{ color: T.faint }} />
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.hairline}`, borderRadius: 8, padding: '5px 10px', color: T.text, fontSize: 12, outline: 'none' }} />
                    <span style={{ color: T.faint, fontSize: 12 }}>to</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.hairline}`, borderRadius: 8, padding: '5px 10px', color: T.text, fontSize: 12, outline: 'none' }} />
                    {(dateFrom || dateTo) && (
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setDateFrom(''); setDateTo(''); }}
                        style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer', display: 'flex' }}>
                        <X size={13} />
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Table */}
      <div style={{ ...T.glass, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.hairline}` }}>
                {colHdr('Workspace', 'workspace')}
                <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Method</th>
                {colHdr('Plan', 'plan')}
                {colHdr('Amount', 'amount')}
                {colHdr('Status', 'status')}
                {colHdr('Date', 'date')}
                <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>TXN ID</th>
                <th style={{ padding: '11px 14px', width: 40 }} />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.length === 0 && (
                  <motion.tr
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <td colSpan={8} style={{ padding: '48px 0', textAlign: 'center', color: T.faint, fontSize: 14 }}>
                      No transactions match your filters
                    </td>
                  </motion.tr>
                )}
                {rows.map((txn, i) => (
                  <motion.tr
                    key={txn.id}
                    layout
                    custom={i}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    onClick={() => setSelected(txn)}
                    whileHover={{ background: 'rgba(255,255,255,0.04)' }}
                    style={{
                      borderBottom: `1px solid ${T.hairline}`,
                      cursor: 'pointer',
                      background: selected?.id === txn.id ? 'rgba(242,101,34,0.06)' : 'transparent',
                    }}
                  >
                    {/* Workspace */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{txn.workspace}</div>
                      <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>{txn.email}</div>
                    </td>
                    {/* Method */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.dim }}>
                        <MethodIcon m={txn.method} />
                        {methodLabel(txn.method)}
                      </span>
                    </td>
                    {/* Plan */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: planColor(txn.plan) }}>
                        {txn.plan}
                      </span>
                    </td>
                    {/* Amount */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: txn.status === 'refunded' ? T.faint : T.text }}>
                        {formatMoney(txn.amount)}
                      </span>
                    </td>
                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 20,
                        fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                        textTransform: 'capitalize',
                        background: statusDim(txn.status),
                        color: statusColor(txn.status),
                      }}>
                        <StatusIcon s={txn.status} />
                        {txn.status}
                      </span>
                    </td>
                    {/* Date */}
                    <td style={{ padding: '12px 14px', fontSize: 12, color: T.dim, whiteSpace: 'nowrap' }}>
                      {formatDate(txn.date)}
                    </td>
                    {/* TXN ID */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.faint }}>
                        {txn.txnId}
                      </span>
                    </td>
                    {/* Chevron */}
                    <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                      <motion.span
                        animate={{ x: selected?.id === txn.id ? 2 : 0 }}
                        style={{ color: selected?.id === txn.id ? T.accentLight : T.ghost, display: 'flex', justifyContent: 'flex-end' }}
                      >
                        <ChevronRight size={15} />
                      </motion.span>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: T.faint }}>
            Showing {formatNumber(rows.length)} of {formatNumber(MOCK_TXNS.length)} transactions
          </span>
          <span style={{ fontSize: 12, color: T.dim }}>
            Filtered gross: <span style={{ color: T.accentLight, fontWeight: 600 }}>{formatMoney(filteredGross)}</span>
          </span>
        </div>
      </div>

      {/* Drawer overlay */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              style={{
                position: 'fixed', inset: 0, zIndex: 199,
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(2px)',
              }}
            />
            <DetailDrawer key={selected.id} txn={selected} onClose={() => setSelected(null)} onToast={pushToast} />
          </>
        )}
      </AnimatePresence>

      {/* Toast stack */}
      <div style={{ position: 'fixed', bottom: 28, right: 24, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none', minWidth: 280 }}>
        <AnimatePresence>
          {toasts.map(t => <Toast key={t.id} msg={t} />)}
        </AnimatePresence>
      </div>

      {/* Legend strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        style={{ marginTop: 18, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}
      >
        {([['succeeded', T.success], ['pending', T.warning], ['failed', T.danger], ['refunded', T.faint]] as [TxnStatus, string][]).map(([s, c]) => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.faint }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.faint }}>
          <Banknote size={12} /> Indian methods: Card · UPI · Netbanking
        </span>
      </motion.div>
    </div>
  );
}
