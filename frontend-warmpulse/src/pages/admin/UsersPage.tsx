/**
 * /admin/users — U3 Profile Gallery (live)
 *
 * Visual design: U3 Profile Gallery (AdmUsrU3Gallery) candidate.
 * ALL data wired to real hooks:
 *   useAdminUsers        → card grid of real users (list + search/filter/pagination)
 *   useAdminUserAvatar   → avatar image fetched through bearer-token proxy
 *   useAdminSignupRate   → KPI: new users count
 *   useAdminPlanDistribution → KPI: plan mix (unused in counter strip but preserved for CSV export)
 *   useImpersonateAndEnter   → marquee "Enter as User" CTA in profile panel
 *   useSuspendUser           → suspend / unsuspend action in profile panel
 *   useDeleteUser            → delete action (with confirm dialog) in profile panel
 *   useBulkPauseMailboxes    → multi-select bulk pause/resume all mailboxes
 *                              (card checkboxes + select-all + floating action bar;
 *                              "Apply to ALL client users" sends user_ids: [])
 *
 * Field mapping (AdminUserRow → U3 visual):
 *   id          → card layoutId key
 *   name        → display name (falls back to email prefix)
 *   email       → email row in card + profile panel
 *   plan        → PlanChip
 *   status      → StatusDot  ('active'|'suspended'|'pending' → 'active'|'suspended'|'invited')
 *   mailbox_count → mailbox count in card footer
 *   joined_at   → "Signed Up" detail cell in profile panel
 *   last_seen_at → "Last Active" detail cell
 *   role        → RoleIcon (super_admin/admin shield/star; string field so guarded)
 *   avatar_url  → bool flag for useAdminUserAvatar fetch; initials fallback
 *
 * Dropped from U3 mock (no real field/mutation):
 *   workspace name  — no workspace_name on AdminUserRow; omitted
 *   twoFA / 2FA reset — no 2FA field on AdminUserRow; omitted
 *   recentActivity  — no activity field; omitted
 *   change-plan menu — no admin mutation for plan change; removed
 *   change-role menu — no admin mutation for role change; removed
 *   resend-invite    — no real resend mutation; omitted
 *   "Enter as User" button hidden when status = pending (can't log into unverified account)
 *
 * Motion preserved from U3:
 *   staggered card entrance (containerVariants + cardVariants),
 *   whileHover lift + glow,
 *   layoutId shared-element morph card → profile panel (AnimatePresence),
 *   grid layout-animated re-ordering on filter changes,
 *   animated KPI counters (useMotionValue + animate + cleanup),
 *   filter chip dot layoutId,
 *   backdrop blur overlay,
 *   profile panel staggered content reveal.
 *
 * Palette: warm Aurora Glass only — orange #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B, neutrals. No purple/violet/blue/teal/cyan.
 */

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
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
  Users,
  Search,
  X,
  Mail,
  Shield,
  ShieldOff,
  UserCheck,
  UserX,
  LogIn,
  Clock,
  ChevronDown,
  Star,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Inbox,
  Calendar,
  MoreHorizontal,
  Receipt,
  Pencil,
  RotateCcw,
  Pause,
  Play,
} from 'lucide-react';
import {
  useAdminUsers,
  useAdminSignupRate,
  useAdminUserAvatar,
  useSuspendUser,
  useSabotageUser,
  useUnsabotageUser,
  useUpdateUserPlan,
  useDeleteUser,
  useBulkPauseMailboxes,
  useImpersonateAndEnter,
  useAdminPayments,
  useAdminPlans,
} from '@/features/admin/api';
import { useAdminUi } from '@/stores/adminUi';
import { Skull } from 'lucide-react';
import { ArrowLeftRight } from 'lucide-react';
import { EditPaymentDialog } from '@/features/admin/payments/EditPaymentDialog';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { extractErrorMessage } from '@/lib/errors';
import { UserDetailDrawer } from './users';
import { TransferMailboxDialog } from './users/TransferMailboxDialog';
import type { AdminUserRow, AdminPayment } from '@/features/admin/types';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatDate } from '@/lib/format';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';

// ─── CSV export columns ──────────────────────────────────────────────────────────
const USERS_EXPORT_COLUMNS: CsvColumn<AdminUserRow>[] = [
  { header: 'Email', value: (u) => u.email },
  { header: 'Name', value: (u) => u.name },
  { header: 'Plan', value: (u) => u.plan },
  { header: 'Role', value: (u) => u.role ?? 'member' },
  { header: 'Status', value: (u) => u.status },
  { header: 'Mailboxes', value: (u) => u.mailbox_count },
  { header: 'Joined At', value: (u) => u.joined_at },
  { header: 'Last Seen At', value: (u) => u.last_seen_at },
  { header: 'User ID', value: (u) => u.id },
];

// ─── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.40)' as const,
  ghost: 'rgba(255,255,255,0.22)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.20)' as const,
  accentGlow: 'rgba(242,101,34,0.35)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.15)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.15)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.15)' as const,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 16,
  } as CSSProperties,
  glassCard: {
    background: 'rgba(255,255,255,0.055)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRadius: 18,
  } as CSSProperties,
  glassTight: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: 10,
  } as CSSProperties,
  glassDeep: {
    background: 'rgba(255,255,255,0.075)',
    border: '1px solid rgba(255,255,255,0.13)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 22,
  } as CSSProperties,
};

