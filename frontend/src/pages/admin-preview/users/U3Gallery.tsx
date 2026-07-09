/**
 * Admin Users Design Candidate: U3 Profile Gallery
 *
 * "Profile Gallery" — a card grid of every user across all workspaces; click any
 * card and it morphs via layoutId shared-element into a rich expanded profile
 * panel. Framer-motion throughout: staggered entrance, hover lift + glow, tap
 * press, AnimatePresence backdrop, layout-animated filter/search re-grid,
 * animated counter KPIs.
 *
 * Marquee action: prominent "Enter as User" impersonation CTA inside the expanded
 * profile, plus change plan/role/status, suspend, resend-invite (all local state).
 *
 * Self-contained: inline style={{}} only, mock data only, no API / react-query /
 * @/features / @/lib/api imports. Aurora Glass dark palette, warm amber only.
 * No CSS file import. No Tailwind.
 */

import {
  useState,
  useCallback,
  useEffect,
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
  Users,
  Search,
  X,
  ChevronDown,
  Mail,
  Shield,
  ShieldOff,
  UserCheck,
  UserX,
  LogIn,
  Clock,
  Building2,
  Star,
  AlertTriangle,
  CheckCircle2,
  Send,
  Key,
  RefreshCw,
  Activity,
  Inbox,
  Calendar,
  MoreHorizontal,
  ChevronRight,
} from 'lucide-react';

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

// ─── Types ──────────────────────────────────────────────────────────────────────
type Plan = 'Free' | 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';
type Role = 'member' | 'admin' | 'super_admin';
type Status = 'active' | 'invited' | 'suspended';

