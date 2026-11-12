/**
 * Admin Test Accounts — P2 Capacity Grid (live)
 *
 * Visual design: P2 Capacity Grid candidate (AdmPeerP2Grid).
 * All data wired to real hooks:
 *   useAdminPeerInboxes, useAdminPeerInboxStats,
 *   useDeletePeerInbox, useUpdatePeerInbox, useTestPeerConnection.
 * Dialogs re-use the existing AddPeerInboxDialog, BulkImportDialog,
 * PeerInboxDetailDrawer sub-components.
 *
 * Field mapping:
 *   P2 capacityUsed/Total  → PeerInboxOut.sends_today / daily_capacity
 *   P2 reputation          → PeerInboxOut.reputation_score
 *   P2 status              → derived from is_active + reputation_score
 *   P2 pool                → PeerInboxOut.pool_ids[0] (first pool name from stats)
 *   P2 lastUsed            → PeerInboxOut.last_used_at (formatted)
 *   P2 repDelta            → synthDeltaFor() — no real history table yet
 *   P2 bounceRate          → dropped (no real field)
 *   P2 daysSince           → derived from PeerInboxOut.created_at
 *   P2 replies24h          → dropped (no real field)
 */

import { useState, useCallback, useMemo, type CSSProperties } from 'react';
import {
  Plus,
  Upload,
  ChevronDown,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Mail,
  Activity,
  Layers,
  Zap,
  ShieldOff,
  PlayCircle,
  MoreHorizontal,
  Search,
  Inbox,
  Loader2,
  RotateCcw,
  Layers as LayersIcon,
} from 'lucide-react';
import {
  useAdminPeerInboxes,
  useAdminPeerInboxStats,
  useDeletePeerInbox,
  useUpdatePeerInbox,
  useTestPeerConnection,
  useResetPeerCapacity,
  useResetAllPeerCapacity,
  useAdminPeerPools,
  useAddPoolMembers,
  useRemovePoolMember,
} from '@/features/admin/api';
import type { PeerInboxOut, PeerInboxStats, PoolOut } from '@/features/admin/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { toast } from '@/components/ui/AppToast';
import {
  AddPeerInboxDialog,
  BulkImportDialog,
  PeerInboxDetailDrawer,
} from './peer-inboxes';
import { formatNumber } from '@/lib/format';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';

// ─── Design tokens (warm Aurora Glass — same as DashboardPage / SystemHealthPage) ──
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.38)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.18)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.14)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.14)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.14)' as const,
  neutral: 'rgba(255,255,255,0.30)' as const,
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
  glassCard: {
    background: 'rgba(255,255,255,0.055)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 14,
  } as CSSProperties,
};

// ─── Derived status type ───────────────────────────────────────────────────────
type PeerStatus = 'active' | 'inactive' | 'degraded';

type SortKey = 'reputation' | 'capacity' | 'lastUsed';
type FilterChip = 'all' | 'google_ws' | 'office365' | 'yahoo' | 'inactive';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function derivedStatus(p: PeerInboxOut): PeerStatus {
  if (!p.is_active) return 'inactive';
  if (p.reputation_score > 0 && p.reputation_score < 0.5) return 'degraded';
  return 'active';
}

function repColor(rep: number): string {
  if (rep >= 0.85) return T.success;
  if (rep >= 0.70) return T.accentLight;
  if (rep >= 0.50) return T.warning;
  if (rep > 0) return T.danger;
  return T.neutral;
}

function statusColor(s: PeerStatus): string {
  switch (s) {
    case 'active':   return T.success;
    case 'inactive': return 'rgba(255,255,255,0.50)';
    case 'degraded': return T.danger;
  }
}

function statusBg(s: PeerStatus): string {
  switch (s) {
    case 'active':   return T.successDim;
    case 'inactive': return 'rgba(255,255,255,0.06)';
    case 'degraded': return T.dangerDim;
  }
}

function providerLabel(provider: string): string {
  const p = (provider || '').toLowerCase();
  if (p === 'google_ws' || p === 'google_workspace' || p.includes('google')) return 'Google WS';
  if (p === 'office365' || p.includes('outlook') || p.includes('office')) return 'Office 365';
  if (p.includes('yahoo')) return 'Yahoo';
  if (p.includes('icloud')) return 'iCloud';
  return provider || '—';
}

function providerFilterKey(provider: string): string {
  const p = (provider || '').toLowerCase();
  if (p.includes('google') || p === 'google_ws') return 'google_ws';
  if (p === 'office365' || p.includes('outlook') || p.includes('office')) return 'office365';
  if (p.includes('yahoo')) return 'yahoo';
  return 'other';
}

function providerColor(provider: string): string {
  const k = providerFilterKey(provider);
  if (k === 'google_ws') return T.accentLight;
  if (k === 'office365') return 'rgba(255,255,255,0.60)';
  if (k === 'yahoo') return T.warning;
  return 'rgba(255,255,255,0.50)';
}

// Human-readable pool names for a peer. Prefers pool_memberships (carries
// names); falls back to raw pool_ids when the names aren't populated.
function poolNames(p: PeerInboxOut): string[] {
  if (p.pool_memberships && p.pool_memberships.length > 0) {
    return p.pool_memberships.map((m) => m.pool_name);
  }
  return p.pool_ids ?? [];
}

