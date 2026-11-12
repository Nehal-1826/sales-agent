/**
 * Admin Users Design Candidate: U1 Command Directory
 *
 * "Command Directory" — a powerful cross-workspace user-management table.
 * KPI row with animated counters → search/filter/sort bar → staggered rows
 * with FLIP reorder and AnimatePresence filter → detail drawer on row-click.
 *
 * Marquee action: Impersonate / "Enter as user" (one-click), plus change
 * plan/role/status, suspend/reactivate, resend invite.
 *
 * Fully self-contained: inline style={{}} only, mock data only,
 * no API / react-query / @/features / @/lib imports.
 * Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. No purple/violet/blue/teal/cyan/indigo/pink.
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
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Users,
  UserCheck,
  UserX,
  Mail,
  Shield,
  ShieldCheck,
  ChevronRight,
  LogIn,
  Ban,
  Play,
  Building2,
  CreditCard,
  Clock,
  Key,
  Activity,
  MoreHorizontal,
  Send,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
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
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,
  glassTight: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 10,
  } as CSSProperties,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.42)',
  } as CSSProperties,
};

// ─── Types ──────────────────────────────────────────────────────────────────────
type Plan = 'Free' | 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';
type Role = 'member' | 'admin' | 'super_admin';
type Status = 'active' | 'invited' | 'suspended';
type SortKey = 'name' | 'workspace' | 'plan' | 'role' | 'status' | 'mailboxes' | 'lastActive';
type SortDir = 'asc' | 'desc';

interface UserRow {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarColor: string;
  workspace: string;
  plan: Plan;
  role: Role;
  status: Status;
  mailboxes: number;
  lastActive: string;
  signupDate: string;
  twoFA: boolean;
  recentActivity: string[];
}

// ─── Mock data ─────────────────────────────────────────────────────────────────
const USERS: UserRow[] = [
  {
    id: 'u01', name: 'Aarav Shah', email: 'aarav@techforge.io', initials: 'AS',
    avatarColor: '#F26522', workspace: 'TechForge Solutions', plan: 'Agency',
    role: 'admin', status: 'active', mailboxes: 12, lastActive: '2 min ago',
    signupDate: '2025-11-04', twoFA: true,
    recentActivity: ['Sent 840 warmup emails', 'Added mailbox relay@techforge.io', 'Plan upgraded to Agency'],
  },
  {
    id: 'u02', name: 'Priya Nair', email: 'priya@brightmail.co', initials: 'PN',
    avatarColor: '#FF8A4B', workspace: 'BrightMail Agency', plan: 'Agency',
    role: 'admin', status: 'active', mailboxes: 18, lastActive: '15 min ago',
    signupDate: '2025-10-12', twoFA: true,
    recentActivity: ['Exported warmup report', 'Configured 3 new peers', 'Reached inbox rate 91%'],
  },
  {
    id: 'u03', name: 'James Whitfield', email: 'james@outboundco.com', initials: 'JW',
    avatarColor: '#3ddc97', workspace: 'Outbound Co.', plan: 'Pro Plus',
    role: 'admin', status: 'active', mailboxes: 6, lastActive: '1 hr ago',
    signupDate: '2025-12-01', twoFA: true,
    recentActivity: ['Reviewed DNS config', 'Enabled DKIM verification', 'Invited team member'],
  },
  {
    id: 'u04', name: 'Sofia Reyes', email: 'sofia@salesblast.io', initials: 'SR',
    avatarColor: '#F26522', workspace: 'SalesBlast Labs', plan: 'Pro',
    role: 'member', status: 'active', mailboxes: 3, lastActive: '3 hr ago',
    signupDate: '2026-01-18', twoFA: false,
    recentActivity: ['Warmup cycle completed', 'Reputation score improved to 88%', 'Logged in via Google'],
  },
  {
    id: 'u05', name: 'Omar Hassan', email: 'omar@growthstack.com', initials: 'OH',
    avatarColor: '#FF8A4B', workspace: 'GrowthStack Inc.', plan: 'Pro Plus',
    role: 'admin', status: 'active', mailboxes: 8, lastActive: '5 hr ago',
    signupDate: '2025-09-22', twoFA: true,
    recentActivity: ['Bulk warmup scheduled', 'Updated SMTP credentials', 'Downloaded monthly report'],
  },
  {
    id: 'u06', name: 'Linda Kowalski', email: 'linda@sendwarm.eu', initials: 'LK',
    avatarColor: '#3ddc97', workspace: 'SendWarm EU', plan: 'Agency',
    role: 'admin', status: 'active', mailboxes: 22, lastActive: '8 hr ago',
    signupDate: '2025-08-15', twoFA: true,
    recentActivity: ['Pool routing configured', 'Added 5 peer inboxes', 'All mailboxes healthy'],
  },
  {
    id: 'u07', name: 'Daniel Brouwer', email: 'daniel@mailcraft.nl', initials: 'DB',
    avatarColor: '#F26522', workspace: 'MailCraft NL', plan: 'Starter',
    role: 'member', status: 'active', mailboxes: 2, lastActive: 'Yesterday',
    signupDate: '2026-02-09', twoFA: false,
    recentActivity: ['Account created', 'Connected first mailbox', 'Warmup started (day 3)'],
  },
  {
    id: 'u08', name: 'Aisha Okonkwo', email: 'aisha@launchpad.ng', initials: 'AO',
    avatarColor: '#FF8A4B', workspace: 'LaunchPad NG', plan: 'Pro',
    role: 'member', status: 'active', mailboxes: 4, lastActive: 'Yesterday',
    signupDate: '2026-01-28', twoFA: true,
    recentActivity: ['2FA enabled', 'Email verified', 'Warmup ramp advanced to day 14'],
  },
  {
    id: 'u09', name: 'Kenji Tanaka', email: 'kenji@inboxrise.jp', initials: 'KT',
    avatarColor: '#3ddc97', workspace: 'InboxRise JP', plan: 'Pro Plus',
    role: 'admin', status: 'active', mailboxes: 7, lastActive: '2 days ago',
    signupDate: '2025-12-20', twoFA: true,
    recentActivity: ['Peer pool assigned', 'SPF record verified', 'Sent 2,100 warmup emails this week'],
  },
  {
    id: 'u10', name: 'Emma Larsen', email: 'emma@coldstart.dk', initials: 'EL',
    avatarColor: '#F26522', workspace: 'ColdStart DK', plan: 'Starter',
    role: 'member', status: 'invited', mailboxes: 0, lastActive: 'Never',
    signupDate: '2026-05-30', twoFA: false,
    recentActivity: ['Invite email sent', 'Workspace created by admin'],
  },
  {
    id: 'u11', name: 'Raj Patel', email: 'raj@scalemails.com', initials: 'RP',
    avatarColor: '#FF8A4B', workspace: 'ScaleMails', plan: 'Agency',
    role: 'member', status: 'invited', mailboxes: 0, lastActive: 'Never',
    signupDate: '2026-05-28', twoFA: false,
    recentActivity: ['Invited by workspace admin', 'Role set to member'],
  },
  {
    id: 'u12', name: 'Nina Bergmann', email: 'nina@warmflow.de', initials: 'NB',
    avatarColor: '#3ddc97', workspace: 'WarmFlow DE', plan: 'Pro',
    role: 'member', status: 'invited', mailboxes: 0, lastActive: 'Never',
    signupDate: '2026-05-25', twoFA: false,
    recentActivity: ['Invite pending', 'Email queued for resend'],
  },
  {
    id: 'u13', name: 'Carlos Mendez', email: 'carlos@outreachpro.mx', initials: 'CM',
    avatarColor: '#F26522', workspace: 'OutreachPro MX', plan: 'Free',
    role: 'member', status: 'suspended', mailboxes: 1, lastActive: '2 weeks ago',
    signupDate: '2026-03-11', twoFA: false,
    recentActivity: ['Account suspended — policy violation', 'Warmup halted', 'Support ticket #18821 opened'],
  },
  {
    id: 'u14', name: 'Fatima Al-Sayed', email: 'fatima@spamtest.io', initials: 'FA',
    avatarColor: '#ff5c7a', workspace: 'SpamTest IO', plan: 'Free',
    role: 'member', status: 'suspended', mailboxes: 0, lastActive: '3 weeks ago',
    signupDate: '2026-04-02', twoFA: false,
    recentActivity: ['Flagged for suspicious send patterns', 'Account locked', 'Refund issued'],
  },
  {
    id: 'u15', name: 'Tom Sinclair', email: 'tom@repboost.co', initials: 'TS',
    avatarColor: '#3ddc97', workspace: 'RepBoost Co.', plan: 'Pro',
    role: 'member', status: 'active', mailboxes: 5, lastActive: '6 hr ago',
    signupDate: '2026-02-14', twoFA: false,
    recentActivity: ['Connected Outlook mailbox', 'Warmup paused for review', 'Re-enabled after DNS fix'],
  },
  {
    id: 'u16', name: 'Grace Osei', email: 'grace@heatsend.gh', initials: 'GO',
    avatarColor: '#FF8A4B', workspace: 'HeatSend GH', plan: 'Starter',
    role: 'admin', status: 'active', mailboxes: 2, lastActive: '4 hr ago',
    signupDate: '2026-03-30', twoFA: true,
    recentActivity: ['Upgraded from Free', 'Onboarding completed', 'First warmup cycle finished'],
  },
  {
    id: 'u17', name: 'devesh', email: 'info.sashainfinity@gmail.com', initials: 'DE',
    avatarColor: '#F26522', workspace: 'WarmPulse Platform', plan: 'Agency',
    role: 'super_admin', status: 'active', mailboxes: 0, lastActive: 'Just now',
    signupDate: '2025-08-01', twoFA: true,
    recentActivity: ['System health checked', 'Peer rotation ran', 'Admin session active'],
  },
  {
    id: 'u18', name: 'Yuki Mori', email: 'yuki@inboxheat.jp', initials: 'YM',
    avatarColor: '#3ddc97', workspace: 'InboxHeat JP', plan: 'Pro Plus',
    role: 'member', status: 'active', mailboxes: 6, lastActive: '12 hr ago',
    signupDate: '2026-01-05', twoFA: true,
    recentActivity: ['Warmup analytics reviewed', 'Peer pool switched', 'Monthly CSV exported'],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const PLAN_COLOR: Record<Plan, string> = {
  Free: T.ghost,
  Starter: T.faint,
  Pro: T.warning,
  'Pro Plus': T.accentHi,
  Agency: T.accent,
};
const PLAN_BG: Record<Plan, string> = {
  Free: 'rgba(255,255,255,0.05)',
  Starter: 'rgba(255,255,255,0.07)',
  Pro: 'rgba(255,138,75,0.12)',
  'Pro Plus': 'rgba(255,138,75,0.15)',
  Agency: 'rgba(242,101,34,0.15)',
};
const ROLE_COLOR: Record<Role, string> = {
  member: T.dim,
  admin: T.warning,
  super_admin: T.accent,
};
const STATUS_COLOR: Record<Status, string> = {
  active: T.success,
  invited: T.warning,
  suspended: T.danger,
};
const STATUS_BG: Record<Status, string> = {
  active: T.successDim,
  invited: T.warningDim,
  suspended: T.dangerDim,
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// ─── Animated counter hook ──────────────────────────────────────────────────────
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

// ─── Variants ──────────────────────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055 },
  },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 22 },
  },
  exit: {
    opacity: 0, x: -24, scale: 0.97,
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};

const drawerVariants: Variants = {
  hidden: { x: '100%', opacity: 0 },
  visible: {
    x: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30, mass: 0.8 },
  },
  exit: {
    x: '100%', opacity: 0,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 0.6] },
  },
};

const kpiVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, type: 'spring', stiffness: 280, damping: 24 },
  }),
};

// ─── Sub-components ────────────────────────────────────────────────────────────
function Chip({
  label, color, bg,
}: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', color, background: bg,
      borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' as const,
    }}>
      {label}
    </span>
  );
}

function Avatar({ initials, color, size = 32 }: { initials: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: `${color}22`,
      border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: size * 0.34, fontWeight: 700, color, letterSpacing: '0.04em' }}>
        {initials}
      </span>
    </div>
  );
}

interface ToastMsg { id: number; text: string; kind: 'success' | 'info' | 'warn' }
type ToastList = ToastMsg[];

function Toast({ msg, onDone }: { msg: ToastMsg; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  const bg = msg.kind === 'success' ? T.successDim
    : msg.kind === 'warn' ? T.warningDim
    : 'rgba(255,255,255,0.07)';
  const bdr = msg.kind === 'success' ? T.success
    : msg.kind === 'warn' ? T.warning
    : 'rgba(255,255,255,0.20)';
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 340, damping: 26 }}
      style={{
        background: bg, border: `1px solid ${bdr}`,
        borderRadius: 10, padding: '10px 16px',
        fontSize: 13, color: T.text, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 8,
        pointerEvents: 'none', backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)', maxWidth: 320,
      }}
    >
      {msg.kind === 'success'
        ? <CheckCircle2 size={14} color={T.success} />
        : msg.kind === 'warn'
        ? <AlertTriangle size={14} color={T.warning} />
        : <Activity size={14} color={T.faint} />}
      {msg.text}
    </motion.div>
  );
}

// ─── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, icon: Icon, color, index, sub,
}: {
  label: string; value: number; icon: typeof Users;
  color: string; index: number; sub?: string;
}) {
  const count = useCountUp(value);
  return (
    <motion.div
      custom={index}
      variants={kpiVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.025, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
      style={{
        ...T.glass, flex: '1 1 140px', minWidth: 120,
        padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={T.micro}>{label}</span>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `${color}18`, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color={color} />
        </div>
      </div>
      <span style={{ fontSize: 30, fontWeight: 700, color: T.text, lineHeight: 1 }}>
        {count.toLocaleString()}
      </span>
      {sub && <span style={{ fontSize: 11, color: T.faint }}>{sub}</span>}
    </motion.div>
  );
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({
  user,
  onClose,
  onAction,
}: {
  user: UserRow;
  onClose: () => void;
  onAction: (msg: string, kind: ToastMsg['kind']) => void;
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const act = useCallback((label: string, msg: string, kind: ToastMsg['kind']) => {
    setPendingAction(label);
    setTimeout(() => {
      setPendingAction(null);
      onAction(msg, kind);
    }, 700);
  }, [onAction]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.45)',
        }}
      />
      {/* Drawer */}
      <motion.div
        variants={drawerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
          width: 400, background: 'rgba(18,16,14,0.96)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderLeft: '1px solid rgba(255,255,255,0.10)',
          overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${T.hairline}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar initials={user.initials} color={user.avatarColor} size={44} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
                {user.name}
              </div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>
                {user.email}
              </div>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }}
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8, width: 32, height: 32, display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.dim,
            }}
          >
            <X size={15} />
          </motion.button>
        </div>

        {/* Marquee action */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.hairline}`, flexShrink: 0 }}>
          <motion.button
            whileHover={{ scale: 1.02, filter: 'brightness(1.12)' }}
            whileTap={{ scale: 0.97 }}
            onClick={() => act('Impersonate', `Entered session as ${user.name}`, 'success')}
            style={{
              width: '100%', padding: '13px 20px',
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
              border: 'none', borderRadius: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              color: '#fff', fontSize: 14, fontWeight: 700,
            }}
          >
            <LogIn size={16} />
            {pendingAction === 'Impersonate' ? 'Entering session…' : 'Enter as User (Impersonate)'}
          </motion.button>
        </div>

        {/* Profile details */}
        <div style={{ padding: '18px 24px', flexShrink: 0 }}>
          <div style={{ ...T.micro, marginBottom: 12 }}>Profile</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: Building2, label: 'Workspace', value: user.workspace },
              { icon: CreditCard, label: 'Plan', value: user.plan },
              { icon: Shield, label: 'Role', value: user.role.replace('_', ' ') },
              { icon: Activity, label: 'Status', value: user.status },
              { icon: Mail, label: 'Mailboxes', value: String(user.mailboxes) },
              { icon: Clock, label: 'Last Active', value: user.lastActive },
              { icon: Key, label: '2FA', value: user.twoFA ? 'Enabled' : 'Disabled' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                fontSize: 13, color: T.dim,
              }}>
                <Icon size={13} color={T.faint} style={{ flexShrink: 0 }} />
                <span style={{ color: T.faint, minWidth: 80 }}>{label}</span>
                <span style={{ color: T.text, fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '0 24px 18px', flexShrink: 0, borderTop: `1px solid ${T.hairline}`, paddingTop: 16 }}>
          <div style={{ ...T.micro, marginBottom: 12 }}>Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              {
                label: 'Change Plan', icon: CreditCard, color: T.warning,
                msg: `Plan change modal opened for ${user.name}`, kind: 'info' as const,
              },
              {
                label: 'Change Role', icon: ShieldCheck, color: T.warning,
                msg: `Role change modal opened for ${user.name}`, kind: 'info' as const,
              },
              user.status === 'suspended'
                ? {
                    label: 'Reactivate', icon: Play, color: T.success,
                    msg: `${user.name} reactivated`, kind: 'success' as const,
                  }
                : {
                    label: 'Suspend', icon: Ban, color: T.danger,
                    msg: `${user.name} suspended`, kind: 'warn' as const,
                  },
              {
                label: 'Resend Invite', icon: Send, color: T.faint,
                msg: `Invite resent to ${user.email}`, kind: 'info' as const,
              },
            ].map(({ label, icon: Icon, color, msg, kind }) => (
              <motion.button
                key={label}
                whileHover={{ scale: 1.03, background: 'rgba(255,255,255,0.09)' }}
                whileTap={{ scale: 0.96 }}
                onClick={() => act(label, msg, kind)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 12, fontWeight: 600, color,
                }}
              >
                <Icon size={13} />
                {pendingAction === label ? '…' : label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div style={{ padding: '0 24px 24px', flexShrink: 0 }}>
          <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 16 }}>
            <div style={{ ...T.micro, marginBottom: 12 }}>Recent Activity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {user.recentActivity.map((act, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9,
                  fontSize: 12, color: T.dim,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: 3, background: T.accent,
                    flexShrink: 0, marginTop: 4,
                  }} />
                  {act}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Signup date footer */}
        <div style={{
          marginTop: 'auto', padding: '14px 24px',
          borderTop: `1px solid ${T.hairline}`,
          fontSize: 11, color: T.faint,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Signed up {relativeTime(user.signupDate)}</span>
          <span>{new Date(user.signupDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </div>
      </motion.div>
    </>
  );
}

// ─── Sort helper ───────────────────────────────────────────────────────────────
function sortUsers(users: UserRow[], key: SortKey, dir: SortDir): UserRow[] {
  const planOrder: Plan[] = ['Agency', 'Pro Plus', 'Pro', 'Starter', 'Free'];
  const roleOrder: Role[] = ['super_admin', 'admin', 'member'];
  const statusOrder: Status[] = ['active', 'invited', 'suspended'];
  return [...users].sort((a, b) => {
    let cmp = 0;
    if (key === 'name') cmp = a.name.localeCompare(b.name);
    else if (key === 'workspace') cmp = a.workspace.localeCompare(b.workspace);
    else if (key === 'plan') cmp = planOrder.indexOf(a.plan) - planOrder.indexOf(b.plan);
    else if (key === 'role') cmp = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
    else if (key === 'status') cmp = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
    else if (key === 'mailboxes') cmp = a.mailboxes - b.mailboxes;
    else if (key === 'lastActive') cmp = a.lastActive.localeCompare(b.lastActive);
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ─── Main component ────────────────────────────────────────────────────────────
export function AdmUsrU1Directory() {
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState<Plan | 'All'>('All');
  const [filterRole, setFilterRole] = useState<Role | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<Status | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [toasts, setToasts] = useState<ToastList>([]);
  const [showFilters, setShowFilters] = useState(false);
  const toastIdRef = useRef(0);

  // Local mutable state for demo actions (suspend/reactivate)
  const [userStatuses, setUserStatuses] = useState<Record<string, Status>>(() =>
    Object.fromEntries(USERS.map((u) => [u.id, u.status]))
  );

  const addToast = useCallback((text: string, kind: ToastMsg['kind'] = 'success') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, text, kind }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // KPI computations
  const totalUsers = USERS.length;
  const activeUsers = USERS.filter((u) => userStatuses[u.id] === 'active').length;
  const invitedUsers = USERS.filter((u) => userStatuses[u.id] === 'invited').length;
  const suspendedUsers = USERS.filter((u) => userStatuses[u.id] === 'suspended').length;
  const agencyUsers = USERS.filter((u) => u.plan === 'Agency').length;

  // Filtered + sorted
  const filtered = sortUsers(
    USERS.filter((u) => {
      const q = search.toLowerCase();
      const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.workspace.toLowerCase().includes(q);
      const matchPlan = filterPlan === 'All' || u.plan === filterPlan;
      const matchRole = filterRole === 'All' || u.role === filterRole;
      const matchStatus = filterStatus === 'All' || userStatuses[u.id] === filterStatus;
      return matchSearch && matchPlan && matchRole && matchStatus;
    }),
    sortKey,
    sortDir,
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleAction = useCallback((msg: string, kind: ToastMsg['kind']) => {
    addToast(msg, kind);
    // Reflect suspend/reactivate in local state
    if (selectedUser) {
      if (msg.includes('reactivated')) {
        setUserStatuses((prev) => ({ ...prev, [selectedUser.id]: 'active' }));
      } else if (msg.includes('suspended')) {
        setUserStatuses((prev) => ({ ...prev, [selectedUser.id]: 'suspended' }));
      }
    }
  }, [addToast, selectedUser]);

  const SortIcon = ({ col }: { col: SortKey }) => (
    sortKey === col
      ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
      : <ChevronDown size={12} style={{ opacity: 0.25 }} />
  );

  const plans: Plan[] = ['Free', 'Starter', 'Pro', 'Pro Plus', 'Agency'];
  const roles: Role[] = ['member', 'admin', 'super_admin'];
  const statuses: Status[] = ['active', 'invited', 'suspended'];

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: T.text, minHeight: '100vh', padding: '28px 28px 60px' }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Users size={22} color={T.accent} />
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: T.text }}>
                Command Directory
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: T.dim }}>
              Cross-workspace user management — find, act, impersonate.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 12, color: T.faint, background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${T.hairline}`, borderRadius: 8, padding: '4px 10px',
            }}>
              {filtered.length} of {totalUsers} users
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── KPI row ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <KpiCard label="Total Users" value={totalUsers} icon={Users} color={T.accent} index={0} />
        <KpiCard label="Active" value={activeUsers} icon={UserCheck} color={T.success} index={1} sub={`${Math.round(activeUsers / totalUsers * 100)}% of total`} />
        <KpiCard label="Invited" value={invitedUsers} icon={Mail} color={T.warning} index={2} sub="Pending signup" />
        <KpiCard label="Suspended" value={suspendedUsers} icon={UserX} color={T.danger} index={3} sub="Access revoked" />
        <KpiCard label="Agency Plan" value={agencyUsers} icon={ShieldCheck} color={T.accentHi} index={4} sub="Highest tier" />
      </div>

      {/* ── Search + filter bar ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{
          ...T.glass, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.faint, pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, workspace…"
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)',
              border: `1px solid rgba(255,255,255,0.10)`, borderRadius: 9,
              padding: '8px 10px 8px 32px', color: T.text, fontSize: 13,
              outline: 'none', boxSizing: 'border-box' as const,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 0 }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filters toggle */}
        <motion.button
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          onClick={() => setShowFilters((f) => !f)}
          style={{
            background: showFilters ? T.accentDim : 'rgba(255,255,255,0.05)',
            border: `1px solid ${showFilters ? T.accent : 'rgba(255,255,255,0.10)'}`,
            borderRadius: 9, padding: '8px 14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 600, color: showFilters ? T.accent : T.dim,
          }}
        >
          <SlidersHorizontal size={13} />
          Filters
          {(filterPlan !== 'All' || filterRole !== 'All' || filterStatus !== 'All') && (
            <span style={{ width: 6, height: 6, borderRadius: 3, background: T.accent, display: 'inline-block' }} />
          )}
        </motion.button>
      </motion.div>

      {/* ── Filter chips ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden', marginBottom: 14 }}
          >
            <div style={{
              ...T.glass, padding: '14px 18px',
              display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start',
            }}>
              {/* Plan filter */}
              <div>
                <div style={{ ...T.micro, marginBottom: 8 }}>Plan</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['All', ...plans] as const).map((p) => (
                    <motion.button
                      key={p}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setFilterPlan(p as Plan | 'All')}
                      style={{
                        background: filterPlan === p ? T.accentDim : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${filterPlan === p ? T.accent : 'rgba(255,255,255,0.09)'}`,
                        borderRadius: 7, padding: '4px 11px', cursor: 'pointer',
                        fontSize: 12, fontWeight: 500,
                        color: filterPlan === p ? T.accent : T.dim,
                      }}
                    >
                      {p}
                    </motion.button>
                  ))}
                </div>
              </div>
              {/* Role filter */}
              <div>
                <div style={{ ...T.micro, marginBottom: 8 }}>Role</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['All', ...roles] as const).map((r) => (
                    <motion.button
                      key={r}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setFilterRole(r as Role | 'All')}
                      style={{
                        background: filterRole === r ? T.accentDim : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${filterRole === r ? T.accent : 'rgba(255,255,255,0.09)'}`,
                        borderRadius: 7, padding: '4px 11px', cursor: 'pointer',
                        fontSize: 12, fontWeight: 500,
                        color: filterRole === r ? T.accent : T.dim,
                      }}
                    >
                      {r.replace('_', ' ')}
                    </motion.button>
                  ))}
                </div>
              </div>
              {/* Status filter */}
              <div>
                <div style={{ ...T.micro, marginBottom: 8 }}>Status</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['All', ...statuses] as const).map((s) => (
                    <motion.button
                      key={s}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setFilterStatus(s as Status | 'All')}
                      style={{
                        background: filterStatus === s ? T.accentDim : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${filterStatus === s ? T.accent : 'rgba(255,255,255,0.09)'}`,
                        borderRadius: 7, padding: '4px 11px', cursor: 'pointer',
                        fontSize: 12, fontWeight: 500,
                        color: filterStatus === s ? T.accent : T.dim,
                      }}
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </div>
              {/* Clear all */}
              {(filterPlan !== 'All' || filterRole !== 'All' || filterStatus !== 'All') && (
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={() => { setFilterPlan('All'); setFilterRole('All'); setFilterStatus('All'); }}
                    style={{
                      background: 'none', border: `1px solid ${T.hairline}`,
                      borderRadius: 7, padding: '4px 11px', cursor: 'pointer',
                      fontSize: 12, color: T.danger, display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <X size={11} /> Clear filters
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ ...T.glass, overflow: 'hidden' }}
      >
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1.8fr 100px 90px 80px 80px 100px 48px',
          padding: '10px 16px',
          borderBottom: `1px solid ${T.hairline}`,
          gap: 8,
        }}>
          {(
            [
              { key: 'name', label: 'User' },
              { key: 'workspace', label: 'Workspace' },
              { key: 'plan', label: 'Plan' },
              { key: 'role', label: 'Role' },
              { key: 'status', label: 'Status' },
              { key: 'mailboxes', label: 'Mbx' },
              { key: 'lastActive', label: 'Last Active' },
            ] as { key: SortKey; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: sortKey === key ? T.accent : T.faint,
                padding: 0, textAlign: 'left' as const,
              }}
            >
              {label}
              <SortIcon col={key} />
            </button>
          ))}
          <div style={{ ...T.micro }}>Action</div>
        </div>

        {/* Rows */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          style={{ position: 'relative' }}
        >
          <AnimatePresence mode="popLayout">
            {filtered.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ padding: '40px 24px', textAlign: 'center', color: T.faint, fontSize: 14 }}
              >
                No users match your filters.
              </motion.div>
            ) : (
              filtered.map((user) => (
                <motion.div
                  key={user.id}
                  layout
                  variants={rowVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  whileHover={{ background: 'rgba(255,255,255,0.04)', transition: { duration: 0.12 } }}
                  onClick={() => setSelectedUser(user)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.8fr 100px 90px 80px 80px 100px 48px',
                    padding: '11px 16px',
                    borderBottom: `1px solid ${T.hairline}`,
                    cursor: 'pointer', alignItems: 'center', gap: 8,
                  }}
                >
                  {/* User */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                    <Avatar initials={user.initials} color={user.avatarColor} size={30} />
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.name}
                      </div>
                      <div style={{ fontSize: 11, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.email}
                      </div>
                    </div>
                  </div>

                  {/* Workspace */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <Building2 size={11} color={T.faint} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.workspace}
                    </span>
                  </div>

                  {/* Plan */}
                  <div>
                    <Chip
                      label={user.plan}
                      color={PLAN_COLOR[user.plan]}
                      bg={PLAN_BG[user.plan]}
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: ROLE_COLOR[user.role],
                      textTransform: 'capitalize',
                    }}>
                      {user.role.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Status */}
                  <div>
                    <Chip
                      label={userStatuses[user.id] ?? user.status}
                      color={STATUS_COLOR[userStatuses[user.id] ?? user.status]}
                      bg={STATUS_BG[userStatuses[user.id] ?? user.status]}
                    />
                  </div>

                  {/* Mailboxes */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.dim }}>
                    <Mail size={11} color={T.faint} />
                    {user.mailboxes}
                  </div>

                  {/* Last Active */}
                  <div style={{ fontSize: 11, color: T.faint }}>{user.lastActive}</div>

                  {/* Quick action */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <motion.button
                      whileHover={{ scale: 1.18, background: T.accentDim }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedUser(user);
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid rgba(255,255,255,0.08)`,
                        borderRadius: 7, width: 28, height: 28,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: T.dim,
                      }}
                      title="Open user details"
                    >
                      <ChevronRight size={13} />
                    </motion.button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </motion.div>

        {/* Table footer */}
        {filtered.length > 0 && (
          <div style={{
            padding: '10px 16px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, color: T.faint }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 12 }}>
              {statuses.map((s) => {
                const n = filtered.filter((u) => (userStatuses[u.id] ?? u.status) === s).length;
                return n > 0 ? (
                  <span key={s} style={{ fontSize: 11, color: STATUS_COLOR[s], display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_COLOR[s], display: 'inline-block' }} />
                    {n} {s}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Detail drawer ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedUser && (
          <DetailDrawer
            key={selectedUser.id}
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            onAction={handleAction}
          />
        )}
      </AnimatePresence>

      {/* ── Toast rack ────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: 8, zIndex: 100,
        pointerEvents: 'none', alignItems: 'center',
      }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <Toast key={t.id} msg={t} onDone={() => removeToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* ── Inline row quick-action tooltip hint ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
      >
        <MoreHorizontal size={12} color={T.faint} />
        <span style={{ fontSize: 11, color: T.faint }}>
          Click any row or the arrow button to open the user panel and impersonate
        </span>
        <MoreHorizontal size={12} color={T.faint} />
      </motion.div>
    </div>
  );
}