interface User {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarGrad: [string, string];
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

// ─── Mock data — 18 realistic users ─────────────────────────────────────────────
const MOCK_USERS: User[] = [
  {
    id: 'u1',
    name: 'Alex Rivera',
    email: 'alex@brightwave.io',
    initials: 'AR',
    avatarGrad: ['#F26522', '#FF8A4B'],
    workspace: 'BrightWave Media',
    plan: 'Agency',
    role: 'admin',
    status: 'active',
    mailboxes: 14,
    lastActive: '2 min ago',
    signupDate: 'Jan 12, 2025',
    twoFA: true,
    recentActivity: [
      'Added mailbox ops@brightwave.io',
      'Changed plan from Pro Plus → Agency',
      'Enabled warmup on 3 mailboxes',
      'Exported deliverability report',
    ],
  },
  {
    id: 'u2',
    name: 'Sara Müller',
    email: 'sara.muller@aufwind.de',
    initials: 'SM',
    avatarGrad: ['#FF8A4B', '#F26522'],
    workspace: 'Aufwind GmbH',
    plan: 'Pro Plus',
    role: 'admin',
    status: 'active',
    mailboxes: 8,
    lastActive: '18 min ago',
    signupDate: 'Feb 3, 2025',
    twoFA: true,
    recentActivity: [
      'Scheduled weekly reputation report',
      'Invited colleague nina@aufwind.de',
      'Updated SMTP credentials for mailbox 2',
    ],
  },
  {
    id: 'u3',
    name: 'Chris Nakamura',
    email: 'chris@sendloop.co',
    initials: 'CN',
    avatarGrad: ['#E05A1F', '#F26522'],
    workspace: 'SendLoop Labs',
    plan: 'Pro',
    role: 'member',
    status: 'active',
    mailboxes: 4,
    lastActive: '1 hr ago',
    signupDate: 'Mar 20, 2025',
    twoFA: false,
    recentActivity: [
      'Connected new Gmail mailbox',
      'Viewed deliverability dashboard',
      'Raised daily send limit',
    ],
  },
  {
    id: 'u4',
    name: 'Priya Nair',
    email: 'priya@growthstack.in',
    initials: 'PN',
    avatarGrad: ['#FF6B00', '#FF8A4B'],
    workspace: 'GrowthStack India',
    plan: 'Agency',
    role: 'admin',
    status: 'active',
    mailboxes: 21,
    lastActive: '5 min ago',
    signupDate: 'Dec 1, 2024',
    twoFA: true,
    recentActivity: [
      'Bulk-imported 6 mailboxes via CSV',
      'Created peer pool "India-Ops"',
      'Reviewed LLM usage — 2.4k tokens today',
      'Assigned 3 sub-accounts to starter plan',
    ],
  },
  {
    id: 'u5',
    name: 'Jordan Blake',
    email: 'jordan@northflux.com',
    initials: 'JB',
    avatarGrad: ['#CC5500', '#F26522'],
    workspace: 'NorthFlux Agency',
    plan: 'Starter',
    role: 'member',
    status: 'invited',
    mailboxes: 0,
    lastActive: 'Never',
    signupDate: 'May 28, 2026',
    twoFA: false,
    recentActivity: ['Invite sent — pending acceptance'],
  },
  {
    id: 'u6',
    name: 'Mei Lin Zhang',
    email: 'mei.zhang@mailriser.ai',
    initials: 'MZ',
    avatarGrad: ['#F26522', '#E05A1F'],
    workspace: 'MailRiser AI',
    plan: 'Pro Plus',
    role: 'admin',
    status: 'active',
    mailboxes: 11,
    lastActive: '32 min ago',
    signupDate: 'Oct 14, 2024',
    twoFA: true,
    recentActivity: [
      'Enabled 2FA on account',
      'Reconnected Outlook OAuth token',
      'Ran on-demand warmup burst for 4 inboxes',
    ],
  },
  {
    id: 'u7',
    name: 'Tobias Kern',
    email: 'tobias@reachvault.eu',
    initials: 'TK',
    avatarGrad: ['#FF8A4B', '#CC5500'],
    workspace: 'ReachVault EU',
    plan: 'Pro',
    role: 'member',
    status: 'suspended',
    mailboxes: 3,
    lastActive: '14 days ago',
    signupDate: 'Aug 9, 2024',
    twoFA: false,
    recentActivity: ['Account suspended — payment failed', 'Last warmup cycle ran 2 weeks ago'],
  },
  {
    id: 'u8',
    name: 'Amara Osei',
    email: 'amara@inboxcraft.ng',
    initials: 'AO',
    avatarGrad: ['#F26522', '#FF6B00'],
    workspace: 'InboxCraft Africa',
    plan: 'Starter',
    role: 'member',
    status: 'active',
    mailboxes: 2,
    lastActive: '4 hrs ago',
    signupDate: 'Apr 11, 2025',
    twoFA: false,
    recentActivity: ['Checked spam-rescue stats', 'Updated mailbox display name'],
  },
  {
    id: 'u9',
    name: 'Lena Petrov',
    email: 'lena.p@sprintmailer.ru',
    initials: 'LP',
    avatarGrad: ['#E87030', '#F26522'],
    workspace: 'SprintMailer',
    plan: 'Pro Plus',
    role: 'admin',
    status: 'active',
    mailboxes: 9,
    lastActive: '1 day ago',
    signupDate: 'Nov 22, 2024',
    twoFA: true,
    recentActivity: [
      'Downloaded monthly invoice PDF',
      'Disabled warmup on holiday-period mailboxes',
    ],
  },
  {
    id: 'u10',
    name: 'Marcus Webb',
    email: 'marcus@webboost.co.uk',
    initials: 'MW',
    avatarGrad: ['#FF6B00', '#E05A1F'],
    workspace: 'WebBoost UK',
    plan: 'Agency',
    role: 'super_admin',
    status: 'active',
    mailboxes: 38,
    lastActive: 'just now',
    signupDate: 'Jun 6, 2024',
    twoFA: true,
    recentActivity: [
      'Accessed super-admin impersonation panel',
      'Updated platform peer pool routing',
      'Ran LLM cost audit for May 2026',
      'Approved 2 billing escalations',
    ],
  },
  {
    id: 'u11',
    name: 'Fatima Al-Hassan',
    email: 'fatima@sendcraft.ae',
    initials: 'FH',
    avatarGrad: ['#F26522', '#FF8A4B'],
    workspace: 'SendCraft MENA',
    plan: 'Pro',
    role: 'member',
    status: 'active',
    mailboxes: 5,
    lastActive: '7 hrs ago',
    signupDate: 'Jan 29, 2025',
    twoFA: false,
    recentActivity: ['Enabled ramp acceleration for new domain', 'Checked peer-inbox health'],
  },
  {
    id: 'u12',
    name: 'Diego Fuentes',
    email: 'diego@velocitymail.mx',
    initials: 'DF',
    avatarGrad: ['#CC5500', '#E87030'],
    workspace: 'VelocityMail MX',
    plan: 'Free',
    role: 'member',
    status: 'active',
    mailboxes: 1,
    lastActive: '2 days ago',
    signupDate: 'May 10, 2026',
    twoFA: false,
    recentActivity: ['Completed onboarding wizard', 'Connected first Gmail mailbox'],
  },
  {
    id: 'u13',
    name: 'Yuna Kim',
    email: 'yuna@warmaxis.kr',
    initials: 'YK',
    avatarGrad: ['#FF8A4B', '#F26522'],
    workspace: 'WarmAxis KR',
    plan: 'Pro Plus',
    role: 'admin',
    status: 'active',
    mailboxes: 7,
    lastActive: '3 hrs ago',
    signupDate: 'Feb 14, 2025',
    twoFA: true,
    recentActivity: ['Generated DNS validation report', 'Tuned warmup schedule window'],
  },
  {
    id: 'u14',
    name: 'Oliver Grant',
    email: 'oliver@pulsereach.io',
    initials: 'OG',
    avatarGrad: ['#E05A1F', '#FF6B00'],
    workspace: 'PulseReach IO',
    plan: 'Starter',
    role: 'member',
    status: 'invited',
    mailboxes: 0,
    lastActive: 'Never',
    signupDate: 'May 30, 2026',
    twoFA: false,
    recentActivity: ['Invite sent — pending acceptance'],
  },
  {
    id: 'u15',
    name: 'Riya Sharma',
    email: 'riya@inflowdesk.com',
    initials: 'RS',
    avatarGrad: ['#F26522', '#CC5500'],
    workspace: 'InflowDesk',
    plan: 'Agency',
    role: 'admin',
    status: 'active',
    mailboxes: 18,
    lastActive: '12 min ago',
    signupDate: 'Sep 3, 2024',
    twoFA: true,
    recentActivity: [
      'Added 4 Gmail mailboxes for client campaign',
      'Reviewed analytics cockpit — 99.2% delivery rate',
      'Updated workspace billing contact',
    ],
  },
  {
    id: 'u16',
    name: 'Noah Andersson',
    email: 'noah@nordsendr.se',
    initials: 'NA',
    avatarGrad: ['#FF6B00', '#F26522'],
    workspace: 'NordSendr',
    plan: 'Pro',
    role: 'member',
    status: 'active',
    mailboxes: 3,
    lastActive: '6 hrs ago',
    signupDate: 'Mar 5, 2025',
    twoFA: false,
    recentActivity: ['Checked ramp progress for 2 mailboxes', 'Read warmup docs'],
  },
  {
    id: 'u17',
    name: 'Chiara Rossi',
    email: 'chiara@warmforge.it',
    initials: 'CR',
    avatarGrad: ['#E87030', '#FF8A4B'],
    workspace: 'WarmForge IT',
    plan: 'Pro Plus',
    role: 'admin',
    status: 'suspended',
    mailboxes: 6,
    lastActive: '21 days ago',
    signupDate: 'Jul 19, 2024',
    twoFA: false,
    recentActivity: ['Account suspended — ToS violation review', 'Warmup paused on all mailboxes'],
  },
  {
    id: 'u18',
    name: 'Kwame Asante',
    email: 'kwame@sendvault.gh',
    initials: 'KA',
    avatarGrad: ['#CC5500', '#F26522'],
    workspace: 'SendVault GH',
    plan: 'Starter',
    role: 'member',
    status: 'active',
    mailboxes: 2,
    lastActive: '9 hrs ago',
    signupDate: 'Apr 30, 2025',
    twoFA: false,
    recentActivity: ['Verified SPF/DKIM via DNS tools', 'Reviewed daily send quota'],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────
const PLAN_COLORS: Record<Plan, { bg: string; text: string; border: string }> = {
  Free: { bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.14)' },
  Starter: { bg: 'rgba(242,101,34,0.12)', text: '#F26522', border: 'rgba(242,101,34,0.25)' },
  Pro: { bg: 'rgba(255,138,75,0.12)', text: '#FF8A4B', border: 'rgba(255,138,75,0.25)' },
  'Pro Plus': { bg: 'rgba(242,101,34,0.18)', text: '#FF8A4B', border: 'rgba(242,101,34,0.35)' },
  Agency: { bg: 'rgba(242,101,34,0.22)', text: '#F26522', border: 'rgba(242,101,34,0.40)' },
};

const ROLE_LABELS: Record<Role, string> = {
  member: 'Member',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

const STATUS_COLORS: Record<Status, string> = {
  active: '#3ddc97',
  invited: '#FF8A4B',
  suspended: '#ff5c7a',
};
const STATUS_LABELS: Record<Status, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
};

const ALL_PLANS: Plan[] = ['Free', 'Starter', 'Pro', 'Pro Plus', 'Agency'];
const ALL_ROLES: Role[] = ['member', 'admin', 'super_admin'];
const ALL_STATUSES: Status[] = ['active', 'invited', 'suspended'];

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

// ─── Subcomponents ──────────────────────────────────────────────────────────────

function Avatar({
  user,
  size = 48,
}: {
  user: User;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${user.avatarGrad[0]}, ${user.avatarGrad[1]})`,
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
      {user.initials}
    </div>
  );
}

function PlanChip({ plan }: { plan: Plan }) {
  const c = PLAN_COLORS[plan];
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
      {plan}
    </span>
  );
}

function StatusDot({ status }: { status: Status }) {
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

function RoleIcon({ role }: { role: Role }) {
  if (role === 'super_admin')
    return <Shield size={12} style={{ color: T.accent }} />;
  if (role === 'admin')
    return <Star size={12} style={{ color: T.accentLight }} />;
  return null;
}

function ToastBanner({
  msg,
  onClose,
}: {
  msg: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      style={{
        position: 'fixed',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        ...T.glassTight,
        background: 'rgba(61,220,151,0.18)',
        border: '1px solid rgba(61,220,151,0.35)',
        borderRadius: 12,
        padding: '12px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: '#3ddc97',
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      <CheckCircle2 size={16} />
      {msg}
    </motion.div>
  );
}

// ─── Stat KPI component with animated counter ────────────────────────────────────
function StatKpi({
  label,
  value,
  icon: Icon,
  color,
  delay,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  color: string;
  delay?: number;
}) {
  const display = useAnimCounter(value, 1.1 + (delay ?? 0) * 0.15);
  return (
    <motion.div
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
          {display.toLocaleString()}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.faint, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Filter chip ────────────────────────────────────────────────────────────────
function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
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
}

// ─── Expanded profile panel ─────────────────────────────────────────────────────
function ProfilePanel({
  user: initialUser,
  onClose,
  onToast,
}: {
  user: User;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [user, setUser] = useState<User>(initialUser);
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const handleImpersonate = () => {
    onToast(`Entering as ${user.name}…`);
    onClose();
  };

  const handleResendInvite = () => {
    onToast(`Invite resent to ${user.email}`);
  };

  const handleSuspend = () => {
    if (confirmSuspend) {
      setUser((u) => ({ ...u, status: 'suspended' }));
      onToast(`${user.name} suspended`);
      setConfirmSuspend(false);
    } else {
      setConfirmSuspend(true);
    }
  };

  const handleReactivate = () => {
    setUser((u) => ({ ...u, status: 'active' }));
    onToast(`${user.name} reactivated`);
    setConfirmSuspend(false);
  };

  const handlePlanChange = (plan: Plan) => {
    setUser((u) => ({ ...u, plan }));
    setShowPlanMenu(false);
    onToast(`Plan changed to ${plan}`);
  };

  const handleRoleChange = (role: Role) => {
    setUser((u) => ({ ...u, role }));
    setShowRoleMenu(false);
    onToast(`Role changed to ${ROLE_LABELS[role]}`);
  };

  // Close menus on outside key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPlanMenu || showRoleMenu) {
          setShowPlanMenu(false);
          setShowRoleMenu(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, showPlanMenu, showRoleMenu]);

  const isSuspended = user.status === 'suspended';
  const isInvited = user.status === 'invited';

  return (
    <motion.div
      layoutId={`card-${user.id}`}
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
          <Avatar user={user} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{user.name}</span>
              {user.role === 'super_admin' && (
                <Shield size={16} style={{ color: T.accent }} />
              )}
              {user.role === 'admin' && (
                <Star size={14} style={{ color: T.accentLight }} />
              )}
            </div>
            <div style={{ fontSize: 13, color: T.faint, marginTop: 2 }}>{user.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <PlanChip plan={user.plan} />
              <StatusDot status={user.status} />
              <span style={{ fontSize: 11, color: T.ghost, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Building2 size={11} />
                {user.workspace}
              </span>
            </div>
          </div>
        </motion.div>

        {/* IMPERSONATE CTA — marquee action */}
        {!isSuspended && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            whileHover={{ scale: 1.02, boxShadow: `0 0 32px ${T.accentGlow}` }}
            whileTap={{ scale: 0.97 }}
            onClick={handleImpersonate}
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
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: `0 4px 20px ${T.accentDim}`,
              marginBottom: 20,
            }}
          >
            <LogIn size={18} />
            Enter as User — Impersonate {user.name}
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
          {[
            { icon: Inbox, label: 'Mailboxes', value: user.mailboxes.toString() },
            { icon: Clock, label: 'Last Active', value: user.lastActive },
            { icon: Calendar, label: 'Signed Up', value: user.signupDate },
            { icon: Key, label: '2FA', value: user.twoFA ? 'Enabled' : 'Not enabled', color: user.twoFA ? T.success : T.warning },
          ].map(({ icon: Icon, label, value, color }) => (
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

        {/* Action row — Plan / Role / Suspend */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}
        >
          {/* Change plan */}
          <div style={{ position: 'relative' }}>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => { setShowPlanMenu((v) => !v); setShowRoleMenu(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 10,
                background: T.accentDim,
                border: `1px solid ${T.accent}50`,
                color: T.accent,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Activity size={13} />
              Plan: {user.plan}
              <ChevronDown size={12} />
            </motion.button>
            <AnimatePresence>
              {showPlanMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  style={{
                    position: 'absolute', top: '110%', left: 0, zIndex: 100,
                    ...T.glassTight,
                    background: 'rgba(20,14,10,0.90)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    minWidth: 140, padding: '4px 0',
                  }}
                >
                  {ALL_PLANS.map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePlanChange(p)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 14px', background: p === user.plan ? T.accentDim : 'transparent',
                        border: 'none', color: p === user.plan ? T.accent : T.dim,
                        fontSize: 13, fontWeight: p === user.plan ? 700 : 500, cursor: 'pointer',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Change role */}
          <div style={{ position: 'relative' }}>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => { setShowRoleMenu((v) => !v); setShowPlanMenu(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: T.dim,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Shield size={13} />
              {ROLE_LABELS[user.role]}
              <ChevronDown size={12} />
            </motion.button>
            <AnimatePresence>
              {showRoleMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  style={{
                    position: 'absolute', top: '110%', left: 0, zIndex: 100,
                    ...T.glassTight,
                    background: 'rgba(20,14,10,0.90)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    minWidth: 150, padding: '4px 0',
                  }}
                >
                  {ALL_ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRoleChange(r)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 14px', background: r === user.role ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: 'none', color: r === user.role ? T.text : T.dim,
                        fontSize: 13, fontWeight: r === user.role ? 700 : 500, cursor: 'pointer',
                      }}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Suspend / Reactivate */}
          {!isInvited && (
            isSuspended ? (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleReactivate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 10,
                  background: T.successDim,
                  border: `1px solid ${T.success}40`,
                  color: T.success,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <UserCheck size={13} />
                Reactivate
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleSuspend}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 10,
                  background: confirmSuspend ? T.dangerDim : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${confirmSuspend ? T.danger + '60' : 'rgba(255,255,255,0.10)'}`,
                  color: confirmSuspend ? T.danger : T.dim,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <UserX size={13} />
                {confirmSuspend ? 'Confirm suspend?' : 'Suspend'}
              </motion.button>
            )
          )}

