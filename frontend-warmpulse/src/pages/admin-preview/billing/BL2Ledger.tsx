/**
 * Admin Billing Design Candidate: BL2 Subscriptions Ledger
 *
 * "Subscriptions Ledger" — a cross-workspace subscription management surface:
 * animated KPI header (active subs, MRR, past-due count, trials), searchable +
 * filterable + sortable subscriptions table with FLIP row reordering, and a rich
 * detail drawer that slides in per-row (invoice/payment history, refund, cancel,
 * comp/credit, change plan — all local state + toast).
 *
 * Framer-motion throughout: animated counters, staggered row entrance,
 * layout FLIP on sort/filter, AnimatePresence drawer spring, shared-element
 * row highlight, whileHover/whileTap.
 *
 * Self-contained: inline style={{}} only, mock data only.
 * NO API / react-query / @/features / @/lib/api imports.
 * Aurora Glass dark palette — warm amber only, no purple/blue/teal/cyan.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
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
  CreditCard,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  DollarSign,
  Users,
  AlertTriangle,
  Beaker,
  RotateCcw,
  Ban,
  Gift,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Receipt,
  ArrowRight,
  Check,
  Zap,
  Building2,
  Calendar,
  TrendingUp,
  Filter,
} from 'lucide-react';

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
    background:        'rgba(255,255,255,0.05)',
    border:            '1px solid rgba(255,255,255,0.10)',
    backdropFilter:    'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius:      16,
  } as CSSProperties,
  glassCard: {
    background:        'rgba(255,255,255,0.055)',
    border:            '1px solid rgba(255,255,255,0.10)',
    backdropFilter:    'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRadius:      18,
  } as CSSProperties,
  glassDeep: {
    background:        'rgba(255,255,255,0.08)',
    border:            '1px solid rgba(255,255,255,0.14)',
    backdropFilter:    'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius:      22,
  } as CSSProperties,
  glassTight: {
    background:        'rgba(255,255,255,0.04)',
    border:            '1px solid rgba(255,255,255,0.08)',
    backdropFilter:    'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius:      10,
  } as CSSProperties,
};

// ─── Types ──────────────────────────────────────────────────────────────────────
type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
type PlanName  = 'Free' | 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';
type SortKey   = 'workspace' | 'plan' | 'mrr' | 'status' | 'next_renewal' | 'started_at';
type SortDir   = 'asc' | 'desc';

interface Payment {
  id:     string;
  date:   string;
  amount: number;
  status: 'succeeded' | 'failed' | 'refunded';
  desc:   string;
}

interface Subscription {
  id:           string;
  workspaceId:  string;
  workspace:    string;
  ownerEmail:   string;
  plan:         PlanName;
  status:       SubStatus;
  mrr:          number;
  startedAt:    string;
  nextRenewal:  string;
  lastPayment:  { amount: number; status: 'succeeded' | 'failed'; date: string };
  mailboxes:    number;
  seats:        number;
  coupon:       string | null;
  history:      Payment[];
}

// ─── Mock data ──────────────────────────────────────────────────────────────────
const MOCK_SUBS: Subscription[] = [
  {
    id: 'sub_001', workspaceId: 'ws_001',
    workspace: 'BrightWave Media', ownerEmail: 'alex@brightwave.io',
    plan: 'Agency', status: 'active', mrr: 299,
    startedAt: 'Jan 12, 2025', nextRenewal: 'Jul 12, 2026',
    lastPayment: { amount: 299, status: 'succeeded', date: 'Jun 12, 2026' },
    mailboxes: 14, seats: 5, coupon: null,
    history: [
      { id: 'p1', date: 'Jun 12, 2026', amount: 299, status: 'succeeded', desc: 'Monthly – Agency' },
      { id: 'p2', date: 'May 12, 2026', amount: 299, status: 'succeeded', desc: 'Monthly – Agency' },
      { id: 'p3', date: 'Apr 12, 2026', amount: 299, status: 'succeeded', desc: 'Monthly – Agency' },
      { id: 'p4', date: 'Mar 12, 2026', amount: 299, status: 'succeeded', desc: 'Monthly – Agency' },
    ],
  },
  {
    id: 'sub_002', workspaceId: 'ws_002',
    workspace: 'Aufwind GmbH', ownerEmail: 'sara.muller@aufwind.de',
    plan: 'Pro Plus', status: 'active', mrr: 149,
    startedAt: 'Feb 3, 2025', nextRenewal: 'Jul 3, 2026',
    lastPayment: { amount: 149, status: 'succeeded', date: 'Jun 3, 2026' },
    mailboxes: 8, seats: 3, coupon: 'ANNUAL20',
    history: [
      { id: 'p5', date: 'Jun 3, 2026',  amount: 149, status: 'succeeded', desc: 'Monthly – Pro Plus' },
      { id: 'p6', date: 'May 3, 2026',  amount: 149, status: 'succeeded', desc: 'Monthly – Pro Plus' },
      { id: 'p7', date: 'Apr 3, 2026',  amount: 149, status: 'refunded',  desc: 'Refund – billing error' },
      { id: 'p8', date: 'Apr 3, 2026',  amount: 149, status: 'succeeded', desc: 'Monthly – Pro Plus' },
    ],
  },
  {
    id: 'sub_003', workspaceId: 'ws_003',
    workspace: 'SendLoop Labs', ownerEmail: 'chris@sendloop.co',
    plan: 'Pro', status: 'past_due', mrr: 89,
    startedAt: 'Mar 18, 2025', nextRenewal: 'Jun 18, 2026',
    lastPayment: { amount: 89, status: 'failed', date: 'Jun 18, 2026' },
    mailboxes: 5, seats: 2, coupon: null,
    history: [
      { id: 'p9',  date: 'Jun 18, 2026', amount: 89, status: 'failed',    desc: 'Monthly – Pro (card declined)' },
      { id: 'p10', date: 'May 18, 2026', amount: 89, status: 'succeeded', desc: 'Monthly – Pro' },
      { id: 'p11', date: 'Apr 18, 2026', amount: 89, status: 'succeeded', desc: 'Monthly – Pro' },
    ],
  },
  {
    id: 'sub_004', workspaceId: 'ws_004',
    workspace: 'Nordlicht Agency', ownerEmail: 'lena@nordlicht.agency',
    plan: 'Agency', status: 'trialing', mrr: 0,
    startedAt: 'May 25, 2026', nextRenewal: 'Jun 25, 2026',
    lastPayment: { amount: 0, status: 'succeeded', date: '—' },
    mailboxes: 3, seats: 2, coupon: 'TRIAL14',
    history: [],
  },
  {
    id: 'sub_005', workspaceId: 'ws_005',
    workspace: 'OutreachPilot', ownerEmail: 'james@outreachpilot.com',
    plan: 'Starter', status: 'active', mrr: 39,
    startedAt: 'Apr 7, 2026', nextRenewal: 'Jul 7, 2026',
    lastPayment: { amount: 39, status: 'succeeded', date: 'Jun 7, 2026' },
    mailboxes: 2, seats: 1, coupon: null,
    history: [
      { id: 'p12', date: 'Jun 7, 2026', amount: 39, status: 'succeeded', desc: 'Monthly – Starter' },
      { id: 'p13', date: 'May 7, 2026', amount: 39, status: 'succeeded', desc: 'Monthly – Starter' },
    ],
  },
  {
    id: 'sub_006', workspaceId: 'ws_006',
    workspace: 'Velocity Reach', ownerEmail: 'priya@velocityreach.in',
    plan: 'Pro Plus', status: 'active', mrr: 149,
    startedAt: 'Jan 30, 2025', nextRenewal: 'Jul 30, 2026',
    lastPayment: { amount: 149, status: 'succeeded', date: 'Jun 30, 2026' },
    mailboxes: 9, seats: 4, coupon: null,
    history: [
      { id: 'p14', date: 'Jun 30, 2026', amount: 149, status: 'succeeded', desc: 'Monthly – Pro Plus' },
      { id: 'p15', date: 'May 30, 2026', amount: 149, status: 'succeeded', desc: 'Monthly – Pro Plus' },
      { id: 'p16', date: 'Apr 30, 2026', amount: 149, status: 'succeeded', desc: 'Monthly – Pro Plus' },
    ],
  },
  {
    id: 'sub_007', workspaceId: 'ws_007',
    workspace: 'Coldstart HQ', ownerEmail: 'ethan@coldstarthq.com',
    plan: 'Free', status: 'active', mrr: 0,
    startedAt: 'May 10, 2026', nextRenewal: '—',
    lastPayment: { amount: 0, status: 'succeeded', date: '—' },
    mailboxes: 1, seats: 1, coupon: null,
    history: [],
  },
  {
    id: 'sub_008', workspaceId: 'ws_008',
    workspace: 'Mailblaze Co.', ownerEmail: 'olivia@mailblaze.co',
    plan: 'Pro', status: 'canceled', mrr: 0,
    startedAt: 'Nov 2, 2024', nextRenewal: '—',
    lastPayment: { amount: 89, status: 'succeeded', date: 'Mar 2, 2026' },
    mailboxes: 0, seats: 1, coupon: null,
    history: [
      { id: 'p17', date: 'Mar 2, 2026', amount: 89, status: 'succeeded', desc: 'Monthly – Pro (final)' },
      { id: 'p18', date: 'Feb 2, 2026', amount: 89, status: 'succeeded', desc: 'Monthly – Pro' },
    ],
  },
  {
    id: 'sub_009', workspaceId: 'ws_009',
    workspace: 'InboxForge', ownerEmail: 'tomasz@inboxforge.pl',
    plan: 'Starter', status: 'past_due', mrr: 39,
    startedAt: 'Mar 1, 2026', nextRenewal: 'Jun 1, 2026',
    lastPayment: { amount: 39, status: 'failed', date: 'Jun 1, 2026' },
    mailboxes: 2, seats: 1, coupon: null,
    history: [
      { id: 'p19', date: 'Jun 1, 2026', amount: 39, status: 'failed',    desc: 'Monthly – Starter (declined)' },
      { id: 'p20', date: 'May 1, 2026', amount: 39, status: 'succeeded', desc: 'Monthly – Starter' },
    ],
  },
  {
    id: 'sub_010', workspaceId: 'ws_010',
    workspace: 'DripCraft Studio', ownerEmail: 'natasha@dripcraft.io',
    plan: 'Agency', status: 'trialing', mrr: 0,
    startedAt: 'Jun 1, 2026', nextRenewal: 'Jun 15, 2026',
    lastPayment: { amount: 0, status: 'succeeded', date: '—' },
    mailboxes: 0, seats: 3, coupon: 'LAUNCH50',
    history: [],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────
const PLAN_ORDER: Record<PlanName, number> = {
  Free: 0, Starter: 1, Pro: 2, 'Pro Plus': 3, Agency: 4,
};

const PLAN_COLORS: Record<PlanName, string> = {
  Free:      T.neutral,
  Starter:   T.accentLight,
  Pro:       T.accent,
  'Pro Plus': '#E05A1F',
  Agency:    '#C94D18',
};

function statusColor(s: SubStatus): string {
  if (s === 'active')   return T.success;
  if (s === 'trialing') return T.accent;
  if (s === 'past_due') return T.warning;
  return T.neutral;
}
function statusBg(s: SubStatus): string {
  if (s === 'active')   return T.successDim;
  if (s === 'trialing') return T.accentDim;
  if (s === 'past_due') return T.warningDim;
  return T.neutralDim;
}
function statusLabel(s: SubStatus): string {
  if (s === 'active')   return 'Active';
  if (s === 'trialing') return 'Trialing';
  if (s === 'past_due') return 'Past Due';
  return 'Canceled';
}
function statusIcon(s: SubStatus) {
  if (s === 'active')   return <CheckCircle2 size={11} />;
  if (s === 'trialing') return <Beaker size={11} />;
  if (s === 'past_due') return <AlertTriangle size={11} />;
  return <XCircle size={11} />;
}
function payStatusColor(s: Payment['status']): string {
  if (s === 'succeeded') return T.success;
  if (s === 'refunded')  return T.accent;
  return T.danger;
}
function payStatusLabel(s: Payment['status']): string {
  if (s === 'succeeded') return 'Succeeded';
  if (s === 'refunded')  return 'Refunded';
  return 'Failed';
}
function fmtMrr(n: number): string {
  return n === 0 ? '$0' : `$${n}`;
}
function fmtAmount(n: number): string {
  return n === 0 ? '$0.00' : `$${n.toFixed(2)}`;
}

// ─── Animated counter hook ───────────────────────────────────────────────────────
function useAnimatedCounter(target: number, decimals = 0): string {
  const mv       = useMotionValue(0);
  const [val, setVal] = useState('0');
  const ctrlRef  = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(mv, target, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) {
        setVal(
          decimals > 0
            ? latest.toFixed(decimals)
            : Math.round(latest).toLocaleString()
        );
      },
    });
    return () => { ctrlRef.current?.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return val;
}

// ─── Framer variants ─────────────────────────────────────────────────────────────
const rowVariants: Variants = {
  hidden:  { opacity: 0, y: 18, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.045, duration: 0.38, ease: [0.22, 1, 0.36, 1] },
  }),
  exit: { opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.22 } },
};

const drawerVariants: Variants = {
  hidden: {
    x: '100%',
    opacity: 0,
    transition: { type: 'spring', stiffness: 320, damping: 36 },
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 260, damping: 28 },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { type: 'spring', stiffness: 320, damping: 36 },
  },
};

const backdropVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22 } },
  exit:    { opacity: 0, transition: { duration: 0.18 } },
};

const chipVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.82 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } },
  exit:    { opacity: 0, scale: 0.82, transition: { duration: 0.15 } },
};

const toastVariants: Variants = {
  hidden:  { opacity: 0, y: 32, scale: 0.94 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { type: 'spring', stiffness: 340, damping: 28 } },
  exit:    { opacity: 0, y: 20, scale: 0.94, transition: { duration: 0.22 } },
};

// ─── Toast ───────────────────────────────────────────────────────────────────────
interface ToastItem { id: string; msg: string; color: string; icon: ReactNode; }
let _toastId = 0;

// ─── Sub status chip ─────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: SubStatus }) {
  return (
    <motion.span
      layout
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            4,
        padding:        '3px 9px',
        borderRadius:   20,
        fontSize:       11,
        fontWeight:     600,
        letterSpacing:  '0.03em',
        color:          statusColor(status),
        background:     statusBg(status),
        border:         `1px solid ${statusColor(status)}33`,
        whiteSpace:     'nowrap',
      }}
    >
      {statusIcon(status)}
      {statusLabel(status)}
    </motion.span>
  );
}

// ─── Plan badge ──────────────────────────────────────────────────────────────────
function PlanBadge({ plan }: { plan: PlanName }) {
  const color = PLAN_COLORS[plan] ?? T.accent;
  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           4,
      padding:       '2px 8px',
      borderRadius:  6,
      fontSize:      11,
      fontWeight:    700,
      letterSpacing: '0.04em',
      color,
      background:    `${color}18`,
      border:        `1px solid ${color}40`,
      whiteSpace:    'nowrap',
    }}>
      <Zap size={10} />
      {plan}
    </span>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────────
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
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3, scale: 1.025, transition: { duration: 0.22 } }}
      style={{
        ...T.glassCard,
        padding:  '20px 24px',
        flex:     '1 1 180px',
        minWidth: 160,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* accent glow */}
      <motion.div
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse 60% 55% at 10% 20%, ${color}22 0%, transparent 70%)`,
          pointerEvents: 'none',
          borderRadius: 'inherit',
        }}
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 10,
            background: `${color}20`, color,
          }}>
            {icon}
          </span>
          <span style={{ fontSize: 12, color: T.dim, fontWeight: 500 }}>{label}</span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: T.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: T.faint, marginTop: 5 }}>{sub}</div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Sortable column header ───────────────────────────────────────────────────────
function ColHead({
  label, col, sortKey, sortDir, onSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <motion.th
      onClick={() => onSort(col)}
      whileHover={{ color: T.accentLight }}
      style={{
        padding:       '10px 14px',
        textAlign:     'left',
        fontSize:      11,
        fontWeight:    600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color:         active ? T.accentLight : T.faint,
        cursor:        'pointer',
        userSelect:    'none',
        whiteSpace:    'nowrap',
        borderBottom:  `1px solid ${T.hairline}`,
        background:    'transparent',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ArrowUpDown size={10} style={{ opacity: 0.4 }} />}
      </span>
    </motion.th>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────────
function ActionBtn({
  icon, label, color, onClick,
}: {
  icon: ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04, backgroundColor: `${color}28` }}
      whileTap={{ scale: 0.96 }}
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         8,
        padding:     '9px 14px',
        borderRadius: 10,
        background:  `${color}14`,
        border:      `1px solid ${color}33`,
        color,
        fontSize:    13,
        fontWeight:  600,
        cursor:      'pointer',
        transition:  'background 0.15s',
      }}
    >
      {icon}
      {label}
    </motion.button>
  );
}

// ─── Plan picker ─────────────────────────────────────────────────────────────────
const PLAN_NAMES: PlanName[] = ['Free', 'Starter', 'Pro', 'Pro Plus', 'Agency'];
const PLAN_PRICES: Record<PlanName, number> = {
  Free: 0, Starter: 39, Pro: 89, 'Pro Plus': 149, Agency: 299,
};

function PlanPicker({
  current,
  onSelect,
  onClose,
}: { current: PlanName; onSelect: (p: PlanName) => void; onClose: () => void }) {
  return (
    <motion.div
      key="plan-picker"
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, y: 6 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      style={{
        ...T.glassDeep,
        padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
        position: 'absolute', right: 0, top: '110%', width: 220, zIndex: 999,
      }}
    >
      <div style={{ fontSize: 11, color: T.faint, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4 }}>
        CHANGE PLAN
      </div>
      {PLAN_NAMES.map(p => (
        <motion.button
          key={p}
          onClick={() => { onSelect(p); onClose(); }}
          whileHover={{ x: 4, backgroundColor: `${PLAN_COLORS[p] ?? T.accent}22` }}
          whileTap={{ scale: 0.97 }}
          style={{
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'space-between',
            padding:      '8px 12px',
            borderRadius: 8,
            background:   p === current ? `${PLAN_COLORS[p] ?? T.accent}18` : 'transparent',
            border:       p === current ? `1px solid ${PLAN_COLORS[p] ?? T.accent}44` : '1px solid transparent',
            color:        p === current ? (PLAN_COLORS[p] ?? T.accent) : T.dim,
            fontSize:     13, fontWeight: p === current ? 700 : 500,
            cursor:       'pointer',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {p === current && <Check size={11} />}
            {p}
          </span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>${PLAN_PRICES[p]}/mo</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

// ─── Subscription detail drawer ───────────────────────────────────────────────────
function SubDrawer({
  sub,
  onClose,
  onAction,
}: {
  sub: Subscription;
  onClose: () => void;
  onAction: (msg: string, color: string) => void;
}) {
  const [localPlan,   setLocalPlan]   = useState<PlanName>(sub.plan);
  const [localStatus, setLocalStatus] = useState<SubStatus>(sub.status);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [confirmCancel,  setConfirmCancel]  = useState(false);
  const [creditAmt,  setCreditAmt]  = useState('25');
  const [showCredit, setShowCredit] = useState(false);

  const handleRefund = useCallback(() => {
    const last = sub.history[0];
    if (!last) { onAction('No payment to refund.', T.danger); return; }
    onAction(`Refunded ${fmtAmount(last.amount)} for ${sub.workspace}`, T.success);
  }, [sub, onAction]);

  const handleCancel = useCallback(() => {
    setLocalStatus('canceled');
    setConfirmCancel(false);
    onAction(`Subscription for ${sub.workspace} canceled.`, T.danger);
  }, [sub, onAction]);

  const handleChangePlan = useCallback((p: PlanName) => {
    setLocalPlan(p);
    onAction(`Plan changed to ${p} for ${sub.workspace}`, T.accentLight);
  }, [sub, onAction]);

  const handleCredit = useCallback(() => {
    const n = parseFloat(creditAmt);
    if (!isNaN(n) && n > 0) {
      onAction(`Credited $${n.toFixed(2)} to ${sub.workspace}`, T.success);
      setShowCredit(false);
    }
  }, [creditAmt, sub, onAction]);

  const mrrDisplay = PLAN_PRICES[localPlan];

  return (
    <>
      {/* backdrop */}
      <motion.div
        key="backdrop"
        variants={backdropVariants}
        initial="hidden" animate="visible" exit="hidden"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.52)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 200,
        }}
      />

      {/* drawer */}
      <motion.div
        key="drawer"
        variants={drawerVariants}
        initial="hidden" animate="visible" exit="exit"
        style={{
          position:   'fixed',
          top:        0, right: 0, bottom: 0,
          width:      480,
          maxWidth:   '95vw',
          zIndex:     201,
          background: 'rgba(14,12,20,0.97)',
          borderLeft: `1px solid rgba(255,255,255,0.10)`,
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          overflowY:  'auto',
          display:    'flex',
          flexDirection: 'column',
        }}
      >
        {/* header */}
        <div style={{
          padding:    '22px 24px 18px',
          borderBottom: `1px solid ${T.hairline}`,
          display:    'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
          position:   'sticky', top: 0, zIndex: 10,
          background: 'rgba(14,12,20,0.97)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <motion.div
                style={{
                  width: 38, height: 38, borderRadius: 12,
                  background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}
                animate={{ rotate: [0, 4, -4, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                {sub.workspace[0]}
              </motion.div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{sub.workspace}</div>
                <div style={{ fontSize: 12, color: T.faint }}>{sub.ownerEmail}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <PlanBadge plan={localPlan} />
              <StatusChip status={localStatus} />
            </div>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.12, rotate: 90 }}
            whileTap={{ scale: 0.94 }}
            style={{
              width: 32, height: 32, borderRadius: 9,
              background: T.ghost, border: `1px solid ${T.hairline}`,
              color: T.dim, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={14} />
          </motion.button>
        </div>

        {/* body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>

          {/* meta grid */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.34 }}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
          >
            {[
              { label: 'MRR',         value: mrrDisplay === 0 ? '$0' : `$${mrrDisplay}`, icon: <DollarSign size={13} /> },
              { label: 'Started',     value: sub.startedAt, icon: <Calendar size={13} /> },
              { label: 'Next Renewal',value: sub.nextRenewal, icon: <RefreshCw size={13} /> },
              { label: 'Mailboxes',   value: String(sub.mailboxes), icon: <Building2 size={13} /> },
              { label: 'Seats',       value: String(sub.seats), icon: <Users size={13} /> },
              { label: 'Coupon',      value: sub.coupon ?? '—', icon: <Gift size={13} /> },
            ].map(item => (
              <div
                key={item.label}
                style={{
                  ...T.glassTight,
                  padding: '11px 14px',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.faint, fontSize: 11 }}>
                  {item.icon} {item.label}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{item.value}</div>
              </div>
            ))}
          </motion.div>

          {/* actions */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.34 }}
          >
            <div style={{ fontSize: 11, color: T.faint, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' }}>
              Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* change plan */}
              <div style={{ position: 'relative' }}>
                <ActionBtn
                  icon={<TrendingUp size={14} />}
                  label={`Change Plan (${localPlan})`}
                  color={T.accentLight}
                  onClick={() => setPlanPickerOpen(v => !v)}
                />
                <AnimatePresence>
                  {planPickerOpen && (
                    <PlanPicker
                      current={localPlan}
                      onSelect={handleChangePlan}
                      onClose={() => setPlanPickerOpen(false)}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* refund */}
              <ActionBtn
                icon={<RotateCcw size={14} />}
                label="Refund Last Payment"
                color={T.warning}
                onClick={handleRefund}
              />

              {/* comp/credit */}
              <ActionBtn
                icon={<Gift size={14} />}
                label="Comp / Credit"
                color={T.success}
                onClick={() => setShowCredit(v => !v)}
              />
              <AnimatePresence>
                {showCredit && (
                  <motion.div
                    key="credit-input"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{
                          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                          color: T.success, fontSize: 14,
                        }}>$</span>
                        <input
                          type="number"
                          value={creditAmt}
                          onChange={e => setCreditAmt(e.target.value)}
                          style={{
                            width: '100%', padding: '9px 12px 9px 26px',
                            borderRadius: 10, background: T.successDim,
                            border: `1px solid ${T.success}44`,
                            color: T.text, fontSize: 14, outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <motion.button
                        onClick={handleCredit}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                        style={{
                          padding: '9px 16px', borderRadius: 10,
                          background: T.successDim, border: `1px solid ${T.success}55`,
                          color: T.success, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        Apply
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* cancel */}
              {localStatus !== 'canceled' && (
                <>
                  <ActionBtn
                    icon={<Ban size={14} />}
                    label="Cancel Subscription"
                    color={T.danger}
                    onClick={() => setConfirmCancel(true)}
                  />
                  <AnimatePresence>
                    {confirmCancel && (
                      <motion.div
                        key="confirm"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                        style={{
                          ...T.glassTight,
                          borderColor: `${T.danger}44`,
                          padding: 14,
                        }}
                      >
                        <div style={{ fontSize: 13, color: T.text, marginBottom: 10 }}>
                          Cancel subscription for <strong>{sub.workspace}</strong>? This cannot be undone.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <motion.button
                            onClick={handleCancel}
                            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                            style={{
                              flex: 1, padding: '8px 0', borderRadius: 8,
                              background: T.dangerDim, border: `1px solid ${T.danger}55`,
                              color: T.danger, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            }}
                          >
                            Yes, Cancel
                          </motion.button>
                          <motion.button
                            onClick={() => setConfirmCancel(false)}
                            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                            style={{
                              flex: 1, padding: '8px 0', borderRadius: 8,
                              background: T.ghost, border: `1px solid ${T.hairline}`,
                              color: T.dim, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                            }}
                          >
                            Nevermind
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </motion.div>

          {/* payment history */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.20, duration: 0.34 }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 11, color: T.faint, fontWeight: 600,
              letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10,
            }}>
              <Receipt size={12} />
              Payment History
            </div>

            {sub.history.length === 0 ? (
              <div style={{
                ...T.glassTight, padding: '18px 16px', textAlign: 'center',
                color: T.faint, fontSize: 13,
              }}>
                No payments yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sub.history.map((pay, idx) => (
                  <motion.div
                    key={pay.id}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.22 + idx * 0.05, duration: 0.28 }}
                    whileHover={{ x: 3 }}
                    style={{
                      ...T.glassTight,
                      padding:    '10px 14px',
                      display:    'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap:        8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: `${payStatusColor(pay.status)}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: payStatusColor(pay.status), flexShrink: 0,
                      }}>
                        {pay.status === 'succeeded' ? <CheckCircle2 size={13} />
                          : pay.status === 'refunded' ? <RotateCcw size={13} />
                          : <AlertTriangle size={13} />}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pay.desc}
                        </div>
                        <div style={{ fontSize: 11, color: T.faint }}>{pay.date}</div>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: payStatusColor(pay.status) }}>
                        {fmtAmount(pay.amount)}
                      </div>
                      <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {payStatusLabel(pay.status)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────────
export function AdmBilBL2Ledger() {
  const subs = MOCK_SUBS;
  const [search, setSearch]        = useState('');
  const [filterPlan,   setFilterPlan]   = useState<PlanName | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<SubStatus | 'All'>('All');
  const [sortKey,  setSortKey]  = useState<SortKey>('mrr');
  const [sortDir,  setSortDir]  = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [toasts, setToasts]     = useState<ToastItem[]>([]);

  const showToast = useCallback((msg: string, color: string) => {
    const id = String(++_toastId);
    const icon = color === T.success
      ? <CheckCircle2 size={14} />
      : color === T.danger
      ? <XCircle size={14} />
      : <Zap size={14} />;
    setToasts(p => [...p, { id, msg, color, icon }]);
    const t = window.setTimeout(() => {
      setToasts(p => p.filter(x => x.id !== id));
    }, 3500);
    return () => window.clearTimeout(t);
  }, []);

  // KPI derived
  const activeSubs  = subs.filter(s => s.status === 'active').length;
  const totalMrr    = subs.reduce((a, s) => a + s.mrr, 0);
  const pastDueCount= subs.filter(s => s.status === 'past_due').length;
  const trialCount  = subs.filter(s => s.status === 'trialing').length;

  const activeCount = useAnimatedCounter(activeSubs);
  const mrrCount    = useAnimatedCounter(totalMrr);
  const pastCount   = useAnimatedCounter(pastDueCount);
  const trialAmt    = useAnimatedCounter(trialCount);

  // filter + sort
  const visible = subs
    .filter(s => {
      const q = search.toLowerCase();
      const matchQ = !q || s.workspace.toLowerCase().includes(q) || s.ownerEmail.toLowerCase().includes(q);
      const matchPlan   = filterPlan   === 'All' || s.plan   === filterPlan;
      const matchStatus = filterStatus === 'All' || s.status === filterStatus;
      return matchQ && matchPlan && matchStatus;
    })
    .sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sortKey === 'workspace')    { av = a.workspace;   bv = b.workspace; }
      if (sortKey === 'plan')         { av = PLAN_ORDER[a.plan]; bv = PLAN_ORDER[b.plan]; }
      if (sortKey === 'mrr')          { av = a.mrr;         bv = b.mrr; }
      if (sortKey === 'status')       { av = a.status;      bv = b.status; }
      if (sortKey === 'next_renewal') { av = a.nextRenewal; bv = b.nextRenewal; }
      if (sortKey === 'started_at')   { av = a.startedAt;   bv = b.startedAt; }

      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  const filterBtnBase: CSSProperties = {
    padding:     '5px 12px',
    borderRadius: 8,
    fontSize:    12,
    fontWeight:  600,
    cursor:      'pointer',
    border:      `1px solid ${T.hairline}`,
    background:  'transparent',
    color:       T.dim,
  };

  return (
    <div style={{
      minHeight:   '100vh',
      background:  'transparent',
      color:       T.text,
      fontFamily:  '"Inter", "SF Pro Display", system-ui, sans-serif',
      padding:     '32px 28px',
      position:    'relative',
    }}>
      {/* page title */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <motion.div
            style={{
              width: 40, height: 40, borderRadius: 13,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            animate={{ rotate: [0, 6, -6, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <CreditCard size={20} color="#fff" />
          </motion.div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: T.text }}>
              Subscriptions Ledger
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: T.faint }}>
              Cross-workspace subscription management · super admin
            </p>
          </div>
        </div>
      </motion.div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
        <KpiCard
          icon={<CheckCircle2 size={16} />}
          label="Active Subs"
          value={activeCount}
          sub="paying workspaces"
          color={T.success}
          delay={0.06}
        />
        <KpiCard
          icon={<DollarSign size={16} />}
          label="Total MRR"
          value={`$${mrrCount}`}
          sub="monthly recurring"
          color={T.accent}
          delay={0.12}
        />
        <KpiCard
          icon={<AlertTriangle size={16} />}
          label="Past Due"
          value={pastCount}
          sub="need attention"
          color={T.danger}
          delay={0.18}
        />
        <KpiCard
          icon={<Clock size={16} />}
          label="Trials"
          value={trialAmt}
          sub="trial period active"
          color={T.warning}
          delay={0.24}
        />
      </div>

      {/* filter + search bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.38 }}
        style={{
          ...T.glass,
          padding:      '14px 18px',
          marginBottom: 16,
          display:      'flex',
          flexWrap:     'wrap',
          gap:          12,
          alignItems:   'center',
        }}
      >
        {/* search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.faint }}
          />
          <input
            placeholder="Search workspace or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width:        '100%',
              padding:      '8px 12px 8px 34px',
              borderRadius: 10,
              background:   T.ghost,
              border:       `1px solid ${T.hairline}`,
              color:        T.text,
              fontSize:     13,
              outline:      'none',
              boxSizing:    'border-box',
            }}
          />
          {search && (
            <motion.button
              onClick={() => setSearch('')}
              whileTap={{ scale: 0.9 }}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: T.faint, cursor: 'pointer',
                display: 'flex', padding: 2,
              }}
            >
              <X size={12} />
            </motion.button>
          )}
        </div>

        {/* plan filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Filter size={12} style={{ color: T.faint }} />
          {(['All', 'Free', 'Starter', 'Pro', 'Pro Plus', 'Agency'] as const).map(p => (
            <motion.button
              key={p}
              onClick={() => setFilterPlan(p)}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
              style={{
                ...filterBtnBase,
                background: filterPlan === p ? T.accentDim : 'transparent',
                border: filterPlan === p ? `1px solid ${T.accentLight}55` : `1px solid ${T.hairline}`,
                color: filterPlan === p ? T.accentLight : T.dim,
              }}
            >
              {p}
            </motion.button>
          ))}
        </div>

        {/* status filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {(['All', 'active', 'trialing', 'past_due', 'canceled'] as const).map(s => {
            const c = s === 'All' ? T.dim : statusColor(s);
            return (
              <motion.button
                key={s}
                onClick={() => setFilterStatus(s)}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  ...filterBtnBase,
                  background: filterStatus === s ? `${c}18` : 'transparent',
                  border: filterStatus === s ? `1px solid ${c}55` : `1px solid ${T.hairline}`,
                  color: filterStatus === s ? c : T.dim,
                }}
              >
                {s === 'All' ? 'All' : statusLabel(s as SubStatus)}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* active filter chips */}
      <AnimatePresence>
        {(search || filterPlan !== 'All' || filterStatus !== 'All') && (
          <motion.div
            variants={chipVariants}
            initial="hidden" animate="visible" exit="exit"
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 11, color: T.faint }}>
              {visible.length} of {subs.length} subscriptions
            </span>
            {search && (
              <motion.span
                layout
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20,
                  background: T.accentDim, border: `1px solid ${T.accentLight}44`,
                  fontSize: 11, color: T.accentLight, fontWeight: 600,
                }}
              >
                "{search}"
                <X size={9} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />
              </motion.span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.32, duration: 0.4 }}
        style={{ ...T.glassCard, overflow: 'hidden' }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <ColHead label="Workspace" col="workspace" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHead label="Plan"      col="plan"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHead label="Status"    col="status"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHead label="MRR"       col="mrr"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHead label="Started"   col="started_at" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHead label="Renewal"   col="next_renewal" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th style={{ padding: '10px 14px', borderBottom: `1px solid ${T.hairline}` }} />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {visible.map((sub, idx) => (
                  <motion.tr
                    key={sub.id}
                    layout
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    custom={idx}
                    onClick={() => setSelected(sub)}
                    whileHover={{
                      backgroundColor: 'rgba(242,101,34,0.06)',
                      transition: { duration: 0.14 },
                    }}
                    style={{
                      cursor: 'pointer',
                      borderBottom: `1px solid ${T.hairline}`,
                    }}
                  >
                    {/* workspace */}
                    <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <motion.div
                          style={{
                            width: 32, height: 32, borderRadius: 10,
                            background: `linear-gradient(135deg, ${T.accent}99, ${T.accentLight}88)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
                          }}
                          whileHover={{ rotate: 8 }}
                        >
                          {sub.workspace[0]}
                        </motion.div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{sub.workspace}</div>
                          <div style={{ fontSize: 11, color: T.faint }}>{sub.ownerEmail}</div>
                        </div>
                      </div>
                    </td>

                    {/* plan */}
                    <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                      <PlanBadge plan={sub.plan} />
                    </td>

                    {/* status */}
                    <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                      <StatusChip status={sub.status} />
                    </td>

                    {/* MRR */}
                    <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 15, fontWeight: 800,
                        color: sub.mrr === 0 ? T.faint : T.text,
                      }}>
                        {fmtMrr(sub.mrr)}
                      </span>
                    </td>

                    {/* started */}
                    <td style={{ padding: '13px 14px', whiteSpace: 'nowrap', fontSize: 12, color: T.dim }}>
                      {sub.startedAt}
                    </td>

                    {/* renewal */}
                    <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 12,
                        color: sub.status === 'past_due' ? T.danger : T.dim,
                        fontWeight: sub.status === 'past_due' ? 700 : 400,
                      }}>
                        {sub.nextRenewal}
                      </span>
                    </td>

                    {/* caret */}
                    <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                      <motion.span
                        style={{ color: T.faint, display: 'flex', alignItems: 'center' }}
                        whileHover={{ color: T.accentLight, x: 2 }}
                      >
                        <ArrowRight size={14} />
                      </motion.span>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>

              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '40px 0', textAlign: 'center', color: T.faint, fontSize: 14 }}>
                    No subscriptions match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* table footer */}
        <div style={{
          padding:     '12px 18px',
          borderTop:   `1px solid ${T.hairline}`,
          display:     'flex',
          alignItems:  'center',
          justifyContent: 'space-between',
          flexWrap:    'wrap',
          gap:         8,
        }}>
          <span style={{ fontSize: 12, color: T.faint }}>
            {visible.length} subscription{visible.length !== 1 ? 's' : ''} · Sorted by <strong style={{ color: T.dim }}>{sortKey}</strong>
          </span>
          <span style={{ fontSize: 12, color: T.faint }}>
            Click any row to manage
            <ArrowRight size={10} style={{ display: 'inline', marginLeft: 4, verticalAlign: 'middle' }} />
          </span>
        </div>
      </motion.div>

      {/* detail drawer */}
      <AnimatePresence>
        {selected && (
          <SubDrawer
            key={selected.id}
            sub={selected}
            onClose={() => setSelected(null)}
            onAction={(msg, color) => {
              showToast(msg, color);
            }}
          />
        )}
      </AnimatePresence>

      {/* toasts */}
      <div style={{
        position:  'fixed',
        bottom:    28,
        left:      '50%',
        transform: 'translateX(-50%)',
        display:   'flex',
        flexDirection: 'column',
        gap:       8,
        zIndex:    999,
        pointerEvents: 'none',
        alignItems: 'center',
      }}>
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              variants={toastVariants}
              initial="hidden" animate="visible" exit="exit"
              style={{
                ...T.glassDeep,
                pointerEvents: 'auto',
                padding: '11px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minWidth: 240,
                color: t.color,
                fontSize: 13,
                fontWeight: 600,
                borderColor: `${t.color}44`,
                boxShadow: `0 4px 32px ${t.color}22`,
              }}
            >
              {t.icon}
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* subtle gradient overlay top */}
      <div
        style={{
          position:       'fixed',
          top:            0,
          left:           0,
          right:          0,
          height:         120,
          background:     `linear-gradient(to bottom, ${T.accentDim} 0%, transparent 100%)`,
          pointerEvents:  'none',
          zIndex:         0,
        }}
      />
      {/* bottom glow */}
      <div
        style={{
          position:  'fixed',
          bottom:    0,
          left:      '50%',
          transform: 'translateX(-50%)',
          width:     600,
          height:    200,
          background: `radial-gradient(ellipse 80% 50% at 50% 100%, ${T.accentDim} 0%, transparent 70%)`,
          pointerEvents: 'none',
          zIndex:    0,
        }}
      />
    </div>
  );
}