// ─── Status helpers ──────────────────────────────────────────────────────────────
// AdminUserRow.status is 'active' | 'suspended' | 'pending'. Map 'pending' → 'invited' display.
type DisplayStatus = 'active' | 'suspended' | 'invited';

function toDisplayStatus(s: AdminUserRow['status']): DisplayStatus {
  if (s === 'active') return 'active';
  if (s === 'suspended') return 'suspended';
  return 'invited';
}

const STATUS_COLORS: Record<DisplayStatus, string> = {
  active: '#3ddc97',
  invited: '#FF8A4B',
  suspended: '#ff5c7a',
};

const STATUS_LABELS: Record<DisplayStatus, string> = {
  active: 'Active',
  invited: 'Pending',
  suspended: 'Suspended',
};

// ─── Plan helpers ─────────────────────────────────────────────────────────────────
function planColor(plan: string | null | undefined): { bg: string; text: string; border: string } {
  if (!plan) return { bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.14)' };
  const p = plan.toLowerCase();
  if (p === 'agency') return { bg: 'rgba(242,101,34,0.22)', text: '#F26522', border: 'rgba(242,101,34,0.40)' };
  if (p.includes('plus')) return { bg: 'rgba(242,101,34,0.18)', text: '#FF8A4B', border: 'rgba(242,101,34,0.35)' };
  if (p === 'pro') return { bg: 'rgba(255,138,75,0.12)', text: '#FF8A4B', border: 'rgba(255,138,75,0.25)' };
  if (p === 'starter') return { bg: 'rgba(242,101,34,0.12)', text: '#F26522', border: 'rgba(242,101,34,0.25)' };
  return { bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.14)' };
}

// ─── Avatar helpers ──────────────────────────────────────────────────────────────
function initials(s: string): string {
  return s
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => (p[0] ?? '').toUpperCase())
    .join('') || '?';
}

function avatarBg(email: string): string {
  const palette = [
    'linear-gradient(135deg,#F26522,#FF8A4B)',
    'linear-gradient(135deg,#FF8A4B,#ffb066)',
    'linear-gradient(135deg,#e0552f,#F26522)',
    'linear-gradient(135deg,#c2410c,#FF8A4B)',
  ];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % palette.length;
  return palette[h] ?? palette[0]!;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatDate(iso);
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 120) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  const days = Math.floor(secs / 86400);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const mos = Math.floor(days / 30);
  return `${mos} mo${mos === 1 ? '' : 's'} ago`;
}

// ─── Animated counter hook ──────────────────────────────────────────────────────
function useAnimCounter(target: number, duration = 1.2): number {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration,
      ease: [0.25, 0.1, 0.25, 1],
    });
    const unsub = mv.on('change', (v) => setDisplay(Math.round(v)));
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [target, duration, mv]);

  return display;
}

// ─── Framer-motion variants ─────────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.1 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.94 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 280, damping: 24 },
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    transition: { duration: 0.18 },
  },
};

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22 } },
  exit: { opacity: 0, transition: { duration: 0.20 } },
};

const filterChipVariants: Variants = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 22 } },
};

// ─── Sub-components ─────────────────────────────────────────────────────────────

function PlanChip({ plan }: { plan: string | null }) {
  const c = planColor(plan);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 9px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.03em',
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {plan || '—'}
    </span>
  );
}

function StatusDot({ status }: { status: DisplayStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        color,
      }}
    >
      <motion.span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          boxShadow: `0 0 6px ${color}88`,
        }}
        animate={
          status === 'active'
            ? { opacity: [1, 0.5, 1], scale: [1, 1.2, 1] }
            : {}
        }
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

function RoleIcon({ role }: { role: string | undefined }) {
  if (role === 'super_admin')
    return <Shield size={12} style={{ color: T.accent }} />;
  if (role === 'admin')
    return <Star size={12} style={{ color: T.accentLight }} />;
  return null;
}

// ─── Avatar component with real token-gated fetch ────────────────────────────────
function CardAvatar({ row, size = 48 }: { row: AdminUserRow; size?: number }) {
  const hasAvatar = !!row.avatar_url;
  const url = useAdminUserAvatar(row.id, hasAvatar);
  const displayName = row.name ?? row.email;
  if (hasAvatar && url) {
    return (
      <img
        src={url}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.10), 0 4px 16px rgba(0,0,0,0.30)`,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: avatarBg(row.email),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
        boxShadow: `0 0 0 2px rgba(255,255,255,0.10), 0 4px 16px rgba(0,0,0,0.30)`,
      }}
    >
      {initials(displayName)}
    </div>
  );
}

const StatKpi = forwardRef<
  HTMLDivElement,
  {
    label: string;
    value: number;
    icon: typeof Users;
    color: string;
    delay?: number;
    loading?: boolean;
  }
>(({ label, value, icon: Icon, color, delay, loading }, ref) => {
  const display = useAnimCounter(value, 1.1 + (delay ?? 0) * 0.15);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: delay ?? 0 }}
      style={{
        ...T.glass,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        minWidth: 140,
        flex: 1,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: `${color}20`,
          border: `1px solid ${color}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, lineHeight: 1 }}>
          {loading ? '…' : display.toLocaleString()}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.faint, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </div>
      </div>
    </motion.div>
  );
});

