/**
 * Admin Pool Routing Design Candidate: R5 Orbital Pools
 *
 * "Orbital Pools" — peer pools as glowing gravitational hubs; customer
 * workspaces orbit them. Clicking a hub focuses it (enlarge/center via
 * layout), dims the others, slides in a detail panel, and lets you reassign
 * a workspace to another pool — which triggers a FLIP orbit-transfer animation.
 *
 * Animation techniques:
 * - layout / layoutId FLIP spring for hub focus + workspace orbit transfer
 * - Staggered entrance via container/child Variants
 * - Continuous ambient: hub scale/glow pulse (CSS keyframe loop), dashed orbit
 *   ring CSS rotation, workspace node ping dots
 * - motion.path pathLength 0→1 SVG draw-in for spoke lines from hub center
 * - useMotionValue + animate() for counter stats with cleanup via controls.stop()
 * - AnimatePresence for detail panel + reassign dropdown + tooltip enter/exit
 * - whileHover / whileTap gesture springs on hubs and workspace nodes
 * - Spring physics on all transitions (stiffness 240, damping 26)
 *
 * Self-contained: no API / react-query / @/features / @/lib.
 * Inline style={{}} only. Mock data only. Warm Aurora Glass palette.
 * NO purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Network,
  Users,
  Mail,
  Star,
  ArrowRight,
  ChevronDown,
  Search,
  Info,
  CheckCircle2,
  AlertTriangle,
  Orbit,
  Cpu,
  Shield,
  Globe,
  Flame,
  X,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.42)',
  ghost: 'rgba(255,255,255,0.18)',
  hairline: 'rgba(255,255,255,0.08)',
  accent: '#F26522',
  accentB: '#FF8A4B',
  success: '#3ddc97',
  warning: '#FF8A4B',
  danger: '#ff5c7a',
  glass: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.06)',
} as const;

const glassBase: CSSProperties = {
  background: C.glass,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: 16,
};

// ─── Mock data ─────────────────────────────────────────────────────────────────

type PoolId = 'default' | 'warm-a' | 'high-rep' | 'cooldown' | 'custom-eu';
type PlanTier = 'Free' | 'Pro' | 'Pro Plus' | 'Agency';

interface Pool {
  id: PoolId;
  name: string;
  tagline: string;
  peers: number;
  capacityUsed: number;
  capacityTotal: number;
  avgReputation: number;
  color: string;
  glowColor: string;
  icon: typeof Network;
}

interface Workspace {
  id: string;
  name: string;
  initials: string;
  plan: PlanTier;
  mailboxes: number;
  sends30d: number;
  poolId: PoolId;
  hue: number;
}

const POOLS: Pool[] = [
  {
    id: 'default',
    name: 'Default',
    tagline: 'Reputation-weighted random assignment',
    peers: 48,
    capacityUsed: 312,
    capacityTotal: 480,
    avgReputation: 0.84,
    color: '#F26522',
    glowColor: 'rgba(242,101,34,0.4)',
    icon: Network,
  },
  {
    id: 'warm-a',
    name: 'Warm-up A',
    tagline: 'Mid-ramp mailboxes; balanced send/receive',
    peers: 24,
    capacityUsed: 156,
    capacityTotal: 240,
    avgReputation: 0.87,
    color: '#FF8A4B',
    glowColor: 'rgba(255,138,75,0.38)',
    icon: Flame,
  },
  {
    id: 'high-rep',
    name: 'High-Rep',
    tagline: 'Premium peers ≥ 0.92 reputation; Agency only',
    peers: 16,
    capacityUsed: 88,
    capacityTotal: 160,
    avgReputation: 0.95,
    color: '#3ddc97',
    glowColor: 'rgba(61,220,151,0.32)',
    icon: Star,
  },
  {
    id: 'cooldown',
    name: 'Cooldown',
    tagline: 'Throttled; recovering from bounces',
    peers: 12,
    capacityUsed: 40,
    capacityTotal: 80,
    avgReputation: 0.63,
    color: '#ff5c7a',
    glowColor: 'rgba(255,92,122,0.32)',
    icon: Shield,
  },
  {
    id: 'custom-eu',
    name: 'Custom-EU',
    tagline: 'EU-region GDPR-compliant peer set',
    peers: 18,
    capacityUsed: 102,
    capacityTotal: 180,
    avgReputation: 0.91,
    color: '#c8944a',
    glowColor: 'rgba(200,148,74,0.36)',
    icon: Globe,
  },
];

const WORKSPACES: Workspace[] = [
  { id: 'ws-01', name: 'Acme Corp',      initials: 'AC', plan: 'Agency',   mailboxes: 18, sends30d: 14820, poolId: 'high-rep',  hue: 28  },
  { id: 'ws-02', name: 'Northwind IO',   initials: 'NW', plan: 'Pro Plus', mailboxes: 9,  sends30d: 6240,  poolId: 'warm-a',   hue: 48  },
  { id: 'ws-03', name: 'Lumen Labs',     initials: 'LL', plan: 'Pro',      mailboxes: 4,  sends30d: 2100,  poolId: 'default',  hue: 14  },
  { id: 'ws-04', name: 'Vendio',         initials: 'VD', plan: 'Pro Plus', mailboxes: 7,  sends30d: 5380,  poolId: 'warm-a',   hue: 36  },
  { id: 'ws-05', name: 'Beacon App',     initials: 'BA', plan: 'Agency',   mailboxes: 22, sends30d: 19200, poolId: 'high-rep',  hue: 18  },
  { id: 'ws-06', name: 'Parable Inc',    initials: 'PI', plan: 'Free',     mailboxes: 1,  sends30d: 180,   poolId: 'cooldown', hue: 345 },
  { id: 'ws-07', name: 'Arclamp',        initials: 'AL', plan: 'Pro',      mailboxes: 5,  sends30d: 3400,  poolId: 'default',  hue: 22  },
  { id: 'ws-08', name: 'Oxen Studio',    initials: 'OS', plan: 'Pro Plus', mailboxes: 8,  sends30d: 4920,  poolId: 'custom-eu', hue: 42 },
  { id: 'ws-09', name: 'Hibou',          initials: 'HB', plan: 'Agency',   mailboxes: 14, sends30d: 9600,  poolId: 'high-rep',  hue: 8  },
  { id: 'ws-10', name: 'Parch IO',       initials: 'PA', plan: 'Free',     mailboxes: 2,  sends30d: 310,   poolId: 'cooldown', hue: 355 },
  { id: 'ws-11', name: 'Meridian Co',    initials: 'MC', plan: 'Pro',      mailboxes: 3,  sends30d: 1680,  poolId: 'default',  hue: 30  },
  { id: 'ws-12', name: 'Drift Cloud',    initials: 'DC', plan: 'Pro Plus', mailboxes: 6,  sends30d: 3800,  poolId: 'custom-eu', hue: 52 },
  { id: 'ws-13', name: 'Kestrel SaaS',   initials: 'KS', plan: 'Agency',   mailboxes: 11, sends30d: 8100,  poolId: 'warm-a',   hue: 38  },
  { id: 'ws-14', name: 'Torrent Media',  initials: 'TM', plan: 'Pro',      mailboxes: 4,  sends30d: 2450,  poolId: 'default',  hue: 20  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function poolById(id: PoolId): Pool {
  return POOLS.find((p) => p.id === id) ?? POOLS[0]!;
}

function poolIndex(pool: Pool): number {
  return POOLS.findIndex((p) => p.id === pool.id);
}

function planColor(plan: PlanTier): string {
  if (plan === 'Agency')   return '#F26522';
  if (plan === 'Pro Plus') return '#FF8A4B';
  if (plan === 'Pro')      return '#3ddc97';
  return C.ghost;
}

function repColor(r: number): string {
  if (r >= 0.9) return C.success;
  if (r >= 0.75) return C.warning;
  return C.danger;
}

function capColor(used: number, total: number): string {
  const pct = used / total;
  if (pct >= 0.9) return C.danger;
  if (pct >= 0.75) return C.warning;
  return C.accent;
}

// ─── Keyframe injection ───────────────────────────────────────────────────────

function useKeyframes() {
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    const id = 'r5-orbital-kf';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      @keyframes r5-orbit-cw {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
      @keyframes r5-orbit-ccw {
        from { transform: rotate(0deg); }
        to   { transform: rotate(-360deg); }
      }
      @keyframes r5-hub-pulse {
        0%,100% { opacity: 0.28; transform: scale(1); }
        50%     { opacity: 0.08; transform: scale(1.18); }
      }
      @keyframes r5-dot-ping {
        0%   { transform: scale(1); opacity: 1; }
        70%  { transform: scale(2.2); opacity: 0; }
        100% { transform: scale(2.2); opacity: 0; }
      }
    `;
    document.head.appendChild(el);
    return () => {
      const found = document.getElementById(id);
      if (found) document.head.removeChild(found);
    };
  }, []);
}

// ─── Animated counter hook ────────────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 0.9): number {
  const mv = useMotionValue(target);
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    const controls = animate(mv, target, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [mv, target, duration]);

  return display;
}

// ─── Variants ─────────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.09, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 240, damping: 26 },
  },
};

const panelVariants: Variants = {
  hidden: { opacity: 0, x: 32, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 240, damping: 26 },
  },
  exit: {
    opacity: 0,
    x: 32,
    scale: 0.97,
    transition: { duration: 0.22 },
  },
};

const tooltipVariants: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.94 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 340, damping: 28 },
  },
  exit: { opacity: 0, y: 4, scale: 0.95, transition: { duration: 0.14 } },
};

// ─── Shared primitives ────────────────────────────────────────────────────────

function GlassTile({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...glassBase, padding: '16px 18px', ...style }}>{children}</div>
  );
}

function WsAvatar({ ws, size = 32 }: { ws: Workspace; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: `linear-gradient(135deg, hsl(${ws.hue} 72% 54%), hsl(${ws.hue + 28} 66% 44%))`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 800,
        color: '#fff',
        flexShrink: 0,
        letterSpacing: '-0.02em',
      }}
    >
      {ws.initials}
    </div>
  );
}

function PlanBadge({ plan }: { plan: PlanTier }) {
  const col = planColor(plan);
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: col,
        background: `${col}22`,
        border: `1px solid ${col}55`,
        borderRadius: 6,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {plan}
    </span>
  );
}

// Animated SVG arc ring
function CapacityRing({
  used,
  total,
  size = 40,
  strokeW = 3.5,
  color,
}: {
  used: number;
  total: number;
  size?: number;
  strokeW?: number;
  color: string;
}) {
  const r = (size - strokeW * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, used / total);
  const dash = circ * pct;
  const gap = circ * (1 - pct);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={strokeW} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round"
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${dash} ${gap}` }}
        transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 }}
      />
    </svg>
  );
}

// ─── Hub node ─────────────────────────────────────────────────────────────────

function HubNode({
  pool,
  focused,
  dimmed,
  wsCount,
  onClick,
}: {
  pool: Pool;
  focused: boolean;
  dimmed: boolean;
  wsCount: number;
  onClick: () => void;
}) {
  const Icon = pool.icon;
  const pct = Math.round((pool.capacityUsed / pool.capacityTotal) * 100);
  const idx = poolIndex(pool);

  return (
    <motion.div
      layout
      layoutId={`hub-${pool.id}`}
      onClick={onClick}
      whileHover={focused ? {} : { scale: 1.06 }}
      whileTap={{ scale: 0.96 }}
      animate={{ opacity: dimmed ? 0.38 : 1, scale: focused ? 1.18 : 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
        zIndex: focused ? 10 : 1,
        width: 118,
      }}
    >
      {/* Outer glow pulse */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: focused ? 130 : 100,
          height: focused ? 130 : 100,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${pool.glowColor} 0%, transparent 68%)`,
          animation: `r5-hub-pulse 3.2s ease-in-out infinite`,
          animationDelay: `${idx * 0.55}s`,
          transition: 'width 0.5s, height 0.5s',
          pointerEvents: 'none',
        }}
      />

      {/* Hub orb */}
      <div
        style={{
          position: 'relative',
          width: focused ? 80 : 62,
          height: focused ? 80 : 62,
          borderRadius: '50%',
          background: `radial-gradient(circle at 38% 32%, ${pool.color}44, rgba(0,0,0,0.4))`,
          border: `2px solid ${pool.color}`,
          boxShadow: focused
            ? `0 0 0 4px ${pool.color}30, 0 0 40px ${pool.glowColor}, inset 0 1px 0 rgba(255,255,255,0.22)`
            : `0 0 20px ${pool.glowColor}, inset 0 1px 0 rgba(255,255,255,0.14)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'width 0.4s, height 0.4s, box-shadow 0.4s',
          flexShrink: 0,
        }}
      >
        <Icon size={focused ? 28 : 22} color={pool.color} strokeWidth={1.8} />
        {/* Reputation dot */}
        <div
          style={{
            position: 'absolute', top: 4, right: 4,
            width: 9, height: 9, borderRadius: '50%',
            background: repColor(pool.avgReputation),
            border: '1.5px solid rgba(0,0,0,0.5)',
          }}
        />
        {/* Ping ring */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 4, right: 4,
            width: 9, height: 9, borderRadius: '50%',
            background: repColor(pool.avgReputation),
            animation: `r5-dot-ping 2.4s ease-out infinite`,
            animationDelay: `${idx * 0.4}s`,
          }}
        />
      </div>

      {/* Label below orb */}
      <div style={{ marginTop: 8, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: focused ? 14 : 11, fontWeight: 700, color: focused ? pool.color : C.text, transition: 'font-size 0.3s, color 0.3s', whiteSpace: 'nowrap' }}>
          {pool.name}
        </span>
        <span style={{ fontSize: 10, color: C.faint, whiteSpace: 'nowrap' }}>
          {wsCount} workspaces · {pct}% cap
        </span>
      </div>
    </motion.div>
  );
}

