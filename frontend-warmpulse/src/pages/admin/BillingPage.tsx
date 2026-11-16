/**
 * Admin Billing — Subscriptions Ledger (locked design: BL2)
 *
 * Visual + motion: BL2 Subscriptions Ledger — animated KPI header, searchable +
 * filterable + sortable subscriptions table with FLIP row reordering, and a spring
 * detail drawer showing that workspace's real payment history + CSV export.
 *
 * Data: real hooks only — useAdminPayments, useAdminPlanDistribution, useAdminPlans,
 * useExportPaymentsCsv. No mock arrays, no Math.random.
 *
 * Money: money() from useLocaleFormat — ₹ INR / Indian grouping by default.
 * Dates:  date() / dateTime() from useLocaleFormat — DD/MM/YYYY by default.
 *
 * Actions retained (real mutation exists):
 *   - CSV Export (useExportPaymentsCsv)
 *   - View payment history in drawer (filtered from real payments)
 * Actions dropped (no real mutation):
 *   - Refund Last Payment (no POST /admin/payments/:id/refund endpoint)
 *   - Cancel Subscription (no mutation)
 *   - Comp / Credit (no mutation)
 *   - Change Plan (no per-workspace plan-change mutation)
 *
 * Subscription fields derived/omitted:
 *   - nextRenewal: not in real data — OMITTED from table + drawer
 *   - startedAt: derived from the workspace's earliest succeeded payment date
 *   - MRR: plan price from useAdminPlans; 0 for Free/unknown
 *   - status: derived from latest payment status (succeeded→active,
 *     failed→past_due, pending→trialing, refunded/absent→active by plan name)
 */

import {
  useState,
  useEffect,
  useRef,
  useMemo,
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
  Users,
  AlertTriangle,
  Beaker,
  CheckCircle2,
  Clock,
  XCircle,
  Receipt,
  ArrowRight,
  Zap,
  Building2,
  Filter,
  Download,
  Loader2,
  TrendingUp,
  RotateCcw,
  Pencil,
} from 'lucide-react';
import {
  useAdminPayments,
  useAdminPlanDistribution,
  useAdminPlans,
  useAdminUsers,
  useExportPaymentsCsv,
} from '@/features/admin/api';
import { EditPaymentDialog } from '@/features/admin/payments/EditPaymentDialog';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';
import type { AdminPayment } from '@/features/admin/types';

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
type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
type SortKey   = 'workspace' | 'plan' | 'mrr' | 'status' | 'started_at';
type SortDir   = 'asc' | 'desc';

interface SubRow {
  /** Synthetic key: user_id (one row per paying user) */
  id:          string;
  userId:      string;
  workspace:   string;
  ownerEmail:  string;
  plan:        string;
  status:      SubStatus;
  /** Plan price from useAdminPlans, 0 for Free/unknown */
  mrr:         number;
  /** ISO string of first succeeded payment for this user; null if none */
  startedAt:   string | null;
  /** Latest payment for this user */
  lastPayment: AdminPayment | null;
  /** All payments for this user, most-recent first */
  history:     AdminPayment[];
}

// ─── CSV export columns ───────────────────────────────────────────────────────────
const BILLING_EXPORT_COLUMNS: CsvColumn<SubRow>[] = [
  { header: 'Workspace',       value: (r) => r.workspace },
  { header: 'Owner Email',     value: (r) => r.ownerEmail },
  { header: 'Plan',            value: (r) => r.plan },
  { header: 'Status',          value: (r) => r.status },
  { header: 'MRR (USD)',       value: (r) => r.mrr },
  { header: 'Started At',      value: (r) => r.startedAt ?? '' },
  { header: 'Payments',        value: (r) => r.history.length },
  { header: 'Last Payment ID', value: (r) => r.lastPayment?.id ?? '' },
  { header: 'Last Amount',     value: (r) => r.lastPayment?.amount_usd ?? '' },
  { header: 'Last Status',     value: (r) => r.lastPayment?.status ?? '' },
  { header: 'Last Paid At',    value: (r) => r.lastPayment?.created_at ?? '' },
];