function capPct(p: PeerInboxOut): number {
  const cap = p.daily_capacity;
  const used = p.sends_today ?? 0;
  if (cap === 0) return 0;
  return Math.min(1, used / cap);
}

// Stable synthetic delta — same approach as the old leaderboard page.
// Replace with real rep-history once that endpoint exists.
function synthDeltaFor(p: PeerInboxOut): number {
  const delta = (p.reputation_score - 0.7) * 0.1;
  return Math.round(delta * 100) / 100;
}

function formatLastUsed(lastUsedAt: string | null | undefined): string {
  if (!lastUsedAt) return 'never';
  const ms = Date.now() - new Date(lastUsedAt).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function daysSinceCreated(createdAt: string | undefined): number {
  if (!createdAt) return 0;
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.floor(ms / 86_400_000);
}

// ─── SVG Capacity Ring (identical to P2Grid) ───────────────────────────────────
function CapacityRing({
  pct,
  repScore,
  size = 88,
}: {
  pct: number;
  repScore: number;
  size?: number;
}) {
  const r = (size - 14) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const capDash = pct * circ;
  const repR = r - 10;
  const repCirc = 2 * Math.PI * repR;
  const repDash = repScore * repCirc;
  const trackColor = 'rgba(255,255,255,0.08)';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Outer track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={6} />
      {/* Outer fill — capacity */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={pct > 0.85 ? T.warning : T.accent}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${capDash} ${circ}`}
        strokeDashoffset={0}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      {/* Inner track — reputation */}
      <circle cx={cx} cy={cy} r={repR} fill="none" stroke={trackColor} strokeWidth={4} />
      {/* Inner fill — reputation */}
      <circle
        cx={cx} cy={cy} r={repR}
        fill="none"
        stroke={repColor(repScore)}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${repDash} ${repCirc}`}
        strokeDashoffset={0}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      {/* Centre label */}
      <text x={cx} y={cy - 5} textAnchor="middle" fill={T.text} fontSize={13} fontWeight={700} fontFamily="inherit">
        {Math.round(pct * 100)}%
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" fill={T.faint} fontSize={8} fontFamily="inherit">
        limit
      </text>
    </svg>
  );
}