// ─── Filter chip ─────────────────────────────────────────────────────────────────
const FilterChip = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    active: boolean;
    color: string;
    onClick: () => void;
  }
>(({ label, active, color, onClick }, ref) => {
  return (
    <motion.button
      ref={ref}
      variants={filterChipVariants}
      whileHover={{ scale: 1.06, y: -1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 13px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        border: active ? `1px solid ${color}60` : '1px solid rgba(255,255,255,0.10)',
        background: active ? `${color}18` : 'rgba(255,255,255,0.05)',
        color: active ? color : T.dim,
        transition: 'background 0.18s, border-color 0.18s, color 0.18s',
      }}
    >
      {active && (
        <motion.span
          layoutId={`dot-${label}`}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            display: 'inline-block',
          }}
        />
      )}
      {label}
    </motion.button>
  );
});

// ─── Payment helpers (Aurora Glass palette) ──────────────────────────────────────
function payStatusColor(s: AdminPayment['status']): string {
  if (s === 'succeeded') return '#3ddc97';
  if (s === 'refunded')  return '#F26522';
  if (s === 'pending')   return '#FF8A4B';
  return '#ff5c7a';
}
function payStatusIcon(s: AdminPayment['status']) {
  if (s === 'succeeded') return <CheckCircle2 size={12} />;
  if (s === 'refunded')  return <RotateCcw size={12} />;
  return <AlertTriangle size={12} />;
}
function payStatusLabel(s: AdminPayment['status']): string {
  if (s === 'succeeded') return 'Succeeded';
  if (s === 'refunded')  return 'Refunded';
  if (s === 'pending')   return 'Pending';
  return 'Failed';
}

/**
 * Payments subsection shown inside the user ProfilePanel.
 * Fetches all admin payments, then filters client-side by user_id.
 * (The backend /admin/payments doesn't have a user_id filter yet — only
 * user_email — so we fetch 200 rows and filter client-side.)
 */
