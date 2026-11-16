/**
 * Admin Pool Routing — R7 Capacity Vessels (live)
 *
 * Visual design: R7 Capacity Vessels (AdmPoolR7Vessels) candidate.
 * All data wired to real hooks:
 *   usePoolRouting (pools + clients + assign/revert),
 *   useCreatePool, useAdminPeerInboxStats.
 * Motions preserved:
 *   useSpring liquid fill, layoutId chip FLIP, AnimatePresence, vesselVariants,
 *   AnimatedNumber counters, rising Bubbles, WaveSurface — all with cleanup.
 *
 * Field mapping:
 *   Vessel per pool           → PoolOut (from useAdminPeerPools via usePoolRouting)
 *   Liquid fill pct           → sum(sends_last_30d) / (member_count × PEER_MONTHLY_CAP)
 *   "Peers" stat              → PoolOut.member_count
 *   "Workspaces" stat         → count of RoutingClient rows for this pool
 *   Workspace chips           → RoutingClient[] with pool_id == pool.id
 *   Chip reassign             → assign.mutateAsync / revert.mutateAsync
 *   "default" badge           → PoolOut.is_default
 *   Avg reputation            → dropped (no per-pool real field)
 *   capacityTotal / mock data → derived: member_count × PEER_MONTHLY_CAP
 *   sends used label          → sum(RoutingClient.sends_last_30d ?? 0) for pool
 *   Create pool dialog        → useCreatePool
 *   Detail panel              → real pool + client data
 *   PlatformAnalytics stats   → useAdminPeerInboxStats for total_capacity + used_capacity_today
 */

import {
  useEffect,
  useRef,
  useState,
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
  AlertTriangle,
  ChevronDown,
  Info,
  Layers,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Server,
  X,
  Zap,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  usePoolRouting,
  useCreatePool,
  useRoutingMailboxes,
  useAssignMailboxPool,
  type RoutingClient,
} from '@/features/admin/pool-routing/api';
import { useAdminPeerInboxStats } from '@/features/admin/api';
import type { PoolOut, RoutingMailbox } from '@/features/admin/types';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';

// CSV export columns for the per-workspace routing assignments table.
const ROUTING_EXPORT_COLUMNS: CsvColumn<RoutingClient>[] = [
  { header: 'Email', value: (c) => c.email },
  { header: 'Plan', value: (c) => c.plan },
  { header: 'Account group', value: (c) => c.pool_name ?? 'Unassigned' },
  { header: 'Mailboxes', value: (c) => c.mailbox_count },
  { header: 'Sends (30d)', value: (c) => c.sends_last_30d ?? 0 },
];

// ─── Palette (warm Aurora Glass) ─────────────────────────────────────────────
const C = {
  text:       '#ffffff',
  dim:        'rgba(255,255,255,0.62)',
  faint:      'rgba(255,255,255,0.40)',
  ghost:      'rgba(255,255,255,0.16)',
  hairline:   'rgba(255,255,255,0.07)',
  accent:     '#F26522',
  accentB:    '#FF8A4B',
  success:    '#3ddc97',
  successDim: 'rgba(61,220,151,0.14)',
  warning:    '#FF8A4B',
  warningDim: 'rgba(255,138,75,0.14)',
  danger:     '#ff5c7a',
  dangerDim:  'rgba(255,92,122,0.14)',
  glass:      'rgba(255,255,255,0.05)',
  glass2:     'rgba(255,255,255,0.09)',
  border:     'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.06)',
} as const;

function glassBox(extra?: CSSProperties): CSSProperties {
  return {
    background: C.glass,
    border: `1px solid ${C.border}`,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
    ...extra,
  };
}

// Estimated sends/month per peer inbox — used as pool capacity proxy.
// Real capacity field does not exist on PoolOut; this is an honest derived metric.
const PEER_MONTHLY_CAP = 15_000;

// 30-day capacity denominator for a pool's fill gauge. When the pool has an
// explicit per-plan daily cap, that is the meaningful ceiling (daily × 30) —
// otherwise fall back to the helper-derived estimate. Using the daily cap makes
// real usage visible instead of vanishing against the huge helper estimate.
function poolCapacity30d(pool: PoolOut): number {
  if (pool.daily_send_limit != null) {
    return Math.max(pool.daily_send_limit * 30, 1);
  }
  return Math.max(pool.member_count * PEER_MONTHLY_CAP, 1);
}

// ─── Liquid colour by utilisation ────────────────────────────────────────────
function liquidColor(pct: number): { top: string; mid: string; bot: string } {
  if (pct >= 0.85) {
    return { top: 'rgba(255,92,122,0.75)', mid: 'rgba(255,92,122,0.45)', bot: 'rgba(255,92,122,0.20)' };
  }
  if (pct >= 0.60) {
    return { top: 'rgba(255,138,75,0.75)', mid: 'rgba(255,138,75,0.45)', bot: 'rgba(255,138,75,0.20)' };
  }
  return { top: 'rgba(61,220,151,0.70)', mid: 'rgba(61,220,151,0.42)', bot: 'rgba(61,220,151,0.18)' };
}