          {/* Resend invite */}
          {isInvited && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleResendInvite}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 10,
                background: T.warningDim,
                border: `1px solid ${T.warning}40`,
                color: T.warning,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Send size={13} />
              Resend Invite
            </motion.button>
          )}

          {/* Reset 2FA shortcut */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onToast('2FA reset link sent')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: T.faint,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} />
            Reset 2FA
          </motion.button>
        </motion.div>

        {/* Divider */}
        <div style={{ height: 1, background: T.hairline, marginBottom: 16 }} />

        {/* Recent activity */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.32 }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 10 }}>
            Recent Activity
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {user.recentActivity.map((act, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.34 + i * 0.06, type: 'spring', stiffness: 280, damping: 22 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  ...T.glassTight,
                  background: 'rgba(255,255,255,0.035)',
                }}
              >
                <ChevronRight size={12} style={{ color: T.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: T.dim }}>{act}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── User card ───────────────────────────────────────────────────────────────────
function UserCard({
  user,
  onClick,
}: {
  user: User;
  onClick: () => void;
}) {
  const isSuspended = user.status === 'suspended';
  return (
    <motion.div
      layoutId={`card-${user.id}`}
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
      }}
    >
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

      {/* Top row: avatar + plan chip + role icon */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <Avatar user={user} size={48} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PlanChip plan={user.plan} />
          <RoleIcon role={user.role} />
        </div>
      </div>

      {/* Name + email */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{user.name}</div>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.email}
        </div>
      </div>

      {/* Workspace */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
        <Building2 size={11} style={{ color: T.ghost, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: T.ghost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.workspace}
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: T.hairline, marginBottom: 12 }} />

      {/* Footer: status + last active + mailboxes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusDot status={user.status} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.ghost }}>
            <Inbox size={11} />
            {user.mailboxes}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.ghost }}>
            <Clock size={11} />
            {user.lastActive}
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
}

// ─── Main component ──────────────────────────────────────────────────────────────
export function AdmUsrU3Gallery() {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<Plan | null>(null);
  const [roleFilter, setRoleFilter] = useState<Role | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);
  const [expanded, setExpanded] = useState<User | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Derived filtered list
  const filtered = MOCK_USERS.filter((u) => {
    if (planFilter && u.plan !== planFilter) return false;
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter && u.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.workspace.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // KPI totals
  const totals = {
    total: MOCK_USERS.length,
    active: MOCK_USERS.filter((u) => u.status === 'active').length,
    suspended: MOCK_USERS.filter((u) => u.status === 'suspended').length,
    invited: MOCK_USERS.filter((u) => u.status === 'invited').length,
  };

  const hasFilters = !!planFilter || !!roleFilter || !!statusFilter || !!query;

  const clearAll = () => {
    setPlanFilter(null);
    setRoleFilter(null);
    setStatusFilter(null);
    setQuery('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '28px 28px 60px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
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
              Cross-workspace super-admin view
            </p>
          </div>
        </div>
      </motion.div>

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
        <StatKpi label="Total Users" value={totals.total} icon={Users} color={T.accent} delay={0} />
        <StatKpi label="Active" value={totals.active} icon={CheckCircle2} color={T.success} delay={0.07} />
        <StatKpi label="Suspended" value={totals.suspended} icon={ShieldOff} color={T.danger} delay={0.14} />
        <StatKpi label="Invited" value={totals.invited} icon={Mail} color={T.warning} delay={0.21} />
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
            placeholder="Search name, email, workspace…"
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

        {/* Plan filter chips */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
        >
          {ALL_PLANS.map((p) => (
            <FilterChip
              key={p}
              label={p}
              active={planFilter === p}
              color={T.accent}
              onClick={() => setPlanFilter(planFilter === p ? null : p)}
            />
          ))}
        </motion.div>

        {/* Role filter chips */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
        >
          {ALL_ROLES.map((r) => (
            <FilterChip
              key={r}
              label={ROLE_LABELS[r]}
              active={roleFilter === r}
              color={T.accentLight}
              onClick={() => setRoleFilter(roleFilter === r ? null : r)}
            />
          ))}
        </motion.div>

        {/* Status filter chips */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
        >
          {ALL_STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={STATUS_LABELS[s]}
              active={statusFilter === s}
              color={STATUS_COLORS[s]}
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

        {/* Count badge */}
        <motion.span
          layout
          style={{ fontSize: 12, color: T.ghost, marginLeft: 'auto', whiteSpace: 'nowrap' }}
        >
          {filtered.length} of {MOCK_USERS.length}
        </motion.span>
      </motion.div>

      {/* ── Card grid ── */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
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
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No users match</div>
            <div style={{ fontSize: 13 }}>Try adjusting your filters</div>
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
              {filtered.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  onClick={() => setExpanded(user)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Expanded profile modal overlay ── */}
      <AnimatePresence>
        {expanded && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setExpanded(null)}
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
                  user={expanded}
                  onClose={() => setExpanded(null)}
                  onToast={showToast}
                />
              </div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <ToastBanner
            key={toast}
            msg={toast}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {/* ── More actions / overflow menu hint ── */}
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
        }}
      >
        <MoreHorizontal size={14} />
        Click any card to expand profile
      </motion.div>
    </div>
  );
}
