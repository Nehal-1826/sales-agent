/**
 * Admin Users Design Candidate: U2 Segment Cohorts
 *
 * "Segment Cohorts" — users organized into animated segments/cohorts.
 * A KPI header with animated counters, a grouping toggle (plan / role / status /
 * signup cohort) that re-springs the segment cards + distribution bars, and a
 * drill-down user list that expands with staggered AnimatePresence.
 *
 * Marquee action: Impersonate / "Enter as user" (prominent, per row).
 * Supporting: change plan / role / status, suspend, resend invite.
 *
 * Fully self-contained: inline style={{}} only (no .css import, no Tailwind),
 * mock data only, no API / react-query / @/features / @/lib imports.
 * Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97, danger #ff5c7a,
 * warning #FF8A4B. No purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
  ChevronDown,
  ChevronRight,
  LogIn,
  MoreHorizontal,
  X,
  CheckCircle2,
  AlertTriangle,
  UserMinus,
  Mail,
  ShieldCheck,
  RefreshCw,
  CreditCard,
  Layers,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.38)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentHi: '#FF8A4B' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.14)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.14)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.14)' as const,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,
  glassDeep: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: 12,
  } as CSSProperties,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.40)',
  } as CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Plan = 'Free' | 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';
type Role = 'member' | 'admin' | 'super_admin';
type Status = 'active' | 'invited' | 'suspended';
type Cohort = 'Jan 2026' | 'Feb 2026' | 'Mar 2026' | 'Apr 2026' | 'May 2026';
type GroupBy = 'plan' | 'role' | 'status' | 'cohort';

interface MockUser {
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
  cohort: Cohort;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_USERS: MockUser[] = [
  { id: 'u1',  name: 'Alex Chen',       email: 'alex@acme.co',          initials: 'AC', avatarColor: '#F26522', workspace: 'Acme Corp',       plan: 'Agency',   role: 'admin',       status: 'active',    mailboxes: 12, lastActive: '2m ago',    signupDate: 'Jan 14, 2026', cohort: 'Jan 2026' },
  { id: 'u2',  name: 'Priya Sharma',    email: 'priya@northwind.io',     initials: 'PS', avatarColor: '#FF8A4B', workspace: 'Northwind IO',    plan: 'Pro Plus', role: 'admin',       status: 'active',    mailboxes: 6,  lastActive: '1h ago',    signupDate: 'Feb 03, 2026', cohort: 'Feb 2026' },
  { id: 'u3',  name: 'Marcus Wong',     email: 'marcus@lumenlabs.dev',   initials: 'MW', avatarColor: '#3ddc97', workspace: 'LumenLabs',       plan: 'Starter',  role: 'member',      status: 'active',    mailboxes: 2,  lastActive: '3h ago',    signupDate: 'Apr 22, 2026', cohort: 'Apr 2026' },
  { id: 'u4',  name: 'Sofia Rivera',    email: 'sofia@vendio.io',        initials: 'SR', avatarColor: '#F26522', workspace: 'Vendio',          plan: 'Pro',      role: 'member',      status: 'active',    mailboxes: 4,  lastActive: '30m ago',   signupDate: 'Mar 08, 2026', cohort: 'Mar 2026' },
  { id: 'u5',  name: 'Tomás Köhler',   email: 'tk@beacon.app',          initials: 'TK', avatarColor: '#FF8A4B', workspace: 'Beacon App',      plan: 'Agency',   role: 'admin',       status: 'active',    mailboxes: 18, lastActive: 'just now',  signupDate: 'Jan 02, 2026', cohort: 'Jan 2026' },
  { id: 'u6',  name: 'Devika Verma',    email: 'devika@parable.in',      initials: 'DV', avatarColor: '#3ddc97', workspace: 'Parable Inc',     plan: 'Free',     role: 'member',      status: 'invited',   mailboxes: 0,  lastActive: 'never',     signupDate: 'May 01, 2026', cohort: 'May 2026' },
  { id: 'u7',  name: 'Jin Kwon',        email: 'jin@arclamp.co',         initials: 'JK', avatarColor: '#ff5c7a', workspace: 'ArcLamp',         plan: 'Starter',  role: 'member',      status: 'suspended', mailboxes: 0,  lastActive: '14d ago',   signupDate: 'Feb 28, 2026', cohort: 'Feb 2026' },
  { id: 'u8',  name: 'Elena Lopez',     email: 'el@oxenstudio.com',      initials: 'EL', avatarColor: '#F26522', workspace: 'Oxen Studio',     plan: 'Pro',      role: 'member',      status: 'active',    mailboxes: 3,  lastActive: '5h ago',    signupDate: 'Mar 30, 2026', cohort: 'Mar 2026' },
  { id: 'u9',  name: 'Ravi Desai',      email: 'ravi@clearpath.io',      initials: 'RD', avatarColor: '#FF8A4B', workspace: 'Clearpath IO',    plan: 'Pro Plus', role: 'admin',       status: 'active',    mailboxes: 8,  lastActive: '2h ago',    signupDate: 'Jan 22, 2026', cohort: 'Jan 2026' },
  { id: 'u10', name: 'Nadia Fischer',   email: 'nadia@sproutlabs.eu',    initials: 'NF', avatarColor: '#3ddc97', workspace: 'SproutLabs',      plan: 'Agency',   role: 'super_admin', status: 'active',    mailboxes: 24, lastActive: 'just now',  signupDate: 'Feb 10, 2026', cohort: 'Feb 2026' },
  { id: 'u11', name: 'Carlos Mendes',   email: 'carlos@helixgrowth.com', initials: 'CM', avatarColor: '#F26522', workspace: 'Helix Growth',    plan: 'Pro',      role: 'member',      status: 'active',    mailboxes: 5,  lastActive: '1d ago',    signupDate: 'Apr 05, 2026', cohort: 'Apr 2026' },
  { id: 'u12', name: 'Yuki Tanaka',     email: 'yuki@waveform.jp',       initials: 'YT', avatarColor: '#FF8A4B', workspace: 'Waveform JP',     plan: 'Starter',  role: 'member',      status: 'invited',   mailboxes: 0,  lastActive: 'never',     signupDate: 'May 15, 2026', cohort: 'May 2026' },
  { id: 'u13', name: 'Omar Khalid',     email: 'omar@peakmail.ae',       initials: 'OK', avatarColor: '#3ddc97', workspace: 'PeakMail AE',     plan: 'Pro Plus', role: 'admin',       status: 'active',    mailboxes: 10, lastActive: '45m ago',   signupDate: 'Mar 12, 2026', cohort: 'Mar 2026' },
  { id: 'u14', name: 'Luna Becker',     email: 'luna@stackfire.de',      initials: 'LB', avatarColor: '#F26522', workspace: 'Stackfire DE',    plan: 'Free',     role: 'member',      status: 'active',    mailboxes: 1,  lastActive: '3d ago',    signupDate: 'Apr 18, 2026', cohort: 'Apr 2026' },
  { id: 'u15', name: 'Sam Okonkwo',     email: 'sam@truenorth.ng',       initials: 'SO', avatarColor: '#FF8A4B', workspace: 'TrueNorth NG',    plan: 'Starter',  role: 'member',      status: 'suspended', mailboxes: 0,  lastActive: '21d ago',   signupDate: 'Jan 30, 2026', cohort: 'Jan 2026' },
  { id: 'u16', name: 'Iris Svensson',   email: 'iris@mailcraft.se',      initials: 'IS', avatarColor: '#3ddc97', workspace: 'MailCraft SE',    plan: 'Pro',      role: 'admin',       status: 'active',    mailboxes: 7,  lastActive: '20m ago',   signupDate: 'Feb 22, 2026', cohort: 'Feb 2026' },
  { id: 'u17', name: 'Dante Moretti',   email: 'dante@foglio.it',        initials: 'DM', avatarColor: '#F26522', workspace: 'Foglio IT',       plan: 'Agency',   role: 'admin',       status: 'active',    mailboxes: 15, lastActive: '4h ago',    signupDate: 'Mar 03, 2026', cohort: 'Mar 2026' },
  { id: 'u18', name: 'Asel Nurova',     email: 'asel@brightbox.kz',      initials: 'AN', avatarColor: '#FF8A4B', workspace: 'Brightbox KZ',    plan: 'Pro Plus', role: 'member',      status: 'active',    mailboxes: 5,  lastActive: '6h ago',    signupDate: 'May 08, 2026', cohort: 'May 2026' },
];

// ─── Color maps ───────────────────────────────────────────────────────────────
const PLAN_COLORS: Record<Plan, string> = {
  Free:     '#6b7280',
  Starter:  '#FF8A4B',
  Pro:      '#F26522',
  'Pro Plus': '#3ddc97',
  Agency:   '#ff5c7a',
};

const ROLE_COLORS: Record<Role, string> = {
  member:      'rgba(255,255,255,0.38)',
  admin:       '#FF8A4B',
  super_admin: '#3ddc97',
};

const STATUS_COLORS: Record<Status, string> = {
  active:    '#3ddc97',
  invited:   '#FF8A4B',
  suspended: '#ff5c7a',
};

const COHORT_COLORS: Record<Cohort, string> = {
  'Jan 2026': '#F26522',
  'Feb 2026': '#FF8A4B',
  'Mar 2026': '#3ddc97',
  'Apr 2026': '#ff5c7a',
  'May 2026': '#F26522',
};

// ─── Segment logic ────────────────────────────────────────────────────────────
interface Segment {
  key: string;
  label: string;
  color: string;
  users: MockUser[];
  count: number;
  pct: number;
  statA: string;
  statB: string;
}

function buildSegments(users: MockUser[], groupBy: GroupBy): Segment[] {
  const groups: Record<string, MockUser[]> = {};

  for (const u of users) {
    const key: string =
      groupBy === 'plan'   ? u.plan :
      groupBy === 'role'   ? u.role :
      groupBy === 'status' ? u.status :
      u.cohort;
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(u);
  }

  const total = users.length;

  const colorMap: Record<string, string> =
    groupBy === 'plan'   ? (PLAN_COLORS as Record<string, string>) :
    groupBy === 'role'   ? (ROLE_COLORS as Record<string, string>) :
    groupBy === 'status' ? (STATUS_COLORS as Record<string, string>) :
    (COHORT_COLORS as Record<string, string>);

  const ORDER: Record<GroupBy, string[]> = {
    plan:   ['Agency', 'Pro Plus', 'Pro', 'Starter', 'Free'],
    role:   ['super_admin', 'admin', 'member'],
    status: ['active', 'invited', 'suspended'],
    cohort: ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026'],
  };

  return ORDER[groupBy]
    .filter((k) => groups[k] && groups[k]!.length > 0)
    .map((k) => {
      const list = groups[k]!;
      const activeCount = list.filter((u) => u.status === 'active').length;
      const totalMailboxes = list.reduce((s, u) => s + u.mailboxes, 0);
      return {
        key: k,
        label: k,
        color: colorMap[k] ?? '#F26522',
        users: list,
        count: list.length,
        pct: Math.round((list.length / total) * 100),
        statA: `${activeCount} active`,
        statB: `${totalMailboxes} mbx`,
      };
    });
}

// ─── Animated counter hook ────────────────────────────────────────────────────
function useAnimatedCount(target: number, duration = 1.2) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [target, duration, mv]);

  return display;
}

// ─── Animated bar component ───────────────────────────────────────────────────
function SpringBar({
  pct,
  color,
  height = 6,
  delay = 0,
}: {
  pct: number;
  color: string;
  height?: number;
  delay?: number;
}) {
  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: height / 2,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}
    >
      <motion.div
        style={{
          height: '100%',
          borderRadius: height / 2,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          transformOrigin: 'left',
        }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct / 100 }}
        transition={{
          type: 'spring',
          stiffness: 90,
          damping: 18,
          delay,
        }}
      />
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
interface ToastData {
  id: number;
  msg: string;
  type: 'success' | 'warn' | 'info';
}

const toastVariants: Variants = {
  enter: { opacity: 0, y: 20, scale: 0.94 },
  show:  { opacity: 1, y: 0,  scale: 1    },
  exit:  { opacity: 0, y: 10, scale: 0.92 },
};

// ─── User action menu ─────────────────────────────────────────────────────────
interface UserMenuProps {
  user: MockUser;
  onClose: () => void;
  onAction: (msg: string, type: ToastData['type']) => void;
}

const menuVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: -6 },
  show:   { opacity: 1, scale: 1,    y: 0  },
  exit:   { opacity: 0, scale: 0.90, y: -4 },
};

function UserMenu({ user, onClose, onAction }: UserMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const plans: Plan[] = ['Free', 'Starter', 'Pro', 'Pro Plus', 'Agency'];
  const roles: Role[] = ['member', 'admin', 'super_admin'];
  const [showPlan, setShowPlan] = useState(false);
  const [showRole, setShowRole] = useState(false);

  const item: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', cursor: 'pointer', borderRadius: 8,
    fontSize: 13, color: T.dim, transition: 'background 0.15s, color 0.15s',
  };

  return (
    <motion.div
      ref={ref}
      variants={menuVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'absolute', right: 0, top: '100%', zIndex: 200,
        marginTop: 6, width: 220,
        ...T.glass,
        background: 'rgba(18,18,28,0.96)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
      }}
    >
      {/* Sub-menus */}
      <AnimatePresence>
        {showPlan && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', right: '105%', top: 0,
              width: 160,
              ...T.glass,
              background: 'rgba(18,18,28,0.97)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            }}
          >
            {plans.map((p) => (
              <div
                key={p}
                style={{
                  ...item,
                  color: p === user.plan ? T.accent : T.dim,
                  fontWeight: p === user.plan ? 600 : 400,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = T.text; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = p === user.plan ? T.accent : T.dim; }}
                onClick={() => {
                  onAction(`Plan changed to ${p} for ${user.name}`, 'success');
                  setShowPlan(false);
                  onClose();
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: PLAN_COLORS[p], flexShrink: 0 }} />
                {p}
              </div>
            ))}
          </motion.div>
        )}
        {showRole && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', right: '105%', top: 40,
              width: 160,
              ...T.glass,
              background: 'rgba(18,18,28,0.97)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            }}
          >
            {roles.map((r) => (
              <div
                key={r}
                style={{
                  ...item,
                  color: r === user.role ? T.accent : T.dim,
                  fontWeight: r === user.role ? 600 : 400,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = T.text; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = r === user.role ? T.accent : T.dim; }}
                onClick={() => {
                  onAction(`Role changed to ${r} for ${user.name}`, 'success');
                  setShowRole(false);
                  onClose();
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ROLE_COLORS[r], flexShrink: 0 }} />
                {r}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ padding: 6 }}>
        <div
          style={{ ...item }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = T.text; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = T.dim; }}
          onClick={() => { onAction(`Sending invite to ${user.email}`, 'info'); onClose(); }}
        >
          <Mail size={13} strokeWidth={2.2} />
          Resend invite
        </div>

        <div
          style={{ ...item }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,138,75,0.12)'; (e.currentTarget as HTMLElement).style.color = T.warning; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = T.dim; }}
          onClick={() => setShowPlan(!showPlan)}
        >
          <CreditCard size={13} strokeWidth={2.2} />
          Change plan
          <ChevronRight size={11} style={{ marginLeft: 'auto' }} />
        </div>

        <div
          style={{ ...item }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,138,75,0.12)'; (e.currentTarget as HTMLElement).style.color = T.warning; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = T.dim; }}
          onClick={() => setShowRole(!showRole)}
        >
          <ShieldCheck size={13} strokeWidth={2.2} />
          Change role
          <ChevronRight size={11} style={{ marginLeft: 'auto' }} />
        </div>

        <div
          style={{ ...item }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,138,75,0.12)'; (e.currentTarget as HTMLElement).style.color = T.warning; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = T.dim; }}
          onClick={() => { onAction(`Status toggled for ${user.name}`, 'success'); onClose(); }}
        >
          <RefreshCw size={13} strokeWidth={2.2} />
          {user.status === 'suspended' ? 'Reactivate' : 'Toggle status'}
        </div>

        <div style={{ height: 1, background: T.hairline, margin: '4px 6px' }} />

        <div
          style={{ ...item, color: T.danger }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,92,122,0.12)'; (e.currentTarget as HTMLElement).style.color = '#ff7a93'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = T.danger; }}
          onClick={() => { onAction(`${user.name} suspended`, 'warn'); onClose(); }}
        >
          <UserMinus size={13} strokeWidth={2.2} />
          Suspend user
        </div>
      </div>
    </motion.div>
  );
}