function statusColor(pct: number): string {
  if (pct >= 0.85) return C.danger;
  if (pct >= 0.60) return C.warning;
  return C.success;
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function AnimatedNumber({
  value,
  decimals = 0,
  style,
}: {
  value: number;
  decimals?: number;
  style?: CSSProperties;
}) {
  const mvRef = useMotionValue(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const ctrl = animate(mvRef, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = mvRef.on('change', (v) => setDisplay(v));
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [value, mvRef]);

  return (
    <span style={style}>
      {decimals === 0
        ? Math.round(display).toLocaleString()
        : display.toFixed(decimals)}
    </span>
  );
}

// ─── Bubble inside vessel ─────────────────────────────────────────────────────
// Sizes are captured in the static positions ref (not re-evaluated per render).
function Bubble({
  x,
  size,
  delay,
  fillPct,
  liquidTop,
}: {
  x: number;
  size: number;
  delay: number;
  fillPct: number;
  liquidTop: number;
}) {
  if (fillPct < 0.05) return null;
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${x}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.25)',
        bottom: 0,
      }}
      animate={{
        y: [0, -(liquidTop * 0.85)],
        opacity: [0, 0.6, 0],
        scale: [0.6, 1, 0.4],
      }}
      transition={{
        duration: 1.8 + delay * 0.4,
        delay,
        repeat: Infinity,
        repeatDelay: 0.5 + delay * 0.8,
        ease: 'easeOut',
      }}
    />
  );
}

// ─── Animated wave SVG surface ────────────────────────────────────────────────
function WaveSurface({
  width,
  col,
}: {
  width: number;
  col: { top: string; mid: string; bot: string };
}) {
  const waveOffset = useMotionValue(0);

  useEffect(() => {
    const ctrl = animate(waveOffset, width * 2, {
      duration: 4,
      ease: 'linear',
      repeat: Infinity,
      repeatType: 'loop',
    });
    return () => ctrl.stop();
  }, [waveOffset, width]);

  const w = width || 200;
  const h = 28;
  const amplitude = 5;
  const period = w * 0.6;

  const buildPath = (offset: number, phase: number) => {
    const pts: string[] = [];
    for (let x = -period; x <= w + period; x += 4) {
      const y = amplitude * Math.sin(((x + offset + phase) / period) * Math.PI * 2);
      pts.push(`${x},${h / 2 + y}`);
    }
    return `M ${pts.join(' L ')} L ${w + period},${h} L -${period},${h} Z`;
  };

  return (
    <motion.svg
      width={w}
      height={h}
      style={{ position: 'absolute', top: -h + 2, left: 0, overflow: 'visible' }}
    >
      <motion.path
        d={buildPath(0, 0)}
        fill={col.top}
        style={{ translateX: waveOffset }}
        animate={{
          d: [buildPath(0, 0), buildPath(w * 0.5, 0), buildPath(0, 0)],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />
      <motion.path
        d={buildPath(0, period * 0.5)}
        fill={col.mid}
        style={{ translateX: waveOffset, opacity: 0.6 }}
        animate={{
          d: [buildPath(0, period * 0.5), buildPath(w * 0.5, period * 0.5), buildPath(0, period * 0.5)],
        }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
      />
    </motion.svg>
  );
}

// ─── Vessel component ─────────────────────────────────────────────────────────
interface VesselProps {
  pool: PoolOut;
  clients: RoutingClient[];
  allPools: PoolOut[];
  isSelected: boolean;
  onSelect: () => void;
  onReassign: (clientUserId: string, targetPoolId: string | null) => Promise<void>;
  index: number;
  busy: boolean;
}

const vesselVariants: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.92 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  }),
};

// Static bubble positions per vessel — stable arrays, never re-randomized.
const BUBBLE_CONFIGS: Array<{ x: number; size: number; delay: number }> = [
  { x: 12, size: 3, delay: 0.0 },
  { x: 27, size: 5, delay: 0.38 },
  { x: 45, size: 4, delay: 0.76 },
  { x: 63, size: 3, delay: 1.14 },
  { x: 78, size: 6, delay: 1.52 },
];