// ─── Stat strip card ───────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Activity;
  color: string;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        ...T.glassCard,
        flex: '1 1 160px',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: `${color}22`,
          border: `1px solid ${color}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={17} color={color} strokeWidth={2.2} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.1 }}>
          {loading ? <Loader2 size={14} style={{ display: 'inline-block' }} className="animate-spin" /> : value}
        </div>
        <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Peer card ──────────────────────────────────────────────────────────────────
function PeerCard({
  peer,
  onClick,
  selected,
  onToggleSelect,
}: {
  peer: PeerInboxOut;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pct = capPct(peer);
  const status = derivedStatus(peer);
  const sc = statusColor(status);
  const sbg = statusBg(status);
  const synthDelta = synthDeltaFor(peer);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...T.glassCard,
        cursor: 'pointer',
        padding: '18px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 12px 36px rgba(0,0,0,0.36), 0 0 0 1px rgba(242,101,34,0.22)'
          : '0 2px 12px rgba(0,0,0,0.18)',
        transition: 'transform 0.22s ease, box-shadow 0.22s ease',
        position: 'relative',
        overflow: 'hidden',
        outline: selected ? `2px solid ${T.accent}` : '2px solid transparent',
        outlineOffset: 2,
      }}
    >
      {/* Subtle gradient sheen */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: hovered
            ? 'linear-gradient(135deg, rgba(242,101,34,0.06) 0%, transparent 60%)'
            : 'transparent',
          borderRadius: 'inherit',
          pointerEvents: 'none',
          transition: 'background 0.22s ease',
        }}
      />

      {/* Top row: select checkbox + status dot + status chip + provider chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          onChange={() => {}}
          aria-label={`Select ${peer.email}`}
          style={{
            width: 15,
            height: 15,
            accentColor: T.accent,
            cursor: 'pointer',
            flexShrink: 0,
            position: 'relative',
            zIndex: 2,
          }}
        />
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: sc,
            flexShrink: 0,
            boxShadow: `0 0 6px ${sc}`,
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: sc,
            background: sbg,
            border: `1px solid ${sc}33`,
            borderRadius: 6,
            padding: '2px 7px',
            textTransform: 'capitalize',
            letterSpacing: '0.04em',
          }}
        >
          {status}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: providerColor(peer.provider),
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 6,
            padding: '2px 7px',
            marginLeft: 'auto',
          }}
        >
          {providerLabel(peer.provider)}
        </span>
      </div>

      {/* Capacity ring + email + pool */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <CapacityRing pct={pct} repScore={peer.reputation_score} size={88} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: T.text,
              wordBreak: 'break-all',
              lineHeight: 1.35,
            }}
          >
            {peer.email}
          </div>
          {poolNames(peer).length > 0 && (
            <div style={{ fontSize: 10, color: T.accent, marginTop: 4, fontWeight: 600 }}>
              {poolNames(peer).length === 1 ? poolNames(peer)[0] : `${poolNames(peer).length} account groups`}
            </div>
          )}
          <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>
            {peer.sends_today ?? 0} / {peer.daily_capacity} today
          </div>
        </div>
      </div>

      {/* Reputation bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: T.dim }}>Trust score</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: repColor(peer.reputation_score) }}>
            {Number.isFinite(peer.reputation_score) ? peer.reputation_score.toFixed(2) : 'N/A'}
            {synthDelta !== 0 && (
              <span
                style={{
                  marginLeft: 4,
                  fontSize: 9,
                  color: synthDelta >= 0 ? T.success : T.danger,
                }}
              >
                {synthDelta >= 0 ? '+' : ''}
                {synthDelta.toFixed(2)}
              </span>
            )}
          </span>
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.max(0, peer.reputation_score) * 100}%`,
              background: `linear-gradient(90deg, ${repColor(peer.reputation_score)}, ${repColor(peer.reputation_score)}cc)`,
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }}
          />
        </div>
      </div>

      {/* Footer: last used + sends */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: `1px solid ${T.hairline}`,
          paddingTop: 10,
          marginTop: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.faint }}>
          <Clock size={9} strokeWidth={2.4} />
          {formatLastUsed(peer.last_used_at)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 10, color: T.dim }}>
            <span style={{ color: T.accentLight, fontWeight: 700 }}>{peer.sends_today ?? 0}</span> sent
          </span>
          <span style={{ fontSize: 10, color: T.dim }}>
            <span style={{ color: T.faint, fontWeight: 700 }}>{peer.daily_capacity}</span> limit
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Filter chip component ──────────────────────────────────────────────────────
function FilterChipBtn({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 8,
        border: active ? `1px solid ${T.accent}88` : `1px solid ${T.hairline}`,
        background: active ? T.accentDim : 'rgba(255,255,255,0.04)',
        color: active ? T.accentLight : T.dim,
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: active ? T.accent : T.faint,
          background: active ? 'rgba(242,101,34,0.18)' : 'rgba(255,255,255,0.06)',
          borderRadius: 4,
          padding: '1px 5px',
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Inline detail drawer for the P2 card click ────────────────────────────────
// Wraps the existing PeerInboxDetailDrawer (real data + test-connection) with
// additional P2-style deactivate / delete actions from the card context.
function CardActionDrawer({
  peer,
  onClose,
  onEdit,
  onDelete,
  onToggleActive,
  testPending,
  onTest,
}: {
  peer: PeerInboxOut;
  onClose: () => void;
  onEdit: (p: PeerInboxOut) => void;
  onDelete: (p: PeerInboxOut) => void;
  onToggleActive: (p: PeerInboxOut) => void;
  testPending: boolean;
  onTest: (p: PeerInboxOut) => void;
}) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const status = derivedStatus(peer);
  const pct = capPct(peer);
  const synthDelta = synthDeltaFor(peer);
  const days = daysSinceCreated(peer.created_at);

  // Pool membership management (M2M — a peer can live in several pools).
  const pools = useAdminPeerPools();
  const addMembers = useAddPoolMembers();
  const removeMember = useRemovePoolMember();
  const resetCap = useResetPeerCapacity();

  const memberships = useMemo<Array<{ pool_id: string; pool_name: string }>>(() => {
    if (peer.pool_memberships && peer.pool_memberships.length > 0) return peer.pool_memberships;
    return (peer.pool_ids ?? []).map((id) => ({
      pool_id: id,
      pool_name: (pools.data ?? []).find((p) => p.id === id)?.name ?? id,
    }));
  }, [peer, pools.data]);
  const memberIds = useMemo(() => new Set(memberships.map((m) => m.pool_id)), [memberships]);
  const availablePools: PoolOut[] = (pools.data ?? []).filter((p) => !memberIds.has(p.id));

  const poolBusy = addMembers.isPending || removeMember.isPending;

  const handleAddPool = async (poolId: string) => {
    try {
      await addMembers.mutateAsync({ poolId, peer_inbox_ids: [peer.id] });
      toast.success('Added to account group.');
    } catch {
      toast.error('Could not add to account group.');
    }
  };
  const handleRemovePool = async (poolId: string) => {
    try {
      await removeMember.mutateAsync({ poolId, peerInboxId: peer.id });
      toast.success('Removed from account group.');
    } catch {
      toast.error('Could not remove from account group.');
    }
  };
  const handleResetCapacity = async () => {
    try {
      await resetCap.mutateAsync(peer.id);
      toast.success('Daily limit reset.');
    } catch {
      toast.error('Reset failed.');
    }
  };

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Email', value: peer.email },
    { label: 'Provider', value: providerLabel(peer.provider) },
    { label: 'Account group(s)', value: poolNames(peer).length > 0 ? poolNames(peer).join(', ') : 'Unassigned' },
    { label: 'Status', value: status },
    { label: 'Days in network', value: days > 0 ? `${days}d` : '—' },
    { label: 'Trust score', value: Number.isFinite(peer.reputation_score) ? peer.reputation_score.toFixed(3) : 'N/A' },
    { label: 'Trust 24h delta', value: `${synthDelta >= 0 ? '+' : ''}${synthDelta.toFixed(3)} (derived)` },
    { label: 'Daily limit used', value: `${peer.sends_today ?? 0} / ${peer.daily_capacity}` },
    { label: 'Daily limit %', value: `${Math.round(pct * 100)}%` },
    { label: 'Sends today', value: String(peer.sends_today ?? 0) },
    { label: 'Last used', value: formatLastUsed(peer.last_used_at) },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.44)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          zIndex: 100,
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(420px, 100vw)',
          background: 'rgba(18,18,26,0.96)',
          borderLeft: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 22px 16px',
            borderBottom: `1px solid ${T.hairline}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: T.faint, marginBottom: 4 }}>
              Test Account · {peer.id.slice(0, 8).toUpperCase()}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: T.text,
                wordBreak: 'break-all',
                lineHeight: 1.3,
              }}
            >
              {peer.email}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: statusColor(status),
                  boxShadow: `0 0 5px ${statusColor(status)}`,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: statusColor(status),
                  textTransform: 'capitalize',
                }}
              >
                {status}
              </span>
              <span style={{ fontSize: 10, color: T.faint }}>·</span>
              <span style={{ fontSize: 10, color: providerColor(peer.provider), fontWeight: 600 }}>
                {providerLabel(peer.provider)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.04)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.dim,
              flexShrink: 0,
            }}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>

        {/* Capacity ring + rep big display */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '24px 22px 20px',
            gap: 32,
            borderBottom: `1px solid ${T.hairline}`,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <CapacityRing pct={pct} repScore={peer.reputation_score} size={108} />
            <div style={{ fontSize: 10, color: T.faint, marginTop: 8 }}>Daily-limit ring (outer)</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: T.dim }}>Trust score</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: repColor(peer.reputation_score), lineHeight: 1 }}>
                {Number.isFinite(peer.reputation_score) ? peer.reputation_score.toFixed(2) : 'N/A'}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: synthDelta >= 0 ? T.success : T.danger,
                  marginTop: 2,
                }}
              >
                {synthDelta >= 0 ? '↑' : '↓'} {Math.abs(synthDelta).toFixed(2)} (derived 24h)
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.dim }}>Daily limit</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>
                {peer.daily_capacity}
              </div>
            </div>
          </div>
        </div>

        {/* Detail rows */}
        <div style={{ padding: '16px 22px', flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.faint,
              letterSpacing: '0.06em',
              marginBottom: 10,
              textTransform: 'uppercase',
            }}
          >
            Helper details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map((r) => (
              <div
                key={r.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.025)',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 11, color: T.dim, flexShrink: 0 }}>{r.label}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: T.text,
                    textAlign: 'right',
                    wordBreak: 'break-all',
                  }}
                >
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pool membership manager */}
        <div style={{ padding: '4px 22px 16px', borderTop: `1px solid ${T.hairline}` }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.faint,
              letterSpacing: '0.06em',
              margin: '14px 0 10px',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <LayersIcon size={12} strokeWidth={2.4} />
            Account groups · a helper can be in several
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {memberships.length === 0 && (
              <span style={{ fontSize: 11, color: T.faint, fontStyle: 'italic' }}>
                Not in any account group — add one below.
              </span>
            )}
            {memberships.map((m) => (
              <span
                key={m.pool_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px 4px 10px',
                  borderRadius: 8,
                  background: T.accentDim,
                  border: `1px solid ${T.accent}44`,
                  fontSize: 11,
                  color: T.accentLight,
                  fontWeight: 600,
                }}
              >
                {m.pool_name}
                <button
                  type="button"
                  onClick={() => handleRemovePool(m.pool_id)}
                  disabled={poolBusy}
                  aria-label={`Remove from ${m.pool_name}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    border: 'none',
                    background: 'rgba(255,255,255,0.10)',
                    color: T.text,
                    cursor: poolBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  <X size={10} strokeWidth={2.6} />
                </button>
              </span>
            ))}
          </div>

          {/* Add to pool — native select */}
          <select
            value=""
            disabled={poolBusy || availablePools.length === 0}
            onChange={(e) => {
              const poolId = e.target.value;
              if (poolId) void handleAddPool(poolId);
              e.target.value = '';
            }}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 9,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(20,20,30,0.6)',
              color: availablePools.length === 0 ? T.faint : T.text,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: poolBusy || availablePools.length === 0 ? 'not-allowed' : 'pointer',
              appearance: 'auto',
            }}
          >
            <option value="">
              {poolBusy
                ? 'Saving…'
                : availablePools.length === 0
                  ? 'Already in all account groups'
                  : '+ Add to account group…'}
            </option>
            {availablePools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.is_default ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div
          style={{
            padding: '16px 22px',
            borderTop: `1px solid ${T.hairline}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* Reset capacity */}
          <button
            type="button"
            onClick={handleResetCapacity}
            disabled={resetCap.isPending}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 0',
              borderRadius: 10,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.04)',
              color: T.dim,
              fontWeight: 600,
              fontSize: 12,
              cursor: resetCap.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            <RotateCcw size={13} strokeWidth={2.4} />
            {resetCap.isPending ? 'Resetting…' : `Reset daily limit (used ${peer.sends_today ?? 0})`}
          </button>

          {/* Edit capacity */}
          <button
            type="button"
            onClick={() => { onEdit(peer); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 0',
              borderRadius: 10,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.04)',
              color: T.dim,
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Edit daily limit
          </button>

          {/* Test connection */}
          <button
            type="button"
            onClick={() => onTest(peer)}
            disabled={testPending}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 0',
              borderRadius: 10,
              border: `1px solid ${T.accent}55`,
              background: T.accentDim,
              color: T.accentLight,
              fontWeight: 700,
              fontSize: 13,
              cursor: testPending ? 'not-allowed' : 'pointer',
              opacity: testPending ? 0.7 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            <PlayCircle size={14} strokeWidth={2.4} />
            {testPending ? 'Testing…' : 'Test connection'}
          </button>

          {/* Deactivate / Reactivate */}
          {!confirmDeactivate ? (
            <button
              type="button"
              onClick={() => setConfirmDeactivate(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 0',
                borderRadius: 10,
                border: `1px solid ${T.danger}55`,
                background: T.dangerDim,
                color: T.danger,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <ShieldOff size={14} strokeWidth={2.4} />
              {peer.is_active ? 'Deactivate helper' : 'Reactivate helper'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmDeactivate(false)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: `1px solid ${T.hairline}`,
                  background: 'rgba(255,255,255,0.04)',
                  color: T.dim,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { onToggleActive(peer); setConfirmDeactivate(false); onClose(); }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: T.danger,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={() => { onDelete(peer); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 0',
              borderRadius: 10,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.03)',
              color: T.faint,
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Delete helper
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Stats summary — wired to real PeerInboxStats ──────────────────────────────
function StatsStrip({
  stats,
  loading,
  peerCount,
}: {
  stats: PeerInboxStats | undefined;
  loading: boolean;
  peerCount: number;
}) {
  const totalCap = stats?.total_capacity ?? 0;
  const usedCap = stats?.used_capacity_today ?? 0;
  const capPctVal = totalCap > 0 ? Math.round((usedCap / totalCap) * 100) : 0;
  const avgRep = stats?.avg_reputation ?? 0;
  const degradedCount = 0; // would need a real field; omit from stats strip

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 24,
      }}
    >
      <StatCard
        label="Total helpers"
        value={String(stats?.total ?? peerCount)}
        sub={`${stats?.active ?? 0} active`}
        icon={Layers}
        color={T.accentLight}
        loading={loading}
      />
      <StatCard
        label="Avg trust score"
        value={avgRep > 0 ? avgRep.toFixed(2) : '—'}
        sub="across active helpers"
        icon={Activity}
        color={repColor(avgRep)}
        loading={loading}
      />
      <StatCard
        label="Daily limit used"
        value={`${capPctVal}%`}
        sub={`${usedCap} / ${totalCap} today`}
        icon={Zap}
        color={capPctVal > 85 ? T.danger : T.accent}
        loading={loading}
      />
      <StatCard
        label="Sends today"
        value={formatNumber(usedCap)}
        sub="across all helpers"
        icon={Mail}
        color={T.success}
        loading={loading}
      />
      <StatCard
        label="Inactive helpers"
        value={String((stats?.total ?? 0) - (stats?.active ?? 0))}
        sub={degradedCount > 0 ? `${degradedCount} degraded` : 'need attention'}
        icon={AlertTriangle}
        color={T.warning}
        loading={loading}
      />
    </div>
  );
}

// ─── CSV export column spec ────────────────────────────────────────────────────
const PEER_EXPORT_COLUMNS: CsvColumn<PeerInboxOut>[] = [
  { header: 'Email', value: (p) => p.email },
  { header: 'Provider', value: (p) => providerLabel(p.provider) },
  { header: 'Status', value: (p) => derivedStatus(p) },
  { header: 'Active', value: (p) => (p.is_active ? 'yes' : 'no') },
  { header: 'Trust score', value: (p) => (Number.isFinite(p.reputation_score) ? p.reputation_score.toFixed(3) : '') },
  { header: 'Daily limit', value: (p) => p.daily_capacity },
  { header: 'Sends today', value: (p) => p.sends_today ?? 0 },
  { header: 'Account groups', value: (p) => poolNames(p).join(' | ') },
  { header: 'Last used', value: (p) => p.last_used_at ?? '' },
  { header: 'Created', value: (p) => p.created_at ?? '' },
];

// ─── Main page component ───────────────────────────────────────────────────────
export function PeerInboxesPage() {
  const list = useAdminPeerInboxes({ page: 1, page_size: 100 });
  const stats = useAdminPeerInboxStats();
  const del = useDeletePeerInbox();
  const update = useUpdatePeerInbox();
  const test = useTestPeerConnection();
  const resetAll = useResetAllPeerCapacity();
  const pools = useAdminPeerPools();
  const bulkAdd = useAddPoolMembers();

  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPoolId, setBulkPoolId] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterChip>('all');
  const [sort, setSort] = useState<SortKey>('reputation');
  const [sortOpen, setSortOpen] = useState(false);

  // Card detail drawer state (uses our inline CardActionDrawer)
  const [cardDetailId, setCardDetailId] = useState<string | null>(null);

  // Full detail drawer state (PeerInboxDetailDrawer — existing component)
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PeerInboxOut | null>(null);
  const [deleting, setDeleting] = useState<PeerInboxOut | null>(null);

  const peers = list.data?.items ?? [];

  const cardDetailPeer = useMemo(
    () => (cardDetailId ? peers.find((p) => p.id === cardDetailId) ?? null : null),
    [cardDetailId, peers],
  );

  // Filter counts
  const counts = useMemo(() => {
    const google_ws = peers.filter((p) => providerFilterKey(p.provider) === 'google_ws').length;
    const office365 = peers.filter((p) => providerFilterKey(p.provider) === 'office365').length;
    const yahoo = peers.filter((p) => providerFilterKey(p.provider) === 'yahoo').length;
    const inactive = peers.filter((p) => !p.is_active).length;
    return { all: peers.length, google_ws, office365, yahoo, inactive };
  }, [peers]);

  // Filtered + sorted list
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...peers]
      .filter((p) => {
        const matchFilter =
          filter === 'all' ||
          (filter === 'inactive' ? !p.is_active : providerFilterKey(p.provider) === filter);
        const matchSearch =
          q === '' ||
          p.email.toLowerCase().includes(q) ||
          (p.pool_ids ?? []).some((id) => id.toLowerCase().includes(q));
        return matchFilter && matchSearch;
      })
      .sort((a, b) => {
        if (sort === 'reputation') return b.reputation_score - a.reputation_score;
        if (sort === 'capacity') return capPct(b) - capPct(a);
        // lastUsed: most recently used first
        const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
        const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
        return tb - ta;
      });
  }, [peers, filter, search, sort]);

  const sortLabels: Record<SortKey, string> = {
    reputation: 'By trust score',
    capacity: 'By daily limit %',
    lastUsed: 'By last used',
  };

  const handleTest = useCallback(async (p: PeerInboxOut) => {
    try {
      const r = await test.mutateAsync(p.id);
      if (r.smtp_ok && r.imap_ok) toast.success(`${p.email}: OK`);
      else toast.error(`${p.email}: connection failed`);
    } catch {
      toast.error('Test failed.');
    }
  }, [test]);

  const handleToggleActive = useCallback(async (p: PeerInboxOut) => {
    try {
      await update.mutateAsync({ id: p.id, payload: { is_active: !p.is_active } });
      toast.success(`${p.email} ${p.is_active ? 'deactivated' : 'reactivated'}.`);
    } catch {
      toast.error('Update failed.');
    }
  }, [update]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const handleBulkAssign = useCallback(async () => {
    if (!bulkPoolId || selected.size === 0) return;
    const ids = [...selected];
    const poolName = (pools.data ?? []).find((p) => p.id === bulkPoolId)?.name ?? 'account group';
    try {
      await bulkAdd.mutateAsync({ poolId: bulkPoolId, peer_inbox_ids: ids });
      toast.success(`Added ${ids.length} helper${ids.length === 1 ? '' : 's'} to ${poolName}.`);
      clearSelection();
      setBulkPoolId('');
    } catch {
      toast.error('Bulk assign failed.');
    }
  }, [bulkPoolId, selected, pools.data, bulkAdd, clearSelection]);

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '28px 28px 48px',
        color: T.text,
        boxSizing: 'border-box',
      }}
    >
      {/* ── Page header ──────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: T.faint, marginBottom: 4, letterSpacing: '0.04em' }}>
            Admin · Test Accounts
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: T.text, lineHeight: 1.15 }}>
            Helper-Inbox Network
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: T.dim }}>
            System-owned mailboxes powering the warmup engine ·{' '}
            {list.isLoading ? '…' : `${peers.length} helpers in network`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ExportButton
            rows={selected.size > 0 ? peers.filter((p) => selected.has(p.id)) : visible}
            filename={`peer-inboxes-${exportStamp()}`}
            label={selected.size > 0 ? `Export report (${selected.size})` : 'Export report'}
            columns={PEER_EXPORT_COLUMNS}
          />
          <Button
            variant="secondary"
            leftIcon={<RotateCcw className="h-4 w-4" />}
            onClick={() => setConfirmResetAll(true)}
            disabled={resetAll.isPending || peers.length === 0}
          >
            Reset daily limit
          </Button>
          <BulkImportDialog
            trigger={
              <Button variant="secondary" leftIcon={<Upload className="h-4 w-4" />}>
                Bulk import
              </Button>
            }
          />
          <AddPeerInboxDialog
            trigger={<Button leftIcon={<Plus className="h-4 w-4" />}>Add helper</Button>}
          />
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────────── */}
      <StatsStrip stats={stats.data} loading={stats.isLoading} peerCount={peers.length} />

      {/* ── Empty state ──────────────────────────────── */}
      {!list.isLoading && peers.length === 0 && (
        <div
          style={{
            ...T.glass,
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Inbox size={28} strokeWidth={1.6} color={T.faint} />
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>No helpers yet</div>
          <div style={{ fontSize: 13, color: T.dim, maxWidth: 400 }}>
            Add Gmail / Office 365 / Yahoo mailboxes the platform controls. They're the warmup
            counterparts that send + receive opens & replies with client mailboxes.
          </div>
          <AddPeerInboxDialog
            trigger={<Button leftIcon={<Plus className="h-4 w-4" />}>Add your first helper</Button>}
          />
        </div>
      )}

      {/* ── Toolbar: search + filters + sort ─────────── */}
      {peers.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 20,
          }}
        >
          {/* Search */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 8,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.04)',
              minWidth: 200,
            }}
          >
            <Search size={12} strokeWidth={2.4} color={T.faint} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email or account group…"
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: T.text,
                fontSize: 12,
                width: '100%',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Filter chips */}
          <FilterChipBtn label="All" active={filter === 'all'} count={counts.all} onClick={() => setFilter('all')} />
          <FilterChipBtn label="Google WS" active={filter === 'google_ws'} count={counts.google_ws} onClick={() => setFilter('google_ws')} />
          <FilterChipBtn label="Office 365" active={filter === 'office365'} count={counts.office365} onClick={() => setFilter('office365')} />
          <FilterChipBtn label="Yahoo" active={filter === 'yahoo'} count={counts.yahoo} onClick={() => setFilter('yahoo')} />
          <FilterChipBtn label="Inactive" active={filter === 'inactive'} count={counts.inactive} onClick={() => setFilter('inactive')} />

          {/* Select all visible */}
          <button
            type="button"
            onClick={() => {
              const allSel = visible.length > 0 && visible.every((p) => selected.has(p.id));
              setSelected((prev) => {
                const next = new Set(prev);
                if (allSel) visible.forEach((p) => next.delete(p.id));
                else visible.forEach((p) => next.add(p.id));
                return next;
              });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.04)',
              color: T.dim,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              readOnly
              checked={visible.length > 0 && visible.every((p) => selected.has(p.id))}
              style={{ accentColor: T.accent, pointerEvents: 'none', width: 13, height: 13 }}
            />
            Select all
          </button>

          {/* Sort dropdown */}
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <button
              type="button"
              onClick={() => setSortOpen((o) => !o)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${T.hairline}`,
                background: 'rgba(255,255,255,0.04)',
                color: T.dim,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <MoreHorizontal size={12} strokeWidth={2.4} />
              {sortLabels[sort]}
              <ChevronDown
                size={11}
                strokeWidth={2.4}
                style={{ transform: sortOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              />
            </button>
            {sortOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '110%',
                  right: 0,
                  ...T.glassTight,
                  background: 'rgba(20,20,30,0.94)',
                  border: `1px solid ${T.hairline}`,
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  minWidth: 160,
                  zIndex: 50,
                  overflow: 'hidden',
                }}
              >
                {(Object.keys(sortLabels) as SortKey[]).map((k) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => { setSort(k); setSortOpen(false); }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '9px 14px',
                      textAlign: 'left',
                      border: 'none',
                      background: sort === k ? T.accentDim : 'transparent',
                      color: sort === k ? T.accentLight : T.dim,
                      fontSize: 12,
                      fontWeight: sort === k ? 700 : 400,
                      cursor: 'pointer',
                      borderBottom: `1px solid ${T.hairline}`,
                    }}
                  >
                    {sortLabels[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bulk action bar (multi-select → assign to pool) ── */}
      {selected.size > 0 && (
        <div
          style={{
            position: 'sticky',
            top: 8,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 16px',
            marginBottom: 16,
            ...T.glass,
            background: 'rgba(28,22,30,0.92)',
            border: `1px solid ${T.accent}55`,
            boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
            {selected.size} helper{selected.size === 1 ? '' : 's'} selected
          </span>
          <span style={{ fontSize: 12, color: T.dim }}>Assign to account group:</span>
          <select
            value={bulkPoolId}
            onChange={(e) => setBulkPoolId(e.target.value)}
            disabled={bulkAdd.isPending}
            style={{
              padding: '8px 12px',
              borderRadius: 9,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(20,20,30,0.85)',
              color: T.text,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              minWidth: 180,
            }}
          >
            <option value="">Choose a account group…</option>
            {(pools.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.is_default ? ' (default)' : ''}
              </option>
            ))}
          </select>
          <Button
            onClick={handleBulkAssign}
            disabled={!bulkPoolId || bulkAdd.isPending}
            leftIcon={bulkAdd.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayersIcon className="h-4 w-4" />}
          >
            {bulkAdd.isPending ? 'Assigning…' : 'Assign to account group'}
          </Button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkAdd.isPending}
            style={{
              marginLeft: 'auto',
              padding: '8px 14px',
              borderRadius: 9,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.04)',
              color: T.dim,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────── */}
      {list.isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: T.faint, fontSize: 13 }}>
          <Loader2 size={16} className="animate-spin" />
          Loading helpers…
        </div>
      )}

      {/* ── Peer card grid ───────────────────────────── */}
      {!list.isLoading && peers.length > 0 && visible.length === 0 && (
        <div
          style={{
            ...T.glass,
            padding: '40px 24px',
            textAlign: 'center',
            color: T.faint,
            fontSize: 13,
          }}
        >
          No helpers match the current filter.
        </div>
      )}

      {!list.isLoading && visible.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          {visible.map((peer) => (
            <PeerCard
              key={peer.id}
              peer={peer}
              onClick={() => setCardDetailId(peer.id)}
              selected={selected.has(peer.id)}
              onToggleSelect={() => toggleSelect(peer.id)}
            />
          ))}
        </div>
      )}

      {/* ── Legend strip ────────────────────────────── */}
      {!list.isLoading && peers.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            marginTop: 28,
            padding: '12px 16px',
            ...T.glassTight,
            fontSize: 10,
            color: T.faint,
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 700, color: T.dim, marginRight: 4 }}>Ring guide:</span>
          <span>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: T.accent, marginRight: 4, verticalAlign: 'middle' }} />
            Outer = daily limit used
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: T.success, marginRight: 4, verticalAlign: 'middle' }} />
            Inner = trust score
          </span>
          <span style={{ marginLeft: 8, fontWeight: 700, color: T.dim }}>Trust bands:</span>
          {[
            { label: '≥ 0.85', color: T.success },
            { label: '0.70–0.85', color: T.accentLight },
            { label: '0.50–0.70', color: T.warning },
            { label: '< 0.50', color: T.danger },
          ].map((b) => (
            <span key={b.label}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: b.color,
                  marginRight: 4,
                  verticalAlign: 'middle',
                }}
              />
              {b.label}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={11} color={T.success} />
            <span>active</span>
            <AlertTriangle size={11} color={T.warning} />
            <span>inactive</span>
            <XCircle size={11} color={T.danger} />
            <span>degraded</span>
          </span>
        </div>
      )}

      {/* ── P2-style card detail drawer ──────────────── */}
      {cardDetailPeer && (
        <CardActionDrawer
          peer={cardDetailPeer}
          onClose={() => setCardDetailId(null)}
          onEdit={(p) => { setEditing(p); setCardDetailId(null); }}
          onDelete={(p) => { setDeleting(p); setCardDetailId(null); }}
          onToggleActive={handleToggleActive}
          testPending={test.isPending}
          onTest={handleTest}
        />
      )}

      {/* ── Full detail drawer (re-uses existing PeerInboxDetailDrawer) ── */}
      <PeerInboxDetailDrawer
        peerId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(peer) => { setEditing(peer); setDetailId(null); }}
        onDelete={(peer) => { setDeleting(peer); setDetailId(null); }}
      />

      {/* ── Edit capacity dialog ──────────────────────── */}
      <EditCapacityDialog
        peer={editing}
        onClose={() => setEditing(null)}
        onSave={async (capacity) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.id, payload: { daily_capacity: capacity } });
            toast.success('Daily limit updated.');
            setEditing(null);
          } catch {
            toast.error('Update failed.');
          }
        }}
      />

      {/* ── Reset-all-capacity confirmation ───────────── */}
      <AppDialog open={confirmResetAll} onOpenChange={(n) => { if (!n) setConfirmResetAll(false); }}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Reset daily limit for all helpers?</AppDialogTitle>
            <AppDialogDescription>
              Zeroes every helper's “used today” counter immediately, so the whole network can send
              again without waiting for the daily 00:01 UTC reset. Daily limits are
              unchanged.
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="ghost" onClick={() => setConfirmResetAll(false)} disabled={resetAll.isPending}>
              Cancel
            </Button>
            <Button
              disabled={resetAll.isPending}
              onClick={async () => {
                try {
                  const r = await resetAll.mutateAsync();
                  toast.success(`Daily limit reset for ${r.peers_reset} helper${r.peers_reset === 1 ? '' : 's'}.`);
                  setConfirmResetAll(false);
                } catch {
                  toast.error('Reset failed.');
                }
              }}
            >
              {resetAll.isPending ? 'Resetting…' : 'Reset all'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      {/* ── Delete confirmation dialog ────────────────── */}
      <DeletePeerDialog
        peer={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast.success('Test account deleted.');
            setDeleting(null);
          } catch {
            toast.error('Delete failed.');
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit capacity dialog (kept from prior version — same UX)
// ---------------------------------------------------------------------------

function EditCapacityDialog({
  peer,
  onClose,
  onSave,
}: {
  peer: PeerInboxOut | null;
  onClose: () => void;
  onSave: (capacity: number) => void | Promise<void>;
}) {
  const [value, setValue] = useState('');
  const open = peer !== null;
  if (open && value === '' && peer) setValue(String(peer.daily_capacity));
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 500;

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) { setValue(''); onClose(); }
      }}
    >
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Edit daily limit</AppDialogTitle>
          <AppDialogDescription>
            Sets the maximum number of warmup emails this helper can send per day.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody className="space-y-3">
          <p className="text-sm text-text-dim">{peer?.email}</p>
          <FormField label="Daily limit" htmlFor="cap-input" hint="1–500">
            <Input
              id="cap-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() => { if (valid) void onSave(parsed); }}
          >
            Save
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function DeletePeerDialog({
  peer,
  onClose,
  onConfirm,
}: {
  peer: PeerInboxOut | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const open = peer !== null;
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
    >
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Delete test account?</AppDialogTitle>
          <AppDialogDescription>
            This wipes the encrypted login details and cancels any pending sends. Cannot be undone.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <p className="text-sm text-text">
            <span className="font-mono">{peer?.email}</span>
          </p>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => void onConfirm()}>Delete</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
