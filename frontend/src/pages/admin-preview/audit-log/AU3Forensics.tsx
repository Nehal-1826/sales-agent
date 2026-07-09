/**
 * Admin Audit Log Design Candidate: AU3 Forensics
 *
 * "Forensics" — the forensic overview of the entire audit trail.
 * Activity heatmap (7×24 day/hour grid with staggered cell entrance + hover tooltip),
 * animated action-type breakdown (hand-built SVG donut with strokeDasharray spring),
 * actor leaderboard with FLIP reorder by metric (events / destructive / last-seen),
 * and a click-to-drill filtered event list that slides in with AnimatePresence.
 *
 * Framer-motion techniques:
 *   - staggerChildren on heatmap cells (staggered fill + scale entrance)
 *   - useMotionValue + animate() for animated KPI counters (cleaned up on unmount)
 *   - motion.circle strokeDashoffset spring for donut slices
 *   - layout="position" FLIP for actor leaderboard reorder
 *   - AnimatePresence for drill-in event list (slide + fade)
 *   - whileHover / whileTap on interactive cells, cards, buttons
 *   - motion.div for bar chart rows with spring width
 *
 * Self-contained: inline style={{}} only. No API / react-query / @/features / @/lib/api.
 * Only @/lib/format is used from @/. Mock data only.
 * Aurora Glass dark palette. Warm orange ramp for heatmap intensity.
 * NO purple / violet / blue / teal / cyan / indigo / pink. No random hsl().
 * DD/MM/YYYY via formatDate / formatDateTime from @/lib/format.
 * Build-safe: no unused imports/vars, every array index guarded, no bare any, Variants typed.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  ShieldAlert,
  Users,
  Clock,
  Activity,
  ChevronDown,
  X,
  Search,
  Filter,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  LogIn,
  Settings,
  UserX,
  UserCheck,
  CreditCard,
  Server,
  Cpu,
  RotateCcw,
  Minus,
} from 'lucide-react';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.40)' as const,
  ghost: 'rgba(255,255,255,0.22)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.20)' as const,
  accentGlow: 'rgba(242,101,34,0.40)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.14)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.14)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.14)' as const,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
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
    borderRadius: 18,
  } as CSSProperties,
} as const;

// ─── Heatmap intensity color ramp (dim → bright warm orange) ─────────────────
function heatColor(count: number, max: number): string {
  if (count === 0) return 'rgba(255,255,255,0.04)';
  const t = Math.min(count / max, 1);
  // warm ramp: near-black → deep rust → accent → bright orange
  if (t < 0.25) return `rgba(120,40,10,${0.25 + t * 1.5})`;
  if (t < 0.55) return `rgba(180,70,20,${0.45 + t})`;
  if (t < 0.80) return `rgba(220,100,30,${0.60 + t * 0.4})`;
  return `rgba(242,101,34,${0.80 + t * 0.20})`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ActionType =
  | 'user.suspend'
  | 'user.impersonate'
  | 'plan.update'
  | 'peer.deactivate'
  | 'pool.assign'
  | 'sequence.pause'
  | 'payment.export'
  | 'settings.update'
  | 'llm.cap_update'
  | 'login';

type ActorRole = 'super_admin' | 'admin' | 'system';

type LeaderboardMetric = 'events' | 'destructive' | 'last_seen';

interface AuditEvent {
  id: string;
  actor_email: string;
  actor_role: ActorRole;
  action: ActionType;
  target: string;
  timestamp: string; // ISO
  ip: string;
  destructive: boolean;
}

interface Actor {
  email: string;
  role: ActorRole;
  events: number;
  destructive: number;
  last_seen: string; // ISO
  initials: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

// 7 days × 24 hours heatmap counts
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Deterministic heatmap: heavier during IST business hours (UTC 3:30–14:30), lighter on weekends
const HEATMAP_DATA: number[][] = DAYS.map((_, d) =>
  HOURS.map((_, h) => {
    // Pseudo-deterministic based on position
    const base = ((d * 7 + h * 3) % 13) + ((d * 11 + h * 5) % 7);
    const isWeekday = d < 5;
    const isBusinessHour = h >= 4 && h <= 14;
    const isLateNight = h >= 22 || h < 3;
    if (!isWeekday && isLateNight) return 0;
    if (isWeekday && isBusinessHour) return (base % 18) + 4;
    if (isWeekday && !isBusinessHour) return base % 6;
    if (!isWeekday && isBusinessHour) return (base % 8) + 1;
    return base % 3;
  }),
);

const HEATMAP_MAX = Math.max(...HEATMAP_DATA.flatMap((row) => row));

// Total events per day
const DAY_TOTALS = HEATMAP_DATA.map((row) => row.reduce((a, b) => a + b, 0));

// Action-type distribution
interface ActionDist {
  action: ActionType;
  count: number;
  destructive: boolean;
}
const ACTION_DIST: ActionDist[] = [
  { action: 'login',           count: 312, destructive: false },
  { action: 'settings.update', count: 88,  destructive: false },
  { action: 'plan.update',     count: 54,  destructive: false },
  { action: 'llm.cap_update',  count: 41,  destructive: false },
  { action: 'pool.assign',     count: 38,  destructive: false },
  { action: 'payment.export',  count: 29,  destructive: false },
  { action: 'sequence.pause',  count: 22,  destructive: true  },
  { action: 'peer.deactivate', count: 17,  destructive: true  },
  { action: 'user.suspend',    count: 14,  destructive: true  },
  { action: 'user.impersonate',count: 9,   destructive: true  },
];
const ACTION_TOTAL = ACTION_DIST.reduce((a, b) => a + b.count, 0);

// Actor leaderboard
const ACTORS: Actor[] = [
  { email: 'admin@warmpulse.app',    role: 'super_admin', events: 284, destructive: 18, last_seen: '2026-05-31T10:42:00Z', initials: 'AD' },
  { email: 'ops@warmpulse.app',      role: 'admin',       events: 197, destructive: 6,  last_seen: '2026-05-31T09:14:00Z', initials: 'OP' },
  { email: 'system',                 role: 'system',      events: 160, destructive: 12, last_seen: '2026-05-31T10:58:00Z', initials: 'SY' },
  { email: 'devesh@warmpulse.app',   role: 'super_admin', events: 118, destructive: 4,  last_seen: '2026-05-30T15:22:00Z', initials: 'DV' },
  { email: 'support@warmpulse.app',  role: 'admin',       events: 53,  destructive: 1,  last_seen: '2026-05-29T11:30:00Z', initials: 'SP' },
  { email: 'monitor@warmpulse.app',  role: 'system',      events: 12,  destructive: 0,  last_seen: '2026-05-28T08:05:00Z', initials: 'MN' },
];

// 18 sample events
const SAMPLE_EVENTS: AuditEvent[] = [
  { id: 'evt_001', actor_email: 'admin@warmpulse.app',   actor_role: 'super_admin', action: 'user.impersonate',  target: 'jin@arclamp.co',          timestamp: '2026-05-31T10:42:00Z', ip: '49.32.21.144',   destructive: true  },
  { id: 'evt_002', actor_email: 'ops@warmpulse.app',     actor_role: 'admin',       action: 'plan.update',       target: 'Growth · ₹6490 → ₹7290',  timestamp: '2026-05-31T10:12:00Z', ip: '49.32.21.144',   destructive: false },
  { id: 'evt_003', actor_email: 'system',                actor_role: 'system',      action: 'peer.deactivate',   target: 'pulse.warm.12@gmail.com',  timestamp: '2026-05-31T09:55:00Z', ip: '127.0.0.1',      destructive: true  },
  { id: 'evt_004', actor_email: 'admin@warmpulse.app',   actor_role: 'super_admin', action: 'user.suspend',      target: 'bad_actor@domain.io',      timestamp: '2026-05-31T09:30:00Z', ip: '49.32.21.144',   destructive: true  },
  { id: 'evt_005', actor_email: 'devesh@warmpulse.app',  actor_role: 'super_admin', action: 'pool.assign',       target: 'Acme Corp → Pool-B',       timestamp: '2026-05-31T08:44:00Z', ip: '103.21.58.22',   destructive: false },
  { id: 'evt_006', actor_email: 'ops@warmpulse.app',     actor_role: 'admin',       action: 'llm.cap_update',    target: 'Starter +100k tokens',     timestamp: '2026-05-31T08:20:00Z', ip: '49.32.21.144',   destructive: false },
  { id: 'evt_007', actor_email: 'admin@warmpulse.app',   actor_role: 'super_admin', action: 'settings.update',   target: 'SMTP retry limit → 5',     timestamp: '2026-05-31T07:55:00Z', ip: '49.32.21.144',   destructive: false },
  { id: 'evt_008', actor_email: 'support@warmpulse.app', actor_role: 'admin',       action: 'payment.export',    target: 'May 2026 ledger CSV',      timestamp: '2026-05-31T07:10:00Z', ip: '103.21.58.22',   destructive: false },
  { id: 'evt_009', actor_email: 'system',                actor_role: 'system',      action: 'sequence.pause',    target: 'seqid-4421 (rate-limit)',  timestamp: '2026-05-30T22:12:00Z', ip: '127.0.0.1',      destructive: true  },
  { id: 'evt_010', actor_email: 'admin@warmpulse.app',   actor_role: 'super_admin', action: 'login',             target: 'admin@warmpulse.app',      timestamp: '2026-05-30T17:05:00Z', ip: '49.32.21.144',   destructive: false },
  { id: 'evt_011', actor_email: 'devesh@warmpulse.app',  actor_role: 'super_admin', action: 'plan.update',       target: 'Agency · seats 10 → 15',   timestamp: '2026-05-30T15:22:00Z', ip: '103.21.58.22',   destructive: false },
  { id: 'evt_012', actor_email: 'ops@warmpulse.app',     actor_role: 'admin',       action: 'settings.update',   target: 'Peer health threshold 0.3',timestamp: '2026-05-30T14:11:00Z', ip: '49.32.21.144',   destructive: false },
  { id: 'evt_013', actor_email: 'system',                actor_role: 'system',      action: 'peer.deactivate',   target: 'pulse.warm.07@outlook.com',timestamp: '2026-05-30T12:44:00Z', ip: '127.0.0.1',      destructive: true  },
  { id: 'evt_014', actor_email: 'admin@warmpulse.app',   actor_role: 'super_admin', action: 'llm.cap_update',    target: 'Pro Plus +250k tokens',    timestamp: '2026-05-30T11:33:00Z', ip: '49.32.21.144',   destructive: false },
  { id: 'evt_015', actor_email: 'support@warmpulse.app', actor_role: 'admin',       action: 'pool.assign',       target: 'NimbleReach → Pool-A',     timestamp: '2026-05-29T11:30:00Z', ip: '103.21.58.22',   destructive: false },
  { id: 'evt_016', actor_email: 'ops@warmpulse.app',     actor_role: 'admin',       action: 'user.suspend',      target: 'spammer@blacklist.io',     timestamp: '2026-05-29T09:58:00Z', ip: '49.32.21.144',   destructive: true  },
  { id: 'evt_017', actor_email: 'devesh@warmpulse.app',  actor_role: 'super_admin', action: 'payment.export',    target: 'Q1 2026 full export',      timestamp: '2026-05-28T16:20:00Z', ip: '103.21.58.22',   destructive: false },
  { id: 'evt_018', actor_email: 'monitor@warmpulse.app', actor_role: 'system',      action: 'login',             target: 'monitor@warmpulse.app',    timestamp: '2026-05-28T08:05:00Z', ip: '127.0.0.1',      destructive: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function actionIcon(action: ActionType): typeof LogIn {
  switch (action) {
    case 'login':            return LogIn;
    case 'user.suspend':     return UserX;
    case 'user.impersonate': return UserCheck;
    case 'plan.update':      return CreditCard;
    case 'peer.deactivate':  return Server;
    case 'pool.assign':      return RotateCcw;
    case 'sequence.pause':   return Minus;
    case 'payment.export':   return ArrowUpRight;
    case 'settings.update':  return Settings;
    case 'llm.cap_update':   return Cpu;
    default:                 return Activity;
  }
}

function actionColor(action: ActionType, destructive: boolean): string {
  if (destructive) {
    if (action === 'user.impersonate') return T.danger;
    if (action === 'user.suspend')     return T.danger;
    return T.warning;
  }
  if (action === 'login') return T.success;
  return T.faint;
}

function roleColor(role: ActorRole): string {
  if (role === 'super_admin') return T.accent;
  if (role === 'admin')       return T.accentLight;
  return T.ghost;
}

function rolePill(role: ActorRole): string {
  if (role === 'super_admin') return 'super_admin';
  if (role === 'admin')       return 'admin';
  return 'system';
}

// ─── Animated counter hook ────────────────────────────────────────────────────
function useAnimatedCounter(target: number, duration = 1.2): MutableRefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement | null>(null);
  const mv = useMotionValue(0);

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (ref.current) {
          ref.current.textContent = formatNumber(Math.round(v));
        }
      },
    });
    return () => ctrl.stop();
  }, [mv, target, duration]);

  return ref;
}

// ─── Framer-motion variants ────────────────────────────────────────────────────
const cellContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.004,
      delayChildren: 0.15,
    },
  },
};

const cellVariants: Variants = {
  hidden: { opacity: 0, scale: 0.3 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

const listContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.05 },
  },
};

const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 26 },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.18 },
  },
};

const drillPanelVariants: Variants = {
  hidden: { opacity: 0, x: 32, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 28 },
  },
  exit: {
    opacity: 0,
    x: 32,
    scale: 0.97,
    transition: { duration: 0.22, ease: 'easeIn' },
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// Animated KPI card
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  delay,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  sub: string;
  accent?: string;
  delay?: number;
}) {
  const ref = useAnimatedCounter(value);

  return (
    <motion.div
      style={{
        ...T.glass,
        padding: '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: '1 1 180px',
        minWidth: 140,
        cursor: 'default',
      }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay ?? 0, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ scale: 1.02, transition: { duration: 0.18 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: accent ?? T.dim }}>
        <Icon size={14} strokeWidth={2.2} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.faint }}>
          {label}
        </span>
      </div>
      <span
        ref={ref}
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: accent ?? T.text,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        0
      </span>
      <span style={{ fontSize: 11, color: T.faint }}>{sub}</span>
    </motion.div>
  );
}

// Heatmap tooltip
function HeatTooltip({
  day,
  hour,
  count,
  x,
  y,
}: {
  day: string;
  hour: number;
  count: number;
  x: number;
  y: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 4 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed',
        left: x + 10,
        top: y - 44,
        ...T.glassTight,
        padding: '6px 10px',
        fontSize: 11,
        color: T.text,
        pointerEvents: 'none',
        zIndex: 1000,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{ color: T.accent, fontWeight: 700 }}>{count}</span>
      <span style={{ color: T.dim }}> events · {day} {String(hour).padStart(2, '0')}:00–{String(hour + 1).padStart(2, '0')}:00</span>
    </motion.div>
  );
}

// Actor avatar
function ActorAvatar({ email, role, initials, size = 28 }: { email: string; role: ActorRole; initials: string; size?: number }) {
  void email; // used for key identity
  const bg = role === 'super_admin'
    ? `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`
    : role === 'admin'
    ? 'linear-gradient(135deg, rgba(255,138,75,0.8), rgba(200,90,30,0.9))'
    : 'rgba(255,255,255,0.12)';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.34,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
        border: `1.5px solid rgba(255,255,255,0.15)`,
      }}
    >
      {initials}
    </div>
  );
}

// Event row in drill-in list
function EventRow({ event }: { event: AuditEvent }) {
  const Icon = actionIcon(event.action);
  const color = actionColor(event.action, event.destructive);
  const actor = ACTORS.find((a) => a.email === event.actor_email) ?? {
    email: event.actor_email,
    role: event.actor_role,
    initials: event.actor_email.slice(0, 2).toUpperCase(),
    events: 0,
    destructive: 0,
    last_seen: event.timestamp,
  };

  return (
    <motion.div
      variants={listItemVariants}
      layout="position"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 16px',
        borderBottom: `1px solid ${T.hairline}`,
        cursor: 'default',
      }}
      whileHover={{
        background: 'rgba(255,255,255,0.04)',
        transition: { duration: 0.12 },
      }}
    >
      {/* Icon badge */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: event.destructive ? T.dangerDim : T.accentDim,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <Icon size={14} strokeWidth={2.2} color={color} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{event.action}</span>
          {event.destructive && (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: T.danger,
              background: T.dangerDim,
              padding: '2px 6px',
              borderRadius: 4,
            }}>
              destructive
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.dim, marginTop: 3 }}>
          → {event.target}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
          <ActorAvatar email={actor.email} role={actor.role} initials={actor.initials} size={18} />
          <span style={{ fontSize: 11, color: T.faint }}>{event.actor_email}</span>
          <span style={{ color: T.hairline }}>·</span>
          <span style={{ fontSize: 11, color: T.faint }}>{formatDateTime(event.timestamp)}</span>
          <span style={{ color: T.hairline }}>·</span>
          <span style={{ fontSize: 10, color: T.ghost, fontFamily: 'monospace' }}>{event.ip}</span>
          <span style={{ color: T.hairline }}>·</span>
          <span style={{ fontSize: 10, color: T.ghost, fontFamily: 'monospace' }}>{event.id}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Animated donut chart (hand-built SVG) ────────────────────────────────────