function UserPaymentsSection({ row }: { row: AdminUserRow }) {
  const { money, date } = useLocaleFormat();
  const paymentsQ = useAdminPayments({ user_email: row.email, page: 1, page_size: 50 });
  const [editingPayment, setEditingPayment] = useState<AdminPayment | null>(null);

  // Filter by user_id client-side as belt-and-suspenders (user_email filter may
  // match multiple accounts if emails were reused — guard by user_id).
  const payments: AdminPayment[] = (paymentsQ.data?.items ?? []).filter(
    (p) => p.user_id === row.id || p.user_email === row.email,
  );

  const glassTight: CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: 10,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.30 }}
      style={{ marginTop: 4 }}
    >
      {/* edit payment dialog */}
      {editingPayment && (
        <EditPaymentDialog
          payment={editingPayment}
          open={!!editingPayment}
          onOpenChange={(open) => { if (!open) setEditingPayment(null); }}
        />
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: 'rgba(255,255,255,0.40)',
        fontWeight: 600, letterSpacing: '0.05em',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        <Receipt size={12} />
        Payments
      </div>

      {paymentsQ.isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.40)', fontSize: 12, padding: '10px 0' }}>
          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
          Loading payments…
        </div>
      ) : payments.length === 0 ? (
        <div style={{ ...glassTight, padding: '12px 14px', color: 'rgba(255,255,255,0.38)', fontSize: 12, textAlign: 'center' }}>
          No payments found
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {payments.map((pay) => (
            <div
              key={pay.id}
              style={{
                ...glassTight,
                padding: '9px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: `${payStatusColor(pay.status)}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: payStatusColor(pay.status), flexShrink: 0,
                }}>
                  {payStatusIcon(pay.status)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap' }}>
                    {money(pay.amount_usd)}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', whiteSpace: 'nowrap' }}>
                    {payStatusLabel(pay.status)} · {date(pay.created_at)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {pay.plan && (
                  <span style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.40)',
                    fontWeight: 600, whiteSpace: 'nowrap',
                  }}>{pay.plan}</span>
                )}
                <motion.button
                  onClick={(e) => { e.stopPropagation(); setEditingPayment(pay); }}
                  whileHover={{ scale: 1.14 }}
                  whileTap={{ scale: 0.92 }}
                  title="Edit payment"
                  style={{
                    width: 26, height: 26, borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: 'rgba(255,255,255,0.40)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <Pencil size={10} />
                </motion.button>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

const ProfilePanel = forwardRef<
  HTMLDivElement,
  {
    row: AdminUserRow;
    onClose: () => void;
    onSuspend: () => void;
    onSabotage: () => void;
    onUnsabotage: () => void;
    onUpdatePlan: (planId: string) => void;
    onDelete: () => void;
    onImpersonate: () => void;
    suspending: boolean;
    sabotaging: boolean;
    unsabotaging: boolean;
    updatingPlan: boolean;
    deleting: boolean;
    impersonating: boolean;
    godMode: boolean;
  }
>(
  (
    {
      row,
      onClose,
      onSuspend,
      onSabotage,
      onUnsabotage,
      onUpdatePlan,
      onDelete,
      onImpersonate,
      suspending,
      sabotaging,
      unsabotaging,
      updatingPlan,
      deleting,
      impersonating,
      godMode,
    },
    ref,
  ) => {
    const [confirmSuspend, setConfirmSuspend] = useState(false);
    const { data: plans } = useAdminPlans();
    const displayStatus = toDisplayStatus(row.status);
    const isSuspended = row.status === 'suspended';
    const isPending = row.status === 'pending';
    const canImpersonate = row.role !== 'super_admin' && !isPending;
    const displayName = row.name ?? row.email.split('@')[0] ?? row.email;

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSuspendClick() {
    if (isSuspended) {
      // unsuspend directly
      onSuspend();
      setConfirmSuspend(false);
    } else if (confirmSuspend) {
      onSuspend();
      setConfirmSuspend(false);
    } else {
      setConfirmSuspend(true);
    }
  }

  return (
    <motion.div
      ref={ref}
      layoutId={`card-${row.id}`}

      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 680,
        maxHeight: '90vh',
        overflowY: 'auto',
        ...T.glassDeep,
        padding: 0,
        zIndex: 10,
      }}
      initial={false}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
    >
      {/* Accent header strip */}
      <motion.div
        initial={{ scaleX: 0, originX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.18, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
          borderRadius: '22px 22px 0 0',
        }}
      />

      <div style={{ padding: '28px 32px' }}>
        {/* Close button */}
        <motion.button
          whileHover={{ scale: 1.12, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: T.dim,
          }}
        >
          <X size={16} />
        </motion.button>

        {/* Header row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, type: 'spring', stiffness: 280, damping: 24 }}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24 }}
        >
          <CardAvatar row={row} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{displayName}</span>
              <RoleIcon role={row.role} />
            </div>
            <div style={{ fontSize: 13, color: T.faint, marginTop: 2 }}>{row.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <select
                  value={plans?.find((p) => p.name === row.plan)?.id ?? ''}
                  onChange={(e) => onUpdatePlan(e.target.value)}
                  disabled={updatingPlan}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    color: T.accent,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 24px 2px 8px',
                    appearance: 'none',
                    cursor: updatingPlan ? 'wait' : 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <option value="" disabled>Select Plan</option>
                  {plans?.map((p) => (
                    <option key={p.id} value={p.id} style={{ background: '#12121a', color: '#fff' }}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={10}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: T.accent,
                  }}
                />
              </div>
              <StatusDot status={displayStatus} />
              {godMode && row.is_sabotaged && (
                <div style={{
                  background: T.dangerDim,
                  color: T.danger,
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 6,
                  border: `1px solid ${T.danger}40`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  Sabotaged
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* IMPERSONATE CTA — marquee action */}
        {canImpersonate && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            whileHover={{ scale: 1.02, boxShadow: `0 0 32px ${T.accentGlow}` }}
            whileTap={{ scale: 0.97 }}
            onClick={onImpersonate}
            disabled={impersonating}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
              border: 'none',
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: '0.02em',
              cursor: impersonating ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: `0 4px 20px ${T.accentDim}`,
              marginBottom: 20,
              opacity: impersonating ? 0.7 : 1,
            }}
          >
            {impersonating ? (
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <LogIn size={18} />
            )}
            Enter as User — Impersonate {displayName}
          </motion.button>
        )}

        {/* Detail grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 18,
          }}
        >
          {([
            { icon: Inbox, label: 'Mailboxes', value: String(row.mailbox_count ?? 0), color: undefined },
            { icon: Clock, label: 'Last Active', value: fmtRelative(row.last_seen_at), color: undefined },
            { icon: Calendar, label: 'Signed Up', value: fmtDate(row.joined_at), color: undefined },
            { icon: Shield, label: 'Role', value: row.role ?? 'member', color: undefined },
          ] as Array<{ icon: typeof Inbox; label: string; value: string; color: string | undefined }>)
            .map(({ icon: Icon, label, value, color }) => (
              <div
                key={label}
                style={{
                  ...T.glassTight,
                  padding: '11px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Icon size={14} color={T.faint} />
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 13, color: color ?? T.text, fontWeight: 600, marginTop: 2 }}>{value}</div>
                </div>
              </div>
            ))}
        </motion.div>

        {/* Action row — Suspend / Reactivate / Delete */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}
        >
          {/* Suspend / Reactivate — hidden for pending users */}
          {!isPending && (
            isSuspended ? (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleSuspendClick}
                disabled={suspending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 10,
                  background: T.successDim,
                  border: `1px solid ${T.success}40`,
                  color: T.success,
                  fontSize: 12, fontWeight: 700, cursor: suspending ? 'wait' : 'pointer',
                  opacity: suspending ? 0.7 : 1,
                }}
              >
                <UserCheck size={13} />
                {suspending ? 'Reactivating…' : 'Reactivate'}
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleSuspendClick}
                disabled={suspending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 10,
                  background: confirmSuspend ? T.dangerDim : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${confirmSuspend ? T.danger + '60' : 'rgba(255,255,255,0.10)'}`,
                  color: confirmSuspend ? T.danger : T.dim,
                  fontSize: 12, fontWeight: 700, cursor: suspending ? 'wait' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: suspending ? 0.7 : 1,
                }}
              >
                <UserX size={13} />
                {suspending ? 'Suspending…' : confirmSuspend ? 'Confirm suspend?' : 'Suspend'}
              </motion.button>
            )
          )}

          {/* Delete */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onDelete}
            disabled={deleting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              borderRadius: 10,
              background: T.dangerDim,
              border: `1px solid ${T.danger}40`,
              color: T.danger,
              fontSize: 12, fontWeight: 700, cursor: deleting ? 'wait' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
          >
            <UserX size={13} />
            {deleting ? 'Deleting…' : 'Delete user'}
          </motion.button>

          {/* REVENGE — hidden behind God Mode */}
          {godMode && !row.is_sabotaged && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={onSabotage}
              disabled={sabotaging}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.4)',
                border: `1px solid ${T.danger}`,
                color: T.danger,
                fontSize: 12, fontWeight: 700, cursor: sabotaging ? 'wait' : 'pointer',
                opacity: sabotaging ? 0.7 : 1,
              }}
            >
              <Skull size={13} />
              {sabotaging ? 'Sabotaging…' : 'Trigger Revenge'}
            </motion.button>
          )}

          {godMode && row.is_sabotaged && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={onUnsabotage}
              disabled={unsabotaging}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.4)',
                border: `1px solid #3ddc97`,
                color: '#3ddc97',
                fontSize: 12, fontWeight: 700, cursor: unsabotaging ? 'wait' : 'pointer',
                opacity: unsabotaging ? 0.7 : 1,
              }}
            >
              <RotateCcw size={13} />
              {unsabotaging ? 'Stopping…' : 'Stop Sabotage'}
            </motion.button>
          )}
        </motion.div>

        {/* Payments subsection */}
        <UserPaymentsSection row={row} />
      </div>
    </motion.div>
  );
});

