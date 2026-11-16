/**
 * Admin Users Design Candidate: U4 Activity Pulse
 *
 * "Activity Pulse" — an ops-style users page with:
 *  - Animated KPI counters (staggered entrance, whileHover/whileTap)
 *  - Hand-built SVG signups chart (motion.path pathLength 0→1 + spring bars)
 *  - Live-ish activity feed with AnimatePresence spring-slide rows + pause/play
 *  - Leaderboard with FLIP layout reordering on metric switch
 *  - Search/filter, per-row Impersonate + quick actions, mock toasts
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}} only. Mock data only. Warm Aurora Glass.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
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
  Users,
  Activity,
  AlertTriangle,
  LogIn,
  UserPlus,
  TrendingUp,
  Search,
  ChevronDown,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Shield,
  Zap,
  Star,
  Mail,
  Ban,
  X,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  text:       '#ffffff',
  dim:        'rgba(255,255,255,0.62)',
  faint:      'rgba(255,255,255,0.40)',
  ghost:      'rgba(255,255,255,0.18)',
  accent:     '#F26522',
  accent2:    '#FF8A4B',
  success:    '#3ddc97',
  danger:     '#ff5c7a',
  warning:    '#FF8A4B',
  glass:      'rgba(255,255,255,0.05)',
  glass2:     'rgba(255,255,255,0.08)',
  border:     'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.06)',
} as const;

const GLASS: CSSProperties = {
  background:           C.glass,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius:         16,
};

const GLASS2: CSSProperties = {
  background:           C.glass2,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  borderRadius:         12,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Plan = 'Free' | 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';
type Role = 'admin' | 'member';
type Status = 'active' | 'invited' | 'suspended';
type LeaderMetric = 'activity' | 'newest' | 'at_risk';

interface MockUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  workspace: string;
  plan: Plan;
  role: Role;
  status: Status;
  mailboxes: number;
  lastActive: string; // ISO-like label
  signupDate: string;
  loginCount: number;  // for activity score
  daysInactive: number;
}

interface FeedEvent {
  id: string;
  type: 'signup' | 'login' | 'upgrade' | 'suspend' | 'invite';
  userName: string;
  workspace: string;
  plan?: Plan;
  ts: string; // display timestamp
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const USERS: MockUser[] = [
  { id:'u1',  name:'Sophia Reeves',     email:'sophia@brightwave.io',     initials:'SR', workspace:'BrightWave',     plan:'Agency',   role:'admin',  status:'active',    mailboxes:12, lastActive:'2 min ago',  signupDate:'Mar 4, 2026',  loginCount:182, daysInactive:0  },
  { id:'u2',  name:'Marcus Tao',        email:'marcus@techvault.co',      initials:'MT', workspace:'TechVault',      plan:'Pro Plus', role:'admin',  status:'active',    mailboxes:8,  lastActive:'11 min ago', signupDate:'Feb 14, 2026', loginCount:143, daysInactive:0  },
  { id:'u3',  name:'Priya Nair',        email:'priya@inflowstudio.com',   initials:'PN', workspace:'InflowStudio',   plan:'Pro',      role:'member', status:'active',    mailboxes:5,  lastActive:'34 min ago', signupDate:'Apr 2, 2026',  loginCount:91,  daysInactive:0  },
  { id:'u4',  name:'Jordan Levy',       email:'jordan@orbitmedia.co',     initials:'JL', workspace:'OrbitMedia',     plan:'Starter',  role:'admin',  status:'active',    mailboxes:3,  lastActive:'1 hr ago',   signupDate:'May 1, 2026',  loginCount:44,  daysInactive:0  },
  { id:'u5',  name:'Elena Volkov',      email:'elena@sparkframe.io',      initials:'EV', workspace:'SparkFrame',     plan:'Agency',   role:'admin',  status:'active',    mailboxes:14, lastActive:'2 hr ago',   signupDate:'Jan 20, 2026', loginCount:221, daysInactive:0  },
  { id:'u6',  name:'Tobias Hecht',      email:'tobias@zendesk-alt.com',   initials:'TH', workspace:'ZendeskAlt',     plan:'Pro',      role:'member', status:'active',    mailboxes:4,  lastActive:'4 hr ago',   signupDate:'Mar 19, 2026', loginCount:77,  daysInactive:0  },
  { id:'u7',  name:'Aisha Mensah',      email:'aisha@cloudforte.io',      initials:'AM', workspace:'CloudForte',     plan:'Pro Plus', role:'admin',  status:'invited',   mailboxes:0,  lastActive:'Never',      signupDate:'May 28, 2026', loginCount:0,   daysInactive:3  },
  { id:'u8',  name:'Derek Sullivan',    email:'derek@rapidscale.dev',     initials:'DS', workspace:'RapidScale',     plan:'Starter',  role:'member', status:'active',    mailboxes:2,  lastActive:'Yesterday',  signupDate:'Apr 22, 2026', loginCount:18,  daysInactive:1  },
  { id:'u9',  name:'Nina Hartmann',     email:'nina@glowlabs.co',         initials:'NH', workspace:'GlowLabs',       plan:'Free',     role:'admin',  status:'active',    mailboxes:1,  lastActive:'3 days ago', signupDate:'May 10, 2026', loginCount:8,   daysInactive:3  },
  { id:'u10', name:'Carlos Mendez',     email:'carlos@syncbridge.io',     initials:'CM', workspace:'SyncBridge',     plan:'Pro',      role:'admin',  status:'suspended', mailboxes:4,  lastActive:'8 days ago', signupDate:'Feb 2, 2026',  loginCount:52,  daysInactive:8  },
  { id:'u11', name:'Yuki Tanaka',       email:'yuki@zenith-x.co',         initials:'YT', workspace:'ZenithX',        plan:'Agency',   role:'admin',  status:'active',    mailboxes:18, lastActive:'5 min ago',  signupDate:'Dec 12, 2025', loginCount:308, daysInactive:0  },
  { id:'u12', name:'Isabelle Fontaine', email:'isabelle@lunarops.fr',     initials:'IF', workspace:'LunarOps',       plan:'Starter',  role:'member', status:'active',    mailboxes:2,  lastActive:'6 days ago', signupDate:'May 5, 2026',  loginCount:11,  daysInactive:6  },
  { id:'u13', name:'Raj Patel',         email:'raj@alphadeploy.in',       initials:'RP', workspace:'AlphaDeploy',    plan:'Pro Plus', role:'admin',  status:'active',    mailboxes:7,  lastActive:'1 day ago',  signupDate:'Mar 30, 2026', loginCount:68,  daysInactive:1  },
  { id:'u14', name:'Mila Schwartz',     email:'mila@vortexhq.com',        initials:'MS', workspace:'VortexHQ',       plan:'Free',     role:'member', status:'invited',   mailboxes:0,  lastActive:'Never',      signupDate:'May 30, 2026', loginCount:0,   daysInactive:1  },
  { id:'u15', name:'Owen Blackwood',    email:'owen@novanet.io',          initials:'OB', workspace:'NovaNet',        plan:'Pro',      role:'admin',  status:'active',    mailboxes:6,  lastActive:'3 hr ago',   signupDate:'Jan 8, 2026',  loginCount:124, daysInactive:0  },
  { id:'u16', name:'Fatima Al-Rashid',  email:'fatima@pulseflow.ae',      initials:'FA', workspace:'PulseFlow',      plan:'Agency',   role:'admin',  status:'active',    mailboxes:21, lastActive:'Just now',   signupDate:'Nov 3, 2025',  loginCount:419, daysInactive:0  },
  { id:'u17', name:'Liam Brockton',     email:'liam@codeweave.dev',       initials:'LB', workspace:'CodeWeave',      plan:'Starter',  role:'member', status:'active',    mailboxes:1,  lastActive:'12 days ago',signupDate:'Apr 18, 2026', loginCount:5,   daysInactive:12 },
  { id:'u18', name:'Xiomara Cruz',      email:'xiomara@stealthmail.co',   initials:'XC', workspace:'StealthMail',    plan:'Pro',      role:'admin',  status:'active',    mailboxes:9,  lastActive:'20 min ago', signupDate:'Feb 25, 2026', loginCount:98,  daysInactive:0  },
];

// 30-day signups series
const SIGNUPS_30: number[] = [
  4, 6, 3, 8, 5, 7, 9, 4, 6, 11,
  8, 12, 10, 7, 9, 13, 11, 8, 14, 10,
  12, 9, 15, 11, 13, 8, 16, 12, 14, 18,
];
// 14-day slice
const SIGNUPS_14 = SIGNUPS_30.slice(16);

const DAY_LABELS_30 = Array.from({ length: 30 }, (_, i) => {
  const d = new Date('2026-05-02');
  d.setDate(d.getDate() + i);
  return `${d.getMonth() + 1}/${d.getDate()}`;
});
const DAY_LABELS_14 = DAY_LABELS_30.slice(16);

const SEED_EVENTS: FeedEvent[] = [
  { id:'e1',  type:'signup',  userName:'Mila Schwartz',     workspace:'VortexHQ',    plan:'Free',     ts:'just now' },
  { id:'e2',  type:'login',   userName:'Fatima Al-Rashid',  workspace:'PulseFlow',                    ts:'1 min ago' },
  { id:'e3',  type:'upgrade', userName:'Raj Patel',         workspace:'AlphaDeploy', plan:'Pro Plus', ts:'3 min ago' },
  { id:'e4',  type:'login',   userName:'Sophia Reeves',     workspace:'BrightWave',                   ts:'5 min ago' },
  { id:'e5',  type:'signup',  userName:'Aisha Mensah',      workspace:'CloudForte',  plan:'Pro Plus', ts:'8 min ago' },
  { id:'e6',  type:'login',   userName:'Yuki Tanaka',       workspace:'ZenithX',                      ts:'11 min ago'},
  { id:'e7',  type:'upgrade', userName:'Elena Volkov',      workspace:'SparkFrame',  plan:'Agency',   ts:'14 min ago'},
  { id:'e8',  type:'login',   userName:'Xiomara Cruz',      workspace:'StealthMail',                  ts:'19 min ago'},
];

const EVENT_TEMPLATES: Omit<FeedEvent, 'id' | 'ts'>[] = [
  { type:'signup',  userName:'Alex Morrison',   workspace:'MorphCloud',  plan:'Starter'  },
  { type:'login',   userName:'Laila Osei',      workspace:'DataBridge'                   },
  { type:'upgrade', userName:'Noel Watkins',    workspace:'ClearRoute',  plan:'Pro'      },
  { type:'signup',  userName:'Ines Dubois',     workspace:'NexusPoint',  plan:'Pro Plus' },
  { type:'login',   userName:'Kiran Shah',      workspace:'StrikeForce'                  },
  { type:'upgrade', userName:'Tyler Benson',    workspace:'CloudAnchor', plan:'Agency'   },
  { type:'invite',  userName:'Sam Kerr',        workspace:'FlowState',   plan:'Pro'      },
  { type:'login',   userName:'Amara Okonkwo',   workspace:'SkyLayer'                     },
];

// ─── Plan badge colors ────────────────────────────────────────────────────────

function planColor(plan: Plan): string {
  switch (plan) {
    case 'Agency':   return C.accent;
    case 'Pro Plus': return C.accent2;
    case 'Pro':      return C.success;
    case 'Starter':  return C.faint;
    case 'Free':     return C.ghost;
  }
}

function statusColor(status: Status): string {
  switch (status) {
    case 'active':    return C.success;
    case 'invited':   return C.warning;
    case 'suspended': return C.danger;
  }
}

function eventIcon(type: FeedEvent['type']): typeof UserPlus {
  switch (type) {
    case 'signup':  return UserPlus;
    case 'login':   return LogIn;
    case 'upgrade': return TrendingUp;
    case 'suspend': return Ban;
    case 'invite':  return Mail;
  }
}

function eventColor(type: FeedEvent['type']): string {
  switch (type) {
    case 'signup':  return C.success;
    case 'login':   return C.faint;
    case 'upgrade': return C.accent;
    case 'suspend': return C.danger;
    case 'invite':  return C.warning;
  }
}

// ─── Framer-motion variant presets ───────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0,  transition: { type: 'spring', stiffness: 260, damping: 26 } },
};

const feedRowVariants: Variants = {
  initial: { opacity: 0, x: -24, scale: 0.97 },
  animate: { opacity: 1, x: 0,   scale: 1,    transition: { type: 'spring', stiffness: 300, damping: 28 } },
  exit:    { opacity: 0, x: 24,  scale: 0.95, transition: { duration: 0.22 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show:   { opacity: 1, scale: 1,    transition: { type: 'spring', stiffness: 240, damping: 24 } },
};

// ─── Animated counter ─────────────────────────────────────────────────────────

function AnimatedCount({ to, duration = 1.2, prefix = '', suffix = '' }: {
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 20 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    mv.set(0);
    const ctrl = animate(mv, to, { duration, ease: 'easeOut' });
    const unsub = spring.on('change', (v) => setDisplay(Math.round(v)));
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [to, duration, mv, spring]);

  return <>{prefix}{display.toLocaleString()}{suffix}</>;
}

// ─── SVG Signups Chart ────────────────────────────────────────────────────────

function SignupsChart({ data, labels, range }: {
  data: number[];
  labels: string[];
  range: '14d' | '30d';
}) {
  const W = 480;
  const H = 120;
  const PAD = { top: 12, right: 16, bottom: 24, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data, 1);

  const points = data.map((v, i) => ({
    x: PAD.left + (i / (data.length - 1)) * innerW,
    y: PAD.top + innerH - (v / maxVal) * innerH,
    v,
    label: labels[i] ?? '',
  }));

  const linePath = points.reduce((acc, pt, i) => {
    if (i === 0) return `M${pt.x},${pt.y}`;
    const prev = points[i - 1];
    if (!prev) return acc;
    const cpx = (prev.x + pt.x) / 2;
    return `${acc} C${cpx},${prev.y} ${cpx},${pt.y} ${pt.x},${pt.y}`;
  }, '');

  const areaClose = `L${points[points.length - 1]?.x ?? 0},${PAD.top + innerH} L${PAD.left},${PAD.top + innerH} Z`;
  const areaPath = linePath + areaClose;

  const barW = Math.max(3, innerW / data.length - 4);

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const pathKey = `${range}-line`;
  const areaKey = `${range}-area`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="u4-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={C.accent}  stopOpacity="0.30" />
          <stop offset="100%" stopColor={C.accent}  stopOpacity="0.00" />
        </linearGradient>
        <linearGradient id="u4-bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={C.accent2} stopOpacity="0.55" />
          <stop offset="100%" stopColor={C.accent}  stopOpacity="0.15" />
        </linearGradient>
        <filter id="u4-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = PAD.top + innerH * (1 - t);
        return (
          <line
            key={t}
            x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y}
            stroke={C.borderSoft} strokeWidth={0.5}
          />
        );
      })}

      {/* Bars */}
      {points.map((pt, i) => {
        const barH = Math.max(2, (pt.v / maxVal) * innerH);
        const isHov = hoveredIdx === i;
        return (
          <motion.rect
            key={`${pathKey}-bar-${i}`}
            x={pt.x - barW / 2}
            y={PAD.top + innerH - barH}
            width={barW}
            height={barH}
            rx={2}
            fill={isHov ? C.accent2 : 'url(#u4-bar-grad)'}
            initial={{ scaleY: 0, originY: 1 }}
            animate={{ scaleY: 1 }}
            transition={{ type: 'spring', stiffness: 180, damping: 18, delay: i * 0.025 }}
            style={{ transformOrigin: `${pt.x}px ${PAD.top + innerH}px`, cursor: 'crosshair' }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        );
      })}

      {/* Area fill */}
      <motion.path
        key={areaKey}
        d={areaPath}
        fill="url(#u4-area-grad)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      />

      {/* Line */}
      <motion.path
        key={pathKey}
        d={linePath}
        fill="none"
        stroke={C.accent}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#u4-glow)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />

      {/* Hover dot + tooltip */}
      <AnimatePresence>
        {hoveredIdx !== null && points[hoveredIdx] !== undefined && (() => {
          const pt = points[hoveredIdx]!;
          const tipX = Math.min(pt.x + 6, W - 68);
          const tipY = pt.y - 36;
          return (
            <motion.g
              key="hover-dot"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <circle cx={pt.x} cy={pt.y} r={5} fill={C.accent} />
              <circle cx={pt.x} cy={pt.y} r={9} fill={C.accent} opacity={0.2} />
              <rect x={tipX} y={tipY} width={62} height={26} rx={6}
                fill="rgba(0,0,0,0.75)" stroke={C.border} />
              <text x={tipX + 31} y={tipY + 17} textAnchor="middle"
                fill={C.text} fontSize={11} fontWeight={700}>
                {pt.v} signups
              </text>
            </motion.g>
          );
        })()}
      </AnimatePresence>

      {/* X axis labels — show every Nth */}
      {labels.map((lbl, i) => {
        const step = data.length <= 14 ? 3 : 5;
        if (i % step !== 0 && i !== data.length - 1) return null;
        const pt = points[i];
        if (!pt) return null;
        return (
          <text
            key={`lbl-${i}`}
            x={pt.x} y={H - 4}
            textAnchor="middle"
            fill={C.faint}
            fontSize={9}
            fontFamily="inherit"
          >{lbl}</text>
        );
      })}
    </svg>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: string;
  msg: string;
  kind: 'success' | 'danger' | 'info';
}