const DONUT_R = 52;
const DONUT_C = 2 * Math.PI * DONUT_R;

function DonutChart({ data, activeAction }: { data: ActionDist[]; activeAction: ActionType | null }) {
  let offset = 0;
  const segments = data.map((d) => {
    const pct = d.count / ACTION_TOTAL;
    const seg = { ...d, pct, offset };
    offset += pct;
    return seg;
  });

  const colors = [
    T.success, T.accentLight, T.accent, '#f5a623', '#e07b39',
    '#c85f28', T.danger, '#ff7a5c', '#ff5c7a', '#d63a5a',
  ];

  return (
    <svg viewBox="0 0 140 140" width={140} height={140} style={{ overflow: 'visible' }}>
      <circle cx={70} cy={70} r={DONUT_R} fill="none" stroke={T.hairline} strokeWidth={16} />
      {segments.map((seg, i) => {
        const isActive = activeAction === null || seg.action === activeAction;
        const dash = seg.pct * DONUT_C;
        const rotation = seg.offset * 360 - 90;
        const color = colors[i % colors.length] ?? T.accent;

        return (
          <motion.circle
            key={seg.action}
            cx={70}
            cy={70}
            r={DONUT_R}
            fill="none"
            stroke={isActive ? color : 'rgba(255,255,255,0.06)'}
            strokeWidth={isActive ? 18 : 12}
            strokeDasharray={`${dash} ${DONUT_C}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '70px 70px' }}
            initial={{ strokeDasharray: `0 ${DONUT_C}`, opacity: 0 }}
            animate={{
              strokeDasharray: `${dash} ${DONUT_C - dash}`,
              opacity: 1,
              strokeWidth: isActive ? 18 : 12,
            }}
            transition={{
              strokeDasharray: { delay: 0.2 + i * 0.06, duration: 0.9, ease: [0.22, 1, 0.36, 1] },
              opacity: { delay: 0.15 + i * 0.06, duration: 0.4 },
              strokeWidth: { type: 'spring', stiffness: 300, damping: 24 },
            }}
          />
        );
      })}
      {/* Center label */}
      <text x={70} y={66} textAnchor="middle" fill={T.text} fontSize={22} fontWeight={700} fontFamily="system-ui">
        {formatNumber(ACTION_TOTAL)}
      </text>
      <text x={70} y={82} textAnchor="middle" fill={T.faint} fontSize={10} fontFamily="system-ui">
        total events
      </text>
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function AdmAudAU3Forensics() {
  // Drill-in filter state
  type DrillFilter =
    | { type: 'heatmap'; day: number; hour: number }
    | { type: 'action'; action: ActionType }
    | { type: 'actor'; email: string }
    | null;

  const [drillFilter, setDrillFilter] = useState<DrillFilter>(null);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [leaderMetric, setLeaderMetric] = useState<LeaderboardMetric>('events');
  const [searchQ, setSearchQ] = useState('');
  const [tooltipState, setTooltipState] = useState<{ day: number; hour: number; x: number; y: number } | null>(null);

  // Heatmap hover handlers
  const handleCellEnter = useCallback((e: React.MouseEvent, d: number, h: number) => {
    setTooltipState({ day: d, hour: h, x: e.clientX, y: e.clientY });
  }, []);
  const handleCellLeave = useCallback(() => setTooltipState(null), []);

  // Leaderboard sorted actors
  const sortedActors = [...ACTORS].sort((a, b) => {
    if (leaderMetric === 'events') return b.events - a.events;
    if (leaderMetric === 'destructive') return b.destructive - a.destructive;
    return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
  });
  const leaderMax = sortedActors[0]
    ? leaderMetric === 'events'
      ? sortedActors[0].events
      : leaderMetric === 'destructive'
      ? Math.max(...ACTORS.map((a) => a.destructive), 1)
      : 1
    : 1;

  // Filter events for drill
  const filteredEvents = SAMPLE_EVENTS.filter((ev) => {
    if (drillFilter === null) return true;
    if (drillFilter.type === 'action') return ev.action === drillFilter.action;
    if (drillFilter.type === 'actor') return ev.actor_email === drillFilter.email;
    if (drillFilter.type === 'heatmap') {
      const d = new Date(ev.timestamp);
      const dayIdx = (d.getUTCDay() + 6) % 7; // Mon=0
      const hourIdx = d.getUTCHours();
      return dayIdx === drillFilter.day && hourIdx === drillFilter.hour;
    }
    return true;
  }).filter((ev) => {
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return ev.action.includes(q) || ev.actor_email.includes(q) || ev.target.toLowerCase().includes(q);
  });

  // KPI values
  const totalEvents = ACTION_TOTAL;
  const destructiveCount = SAMPLE_EVENTS.filter((e) => e.destructive).length;
  const distinctActors = new Set(SAMPLE_EVENTS.map((e) => e.actor_email)).size;
  const peakHour = HOURS.reduce((best, h) => {
    const sum = HEATMAP_DATA.reduce((s, row) => s + (row[h] ?? 0), 0);
    const bestSum = HEATMAP_DATA.reduce((s, row) => s + (row[best] ?? 0), 0);
    return sum > bestSum ? h : best;
  }, 0);

  // Donut legend colors
  const donutColors = [
    T.success, T.accentLight, T.accent, '#f5a623', '#e07b39',
    '#c85f28', T.danger, '#ff7a5c', '#ff5c7a', '#d63a5a',
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0e0a05 0%, #1a0f06 40%, #120c04 100%)',
        color: T.text,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        padding: '28px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Atmospheric aurora glow */}
      <div style={{
        position: 'fixed',
        top: -120,
        right: -120,
        width: 480,
        height: 480,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(242,101,34,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'fixed',
        bottom: -80,
        left: -80,
        width: 360,
        height: 360,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,92,122,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto' }}>

        {/* ── Page header ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: 28 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <ShieldAlert size={14} strokeWidth={2.2} color={T.accent} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint }}>
              Admin · Audit Log
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: T.text, letterSpacing: '-0.02em' }}>
                Forensics
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: T.dim }}>
                Activity heatmap · Action breakdown · Actor leaderboard · Last 7 days · {formatDate('2026-05-25')} – {formatDate('2026-05-31')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  ...T.glassTight,
                  padding: '8px 14px',
                  fontSize: 12,
                  color: T.dim,
                  border: `1px solid ${T.hairline}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Filter size={12} strokeWidth={2.2} />
                Filter
                <ChevronDown size={11} strokeWidth={2.2} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  borderRadius: 10,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                Export CSV
                <ArrowUpRight size={12} strokeWidth={2.4} />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* ── KPI strip ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard icon={Activity}     label="Total Events"      value={totalEvents}      sub="last 7 days"           accent={T.accent}   delay={0.05} />
          <KpiCard icon={AlertTriangle} label="Destructive"      value={destructiveCount} sub="high-risk actions"      accent={T.danger}   delay={0.10} />
          <KpiCard icon={Users}        label="Distinct Actors"   value={distinctActors}   sub="unique principals"      accent={T.accentLight} delay={0.15} />
          <KpiCard icon={Clock}        label="Peak Hour"         value={peakHour}         sub={`${peakHour}:00–${peakHour + 1}:00 UTC`} accent={T.warning} delay={0.20} />
        </div>

        {/* ── Main grid: heatmap (top-full) + breakdown+leaderboard (bottom-split) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Activity Heatmap */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            style={{ ...T.glass, padding: '20px 24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Flame size={13} strokeWidth={2.2} color={T.accent} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Activity Heatmap</span>
                </div>
                <p style={{ fontSize: 11, color: T.faint, margin: '2px 0 0' }}>
                  Events by day × hour (UTC) · click a cell to drill in
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: T.ghost }}>low</span>
                {[0.1, 0.3, 0.55, 0.78, 1.0].map((t, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: heatColor(Math.round(t * HEATMAP_MAX), HEATMAP_MAX) }} />
                ))}
                <span style={{ fontSize: 10, color: T.ghost }}>high</span>
              </div>
            </div>

            {/* Hour labels */}
            <div style={{ display: 'flex', marginLeft: 36, marginBottom: 4, gap: 0 }}>
              {HOURS.map((h) => (
                <div key={h} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: h % 6 === 0 ? T.ghost : 'transparent', fontVariantNumeric: 'tabular-nums' }}>
                  {h % 6 === 0 ? String(h).padStart(2, '0') : ''}
                </div>
              ))}
            </div>

            {/* Grid */}
            <motion.div
              variants={cellContainerVariants}
              initial="hidden"
              animate="visible"
              style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
            >
              {DAYS.map((day, d) => (
                <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 28, fontSize: 10, color: T.faint, textAlign: 'right', flexShrink: 0 }}>
                    {day}
                  </span>
                  <div style={{ display: 'flex', flex: 1, gap: 2 }}>
                    {HOURS.map((h) => {
                      const count = HEATMAP_DATA[d]?.[h] ?? 0;
                      const isActive =
                        drillFilter?.type === 'heatmap' &&
                        drillFilter.day === d &&
                        drillFilter.hour === h;

                      return (
                        <motion.div
                          key={h}
                          variants={cellVariants}
                          onClick={() =>
                            setDrillFilter(
                              isActive ? null : { type: 'heatmap', day: d, hour: h },
                            )
                          }
                          onMouseEnter={(e) => handleCellEnter(e, d, h)}
                          onMouseLeave={handleCellLeave}
                          style={{
                            flex: 1,
                            height: 20,
                            borderRadius: 3,
                            background: heatColor(count, HEATMAP_MAX),
                            cursor: count > 0 ? 'pointer' : 'default',
                            outline: isActive ? `2px solid ${T.accent}` : 'none',
                            outlineOffset: 1,
                          }}
                          whileHover={count > 0 ? {
                            scale: 1.3,
                            zIndex: 10,
                            transition: { duration: 0.12 },
                          } : {}}
                          whileTap={count > 0 ? { scale: 0.9 } : {}}
                        />
                      );
                    })}
                  </div>
                  {/* Day total spark */}
                  <span style={{ width: 26, fontSize: 9, color: T.ghost, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {DAY_TOTALS[d] ?? 0}
                  </span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Bottom row: Action breakdown + Actor leaderboard */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

            {/* Action-type breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{ ...T.glass, padding: '20px 24px', flex: '1 1 360px', minWidth: 300 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
                <Activity size={13} strokeWidth={2.2} color={T.accentLight} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Action Breakdown</span>
              </div>

              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                {/* Donut */}
                <div style={{ flexShrink: 0 }}>
                  <DonutChart data={ACTION_DIST} activeAction={activeAction} />
                </div>

                {/* Legend + bars */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ACTION_DIST.map((d, i) => {
                    const pct = (d.count / ACTION_TOTAL) * 100;
                    const color = donutColors[i % donutColors.length] ?? T.accent;
                    const isActive = activeAction === null || activeAction === d.action;

                    return (
                      <motion.div
                        key={d.action}
                        onClick={() => {
                          setActiveAction((prev) => (prev === d.action ? null : d.action));
                          setDrillFilter((prev) =>
                            prev?.type === 'action' && prev.action === d.action
                              ? null
                              : { type: 'action', action: d.action },
                          );
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          opacity: isActive ? 1 : 0.38,
                          padding: '3px 0',
                        }}
                        whileHover={{ x: 3, transition: { duration: 0.14 } }}
                        whileTap={{ scale: 0.97 }}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: isActive ? 1 : 0.38, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.04, duration: 0.35 }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: T.dim, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.action}
                        </span>
                        {/* Animated bar */}
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: T.hairline, flexShrink: 0 }}>
                          <motion.div
                            style={{ height: '100%', borderRadius: 2, background: color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ delay: 0.45 + i * 0.04, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                        <span style={{ fontSize: 10, color: T.faint, width: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {d.count}
                        </span>
                        {d.destructive && (
                          <ArrowDownRight size={10} strokeWidth={2.4} color={T.danger} />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* Actor leaderboard */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{ ...T.glass, padding: '20px 24px', flex: '1 1 360px', minWidth: 300 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Users size={13} strokeWidth={2.2} color={T.success} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Actor Leaderboard</span>
                </div>
                {/* Metric toggle */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['events', 'destructive', 'last_seen'] as LeaderboardMetric[]).map((m) => (
                    <motion.button
                      key={m}
                      onClick={() => setLeaderMetric(m)}
                      style={{
                        ...T.glassTight,
                        padding: '4px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        color: leaderMetric === m ? T.accent : T.faint,
                        border: `1px solid ${leaderMetric === m ? T.accent : T.hairline}`,
                        cursor: 'pointer',
                        letterSpacing: '0.04em',
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {m === 'events' ? 'Events' : m === 'destructive' ? 'Danger' : 'Recent'}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <AnimatePresence mode="popLayout">
                  {sortedActors.map((actor, i) => {
                    const metricValue =
                      leaderMetric === 'events'
                        ? actor.events
                        : leaderMetric === 'destructive'
                        ? actor.destructive
                        : 0;
                    const barPct = leaderMetric === 'last_seen'
                      ? 0
                      : (metricValue / leaderMax) * 100;
                    const isSelected =
                      drillFilter?.type === 'actor' && drillFilter.email === actor.email;

                    return (
                      <motion.div
                        key={actor.email}
                        layout="position"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 28, delay: i * 0.04 }}
                        onClick={() =>
                          setDrillFilter(
                            isSelected ? null : { type: 'actor', email: actor.email },
                          )
                        }
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 10,
                          background: isSelected ? T.accentDim : 'transparent',
                          border: `1px solid ${isSelected ? T.accent : 'transparent'}`,
                          cursor: 'pointer',
                        }}
                        whileHover={{
                          background: isSelected ? T.accentDim : 'rgba(255,255,255,0.04)',
                          transition: { duration: 0.12 },
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {/* Rank */}
                        <span style={{ fontSize: 11, color: T.ghost, width: 16, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                          {i + 1}
                        </span>
                        <ActorAvatar email={actor.email} role={actor.role} initials={actor.initials} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {actor.email}
                            </span>
                            <span style={{
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              color: roleColor(actor.role),
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: `${roleColor(actor.role)}22`,
                            }}>
                              {rolePill(actor.role)}
                            </span>
                          </div>
                          {leaderMetric !== 'last_seen' && (
                            <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: T.hairline }}>
                              <motion.div
                                style={{ height: '100%', borderRadius: 2, background: leaderMetric === 'destructive' ? T.danger : T.accent }}
                                initial={{ width: 0 }}
                                animate={{ width: `${barPct}%` }}
                                transition={{ type: 'spring', stiffness: 200, damping: 26, delay: i * 0.05 }}
                              />
                            </div>
                          )}
                          {leaderMetric === 'last_seen' && (
                            <span style={{ fontSize: 10, color: T.faint }}>
                              {formatDateTime(actor.last_seen)}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: leaderMetric === 'destructive' ? T.danger : T.accent, fontVariantNumeric: 'tabular-nums' }}>
                          {leaderMetric !== 'last_seen' ? formatNumber(metricValue) : ''}
                        </span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* ── Drill-in event list ──────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {(drillFilter !== null || searchQ) && (
              <motion.div
                key="drill"
                variants={drillPanelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{ ...T.glass, overflow: 'hidden' }}
              >
                {/* Drill header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderBottom: `1px solid ${T.hairline}`,
                  gap: 12,
                  flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldAlert size={13} strokeWidth={2.2} color={T.accent} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                      Events
                      {drillFilter?.type === 'heatmap' &&
                        ` · ${DAYS[drillFilter.day] ?? ''} ${String(drillFilter.hour).padStart(2, '0')}:00`}
                      {drillFilter?.type === 'action' && ` · ${drillFilter.action}`}
                      {drillFilter?.type === 'actor' && ` · ${drillFilter.email}`}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.accent,
                      background: T.accentDim,
                      padding: '2px 7px',
                      borderRadius: 4,
                    }}>
                      {filteredEvents.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Search */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      ...T.glassTight,
                      padding: '7px 12px',
                    }}>
                      <Search size={12} strokeWidth={2.2} color={T.faint} />
                      <input
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        placeholder="Filter events…"
                        style={{
                          background: 'none',
                          border: 'none',
                          outline: 'none',
                          fontSize: 12,
                          color: T.text,
                          width: 160,
                        }}
                      />
                    </div>
                    <motion.button
                      onClick={() => { setDrillFilter(null); setSearchQ(''); setActiveAction(null); }}
                      style={{
                        ...T.glassTight,
                        border: `1px solid ${T.hairline}`,
                        padding: '7px 9px',
                        cursor: 'pointer',
                        color: T.faint,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      whileHover={{ scale: 1.07, color: T.text }}
                      whileTap={{ scale: 0.93 }}
                    >
                      <X size={13} strokeWidth={2.4} />
                    </motion.button>
                  </div>
                </div>

                {/* Event rows */}
                <motion.div
                  variants={listContainerVariants}
                  initial="hidden"
                  animate="visible"
                  style={{ maxHeight: 420, overflowY: 'auto' }}
                >
                  <AnimatePresence mode="popLayout">
                    {filteredEvents.length > 0 ? (
                      filteredEvents.map((ev) => (
                        <EventRow key={ev.id} event={ev} />
                      ))
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{ padding: '32px 20px', textAlign: 'center', color: T.faint, fontSize: 13 }}
                      >
                        No events match this filter for the mock dataset
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Hint row when nothing drilled ─────────────────────────── */}
          <AnimatePresence>
            {drillFilter === null && !searchQ && (
              <motion.div
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: T.ghost }}
              >
                Click a heatmap cell · action type · or actor to drill into events
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* Floating heatmap tooltip */}
      <AnimatePresence>
        {tooltipState && (() => {
          const { day: d, hour: h, x, y } = tooltipState;
          const count = HEATMAP_DATA[d]?.[h] ?? 0;
          const dayLabel = DAYS[d] ?? '';
          return (
            <HeatTooltip
              key={`tip-${d}-${h}`}
              day={dayLabel}
              hour={h}
              count={count}
              x={x}
              y={y}
            />
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