// ─── Selection checkbox (bulk pause/resume) ─────────────────────────────────────
// No standalone checkbox primitive exists in components/ui, so a styled native
// input it is — accent-tinted to sit on the U3 glass cards.
const SELECT_CHECKBOX_STYLE: CSSProperties = {
  width: 16,
  height: 16,
  accentColor: T.accent,
  cursor: 'pointer',
  flexShrink: 0,
};

// ─── User card ───────────────────────────────────────────────────────────────────
const UserCard = forwardRef<
  HTMLDivElement,
  {
    row: AdminUserRow;
    onClick: () => void;
    godMode: boolean;
    selected: boolean;
    onToggleSelect: (id: string) => void;
  }
>(({ row, onClick, godMode, selected, onToggleSelect }, ref) => {
  const displayStatus = toDisplayStatus(row.status);
  const isSuspended = row.status === 'suspended';
  const isSuperAdmin = row.role === 'super_admin';
  const displayName = row.name ?? row.email.split('@')[0] ?? row.email;

  return (
    <motion.div
      ref={ref}
      layoutId={`card-${row.id}`}
      variants={cardVariants}
      layout
      whileHover={{
        y: -6,
        boxShadow: `0 12px 40px rgba(0,0,0,0.40), 0 0 0 1px rgba(242,101,34,0.25), 0 0 32px rgba(242,101,34,0.10)`,
      }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        ...T.glassCard,
        padding: '20px 18px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        opacity: isSuspended ? 0.72 : 1,
        outline: selected ? `1.5px solid ${T.accent}70` : 'none',
        outlineOffset: -1.5,
      }}
    >
      {/* Sabotaged indicator (God Mode only) */}
      {godMode && row.is_sabotaged && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          background: T.danger,
          color: '#fff',
          fontSize: 8,
          fontWeight: 900,
          padding: '2px 6px',
          borderRadius: '0 0 0 8px',
          textTransform: 'uppercase',
          zIndex: 2,
        }}>
          Sabotaged
        </div>
      )}
      {/* Suspended overlay tint */}
      {isSuspended && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,92,122,0.04)',
            borderRadius: 18,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Top row: select checkbox + avatar + plan chip + role icon */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={selected}
            disabled={isSuperAdmin}
            title={isSuperAdmin ? 'Admins excluded' : undefined}
            aria-label={isSuperAdmin ? 'Admins excluded from bulk actions' : `Select ${displayName}`}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect(row.id)}
            style={{
              ...SELECT_CHECKBOX_STYLE,
              cursor: isSuperAdmin ? 'not-allowed' : 'pointer',
              opacity: isSuperAdmin ? 0.35 : 1,
            }}
          />
          <CardAvatar row={row} size={48} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PlanChip plan={row.plan} />
          <RoleIcon role={row.role} />
        </div>
      </div>

      {/* Name + email */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{displayName}</div>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.email}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: T.hairline, marginBottom: 12 }} />

      {/* Footer: status + last active + mailboxes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusDot status={displayStatus} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.ghost }}>
            <Inbox size={11} />
            {row.mailbox_count ?? 0}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.ghost }}>
            <Clock size={11} />
            {fmtRelative(row.last_seen_at)}
          </span>
        </div>
      </div>

      {/* Hover accent edge */}
      <motion.div
        initial={{ scaleY: 0, originY: 0 }}
        whileHover={{ scaleY: 1 }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 3,
          height: '100%',
          background: `linear-gradient(180deg, ${T.accent}, ${T.accentLight})`,
          borderRadius: '18px 0 0 18px',
        }}
        transition={{ duration: 0.22 }}
      />
    </motion.div>
  );
});