// ─── Workspace node (orbiting) ────────────────────────────────────────────────

function WorkspaceNode({
  ws,
  angle,
  orbitRadius,
  isFocused,
  onTooltip,
}: {
  ws: Workspace;
  angle: number;
  orbitRadius: number;
  isFocused: boolean;
  onTooltip: (id: string | null) => void;
}) {
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * orbitRadius;
  const y = Math.sin(rad) * orbitRadius;
  const pool = poolById(ws.poolId);

  return (
    <motion.div
      layout
      layoutId={`ws-node-${ws.id}`}
      style={{
        position: 'absolute',
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        transform: 'translate(-50%, -50%)',
        zIndex: 5,
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: isFocused ? 1 : 0.72, scale: 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26, delay: 0.05 }}
      onHoverStart={() => onTooltip(ws.id)}
      onHoverEnd={() => onTooltip(null)}
    >
      <motion.div
        whileHover={{ scale: 1.2 }}
        whileTap={{ scale: 0.9 }}
        style={{
          width: 34, height: 34, borderRadius: 10,
          background: `linear-gradient(135deg, hsl(${ws.hue} 72% 54%), hsl(${ws.hue + 28} 66% 44%))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: '#fff',
          border: `1.5px solid ${pool.color}66`,
          boxShadow: `0 0 12px ${pool.glowColor}`,
          letterSpacing: '-0.01em',
        }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      >
        {ws.initials}
      </motion.div>
    </motion.div>
  );
}

// ─── Spoke SVG lines (hub → workspaces, draw-in on focus) ────────────────────

function SpokeLines({
  workspaces,
  orbitRadius,
  color,
  canvasSize,
}: {
  workspaces: Workspace[];
  orbitRadius: number;
  color: string;
  canvasSize: number;
}) {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: canvasSize, height: canvasSize, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}
      aria-hidden
    >
      {workspaces.map((ws, i) => {
        const angleStep = 360 / Math.max(workspaces.length, 1);
        const angle = i * angleStep - 90;
        const rad = (angle * Math.PI) / 180;
        const x2 = cx + Math.cos(rad) * orbitRadius;
        const y2 = cy + Math.sin(rad) * orbitRadius;
        return (
          <motion.path
            key={`spoke-${ws.id}`}
            d={`M ${cx} ${cy} L ${x2} ${y2}`}
            stroke={color}
            strokeWidth={1.2}
            strokeOpacity={0.3}
            strokeDasharray="4 5"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.08 + i * 0.04 }}
          />
        );
      })}
    </svg>
  );
}

// ─── Orbital canvas per pool ──────────────────────────────────────────────────

function OrbitalCanvas({
  pool,
  workspaces,
  focused,
  dimmed,
  onHubClick,
  tooltipId,
  onTooltip,
}: {
  pool: Pool;
  workspaces: Workspace[];
  focused: boolean;
  dimmed: boolean;
  onHubClick: () => void;
  tooltipId: string | null;
  onTooltip: (id: string | null) => void;
}) {
  const orbitR = focused ? 90 : 68;
  const canvasSize = focused ? 260 : 200;
  const idx = poolIndex(pool);

  return (
    <div
      style={{
        position: 'relative',
        width: canvasSize,
        height: canvasSize,
        flexShrink: 0,
        transition: 'width 0.45s, height 0.45s',
      }}
    >
      {/* Rotating orbit ring */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%', left: '50%',
          marginLeft: -(orbitR + 1),
          marginTop: -(orbitR + 1),
          width: (orbitR + 1) * 2,
          height: (orbitR + 1) * 2,
          borderRadius: '50%',
          border: `1px dashed ${pool.color}30`,
          animation: `${idx % 2 === 0 ? 'r5-orbit-cw' : 'r5-orbit-ccw'} ${18 + idx * 4}s linear infinite`,
          pointerEvents: 'none',
          transition: 'all 0.45s',
        }}
      />

      {/* Spoke lines (draw in when focused) */}
      {focused && (
        <SpokeLines workspaces={workspaces} orbitRadius={orbitR} color={pool.color} canvasSize={canvasSize} />
      )}

      {/* Hub (centered) */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 5 }}>
        <HubNode pool={pool} focused={focused} dimmed={dimmed} wsCount={workspaces.length} onClick={onHubClick} />
      </div>

      {/* Workspace nodes */}
      {workspaces.map((ws, i) => {
        const angleStep = 360 / Math.max(workspaces.length, 1);
        const angle = i * angleStep - 90;
        const tooltipVisible = tooltipId === ws.id;
        const rad = (angle * Math.PI) / 180;
        const nx = Math.cos(rad) * orbitR;
        const ny = Math.sin(rad) * orbitR;
        return (
          <div key={ws.id}>
            <WorkspaceNode
              ws={ws}
              angle={angle}
              orbitRadius={orbitR}
              isFocused={focused}
              onTooltip={onTooltip}
            />
            <AnimatePresence>
              {tooltipVisible && (
                <motion.div
                  key={`tip-${ws.id}`}
                  variants={tooltipVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  style={{
                    position: 'absolute',
                    left: `calc(50% + ${nx}px)`,
                    top: `calc(50% + ${ny}px - 52px)`,
                    transform: 'translateX(-50%)',
                    zIndex: 100,
                    ...glassBase,
                    borderRadius: 10,
                    padding: '9px 13px',
                    minWidth: 160,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, color: C.text, marginBottom: 4 }}>{ws.name}</div>
                  {[
                    { k: 'Plan', v: ws.plan, c: planColor(ws.plan) },
                    { k: 'Mailboxes', v: String(ws.mailboxes), c: C.text },
                    { k: 'Sends 30d', v: ws.sends30d.toLocaleString(), c: C.text },
                    { k: 'Pool', v: poolById(ws.poolId).name, c: poolById(ws.poolId).color },
                  ].map((r) => (
                    <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                      <span style={{ fontSize: 10, color: C.faint }}>{r.k}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: r.c }}>{r.v}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ─── Reassign row ─────────────────────────────────────────────────────────────

function ReassignRow({
  ws,
  allPools,
  onReassign,
}: {
  ws: Workspace;
  allPools: Pool[];
  onReassign: (wsId: string, newPoolId: PoolId) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentPool = poolById(ws.poolId);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borderSoft}` }}>
        <WsAvatar ws={ws} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ws.name}</div>
          <div style={{ fontSize: 10, color: C.faint }}>{ws.mailboxes} mailboxes · {ws.sends30d.toLocaleString()} sends</div>
        </div>
        <PlanBadge plan={ws.plan} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 9px', borderRadius: 8,
            border: `1px solid ${currentPool.color}55`,
            background: `${currentPool.color}18`,
            color: currentPool.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: currentPool.color, display: 'inline-block' }} />
          {currentPool.name}
          <ChevronDown size={11} strokeWidth={2.4} />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="reassign-dd"
            variants={tooltipVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
              ...glassBase, borderRadius: 12, padding: 6, minWidth: 180,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 8px 6px' }}>
              Move to pool
            </div>
            {allPools
              .filter((p) => p.id !== ws.poolId)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onReassign(ws.id, p.id); setOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 8, border: 'none',
                    background: 'transparent', color: C.text, cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 500,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${p.color}18`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  {p.name}
                  <span style={{ fontSize: 10, color: C.faint, marginLeft: 'auto' }}>
                    {Math.round((p.capacityUsed / p.capacityTotal) * 100)}% cap
                  </span>
                  <ArrowRight size={12} color={C.faint} />
                </button>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  pool,
  workspaces,
  allPools,
  onClose,
  onReassign,
}: {
  pool: Pool;
  workspaces: Workspace[];
  allPools: Pool[];
  onClose: () => void;
  onReassign: (wsId: string, newPoolId: PoolId) => void;
}) {
  const pct = Math.round((pool.capacityUsed / pool.capacityTotal) * 100);
  const animPct = useAnimatedNumber(pct);
  const animPeers = useAnimatedNumber(pool.peers);
  const animWs = useAnimatedNumber(workspaces.length);
  const cc = capColor(pool.capacityUsed, pool.capacityTotal);
  const rc = repColor(pool.avgReputation);

  return (
    <motion.div
      key={`panel-${pool.id}`}
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 340, flexShrink: 0 }}
    >
      {/* Header */}
      <GlassTile style={{ borderColor: `${pool.color}55`, background: `linear-gradient(135deg, ${pool.color}14, rgba(255,255,255,0.04))` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: `${pool.color}22`, border: `1.5px solid ${pool.color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 0 18px ${pool.glowColor}` }}>
              <pool.icon size={22} color={pool.color} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{pool.name}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2, lineHeight: 1.4 }}>{pool.tagline}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.borderSoft}`, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.faint, flexShrink: 0 }}
            aria-label="Close panel"
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {[
            { label: 'Peers', value: String(animPeers), color: pool.color },
            { label: 'Workspaces', value: String(animWs), color: C.text },
            { label: 'Utilization', value: `${animPct}%`, color: cc },
            { label: 'Avg Rep', value: pool.avgReputation.toFixed(2), color: rc },
          ].map((s) => (
            <div
              key={s.label}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.22)', border: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
              <span style={{ fontSize: 9, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Capacity bar */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Capacity</span>
            <span style={{ fontSize: 11, color: cc, fontWeight: 600 }}>{pool.capacityUsed} / {pool.capacityTotal}</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
              style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${cc}, ${cc}aa)` }}
            />
          </div>
        </div>
      </GlassTile>

      {/* Routing precedence note */}
      <GlassTile style={{ padding: '11px 14px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Info size={13} color={C.accentB} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 11, color: C.dim, lineHeight: 1.55 }}>
            <span style={{ fontWeight: 700, color: C.accentB }}>Routing precedence: </span>
            workspace pin → default pool → reputation-weighted random. Workspace pins always override system assignment.
          </p>
        </div>
      </GlassTile>

      {/* Workspace list */}
      <GlassTile style={{ flex: '1 1 auto', padding: '14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Routed workspaces ({workspaces.length})
          </span>
        </div>
        <AnimatePresence mode="popLayout">
          {workspaces.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ padding: '20px 0', textAlign: 'center', color: C.faint, fontSize: 12 }}
            >
              No workspaces pinned to this pool.
            </motion.div>
          ) : (
            <motion.div
              key="list"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {workspaces.map((ws) => (
                <motion.div key={`row-${ws.id}`} layout layoutId={`ws-row-${ws.id}`} variants={itemVariants}>
                  <ReassignRow ws={ws} allPools={allPools} onReassign={onReassign} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassTile>
    </motion.div>
  );
}

// ─── Pool summary card ────────────────────────────────────────────────────────

function PoolSummaryCard({
  pool,
  workspaces,
  onFocus,
}: {
  pool: Pool;
  workspaces: Workspace[];
  onFocus: () => void;
}) {
  const pct = Math.round((pool.capacityUsed / pool.capacityTotal) * 100);
  const rc = repColor(pool.avgReputation);
  const cc = capColor(pool.capacityUsed, pool.capacityTotal);
  const idx = poolIndex(pool);

  return (
    <motion.div
      layout
      whileHover={{ y: -3, boxShadow: `0 12px 40px ${pool.glowColor}` }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      onClick={onFocus}
      style={{
        cursor: 'pointer',
        ...glassBase,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderColor: `${pool.color}40`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div aria-hidden style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, ${pool.glowColor} 0%, transparent 70%)`, pointerEvents: 'none', animation: 'r5-hub-pulse 3.5s ease-in-out infinite', animationDelay: `${idx * 0.7}s` }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: `${pool.color}22`, border: `1.5px solid ${pool.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <pool.icon size={18} color={pool.color} strokeWidth={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{pool.name}</div>
          <div style={{ fontSize: 10, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pool.tagline}</div>
        </div>
        <CapacityRing used={pool.capacityUsed} total={pool.capacityTotal} size={40} strokeW={3.5} color={cc} />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { label: `${pool.peers} peers`, color: pool.color },
          { label: `${workspaces.length} ws`, color: C.text },
          { label: `Rep ${pool.avgReputation.toFixed(2)}`, color: rc },
          { label: `${pct}% cap`, color: cc },
        ].map((s) => (
          <span
            key={s.label}
            style={{ fontSize: 10, fontWeight: 600, color: s.color, background: `${s.color}14`, border: `1px solid ${s.color}30`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}
          >
            {s.label}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Top stat bar ─────────────────────────────────────────────────────────────

function StatBar({ workspaces }: { workspaces: Workspace[] }) {
  const totalMb = useAnimatedNumber(workspaces.reduce((s, w) => s + w.mailboxes, 0));
  const totalSends = useAnimatedNumber(workspaces.reduce((s, w) => s + w.sends30d, 0));
  const totalPeers = useAnimatedNumber(POOLS.reduce((s, p) => s + p.peers, 0));

  return (
    <motion.div variants={itemVariants} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {[
        { label: 'Workspaces', value: workspaces.length.toString(), icon: Users, color: C.text },
        { label: 'Peer pools', value: POOLS.length.toString(), icon: Orbit, color: C.accent },
        { label: 'Total peers', value: totalPeers.toLocaleString(), icon: Cpu, color: C.accentB },
        { label: 'Mailboxes', value: totalMb.toLocaleString(), icon: Mail, color: C.success },
        { label: 'Sends / 30d', value: totalSends.toLocaleString(), icon: Network, color: C.warning },
      ].map((s) => (
        <div key={s.label} style={{ ...glassBase, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 130px', minWidth: 120 }}>
          <s.icon size={16} color={s.color} strokeWidth={1.8} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: 9, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 1 }}>{s.label}</div>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export function AdmPoolR5Orbital() {
  useKeyframes();

  const [workspaces, setWorkspaces] = useState<Workspace[]>(WORKSPACES);
  const [focusedPoolId, setFocusedPoolId] = useState<PoolId | null>(null);
  const [search, setSearch] = useState('');
  const [tooltipWsId, setTooltipWsId] = useState<string | null>(null);

  const focusedPool = focusedPoolId ? poolById(focusedPoolId) : null;

  const wsByPool = (id: PoolId) => workspaces.filter((w) => w.poolId === id);

  const filteredPools = search.trim()
    ? POOLS.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          wsByPool(p.id).some((w) => w.name.toLowerCase().includes(search.toLowerCase())),
      )
    : POOLS;

  const handleReassign = (wsId: string, newPoolId: PoolId) => {
    setWorkspaces((prev) => prev.map((w) => (w.id === wsId ? { ...w, poolId: newPoolId } : w)));
  };

  const handleHubClick = (poolId: PoolId) => {
    setFocusedPoolId((prev) => (prev === poolId ? null : poolId));
    setTooltipWsId(null);
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '24px 24px 48px',
        boxSizing: 'border-box',
        color: C.text,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <motion.div variants={itemVariants} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <Orbit size={16} color={C.accent} strokeWidth={2} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.accent }}>
                Admin · Pool Routing
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
              Orbital Pools
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: C.dim }}>
              Peer pools as gravitational hubs · click a hub to focus and reassign workspaces
            </p>
          </div>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: C.glass, border: `1px solid ${C.border}`, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', minWidth: 220 }}>
            <Search size={13} color={C.faint} strokeWidth={2.2} />
            <input
              type="text"
              placeholder="Search pools or workspaces…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 12, width: '100%' }}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, display: 'flex', padding: 0 }}>
                <X size={12} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </motion.div>
        <StatBar workspaces={workspaces} />
      </motion.div>

      {/* ── Main content ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flex: '1 1 auto' }}>
        {/* Left: orbital canvas + summary cards */}
        <motion.div layout style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Constellation area */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{
              ...glassBase,
              padding: '28px 24px',
              position: 'relative',
              minHeight: 340,
              overflow: 'visible',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: focusedPoolId ? 48 : 32,
            }}
          >
            {/* Dot grid bg */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '24px 24px', pointerEvents: 'none', borderRadius: 16 }} />
            {/* Warm ambient fog */}
            <div aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '80%', height: '80%', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(242,101,34,0.04) 0%, transparent 70%)', pointerEvents: 'none', animation: 'r5-hub-pulse 6s ease-in-out infinite' }} />

            {filteredPools.map((pool) => {
              const poolWs = wsByPool(pool.id);
              const isFocused = focusedPoolId === pool.id;
              const isDimmed = focusedPoolId !== null && focusedPoolId !== pool.id;
              return (
                <motion.div key={pool.id} variants={itemVariants} layout style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <OrbitalCanvas
                    pool={pool}
                    workspaces={poolWs}
                    focused={isFocused}
                    dimmed={isDimmed}
                    onHubClick={() => handleHubClick(pool.id)}
                    tooltipId={tooltipWsId}
                    onTooltip={setTooltipWsId}
                  />
                </motion.div>
              );
            })}

            {filteredPools.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: C.faint, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
                No pools match "{search}"
              </motion.div>
            )}

            {focusedPoolId && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ position: 'absolute', bottom: 10, right: 14, fontSize: 10, color: C.faint, display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <CheckCircle2 size={11} color={C.success} strokeWidth={2.2} />
                Click hub again to unfocus
              </motion.div>
            )}
          </motion.div>

          {/* Pool summary cards (hidden when focused) */}
          <AnimatePresence mode="popLayout">
            {!focusedPoolId && (
              <motion.div
                key="cards"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: 'spring', stiffness: 240, damping: 26 }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}
              >
                {filteredPools.map((pool, i) => (
                  <motion.div key={pool.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 26, delay: i * 0.06 }}>
                    <PoolSummaryCard pool={pool} workspaces={wsByPool(pool.id)} onFocus={() => handleHubClick(pool.id)} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Other pools strip (shown when focused) */}
          <AnimatePresence mode="popLayout">
            {focusedPoolId && (
              <motion.div
                key="other-strip"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ type: 'spring', stiffness: 240, damping: 26 }}
                style={{ ...glassBase, padding: '14px 16px' }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Other pools
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {POOLS.filter((p) => p.id !== focusedPoolId).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleHubClick(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 10, border: `1px solid ${p.color}44`, background: `${p.color}10`, cursor: 'pointer', color: C.text, fontSize: 11, fontWeight: 500 }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                      {p.name}
                      <span style={{ color: C.faint }}>· {wsByPool(p.id).length} ws · {Math.round((p.capacityUsed / p.capacityTotal) * 100)}% cap</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Right: detail panel */}
        <AnimatePresence mode="wait">
          {focusedPool && (
            <DetailPanel
              key={focusedPool.id}
              pool={focusedPool}
              workspaces={wsByPool(focusedPool.id)}
              allPools={POOLS}
              onClose={() => setFocusedPoolId(null)}
              onReassign={handleReassign}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────────── */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', fontSize: 10, color: C.faint, paddingTop: 4 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={11} color={C.success} strokeWidth={2} /> Rep ≥ 0.90</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={11} color={C.warning} strokeWidth={2} /> Rep 0.75 – 0.89</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={11} color={C.danger} strokeWidth={2} /> Rep &lt; 0.75</div>
        <div style={{ color: C.hairline }}>|</div>
        <span>Workspace pin overrides default pool routing · reputation-weighted fallback applies to unassigned workspaces</span>
      </motion.div>
    </div>
  );
}

export default AdmPoolR5Orbital;
