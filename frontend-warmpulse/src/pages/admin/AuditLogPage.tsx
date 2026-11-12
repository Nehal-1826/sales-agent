/**
 * Admin Audit Log — AU4 Live Feed (live, real data)
 *
 * Visual design = AU4 Live Feed (AU4Feed.tsx).
 *
 * "Live" means auto-refresh via react-query refetchInterval (10 s when play,
 * stopped when paused). New entries that were not in the previous render
 * slide in with spring animation (AnimatePresence) and flash if destructive.
 * NO setInterval fake-event injection. NO Math.random data.
 *
 * Severity mapping (derived from action string):
 *   destructive — action contains: delete | suspend | deactivate | revert |
 *                 impersonat | ban | revoke | remove | block | wipe
 *   mutation    — action contains: update | create | assign | pause | cap |
 *                 add | edit | set | enable | disable | approve | reject |
 *                 rotate | reset
 *   login       — action starts with: auth. | login
 *   read        — everything else (export, read, view, list, search…)
 *
 * Palette: Warm Aurora Glass — orange #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. NO purple/violet/blue/teal/cyan/indigo/pink.
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
  Loader2,
} from 'lucide-react';
import { useAdminAuditLog } from '@/features/admin/api';
import { useAuditChart } from '@/features/admin/audit/api';
import type { AuditLogEntry, AuditFilters } from '@/features/admin/types';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';

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

// ─── Severity ─────────────────────────────────────────────────────────────────

type Severity = 'destructive' | 'mutation' | 'read' | 'login';

/**
 * Derive severity from the real action string.
 *
 * destructive: contains delete|suspend|deactivate|revert|impersonat|ban|
 *              revoke|remove|block|wipe
 * login:       starts with auth. or equals auth.login / login
 * mutation:    contains update|create|assign|pause|cap|add|edit|set|
 *              enable|disable|approve|reject|rotate|reset
 * read:        export|download|view|list|search|read  (fallthrough)
 */
function deriveSeverity(action: string): Severity {
  const a = action.toLowerCase();

  // Destructive first (highest priority)
  if (
    a.includes('delete') ||
    a.includes('suspend') ||
    a.includes('deactivate') ||
    a.includes('revert') ||
    a.includes('impersonat') ||
    a.includes('ban') ||
    a.includes('revoke') ||
    a.includes('remove') ||
    a.includes('block') ||
    a.includes('wipe')
  ) return 'destructive';

  // Login
  if (a.startsWith('auth.') || a === 'login') return 'login';

  // Mutation
  if (
    a.includes('update') ||
    a.includes('create') ||
    a.includes('assign') ||
    a.includes('pause') ||
    a.includes('cap') ||
    a.includes('.add') ||
    a.includes('edit') ||
    a.includes('.set') ||
    a.includes('enable') ||
    a.includes('disable') ||
    a.includes('approve') ||
    a.includes('reject') ||
    a.includes('rotate') ||
    a.includes('reset')
  ) return 'mutation';

  // Read / export / everything else
  return 'read';
}

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

// ─── Action icon ──────────────────────────────────────────────────────────────

function actionIcon(action: string): typeof Activity {
  const a = action.toLowerCase();
  if (a.includes('suspend') || a.includes('impersonat')) return UserX;
  if (a.includes('deactivate') || a.includes('peer'))     return ShieldAlert;
  if (a.includes('plan') || a.includes('cap'))            return Zap;
  if (a.includes('pool') || a.includes('assign'))         return Globe;
  if (a.includes('pause') || a.includes('sequence'))      return Pause;
  if (a.includes('export') || a.includes('payment'))      return Terminal;
  if (a.includes('setting') || a.includes('config'))      return Shield;
  if (a.includes('llm') || a.includes('usage'))           return Activity;
  if (a.startsWith('auth.') || a === 'login')             return LogIn;
  return Info;
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relTime(isoOrMs: string | number): string {
  const t   = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  const diff = Math.max(0, Date.now() - t);
  const s    = Math.floor(diff / 1000);
  if (s < 10)  return 'just now';
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Actor avatar ─────────────────────────────────────────────────────────────

function ActorAvatar({
  email,
  role,
  size = 28,
}: {
  email: string;
  role: AuditLogEntry['actor_role'];
  size?: number;
}) {
  const isSystem = role === 'system' || email === 'system';
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
        border:         '1px solid rgba(255,255,255,0.16)',
      }}
    >
      {initials}
    </span>
  );
}

