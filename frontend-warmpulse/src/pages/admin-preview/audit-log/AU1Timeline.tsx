/**
 * Admin Audit Log Design Candidate: AU1 — Audit Timeline
 *
 * "Audit Timeline" — a chronological, day-grouped stream of audit events.
 * Animated KPI header (events today, destructive actions, distinct actors),
 * full-featured filters (actor, action type, date range, search), staggered
 * timeline with spring-pop event nodes, click-to-expand detail panels,
 * AnimatePresence transitions on filter re-layout.
 *
 * Framer-motion: staggered container variants, layout FLIP on filter,
 * AnimatePresence expand/collapse, spring node pop, whileHover/whileTap,
 * animated KPI counters via useMotionValue + animate().
 *
 * Self-contained: inline style={{}} only, mock data only.
 * Aurora Glass dark palette — warm accent (#F26522) only, no purple/blue/teal.
 * DD/MM/YYYY via formatDate / formatDateTime from @/lib/format.
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
  Shield,
  ShieldAlert,
  UserX,
  UserCheck,
  Settings,
  CreditCard,
  Cpu,
  LogIn,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Filter,
  Calendar,
  Activity,
  Users,
  AlertTriangle,
  Network,
  Pause,
  RotateCcw,
  FileDown,
  Sliders,
} from 'lucide-react';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  text:           '#ffffff' as const,
  dim:            'rgba(255,255,255,0.62)' as const,
  faint:          'rgba(255,255,255,0.38)' as const,
  ghost:          'rgba(255,255,255,0.18)' as const,
  hairline:       'rgba(255,255,255,0.08)' as const,
  accent:         '#F26522' as const,
  accentLight:    '#FF8A4B' as const,
  accentDim:      'rgba(242,101,34,0.16)' as const,
  success:        '#3ddc97' as const,
  successDim:     'rgba(61,220,151,0.14)' as const,
  danger:         '#ff5c7a' as const,
  dangerDim:      'rgba(255,92,122,0.14)' as const,
  warning:        '#FF8A4B' as const,
  warningDim:     'rgba(255,138,75,0.14)' as const,
  neutral:        'rgba(255,255,255,0.28)' as const,
  neutralDim:     'rgba(255,255,255,0.07)' as const,
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
    background:           'rgba(255,255,255,0.085)',
    border:               '1px solid rgba(255,255,255,0.15)',
    backdropFilter:       'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius:         22,
  } as CSSProperties,
  page: {
    background: 'linear-gradient(135deg, #0e0b08 0%, #140c05 40%, #0f0a06 100%)',
    minHeight:  '100vh',
    color:      '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } as CSSProperties,
};

// ─── Action Severity ─────────────────────────────────────────────────────────
type Severity = 'destructive' | 'mutation' | 'read';

function getSeverity(action: string): Severity {
  if (
    action.includes('suspend') ||
    action.includes('impersonate') ||
    action.includes('deactivate') ||
    action.includes('delete') ||
    action.includes('export')
  ) return 'destructive';
  if (
    action.includes('update') ||
    action.includes('assign') ||
    action.includes('pause') ||
    action.includes('cap_update') ||
    action.includes('create')
  ) return 'mutation';
  return 'read';
}

function severityColor(s: Severity) {
  if (s === 'destructive') return T.danger;
  if (s === 'mutation')    return T.warning;
  return T.success;
}

function severityDimColor(s: Severity) {
  if (s === 'destructive') return T.dangerDim;
  if (s === 'mutation')    return T.warningDim;
  return T.successDim;
}

function severityLabel(s: Severity) {
  if (s === 'destructive') return 'DESTRUCTIVE';
  if (s === 'mutation')    return 'MUTATION';
  return 'READ';
}

// ─── Action Icon Map ──────────────────────────────────────────────────────────
function ActionIcon({ action, size = 14 }: { action: string; size?: number }) {
  const s = size;
  const sw = 2.2;
  if (action.includes('suspend') || action.includes('delete'))
    return <UserX size={s} strokeWidth={sw} />;
  if (action.includes('impersonate'))
    return <Shield size={s} strokeWidth={sw} />;
  if (action.includes('plan'))
    return <CreditCard size={s} strokeWidth={sw} />;
  if (action.includes('peer'))
    return <Network size={s} strokeWidth={sw} />;
  if (action.includes('pool'))
    return <RotateCcw size={s} strokeWidth={sw} />;
  if (action.includes('sequence') || action.includes('pause'))
    return <Pause size={s} strokeWidth={sw} />;
  if (action.includes('payment') || action.includes('export'))
    return <FileDown size={s} strokeWidth={sw} />;
  if (action.includes('settings'))
    return <Settings size={s} strokeWidth={sw} />;
  if (action.includes('llm'))
    return <Cpu size={s} strokeWidth={sw} />;
  if (action.includes('login') || action.includes('auth'))
    return <LogIn size={s} strokeWidth={sw} />;
  if (action.includes('user'))
    return <UserCheck size={s} strokeWidth={sw} />;
  return <Sliders size={s} strokeWidth={sw} />;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
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
  id:        string;
  timestamp: string;   // ISO
  actor:     { email: string; role: 'super_admin' | 'admin' | 'system' };
  action:    ActionType;
  target:    { label: string; id: string };
  ip:        string;
  metadata:  Record<string, string | number | boolean>;
}

const MOCK_EVENTS: AuditEvent[] = [
  // ── Today (2026-06-01) ────────────────────────────────────────────────────
  {
    id: 'aud_t01',
    timestamp: '2026-06-01T09:12:33Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'user.impersonate',
    target: { label: 'jin@arclamp.co', id: 'usr_4f8c1e' },
    ip: '49.32.21.144',
    metadata: { session_id: 'imp_98fa', duration_s: 142 },
  },
  {
    id: 'aud_t02',
    timestamp: '2026-06-01T08:55:07Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'user.suspend',
    target: { label: 'jay@brightlabs.in', id: 'usr_9b2a4c' },
    ip: '49.32.21.144',
    metadata: { reason: 'payment_overdue_14d', plan: 'Growth', suspended_at: '2026-06-01T08:55:07Z' },
  },
  {
    id: 'aud_t03',
    timestamp: '2026-06-01T08:31:44Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'llm.cap_update',
    target: { label: 'Starter Plan', id: 'plan_starter' },
    ip: '103.21.45.88',
    metadata: { from: 500000, to: 750000, delta: '+250k tokens' },
  },
  {
    id: 'aud_t04',
    timestamp: '2026-06-01T07:44:19Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'pool.assign',
    target: { label: 'Acme Corp workspace', id: 'ws_acme_01' },
    ip: '49.32.21.144',
    metadata: { from: 'default_pool', to: 'pool_premium_IN', effective: 'immediate' },
  },
  {
    id: 'aud_t05',
    timestamp: '2026-06-01T06:15:02Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'login',
    target: { label: 'admin@warmpulse.app', id: 'usr_admin_01' },
    ip: '49.32.21.144',
    metadata: { mfa: true, provider: 'totp', user_agent: 'Chrome/125 macOS' },
  },

  // ── Yesterday (2026-05-31) ────────────────────────────────────────────────
  {
    id: 'aud_y01',
    timestamp: '2026-05-31T17:08:52Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'plan.update',
    target: { label: 'Growth Plan', id: 'plan_growth' },
    ip: '103.21.45.88',
    metadata: { field: 'price_monthly_inr', from: 6499, to: 6999, change: '+₹500/mo' },
  },
  {
    id: 'aud_y02',
    timestamp: '2026-05-31T15:42:11Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'peer.deactivate',
    target: { label: 'pulse.warm.12@gmail.com', id: 'peer_12' },
    ip: '49.32.21.144',
    metadata: { reputation_score: 0.18, threshold: 0.3, trigger: 'auto_health_check' },
  },
  {
    id: 'aud_y03',
    timestamp: '2026-05-31T14:29:03Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'settings.update',
    target: { label: 'Platform settings', id: 'settings_global' },
    ip: '103.21.45.88',
    metadata: { field: 'warmup_max_daily_per_mailbox', from: 40, to: 50 },
  },
  {
    id: 'aud_y04',
    timestamp: '2026-05-31T11:55:37Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'payment.export',
    target: { label: 'May 2026 receipts', id: 'export_may_2026' },
    ip: '49.32.21.144',
    metadata: { format: 'CSV', rows: 184, size_kb: 42 },
  },
  {
    id: 'aud_y05',
    timestamp: '2026-05-31T10:12:44Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'sequence.pause',
    target: { label: 'TechFlow Inc — Onboarding seq.', id: 'seq_tf_onb' },
    ip: '103.21.45.88',
    metadata: { reason: 'client_request', enrolled: 12, paused_at_step: 3 },
  },
  {
    id: 'aud_y06',
    timestamp: '2026-05-31T09:04:18Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'login',
    target: { label: 'ops@warmpulse.app', id: 'usr_ops_01' },
    ip: '103.21.45.88',
    metadata: { mfa: false, provider: 'password', user_agent: 'Firefox/126 Windows' },
  },

  // ── 30 May 2026 ───────────────────────────────────────────────────────────
  {
    id: 'aud_m01',
    timestamp: '2026-05-30T19:31:55Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'plan.update',
    target: { label: 'Enterprise Plan', id: 'plan_enterprise' },
    ip: '49.32.21.144',
    metadata: { field: 'max_mailboxes', from: 50, to: 100 },
  },
  {
    id: 'aud_m02',
    timestamp: '2026-05-30T16:20:08Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'peer.deactivate',
    target: { label: 'pulse.warm.07@outlook.com', id: 'peer_07' },
    ip: '49.32.21.144',
    metadata: { reputation_score: 0.24, threshold: 0.3, trigger: 'manual_review' },
  },
  {
    id: 'aud_m03',
    timestamp: '2026-05-30T14:08:33Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'pool.assign',
    target: { label: 'BrightLabs workspace', id: 'ws_bright_02' },
    ip: '103.21.45.88',
    metadata: { from: 'pool_premium_IN', to: 'default_pool', reason: 'plan_downgrade' },
  },
  {
    id: 'aud_m04',
    timestamp: '2026-05-30T11:47:19Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'llm.cap_update',
    target: { label: 'Pro Plan', id: 'plan_pro' },
    ip: '103.21.45.88',
    metadata: { from: 2000000, to: 3000000, delta: '+1M tokens' },
  },
  {
    id: 'aud_m05',
    timestamp: '2026-05-30T09:33:41Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'user.suspend',
    target: { label: 'maya@devnomad.io', id: 'usr_7c3b2a' },
    ip: '49.32.21.144',
    metadata: { reason: 'tos_violation', plan: 'Starter', notified: true },
  },

  // ── 29 May 2026 ───────────────────────────────────────────────────────────
  {
    id: 'aud_o01',
    timestamp: '2026-05-29T21:14:05Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'settings.update',
    target: { label: 'Platform settings', id: 'settings_global' },
    ip: '49.32.21.144',
    metadata: { field: 'peer_reputation_min', from: 0.25, to: 0.3 },
  },
  {
    id: 'aud_o02',
    timestamp: '2026-05-29T14:02:27Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'sequence.pause',
    target: { label: 'Acme Corp — Cold Outreach', id: 'seq_acme_cold' },
    ip: '103.21.45.88',
    metadata: { reason: 'compliance_review', enrolled: 31, paused_at_step: 5 },
  },
  {
    id: 'aud_o03',
    timestamp: '2026-05-29T10:55:19Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'payment.export',
    target: { label: 'Q1 2026 billing report', id: 'export_q1_2026' },
    ip: '49.32.21.144',
    metadata: { format: 'PDF', rows: 543, size_kb: 218 },
  },
  {
    id: 'aud_o04',
    timestamp: '2026-05-29T08:44:00Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'login',
    target: { label: 'admin@warmpulse.app', id: 'usr_admin_01' },
    ip: '49.32.21.144',
    metadata: { mfa: true, provider: 'totp', user_agent: 'Chrome/125 macOS' },
  },
];

// ─── Day Grouping ─────────────────────────────────────────────────────────────
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (eventDay.getTime() === today.getTime())     return 'Today';
  if (eventDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return formatDate(iso);
}

function groupByDay(events: AuditEvent[]): { label: string; events: AuditEvent[] }[] {
  const map = new Map<string, AuditEvent[]>();
  for (const e of events) {
    const label = dayLabel(e.timestamp);
    const existing = map.get(label);
    if (existing) {
      existing.push(e);
    } else {
      map.set(label, [e]);
    }
  }
  return Array.from(map.entries()).map(([label, evts]) => ({ label, events: evts }));
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return formatDate(iso);
}

// ─── Animated Counter ─────────────────────────────────────────────────────────
function AnimatedCount({
  target,
  duration = 1.2,
  delay = 0,
}: {
  target:    number;
  duration?: number;
  delay?:    number;
}) {
  const mv = useMotionValue(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ctrl = animate(mv, target, { duration, ease: 'easeOut', delay });
    const unsub = mv.on('change', (v) => {
      if (ref.current) {
        ref.current.textContent = formatNumber(Math.round(v));
      }
    });
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [mv, target, duration, delay]);

  return <span ref={ref}>0</span>;
}

// ─── Framer Motion Variants ───────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.05 },
  },
};

const eventNodeVariants: Variants = {
  hidden:  { opacity: 0, x: -18, scale: 0.94 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 320, damping: 28 },
  },
  exit: {
    opacity: 0,
    x: 18,
    scale: 0.92,
    transition: { duration: 0.22 },
  },
};

const expandVariants: Variants = {
  collapsed: { height: 0, opacity: 0 },
  expanded:  { height: 'auto', opacity: 1, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } },
};

const dayGroupVariants: Variants = {
  hidden:  { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  dimColor,
  delay = 0,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  color: string;
  dimColor: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      style={{
        ...T.glassCard,
        padding: '18px 22px',
        display:        'flex',
        flexDirection:  'column',
        gap:             8,
        flex:           '1 1 160px',
        minWidth:        148,
        position:       'relative',
        overflow:       'hidden',
      }}
    >
      {/* Subtle background glow */}
      <div style={{
        position:        'absolute',
        top:             -30,
        right:           -30,
        width:            80,
        height:           80,
        borderRadius:    '50%',
        background:      dimColor,
        filter:          'blur(22px)',
        pointerEvents:   'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width:           32,
          height:          32,
          borderRadius:    10,
          background:      dimColor,
          border:         `1px solid ${color}30`,
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          color,
        }}>
          <Icon size={15} strokeWidth={2.2} />
        </div>
        <span style={{ fontSize: 11, color: T.faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1 }}>
        <AnimatedCount target={value} delay={delay + 0.1} />
      </div>
    </motion.div>
  );
}

