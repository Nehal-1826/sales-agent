/**
 * Admin Audit Log — AU4 Live Feed
 *
 * "Live Audit Feed" — a streaming feed of audit events with:
 *  - Animated KPI counters (spring-counted values)
 *  - Live event feed via AnimatePresence (spring slide-in from top)
 *  - Pause/play toggle; setInterval cleaned up (StrictMode-safe)
 *  - Action-type / severity filter chips that re-lay-out the feed (layout)
 *  - Destructive events flash/pulse on arrival
 *  - Click event → expand detail (target, metadata, IP, full timestamp)
 *  - Per-action running summary sidebar
 *  - whileHover/whileTap on all interactive elements
 *  - Full cleanup: intervals, rAF, motion subscriptions all removed on unmount
 *
 * Self-contained: inline style={{}} only, mock data only, @/lib/format only.
 * Aurora Glass palette — warm orange accent, no purple/blue/teal/cyan.
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
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  Info,
  LogIn,
  Pause,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  Terminal,
  User,
  UserX,
  Zap,
} from 'lucide-react';
import { formatDateTime, formatNumber } from '@/lib/format';

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  text:       '#ffffff',
  dim:        'rgba(255,255,255,0.62)',
  faint:      'rgba(255,255,255,0.40)',
  ghost:      'rgba(255,255,255,0.14)',
  accent:     '#F26522',
  accent2:    '#FF8A4B',
  success:    '#3ddc97',
  danger:     '#ff5c7a',
  warning:    '#FF8A4B',
  glass:      'rgba(255,255,255,0.045)',
  glass2:     'rgba(255,255,255,0.075)',
  glass3:     'rgba(255,255,255,0.10)',
  border:     'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.055)',
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

type Severity = 'destructive' | 'mutation' | 'read' | 'login';

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

interface AuditEvent {
  id: string;
  ts: number; // ms epoch
  actor: string;
  role: 'super_admin' | 'admin' | 'system';
  action: ActionType;
  target: string;
  severity: Severity;
  ip: string;
  meta: Record<string, string>;
  fresh?: boolean; // newly streamed
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const ACTORS = [
  { email: 'admin@warmpulse.app',  role: 'super_admin' as const },
  { email: 'ops@warmpulse.app',    role: 'admin' as const },
  { email: 'devesh@warmpulse.app', role: 'super_admin' as const },
  { email: 'system',               role: 'system' as const },
];

const IP_POOL = [
  '49.32.21.144',
  '103.45.67.89',
  '202.131.88.12',
  '14.139.60.22',
];

interface EventTemplate {
  action: ActionType;
  severity: Severity;
  targets: string[];
  metas: Array<Record<string, string>>;
}

const EVENT_TEMPLATES: EventTemplate[] = [
  {
    action: 'user.suspend',
    severity: 'destructive',
    targets: ['jin@arclamp.co', 'ravi@testco.in', 'ali@outreach.io'],
    metas: [
      { reason: '3× payment failure', plan: 'Starter' },
      { reason: 'TOS violation flagged', plan: 'Growth' },
    ],
  },
  {
    action: 'user.impersonate',
    severity: 'destructive',
    targets: ['alex@acme.co', 'priya@startup.in', 'marco@mailsend.eu'],
    metas: [
      { session_id: 'imp_7f4b2a', expires: '30min' },
      { session_id: 'imp_3c9e1d', expires: '15min' },
    ],
  },
  {
    action: 'peer.deactivate',
    severity: 'destructive',
    targets: ['pulse.warm.12@wp-peers.app', 'pulse.warm.37@wp-peers.app', 'pulse.warm.08@wp-peers.app'],
    metas: [
      { reputation: '0.12', pool: 'default', trigger: 'auto-hourly-check' },
      { reputation: '0.08', pool: 'pool-B',  trigger: 'manual-admin' },
    ],
  },
  {
    action: 'plan.update',
    severity: 'mutation',
    targets: ['Starter plan', 'Growth plan', 'Pro plan'],
    metas: [
      { price_from: '₹499', price_to: '₹599', field: 'monthly_price' },
      { token_from: '1,200,000', token_to: '1,500,000', field: 'llm_token_cap' },
    ],
  },
  {
    action: 'pool.assign',
    severity: 'mutation',
    targets: ['Acme Corp → pool-B', 'StartupIn → pool-A', 'DevHive → pool-C'],
    metas: [
      { prev_pool: 'default', new_pool: 'pool-B' },
      { prev_pool: 'pool-A',  new_pool: 'pool-C' },
    ],
  },
  {
    action: 'sequence.pause',
    severity: 'mutation',
    targets: ['Onboarding sequence #4', 'Re-engagement flow #2', 'Drip campaign #7'],
    metas: [
      { enrolled: '142', reason: 'low-open-rate' },
      { enrolled: '87',  reason: 'manual-pause' },
    ],
  },
  {
    action: 'payment.export',
    severity: 'read',
    targets: ['Payments export · May 2026', 'Invoices export · Q1 2026'],
    metas: [
      { format: 'CSV', rows: '2,341', size: '148KB' },
      { format: 'PDF', rows: '1,847', size: '4.2MB' },
    ],
  },
  {
    action: 'settings.update',
    severity: 'mutation',
    targets: ['Platform settings', 'Email throttle config', 'SMTP relay settings'],
    metas: [
      { field: 'warmup_max_daily',  from: '80',  to: '100' },
      { field: 'smtp_retry_delay',  from: '30s', to: '20s' },
    ],
  },
  {
    action: 'llm.cap_update',
    severity: 'mutation',
    targets: ['Starter tier cap', 'Growth tier cap', 'Pro tier cap'],
    metas: [
      { from: '500k tokens', to: '750k tokens', field: 'monthly_cap' },
      { from: '1.2M tokens', to: '1.5M tokens', field: 'monthly_cap' },
    ],
  },
  {
    action: 'login',
    severity: 'login',
    targets: ['admin@warmpulse.app', 'ops@warmpulse.app', 'devesh@warmpulse.app'],
    metas: [
      { method: 'google-oauth', mfa: 'totp-passed' },
      { method: 'email-password', mfa: 'skipped' },
    ],
  },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

let _eid = 1000;
function makeEvent(tsMsAgo = 0): AuditEvent {
  const tmpl = pickRandom(EVENT_TEMPLATES);
  const actor = pickRandom(ACTORS);
  const target = pickRandom(tmpl.targets);
  const meta = pickRandom(tmpl.metas);
  const ip = pickRandom(IP_POOL);
  _eid++;
  return {
    id: `evt_${_eid}`,
    ts: Date.now() - tsMsAgo,
    actor: actor.email,
    role: actor.role,
    action: tmpl.action,
    target: target ?? '',
    severity: tmpl.severity,
    ip: ip ?? '',
    meta: meta ?? {},
    fresh: tsMsAgo === 0,
  };
}

// Seed backlog: 28 staggered events over past hour
const SEED_EVENTS: AuditEvent[] = Array.from({ length: 28 }, (_, i) =>
  makeEvent((i + 1) * 90_000 + Math.random() * 60_000),
).reverse();

// ─── Severity helpers ─────────────────────────────────────────────────────────

function severityColor(s: Severity): string {
  if (s === 'destructive') return C.danger;
  if (s === 'mutation')    return C.warning;
  if (s === 'login')       return C.success;
  return C.dim;
}

function severityBg(s: Severity): string {
  if (s === 'destructive') return 'rgba(255,92,122,0.12)';
  if (s === 'mutation')    return 'rgba(255,138,75,0.10)';
  if (s === 'login')       return 'rgba(61,220,151,0.09)';
  return 'rgba(255,255,255,0.05)';
}

function severityLabel(s: Severity): string {
  if (s === 'destructive') return 'DESTR';
  if (s === 'mutation')    return 'MUT';
  if (s === 'login')       return 'LOGIN';
  return 'READ';
}

function actionIcon(action: ActionType): typeof Activity {
  if (action === 'user.suspend' || action === 'user.impersonate') return UserX;
  if (action === 'peer.deactivate')  return ShieldAlert;
  if (action === 'plan.update')      return Zap;
  if (action === 'pool.assign')      return Globe;
  if (action === 'sequence.pause')   return Pause;
  if (action === 'payment.export')   return Terminal;
  if (action === 'settings.update')  return Shield;
  if (action === 'llm.cap_update')   return Activity;
  if (action === 'login')            return LogIn;
  return Info;
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 10)  return 'just now';
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Actor avatar ─────────────────────────────────────────────────────────────

function ActorAvatar({ email, role, size = 28 }: { email: string; role: AuditEvent['role']; size?: number }) {
  const isSystem = role === 'system';
  const initials = isSystem ? '⚙' : email.slice(0, 2).toUpperCase();
  const bg = isSystem
    ? 'rgba(255,255,255,0.12)'
    : role === 'super_admin'
    ? 'linear-gradient(135deg, #F26522, #FF8A4B)'
    : 'linear-gradient(135deg, #3ddc97, #2ab87a)';

  return (
    <span
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          size,
        height:         size,
        borderRadius:   '50%',
        background:     bg,
        fontSize:       size * 0.36,
        fontWeight:     700,
        color:          isSystem ? C.dim : C.text,
        flexShrink:     0,
        border:         `1px solid rgba(255,255,255,0.16)`,
      }}
    >
      {initials}
    </span>
  );
}

// ─── Animated KPI counter ─────────────────────────────────────────────────────

function KpiCounter({ to, label, sub, color = C.text }: {
  to: number;
  label: string;
  sub?: string;
  color?: string;
}) {
  const mv   = useMotionValue(0);
  const spMv = useSpring(mv, { stiffness: 80, damping: 20 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const unsub = spMv.on('change', (v) => setDisplay(Math.round(v)));
    const ctrl  = animate(mv, to, { duration: 1.4, ease: 'easeOut' });
    return () => {
      unsub();
      ctrl.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  return (
    <motion.div
      style={{ ...GLASS, padding: '16px 20px', flex: 1, minWidth: 120 }}
      whileHover={{ scale: 1.02, background: C.glass2 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.faint, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {formatNumber(display)}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>{sub}</div>
      )}
    </motion.div>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function Chip({
  label,
  active,
  color,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      layout
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          5,
        padding:      '5px 12px',
        borderRadius: 20,
        border:       active
          ? `1px solid ${color ?? C.accent}`
          : `1px solid ${C.border}`,
        background:   active
          ? `${color ?? C.accent}22`
          : C.glass,
        color:        active ? (color ?? C.accent) : C.dim,
        fontSize:     12,
        fontWeight:   600,
        cursor:       'pointer',
        whiteSpace:   'nowrap',
        backdropFilter: 'blur(8px)',
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          background:   active ? (color ?? C.accent) : C.ghost,
          color:        active ? '#fff' : C.dim,
          borderRadius: 10,
          fontSize:     10,
          fontWeight:   700,
          padding:      '1px 6px',
        }}>
          {count}
        </span>
      )}
    </motion.button>
  );
}

// ─── Event detail expand ──────────────────────────────────────────────────────

const detailVariants: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: { height: 'auto', opacity: 1 },
};

function EventDetail({ event }: { event: AuditEvent }) {
  return (
    <motion.div
      variants={detailVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        padding:      '12px 16px 14px',
        borderTop:    `1px solid ${C.borderSoft}`,
        display:      'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap:          10,
        background:   'rgba(0,0,0,0.15)',
      }}>
        {/* Full timestamp */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.faint, marginBottom: 3 }}>Timestamp (IST)</div>
          <div style={{ fontSize: 12, color: C.text, fontFamily: 'monospace' }}>{formatDateTime(event.ts)}</div>
        </div>

        {/* IP */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.faint, marginBottom: 3 }}>IP Address</div>
          <div style={{ fontSize: 12, color: C.text, fontFamily: 'monospace' }}>{event.ip}</div>
        </div>

        {/* Event ID */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.faint, marginBottom: 3 }}>Event ID</div>
          <div style={{ fontSize: 12, color: C.dim, fontFamily: 'monospace' }}>{event.id}</div>
        </div>

        {/* Target */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.faint, marginBottom: 3 }}>Target</div>
          <div style={{ fontSize: 12, color: C.text }}>{event.target}</div>
        </div>

        {/* Metadata fields */}
        {Object.entries(event.meta).map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.faint, marginBottom: 3 }}>
              {k.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 12, color: C.text }}>{v}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Single feed row ──────────────────────────────────────────────────────────