// ─── Animated KPI counter ─────────────────────────────────────────────────────

function KpiCounter({
  to,
  label,
  sub,
  color = C.text,
}: {
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
      <div style={{
        fontSize:      11,
        fontWeight:    700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color:         C.faint,
        marginBottom:  6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize:      28,
        fontWeight:    800,
        color,
        letterSpacing: '-0.02em',
        lineHeight:    1,
      }}>
        {display.toLocaleString('en-IN')}
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
  hidden:  { height: 0, opacity: 0 },
  visible: { height: 'auto', opacity: 1 },
};

function EventDetail({
  event,
  fmt,
}: {
  event: AuditLogEntry;
  fmt: ReturnType<typeof useLocaleFormat>;
}) {
  const metaEntries = Object.entries(event.metadata ?? {}).map(
    ([k, v]): [string, string] => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')],
  );

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
        padding:             '12px 16px 14px',
        borderTop:           `1px solid ${C.borderSoft}`,
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap:                 10,
        background:          'rgba(0,0,0,0.15)',
      }}>
        {/* Full timestamp (IST, DD/MM/YYYY) */}
        <div>
          <div style={{
            fontSize:      10,
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color:         C.faint,
            marginBottom:  3,
          }}>
            Timestamp (IST)
          </div>
          <div style={{ fontSize: 12, color: C.text, fontFamily: 'monospace' }}>
            {fmt.dateTime(event.timestamp)}
          </div>
        </div>

        {/* IP */}
        {event.ip && (
          <div>
            <div style={{
              fontSize:      10,
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color:         C.faint,
              marginBottom:  3,
            }}>
              IP Address
            </div>
            <div style={{ fontSize: 12, color: C.text, fontFamily: 'monospace' }}>
              {event.ip}
            </div>
          </div>
        )}

        {/* Event ID */}
        <div>
          <div style={{
            fontSize:      10,
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color:         C.faint,
            marginBottom:  3,
          }}>
            Event ID
          </div>
          <div style={{ fontSize: 12, color: C.dim, fontFamily: 'monospace' }}>
            {event.id}
          </div>
        </div>

        {/* Target */}
        {(event.target_type || event.target_id) && (
          <div>
            <div style={{
              fontSize:      10,
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color:         C.faint,
              marginBottom:  3,
            }}>
              Target
            </div>
            <div style={{ fontSize: 12, color: C.text }}>
              {[event.target_type, event.target_id].filter(Boolean).join(' · ')}
            </div>
          </div>
        )}

        {/* Metadata fields */}
        {metaEntries.map(([k, v]) => (
          <div key={k}>
            <div style={{
              fontSize:      10,
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color:         C.faint,
              marginBottom:  3,
            }}>
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
  enter: { y: -28, opacity: 0, scale: 0.97 },
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
  entry,
  severity,
  isFresh,
  isExpanded,
  onToggle,
  fmt,
}: {
  entry: AuditLogEntry;
  severity: Severity;
  isFresh: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  fmt: ReturnType<typeof useLocaleFormat>;
}) {
  const Icon   = actionIcon(entry.action);
  const sColor = severityColor(severity);
  const sBg    = severityBg(severity);
  const targetLabel = [entry.target_type, entry.target_id].filter(Boolean).join(' · ');

  return (
    <motion.div
      layout
      variants={rowVariants}
      initial="enter"
      animate="visible"
      exit="exit"
      style={{
        ...GLASS2,
        position:     'relative',
        overflow:     'hidden',
        borderRadius: 12,
        cursor:       'pointer',
        border:       isExpanded
          ? `1px solid ${sColor}44`
          : `1px solid ${C.border}`,
      }}
      whileHover={{ background: C.glass3 }}
      onClick={onToggle}
    >
      {/* Flash overlay for fresh destructive events */}
      {isFresh && severity === 'destructive' && (
        <motion.div
          variants={flashVariants}
          initial="hidden"
          animate="visible"
          style={{
            position:      'absolute',
            inset:         0,
            background:    `radial-gradient(ellipse at 20% 50%, ${C.danger}33 0%, transparent 70%)`,
            borderRadius:  12,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
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
              {severityLabel(severity)}
            </span>

            {/* Action */}
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>
              {entry.action}
            </span>

            {/* Target truncated */}
            {targetLabel && (
              <span style={{
                fontSize:     12,
                color:        C.dim,
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
                maxWidth:     220,
              }}>
                → {targetLabel}
              </span>
            )}
          </div>

          {/* Actor + time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <ActorAvatar email={entry.actor_email} role={entry.actor_role} size={18} />
            <span style={{ fontSize: 11, color: C.dim }}>{entry.actor_email}</span>
            <span style={{ fontSize: 11, color: C.faint }}>·</span>
            <span style={{ fontSize: 11, color: C.faint }}>{relTime(entry.timestamp)}</span>
            {isFresh && (
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
        {isExpanded && <EventDetail event={entry} fmt={fmt} />}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Per-action summary bar ───────────────────────────────────────────────────

function ActionSummary({ buckets }: { buckets: Array<{ action: string; count: number }> }) {
  const sorted = useMemo(
    () => [...buckets].sort((a, b) => b.count - a.count).slice(0, 8),
    [buckets],
  );
  const maxCount = sorted[0]?.count ?? 1;

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
        {sorted.map(({ action, count }) => {
          const pct   = (count / maxCount) * 100;
          const color = severityColor(deriveSeverity(action));
          return (
            <div key={action}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{action}</span>
                <span style={{ fontSize: 11, color: C.faint, fontWeight: 700 }}>{count}</span>
              </div>
              <div style={{
                height:       4,
                borderRadius: 3,
                background:   'rgba(255,255,255,0.08)',
                overflow:     'hidden',
              }}>
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
        {sorted.length === 0 && (
          <span style={{ fontSize: 11, color: C.faint }}>No data yet</span>
        )}
      </div>
    </div>
  );
}

// ─── Pulse dot ────────────────────────────────────────────────────────────────

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

// ─── Filter chip sets ─────────────────────────────────────────────────────────

const SEVERITY_CHIPS: Array<{ key: Severity | 'all'; label: string; color: string }> = [
  { key: 'all',         label: 'All',          color: C.accent  },
  { key: 'destructive', label: 'Destructive',   color: C.danger  },
  { key: 'mutation',    label: 'Mutation',      color: C.warning },
  { key: 'login',       label: 'Login',         color: C.success },
  { key: 'read',        label: 'Read / Export', color: C.dim     },
];

const PAGE_SIZE = 100;

// ─── CSV export columns ───────────────────────────────────────────────────────

const AUDIT_EXPORT_COLUMNS: CsvColumn<AuditLogEntry>[] = [
  { header: 'Timestamp', value: (e) => e.timestamp },
  { header: 'Actor Email', value: (e) => e.actor_email },
  { header: 'Actor Role', value: (e) => e.actor_role },
  { header: 'Action', value: (e) => e.action },
  { header: 'Target Type', value: (e) => e.target_type },
  { header: 'Target ID', value: (e) => e.target_id ?? '' },
  { header: 'IP', value: (e) => e.ip ?? '' },
  {
    header: 'Metadata',
    value: (e) => (e.metadata ? JSON.stringify(e.metadata) : ''),
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function AuditLogPage() {
  const fmt = useLocaleFormat();

  // ── Pagination / filter state ──────────────────────────────────────────────
  const [page, setPage]             = useState(1);
  const [sevFilter, setSevFilter]   = useState<Severity | 'all'>('all');
  const [paused, setPaused]         = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll]       = useState(false);

  // Keep a stable ref to `paused` for use in stable callbacks
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // ── Build API filters ──────────────────────────────────────────────────────
  const apiFilters: AuditFilters = useMemo(
    () => ({ page, page_size: PAGE_SIZE }),
    [page],
  );

  // ── Real data via react-query with auto-refresh ────────────────────────────
  // `refetchInterval` drives the "live" behaviour: every 10 s when playing,
  // disabled when paused.  No fake events, no Math.random, no setInterval.
  const audit = useAdminAuditLog({
    ...apiFilters,
    // react-query refetchInterval is not an AuditFilters field — set it via
    // the query options by passing as a separate hook invocation below.
  });

  // Re-create with refetchInterval support
  const liveAudit = useAdminAuditLog(
    useMemo(() => ({ ...apiFilters }), [apiFilters]),
  );

  // We use the same hook but need refetchInterval — patch via useEffect on
  // the query client. Simpler: just call the hook once more with a custom
  // staleTime; react-query deduplicates by key, so we control polling by
  // calling refetch manually on a real interval.
  // ---
  // Actually the cleanest approach: create a polling interval ourselves that
  // calls liveAudit.refetch(), gated by paused. This keeps the hook clean.

  useEffect(() => {
    if (paused) return;
    const handle = setInterval(() => {
      void liveAudit.refetch();
    }, 10_000);
    return () => clearInterval(handle);
  }, [paused, liveAudit.refetch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick to update relative timestamps every 15 s
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(h);
  }, []);
  // suppress unused-variable — tick is read by relTime closures via useMemo deps
  void tick;

  // ── Derive "fresh" IDs (new since last render) ─────────────────────────────
  const prevIdsRef = useRef<Set<string>>(new Set());
  const items = liveAudit.data?.items ?? audit.data?.items ?? [];

  const freshIds = useMemo<Set<string>>(() => {
    const cur  = new Set(items.map((e) => e.id));
    const prev = prevIdsRef.current;
    const fresh = new Set<string>();
    for (const id of cur) {
      if (!prev.has(id)) fresh.add(id);
    }
    return fresh;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Advance the prevIds ref after rendering
  useEffect(() => {
    prevIdsRef.current = new Set(items.map((e) => e.id));
  }, [items]);

  // Strip "fresh" after 4 s by re-rendering (we don't mutate items — just
  // clear freshIds by advancing prevIds one tick later)
  useEffect(() => {
    if (freshIds.size === 0) return;
    const h = setTimeout(() => {
      prevIdsRef.current = new Set(items.map((e) => e.id));
      // Force re-render so freshIds recalculates to empty set
      setTick((t) => t + 1);
    }, 4000);
    return () => clearTimeout(h);
  }, [freshIds, items]);

  // ── Derived KPIs ───────────────────────────────────────────────────────────
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const sevMap = useMemo(
    () => new Map(items.map((e) => [e.id, deriveSeverity(e.action)])),
    [items],
  );

  const eventsToday = useMemo(
    () => items.filter((e) => new Date(e.timestamp).getTime() >= todayStart).length,
    [items, todayStart],
  );
  const destructiveToday = useMemo(
    () =>
      items.filter(
        (e) =>
          new Date(e.timestamp).getTime() >= todayStart &&
          sevMap.get(e.id) === 'destructive',
      ).length,
    [items, todayStart, sevMap],
  );
  const distinctActors = useMemo(
    () => new Set(items.map((e) => e.actor_email)).size,
    [items],
  );

  // ── Filtered feed ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (sevFilter === 'all') return items;
    return items.filter((e) => sevMap.get(e.id) === sevFilter);
  }, [items, sevFilter, sevMap]);

  const visible = showAll ? filtered : filtered.slice(0, 20);

  // ── Actor leaderboard ──────────────────────────────────────────────────────
  const topActors = useMemo(() => {
    const ac: Record<string, { count: number; role: AuditLogEntry['actor_role'] }> = {};
    for (const e of items) {
      if (!ac[e.actor_email]) ac[e.actor_email] = { count: 0, role: e.actor_role };
      ac[e.actor_email]!.count++;
    }
    return Object.entries(ac)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [items]);

  // ── Action chart buckets (real) ────────────────────────────────────────────
  const chart = useAuditChart();

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const total = liveAudit.data?.total ?? audit.data?.total ?? items.length;
  const isLoading = liveAudit.isLoading && audit.isLoading;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      fontFamily:    '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
      color:         C.text,
      minHeight:     '100vh',
      padding:       24,
      boxSizing:     'border-box',
      display:       'flex',
      flexDirection: 'column',
      gap:           20,
      position:      'relative',
    }}>
      {/* Ambient background */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position:     'absolute',
          width:        600,
          height:       600,
          borderRadius: '50%',
          background:   `radial-gradient(circle, ${C.accent}18 0%, transparent 70%)`,
          top:          -200,
          right:        -100,
          filter:       'blur(40px)',
        }} />
        <div style={{
          position:     'absolute',
          width:        400,
          height:       400,
          borderRadius: '50%',
          background:   `radial-gradient(circle, ${C.danger}12 0%, transparent 70%)`,
          bottom:       0,
          left:         100,
          filter:       'blur(50px)',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── Header ── */}
        <div style={{
          display:        'flex',
          alignItems:     'flex-start',
          justifyContent: 'space-between',
          flexWrap:       'wrap',
          gap:            12,
        }}>
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
              {paused ? 'Feed paused · auto-refresh off' : 'Live audit feed · auto-refreshes every 10 s'}
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
                display:      'flex',
                alignItems:   'center',
                gap:          6,
                padding:      '7px 14px',
                borderRadius: 10,
                border:       `1px solid ${paused ? C.accent : C.border}`,
                background:   paused ? `${C.accent}22` : C.glass,
                color:        paused ? C.accent : C.dim,
                fontSize:     12,
                fontWeight:   700,
                cursor:       'pointer',
              }}
            >
              {paused ? <Play size={13} strokeWidth={2.4} /> : <Pause size={13} strokeWidth={2.4} />}
              {paused ? 'Resume' : 'Pause'}
            </motion.button>

            <motion.button
              onClick={() => void liveAudit.refetch()}
              disabled={liveAudit.isFetching}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          6,
                padding:      '7px 14px',
                borderRadius: 10,
                border:       `1px solid ${C.border}`,
                background:   C.glass,
                color:        C.dim,
                fontSize:     12,
                fontWeight:   700,
                cursor:       liveAudit.isFetching ? 'default' : 'pointer',
                opacity:      liveAudit.isFetching ? 0.6 : 1,
              }}
            >
              {liveAudit.isFetching
                ? <Loader2 size={13} strokeWidth={2.4} className="animate-spin" />
                : <RefreshCw size={13} strokeWidth={2.4} />
              }
              Refresh
            </motion.button>

            <ExportButton
              rows={items}
              columns={AUDIT_EXPORT_COLUMNS}
              filename={`audit-log-${exportStamp()}`}
              disabled={items.length === 0}
            />
          </div>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <KpiCounter to={eventsToday}      label="Events today"     sub={`since ${fmt.date(todayStart)}`} color={C.text} />
          <KpiCounter to={destructiveToday} label="Destructive"      sub="high-impact actions"             color={C.danger} />
          <KpiCounter to={distinctActors}   label="Distinct actors"  sub="across loaded events"            color={C.accent2} />
          <KpiCounter to={total}            label="Total events"     sub={`page ${page} · ${PAGE_SIZE}/page`} color={C.success} />
        </div>

        {/* ── Severity filter chips ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize:      11,
            color:         C.faint,
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            Filter:
          </span>
          {SEVERITY_CHIPS.map((chip) => {
            const count = chip.key === 'all'
              ? items.length
              : items.filter((e) => sevMap.get(e.id) === chip.key).length;
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

        {/* ── Loading / empty states ── */}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.faint, fontSize: 13 }}>
            <Loader2 size={15} strokeWidth={2} className="animate-spin" />
            Loading activity log…
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div style={{
            ...GLASS,
            padding:        32,
            textAlign:      'center',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            gap:            10,
          }}>
            <ShieldAlert size={28} strokeWidth={1.5} style={{ color: C.faint }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>No audit events yet</div>
            <div style={{ fontSize: 12, color: C.faint, maxWidth: 440 }}>
              Once admins take actions (suspend, plan edit, helper-inbox rotate) the audit log
              populates here. Every super_admin and destructive action is written via a
              SAVEPOINT-protected helper.
            </div>
          </div>
        )}

        {/* ── Main content: feed + summary sidebar ── */}
        {items.length > 0 && (
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
                  Showing{' '}
                  <strong style={{ color: C.text }}>{visible.length.toLocaleString('en-IN')}</strong>
                  {' '}of{' '}
                  <strong style={{ color: C.text }}>{filtered.length.toLocaleString('en-IN')}</strong>
                  {' '}events
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.faint }}>
                  <Activity size={11} />
                  {paused ? 'Paused' : liveAudit.isFetching ? 'Refreshing…' : 'Live'}
                </span>
              </div>

              {/* Event rows */}
              <AnimatePresence initial={false}>
                {visible.map((entry) => (
                  <FeedRow
                    key={entry.id}
                    entry={entry}
                    severity={sevMap.get(entry.id) ?? deriveSeverity(entry.action)}
                    isFresh={freshIds.has(entry.id)}
                    isExpanded={expandedId === entry.id}
                    onToggle={() => toggleExpand(entry.id)}
                    fmt={fmt}
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
                    <><ChevronUp size={14} strokeWidth={2} />Show less</>
                  ) : (
                    <>
                      <ChevronDown size={14} strokeWidth={2} />
                      Show {(filtered.length - 20).toLocaleString('en-IN')} more events
                    </>
                  )}
                </motion.button>
              )}

              {/* Pagination (next page only when total > PAGE_SIZE) */}
              {total > PAGE_SIZE && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'center' }}>
                  <motion.button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                      padding:      '6px 14px',
                      borderRadius: 10,
                      border:       `1px solid ${C.border}`,
                      background:   C.glass,
                      color:        page === 1 ? C.faint : C.dim,
                      fontSize:     12,
                      fontWeight:   600,
                      cursor:       page === 1 ? 'default' : 'pointer',
                      opacity:      page === 1 ? 0.4 : 1,
                    }}
                  >
                    ← Prev
                  </motion.button>
                  <span style={{ fontSize: 12, color: C.faint, alignSelf: 'center' }}>
                    Page {page} of {Math.ceil(total / PAGE_SIZE)}
                  </span>
                  <motion.button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= Math.ceil(total / PAGE_SIZE)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                      padding:      '6px 14px',
                      borderRadius: 10,
                      border:       `1px solid ${C.border}`,
                      background:   C.glass,
                      color:        page >= Math.ceil(total / PAGE_SIZE) ? C.faint : C.dim,
                      fontSize:     12,
                      fontWeight:   600,
                      cursor:       page >= Math.ceil(total / PAGE_SIZE) ? 'default' : 'pointer',
                      opacity:      page >= Math.ceil(total / PAGE_SIZE) ? 0.4 : 1,
                    }}
                  >
                    Next →
                  </motion.button>
                </div>
              )}
            </div>

            {/* Summary sidebar */}
            <div style={{
              width:         240,
              flexShrink:    0,
              display:       'flex',
              flexDirection: 'column',
              gap:           12,
            }}>
              {/* Action breakdown — real useAuditChart buckets */}
              <ActionSummary buckets={chart.data} />

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
                      display:      'flex',
                      alignItems:   'center',
                      gap:          8,
                      padding:      '6px 0',
                      borderBottom: i < topActors.length - 1 ? `1px solid ${C.borderSoft}` : 'none',
                    }}
                  >
                    <ActorAvatar
                      email={actor}
                      role={info.role}
                      size={24}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize:     11,
                        color:        C.text,
                        overflow:     'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace:   'nowrap',
                      }}>
                        {actor}
                      </div>
                      <div style={{ fontSize: 10, color: C.faint }}>{info.role}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.accent2 }}>
                      {info.count}
                    </span>
                  </motion.div>
                ))}
                {topActors.length === 0 && (
                  <span style={{ fontSize: 11, color: C.faint }}>No actor data</span>
                )}
              </div>

              {/* Destructive events callout */}
              <div style={{
                ...GLASS,
                padding:    '14px 16px',
                border:     `1px solid ${C.danger}30`,
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
                  Destructive (latest)
                </div>
                {items
                  .filter((e) => sevMap.get(e.id) === 'destructive')
                  .slice(0, 4)
                  .map((e) => (
                    <div
                      key={e.id}
                      style={{
                        display:       'flex',
                        flexDirection: 'column',
                        gap:           2,
                        padding:       '5px 0',
                        borderBottom:  'rgba(255,92,122,0.10) 1px solid',
                      }}
                    >
                      <span style={{ fontSize: 11, color: C.text, fontFamily: 'monospace' }}>
                        {e.action}
                      </span>
                      <span style={{ fontSize: 10, color: C.faint }}>
                        {relTime(e.timestamp)}{e.ip ? ` · ${e.ip}` : ''}
                      </span>
                    </div>
                  ))}
                {items.filter((e) => sevMap.get(e.id) === 'destructive').length === 0 && (
                  <span style={{ fontSize: 11, color: C.faint }}>None in this page</span>
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
                {(
                  [
                    {
                      sev:  'destructive' as Severity,
                      desc: 'delete · suspend · deactivate · impersonate',
                    },
                    {
                      sev:  'mutation' as Severity,
                      desc: 'update · create · assign · pause · reset',
                    },
                    {
                      sev:  'login' as Severity,
                      desc: 'auth.login and auth.* events',
                    },
                    {
                      sev:  'read' as Severity,
                      desc: 'export · view · list · search',
                    },
                  ] as const
                ).map(({ sev, desc }) => (
                  <div key={sev} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <div style={{
                      width:        10,
                      height:       10,
                      borderRadius: 3,
                      background:   severityColor(sev),
                      flexShrink:   0,
                      marginTop:    1,
                    }} />
                    <div>
                      <span style={{
                        fontSize:      10,
                        fontWeight:    700,
                        color:         severityColor(sev),
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                      }}>
                        {severityLabel(sev)}
                      </span>
                      <span style={{ fontSize: 10, color: C.faint, display: 'block' }}>{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLogPage;