// ─── User row component ───────────────────────────────────────────────────────
const rowVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show:   { opacity: 1, y: 0,  scale: 1    },
  exit:   { opacity: 0, y: -8, scale: 0.97 },
};

interface UserRowProps {
  user: MockUser;
  index: number;
  onImpersonate: (user: MockUser) => void;
  onToast: (msg: string, type: ToastData['type']) => void;
}

function UserRow({ user, index, onImpersonate, onToast }: UserRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuClose = useCallback(() => setMenuOpen(false), []);

  return (
    <motion.div
      layout
      variants={rowVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={{
        layout: { type: 'spring', stiffness: 300, damping: 30 },
        opacity: { duration: 0.22 },
        y: { type: 'spring', stiffness: 260, damping: 26, delay: index * 0.04 },
        scale: { duration: 0.22, delay: index * 0.04 },
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderBottom: `1px solid ${T.hairline}`,
        position: 'relative',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: `radial-gradient(circle at 35% 35%, ${user.avatarColor}cc, ${user.avatarColor}88)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
          boxShadow: `0 0 0 1.5px ${user.avatarColor}40`,
        }}
      >
        {user.initials}
      </div>

      {/* Identity */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.name}
        </div>
        <div style={{ fontSize: 11, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.email}
        </div>
      </div>

      {/* Workspace */}
      <div style={{ width: 110, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ fontSize: 11, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.workspace}
        </div>
        <div style={{ fontSize: 10, color: T.faint }}>
          {user.mailboxes} mailbox{user.mailboxes !== 1 ? 'es' : ''}
        </div>
      </div>

      {/* Plan pill */}
      <div style={{ flexShrink: 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          padding: '3px 7px', borderRadius: 6,
          background: `${PLAN_COLORS[user.plan]}22`,
          color: PLAN_COLORS[user.plan],
          border: `1px solid ${PLAN_COLORS[user.plan]}44`,
        }}>
          {user.plan}
        </span>
      </div>

      {/* Status dot */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        <motion.span
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: STATUS_COLORS[user.status],
            display: 'block',
          }}
          animate={user.status === 'active' ? {
            boxShadow: [`0 0 0 0px ${STATUS_COLORS[user.status]}44`, `0 0 0 4px ${STATUS_COLORS[user.status]}00`],
          } : {}}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
        <span style={{ fontSize: 11, color: STATUS_COLORS[user.status], fontWeight: 500 }}>
          {user.status}
        </span>
      </div>

      {/* Last active */}
      <div style={{ width: 70, flexShrink: 0, fontSize: 11, color: T.faint, textAlign: 'right' }}>
        {user.lastActive}
      </div>

      {/* Impersonate CTA */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.04, backgroundColor: '#F26522' }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        onClick={() => onImpersonate(user)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 10px', borderRadius: 8,
          background: 'rgba(242,101,34,0.16)',
          border: '1px solid rgba(242,101,34,0.4)',
          color: T.accent, fontSize: 11, fontWeight: 700,
          cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
          letterSpacing: '0.03em',
        }}
      >
        <LogIn size={11} strokeWidth={2.5} />
        Enter as
      </motion.button>

      {/* More menu */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <motion.button
          type="button"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            width: 28, height: 28, borderRadius: 7,
            background: menuOpen ? 'rgba(255,255,255,0.10)' : 'transparent',
            border: '1px solid transparent',
            color: T.faint, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <MoreHorizontal size={14} strokeWidth={2.2} />
        </motion.button>

        <AnimatePresence>
          {menuOpen && (
            <UserMenu user={user} onClose={menuClose} onAction={onToast} />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Segment card component ───────────────────────────────────────────────────
const cardVariants: Variants = {
  hidden:  { opacity: 0, y: 18, scale: 0.95 },
  show:    { opacity: 1, y: 0,  scale: 1    },
  exit:    { opacity: 0, y: -10, scale: 0.97 },
};

interface SegmentCardProps {
  seg: Segment;
  index: number;
  isOpen: boolean;
  onClick: () => void;
  onImpersonate: (user: MockUser) => void;
  onToast: (msg: string, type: ToastData['type']) => void;
  maxCount: number;
}

function SegmentCard({ seg, index, isOpen, onClick, onImpersonate, onToast, maxCount }: SegmentCardProps) {
  const countDisplay = useAnimatedCount(seg.count, 0.9);

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={{
        layout: { type: 'spring', stiffness: 280, damping: 28 },
        opacity: { duration: 0.25 },
        y: { type: 'spring', stiffness: 260, damping: 24, delay: index * 0.06 },
        scale: { duration: 0.25, delay: index * 0.06 },
      }}
      style={{ width: '100%' }}
    >
      {/* Card header — clickable */}
      <motion.div
        layout
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.065)' }}
        whileTap={{ scale: 0.995 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={onClick}
        style={{
          ...T.glass,
          borderRadius: isOpen ? '16px 16px 0 0' : 16,
          padding: '16px 20px',
          cursor: 'pointer',
          borderBottom: isOpen ? `1px solid ${seg.color}30` : T.glass.border,
          transition: 'border-radius 0.25s, border-bottom 0.25s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Color swatch */}
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: `linear-gradient(135deg, ${seg.color}33, ${seg.color}16)`,
            border: `1px solid ${seg.color}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Layers size={16} style={{ color: seg.color }} />
          </div>

          {/* Label + count */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{seg.label}</span>
              <span style={{ ...T.micro }}>{seg.statA} · {seg.statB}</span>
            </div>
            {/* Distribution bar */}
            <div style={{ marginTop: 7 }}>
              <SpringBar pct={(seg.count / maxCount) * 100} color={seg.color} height={5} delay={index * 0.07} />
            </div>
          </div>

          {/* Count + pct */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.text, lineHeight: 1 }}>
              {countDisplay}
            </div>
            <div style={{ fontSize: 11, color: seg.color, fontWeight: 600, marginTop: 2 }}>
              {seg.pct}%
            </div>
          </div>

          {/* Chevron */}
          <motion.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{ color: T.faint, flexShrink: 0 }}
          >
            <ChevronRight size={16} strokeWidth={2.2} />
          </motion.div>
        </div>
      </motion.div>

      {/* Expanded user list */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key={`${seg.key}-list`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            style={{
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${seg.color}25`,
              borderTop: 'none',
              borderRadius: '0 0 16px 16px',
            }}
          >
            {/* List header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 14px',
              borderBottom: `1px solid ${T.hairline}`,
              background: `${seg.color}08`,
            }}>
              <span style={{ ...T.micro, flex: 1 }}>
                {seg.count} user{seg.count !== 1 ? 's' : ''} in {seg.label}
              </span>
              <span style={{ ...T.micro, width: 110, textAlign: 'left' }}>Workspace</span>
              <span style={{ ...T.micro, width: 70, textAlign: 'left' }}>Plan</span>
              <span style={{ ...T.micro, width: 90, textAlign: 'left' }}>Status</span>
              <span style={{ ...T.micro, width: 70, textAlign: 'right' }}>Last active</span>
              <span style={{ ...T.micro, width: 72, textAlign: 'center' }}>Action</span>
              <span style={{ width: 30 }} />
            </div>

            <AnimatePresence>
              {seg.users.map((u, i) => (
                <UserRow
                  key={u.id}
                  user={u}
                  index={i}
                  onImpersonate={onImpersonate}
                  onToast={onToast}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── KPI counter card ─────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: number;
  color: string;
  icon: typeof Users;
  index: number;
}

function KpiCard({ label, value, color, icon: Icon, index }: KpiCardProps) {
  const display = useAnimatedCount(value, 1.1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26, delay: index * 0.07 }}
      style={{
        ...T.glass,
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 12,
        flex: 1, minWidth: 0,
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, lineHeight: 1 }}>
          {display}
        </div>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>{label}</div>
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmUsrU2Cohorts() {
  const [groupBy, setGroupBy] = useState<GroupBy>('plan');
  const [openSegment, setOpenSegment] = useState<string | null>('Agency');
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [impersonating, setImpersonating] = useState<MockUser | null>(null);
  const toastIdRef = useRef(0);

  const pushToast = useCallback((msg: string, type: ToastData['type'] = 'success') => {
    const id = ++toastIdRef.current;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3400);
  }, []);

  const handleImpersonate = useCallback((user: MockUser) => {
    setImpersonating(user);
    pushToast(`Entering workspace as ${user.name} — ${user.workspace}`, 'info');
  }, [pushToast]);

  // Filtered users by search
  const filteredUsers = search.trim()
    ? MOCK_USERS.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          u.workspace.toLowerCase().includes(search.toLowerCase())
      )
    : MOCK_USERS;

  const segments = buildSegments(filteredUsers, groupBy);
  const maxCount = Math.max(...segments.map((s) => s.count), 1);

  const totalUsers = MOCK_USERS.length;
  const activeUsers = MOCK_USERS.filter((u) => u.status === 'active').length;
  const invitedUsers = MOCK_USERS.filter((u) => u.status === 'invited').length;
  const suspendedUsers = MOCK_USERS.filter((u) => u.status === 'suspended').length;

  const toggleGroupBy = (g: GroupBy) => {
    setGroupBy(g);
    setOpenSegment(null);
  };

  // Close impersonation banner on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImpersonating(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const groupByOptions: { key: GroupBy; label: string }[] = [
    { key: 'plan',   label: 'By plan'   },
    { key: 'role',   label: 'By role'   },
    { key: 'status', label: 'By status' },
    { key: 'cohort', label: 'By cohort' },
  ];

  const toastTopBorder: Record<ToastData['type'], string> = {
    success: T.success,
    warn:    T.danger,
    info:    T.accent,
  };
  const toastIcon: Record<ToastData['type'], typeof CheckCircle2> = {
    success: CheckCircle2,
    warn:    AlertTriangle,
    info:    LogIn,
  };
  const toastColor: Record<ToastData['type'], string> = {
    success: T.success,
    warn:    T.danger,
    info:    T.accent,
  };

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '28px 28px 60px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        color: T.text,
        position: 'relative',
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: 'radial-gradient(ellipse 60% 45% at 30% 15%, rgba(242,101,34,0.08) 0%, transparent 70%), radial-gradient(ellipse 40% 35% at 80% 70%, rgba(61,220,151,0.05) 0%, transparent 65%)',
        }}
      />

      {/* Impersonation banner */}
      <AnimatePresence>
        {impersonating && (
          <motion.div
            key="impersonate-banner"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            style={{
              position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
              zIndex: 500,
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 18px',
              background: 'rgba(14,14,22,0.97)',
              border: `1px solid ${T.accent}60`,
              borderRadius: 12,
              boxShadow: `0 8px 32px rgba(242,101,34,0.25), 0 0 0 1px ${T.accent}30`,
              maxWidth: 420,
              pointerEvents: 'all',
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${impersonating.avatarColor}cc, ${impersonating.avatarColor}88)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, flexShrink: 0,
            }}>
              {impersonating.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.accent, fontWeight: 700 }}>
                Impersonating
              </div>
              <div style={{ fontSize: 12, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {impersonating.name} · {impersonating.workspace}
              </div>
            </div>
            <motion.button
              type="button"
              whileHover={{ scale: 1.15, color: T.text }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                setImpersonating(null);
                pushToast('Exited impersonation', 'success');
              }}
              style={{
                background: 'none', border: 'none', color: T.faint,
                cursor: 'pointer', padding: 4, flexShrink: 0,
              }}
            >
              <X size={14} strokeWidth={2.4} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast stack */}
      <div
        aria-live="polite"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 400,
          display: 'flex', flexDirection: 'column', gap: 8,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = toastIcon[t.type];
            return (
              <motion.div
                key={t.id}
                variants={toastVariants}
                initial="enter"
                animate="show"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '10px 14px',
                  background: 'rgba(14,14,22,0.92)',
                  border: `1px solid ${toastColor[t.type]}40`,
                  borderTop: `2px solid ${toastTopBorder[t.type]}`,
                  borderRadius: 10,
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: `0 6px 24px rgba(0,0,0,0.4)`,
                  maxWidth: 300, pointerEvents: 'all',
                } as CSSProperties}
              >
                <Icon size={13} style={{ color: toastColor[t.type], flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: T.dim }}>{t.msg}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 24, position: 'relative', zIndex: 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ ...T.micro, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Users size={10} strokeWidth={2.8} style={{ color: T.accent }} />
              Admin · Users
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text, lineHeight: 1.1, margin: 0 }}>
              Segment Cohorts
            </h1>
            <p style={{ fontSize: 13, color: T.faint, marginTop: 5, margin: 0 }}>
              Cross-workspace user overview — segmented, searchable, actionable.
            </p>
          </div>

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 12px',
            ...T.glass,
            borderRadius: 10, minWidth: 200,
          }}>
            <Search size={13} style={{ color: T.faint, flexShrink: 0 }} />
            <input
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{
                background: 'none', border: 'none', outline: 'none',
                fontSize: 13, color: T.text, width: '100%',
              }}
            />
            {search && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer', padding: 0 }}
              >
                <X size={12} strokeWidth={2.5} />
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      {/* KPI strip */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 20,
        position: 'relative', zIndex: 1,
        flexWrap: 'wrap',
      }}>
        <KpiCard label="Total users"  value={totalUsers}    color={T.accent}   icon={Users}       index={0} />
        <KpiCard label="Active"       value={activeUsers}   color={T.success}  icon={CheckCircle2} index={1} />
        <KpiCard label="Invited"      value={invitedUsers}  color={T.warning}  icon={Mail}         index={2} />
        <KpiCard label="Suspended"    value={suspendedUsers} color={T.danger}  icon={UserMinus}    index={3} />
      </div>

      {/* Grouping toggle */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.25 }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 16, position: 'relative', zIndex: 1,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ ...T.micro, marginRight: 4 }}>
          <Layers size={10} strokeWidth={2.8} style={{ display: 'inline', marginRight: 4 }} />
          Group by
        </span>
        {groupByOptions.map(({ key, label }) => (
          <motion.button
            key={key}
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => toggleGroupBy(key)}
            style={{
              padding: '5px 12px', borderRadius: 8,
              fontSize: 12, fontWeight: groupBy === key ? 700 : 500,
              cursor: 'pointer',
              background: groupBy === key ? 'rgba(242,101,34,0.18)' : 'rgba(255,255,255,0.05)',
              border: groupBy === key ? '1px solid rgba(242,101,34,0.45)' : '1px solid rgba(255,255,255,0.08)',
              color: groupBy === key ? T.accent : T.faint,
              transition: 'background 0.18s, border 0.18s, color 0.18s',
            }}
          >
            {label}
            {groupBy === key && (
              <ChevronDown size={10} strokeWidth={2.5} style={{ display: 'inline', marginLeft: 5 }} />
            )}
          </motion.button>
        ))}

        {search && (
          <span style={{ ...T.micro, marginLeft: 8, color: T.warning }}>
            Filtered: {filteredUsers.length} of {MOCK_USERS.length} users
          </span>
        )}
      </motion.div>

      {/* Segment cards list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 1 }}>
        <AnimatePresence mode="popLayout">
          {segments.map((seg, i) => (
            <SegmentCard
              key={`${groupBy}-${seg.key}`}
              seg={seg}
              index={i}
              isOpen={openSegment === seg.key}
              onClick={() => setOpenSegment((prev) => prev === seg.key ? null : seg.key)}
              onImpersonate={handleImpersonate}
              onToast={pushToast}
              maxCount={maxCount}
            />
          ))}
        </AnimatePresence>

        {segments.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              ...T.glass, padding: '32px 24px', textAlign: 'center',
              color: T.faint, fontSize: 13,
            }}
          >
            No users match "{search}"
          </motion.div>
        )}
      </div>
    </div>
  );
}