// ─── Bulk pause/resume confirm dialog ────────────────────────────────────────────
/**
 * Confirm for the bulk mailboxes pause/resume action. The primary button acts
 * on the N selected users; the secondary "Apply to ALL client users" path sends
 * `user_ids: []` (backend = every client user, super_admins always skipped).
 */
function BulkPauseDialog({
  action,
  selectedCount,
  pending,
  onConfirm,
  onCancel,
}: {
  action: 'pause' | 'resume';
  selectedCount: number;
  pending: boolean;
  onConfirm: (scope: 'selected' | 'all') => void;
  onCancel: () => void;
}) {
  const isPause = action === 'pause';
  const verb = isPause ? 'Pause' : 'Resume';
  return (
    <AppDialog open onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{verb} all mailboxes?</AppDialogTitle>
          <AppDialogDescription>
            {verb} warmup for all mailboxes of the {selectedCount} selected user
            {selectedCount === 1 ? '' : 's'}? Super admins are excluded automatically.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <p className="text-sm text-text-dim">
            This {isPause ? 'pauses' : 'resumes'} warmup sending and engagement for every
            mailbox {isPause ? '— ramp progress is kept' : '— ramps resume from where they stopped'}.
          </p>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => onConfirm('all')}
            disabled={pending}
            className="text-accent3 border-accent3/40 hover:bg-accent3/10"
          >
            Apply to ALL client users
          </Button>
          <Button
            variant={isPause ? 'danger' : 'primary'}
            onClick={() => onConfirm('selected')}
            disabled={pending}
            isLoading={pending}
          >
            {verb} {selectedCount} selected
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

// ─── Main page component ─────────────────────────────────────────────────────────

type StatusFilter = 'active' | 'suspended' | 'pending' | null;

export function UsersPage() {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [expandedRow, setExpandedRow] = useState<AdminUserRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Bulk pause/resume selection (multi-select on the card grid)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'pause' | 'resume' | null>(null);

  const godMode = useAdminUi((s) => s.godMode);
  const [windowDays] = useState<7 | 30 | 90>(30);

  const users = useAdminUsers({ page: 1, page_size: 100 });
  const signup = useAdminSignupRate(windowDays);
  const suspend = useSuspendUser();
  const sabotage = useSabotageUser();
  const unsabotage = useUnsabotageUser();
  const updatePlan = useUpdateUserPlan();
  const deleteUser = useDeleteUser();
  const impersonate = useImpersonateAndEnter();
  const bulkPause = useBulkPauseMailboxes();

  const rows: AdminUserRow[] = users.data?.items ?? [];

  const handleUpdatePlan = useCallback(
    async (row: AdminUserRow, planId: string) => {
      try {
        await updatePlan.mutateAsync({ userId: row.id, planId });
        toast.success(`Plan updated for ${row.email}`);
        setExpandedRow((prev) => (prev?.id === row.id ? { ...prev, plan_id: planId } : prev));
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Failed to update plan.'));
      }
    },
    [updatePlan],
  );

  // Derive plan list from actual data
  const planOptions = useMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const r of rows) if (r.plan) seen.add(r.plan);
    return Array.from(seen).sort();
  }, [rows]);

  // KPI counts
  const counts = useMemo(() => {
    let active = 0, suspended = 0, pending = 0;
    for (const r of rows) {
      if (r.status === 'active') active++;
      else if (r.status === 'suspended') suspended++;
      else pending++;
    }
    return { total: rows.length, active, suspended, pending };
  }, [rows]);

  const totalSignups = useMemo(
    () => (signup.data ?? []).reduce((acc, p) => acc + (p.signups ?? 0), 0),
    [signup.data],
  );

  // Filtered list
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (planFilter && r.plan !== planFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (q) {
        return (
          r.email.toLowerCase().includes(q) ||
          (r.name ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, planFilter, statusFilter, query]);

  const hasFilters = !!planFilter || !!statusFilter || !!query;

  // ── Bulk selection (super_admins are excluded everywhere — backend skips them) ──
  const selectableRows = useMemo(
    () => filteredRows.filter((r) => r.role !== 'super_admin'),
    [filteredRows],
  );

  const selectedCount = selectedIds.size;
  const allSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selectedIds.has(r.id));
  const someSelected = !allSelected && selectableRows.some((r) => selectedIds.has(r.id));

  // Native checkbox indeterminate state can't be set via React props — set it imperatively.
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected, allSelected]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const everySelected =
        selectableRows.length > 0 && selectableRows.every((r) => prev.has(r.id));
      const next = new Set(prev);
      if (everySelected) {
        for (const r of selectableRows) next.delete(r.id);
      } else {
        for (const r of selectableRows) next.add(r.id);
      }
      return next;
    });
  }, [selectableRows]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const runBulkPause = useCallback(
    async (scope: 'selected' | 'all') => {
      const action = bulkAction;
      if (!action) return;
      const userIds = scope === 'all' ? [] : Array.from(selectedIds);
      try {
        const res = await bulkPause.mutateAsync({ user_ids: userIds, action });
        const verb = action === 'pause' ? 'Paused' : 'Resumed';
        const skipped =
          res.skipped_super_admin > 0
            ? ` (${res.skipped_super_admin} admin${res.skipped_super_admin === 1 ? '' : 's'} skipped)`
            : '';
        toast.success(
          `${verb} ${res.mailboxes_updated} mailbox${res.mailboxes_updated === 1 ? '' : 'es'} across ${res.users_affected} user${res.users_affected === 1 ? '' : 's'}${skipped}.`,
        );
        setBulkAction(null);
        clearSelection();
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Bulk mailbox action failed.'));
      }
    },
    [bulkAction, selectedIds, bulkPause, clearSelection],
  );

  const clearAll = () => {
    setPlanFilter(null);
    setStatusFilter(null);
    setQuery('');
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedRow) {
        setExpandedRow(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedRow]);

  const handleImpersonate = useCallback(
    (row: AdminUserRow) => {
      impersonate.mutate(row);
    },
    [impersonate],
  );

  const handleToggleSuspend = useCallback(
    async (row: AdminUserRow) => {
      try {
        await suspend.mutateAsync({ id: row.id, suspended: row.status !== 'suspended' });
        toast.success(`${row.email} ${row.status === 'suspended' ? 'unsuspended' : 'suspended'}.`);
        // Update the expanded row to reflect new status
        setExpandedRow((prev) =>
          prev?.id === row.id
            ? { ...prev, status: prev.status === 'suspended' ? 'active' : 'suspended' }
            : prev,
        );
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Suspension action failed.'));
      }
    },
    [suspend],
  );

  const handleSabotage = useCallback(
    async (row: AdminUserRow) => {
      const ok = await confirm({
        title: 'Trigger Revenge?',
        description: `This will mark ${row.email} as sabotaged and move their recent emails back to spam in the peer network. This should only be used for trial abusers.`,
        confirmLabel: 'Sabotage',
        danger: true,
      });
      if (!ok) return;
      try {
        await sabotage.mutateAsync(row.id);
        toast.success(`Revenge triggered for ${row.email}.`);
        setExpandedRow((prev) =>
          prev?.id === row.id ? { ...prev, is_sabotaged: true } : prev,
        );
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Sabotage failed.'));
      }
    },
    [sabotage],
  );

  const handleUnsabotage = useCallback(
    async (row: AdminUserRow) => {
      const ok = await confirm({
        title: 'Stop Sabotage?',
        description: `This will unmark ${row.email} as sabotaged. They will resume normal warmup activity.`,
        confirmLabel: 'Stop sabotage',
      });
      if (!ok) return;
      try {
        await unsabotage.mutateAsync(row.id);
        toast.success(`Sabotage stopped for ${row.email}.`);
        setExpandedRow((prev) =>
          prev?.id === row.id ? { ...prev, is_sabotaged: false } : prev,
        );
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Unsabotage action failed.'));
      }
    },
    [unsabotage],
  );

  const handleDelete = useCallback(
    async (row: AdminUserRow) => {
      setExpandedRow(null);
      const ok = await confirm({
        title: 'Permanently delete this user?',
        description: `${row.email} and all their mailboxes, warmup history, and audit rows will be removed. This cannot be undone.`,
        confirmLabel: 'Delete user',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteUser.mutateAsync(row.id);
        toast.success(`${row.email} deleted.`);
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Delete failed.'));
      }
    },
    [deleteUser],
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '28px 28px 80px',
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
        color: T.text,
        position: 'relative',
      }}
    >
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        style={{ marginBottom: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: T.accentDim,
                border: `1px solid ${T.accent}50`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={20} color={T.accent} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: T.text }}>Users</h1>
              <p style={{ fontSize: 12, color: T.faint, margin: 0, marginTop: 1 }}>
                {users.isLoading
                  ? 'Fetching users…'
                  : `${counts.total} users · ${counts.active} active · ${totalSignups} new in ${windowDays}d`}
              </p>
            </div>
          </div>
          {/* Mailbox transfer + Export CSV */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight size={14} /> Transfer mailbox
            </Button>
            <ExportButton
              rows={filteredRows}
              columns={USERS_EXPORT_COLUMNS}
              filename={`users-${exportStamp()}`}
            />
          </div>
        </div>
      </motion.div>

      <TransferMailboxDialog open={transferOpen} onOpenChange={setTransferOpen} />

      {/* ── KPI strip ── */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        <StatKpi label="Total Users" value={counts.total} icon={Users} color={T.accent} delay={0} loading={users.isLoading} />
        <StatKpi label="Active" value={counts.active} icon={CheckCircle2} color={T.success} delay={0.07} loading={users.isLoading} />
        <StatKpi label="Suspended" value={counts.suspended} icon={ShieldOff} color={T.danger} delay={0.14} loading={users.isLoading} />
        <StatKpi label="Pending" value={counts.pending} icon={Mail} color={T.warning} delay={0.21} loading={users.isLoading} />
      </motion.div>

      {/* ── Search + filter row ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, type: 'spring', stiffness: 240, damping: 22 }}
        style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}
      >
        {/* Search input */}
        <div
          style={{
            position: 'relative',
            flex: '1 1 220px',
            maxWidth: 340,
          }}
        >
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: T.faint,
              pointerEvents: 'none',
            }}
          />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search email or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 14px 9px 34px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: T.text,
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: T.faint,
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Plan filter chips — dynamic from real data */}
        {planOptions.length > 0 && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
          >
            {planOptions.map((p) => (
              <FilterChip
                key={p}
                label={p}
                active={planFilter === p}
                color={T.accent}
                onClick={() => setPlanFilter(planFilter === p ? null : p)}
              />
            ))}
          </motion.div>
        )}

        {/* Status filter chips */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
        >
          {((['active', 'suspended', 'pending'] as const)).map((s) => (
            <FilterChip
              key={s}
              label={STATUS_LABELS[toDisplayStatus(s)]}
              active={statusFilter === s}
              color={STATUS_COLORS[toDisplayStatus(s)]}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            />
          ))}
        </motion.div>

        {/* Clear all */}
        <AnimatePresence>
          {hasFilters && (
            <motion.button
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={clearAll}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: T.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <X size={12} />
              Clear
            </motion.button>
          )}
        </AnimatePresence>

        {/* Select all (filtered) — bulk pause/resume selection */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 11px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: T.dim,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            marginLeft: 'auto',
          }}
        >
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            disabled={selectableRows.length === 0}
            aria-label="Select all filtered users"
            style={{
              ...SELECT_CHECKBOX_STYLE,
              opacity: selectableRows.length === 0 ? 0.35 : 1,
            }}
          />
          Select all ({selectableRows.length} filtered)
        </label>

        {/* Count badge */}
        <motion.span
          layout
          style={{ fontSize: 12, color: T.ghost, whiteSpace: 'nowrap' }}
        >
          {users.isLoading ? '…' : `${filteredRows.length} of ${rows.length}`}
        </motion.span>
      </motion.div>

      {/* ── Card grid ── */}
      {users.isLoading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: 'center',
            padding: '60px 20px',
            color: T.faint,
            fontSize: 14,
          }}
        >
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          Loading users…
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          {filteredRows.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: T.faint,
              }}
            >
              <AlertTriangle size={36} style={{ color: T.warning, marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {rows.length === 0 ? 'No users yet.' : 'No users match'}
              </div>
              <div style={{ fontSize: 13 }}>
                {rows.length === 0 ? 'Users will appear here once they sign up.' : 'Try adjusting your filters'}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial="hidden"
              animate="visible"
              variants={containerVariants}
              layout
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 14,
              }}
            >
              <AnimatePresence mode="popLayout">
                {filteredRows.map((row) => (
                  <UserCard
                    key={row.id}
                    row={row}
                    godMode={godMode}
                    onClick={() => setExpandedRow(row)}
                    selected={selectedIds.has(row.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Expanded profile modal overlay ── */}
      <AnimatePresence>
        {expandedRow && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setExpandedRow(null)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9,
                background: 'rgba(8,5,3,0.75)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
            />

            {/* Profile panel centered */}
            <div
              key="panel-wrapper"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                pointerEvents: 'none',
              }}
            >
              <div style={{ pointerEvents: 'all', width: '100%', maxWidth: 680 }}>
                <ProfilePanel
                  row={expandedRow}
                  godMode={godMode}
                  onClose={() => setExpandedRow(null)}
                  onSuspend={() => handleToggleSuspend(expandedRow)}
                  onSabotage={() => handleSabotage(expandedRow)}
                  onUnsabotage={() => handleUnsabotage(expandedRow)}
                  onUpdatePlan={(planId) => handleUpdatePlan(expandedRow, planId)}
                  onDelete={() => handleDelete(expandedRow)}
                  onImpersonate={() => handleImpersonate(expandedRow)}
                  suspending={suspend.isPending}
                  sabotaging={sabotage.isPending}
                  unsabotaging={unsabotage.isPending}
                  updatingPlan={updatePlan.isPending}
                  deleting={deleteUser.isPending}
                  impersonating={impersonate.isPending}
                />
              </div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── Detail drawer (click card footer / kebab for full detail) ── */}
      <UserDetailDrawer userId={detailId} onClose={() => setDetailId(null)} />

      {/* ── Bulk action bar (visible while selection is non-empty) ── */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            key="bulk-bar"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            style={{
              position: 'fixed',
              bottom: 22,
              left: 0,
              right: 0,
              zIndex: 20,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                pointerEvents: 'all',
                ...T.glassDeep,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>
                {selectedCount} selected
              </span>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setBulkAction('pause')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 10,
                  background: T.warningDim,
                  border: `1px solid ${T.warning}40`,
                  color: T.warning,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Pause size={13} />
                Pause all mailboxes
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setBulkAction('resume')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 10,
                  background: T.successDim,
                  border: `1px solid ${T.success}40`,
                  color: T.success,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Play size={13} />
                Resume all mailboxes
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
                onClick={clearSelection}
                title="Clear selection"
                aria-label="Clear selection"
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: T.dim,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <X size={13} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bulk pause/resume confirm ── */}
      {bulkAction && (
        <BulkPauseDialog
          action={bulkAction}
          selectedCount={selectedCount}
          pending={bulkPause.isPending}
          onConfirm={runBulkPause}
          onCancel={() => setBulkAction(null)}
        />
      )}

      {/* ── Hint ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        style={{
          position: 'fixed',
          bottom: 22,
          right: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          ...T.glassTight,
          padding: '8px 14px',
          fontSize: 12,
          color: T.ghost,
          pointerEvents: 'none',
        }}
      >
        <MoreHorizontal size={14} />
        Click any card to expand profile
      </motion.div>

      {/* Spinner keyframes for Loader2 */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