// ─── Filter Pill ──────────────────────────────────────────────────────────────
function FilterPill({
  label,
  active,
  onClick,
  onClear,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onClear?: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:            5,
        padding:       '6px 12px',
        borderRadius:   20,
        border:        active ? `1px solid ${T.accent}60` : `1px solid ${T.ghost}`,
        background:    active ? T.accentDim : T.neutralDim,
        color:         active ? T.accentLight : T.dim,
        fontSize:       12,
        fontWeight:    active ? 600 : 400,
        cursor:        'pointer',
        whiteSpace:    'nowrap',
        transition:    'all 0.18s ease',
      }}
    >
      {label}
      {active && onClear && (
        <span
          onClick={(ev) => { ev.stopPropagation(); onClear(); }}
          style={{ display: 'flex', alignItems: 'center', color: T.accent, marginLeft: 2 }}
        >
          <X size={11} strokeWidth={2.6} />
        </span>
      )}
    </motion.button>
  );
}

// ─── Audit Event Row ──────────────────────────────────────────────────────────
function AuditEventRow({ event, isLast }: { event: AuditEvent; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const sev = getSeverity(event.action);
  const color = severityColor(sev);
  const dimColor = severityDimColor(sev);
  const actorInitials = event.actor.email.slice(0, 2).toUpperCase();
  const isSystem = event.actor.role === 'system';

  return (
    <motion.div
      layout
      variants={eventNodeVariants}
      style={{ display: 'flex', gap: 0, position: 'relative' }}
    >
      {/* Spine connector */}
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        width:           44,
        flexShrink:      0,
        paddingTop:      14,
        position:       'relative',
      }}>
        {/* Node dot */}
        <motion.div
          whileHover={{ scale: 1.3 }}
          style={{
            width:           14,
            height:          14,
            borderRadius:    '50%',
            background:     `radial-gradient(circle, ${color}, ${color}88)`,
            border:         `2px solid ${color}`,
            boxShadow:      `0 0 10px ${color}60`,
            flexShrink:      0,
            zIndex:          2,
            cursor:         'pointer',
          }}
          onClick={() => setExpanded((v) => !v)}
        />
        {/* Vertical line */}
        {!isLast && (
          <div style={{
            width:    2,
            flexGrow: 1,
            marginTop: 4,
            background: `linear-gradient(to bottom, ${color}40, rgba(255,255,255,0.06))`,
            borderRadius: 2,
            minHeight: 36,
          }} />
        )}
      </div>

      {/* Content card */}
      <motion.div
        layout
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
        style={{
          flex:          1,
          marginBottom:  isLast ? 0 : 6,
          borderRadius:  14,
          border:        `1px solid rgba(255,255,255,0.08)`,
          background:    'rgba(255,255,255,0.04)',
          overflow:      'hidden',
          cursor:        'pointer',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          transition:    'background 0.18s ease',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Row header */}
        <div style={{
          display:       'flex',
          alignItems:    'center',
          gap:            10,
          padding:       '12px 16px',
        }}>
          {/* Severity indicator bar */}
          <div style={{
            width:        3,
            height:       38,
            borderRadius: 4,
            background:   color,
            flexShrink:   0,
          }} />

          {/* Action icon */}
          <div style={{
            width:           32,
            height:          32,
            borderRadius:    9,
            background:      dimColor,
            border:         `1px solid ${color}30`,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            color,
            flexShrink:      0,
          }}>
            <ActionIcon action={event.action} size={14} />
          </div>

          {/* Action + target */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize:    13,
                fontWeight:  600,
                color:       T.text,
                fontFamily:  'monospace',
                letterSpacing: '0.01em',
              }}>
                {event.action}
              </span>
              <span style={{
                fontSize:   11,
                color:      T.faint,
                display:    'flex',
                alignItems: 'center',
                gap:         3,
              }}>
                <ChevronRight size={10} strokeWidth={2.4} />
                {event.target.label}
              </span>
              <span style={{
                fontSize:    10,
                fontWeight:  700,
                color,
                background:  dimColor,
                border:     `1px solid ${color}30`,
                borderRadius: 5,
                padding:    '1px 6px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}>
                {severityLabel(sev)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              {/* Actor avatar */}
              <span style={{
                width:           20,
                height:          20,
                borderRadius:    '50%',
                background:      isSystem
                  ? 'rgba(255,255,255,0.1)'
                  : `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                fontSize:         8,
                fontWeight:       700,
                color:            T.text,
                flexShrink:       0,
              }}>
                {isSystem ? '⚙' : actorInitials}
              </span>
              <span style={{ fontSize: 11, color: T.dim }}>{event.actor.email}</span>
              <span style={{ fontSize: 10, color: T.faint }}>·</span>
              <span style={{
                fontSize:    10,
                color:       T.faint,
                background:  'rgba(255,255,255,0.06)',
                padding:    '1px 6px',
                borderRadius: 5,
                fontFamily:  'monospace',
              }}>
                {event.actor.role}
              </span>
              <span style={{ fontSize: 10, color: T.faint }}>·</span>
              <span style={{ fontSize: 11, color: T.faint }}>{relativeTime(event.timestamp)}</span>
            </div>
          </div>

          {/* Expand toggle */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.22 }}
            style={{ color: T.faint, flexShrink: 0 }}
          >
            <ChevronDown size={14} strokeWidth={2.2} />
          </motion.div>
        </div>

        {/* Expanded detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              key="detail"
              variants={expandVariants}
              initial="collapsed"
              animate="expanded"
              exit="collapsed"
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                borderTop:  `1px solid rgba(255,255,255,0.08)`,
                padding:    '14px 16px 14px 56px',
                display:    'grid',
                gridTemplateColumns: '1fr 1fr',
                gap:         '14px 24px',
              }}>
                {/* Full timestamp */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Timestamp
                  </div>
                  <div style={{ fontSize: 12, color: T.text, fontFamily: 'monospace' }}>
                    {formatDateTime(event.timestamp)}
                  </div>
                </div>

                {/* IP */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Origin IP
                  </div>
                  <div style={{ fontSize: 12, color: T.text, fontFamily: 'monospace' }}>
                    {event.ip}
                  </div>
                </div>

                {/* Target */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Target
                  </div>
                  <div style={{ fontSize: 12, color: T.text }}>
                    <span style={{ color: T.dim }}>{event.target.label}</span>
                    <span style={{ color: T.faint, marginLeft: 6, fontFamily: 'monospace', fontSize: 10 }}>
                      {event.target.id}
                    </span>
                  </div>
                </div>

                {/* Event ID */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Event ID
                  </div>
                  <div style={{ fontSize: 11, color: T.faint, fontFamily: 'monospace' }}>
                    {event.id}
                  </div>
                </div>

                {/* Metadata */}
                {Object.keys(event.metadata).length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Metadata
                    </div>
                    <div style={{
                      display:        'flex',
                      flexWrap:       'wrap',
                      gap:             6,
                    }}>
                      {Object.entries(event.metadata).map(([k, v]) => (
                        <div
                          key={k}
                          style={{
                            background:  'rgba(255,255,255,0.06)',
                            border:      '1px solid rgba(255,255,255,0.10)',
                            borderRadius: 8,
                            padding:    '4px 10px',
                            fontSize:    11,
                            display:    'flex',
                            gap:          5,
                            fontFamily:  'monospace',
                          }}
                        >
                          <span style={{ color: T.faint }}>{k}:</span>
                          <span style={{ color: T.text }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ─── Day Group Header ─────────────────────────────────────────────────────────
function DayGroupHeader({ label, count }: { label: string; count: number }) {
  const isToday     = label === 'Today';
  const isYesterday = label === 'Yesterday';
  const accent      = isToday ? T.accent : isYesterday ? T.warning : T.neutral;

  return (
    <motion.div
      variants={dayGroupVariants}
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:            10,
        marginBottom:   14,
        marginTop:      4,
        position:      'sticky',
        top:            72,
        zIndex:         10,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        padding:       '6px 0',
      }}
    >
      <div style={{
        height:   1,
        width:    44 - 7,
        flexShrink: 0,
        background: `linear-gradient(to right, transparent, ${accent}60)`,
      }} />
      <div style={{
        display:       'flex',
        alignItems:    'center',
        gap:            8,
        padding:       '5px 14px',
        borderRadius:   20,
        background:    isToday ? T.accentDim : 'rgba(255,255,255,0.06)',
        border:       `1px solid ${accent}30`,
      }}>
        <span style={{
          fontSize:    12,
          fontWeight:  isToday ? 700 : 600,
          color:       isToday ? T.accentLight : T.dim,
          letterSpacing: '0.02em',
        }}>
          {label}
        </span>
        <span style={{
          fontSize:    10,
          color:       accent,
          background: `${accent}20`,
          borderRadius: 10,
          padding:    '1px 7px',
          fontWeight:   600,
        }}>
          {count}
        </span>
      </div>
      <div style={{
        flex:       1,
        height:     1,
        background: `linear-gradient(to right, ${accent}40, transparent)`,
      }} />
    </motion.div>
  );
}

// ─── Search + Filter Bar ──────────────────────────────────────────────────────
const ACTION_TYPE_OPTIONS: ActionType[] = [
  'user.suspend', 'user.impersonate', 'plan.update', 'peer.deactivate',
  'pool.assign', 'sequence.pause', 'payment.export', 'settings.update',
  'llm.cap_update', 'login',
];

const ACTOR_OPTIONS = [
  'admin@warmpulse.app',
  'ops@warmpulse.app',
  'system',
];

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdmAudAU1Timeline() {
  const [search,       setSearch]       = useState('');
  const [actorFilter,  setActorFilter]  = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionType | null>(null);
  const [sevFilter,    setSevFilter]    = useState<Severity | null>(null);
  const [showFilters,  setShowFilters]  = useState(false);
  const [filterKey,    setFilterKey]    = useState(0);

  // Rekey the animation container whenever filters change, for full re-entrance
  const triggerRelay = useCallback(() => {
    setFilterKey((k) => k + 1);
  }, []);

  // ── Derived filtered + grouped ──────────────────────────────────────────────
  const filtered = MOCK_EVENTS.filter((e) => {
    if (actorFilter  && e.actor.email !== actorFilter) return false;
    if (actionFilter && e.action      !== actionFilter) return false;
    if (sevFilter    && getSeverity(e.action) !== sevFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hit =
        e.action.toLowerCase().includes(q) ||
        e.actor.email.toLowerCase().includes(q) ||
        e.target.label.toLowerCase().includes(q) ||
        e.ip.includes(q) ||
        e.id.includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const grouped = groupByDay(filtered);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const todayLabel = 'Today';
  const eventsToday     = MOCK_EVENTS.filter((e) => dayLabel(e.timestamp) === todayLabel).length;
  const destructive     = MOCK_EVENTS.filter((e) => getSeverity(e.action) === 'destructive').length;
  const distinctActors  = new Set(MOCK_EVENTS.map((e) => e.actor.email)).size;

  const activeFilterCount =
    (actorFilter  ? 1 : 0) +
    (actionFilter ? 1 : 0) +
    (sevFilter    ? 1 : 0) +
    (search       ? 1 : 0);

  return (
    <div style={T.page}>
      {/* ── Atmosphere ─────────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }} aria-hidden>
        <div style={{
          position: 'absolute', top: -180, right: -120,
          width: 540, height: 380,
          background: 'radial-gradient(ellipse, rgba(242,101,34,0.14) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', bottom: -100, left: -80,
          width: 400, height: 320,
          background: 'radial-gradient(ellipse, rgba(255,138,75,0.09) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', padding: '28px 24px 60px' }}>

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: 'easeOut' }}
          style={{ marginBottom: 28 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width:           38,
              height:          38,
              borderRadius:    12,
              background:      T.accentDim,
              border:         `1px solid ${T.accent}40`,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              color:           T.accent,
            }}>
              <ShieldAlert size={18} strokeWidth={2.2} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0, lineHeight: 1.2 }}>
                Audit Log
              </h1>
              <p style={{ fontSize: 12, color: T.faint, margin: 0, marginTop: 2 }}>
                Chronological trail of every super-admin &amp; destructive action
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── KPI Strip ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard
            label="Events Today"
            value={eventsToday}
            icon={Activity}
            color={T.accent}
            dimColor={T.accentDim}
            delay={0.05}
          />
          <KpiCard
            label="Destructive Actions"
            value={destructive}
            icon={AlertTriangle}
            color={T.danger}
            dimColor={T.dangerDim}
            delay={0.10}
          />
          <KpiCard
            label="Distinct Actors"
            value={distinctActors}
            icon={Users}
            color={T.success}
            dimColor={T.successDim}
            delay={0.15}
          />
          <KpiCard
            label="Total Events"
            value={MOCK_EVENTS.length}
            icon={Shield}
            color={T.warning}
            dimColor={T.warningDim}
            delay={0.20}
          />
        </div>

        {/* ── Filter / Search Bar ───────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35 }}
          style={{
            ...T.glass,
            padding:       '14px 16px',
            marginBottom:   20,
            display:       'flex',
            flexDirection: 'column',
            gap:            12,
          }}
        >
          {/* Row 1: search + toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex:           1,
              display:        'flex',
              alignItems:     'center',
              gap:             8,
              background:    'rgba(255,255,255,0.05)',
              border:        `1px solid rgba(255,255,255,0.10)`,
              borderRadius:   10,
              padding:       '8px 12px',
            }}>
              <Search size={14} strokeWidth={2.2} style={{ color: T.faint, flexShrink: 0 }} />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); triggerRelay(); }}
                placeholder="Search action, actor, target, IP, event ID…"
                style={{
                  flex:         1,
                  background:   'transparent',
                  border:       'none',
                  outline:      'none',
                  color:        T.text,
                  fontSize:     13,
                  fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              />
              {search && (
                <button onClick={() => { setSearch(''); triggerRelay(); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 0, display: 'flex' }}>
                  <X size={13} strokeWidth={2.4} />
                </button>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowFilters((v) => !v)}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:            6,
                padding:       '8px 14px',
                borderRadius:   10,
                border:       `1px solid ${activeFilterCount > 0 ? T.accent + '60' : T.ghost}`,
                background:    activeFilterCount > 0 ? T.accentDim : 'rgba(255,255,255,0.05)',
                color:         activeFilterCount > 0 ? T.accentLight : T.dim,
                fontSize:       12,
                fontWeight:     600,
                cursor:        'pointer',
              }}
            >
              <Filter size={13} strokeWidth={2.2} />
              Filters
              {activeFilterCount > 0 && (
                <span style={{
                  background: T.accent,
                  color:      '#fff',
                  borderRadius: 10,
                  padding:   '0px 6px',
                  fontSize:   10,
                  fontWeight:  700,
                  lineHeight: '16px',
                }}>
                  {activeFilterCount}
                </span>
              )}
              <motion.span animate={{ rotate: showFilters ? 180 : 0 }} transition={{ duration: 0.22 }}>
                <ChevronDown size={12} strokeWidth={2.4} />
              </motion.span>
            </motion.button>
          </div>

          {/* Row 2: filter pills (expandable) */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                  {/* Severity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: T.faint, width: 60, flexShrink: 0 }}>Severity</span>
                    {(['destructive', 'mutation', 'read'] as Severity[]).map((s) => (
                      <FilterPill
                        key={s}
                        label={severityLabel(s)}
                        active={sevFilter === s}
                        onClick={() => { setSevFilter(sevFilter === s ? null : s); triggerRelay(); }}
                        onClear={() => { setSevFilter(null); triggerRelay(); }}
                      />
                    ))}
                  </div>
                  {/* Actor */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: T.faint, width: 60, flexShrink: 0 }}>Actor</span>
                    {ACTOR_OPTIONS.map((a) => (
                      <FilterPill
                        key={a}
                        label={a}
                        active={actorFilter === a}
                        onClick={() => { setActorFilter(actorFilter === a ? null : a); triggerRelay(); }}
                        onClear={() => { setActorFilter(null); triggerRelay(); }}
                      />
                    ))}
                  </div>
                  {/* Action Type */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: T.faint, width: 60, flexShrink: 0 }}>Action</span>
                    {ACTION_TYPE_OPTIONS.map((a) => (
                      <FilterPill
                        key={a}
                        label={a}
                        active={actionFilter === a}
                        onClick={() => { setActionFilter(actionFilter === a ? null : a); triggerRelay(); }}
                        onClear={() => { setActionFilter(null); triggerRelay(); }}
                      />
                    ))}
                  </div>
                  {/* Date range hint */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: T.faint, width: 60, flexShrink: 0 }}>Date</span>
                    <div style={{
                      display:       'flex',
                      alignItems:    'center',
                      gap:            6,
                      padding:       '5px 10px',
                      borderRadius:   8,
                      background:    'rgba(255,255,255,0.04)',
                      border:        `1px solid rgba(255,255,255,0.08)`,
                      fontSize:       11,
                      color:          T.faint,
                    }}>
                      <Calendar size={11} strokeWidth={2.2} />
                      {formatDate('2026-05-29')} — {formatDate('2026-06-01')}
                    </div>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={() => {
                          setActorFilter(null);
                          setActionFilter(null);
                          setSevFilter(null);
                          setSearch('');
                          triggerRelay();
                        }}
                        style={{
                          background:   'none',
                          border:       `1px solid ${T.danger}40`,
                          borderRadius:  8,
                          padding:      '4px 10px',
                          fontSize:      11,
                          color:         T.danger,
                          cursor:       'pointer',
                          display:      'flex',
                          alignItems:   'center',
                          gap:           4,
                        }}
                      >
                        <X size={10} strokeWidth={2.4} />
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Results count ─────────────────────────────────────────────────── */}
        <motion.div
          layout
          style={{
            display:       'flex',
            alignItems:    'center',
            justifyContent:'space-between',
            marginBottom:   16,
          }}
        >
          <span style={{ fontSize: 12, color: T.faint }}>
            Showing <strong style={{ color: T.dim }}>{formatNumber(filtered.length)}</strong> of{' '}
            {formatNumber(MOCK_EVENTS.length)} events
          </span>
          {filtered.length !== MOCK_EVENTS.length && (
            <span style={{
              fontSize:    11,
              color:       T.accent,
              background:  T.accentDim,
              padding:    '2px 10px',
              borderRadius: 10,
              border:     `1px solid ${T.accent}30`,
            }}>
              Filtered
            </span>
          )}
        </motion.div>

        {/* ── Timeline ─────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                textAlign:    'center',
                padding:      '64px 24px',
                color:        T.faint,
              }}
            >
              <Shield size={40} strokeWidth={1.4} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 14 }}>No events match your current filters.</div>
            </motion.div>
          ) : (
            <motion.div key={`timeline-${filterKey}`}>
              <AnimatePresence>
                {grouped.map((group) => (
                  <motion.div
                    key={group.label}
                    layout
                    variants={dayGroupVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    style={{ marginBottom: 24 }}
                  >
                    <DayGroupHeader label={group.label} count={group.events.length} />
                    <motion.div
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      style={{ paddingLeft: 0 }}
                    >
                      <AnimatePresence>
                        {group.events.map((event, i) => (
                          <AuditEventRow
                            key={event.id}
                            event={event}
                            isLast={i === group.events.length - 1}
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer legend ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          style={{
            display:       'flex',
            alignItems:    'center',
            gap:            20,
            marginTop:      40,
            paddingTop:     20,
            borderTop:     `1px solid rgba(255,255,255,0.07)`,
            flexWrap:      'wrap',
          }}
        >
          {([
            ['destructive', 'Destructive'],
            ['mutation',    'Mutation'],
            ['read',        'Read / Login'],
          ] as [Severity, string][]).map(([s, label]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                width:        10,
                height:       10,
                borderRadius: '50%',
                background:   severityColor(s),
                boxShadow:   `0 0 6px ${severityColor(s)}80`,
              }} />
              <span style={{ fontSize: 11, color: T.faint }}>{label}</span>
            </div>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: T.faint }}>
            Mock data · {formatDate('2026-05-29')} – {formatDate('2026-06-01')}
          </span>
        </motion.div>
      </div>
    </div>
  );
}