// ─── Plan palette ────────────────────────────────────────────────────────────────
const PLAN_COLORS: Record<string, string> = {
  Free:      T.neutral,
  Starter:   T.accentLight,
  Pro:       T.accent,
  'Pro Plus': '#E05A1F',
  Agency:    '#C94D18',
};
function planColor(plan: string): string {
  return PLAN_COLORS[plan] ?? T.accent;
}

// ─── Status helpers ───────────────────────────────────────────────────────────────
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

/** Derive subscription status from last payment status */
function deriveStatus(lastPayment: AdminPayment | null, planName: string): SubStatus {
  if (!lastPayment) {
    return planName === 'Free' || !planName ? 'active' : 'canceled';
  }
  if (lastPayment.status === 'succeeded') return 'active';
  if (lastPayment.status === 'failed')    return 'past_due';
  if (lastPayment.status === 'pending')   return 'trialing';
  // refunded → treat as canceled
  return 'canceled';
}

function payStatusColor(s: AdminPayment['status']): string {
  if (s === 'succeeded') return T.success;
  if (s === 'refunded')  return T.accent;
  if (s === 'pending')   return T.warning;
  return T.danger;
}
function payStatusLabel(s: AdminPayment['status']): string {
  if (s === 'succeeded') return 'Succeeded';
  if (s === 'refunded')  return 'Refunded';
  if (s === 'pending')   return 'Pending';
  return 'Failed';
}
function payStatusIcon(s: AdminPayment['status']) {
  if (s === 'succeeded') return <CheckCircle2 size={13} />;
  if (s === 'refunded')  return <RotateCcw size={13} />;
  return <AlertTriangle size={13} />;
}

// ─── Animated counter hook ────────────────────────────────────────────────────────
function useAnimatedCounter(target: number): string {
  const mv      = useMotionValue(0);
  const [val, setVal] = useState('0');
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(mv, target, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) {
        setVal(Math.round(latest).toLocaleString());
      },
    });
    return () => { ctrlRef.current?.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return val;
}

// ─── Framer variants ──────────────────────────────────────────────────────────────
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

// ─── Status chip ────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: SubStatus }) {
  return (
    <motion.span
      layout
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           4,
        padding:       '3px 9px',
        borderRadius:  20,
        fontSize:      11,
        fontWeight:    600,
        letterSpacing: '0.03em',
        color:         statusColor(status),
        background:    statusBg(status),
        border:        `1px solid ${statusColor(status)}33`,
        whiteSpace:    'nowrap',
      }}
    >
      {statusIcon(status)}
      {statusLabel(status)}
    </motion.span>
  );
}

