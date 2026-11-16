/**
 * Admin Audit Log Design Candidate: AU2 Audit Ledger
 *
 * "Audit Ledger" — a dense filterable/sortable audit-events table + detail drawer.
 * Animated KPI counters (total events, destructive count, distinct actors, today);
 * search (actor/action/target) + filters (actor, action-type, severity, date range);
 * sortable columns (time, actor, action); FLIP row reorder on sort/filter;
 * row → detail drawer slides in (spring) showing actor, action, target, IP,
 * full timestamp, metadata (pretty JSON); CSV-export button (mock).
 *
 * Action severity colour-coding:
 *   destructive (user.suspend, user.impersonate, peer.deactivate) → danger (#ff5c7a)
 *   mutation    (plan.update, pool.assign, settings.update, llm.cap_update,
 *               sequence.pause, payment.export)                    → warning (#FF8A4B)
 *   read/login  (login)                                            → success (#3ddc97)
 *
 * Self-contained: inline style={{}} only, mock data only.
 * Only @/lib/format is imported from @/. Dates via formatDate/formatDateTime.
 * Aurora Glass dark palette — warm amber only. No purple/violet/blue/teal/cyan.
 * Build-safe: no unused imports/vars, all array accesses guarded, no bare any.
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
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ShieldAlert,
  Shield,
  UserX,
  UserCheck,
  Activity,
  Settings,
  Cpu,
  LogIn,
  Download,
  Filter,
  Clock,
  User,
  Globe,
  FileText,
  CheckCircle2,
  Zap,
  ArrowRight,
  Calendar,
  Hash,
  Info,
  MonitorDot,
} from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/format';

// ─── Design tokens ──────────────────────────────────────────────────────────
const T = {
  text:        '#ffffff' as const,
  dim:         'rgba(255,255,255,0.62)' as const,
  faint:       'rgba(255,255,255,0.40)' as const,
  ghost:       'rgba(255,255,255,0.18)' as const,
  hairline:    'rgba(255,255,255,0.08)' as const,
  hairlineSm:  'rgba(255,255,255,0.05)' as const,
  accent:      '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim:   'rgba(242,101,34,0.18)' as const,
  success:     '#3ddc97' as const,
  successDim:  'rgba(61,220,151,0.14)' as const,
  danger:      '#ff5c7a' as const,
  dangerDim:   'rgba(255,92,122,0.14)' as const,
  warning:     '#FF8A4B' as const,
  warningDim:  'rgba(255,138,75,0.14)' as const,
  neutral:     'rgba(255,255,255,0.32)' as const,
  neutralDim:  'rgba(255,255,255,0.07)' as const,
  glass: {
    background:           'rgba(255,255,255,0.05)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
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
    background:           'rgba(14,12,20,0.92)',
    border:               '1px solid rgba(255,255,255,0.13)',
    backdropFilter:       'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
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

// ─── Action severity + colour ────────────────────────────────────────────────
type Severity = 'destructive' | 'mutation' | 'login';

const ACTION_SEVERITY: Record<string, Severity> = {
  'user.suspend':      'destructive',
  'user.impersonate':  'destructive',
  'peer.deactivate':   'destructive',
  'plan.update':       'mutation',
  'pool.assign':       'mutation',
  'sequence.pause':    'mutation',
  'payment.export':    'mutation',
  'settings.update':   'mutation',
  'llm.cap_update':    'mutation',
  'login':             'login',
};

function severityOf(action: string): Severity {
  return ACTION_SEVERITY[action] ?? 'mutation';
}

function severityColor(sev: Severity): string {
  if (sev === 'destructive') return T.danger;
  if (sev === 'mutation')    return T.warning;
  return T.success;
}

function severityBg(sev: Severity): string {
  if (sev === 'destructive') return T.dangerDim;
  if (sev === 'mutation')    return T.warningDim;
  return T.successDim;
}

function severityLabel(sev: Severity): string {
  if (sev === 'destructive') return 'Destructive';
  if (sev === 'mutation')    return 'Mutation';
  return 'Read';
}

function SeverityIcon({ sev, size = 13 }: { sev: Severity; size?: number }) {
  if (sev === 'destructive') return <ShieldAlert size={size} />;
  if (sev === 'mutation')    return <Zap size={size} />;
  return <CheckCircle2 size={size} />;
}

function ActionIcon({ action, size = 14 }: { action: string; size?: number }) {
  if (action === 'user.suspend')     return <UserX size={size} />;
  if (action === 'user.impersonate') return <UserCheck size={size} />;
  if (action === 'peer.deactivate')  return <MonitorDot size={size} />;
  if (action === 'plan.update')      return <Activity size={size} />;
  if (action === 'pool.assign')      return <Shield size={size} />;
  if (action === 'sequence.pause')   return <Clock size={size} />;
  if (action === 'payment.export')   return <Download size={size} />;
  if (action === 'settings.update')  return <Settings size={size} />;
  if (action === 'llm.cap_update')   return <Cpu size={size} />;
  if (action === 'login')            return <LogIn size={size} />;
  return <FileText size={size} />;
}

// ─── Types ───────────────────────────────────────────────────────────────────
type ActorRole = 'super_admin' | 'admin' | 'system';

interface AuditActor {
  email: string;
  role: ActorRole;
}

interface AuditEvent {
  id:        string;
  ts:        string;   // ISO timestamp
  actor:     AuditActor;
  action:    string;
  targetLabel: string;
  targetId:  string;
  ip:        string;
  metadata:  Record<string, unknown>;
}

type SortKey = 'ts' | 'actor' | 'action' | 'severity';
type SortDir = 'asc' | 'desc';

// ─── Mock data (22 events) ───────────────────────────────────────────────────
const MOCK_EVENTS: AuditEvent[] = [
  {
    id: 'evt_001',
    ts: '2026-06-01T08:02:14.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'user.suspend',
    targetLabel: 'jin@arclamp.co',
    targetId: 'usr_991a4',
    ip: '49.32.21.144',
    metadata: { reason: 'repeated payment failures', attempts: 3, plan: 'Starter' },
  },
  {
    id: 'evt_002',
    ts: '2026-06-01T07:55:49.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'user.impersonate',
    targetLabel: 'alex@brightwave.io',
    targetId: 'usr_a1b2c',
    ip: '49.32.21.144',
    metadata: { session_id: 'imp_8f3k', duration_s: 312, workspace: 'BrightWave Media' },
  },
  {
    id: 'evt_003',
    ts: '2026-06-01T07:44:21.000Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'plan.update',
    targetLabel: 'Growth Plan',
    targetId: 'plan_growth_v2',
    ip: '103.47.88.20',
    metadata: { field: 'price_monthly_inr', before: 6499, after: 7299, currency: 'INR' },
  },
  {
    id: 'evt_004',
    ts: '2026-06-01T07:30:05.000Z',
    actor: { email: 'system', role: 'system' },
    action: 'peer.deactivate',
    targetLabel: 'pulse.warm.14@warmnet.io',
    targetId: 'peer_14',
    ip: '127.0.0.1',
    metadata: { reputation_score: 0.11, threshold: 0.30, reason: 'below_min_reputation', pool: 'default' },
  },
  {
    id: 'evt_005',
    ts: '2026-06-01T07:14:38.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'pool.assign',
    targetLabel: 'Acme Corp → Pool-B',
    targetId: 'ws_acme_01',
    ip: '49.32.21.144',
    metadata: { from_pool: 'default', to_pool: 'pool_b', workspace_id: 'ws_acme_01', reason: 'dedicated isolation' },
  },
  {
    id: 'evt_006',
    ts: '2026-06-01T06:58:12.000Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'llm.cap_update',
    targetLabel: 'Starter Plan',
    targetId: 'plan_starter',
    ip: '103.47.88.20',
    metadata: { field: 'llm_token_cap', before: 500000, after: 750000, reason: 'June promotion' },
  },
  {
    id: 'evt_007',
    ts: '2026-06-01T06:40:04.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'sequence.pause',
    targetLabel: 'Cold Outreach Q2 · Velocity Reach',
    targetId: 'seq_vr_12',
    ip: '49.32.21.144',
    metadata: { sequence_name: 'Cold Outreach Q2', workspace: 'Velocity Reach', enrolled: 142, step: 3 },
  },
  {
    id: 'evt_008',
    ts: '2026-06-01T06:22:55.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'login',
    targetLabel: 'admin@warmpulse.app',
    targetId: 'usr_admin_01',
    ip: '49.32.21.144',
    metadata: { method: 'password+totp', user_agent: 'Chrome/124 macOS', session_ttl_h: 8 },
  },
  {
    id: 'evt_009',
    ts: '2026-06-01T06:05:31.000Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'payment.export',
    targetLabel: 'June 2026 receipts CSV',
    targetId: 'export_pay_jun26',
    ip: '103.47.88.20',
    metadata: { rows: 847, format: 'csv', date_range: '2026-06-01 to 2026-06-30', size_kb: 92 },
  },
  {
    id: 'evt_010',
    ts: '2026-06-01T05:48:19.000Z',
    actor: { email: 'system', role: 'system' },
    action: 'peer.deactivate',
    targetLabel: 'pulse.warm.07@warmnet.io',
    targetId: 'peer_07',
    ip: '127.0.0.1',
    metadata: { reputation_score: 0.24, threshold: 0.30, reason: 'below_min_reputation', bounce_rate: 0.41 },
  },
  {
    id: 'evt_011',
    ts: '2026-06-01T05:30:00.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'settings.update',
    targetLabel: 'Platform · SMTP rate limits',
    targetId: 'cfg_smtp_rate',
    ip: '49.32.21.144',
    metadata: { key: 'smtp.max_sends_per_min', before: 30, after: 45, scope: 'platform' },
  },
  {
    id: 'evt_012',
    ts: '2026-05-31T22:14:07.000Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'plan.update',
    targetLabel: 'Agency Plan',
    targetId: 'plan_agency',
    ip: '103.47.88.20',
    metadata: { field: 'mailboxes_included', before: 10, after: 15, plan: 'Agency' },
  },
  {
    id: 'evt_013',
    ts: '2026-05-31T21:50:44.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'user.suspend',
    targetLabel: 'tomasz@inboxforge.pl',
    targetId: 'usr_b3c4d',
    ip: '49.32.21.144',
    metadata: { reason: 'ToS violation — spam complaints', complaints: 7, plan: 'Starter' },
  },
  {
    id: 'evt_014',
    ts: '2026-05-31T20:32:19.000Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'pool.assign',
    targetLabel: 'InboxForge → Pool-C',
    targetId: 'ws_inbox_01',
    ip: '103.47.88.20',
    metadata: { from_pool: 'default', to_pool: 'pool_c', workspace_id: 'ws_inbox_01', reason: 'spam isolation' },
  },
  {
    id: 'evt_015',
    ts: '2026-05-31T19:18:55.000Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'login',
    targetLabel: 'ops@warmpulse.app',
    targetId: 'usr_ops_01',
    ip: '103.47.88.20',
    metadata: { method: 'password', user_agent: 'Firefox/126 Windows', session_ttl_h: 4 },
  },
  {
    id: 'evt_016',
    ts: '2026-05-31T18:05:33.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'llm.cap_update',
    targetLabel: 'Pro Plus Plan',
    targetId: 'plan_proplus',
    ip: '49.32.21.144',
    metadata: { field: 'llm_token_cap', before: 2000000, after: 2500000, reason: 'upsell trial' },
  },
  {
    id: 'evt_017',
    ts: '2026-05-31T16:44:11.000Z',
    actor: { email: 'system', role: 'system' },
    action: 'peer.deactivate',
    targetLabel: 'pulse.warm.22@warmnet.io',
    targetId: 'peer_22',
    ip: '127.0.0.1',
    metadata: { reputation_score: 0.18, threshold: 0.30, reason: 'below_min_reputation', day_age: 12 },
  },
  {
    id: 'evt_018',
    ts: '2026-05-31T15:30:27.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'sequence.pause',
    targetLabel: 'Investor Warm-up · SendLoop Labs',
    targetId: 'seq_sl_04',
    ip: '49.32.21.144',
    metadata: { sequence_name: 'Investor Warm-up', workspace: 'SendLoop Labs', enrolled: 28, step: 2 },
  },
  {
    id: 'evt_019',
    ts: '2026-05-31T14:15:09.000Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'payment.export',
    targetLabel: 'May 2026 receipts CSV',
    targetId: 'export_pay_may26',
    ip: '103.47.88.20',
    metadata: { rows: 792, format: 'csv', date_range: '2026-05-01 to 2026-05-31', size_kb: 87 },
  },
  {
    id: 'evt_020',
    ts: '2026-05-31T13:02:41.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'settings.update',
    targetLabel: 'Platform · Warmup window hours',
    targetId: 'cfg_warmup_window',
    ip: '49.32.21.144',
    metadata: { key: 'warmup.window_start_utc', before: 6, after: 5, key2: 'warmup.window_end_utc', before2: 20, after2: 22 },
  },
  {
    id: 'evt_021',
    ts: '2026-05-31T11:48:53.000Z',
    actor: { email: 'ops@warmpulse.app', role: 'admin' },
    action: 'user.impersonate',
    targetLabel: 'priya@velocityreach.in',
    targetId: 'usr_d4e5f',
    ip: '103.47.88.20',
    metadata: { session_id: 'imp_9g4m', duration_s: 188, workspace: 'Velocity Reach' },
  },
  {
    id: 'evt_022',
    ts: '2026-05-31T10:30:22.000Z',
    actor: { email: 'admin@warmpulse.app', role: 'super_admin' },
    action: 'plan.update',
    targetLabel: 'Starter Plan',
    targetId: 'plan_starter',
    ip: '49.32.21.144',
    metadata: { field: 'daily_mailbox_quota', before: 25, after: 30, plan: 'Starter' },
  },
];

// ─── Derived constants ───────────────────────────────────────────────────────
const DISTINCT_ACTORS = Array.from(new Set(MOCK_EVENTS.map(e => e.actor.email)));
const ALL_ACTIONS     = Array.from(new Set(MOCK_EVENTS.map(e => e.action))).sort();

const TODAY_PREFIX = '2026-06-01';
const TODAY_COUNT  = MOCK_EVENTS.filter(e => e.ts.startsWith(TODAY_PREFIX)).length;
const DESTRUCTIVE_COUNT = MOCK_EVENTS.filter(e => severityOf(e.action) === 'destructive').length;

// ─── Animated counter ────────────────────────────────────────────────────────
function useAnimatedCounter(target: number): string {
  const mv      = useMotionValue(0);
  const [val, setVal] = useState('0');
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(mv, target, {
      duration: 1.3,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) { setVal(String(Math.round(latest))); },
    });
    return () => { ctrlRef.current?.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return val;
}

// ─── Framer variants ─────────────────────────────────────────────────────────
const rowVariants: Variants = {
  hidden:  { opacity: 0, y: 14, scale: 0.985 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.038, duration: 0.36, ease: [0.22, 1, 0.36, 1] },
  }),
  exit: { opacity: 0, y: -8, scale: 0.975, transition: { duration: 0.20 } },
};

const drawerVariants: Variants = {
  hidden: {
    x: '100%', opacity: 0,
    transition: { type: 'spring', stiffness: 340, damping: 38 },
  },
  visible: {
    x: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 260, damping: 28 },
  },
  exit: {
    x: '100%', opacity: 0,
    transition: { type: 'spring', stiffness: 340, damping: 38 },
  },
};

const backdropVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.20 } },
  exit:    { opacity: 0, transition: { duration: 0.16 } },
};

const toastVariants: Variants = {
  hidden:  { opacity: 0, y: 28, scale: 0.92 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { type: 'spring', stiffness: 340, damping: 28 } },
  exit:    { opacity: 0, y: 18, scale: 0.93, transition: { duration: 0.20 } },
};

const chipVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.80 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 28 } },
  exit:    { opacity: 0, scale: 0.80, transition: { duration: 0.14 } },
};

// ─── Actor avatar ─────────────────────────────────────────────────────────────
function ActorAvatar({ actor, size = 30 }: { actor: AuditActor; size?: number }) {
  const isSystem = actor.role === 'system';
  const initials = isSystem ? '⚙' : actor.email.slice(0, 2).toUpperCase();
  const bg = isSystem
    ? 'rgba(255,255,255,0.10)'
    : actor.role === 'super_admin'
      ? `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`
      : `linear-gradient(135deg, #a06030, #c07040)`;

  return (
    <span style={{
      display:         'inline-flex',
      alignItems:      'center',
      justifyContent:  'center',
      width:           size,
      height:          size,
      borderRadius:    size * 0.32,
      background:      bg,
      fontSize:        isSystem ? size * 0.52 : size * 0.34,
      fontWeight:      800,
      color:           T.text,
      flexShrink:      0,
      letterSpacing:   '-0.01em',
    }}>
      {initials}
    </span>
  );
}

// ─── Role pill ────────────────────────────────────────────────────────────────
function RolePill({ role }: { role: ActorRole }) {
  const color = role === 'super_admin' ? T.accent
              : role === 'admin'       ? T.accentLight
              : T.neutral;
  const label = role === 'super_admin' ? 'Super Admin'
              : role === 'admin'       ? 'Admin'
              : 'System';
  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           3,
      padding:       '2px 7px',
      borderRadius:  6,
      fontSize:      10,
      fontWeight:    700,
      letterSpacing: '0.04em',
      color,
      background:    `${color}18`,
      border:        `1px solid ${color}40`,
      whiteSpace:    'nowrap',
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────
function SeverityBadge({ sev }: { sev: Severity }) {
  const color = severityColor(sev);
  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           4,
      padding:       '3px 8px',
      borderRadius:  20,
      fontSize:      10,
      fontWeight:    700,
      letterSpacing: '0.04em',
      color,
      background:    severityBg(sev),
      border:        `1px solid ${color}38`,
      whiteSpace:    'nowrap',
    }}>
      <SeverityIcon sev={sev} size={10} />
      {severityLabel(sev)}
    </span>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, color, delay,
}: {
  icon: ReactNode; label: string; value: string;
  sub?: string; color: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3, scale: 1.024, transition: { duration: 0.20 } }}
      style={{
        ...T.glassCard,
        padding:  '18px 22px',
        flex:     '1 1 160px',
        minWidth: 148,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <motion.div
        style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit',
          background: `radial-gradient(ellipse 60% 55% at 8% 15%, ${color}20 0%, transparent 68%)`,
          pointerEvents: 'none',
        }}
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 9,
            background: `${color}20`, color, flexShrink: 0,
          }}>
            {icon}
          </span>
          <span style={{ fontSize: 11, color: T.dim, fontWeight: 500 }}>{label}</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 11, color: T.faint, marginTop: 5 }}>{sub}</div>}
      </div>
    </motion.div>
  );
}

// ─── Sortable column header ───────────────────────────────────────────────────
function ColHead({
  label, col, sortKey, sortDir, onSort,
}: {
  label: string; col: SortKey;
  sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <motion.th
      onClick={() => onSort(col)}
      whileHover={{ color: T.accentLight }}
      style={{
        padding:       '10px 13px',
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

// ─── Pretty JSON renderer ────────────────────────────────────────────────────
function PrettyJson({ data }: { data: Record<string, unknown> }) {
  const lines = JSON.stringify(data, null, 2).split('\n');
  return (
    <pre style={{
      margin: 0, padding: '12px 14px',
      background:   'rgba(0,0,0,0.28)',
      borderRadius: 10,
      border:       `1px solid ${T.hairline}`,
      fontSize:     12,
      color:        T.dim,
      overflowX:    'auto',
      lineHeight:   1.7,
      fontFamily:   '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    }}>
      {lines.map((ln, i) => {
        const isKey    = /^\s+"[^"]+":/.test(ln);
        const isStr    = /"[^"]+"$/.test(ln.trim());
        const isNum    = /\d+[,]?$/.test(ln.trim()) && !isStr;
        const isBool   = /(true|false)[,]?$/.test(ln.trim());
        const color    = isKey ? T.accentLight : isNum ? T.success : isBool ? T.warning : T.dim;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.04 + i * 0.025, duration: 0.22 }}
            style={{ color }}
          >
            {ln}
          </motion.div>
        );
      })}
    </pre>
  );
}

// ─── Event detail drawer ──────────────────────────────────────────────────────
function AuditDrawer({
  event,
  onClose,
  onExport,
}: {
  event: AuditEvent;
  onClose: () => void;
  onExport: (msg: string) => void;
}) {
  const sev   = severityOf(event.action);
  const color = severityColor(sev);

  const metaItems: Array<{ icon: ReactNode; label: string; value: string }> = [
    { icon: <Hash size={12} />,      label: 'Event ID',   value: event.id },
    { icon: <Clock size={12} />,     label: 'Timestamp',  value: formatDateTime(event.ts) },
    { icon: <Calendar size={12} />,  label: 'Date',       value: formatDate(event.ts) },
    { icon: <User size={12} />,      label: 'Actor',      value: event.actor.email },
    { icon: <Globe size={12} />,     label: 'IP Address', value: event.ip },
    { icon: <FileText size={12} />,  label: 'Target ID',  value: event.targetId },
  ];

  return (
    <>
      <motion.div
        key="backdrop"
        variants={backdropVariants}
        initial="hidden" animate="visible" exit="hidden"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 200,
        }}
      />

      <motion.div
        key="drawer"
        variants={drawerVariants}
        initial="hidden" animate="visible" exit="exit"
        style={{
          position:   'fixed',
          top: 0, right: 0, bottom: 0,
          width:      500,
          maxWidth:   '96vw',
          zIndex:     201,
          background: 'rgba(12,10,18,0.98)',
          borderLeft: `1px solid rgba(255,255,255,0.10)`,
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          overflowY:  'auto',
          display:    'flex',
          flexDirection: 'column',
        }}
      >
        {/* drawer header */}
        <div style={{
          padding:      '20px 22px 16px',
          borderBottom: `1px solid ${T.hairline}`,
          display:      'flex',
          alignItems:   'flex-start',
          justifyContent: 'space-between',
          flexShrink:   0,
          position:     'sticky',
          top:          0,
          zIndex:       10,
          background:   'rgba(12,10,18,0.98)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <motion.div
              style={{
                width: 42, height: 42, borderRadius: 13,
                background: `${color}22`,
                border:     `1px solid ${color}40`,
                display:    'flex', alignItems: 'center', justifyContent: 'center',
                color,
              }}
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ActionIcon action={event.action} size={18} />
            </motion.div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 3 }}>
                {event.action}
              </div>
              <div style={{ fontSize: 12, color: T.faint }}>→ {event.targetLabel}</div>
            </div>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.12, rotate: 90 }}
            whileTap={{ scale: 0.94 }}
            style={{
              width: 30, height: 30, borderRadius: 9,
              background: T.ghost, border: `1px solid ${T.hairline}`,
              color: T.dim, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={13} />
          </motion.button>
        </div>

        {/* body */}
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>

          {/* severity + actor row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.30 }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
          >
            <SeverityBadge sev={sev} />
            <ActorAvatar actor={event.actor} size={26} />
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{event.actor.email}</span>
            <RolePill role={event.actor.role} />
          </motion.div>

          {/* meta grid */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.10, duration: 0.30 }}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
          >
            {metaItems.map(item => (
              <div
                key={item.label}
                style={{
                  ...T.glassTight,
                  padding: '10px 13px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.faint, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {item.icon}{item.label}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, wordBreak: 'break-all' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </motion.div>

          {/* metadata JSON */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.30 }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 11, color: T.faint, fontWeight: 600,
              letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8,
            }}>
              <Info size={12} /> Metadata
            </div>
            <PrettyJson data={event.metadata} />
          </motion.div>

          {/* export button */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.30 }}
          >
            <motion.button
              onClick={() => onExport(`Exported event ${event.id} as CSV`)}
              whileHover={{ scale: 1.02, backgroundColor: `${T.accent}22` }}
              whileTap={{ scale: 0.97 }}
              style={{
                display:     'flex',
                alignItems:  'center',
                justifyContent: 'center',
                gap:         8,
                width:       '100%',
                padding:     '10px 0',
                borderRadius: 10,
                background:  T.accentDim,
                border:      `1px solid ${T.accent}44`,
                color:       T.accentLight,
                fontSize:    13,
                fontWeight:  700,
                cursor:      'pointer',
              }}
            >
              <Download size={14} />
              Export this event as CSV
            </motion.button>
          </motion.div>

          {/* timeline context */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.30 }}
            style={{
              ...T.glassTight,
              padding: '13px 15px',
            }}
          >
            <div style={{ fontSize: 11, color: T.faint, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
              Context
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                { label: 'Action category', value: event.action.split('.')[0] ?? event.action },
                { label: 'Severity',        value: severityLabel(sev) },
                { label: 'Actor role',      value: event.actor.role },
                { label: 'Source IP',       value: event.ip },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 12, color: T.faint }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{row.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────
interface ToastItem { id: string; msg: string; }
let _toastId = 0;

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmAudAU2Ledger() {
  const [search,        setSearch]        = useState('');
  const [filterActor,   setFilterActor]   = useState<string>('All');
  const [filterAction,  setFilterAction]  = useState<string>('All');
  const [filterSev,     setFilterSev]     = useState<Severity | 'All'>('All');
  const [filterDate,    setFilterDate]    = useState<'all' | 'today' | 'yesterday'>('all');
  const [sortKey,       setSortKey]       = useState<SortKey>('ts');
  const [sortDir,       setSortDir]       = useState<SortDir>('desc');
  const [selected,      setSelected]      = useState<AuditEvent | null>(null);
  const [toasts,        setToasts]        = useState<ToastItem[]>([]);

  // KPI counters
  const totalCount    = useAnimatedCounter(MOCK_EVENTS.length);
  const destCount     = useAnimatedCounter(DESTRUCTIVE_COUNT);
  const actorCount    = useAnimatedCounter(DISTINCT_ACTORS.length);
  const todayCount    = useAnimatedCounter(TODAY_COUNT);

  const showToast = useCallback((msg: string) => {
    const id = String(++_toastId);
    setToasts(p => [...p, { id, msg }]);
    const t = window.setTimeout(() => {
      setToasts(p => p.filter(x => x.id !== id));
    }, 3200);
    return () => window.clearTimeout(t);
  }, []);

  // CSV export (mock)
  const handleBulkExport = useCallback(() => {
    showToast(`Exported ${MOCK_EVENTS.length} audit events as CSV`);
  }, [showToast]);

  // filter + sort
  const visible = MOCK_EVENTS
    .filter(e => {
      const q = search.toLowerCase();
      const matchQ = !q
        || e.actor.email.toLowerCase().includes(q)
        || e.action.toLowerCase().includes(q)
        || e.targetLabel.toLowerCase().includes(q)
        || e.id.toLowerCase().includes(q);

      const matchActor  = filterActor  === 'All' || e.actor.email === filterActor;
      const matchAction = filterAction === 'All' || e.action === filterAction;
      const matchSev    = filterSev    === 'All' || severityOf(e.action) === filterSev;
      const matchDate   = filterDate   === 'all'
        || (filterDate === 'today'     && e.ts.startsWith('2026-06-01'))
        || (filterDate === 'yesterday' && e.ts.startsWith('2026-05-31'));

      return matchQ && matchActor && matchAction && matchSev && matchDate;
    })
    .sort((a, b) => {
      let av: string = '';
      let bv: string = '';
      if (sortKey === 'ts')       { av = a.ts;            bv = b.ts; }
      if (sortKey === 'actor')    { av = a.actor.email;   bv = b.actor.email; }
      if (sortKey === 'action')   { av = a.action;        bv = b.action; }
      if (sortKey === 'severity') {
        const order: Record<Severity, number> = { destructive: 2, mutation: 1, login: 0 };
        const na = order[severityOf(a.action)] ?? 0;
        const nb = order[severityOf(b.action)] ?? 0;
        return sortDir === 'asc' ? na - nb : nb - na;
      }
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  const filterBtnBase: CSSProperties = {
    padding:      '4px 11px',
    borderRadius: 8,
    fontSize:     11,
    fontWeight:   600,
    cursor:       'pointer',
    border:       `1px solid ${T.hairline}`,
    background:   'transparent',
    color:        T.dim,
    whiteSpace:   'nowrap',
  };

  const hasFilters = search || filterActor !== 'All' || filterAction !== 'All'
                  || filterSev !== 'All' || filterDate !== 'all';

  return (
    <div style={{
      minHeight:  '100vh',
      background: 'transparent',
      color:      T.text,
      fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
      padding:    '30px 26px 60px',
      position:   'relative',
    }}>

      {/* background glows */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 180,
        background: `linear-gradient(to bottom, ${T.accentDim} 0%, transparent 100%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: 700, height: 220,
        background: `radial-gradient(ellipse 80% 50% at 50% 100%, rgba(242,101,34,0.10) 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* page content — zIndex keeps it above glows */}
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* page title + export */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <motion.div
              style={{
                width: 40, height: 40, borderRadius: 13,
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <FileText size={18} color="#fff" />
            </motion.div>
            <div>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: T.text }}>
                Audit Ledger
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: T.faint }}>
                Super-admin action trail · all destructive &amp; mutative events
              </p>
            </div>
          </div>
          <motion.button
            onClick={handleBulkExport}
            whileHover={{ scale: 1.04, backgroundColor: `${T.accent}28` }}
            whileTap={{ scale: 0.96 }}
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         7,
              padding:     '8px 16px',
              borderRadius: 10,
              background:  T.accentDim,
              border:      `1px solid ${T.accent}44`,
              color:       T.accentLight,
              fontSize:    12,
              fontWeight:  700,
              cursor:      'pointer',
            }}
          >
            <Download size={13} />
            Export CSV
          </motion.button>
        </motion.div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 26 }}>
          <KpiCard
            icon={<Activity size={15} />}
            label="Total Events"
            value={totalCount}
            sub="full audit trail"
            color={T.accent}
            delay={0.05}
          />
          <KpiCard
            icon={<ShieldAlert size={15} />}
            label="Destructive"
            value={destCount}
            sub="high-impact actions"
            color={T.danger}
            delay={0.10}
          />
          <KpiCard
            icon={<User size={15} />}
            label="Distinct Actors"
            value={actorCount}
            sub="emails + system"
            color={T.warning}
            delay={0.15}
          />
          <KpiCard
            icon={<Clock size={15} />}
            label="Today"
            value={todayCount}
            sub={`events on ${formatDate('2026-06-01')}`}
            color={T.success}
            delay={0.20}
          />
        </div>

        {/* filter + search bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.36 }}
          style={{
            ...T.glass,
            padding:      '13px 16px',
            marginBottom: 12,
            display:      'flex',
            flexWrap:     'wrap',
            gap:          10,
            alignItems:   'center',
          }}
        >
          {/* search */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 170 }}>
            <Search size={13} style={{
              position: 'absolute', left: 11, top: '50%',
              transform: 'translateY(-50%)', color: T.faint,
            }} />
            <input
              placeholder="Search actor, action, target, event ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 11px 7px 32px',
                borderRadius: 9,
                background: T.ghost, border: `1px solid ${T.hairline}`,
                color: T.text, fontSize: 12, outline: 'none', boxSizing: 'border-box',
              }}
            />
            {search && (
              <motion.button
                onClick={() => setSearch('')}
                whileTap={{ scale: 0.9 }}
                style={{
                  position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: T.faint, cursor: 'pointer',
                  display: 'flex', padding: 2,
                }}
              >
                <X size={11} />
              </motion.button>
            )}
          </div>

          {/* actor filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Filter size={11} style={{ color: T.faint, flexShrink: 0 }} />
            {(['All', ...DISTINCT_ACTORS] as const).map(a => (
              <motion.button
                key={a}
                onClick={() => setFilterActor(a)}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                style={{
                  ...filterBtnBase,
                  background: filterActor === a ? T.accentDim : 'transparent',
                  border:     filterActor === a ? `1px solid ${T.accentLight}55` : `1px solid ${T.hairline}`,
                  color:      filterActor === a ? T.accentLight : T.dim,
                }}
              >
                {a === 'All' ? 'All actors' : a.split('@')[0] ?? a}
              </motion.button>
            ))}
          </div>

          {/* severity filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {(['All', 'destructive', 'mutation', 'login'] as const).map(s => {
              const c = s === 'All' ? T.dim : severityColor(s);
              return (
                <motion.button
                  key={s}
                  onClick={() => setFilterSev(s)}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  style={{
                    ...filterBtnBase,
                    background: filterSev === s ? `${c}18` : 'transparent',
                    border:     filterSev === s ? `1px solid ${c}55` : `1px solid ${T.hairline}`,
                    color:      filterSev === s ? c : T.dim,
                  }}
                >
                  {s === 'All' ? 'All severity' : severityLabel(s)}
                </motion.button>
              );
            })}
          </div>

          {/* date filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {([
              { v: 'all',       label: 'All dates' },
              { v: 'today',     label: `Today (${formatDate('2026-06-01')})` },
              { v: 'yesterday', label: `Yesterday (${formatDate('2026-05-31')})` },
            ] as const).map(d => (
              <motion.button
                key={d.v}
                onClick={() => setFilterDate(d.v)}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                style={{
                  ...filterBtnBase,
                  background: filterDate === d.v ? T.accentDim : 'transparent',
                  border:     filterDate === d.v ? `1px solid ${T.accentLight}55` : `1px solid ${T.hairline}`,
                  color:      filterDate === d.v ? T.accentLight : T.dim,
                }}
              >
                {d.label}
              </motion.button>
            ))}
          </div>

          {/* action dropdown (simplified as chips for top 5 + All) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <motion.button
              onClick={() => setFilterAction('All')}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              style={{
                ...filterBtnBase,
                background: filterAction === 'All' ? T.accentDim : 'transparent',
                border:     filterAction === 'All' ? `1px solid ${T.accentLight}55` : `1px solid ${T.hairline}`,
                color:      filterAction === 'All' ? T.accentLight : T.dim,
              }}
            >
              All actions
            </motion.button>
            {ALL_ACTIONS.slice(0, 5).map(a => (
              <motion.button
                key={a}
                onClick={() => setFilterAction(a)}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                style={{
                  ...filterBtnBase,
                  background: filterAction === a ? `${severityColor(severityOf(a))}18` : 'transparent',
                  border:     filterAction === a ? `1px solid ${severityColor(severityOf(a))}55` : `1px solid ${T.hairline}`,
                  color:      filterAction === a ? severityColor(severityOf(a)) : T.dim,
                }}
              >
                {a}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* active filter chips + result count */}
        <AnimatePresence>
          {hasFilters && (
            <motion.div
              variants={chipVariants}
              initial="hidden" animate="visible" exit="exit"
              style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}
            >
              <span style={{ fontSize: 11, color: T.faint }}>
                {visible.length} of {MOCK_EVENTS.length} events
              </span>
              {search && (
                <motion.span
                  layout
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 9px', borderRadius: 20,
                    background: T.accentDim, border: `1px solid ${T.accentLight}44`,
                    fontSize: 11, color: T.accentLight, fontWeight: 600,
                  }}
                >
                  "{search}"
                  <X size={9} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />
                </motion.span>
              )}
              {filterSev !== 'All' && (
                <motion.span
                  layout
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 9px', borderRadius: 20,
                    background: `${severityColor(filterSev)}18`,
                    border: `1px solid ${severityColor(filterSev)}44`,
                    fontSize: 11, color: severityColor(filterSev), fontWeight: 600,
                  }}
                >
                  {severityLabel(filterSev)}
                  <X size={9} style={{ cursor: 'pointer' }} onClick={() => setFilterSev('All')} />
                </motion.span>
              )}
              {(filterActor !== 'All' || filterAction !== 'All' || filterDate !== 'all') && (
                <motion.button
                  layout
                  onClick={() => { setFilterActor('All'); setFilterAction('All'); setFilterDate('all'); setSearch(''); }}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  style={{
                    ...filterBtnBase,
                    fontSize: 10, padding: '2px 9px',
                    color: T.faint, border: `1px solid ${T.hairline}`,
                  }}
                >
                  Clear all
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.30, duration: 0.38 }}
          style={{ ...T.glassCard, overflow: 'hidden' }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 13px', borderBottom: `1px solid ${T.hairline}`, width: 44 }} />
                  <ColHead label="Time"     col="ts"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHead label="Actor"    col="actor"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHead label="Action"   col="action"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th style={{
                    padding: '10px 13px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.05em', textTransform: 'uppercase', color: T.faint,
                    borderBottom: `1px solid ${T.hairline}`, whiteSpace: 'nowrap',
                  }}>Target</th>
                  <th style={{
                    padding: '10px 13px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.05em', textTransform: 'uppercase', color: T.faint,
                    borderBottom: `1px solid ${T.hairline}`, whiteSpace: 'nowrap',
                  }}>IP</th>
                  <ColHead label="Severity" col="severity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th style={{ padding: '10px 13px', borderBottom: `1px solid ${T.hairline}` }} />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {visible.map((evt, idx) => {
                    const sev   = severityOf(evt.action);
                    const color = severityColor(sev);
                    return (
                      <motion.tr
                        key={evt.id}
                        layout
                        variants={rowVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        custom={idx}
                        onClick={() => setSelected(evt)}
                        whileHover={{ backgroundColor: 'rgba(242,101,34,0.05)', transition: { duration: 0.12 } }}
                        style={{ cursor: 'pointer', borderBottom: `1px solid ${T.hairlineSm}` }}
                      >
                        {/* severity indicator strip */}
                        <td style={{ padding: '0 0 0 0', width: 4, position: 'relative' }}>
                          <div style={{
                            width:        4,
                            height:       '100%',
                            minHeight:    44,
                            background:   color,
                            opacity:      0.7,
                            borderRadius: '0 2px 2px 0',
                          }} />
                        </td>

                        {/* timestamp */}
                        <td style={{ padding: '12px 13px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                            {formatDateTime(evt.ts)}
                          </div>
                          <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>
                            {evt.id}
                          </div>
                        </td>

                        {/* actor */}
                        <td style={{ padding: '12px 13px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ActorAvatar actor={evt.actor} size={26} />
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                                {evt.actor.role === 'system' ? 'system' : evt.actor.email.split('@')[0] ?? evt.actor.email}
                              </div>
                              <div style={{ fontSize: 10, color: T.faint }}>
                                {evt.actor.role === 'system' ? 'automated' : evt.actor.role}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* action */}
                        <td style={{ padding: '12px 13px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 26, height: 26, borderRadius: 8,
                              background: `${color}18`, color, flexShrink: 0,
                            }}>
                              <ActionIcon action={evt.action} size={12} />
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                              {evt.action}
                            </span>
                          </div>
                        </td>

                        {/* target */}
                        <td style={{ padding: '12px 13px', maxWidth: 200 }}>
                          <div style={{
                            fontSize: 12, color: T.dim,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {evt.targetLabel}
                          </div>
                        </td>

                        {/* IP */}
                        <td style={{ padding: '12px 13px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, color: T.faint, fontFamily: '"JetBrains Mono", monospace' }}>
                            {evt.ip}
                          </span>
                        </td>

                        {/* severity */}
                        <td style={{ padding: '12px 13px', whiteSpace: 'nowrap' }}>
                          <SeverityBadge sev={sev} />
                        </td>

                        {/* caret */}
                        <td style={{ padding: '12px 13px' }}>
                          <motion.span
                            style={{ color: T.faint, display: 'flex', alignItems: 'center' }}
                            whileHover={{ color: T.accentLight, x: 2 }}
                          >
                            <ArrowRight size={13} />
                          </motion.span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>

                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '44px 0', textAlign: 'center', color: T.faint, fontSize: 14 }}>
                      No audit events match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* table footer */}
          <div style={{
            padding:    '11px 16px',
            borderTop:  `1px solid ${T.hairline}`,
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap:   'wrap',
            gap:        8,
          }}>
            <span style={{ fontSize: 11, color: T.faint }}>
              {visible.length} event{visible.length !== 1 ? 's' : ''} · sorted by{' '}
              <strong style={{ color: T.dim }}>{sortKey}</strong> {sortDir}
            </span>
            <span style={{ fontSize: 11, color: T.faint }}>
              Click any row for full event detail
              <ArrowRight size={9} style={{ display: 'inline', marginLeft: 4, verticalAlign: 'middle' }} />
            </span>
          </div>
        </motion.div>
      </div>

      {/* detail drawer */}
      <AnimatePresence>
        {selected && (
          <AuditDrawer
            key={selected.id}
            event={selected}
            onClose={() => setSelected(null)}
            onExport={msg => showToast(msg)}
          />
        )}
      </AnimatePresence>

      {/* toasts */}
      <div style={{
        position:  'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)',
        display:   'flex', flexDirection: 'column', gap: 7,
        zIndex:    999, pointerEvents: 'none', alignItems: 'center',
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
                padding:       '10px 18px',
                display:       'flex', alignItems: 'center', gap: 9,
                minWidth:      220,
                color:         T.accentLight,
                fontSize:      13, fontWeight: 600,
                borderColor:   `${T.accent}44`,
                boxShadow:     `0 4px 28px rgba(242,101,34,0.18)`,
              }}
            >
              <Download size={13} />
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