function Vessel({ pool, clients, allPools, isSelected, onSelect, onReassign, index, busy }: VesselProps) {
  const pws = clients.filter((c) => c.pool_id === pool.id);
  // Liquid fill = sum(sends_last_30d) / estimated pool capacity.
  // Estimated capacity = member_count × PEER_MONTHLY_CAP sends/month.
  const usedSends = pws.reduce((s, c) => s + (c.sends_last_30d ?? 0), 0);
  const capacityTotal = poolCapacity30d(pool);
  const pct = Math.min(1, usedSends / capacityTotal);

  const vesselRef = useRef<HTMLDivElement>(null);
  const [vesselH, setVesselH] = useState(140);
  const [vesselW, setVesselW] = useState(200);

  useEffect(() => {
    const el = vesselRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setVesselH(el.clientHeight || 140);
      setVesselW(el.clientWidth || 200);
    });
    ro.observe(el);
    setVesselH(el.clientHeight || 140);
    setVesselW(el.clientWidth || 200);
    return () => ro.disconnect();
  }, []);

  const liqColor = liquidColor(pct);
  const sColor = statusColor(pct);

  // Liquid fill height (px) as a spring
  const fillH = useSpring(pct * vesselH, { stiffness: 55, damping: 13 });
  useEffect(() => {
    fillH.set(pct * vesselH);
  }, [pct, vesselH, fillH]);

  // Chip reassign menu
  const [menuWsId, setMenuWsId] = useState<string | null>(null);

  const handleChipMenu = useCallback(
    (e: React.MouseEvent, wsId: string) => {
      e.stopPropagation();
      setMenuWsId((prev) => (prev === wsId ? null : wsId));
    },
    [],
  );

  const handleReassign = useCallback(
    async (clientUserId: string, targetPoolId: string | null) => {
      setMenuWsId(null);
      await onReassign(clientUserId, targetPoolId);
    },
    [onReassign],
  );

  return (
    <motion.div
      custom={index}
      variants={vesselVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.02, transition: { duration: 0.22 } }}
      whileTap={{ scale: 0.985 }}
      onClick={onSelect}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        outline: isSelected ? `2px solid ${sColor}` : '2px solid transparent',
        outlineOffset: 3,
        borderRadius: 18,
        transition: 'outline-color 0.25s',
      }}
    >
      <div
        style={{
          ...glassBox(),
          borderRadius: 18,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${C.borderSoft}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: sColor,
                boxShadow: `0 0 8px ${sColor}88`,
                flexShrink: 0,
              }}
            />
            <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{pool.name}</span>
            {pool.is_default && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: C.accentB,
                  background: 'rgba(255,138,75,0.14)',
                  border: '1px solid rgba(255,138,75,0.28)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                default
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: 11,
              color: sColor,
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            <AnimatedNumber value={Math.round(pct * 100)} />%
          </span>
        </div>

        {/* Tank vessel */}
        <div
          ref={vesselRef}
          style={{
            position: 'relative',
            margin: '12px 14px 0',
            height: 140,
            borderRadius: 12,
            background: 'rgba(0,0,0,0.30)',
            border: `1px solid ${C.border}`,
            overflow: 'hidden',
          }}
        >
          {/* Liquid body */}
          <motion.div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: fillH,
              background: `linear-gradient(180deg, ${liqColor.mid}, ${liqColor.bot})`,
            }}
          >
            <WaveSurface width={vesselW - 28} col={liqColor} />
            {BUBBLE_CONFIGS.map((b, i) => (
              <Bubble
                key={i}
                x={b.x}
                size={b.size}
                delay={b.delay}
                fillPct={pct}
                liquidTop={vesselH * 0.8}
              />
            ))}
          </motion.div>

          {/* % label centred */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: '#fff',
                textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                letterSpacing: '-0.02em',
              }}
            >
              <AnimatedNumber value={Math.round(pct * 100)} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>%</span>
            </span>
          </div>

          {/* Capacity grid lines */}
          {([0.25, 0.5, 0.75] as const).map((mark) => (
            <div
              key={mark}
              style={{
                position: 'absolute',
                bottom: `${mark * 100}%`,
                left: 0,
                right: 0,
                height: 1,
                background: 'rgba(255,255,255,0.07)',
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  right: 5,
                  bottom: 2,
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.25)',
                  fontWeight: 500,
                  letterSpacing: '0.03em',
                }}
              >
                {Math.round(mark * 100)}%
              </span>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            margin: '10px 14px 12px',
            borderRadius: 10,
            overflow: 'hidden',
            border: `1px solid ${C.borderSoft}`,
          }}
        >
          {[
            { label: 'Helpers', value: pool.member_count, dec: 0 },
            { label: 'Workspaces', value: pws.length, dec: 0 },
          ].map((s, si) => (
            <div
              key={s.label}
              style={{
                padding: '7px 10px',
                borderLeft: si > 0 ? `1px solid ${C.borderSoft}` : 'none',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                <AnimatedNumber value={s.value} decimals={s.dec} />
              </div>
              <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Sends used / capacity */}
        <div
          style={{
            padding: '0 14px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 11, color: C.faint }}>
            <AnimatedNumber value={usedSends} /> / {capacityTotal.toLocaleString()} sends/30d
          </span>
          <span
            style={{
              fontSize: 10,
              color: sColor,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {pct >= 0.85 ? 'Overloaded' : pct >= 0.60 ? 'Filling' : 'Healthy'}
          </span>
        </div>

        {/* Daily send cap */}
        {pool.daily_send_limit != null && (
          <div style={{ padding: '0 14px 12px' }}>
            <span style={{ fontSize: 10, color: C.faint }}>
              limit {pool.daily_send_limit.toLocaleString()}/day
            </span>
          </div>
        )}

        {/* Workspace chips */}
        <div
          style={{
            padding: '8px 14px 14px',
            borderTop: `1px solid ${C.borderSoft}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            minHeight: 40,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <AnimatePresence>
            {pws.length === 0 ? (
              <motion.span
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ fontSize: 11, color: C.faint, fontStyle: 'italic' }}
              >
                No workspaces assigned
              </motion.span>
            ) : (
              pws.map((client) => (
                <WorkspaceChip
                  key={client.user_id}
                  client={client}
                  allPools={allPools}
                  currentPoolId={pool.id}
                  menuOpen={menuWsId === client.user_id}
                  onMenuToggle={(e) => handleChipMenu(e, client.user_id)}
                  onMenuClose={() => setMenuWsId(null)}
                  onReassign={(targetPoolId) => handleReassign(client.user_id, targetPoolId)}
                  busy={busy}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Workspace chip ────────────────────────────────────────────────────────────
const planColor: Record<string, string> = {
  starter:  C.faint,
  growth:   C.accentB,
  scale:    C.success,
  free:     C.faint,
};

function getPlanColor(plan: string): string {
  return planColor[plan.toLowerCase()] ?? C.faint;
}

interface ChipProps {
  client: RoutingClient;
  allPools: PoolOut[];
  currentPoolId: string;
  menuOpen: boolean;
  onMenuToggle: (e: React.MouseEvent) => void;
  onMenuClose: () => void;
  onReassign: (targetPoolId: string | null) => Promise<void>;
  busy: boolean;
}

function avatarHue(email: string): number {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % 360;
  return h;
}

function WorkspaceChip({
  client,
  allPools,
  currentPoolId,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  onReassign,
  busy,
}: ChipProps) {
  const chipRef = useRef<HTMLDivElement>(null);
  const localPart = client.email.split('@')[0] ?? client.email;
  const initials = localPart.slice(0, 2).toUpperCase();
  const hue = avatarHue(client.email);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) {
        onMenuClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, onMenuClose]);

  return (
    <motion.div
      ref={chipRef}
      layoutId={`chip-${client.user_id}`}
      initial={{ opacity: 0, scale: 0.75 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.22 } }}
      layout
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      style={{ position: 'relative' }}
    >
      <motion.div
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.93 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 8px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.08)',
          border: `1px solid rgba(255,255,255,0.12)`,
          cursor: busy ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          opacity: busy ? 0.6 : 1,
        }}
        onClick={busy ? undefined : onMenuToggle}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 30) % 360} 65% 48%))`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 7,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <span
          title={client.email}
          style={{
            fontSize: 11,
            color: C.text,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 160,
          }}
        >
          {client.email}
        </span>
        {client.plan && (
          <span
            style={{
              fontSize: 9,
              color: getPlanColor(client.plan),
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {client.plan.toUpperCase()}
          </span>
        )}
        <ChevronDown size={9} color={C.faint} strokeWidth={2.5} />
      </motion.div>

      {/* Reassign dropdown */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.94 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 0,
              zIndex: 120,
              background: 'rgba(20,18,24,0.96)',
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: '6px 0',
              minWidth: 180,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            }}
          >
            <div
              style={{
                padding: '4px 12px 8px',
                fontSize: 10,
                color: C.faint,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                borderBottom: `1px solid ${C.borderSoft}`,
                marginBottom: 4,
              }}
            >
              Move to account group
            </div>
            {allPools.map((p) => (
              <motion.button
                key={p.id}
                whileHover={{ background: 'rgba(255,255,255,0.07)' }}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (p.id !== currentPoolId) await onReassign(p.id);
                }}
                disabled={p.id === currentPoolId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 12px',
                  background: 'rgba(255,255,255,0)',
                  border: 'none',
                  cursor: p.id === currentPoolId ? 'default' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: p.id === currentPoolId ? C.ghost : C.success,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: p.id === currentPoolId ? C.ghost : C.text,
                    fontWeight: 500,
                  }}
                >
                  {p.name}
                </span>
                {p.id === currentPoolId && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: C.faint }}>current</span>
                )}
              </motion.button>
            ))}
            {/* Unassign option */}
            <motion.button
              whileHover={{ background: 'rgba(255,255,255,0.07)' }}
              onClick={async (e) => {
                e.stopPropagation();
                await onReassign(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '7px 12px',
                background: 'rgba(255,255,255,0)',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                borderTop: `1px solid ${C.borderSoft}`,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: C.faint,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: C.dim, fontWeight: 500 }}>
                Unassign · use default
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({
  pool,
  clients,
  allPools,
  mailboxes,
  onClose,
  onReassign,
  onAssignMailbox,
  mailboxBusy,
  busy,
}: {
  pool: PoolOut;
  clients: RoutingClient[];
  allPools: PoolOut[];
  mailboxes: RoutingMailbox[];
  onClose: () => void;
  onReassign: (clientUserId: string, targetPoolId: string | null) => Promise<void>;
  onAssignMailbox: (mailboxId: string, poolId: string | null) => Promise<void>;
  mailboxBusy: boolean;
  busy: boolean;
}) {
  const pws = clients.filter((c) => c.pool_id === pool.id);
  const usedSends = pws.reduce((s, c) => s + (c.sends_last_30d ?? 0), 0);
  const capacityTotal = poolCapacity30d(pool);
  const pct = Math.min(1, usedSends / capacityTotal);
  const sColor = statusColor(pct);

  return (
    <motion.div
      key={pool.id}
      initial={{ opacity: 0, x: 32, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 32, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      style={{
        ...glassBox({ borderRadius: 18 }),
        width: 300,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: sColor,
                boxShadow: `0 0 8px ${sColor}88`,
              }}
            />
            <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>
              {pool.name}
            </span>
            {pool.is_default && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: C.accentB,
                  background: 'rgba(255,138,75,0.14)',
                  border: '1px solid rgba(255,138,75,0.28)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                default
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>
            {pool.member_count} helper{pool.member_count !== 1 ? 's' : ''}
            {pool.description ? ` · ${pool.description}` : ''}
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.15, background: C.glass2 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          style={{
            background: C.glass,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={14} color={C.dim} strokeWidth={2.2} />
        </motion.button>
      </div>

      {/* Capacity bar */}
      <div style={{ padding: '14px 16px 12px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
            fontSize: 11,
            color: C.dim,
          }}
        >
          <span>Daily limit used</span>
          <span style={{ color: sColor, fontWeight: 700 }}>
            <AnimatedNumber value={Math.round(pct * 100)} />%
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: 'rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
        >
          <motion.div
            animate={{ width: `${pct * 100}%` }}
            transition={{ type: 'spring', stiffness: 60, damping: 14 }}
            style={{ height: '100%', borderRadius: 4, background: sColor }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 5,
            fontSize: 10,
            color: C.faint,
          }}
        >
          <span><AnimatedNumber value={usedSends} /> sends/30d used</span>
          <span>{capacityTotal.toLocaleString()} cap</span>
        </div>
      </div>

      {/* Workspace list */}
      <div style={{ padding: '0 16px 14px', overflowY: 'auto', flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            color: C.faint,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}
        >
          {pws.length} Workspace{pws.length !== 1 ? 's' : ''}
        </div>
        <AnimatePresence>
          {pws.map((client) => (
            <DetailWorkspaceRow
              key={client.user_id}
              client={client}
              allPools={allPools}
              currentPoolId={pool.id}
              mailboxes={mailboxes.filter((m) => m.workspace_id === client.user_id)}
              onReassign={(targetPoolId) => onReassign(client.user_id, targetPoolId)}
              onAssignMailbox={onAssignMailbox}
              mailboxBusy={mailboxBusy}
              busy={busy}
            />
          ))}
        </AnimatePresence>
        {pws.length === 0 && (
          <div
            style={{
              fontSize: 12,
              color: C.faint,
              fontStyle: 'italic',
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            No workspaces assigned to this account group.
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Per-mailbox routing row ───────────────────────────────────────────────────
const MAILBOX_PROVIDER_LABEL: Record<RoutingMailbox['provider'], string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

function MailboxRoutingRow({
  mailbox,
  allPools,
  onAssign,
  busy,
}: {
  mailbox: RoutingMailbox;
  allPools: PoolOut[];
  onAssign: (poolId: string | null) => Promise<void>;
  busy: boolean;
}) {
  // Warn only when the mailbox genuinely can't send. OAuth mailboxes that CAN
  // send (XOAUTH2) get a neutral "OAuth" tag instead of the "not sending" alarm.
  const cannotSend = !mailbox.can_send;
  const oauthOk = mailbox.is_oauth && mailbox.can_send;
  const selectStyle: CSSProperties = {
    background: 'rgba(20,18,24,0.95)',
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '4px 6px',
    fontSize: 11,
    fontWeight: 500,
    cursor: busy ? 'not-allowed' : 'pointer',
    maxWidth: 150,
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 8,
        background: C.glass,
        border: `1px solid ${C.borderSoft}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          title={mailbox.email}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {mailbox.email}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 2,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 9, color: C.faint, fontWeight: 600, letterSpacing: '0.04em' }}>
            {MAILBOX_PROVIDER_LABEL[mailbox.provider] ?? mailbox.provider.toUpperCase()}
          </span>
          {cannotSend && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 9,
                fontWeight: 700,
                color: C.warning,
                background: C.warningDim,
                border: `1px solid ${C.warning}44`,
                borderRadius: 4,
                padding: '1px 5px',
                letterSpacing: '0.04em',
              }}
            >
              <AlertTriangle size={9} strokeWidth={2.4} />
              {mailbox.is_oauth ? 'OAuth · not sending' : 'No credentials'}
            </span>
          )}
          {oauthOk && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.faint,
                background: C.glass2,
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                padding: '1px 5px',
                letterSpacing: '0.04em',
              }}
            >
              OAuth
            </span>
          )}
          <span style={{ fontSize: 9, color: C.faint }}>
            {mailbox.sends_last_30d.toLocaleString()} sends/30d
          </span>
        </div>
      </div>
      <select
        value={mailbox.pool_id ?? ''}
        disabled={busy}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.target.value;
          void onAssign(v === '' ? null : v);
        }}
        style={selectStyle}
      >
        <option value="">
          Inherit workspace
          {mailbox.effective_pool_id == null ? ' ✓' : ''}
        </option>
        {allPools.map((p) => {
          const isEffective = p.id === mailbox.effective_pool_id;
          return (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.is_default ? ' (default)' : ''}
              {isEffective ? ' ✓ routes here' : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function DetailWorkspaceRow({
  client,
  allPools,
  currentPoolId,
  mailboxes,
  onReassign,
  onAssignMailbox,
  mailboxBusy,
  busy,
}: {
  client: RoutingClient;
  allPools: PoolOut[];
  currentPoolId: string;
  mailboxes: RoutingMailbox[];
  onReassign: (targetPoolId: string | null) => Promise<void>;
  onAssignMailbox: (mailboxId: string, poolId: string | null) => Promise<void>;
  mailboxBusy: boolean;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const initials = (client.email.split('@')[0] ?? client.email)
    .slice(0, 2)
    .toUpperCase();
  const hue = avatarHue(client.email);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <motion.div
      ref={rowRef}
      layoutId={`detail-row-${client.user_id}`}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      style={{ position: 'relative', marginBottom: 6 }}
    >
      <motion.div
        whileHover={{ background: C.glass2 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px',
          borderRadius: 10,
          background: C.glass,
          border: `1px solid ${C.borderSoft}`,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
        onClick={() => !busy && setOpen((p) => !p)}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 30) % 360} 65% 48%))`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            title={client.email}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {client.email}
          </div>
          <div style={{ fontSize: 10, color: C.faint }}>
            {client.mailbox_count > 0 ? `${client.mailbox_count} mbx · ` : ''}
            {(client.sends_last_30d ?? 0).toLocaleString()} sends/30d
          </div>
        </div>
        {client.plan && (
          <span
            style={{
              fontSize: 9,
              color: getPlanColor(client.plan),
              fontWeight: 600,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            {client.plan.toUpperCase()}
          </span>
        )}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={12} color={C.faint} strokeWidth={2.2} />
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              overflow: 'hidden',
              background: 'rgba(0,0,0,0.25)',
              borderRadius: '0 0 10px 10px',
              border: `1px solid ${C.borderSoft}`,
              borderTop: 'none',
              marginTop: -4,
            }}
          >
            {/* Per-mailbox routing */}
            <div
              style={{
                padding: '6px 10px 4px',
                fontSize: 9,
                color: C.faint,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Mailboxes ({mailboxes.length})
            </div>
            {mailboxes.length === 0 ? (
              <div
                style={{
                  padding: '2px 10px 8px',
                  fontSize: 10,
                  color: C.faint,
                  fontStyle: 'italic',
                }}
              >
                No mailboxes connected.
              </div>
            ) : (
              <div style={{ padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mailboxes.map((mbx) => (
                  <MailboxRoutingRow
                    key={mbx.id}
                    mailbox={mbx}
                    allPools={allPools}
                    onAssign={(poolId) => onAssignMailbox(mbx.id, poolId)}
                    busy={mailboxBusy}
                  />
                ))}
              </div>
            )}

            <div
              style={{
                padding: '6px 10px 4px',
                fontSize: 9,
                color: C.faint,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                borderTop: `1px solid ${C.borderSoft}`,
              }}
            >
              Move workspace to account group
            </div>
            {allPools.map((p) => (
              <motion.button
                key={p.id}
                whileHover={{ background: 'rgba(255,255,255,0.07)' }}
                disabled={p.id === currentPoolId || busy}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (p.id !== currentPoolId) {
                    await onReassign(p.id);
                    setOpen(false);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 10px',
                  background: 'rgba(255,255,255,0)',
                  border: 'none',
                  cursor: p.id === currentPoolId || busy ? 'default' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: p.id === currentPoolId ? C.ghost : C.accentB,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11, color: p.id === currentPoolId ? C.ghost : C.dim }}>
                  {p.name}
                </span>
                {p.id === currentPoolId && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: C.faint }}>current</span>
                )}
              </motion.button>
            ))}
            <motion.button
              whileHover={{ background: 'rgba(255,255,255,0.07)' }}
              disabled={busy}
              onClick={async (e) => {
                e.stopPropagation();
                await onReassign(null);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 10px',
                background: 'rgba(255,255,255,0)',
                border: 'none',
                cursor: busy ? 'default' : 'pointer',
                textAlign: 'left',
                borderTop: `1px solid ${C.borderSoft}`,
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.faint, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.dim }}>Unassign · use default</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────
function SummaryBar({
  clients,
  pools,
  totalPlatformCapacity,
  usedPlatformCapacity,
}: {
  clients: RoutingClient[];
  pools: PoolOut[];
  totalPlatformCapacity: number;
  usedPlatformCapacity: number;
}) {
  const totalDerivedCap = pools.reduce((s, p) => s + p.member_count * PEER_MONTHLY_CAP, 0);
  const totalUsedSends = clients.reduce((s, c) => s + (c.sends_last_30d ?? 0), 0);

  // avgUtil across all pools
  const avgUtil = pools.length === 0 ? 0 : pools.reduce((s, p) => {
    const used = clients
      .filter((c) => c.pool_id === p.id)
      .reduce((a, c) => a + (c.sends_last_30d ?? 0), 0);
    const cap = poolCapacity30d(p);
    return s + used / cap;
  }, 0) / pools.length;

  const overloaded = pools.filter((p) => {
    const used = clients
      .filter((c) => c.pool_id === p.id)
      .reduce((a, c) => a + (c.sends_last_30d ?? 0), 0);
    const cap = poolCapacity30d(p);
    return used / cap >= 0.85;
  }).length;

  // Use real platform stats if non-zero, else derive from pools
  const displayCap = totalPlatformCapacity > 0 ? totalPlatformCapacity : totalDerivedCap;
  const displayUsed = usedPlatformCapacity > 0 ? usedPlatformCapacity : totalUsedSends;

  type StatEntry = {
    icon: LucideIcon;
    label: string;
    value: number;
    suffix: string;
    dec: number;
    danger?: boolean;
  };
  const stats: StatEntry[] = [
    { icon: Server, label: 'Platform daily limit', value: displayCap, suffix: '/day', dec: 0 },
    { icon: Layers, label: 'Active today', value: displayUsed, suffix: '/day', dec: 0 },
    { icon: Zap, label: 'Avg daily limit used', value: avgUtil * 100, suffix: '%', dec: 1 },
    { icon: AlertTriangle, label: 'Overloaded account groups', value: overloaded, suffix: '', dec: 0, danger: overloaded > 0 },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 20,
      }}
    >
      {stats.map((s) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{
            ...glassBox({ borderRadius: 14, padding: '12px 16px' }),
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: s.danger ? C.dangerDim : C.glass2,
              border: `1px solid ${s.danger ? C.danger + '44' : C.borderSoft}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <s.icon size={16} color={s.danger ? C.danger : C.accentB} strokeWidth={2} />
          </div>
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: s.danger ? C.danger : C.text,
                lineHeight: 1,
              }}
            >
              <AnimatedNumber value={s.value} decimals={s.dec} />
              {s.suffix}
            </div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 3 }}>{s.label}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Assign-workspace dialog ───────────────────────────────────────────────────
// The vessel chips only let you *reassign* a workspace that's already pinned to a
// pool — an unpinned workspace (pool_id === null) renders on no vessel, so there
// was no way to assign it at all. This dialog is the single discoverable place to
// pin ANY workspace (assigned or not) to ANY pool.
function AssignWorkspaceDialog({
  open,
  onOpenChange,
  clients,
  pools,
  onReassign,
  busy,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  clients: RoutingClient[];
  pools: PoolOut[];
  onReassign: (clientUserId: string, targetPoolId: string | null) => Promise<void>;
  busy: boolean;
}) {
  const sorted = useMemo(
    () => [...clients].sort((a, b) => a.email.localeCompare(b.email)),
    [clients],
  );

  const selectStyle: CSSProperties = {
    background: 'rgba(20,18,24,0.95)',
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '6px 8px',
    fontSize: 12,
    fontWeight: 500,
    cursor: busy ? 'not-allowed' : 'pointer',
    minWidth: 150,
    flexShrink: 0,
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Assign workspaces to account groups</AppDialogTitle>
          <AppDialogDescription>
            Pin a workspace to a account group. Unpinned workspaces fall through to the
            default account group, then trust-weighted random. Changes apply immediately.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          {sorted.length === 0 ? (
            <p style={{ fontSize: 13, color: C.dim }}>No workspaces yet.</p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 400,
                overflowY: 'auto',
              }}
            >
              {sorted.map((c) => {
                const initials = (c.email.split('@')[0] ?? c.email)
                  .slice(0, 2)
                  .toUpperCase();
                const hue = avatarHue(c.email);
                const currentValue = c.pool_id ?? '__unassign__';
                return (
                  <div
                    key={c.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: C.glass,
                      border: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 30) % 360} 65% 48%))`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: C.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.email}
                      </div>
                      <div style={{ fontSize: 11, color: C.faint }}>
                        {c.pool_id ? `Pinned → ${c.pool_name}` : 'Unpinned · default routing'}
                        {c.mailbox_count ? ` · ${c.mailbox_count} mbx` : ''}
                      </div>
                    </div>
                    <select
                      value={currentValue}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        void onReassign(c.user_id, v === '__unassign__' ? null : v);
                      }}
                      style={selectStyle}
                    >
                      <option value="__unassign__">Unassigned · default routing</option>
                      {pools.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.is_default ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function PoolRoutingPage() {
  const { data, isLoading, isError, assign, revert } = usePoolRouting();
  const createPool = useCreatePool();
  const statsQ = useAdminPeerInboxStats();
  const mailboxesQ = useRoutingMailboxes();
  const assignMailbox = useAssignMailboxPool();

  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolDesc, setNewPoolDesc] = useState('');

  const pools: PoolOut[] = data?.pools ?? [];
  const clients: RoutingClient[] = data?.clients ?? [];
  const mailboxes: RoutingMailbox[] = mailboxesQ.data ?? [];
  const busy = assign.isPending || revert.isPending;
  const mailboxBusy = assignMailbox.isPending;

  const selectedPool = useMemo(
    () => pools.find((p) => p.id === selectedPoolId) ?? null,
    [pools, selectedPoolId],
  );

  const handleReassign = useCallback(
    async (clientUserId: string, targetPoolId: string | null) => {
      const client = clients.find((c) => c.user_id === clientUserId);
      if (!client) return;
      if (targetPoolId === client.pool_id) return;
      try {
        if (targetPoolId === null) {
          await revert.mutateAsync(clientUserId);
          toast.success(`${client.email} → unassigned (default account group).`);
        } else {
          await assign.mutateAsync({ user_id: clientUserId, pool_id: targetPoolId });
          const poolName = pools.find((p) => p.id === targetPoolId)?.name ?? 'account group';
          toast.success(`${client.email} → ${poolName}.`);
        }
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Routing change failed.'));
      }
    },
    [clients, pools, assign, revert],
  );

  const handleAssignMailbox = useCallback(
    async (mailboxId: string, poolId: string | null) => {
      const mbx = mailboxes.find((m) => m.id === mailboxId);
      if (mbx && (mbx.pool_id ?? null) === poolId) return;
      try {
        await assignMailbox.mutateAsync({ mailbox_id: mailboxId, pool_id: poolId });
        if (poolId === null) {
          toast.success(`${mbx?.email ?? 'Mailbox'} → inherits workspace routing.`);
        } else {
          const poolName = pools.find((p) => p.id === poolId)?.name ?? 'account group';
          toast.success(`${mbx?.email ?? 'Mailbox'} → ${poolName}.`);
        }
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Mailbox routing change failed.'));
      }
    },
    [mailboxes, pools, assignMailbox],
  );

  const totalPlatformCapacity = statsQ.data?.total_capacity ?? 0;
  const usedPlatformCapacity = statsQ.data?.used_capacity_today ?? 0;

  return (
    <div
      style={{
        minHeight: '100%',
        background: 'transparent',
        padding: '24px 24px 40px',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: C.accentB,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <Layers size={11} strokeWidth={2.5} />
            Admin · Account Routing
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: C.text,
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Capacity Vessels
          </h1>
          <p style={{ fontSize: 12, color: C.dim, marginTop: 4, margin: '4px 0 0' }}>
            Each account group is a liquid tank — fill level = workspace sends vs. helper daily limit. Click to inspect.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.location.reload()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: C.glass,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              color: C.dim,
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <RefreshCw size={12} strokeWidth={2.2} />
            Refresh
          </motion.button>
          <ExportButton
            rows={clients}
            columns={ROUTING_EXPORT_COLUMNS}
            filename={`pool-routing-${exportStamp()}`}
          />
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setAssignOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: C.glass,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              color: C.text,
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <Layers size={12} strokeWidth={2.2} />
            Assign workspace
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04, background: '#e5541a' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCreateOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: C.accent,
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <Plus size={13} strokeWidth={2.2} />
            New account group
          </motion.button>
        </div>
      </motion.div>

      {/* Loading / error states */}
      {isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: C.dim,
            fontSize: 13,
            padding: '24px 0',
          }}
        >
          <Loader2 size={16} className="animate-spin" />
          Loading account group routing…
        </div>
      )}

      {isError && !isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: C.danger,
            fontSize: 13,
            padding: '16px',
            background: C.dangerDim,
            border: `1px solid ${C.danger}44`,
            borderRadius: 12,
            marginBottom: 20,
          }}
        >
          <AlertCircle size={14} strokeWidth={2.4} />
          Failed to load account group routing data — backend may not be reachable.
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Summary stats */}
          <SummaryBar
            clients={clients}
            pools={pools}
            totalPlatformCapacity={totalPlatformCapacity}
            usedPlatformCapacity={usedPlatformCapacity}
          />

          {/* Precedence note */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            style={{
              ...glassBox({ borderRadius: 12, padding: '10px 16px' }),
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 20,
            }}
          >
            <Info size={14} color={C.accentB} strokeWidth={2.2} />
            <span style={{ fontSize: 11, color: C.dim }}>
              <strong style={{ color: C.accentB, fontWeight: 700 }}>Routing precedence:</strong>{' '}
              workspace pin → default account group → trust-weighted random.
              Assignments here set the workspace pin.
            </span>
          </motion.div>

          {/* Empty state */}
          {pools.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '48px 0',
                color: C.dim,
              }}
            >
              <Layers size={28} strokeWidth={1.6} color={C.faint} />
              <div style={{ fontSize: 15, fontWeight: 600, color: C.dim }}>No account groups yet</div>
              <div style={{ fontSize: 12, color: C.faint, textAlign: 'center', maxWidth: 360 }}>
                Create your first account group to start routing workspace warmup traffic.
              </div>
            </div>
          )}

          {/* Main content: vessels + optional detail panel */}
          {pools.length > 0 && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Vessels grid */}
              <motion.div
                layout
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 14,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {pools.map((pool, i) => (
                  <Vessel
                    key={pool.id}
                    pool={pool}
                    clients={clients}
                    allPools={pools}
                    isSelected={selectedPoolId === pool.id}
                    onSelect={() =>
                      setSelectedPoolId((prev) => (prev === pool.id ? null : pool.id))
                    }
                    onReassign={handleReassign}
                    index={i}
                    busy={busy}
                  />
                ))}
              </motion.div>

              {/* Detail panel */}
              <AnimatePresence>
                {selectedPool && (
                  <DetailPanel
                    key={selectedPool.id}
                    pool={selectedPool}
                    clients={clients}
                    allPools={pools}
                    mailboxes={mailboxes}
                    onClose={() => setSelectedPoolId(null)}
                    onReassign={handleReassign}
                    onAssignMailbox={handleAssignMailbox}
                    mailboxBusy={mailboxBusy}
                    busy={busy}
                  />
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Routing legend */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            style={{
              marginTop: 24,
              display: 'flex',
              gap: 20,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {[
              { color: C.success, label: 'Healthy (< 60%)' },
              { color: C.warning, label: 'Filling (60–84%)' },
              { color: C.danger, label: 'Overloaded (≥ 85%)' },
            ].map((l) => (
              <div
                key={l.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: C.faint,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: l.color,
                    boxShadow: `0 0 5px ${l.color}88`,
                  }}
                />
                {l.label}
              </div>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 11, color: C.faint }}>
              <MoreHorizontal size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Click a vessel to inspect · Click a chip to reassign · Use “Assign workspace” to pin any workspace
            </div>
          </motion.div>
        </>
      )}

      {/* Assign workspace dialog */}
      <AssignWorkspaceDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        clients={clients}
        pools={pools}
        onReassign={handleReassign}
        busy={busy}
      />

      {/* Create pool dialog */}
      <AppDialog
        open={createOpen}
        onOpenChange={(next) => {
          if (!next) {
            setCreateOpen(false);
            setNewPoolName('');
            setNewPoolDesc('');
          }
        }}
      >
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Create account group</AppDialogTitle>
            <AppDialogDescription>
              A account group bundles helper mailboxes for routing. Workspaces can then be assigned to a
              account group so their warmup traffic only exchanges with that subset.
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogBody className="space-y-3">
            <FormField label="Name" htmlFor="np-name" required>
              <Input
                id="np-name"
                value={newPoolName}
                onChange={(e) => setNewPoolName(e.target.value)}
                placeholder="Enterprise · pool-B"
                autoFocus
              />
            </FormField>
            <FormField label="Description (optional)" htmlFor="np-desc">
              <Input
                id="np-desc"
                value={newPoolDesc}
                onChange={(e) => setNewPoolDesc(e.target.value)}
                placeholder="Higher-trust helpers for paying customers"
              />
            </FormField>
          </AppDialogBody>
          <AppDialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={createPool.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={!newPoolName.trim() || createPool.isPending}
              onClick={async () => {
                try {
                  await createPool.mutateAsync({
                    name: newPoolName.trim(),
                    description: newPoolDesc.trim() || undefined,
                  });
                  toast.success(`Account group "${newPoolName.trim()}" created.`);
                  setCreateOpen(false);
                  setNewPoolName('');
                  setNewPoolDesc('');
                } catch (err) {
                  toast.error(extractErrorMessage(err, 'Could not create account group.'));
                }
              }}
            >
              {createPool.isPending ? 'Creating…' : 'Create account group'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