function ToastStack({ toasts, remove }: { toasts: Toast[]; remove: (id: string) => void }) {
  return (
    <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.92 }}
            animate={{ opacity: 1, x: 0,  scale: 1    }}
            exit={{ opacity: 0, x: 60,  scale: 0.92  }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            style={{
              ...GLASS2,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              pointerEvents: 'auto',
              cursor: 'pointer',
              minWidth: 240,
              borderLeft: `3px solid ${t.kind === 'success' ? C.success : t.kind === 'danger' ? C.danger : C.accent}`,
            }}
            onClick={() => remove(t.id)}
          >
            {t.kind === 'success' && <CheckCircle2 size={14} color={C.success} />}
            {t.kind === 'danger'  && <AlertTriangle size={14} color={C.danger} />}
            {t.kind === 'info'    && <Zap size={14} color={C.accent} />}
            <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{t.msg}</span>
            <X size={12} color={C.faint} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Quick-action dropdown ─────────────────────────────────────────────────────

function ActionMenu({
  user,
  onAction,
}: {
  user: MockUser;
  onAction: (msg: string, kind: Toast['kind']) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const actions: { label: string; icon: typeof Shield; kind: Toast['kind']; msg: string }[] = [
    { label: 'Change plan',   icon: Star,      kind: 'info',    msg: `Plan change initiated for ${user.name}` },
    { label: 'Change role',   icon: Shield,    kind: 'info',    msg: `Role updated for ${user.name}` },
    { label: 'Resend invite', icon: Mail,      kind: 'success', msg: `Invite resent to ${user.email}` },
    { label: 'Suspend',       icon: Ban,       kind: 'danger',  msg: `${user.name} suspended` },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.12, backgroundColor: C.glass2 }}
        whileTap={{ scale: 0.90 }}
        style={{
          background: 'transparent',
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 8,
          padding: '4px 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          color: C.faint,
        }}
      >
        <MoreHorizontal size={14} />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1,   y: 0  }}
            exit={{ opacity: 0, scale: 0.9,   y: -6  }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{
              position: 'absolute',
              top: '110%',
              right: 0,
              zIndex: 100,
              ...GLASS2,
              minWidth: 162,
              overflow: 'hidden',
            }}
          >
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <motion.button
                  key={a.label}
                  onClick={() => { onAction(a.msg, a.kind); setOpen(false); }}
                  whileHover={{ backgroundColor: C.glass2 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 14px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: a.label === 'Suspend' ? C.danger : C.dim,
                    fontSize: 12,
                    textAlign: 'left',
                  }}
                >
                  <Icon size={12} />
                  {a.label}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmUsrU4Pulse() {
  const [range, setRange] = useState<'14d' | '30d'>('14d');
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState<Plan | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<Status | 'All'>('All');
  const [leaderMetric, setLeaderMetric] = useState<LeaderMetric>('activity');
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>(SEED_EVENTS);
  const [feedPaused, setFeedPaused] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [planFilterOpen, setPlanFilterOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);

  const addToast = useCallback((msg: string, kind: Toast['kind'] = 'success'): void => {
    const id = `t-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, msg, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Live feed simulation
  const feedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const templateIdxRef = useRef(0);

  useEffect(() => {
    if (feedPaused) {
      if (feedTimerRef.current) clearInterval(feedTimerRef.current);
      feedTimerRef.current = null;
      return;
    }
    feedTimerRef.current = setInterval(() => {
      const tmpl = EVENT_TEMPLATES[templateIdxRef.current % EVENT_TEMPLATES.length];
      if (!tmpl) return;
      templateIdxRef.current += 1;
      const newEvt: FeedEvent = {
        id: `live-${Date.now()}`,
        ts: 'just now',
        ...tmpl,
      };
      setFeedEvents((prev) => [newEvt, ...prev].slice(0, 12));
    }, 3200);

    return () => {
      if (feedTimerRef.current) clearInterval(feedTimerRef.current);
    };
  }, [feedPaused]);

  // KPI derived values
  const totalUsers = USERS.length;
  const newThisWeek = USERS.filter((u) => {
    const d = new Date(u.signupDate);
    return d >= new Date('2026-05-24');
  }).length;
  const activeToday = USERS.filter((u) => u.daysInactive === 0).length;
  const atRisk = USERS.filter((u) => u.daysInactive >= 7 || u.status === 'suspended').length;

  // Leaderboard ordering
  const leaderUsers = useMemo(() => {
    const copy = [...USERS];
    if (leaderMetric === 'activity') {
      copy.sort((a, b) => b.loginCount - a.loginCount);
    } else if (leaderMetric === 'newest') {
      copy.sort((a, b) => new Date(b.signupDate).getTime() - new Date(a.signupDate).getTime());
    } else {
      copy.sort((a, b) => b.daysInactive - a.daysInactive);
    }
    return copy.slice(0, 8);
  }, [leaderMetric]);

  // Filtered user table
  const filteredUsers = useMemo(() => {
    return USERS.filter((u) => {
      const q = search.toLowerCase();
      const matchQ = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.workspace.toLowerCase().includes(q);
      const matchPlan = filterPlan === 'All' || u.plan === filterPlan;
      const matchStatus = filterStatus === 'All' || u.status === filterStatus;
      return matchQ && matchPlan && matchStatus;
    });
  }, [search, filterPlan, filterStatus]);

  // Chart data
  const chartData = range === '14d' ? SIGNUPS_14 : SIGNUPS_30;
  const chartLabels = range === '14d' ? DAY_LABELS_14 : DAY_LABELS_30;

  const kpis = [
    { label: 'Total Users',   value: totalUsers,  icon: Users,      color: C.accent,   delta: +12.4, suffix: '' },
    { label: 'New This Week', value: newThisWeek,  icon: UserPlus,   color: C.success,  delta: +8.1,  suffix: '' },
    { label: 'Active Today',  value: activeToday,  icon: Activity,   color: C.accent2,  delta: +3.2,  suffix: '' },
    { label: 'At-Risk',       value: atRisk,       icon: AlertTriangle, color: C.danger, delta: -1,   suffix: '' },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: C.text, padding: '24px 28px', minHeight: '100vh', position: 'relative' }}>
      <ToastStack toasts={toasts} remove={removeToast} />

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' }}>
            Users
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: C.dim }}>
            Cross-workspace user activity — simulated live feed
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05, backgroundColor: C.accent }}
          whileTap={{ scale: 0.93 }}
          onClick={() => addToast('Refreshed user list', 'info')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: 'rgba(242,101,34,0.18)',
            border: `1px solid rgba(242,101,34,0.35)`,
            borderRadius: 10,
            cursor: 'pointer',
            color: C.accent2,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <RefreshCw size={13} />
          Refresh
        </motion.button>
      </motion.div>

      {/* ── KPI row ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}
      >
        {kpis.map((k) => {
          const Icon = k.icon;
          const up = k.delta >= 0;
          return (
            <motion.div
              key={k.label}
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              style={{ ...GLASS, padding: '18px 20px', cursor: 'default' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: `${k.color}22`,
                  border: `1px solid ${k.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} color={k.color} />
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 11, fontWeight: 600,
                  color: up ? C.success : C.danger,
                }}>
                  {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(k.delta)}%
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: C.text }}>
                <AnimatedCount to={k.value} duration={1.1} suffix={k.suffix} />
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 5, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {k.label}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Chart + Feed row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14, marginBottom: 20 }}>

        {/* Signups chart */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.25 }}
          style={{ ...GLASS, padding: '20px 22px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Signups Over Time</div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>New registrations per day</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['14d', '30d'] as const).map((r) => (
                <motion.button
                  key={r}
                  onClick={() => setRange(r)}
                  whileTap={{ scale: 0.92 }}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 8,
                    border: `1px solid ${range === r ? C.accent : C.borderSoft}`,
                    background: range === r ? `${C.accent}22` : 'transparent',
                    color: range === r ? C.accent2 : C.faint,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {r}
                </motion.button>
              ))}
            </div>
          </div>
          <div style={{ height: 130 }}>
            <SignupsChart key={range} data={chartData} labels={chartLabels} range={range} />
          </div>
        </motion.div>

        {/* Activity feed */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.32 }}
          style={{ ...GLASS, padding: '18px 20px', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: feedPaused ? C.faint : C.success,
                boxShadow: feedPaused ? 'none' : `0 0 8px ${C.success}`,
              }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Live Activity</span>
            </div>
            <motion.button
              onClick={() => setFeedPaused((v) => !v)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.90 }}
              style={{
                background: C.glass2,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 8,
                padding: '4px 8px',
                cursor: 'pointer',
                color: C.dim,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
              }}
            >
              {feedPaused ? <Play size={11} /> : <Pause size={11} />}
              {feedPaused ? 'Resume' : 'Pause'}
            </motion.button>
          </div>

          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <AnimatePresence mode="popLayout">
              {feedEvents.slice(0, 8).map((evt) => {
                const Icon = eventIcon(evt.type);
                const col = eventColor(evt.type);
                return (
                  <motion.div
                    key={evt.id}
                    variants={feedRowVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    layout
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '7px 0',
                      borderBottom: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: `${col}18`,
                      border: `1px solid ${col}33`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={12} color={col} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {evt.userName}
                        {evt.type === 'upgrade' && evt.plan && (
                          <span style={{ marginLeft: 5, fontSize: 10, color: C.accent2, fontWeight: 700 }}>
                            → {evt.plan}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>
                        {evt.workspace} · {evt.type}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: C.ghost, flexShrink: 0 }}>{evt.ts}</span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* ── Leaderboard ── */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.38 }}
        style={{ ...GLASS, padding: '20px 22px', marginBottom: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>User Leaderboard</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { id: 'activity' as LeaderMetric, label: 'Most Active' },
              { id: 'newest'   as LeaderMetric, label: 'Newest' },
              { id: 'at_risk'  as LeaderMetric, label: 'At Risk' },
            ]).map((m) => (
              <motion.button
                key={m.id}
                onClick={() => setLeaderMetric(m.id)}
                whileTap={{ scale: 0.92 }}
                style={{
                  padding: '4px 12px',
                  borderRadius: 8,
                  border: `1px solid ${leaderMetric === m.id ? C.accent : C.borderSoft}`,
                  background: leaderMetric === m.id ? `${C.accent}22` : 'transparent',
                  color: leaderMetric === m.id ? C.accent2 : C.faint,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </motion.button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <AnimatePresence mode="popLayout">
            {leaderUsers.map((u, idx) => {
              const metricVal = leaderMetric === 'activity'
                ? `${u.loginCount} logins`
                : leaderMetric === 'newest'
                ? u.signupDate
                : `${u.daysInactive}d inactive`;
              const metricColor = leaderMetric === 'at_risk'
                ? (u.daysInactive >= 7 ? C.danger : u.daysInactive >= 3 ? C.warning : C.faint)
                : C.faint;

              return (
                <motion.div
                  key={u.id}
                  layout
                  initial={{ opacity: 0, scale: 0.90 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.88 }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                  style={{
                    ...GLASS2,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {/* Rank + avatar row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 800, color: idx < 3 ? C.accent : C.ghost,
                      width: 16, textAlign: 'center',
                    }}>
                      #{idx + 1}
                    </div>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: `${planColor(u.plan)}22`,
                      border: `1px solid ${planColor(u.plan)}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, color: planColor(u.plan),
                      flexShrink: 0,
                    }}>
                      {u.initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                      <div style={{ fontSize: 10, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.workspace}</div>
                    </div>
                  </div>

                  {/* Plan + metric */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: planColor(u.plan),
                      background: `${planColor(u.plan)}18`,
                      border: `1px solid ${planColor(u.plan)}33`,
                      padding: '2px 6px', borderRadius: 5,
                    }}>
                      {u.plan}
                    </span>
                    <span style={{ fontSize: 10, color: metricColor, fontWeight: 600 }}>{metricVal}</span>
                  </div>

                  {/* Impersonate button */}
                  <motion.button
                    onClick={() => addToast(`Impersonating ${u.name} (${u.workspace})`, 'info')}
                    whileHover={{ scale: 1.04, backgroundColor: `${C.accent}33` }}
                    whileTap={{ scale: 0.93 }}
                    style={{
                      width: '100%',
                      padding: '7px 0',
                      background: `${C.accent}18`,
                      border: `1px solid ${C.accent}44`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      color: C.accent2,
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                    }}
                  >
                    <Zap size={11} />
                    Enter as User
                  </motion.button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ── Search & filter bar ── */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.44 }}
        style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}
      >
        {/* Search */}
        <div style={{
          flex: 1, minWidth: 220,
          display: 'flex', alignItems: 'center', gap: 8,
          ...GLASS2,
          padding: '9px 14px',
        }}>
          <Search size={14} color={C.faint} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users, email, workspace…"
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: C.text,
              fontSize: 13,
              flex: 1,
            }}
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, padding: 0, display: 'flex' }}
              >
                <X size={13} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Plan filter */}
        <div style={{ position: 'relative' }}>
          <motion.button
            onClick={() => { setPlanFilterOpen((v) => !v); setStatusFilterOpen(false); }}
            whileTap={{ scale: 0.93 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              ...GLASS2,
              padding: '9px 14px',
              cursor: 'pointer',
              color: filterPlan !== 'All' ? C.accent2 : C.dim,
              fontSize: 12, fontWeight: 600, border: `1px solid ${filterPlan !== 'All' ? C.accent + '66' : C.border}`,
            }}
          >
            <Star size={12} />
            {filterPlan === 'All' ? 'All Plans' : filterPlan}
            <ChevronDown size={11} />
          </motion.button>
          <AnimatePresence>
            {planFilterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                style={{ position: 'absolute', top: '110%', left: 0, zIndex: 90, ...GLASS2, minWidth: 130, overflow: 'hidden' }}
              >
                {(['All', 'Free', 'Starter', 'Pro', 'Pro Plus', 'Agency'] as const).map((p) => (
                  <motion.button
                    key={p}
                    onClick={() => { setFilterPlan(p); setPlanFilterOpen(false); }}
                    whileHover={{ backgroundColor: C.glass2 }}
                    style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: filterPlan === p ? C.accent2 : C.dim, fontSize: 12, textAlign: 'left', fontWeight: filterPlan === p ? 700 : 400 }}
                  >
                    {p}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Status filter */}
        <div style={{ position: 'relative' }}>
          <motion.button
            onClick={() => { setStatusFilterOpen((v) => !v); setPlanFilterOpen(false); }}
            whileTap={{ scale: 0.93 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              ...GLASS2,
              padding: '9px 14px',
              cursor: 'pointer',
              color: filterStatus !== 'All' ? C.accent2 : C.dim,
              fontSize: 12, fontWeight: 600, border: `1px solid ${filterStatus !== 'All' ? C.accent + '66' : C.border}`,
            }}
          >
            <Activity size={12} />
            {filterStatus === 'All' ? 'All Status' : filterStatus}
            <ChevronDown size={11} />
          </motion.button>
          <AnimatePresence>
            {statusFilterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                style={{ position: 'absolute', top: '110%', left: 0, zIndex: 90, ...GLASS2, minWidth: 130, overflow: 'hidden' }}
              >
                {(['All', 'active', 'invited', 'suspended'] as const).map((s) => (
                  <motion.button
                    key={s}
                    onClick={() => { setFilterStatus(s); setStatusFilterOpen(false); }}
                    whileHover={{ backgroundColor: C.glass2 }}
                    style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: filterStatus === s ? C.accent2 : C.dim, fontSize: 12, textAlign: 'left', fontWeight: filterStatus === s ? 700 : 400 }}
                  >
                    {s === 'All' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span style={{ fontSize: 11, color: C.ghost, marginLeft: 4 }}>
          {filteredUsers.length} of {USERS.length} users
        </span>
      </motion.div>

      {/* ── User table ── */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.5 }}
        style={{ ...GLASS, overflow: 'hidden' }}
      >
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1.2fr 1fr 1fr 80px 100px 80px 120px',
          padding: '10px 20px',
          borderBottom: `1px solid ${C.borderSoft}`,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: C.faint,
        }}>
          <span>User</span>
          <span>Workspace</span>
          <span>Plan</span>
          <span>Status</span>
          <span>MBX</span>
          <span>Last Active</span>
          <span>Joined</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>

        {/* Table rows */}
        <AnimatePresence initial={false}>
          {filteredUsers.map((u, idx) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26, delay: idx * 0.02 }}
              whileHover={{ backgroundColor: C.glass2 }}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 1fr 1fr 80px 100px 80px 120px',
                padding: '12px 20px',
                borderBottom: `1px solid ${C.borderSoft}`,
                alignItems: 'center',
              }}
            >
              {/* User */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: `${planColor(u.plan)}22`,
                  border: `1px solid ${planColor(u.plan)}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: planColor(u.plan), flexShrink: 0,
                }}>
                  {u.initials}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>{u.email}</div>
                </div>
              </div>

              {/* Workspace */}
              <span style={{ fontSize: 12, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.workspace}</span>

              {/* Plan */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: planColor(u.plan),
                background: `${planColor(u.plan)}18`,
                border: `1px solid ${planColor(u.plan)}33`,
                padding: '3px 8px', borderRadius: 5,
                width: 'fit-content',
              }}>
                {u.plan}
              </span>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: statusColor(u.status),
                  boxShadow: u.status === 'active' ? `0 0 6px ${C.success}` : 'none',
                }} />
                <span style={{ fontSize: 11, color: statusColor(u.status), fontWeight: 600, textTransform: 'capitalize' }}>{u.status}</span>
              </div>

              {/* Mailboxes */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Mail size={11} color={C.faint} />
                <span style={{ fontSize: 12, color: C.dim }}>{u.mailboxes}</span>
              </div>

              {/* Last active */}
              <span style={{ fontSize: 11, color: u.daysInactive >= 7 ? C.danger : u.daysInactive >= 3 ? C.warning : C.dim }}>
                {u.lastActive}
              </span>

              {/* Joined */}
              <span style={{ fontSize: 11, color: C.faint }}>{u.signupDate.split(',')[0]}</span>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <motion.button
                  onClick={() => addToast(`Impersonating ${u.name}`, 'info')}
                  whileHover={{ scale: 1.06, backgroundColor: `${C.accent}33` }}
                  whileTap={{ scale: 0.91 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '5px 10px',
                    background: `${C.accent}18`,
                    border: `1px solid ${C.accent}44`,
                    borderRadius: 7,
                    cursor: 'pointer',
                    color: C.accent2,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  <Zap size={10} />
                  Enter
                </motion.button>
                <ActionMenu user={u} onAction={addToast} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredUsers.length === 0 && (
          <div style={{ padding: '36px 0', textAlign: 'center', color: C.faint, fontSize: 13 }}>
            No users match your filter.
          </div>
        )}
      </motion.div>

      {/* Bottom spacer */}
      <div style={{ height: 32 }} />
    </div>
  );
}