// ─── Plan badge ─────────────────────────────────────────────────────────────────
function PlanBadge({ plan }: { plan: string }) {
  const color = planColor(plan);
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
      {plan || '—'}
    </span>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────────────────────
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
      <motion.div
        style={{
          position:   'absolute', inset: 0,
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

// ─── Subscription detail drawer ───────────────────────────────────────────────────
function SubDrawer({
  sub,
  onClose,
}: {
  sub: SubRow;
  onClose: () => void;
}) {
  const { money, date, dateTime } = useLocaleFormat();
  const [editingPayment, setEditingPayment] = useState<AdminPayment | null>(null);
  const openEdit = useCallback((pay: AdminPayment, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPayment(pay);
  }, []);

  return (
    <>
      {/* edit payment dialog — rendered outside drawer so z-index stacks correctly */}
      {editingPayment && (
        <EditPaymentDialog
          payment={editingPayment}
          open={!!editingPayment}
          onOpenChange={(open) => { if (!open) setEditingPayment(null); }}
        />
      )}

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
          position:      'fixed',
          top:           0, right: 0, bottom: 0,
          width:         480,
          maxWidth:      '95vw',
          zIndex:        201,
          background:    'rgba(14,12,20,0.97)',
          borderLeft:    '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          overflowY:     'auto',
          display:       'flex',
          flexDirection: 'column',
        }}
      >
        {/* header */}
        <div style={{
          padding:     '22px 24px 18px',
          borderBottom: `1px solid ${T.hairline}`,
          display:     'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink:  0,
          position:    'sticky', top: 0, zIndex: 10,
          background:  'rgba(14,12,20,0.97)',
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
                {sub.workspace[0]?.toUpperCase() ?? '?'}
              </motion.div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{sub.workspace}</div>
                <div style={{ fontSize: 12, color: T.faint }}>{sub.ownerEmail}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <PlanBadge plan={sub.plan} />
              <StatusChip status={sub.status} />
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
              {
                label: 'MRR',
                value: money(sub.mrr),
                icon:  <TrendingUp size={13} />,
              },
              {
                label: 'Started',
                value: sub.startedAt ? date(sub.startedAt) : '—',
                icon:  <Building2 size={13} />,
              },
              {
                label: 'Last Payment',
                value: sub.lastPayment
                  ? `${money(sub.lastPayment.amount_usd)} · ${date(sub.lastPayment.created_at)}`
                  : '—',
                icon:  <CreditCard size={13} />,
              },
              {
                label: 'Payments',
                value: String(sub.history.length),
                icon:  <Receipt size={13} />,
              },
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

          {/* payment history */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.34 }}
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
                    transition={{ delay: 0.18 + idx * 0.05, duration: 0.28 }}
                    whileHover={{ x: 3 }}
                    style={{
                      ...T.glassTight,
                      padding:        '10px 14px',
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'space-between',
                      gap:            8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: `${payStatusColor(pay.status)}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: payStatusColor(pay.status), flexShrink: 0,
                      }}>
                        {payStatusIcon(pay.status)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 600, color: T.text,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {pay.plan || 'Payment'}
                        </div>
                        <div style={{ fontSize: 11, color: T.faint }}>{dateTime(pay.created_at)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: payStatusColor(pay.status) }}>
                          {money(pay.amount_usd, { decimals: 2 })}
                        </div>
                        <div style={{
                          fontSize: 10, color: T.faint,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          {payStatusLabel(pay.status)}
                        </div>
                      </div>
                      {/* Edit button */}
                      <motion.button
                        onClick={(e) => openEdit(pay, e)}
                        whileHover={{ scale: 1.14, backgroundColor: T.accentDim }}
                        whileTap={{ scale: 0.92 }}
                        title="Edit payment"
                        style={{
                          width: 28, height: 28, borderRadius: 7,
                          background: 'rgba(255,255,255,0.05)',
                          border: `1px solid rgba(255,255,255,0.10)`,
                          color: T.faint, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        <Pencil size={11} />
                      </motion.button>
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
export function BillingPage() {
  const { money, date } = useLocaleFormat();

  const [search,       setSearch]       = useState('');
  const [filterPlan,   setFilterPlan]   = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<SubStatus | 'All'>('All');
  const [sortKey,  setSortKey]  = useState<SortKey>('mrr');
  const [sortDir,  setSortDir]  = useState<SortDir>('desc');
  const [selected, setSelected] = useState<SubRow | null>(null);

  // ─── Real data ─────────────────────────────────────────────────────────────────
  // Fetch enough rows for aggregation — 200 gives solid stats without being huge
  const paymentsQ  = useAdminPayments({ page: 1, page_size: 200 });
  const planDistQ  = useAdminPlanDistribution();
  const plansQ     = useAdminPlans();
  const usersQ     = useAdminUsers({ page: 1, page_size: 200 });
  const exportCsv  = useExportPaymentsCsv();

  // Current plan per user (a payment records the plan purchased *then*; the
  // ledger should reflect the workspace's plan *now*).
  const currentPlanByUser = useMemo<Record<string, string | null>>(() => {
    const m: Record<string, string | null> = {};
    for (const u of usersQ.data?.items ?? []) m[u.id] = u.plan;
    return m;
  }, [usersQ.data]);

  const loading = paymentsQ.isLoading || plansQ.isLoading;
  const allPayments: AdminPayment[] = paymentsQ.data?.items ?? [];

  // Build plan-name → price map
  const planPriceMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const p of plansQ.data ?? []) {
      m[p.name] = p.price_monthly_usd;
    }
    return m;
  }, [plansQ.data]);

  // Collapse payments into per-user subscription rows
  const subs = useMemo<SubRow[]>(() => {
    const byUser = new Map<string, {
      ownerEmail: string;
      plan: string;
      payments: AdminPayment[];
    }>();

    for (const p of allPayments) {
      const entry = byUser.get(p.user_id) ?? { ownerEmail: p.user_email, plan: p.plan, payments: [] };
      // keep latest plan name
      if (p.plan) entry.plan = p.plan;
      entry.payments.push(p);
      byUser.set(p.user_id, entry);
    }

    const rows: SubRow[] = [];
    for (const [userId, entry] of byUser.entries()) {
      // Sort payments: most-recent first
      const history = [...entry.payments].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      const lastPayment = history[0] ?? null;
      // Earliest succeeded payment = "started"
      const succeededHistory = history.filter(p => p.status === 'succeeded');
      const earliestSucceeded = succeededHistory.length > 0
        ? succeededHistory[succeededHistory.length - 1]
        : null;

      // Current plan (preferred) → falls back to the latest payment's plan.
      const planName = currentPlanByUser[userId] || entry.plan || 'Free';
      const mrr = planPriceMap[planName] ?? 0;
      const status = deriveStatus(lastPayment, planName);

      rows.push({
        id:          userId,
        userId,
        workspace:   entry.ownerEmail.split('@')[1] ?? entry.ownerEmail,
        ownerEmail:  entry.ownerEmail,
        plan:        planName,
        status,
        mrr,
        startedAt:   earliestSucceeded?.created_at ?? null,
        lastPayment,
        history,
      });
    }

    return rows;
  }, [allPayments, planPriceMap, currentPlanByUser]);

  // Also include workspaces from planDistribution that have no payments (free tier)
  const subsWithFree = useMemo<SubRow[]>(() => {
    // planDistQ gives us plan counts but not individual workspaces — we can only
    // surface users who appear in payments. Free users with zero payments are
    // invisible to us here (the backend doesn't have a subscription table).
    // We use planDistQ only for KPI totals, not for row generation.
    return subs;
  }, [subs]);

  // ─── KPI aggregates ────────────────────────────────────────────────────────────
  const activeSubs   = subsWithFree.filter(s => s.status === 'active').length;
  const totalMrr     = subsWithFree.reduce((a, s) => a + s.mrr, 0);
  const pastDueCount = subsWithFree.filter(s => s.status === 'past_due').length;
  const trialCount   = subsWithFree.filter(s => s.status === 'trialing').length;

  const activeCount = useAnimatedCounter(activeSubs);
  const pastCount   = useAnimatedCounter(pastDueCount);
  const trialAmt    = useAnimatedCounter(trialCount);

  // ─── Distinct plans for filter bar ─────────────────────────────────────────────
  const planNames = useMemo<string[]>(() => {
    const names = new Set(subs.map(s => s.plan).filter(Boolean));
    return ['All', ...Array.from(names).sort()];
  }, [subs]);

  // ─── Filter + sort ─────────────────────────────────────────────────────────────
  const PLAN_ORDER: Record<string, number> = useMemo(() => {
    const o: Record<string, number> = {};
    planNames.slice(1).forEach((n, i) => { o[n] = i; });
    return o;
  }, [planNames]);

  const visible = useMemo(() => {
    return subsWithFree
      .filter(s => {
        const q = search.toLowerCase();
        const matchQ      = !q || s.workspace.toLowerCase().includes(q) || s.ownerEmail.toLowerCase().includes(q);
        const matchPlan   = filterPlan   === 'All' || s.plan   === filterPlan;
        const matchStatus = filterStatus === 'All' || s.status === filterStatus;
        return matchQ && matchPlan && matchStatus;
      })
      .sort((a, b) => {
        let av: number | string = 0;
        let bv: number | string = 0;
        if (sortKey === 'workspace')  { av = a.workspace;   bv = b.workspace; }
        if (sortKey === 'plan')       { av = PLAN_ORDER[a.plan] ?? 0; bv = PLAN_ORDER[b.plan] ?? 0; }
        if (sortKey === 'mrr')        { av = a.mrr;         bv = b.mrr; }
        if (sortKey === 'status')     { av = a.status;      bv = b.status; }
        if (sortKey === 'started_at') { av = a.startedAt ?? ''; bv = b.startedAt ?? ''; }

        if (typeof av === 'string' && typeof bv === 'string') {
          return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
      });
  }, [subsWithFree, search, filterPlan, filterStatus, sortKey, sortDir, PLAN_ORDER]);

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  // ─── CSV export ─────────────────────────────────────────────────────────────────
  async function handleExport() {
    try {
      const blob = await exportCsv.mutateAsync(undefined);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Payments CSV exported.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Export failed.'));
    }
  }

  const filterBtnBase: CSSProperties = {
    padding:      '5px 12px',
    borderRadius: 8,
    fontSize:     12,
    fontWeight:   600,
    cursor:       'pointer',
    border:       `1px solid ${T.hairline}`,
    background:   'transparent',
    color:        T.dim,
  };

  return (
    <div style={{
      minHeight:  '100vh',
      background: 'transparent',
      color:      T.text,
      fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
      padding:    '32px 28px',
      position:   'relative',
    }}>

      {/* page title */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Client-side ledger export */}
          <ExportButton
            rows={subsWithFree}
            columns={BILLING_EXPORT_COLUMNS}
            filename={`billing-${exportStamp()}`}
          />

          {/* Export CSV action */}
          <motion.button
            onClick={handleExport}
            disabled={exportCsv.isPending}
            whileHover={{ scale: 1.04, backgroundColor: `${T.accent}28` }}
            whileTap={{ scale: 0.96 }}
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         8,
              padding:     '9px 16px',
              borderRadius: 10,
              background:  T.accentDim,
              border:      `1px solid ${T.accent}44`,
              color:       T.accentLight,
              fontSize:    13,
              fontWeight:  600,
              cursor:      exportCsv.isPending ? 'not-allowed' : 'pointer',
              opacity:     exportCsv.isPending ? 0.65 : 1,
            }}
          >
            {exportCsv.isPending
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <Download size={14} />}
            {exportCsv.isPending ? 'Exporting…' : 'Export CSV'}
          </motion.button>
          </div>
        </div>
      </motion.div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
        <KpiCard
          icon={<CheckCircle2 size={16} />}
          label="Active Subs"
          value={loading ? '—' : activeCount}
          sub="paying workspaces"
          color={T.success}
          delay={0.06}
        />
        <KpiCard
          icon={<TrendingUp size={16} />}
          label="Total MRR"
          value={loading ? '—' : money(totalMrr)}
          sub="monthly recurring"
          color={T.accent}
          delay={0.12}
        />
        <KpiCard
          icon={<AlertTriangle size={16} />}
          label="Past Due"
          value={loading ? '—' : pastCount}
          sub="need attention"
          color={T.danger}
          delay={0.18}
        />
        <KpiCard
          icon={<Clock size={16} />}
          label="Trials"
          value={loading ? '—' : trialAmt}
          sub="trial period active"
          color={T.warning}
          delay={0.24}
        />
      </div>

      {/* plan distribution strip (from useAdminPlanDistribution) */}
      {planDistQ.data && planDistQ.data.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.20, duration: 0.38 }}
          style={{
            ...T.glass,
            padding:      '12px 18px',
            marginBottom: 20,
            display:      'flex',
            flexWrap:     'wrap',
            gap:          12,
            alignItems:   'center',
          }}
        >
          <span style={{ fontSize: 11, color: T.faint, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Plan mix
          </span>
          {planDistQ.data.map((row) => (
            <span key={row.plan} style={{
              display:       'inline-flex',
              alignItems:    'center',
              gap:           6,
              fontSize:      12,
              color:         T.dim,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: planColor(row.plan), display: 'inline-block', flexShrink: 0,
              }} />
              {row.plan} <strong style={{ color: T.text }}>{row.count}</strong>
              {row.mrr != null && row.mrr > 0 && (
                <span style={{ color: T.faint }}>· {money(row.mrr)}</span>
              )}
            </span>
          ))}
        </motion.div>
      )}

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
            placeholder="Search email or domain…"
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
          {planNames.map(p => (
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
              {visible.length} of {subsWithFree.length} subscriptions
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

      {/* loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: T.faint, padding: '20px 0' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13 }}>Loading subscription data…</span>
        </div>
      )}

      {/* table */}
      {!loading && (
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
                  <ColHead label="Workspace"  col="workspace"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHead label="Plan"       col="plan"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHead label="Status"     col="status"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHead label="MRR"        col="mrr"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHead label="Started"    col="started_at" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
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
                        cursor:       'pointer',
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
                            {sub.workspace[0]?.toUpperCase() ?? '?'}
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
                          {money(sub.mrr)}
                        </span>
                      </td>

                      {/* started */}
                      <td style={{ padding: '13px 14px', whiteSpace: 'nowrap', fontSize: 12, color: T.dim }}>
                        {sub.startedAt ? date(sub.startedAt) : '—'}
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

                {visible.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} style={{ padding: '40px 0', textAlign: 'center', color: T.faint, fontSize: 14 }}>
                      {subsWithFree.length === 0
                        ? 'No subscription data available yet.'
                        : 'No subscriptions match your filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* table footer */}
          <div style={{
            padding:        '12px 18px',
            borderTop:      `1px solid ${T.hairline}`,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            flexWrap:       'wrap',
            gap:            8,
          }}>
            <span style={{ fontSize: 12, color: T.faint }}>
              {visible.length} subscription{visible.length !== 1 ? 's' : ''} · Sorted by{' '}
              <strong style={{ color: T.dim }}>{sortKey.replace('_', ' ')}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: T.faint }}>
              <Users size={10} />
              {subsWithFree.length} total workspaces · click any row to view history
              <ArrowRight size={10} style={{ marginLeft: 2 }} />
            </span>
          </div>
        </motion.div>
      )}

      {/* detail drawer */}
      <AnimatePresence>
        {selected && (
          <SubDrawer
            key={selected.id}
            sub={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>

      {/* subtle gradient overlay top */}
      <div style={{
        position:      'fixed',
        top:           0, left: 0, right: 0,
        height:        120,
        background:    `linear-gradient(to bottom, rgba(242,101,34,0.18) 0%, transparent 100%)`,
        pointerEvents: 'none',
        zIndex:        0,
      }} />
      {/* bottom glow */}
      <div style={{
        position:  'fixed',
        bottom:    0,
        left:      '50%',
        transform: 'translateX(-50%)',
        width:     600,
        height:    200,
        background: `radial-gradient(ellipse 80% 50% at 50% 100%, rgba(242,101,34,0.18) 0%, transparent 70%)`,
        pointerEvents: 'none',
        zIndex:    0,
      }} />
    </div>
  );
}

export default BillingPage;