const rowVariants: Variants = {
  enter: {
    y: -28,
    opacity: 0,
    scale: 0.97,
  },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 340, damping: 28 },
  },
  exit: {
    y: 8,
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.2 },
  },
};

const flashVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: [0, 0.5, 0],
    transition: { duration: 0.9, times: [0, 0.3, 1] },
  },
};

function FeedRow({
  event,
  isExpanded,
  onToggle,
}: {
  event: AuditEvent;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = actionIcon(event.action);
  const sColor = severityColor(event.severity);
  const sBg    = severityBg(event.severity);

  return (
    <motion.div
      key={event.id}
      layout
      variants={rowVariants}
      initial="enter"
      animate="visible"
      exit="exit"
      style={{
        ...GLASS2,
        position:    'relative',
        overflow:    'hidden',
        borderRadius: 12,
        cursor:      'pointer',
        border:      isExpanded
          ? `1px solid ${sColor}44`
          : `1px solid ${C.border}`,
      }}
      whileHover={{ background: C.glass3 }}
      onClick={onToggle}
    >
      {/* Flash overlay for fresh destructive events */}
      {event.fresh && event.severity === 'destructive' && (
        <motion.div
          variants={flashVariants}
          initial="hidden"
          animate="visible"
          style={{
            position:  'absolute',
            inset:     0,
            background: `radial-gradient(ellipse at 20% 50%, ${C.danger}33 0%, transparent 70%)`,
            borderRadius: 12,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Main row */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        12,
        padding:    '11px 14px',
      }}>
        {/* Severity stripe */}
        <div style={{
          width:        3,
          alignSelf:    'stretch',
          borderRadius: 3,
          background:   sColor,
          flexShrink:   0,
          opacity:      0.8,
        }} />

        {/* Icon bubble */}
        <div style={{
          width:          32,
          height:         32,
          borderRadius:   8,
          background:     sBg,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          border:         `1px solid ${sColor}30`,
        }}>
          <Icon size={15} style={{ color: sColor }} strokeWidth={2.2} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Severity badge */}
            <span style={{
              fontSize:      10,
              fontWeight:    800,
              letterSpacing: '0.10em',
              color:         sColor,
              background:    `${sColor}18`,
              borderRadius:  6,
              padding:       '2px 7px',
              border:        `1px solid ${sColor}30`,
            }}>
              {severityLabel(event.severity)}
            </span>

            {/* Action */}
            <span style={{
              fontSize:   13,
              fontWeight: 700,
              color:      C.text,
              fontFamily: 'monospace',
            }}>
              {event.action}
            </span>

            {/* Target truncated */}
            <span style={{
              fontSize:    12,
              color:       C.dim,
              overflow:    'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:  'nowrap',
              maxWidth:    220,
            }}>
              → {event.target}
            </span>
          </div>

          {/* Actor + time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <ActorAvatar email={event.actor} role={event.role} size={18} />
            <span style={{ fontSize: 11, color: C.dim }}>{event.actor}</span>
            <span style={{ fontSize: 11, color: C.faint }}>·</span>
            <span style={{ fontSize: 11, color: C.faint }}>{relTime(event.ts)}</span>
            {event.fresh && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  fontSize:      9,
                  fontWeight:    800,
                  letterSpacing: '0.14em',
                  color:         C.success,
                  background:    `${C.success}18`,
                  borderRadius:  6,
                  padding:       '1px 6px',
                  border:        `1px solid ${C.success}30`,
                }}
              >
                NEW
              </motion.span>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          style={{ color: C.faint, flexShrink: 0 }}
        >
          <ChevronDown size={16} strokeWidth={2} />
        </motion.div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && <EventDetail event={event} />}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Per-action summary bar ───────────────────────────────────────────────────

function ActionSummary({ events }: { events: AuditEvent[] }) {
  const counts = useMemo<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    for (const e of events) {
      c[e.action] = (c[e.action] ?? 0) + 1;
    }
    return c;
  }, [events]);

  const sorted = useMemo(
    () =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
    [counts],
  );

  const maxCount = sorted[0]?.[1] ?? 1;

  return (
    <div style={{ ...GLASS, padding: '16px 18px' }}>
      <div style={{
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color:         C.faint,
        marginBottom:  12,
        display:       'flex',
        alignItems:    'center',
        gap:           6,
      }}>
        <Activity size={11} />
        Action Breakdown
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(([action, count]) => {
          const pct = (count / maxCount) * 100;
          const tmpl = EVENT_TEMPLATES.find((t) => t.action === action);
          const sev   = tmpl?.severity ?? 'read';
          const color = severityColor(sev);
          return (
            <div key={action}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{action}</span>
                <span style={{ fontSize: 11, color: C.faint, fontWeight: 700 }}>{count}</span>
              </div>
              <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                  style={{ height: '100%', borderRadius: 3, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pulse dot (feed alive indicator) ────────────────────────────────────────

function PulseDot({ active }: { active: boolean }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
      {active && (
        <motion.span
          animate={{ scale: [1, 2.2, 1], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position:     'absolute',
            inset:        0,
            borderRadius: '50%',
            background:   C.success,
          }}
        />
      )}
      <span style={{
        width:        10,
        height:       10,
        borderRadius: '50%',
        background:   active ? C.success : C.faint,
        display:      'block',
      }} />
    </span>
  );
}

// ─── FILTER CHIP SETS ─────────────────────────────────────────────────────────

const SEVERITY_CHIPS: Array<{ key: Severity | 'all'; label: string; color: string }> = [
  { key: 'all',         label: 'All',         color: C.accent },
  { key: 'destructive', label: 'Destructive',  color: C.danger },
  { key: 'mutation',    label: 'Mutation',     color: C.warning },
  { key: 'login',       label: 'Login',        color: C.success },
  { key: 'read',        label: 'Read / Export', color: C.dim },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmAudAU4Feed() {
  const [events, setEvents]         = useState<AuditEvent[]>(SEED_EVENTS);
  const [paused, setPaused]         = useState(false);
  const [sevFilter, setSevFilter]   = useState<Severity | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tick, setTick]             = useState(0); // forces re-render for relTime
  const [showAll, setShowAll]       = useState(false);

  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Live feed: new event every 3-5s
  useEffect(() => {
    let handle: ReturnType<typeof setInterval>;

    const schedule = () => {
      const delay = 3000 + Math.random() * 2000;
      handle = setInterval(() => {
        if (!pausedRef.current) {
          setEvents((prev) => {
            const fresh = makeEvent(0);
            const next = [fresh, ...prev].slice(0, 120);
            return next;
          });
        }
      }, delay);
    };

    schedule();
    return () => clearInterval(handle);
  }, []);

  // Tick for relative times
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(h);
  }, []);

  // Strip "fresh" flag after 4s
  useEffect(() => {
    const h = setTimeout(() => {
      setEvents((prev) =>
        prev.map((e) => (e.fresh ? { ...e, fresh: false } : e)),
      );
    }, 4000);
    return () => clearTimeout(h);
  }, [events]);

  // Derived KPIs
  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }, []);

  const eventsToday      = useMemo(() => events.filter((e) => e.ts >= todayStart).length, [events, todayStart]);
  const destructiveToday = useMemo(() => events.filter((e) => e.ts >= todayStart && e.severity === 'destructive').length, [events, todayStart]);
  const distinctActors   = useMemo(() => new Set(events.map((e) => e.actor)).size, [events]);
  const evPerMin         = useMemo(() => {
    const since = Date.now() - 60_000;
    return events.filter((e) => e.ts >= since).length;
  }, [events, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered feed
  const filtered = useMemo(
    () =>
      events.filter((e) => sevFilter === 'all' || e.severity === sevFilter),
    [events, sevFilter],
  );

  const visible = showAll ? filtered : filtered.slice(0, 20);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Actor leaderboard (top 5 by event count)
  const topActors = useMemo(() => {
    const ac: Record<string, { count: number; role: AuditEvent['role'] }> = {};
    for (const e of events) {
      if (!ac[e.actor]) ac[e.actor] = { count: 0, role: e.role };
      ac[e.actor]!.count++;
    }
    return Object.entries(ac)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [events]);

  return (
    <div
      style={{
        fontFamily:      '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
        color:           C.text,
        minHeight:       '100vh',
        padding:         24,
        boxSizing:       'border-box',
        display:         'flex',
        flexDirection:   'column',
        gap:             20,
        position:        'relative',
      }}
    >
      {/* Ambient background */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position:  'absolute',
          width:     600,
          height:    600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${C.accent}18 0%, transparent 70%)`,
          top: -200,
          right: -100,
          filter: 'blur(40px)',
        }} />
        <div style={{
          position:  'absolute',
          width:     400,
          height:    400,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${C.danger}12 0%, transparent 70%)`,
          bottom: 0,
          left: 100,
          filter: 'blur(50px)',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{
              fontSize:      10,
              fontWeight:    700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color:         C.faint,
              marginBottom:  4,
              display:       'flex',
              alignItems:    'center',
              gap:           6,
            }}>
              <PulseDot active={!paused} />
              {paused ? 'Feed paused' : 'Live audit feed · simulated'}
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
              Audit Log
            </h1>
            <p style={{ fontSize: 12, color: C.faint, marginTop: 3 }}>
              Every super-admin &amp; destructive action — actor · action · target · IP
            </p>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <motion.button
              onClick={() => setPaused((p) => !p)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        6,
                padding:    '7px 14px',
                borderRadius: 10,
                border:     `1px solid ${paused ? C.accent : C.border}`,
                background: paused ? `${C.accent}22` : C.glass,
                color:      paused ? C.accent : C.dim,
                fontSize:   12,
                fontWeight: 700,
                cursor:     'pointer',
              }}
            >
              {paused ? <Play size={13} strokeWidth={2.4} /> : <Pause size={13} strokeWidth={2.4} />}
              {paused ? 'Resume' : 'Pause'}
            </motion.button>

            <motion.button
              onClick={() => {
                setEvents((prev) => {
                  const fresh = makeEvent(0);
                  return [fresh, ...prev].slice(0, 120);
                });
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        6,
                padding:    '7px 14px',
                borderRadius: 10,
                border:     `1px solid ${C.border}`,
                background: C.glass,
                color:      C.dim,
                fontSize:   12,
                fontWeight: 700,
                cursor:     'pointer',
              }}
            >
              <RefreshCw size={13} strokeWidth={2.4} />
              Inject
            </motion.button>
          </div>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <KpiCounter to={eventsToday}      label="Events today"      sub={formatDateTime(todayStart) + ' →'} color={C.text} />
          <KpiCounter to={destructiveToday} label="Destructive"       sub="high-impact actions"               color={C.danger} />
          <KpiCounter to={distinctActors}   label="Distinct actors"   sub="across all events"                 color={C.accent2} />
          <KpiCounter to={evPerMin}         label="Events / min"      sub="rolling 60s window"                color={C.success} />
        </div>

        {/* ── Severity filter chips ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Filter:
          </span>
          {SEVERITY_CHIPS.map((chip) => {
            const count = chip.key === 'all'
              ? events.length
              : events.filter((e) => e.severity === chip.key).length;
            return (
              <Chip
                key={chip.key}
                label={chip.label}
                active={sevFilter === chip.key}
                color={chip.color}
                count={count}
                onClick={() => setSevFilter(chip.key)}
              />
            );
          })}
        </div>

        {/* ── Main content: feed + summary sidebar ── */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Feed */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Feed header */}
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '0 2px',
            }}>
              <span style={{ fontSize: 12, color: C.dim }}>
                Showing <strong style={{ color: C.text }}>{formatNumber(visible.length)}</strong> of{' '}
                <strong style={{ color: C.text }}>{formatNumber(filtered.length)}</strong> events
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.faint }}>
                <Activity size={11} />
                {paused ? 'Paused' : 'Live'}
              </span>
            </div>

            {/* Event rows */}
            <AnimatePresence initial={false}>
              {visible.map((event) => (
                <FeedRow
                  key={event.id}
                  event={event}
                  isExpanded={expandedId === event.id}
                  onToggle={() => toggleExpand(event.id)}
                />
              ))}
            </AnimatePresence>

            {/* Show more / less */}
            {filtered.length > 20 && (
              <motion.button
                layout
                onClick={() => setShowAll((s) => !s)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            6,
                  padding:        '10px',
                  borderRadius:   12,
                  border:         `1px dashed ${C.border}`,
                  background:     'transparent',
                  color:          C.dim,
                  fontSize:       12,
                  fontWeight:     600,
                  cursor:         'pointer',
                  marginTop:      4,
                }}
              >
                {showAll ? (
                  <>
                    <ChevronUp size={14} strokeWidth={2} />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} strokeWidth={2} />
                    Show {formatNumber(filtered.length - 20)} more events
                  </>
                )}
              </motion.button>
            )}
          </div>

          {/* Summary sidebar */}
          <div
            style={{
              width:      240,
              flexShrink: 0,
              display:    'flex',
              flexDirection: 'column',
              gap:         12,
            }}
          >
            <ActionSummary events={events} />

            {/* Actor leaderboard */}
            <div style={{ ...GLASS, padding: '16px 18px' }}>
              <div style={{
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color:         C.faint,
                marginBottom:  12,
                display:       'flex',
                alignItems:    'center',
                gap:           6,
              }}>
                <User size={11} />
                Top Actors
              </div>
              {topActors.map(([actor, info], i) => (
                <motion.div
                  key={actor}
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         8,
                    padding:     '6px 0',
                    borderBottom: i < 4 ? `1px solid ${C.borderSoft}` : 'none',
                  }}
                >
                  <ActorAvatar email={actor} role={info.role} size={24} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {actor}
                    </div>
                    <div style={{ fontSize: 10, color: C.faint }}>{info.role}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.accent2 }}>{info.count}</span>
                </motion.div>
              ))}
            </div>

            {/* Recent destructive events callout */}
            <div style={{
              ...GLASS,
              padding: '14px 16px',
              border:  `1px solid ${C.danger}30`,
              background: 'rgba(255,92,122,0.07)',
            }}>
              <div style={{
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color:         C.danger,
                marginBottom:  10,
                display:       'flex',
                alignItems:    'center',
                gap:           6,
              }}>
                <AlertTriangle size={11} />
                Destructive (last 10)
              </div>
              {events
                .filter((e) => e.severity === 'destructive')
                .slice(0, 4)
                .map((e) => (
                  <div key={e.id} style={{
                    display:      'flex',
                    flexDirection: 'column',
                    gap:           2,
                    padding:       '5px 0',
                    borderBottom:  `1px solid rgba(255,92,122,0.10)`,
                  }}>
                    <span style={{ fontSize: 11, color: C.text, fontFamily: 'monospace' }}>{e.action}</span>
                    <span style={{ fontSize: 10, color: C.faint }}>{relTime(e.ts)} · {e.ip}</span>
                  </div>
                ))}
              {events.filter((e) => e.severity === 'destructive').length === 0 && (
                <span style={{ fontSize: 11, color: C.faint }}>None in this session</span>
              )}
            </div>

            {/* Legend */}
            <div style={{ ...GLASS, padding: '14px 16px' }}>
              <div style={{
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color:         C.faint,
                marginBottom:  10,
                display:       'flex',
                alignItems:    'center',
                gap:           6,
              }}>
                <CheckCircle2 size={11} />
                Legend
              </div>
              {[
                { sev: 'destructive' as Severity, desc: 'User suspend / peer deactivate / impersonate' },
                { sev: 'mutation' as Severity,    desc: 'Plan / pool / LLM cap / settings update' },
                { sev: 'login' as Severity,       desc: 'Admin login events' },
                { sev: 'read' as Severity,         desc: 'Export / read-only actions' },
              ].map(({ sev, desc }) => (
                <div key={sev} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div style={{
                    width:       10,
                    height:      10,
                    borderRadius: 3,
                    background:  severityColor(sev),
                    flexShrink:  0,
                    marginTop:   1,
                  }} />
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: severityColor(sev), textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {severityLabel(sev)}
                    </span>
                    <span style={{ fontSize: 10, color: C.faint, display: 'block' }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
