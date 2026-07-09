/**
 * Admin Pool Routing Design Candidate: R8 Motion Board
 *
 * "Motion Board" — a Kanban board of pool lanes where workspace cards
 * glide between lanes using FLIP/layout animation when reassigned.
 * The centerpiece is buttery-smooth spring motion throughout.
 *
 * Animation inventory:
 * - layout + layoutId on workspace cards → FLIP glide between lanes
 * - AnimatePresence for card enter/exit per lane
 * - staggerChildren on lane container variants for entrance
 * - whileHover lift + glow, whileTap press on cards
 * - Spring-filled animated capacity bars (useSpring + animate)
 * - Animated counters (count + avg reputation) that re-spring on reassign
 * - Per-card "move to pool" dropdown menu with AnimatePresence
 * - Staggered lane entrance
 *
 * Self-contained: inline style={{}} only, mock data only,
 * no API / react-query / @/features / @/lib imports.
 * Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. No purple/violet/blue/teal/cyan.
 */

import {
  useCallback,
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
  useSpring,
  animate,
  type Variants,
} from 'framer-motion';
import {
  ChevronDown,
  Filter,
  Info,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  Users,
  Zap,
  X,
  AlertTriangle,
  CheckCircle2,
  Mail,
  Network,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.38)' as const,
  ghost: 'rgba(255,255,255,0.12)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentHi: '#FF8A4B' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.12)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.12)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.12)' as const,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.42)',
  } as CSSProperties,
};

function glassBox(extra?: CSSProperties): CSSProperties {
  return {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
    ...extra,
  };
}

// ─── Mock data ──────────────────────────────────────────────────────────────

type PoolId = 'default' | 'warmup-a' | 'high-rep' | 'cooldown' | 'custom-eu';
type Plan = 'Starter' | 'Growth' | 'Scale' | 'Enterprise';

interface Pool {
  id: PoolId;
  label: string;
  accentColor: string;
  peerCount: number;
  capacityUsed: number;
  capacityTotal: number;
  avgReputation: number;
  description: string;
}

interface Workspace {
  id: string;
  name: string;
  domain: string;
  plan: Plan;
  mailboxes: number;
  sends30d: number;
  reputation: number;
  poolId: PoolId;
  hue: number;
}

const POOLS: Pool[] = [
  {
    id: 'default',
    label: 'Default',
    accentColor: '#F26522',
    peerCount: 18,
    capacityUsed: 820,
    capacityTotal: 1200,
    avgReputation: 0.87,
    description: 'General-purpose pool for new signups',
  },
  {
    id: 'warmup-a',
    label: 'Warm-up A',
    accentColor: '#FF8A4B',
    peerCount: 12,
    capacityUsed: 540,
    capacityTotal: 900,
    avgReputation: 0.91,
    description: 'Mid-tier for active ramp mailboxes',
  },
  {
    id: 'high-rep',
    label: 'High-Rep',
    accentColor: '#3ddc97',
    peerCount: 8,
    capacityUsed: 210,
    capacityTotal: 480,
    avgReputation: 0.96,
    description: 'Premium peers, reserved for Scale/Enterprise',
  },
  {
    id: 'cooldown',
    label: 'Cooldown',
    accentColor: '#FF8A4B',
    peerCount: 6,
    capacityUsed: 180,
    capacityTotal: 360,
    avgReputation: 0.74,
    description: 'Recovery lane — recovering reputation peers',
  },
  {
    id: 'custom-eu',
    label: 'Custom-EU',
    accentColor: '#3ddc97',
    peerCount: 5,
    capacityUsed: 110,
    capacityTotal: 300,
    avgReputation: 0.93,
    description: 'EU-hosted peers for GDPR-sensitive workspaces',
  },
];

const INITIAL_WORKSPACES: Workspace[] = [
  { id: 'ws-01', name: 'Acme Corp',    domain: 'acme.co',         plan: 'Enterprise', mailboxes: 24, sends30d: 14820, reputation: 0.94, poolId: 'high-rep',   hue: 28  },
  { id: 'ws-02', name: 'Northwind',    domain: 'northwind.io',    plan: 'Scale',      mailboxes: 12, sends30d: 8640,  reputation: 0.91, poolId: 'warmup-a',  hue: 42  },
  { id: 'ws-03', name: 'Lumen Labs',   domain: 'lumenlabs.dev',   plan: 'Growth',     mailboxes: 5,  sends30d: 2100,  reputation: 0.83, poolId: 'default',   hue: 15  },
  { id: 'ws-04', name: 'Vendio',       domain: 'vendio.io',       plan: 'Growth',     mailboxes: 7,  sends30d: 3840,  reputation: 0.88, poolId: 'default',   hue: 340 },
  { id: 'ws-05', name: 'Beacon App',   domain: 'beacon.app',      plan: 'Scale',      mailboxes: 18, sends30d: 11200, reputation: 0.96, poolId: 'high-rep',  hue: 20  },
  { id: 'ws-06', name: 'Parable',      domain: 'parable.in',      plan: 'Starter',    mailboxes: 2,  sends30d: 480,   reputation: 0.72, poolId: 'cooldown',  hue: 5   },
  { id: 'ws-07', name: 'Oxen Studio',  domain: 'oxenstudio.com',  plan: 'Growth',     mailboxes: 6,  sends30d: 2900,  reputation: 0.85, poolId: 'default',   hue: 35  },
  { id: 'ws-08', name: 'Hibou',        domain: 'hibou.co',        plan: 'Scale',      mailboxes: 9,  sends30d: 6120,  reputation: 0.90, poolId: 'warmup-a',  hue: 50  },
  { id: 'ws-09', name: 'Parch.io',     domain: 'parch.io',        plan: 'Starter',    mailboxes: 3,  sends30d: 620,   reputation: 0.68, poolId: 'cooldown',  hue: 10  },
  { id: 'ws-10', name: 'Arclamp',      domain: 'arclamp.co',      plan: 'Growth',     mailboxes: 4,  sends30d: 1840,  reputation: 0.79, poolId: 'default',   hue: 25  },
  { id: 'ws-11', name: 'Meridian EU',  domain: 'meridian.eu',     plan: 'Enterprise', mailboxes: 16, sends30d: 9800,  reputation: 0.93, poolId: 'custom-eu', hue: 38  },
  { id: 'ws-12', name: 'Galeria GmbH', domain: 'galeria.de',      plan: 'Scale',      mailboxes: 10, sends30d: 5600,  reputation: 0.92, poolId: 'custom-eu', hue: 32  },
  { id: 'ws-13', name: 'Forza SRL',    domain: 'forza.it',        plan: 'Growth',     mailboxes: 6,  sends30d: 2200,  reputation: 0.85, poolId: 'warmup-a',  hue: 18  },
  { id: 'ws-14', name: 'Dawnbreak',    domain: 'dawnbreak.io',    plan: 'Starter',    mailboxes: 2,  sends30d: 310,   reputation: 0.71, poolId: 'cooldown',  hue: 8   },
];

// ─── Plan chip config ───────────────────────────────────────────────────────

function planStyle(plan: Plan): CSSProperties {
  const map: Record<Plan, { bg: string; color: string; border: string }> = {
    Starter:    { bg: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.60)', border: 'rgba(255,255,255,0.12)' },
    Growth:     { bg: 'rgba(255,138,75,0.15)',  color: '#FF8A4B',               border: 'rgba(255,138,75,0.30)' },
    Scale:      { bg: 'rgba(242,101,34,0.15)',  color: '#F26522',               border: 'rgba(242,101,34,0.30)' },
    Enterprise: { bg: 'rgba(61,220,151,0.13)',  color: '#3ddc97',               border: 'rgba(61,220,151,0.30)' },
  };
  const s = map[plan];
  return {
    display: 'inline-block',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    padding: '2px 7px',
    borderRadius: 999,
    background: s.bg,
    color: s.color,
    border: `1px solid ${s.border}`,
  };
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ ws, size = 30 }: { ws: Workspace; size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `linear-gradient(135deg, hsl(${ws.hue} 80% 55%), hsl(${ws.hue + 25} 72% 44%))`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.33,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
        letterSpacing: '-0.01em',
      }}
    >
      {ws.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ─── Reputation bar ──────────────────────────────────────────────────────────

function RepBar({ value, width = 60 }: { value: number; width?: number }) {
  const tone = value >= 0.9 ? T.success : value >= 0.75 ? T.warning : T.danger;
  return (
    <div
      style={{
        width,
        height: 4,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${value * 100}%`,
          height: '100%',
          borderRadius: 999,
          background: `linear-gradient(90deg, ${tone}, ${tone}bb)`,
          transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)',
        }}
      />
    </div>
  );
}

// ─── Animated spring counter ─────────────────────────────────────────────────
// Uses framer-motion animate() to spring from prev to next value.

function SpringCounter({
  to,
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const mv = useMotionValue(to);
  const spring = useSpring(mv, { stiffness: 180, damping: 22 });
  const [display, setDisplay] = useState(to.toFixed(decimals));
  const prevRef = useRef(to);
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.stop();
    ctrlRef.current = animate(mv, to, {
      type: 'spring',
      stiffness: 180,
      damping: 22,
    });
    return () => {
      ctrlRef.current?.stop();
    };
  }, [to, mv]);

  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      setDisplay(v.toFixed(decimals));
    });
    return unsub;
  }, [spring, decimals]);

  useEffect(() => {
    prevRef.current = to;
  }, [to]);

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{display}{suffix}
    </span>
  );
}

// ─── Animated capacity bar ──────────────────────────────────────────────────

function AnimCapacityBar({
  used,
  total,
  color,
}: {
  used: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const tone = pct >= 90 ? T.danger : pct >= 75 ? T.warning : color;
  const springPct = useSpring(pct, { stiffness: 160, damping: 20 });
  const [displayed, setDisplayed] = useState(pct);

  useEffect(() => {
    springPct.set(pct);
    const unsub = springPct.on('change', (v) => setDisplayed(v));
    return unsub;
  }, [pct, springPct]);

  return (
    <div
      style={{
        height: 5,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <motion.div
        style={{
          height: '100%',
          borderRadius: 999,
          background: `linear-gradient(90deg, ${tone}, ${tone}aa)`,
          width: `${displayed}%`,
        }}
      />
    </div>
  );
}

// ─── Card move dropdown menu ─────────────────────────────────────────────────

const MENU_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: -6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 340, damping: 28 },
  },
  exit: { opacity: 0, scale: 0.92, y: -6, transition: { duration: 0.14 } },
};

function MoveMenu({
  currentPoolId,
  onMove,
  onClose,
}: {
  currentPoolId: PoolId;
  onMove: (id: PoolId) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      variants={MENU_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 4,
        zIndex: 50,
        ...glassBox({ borderRadius: 12 }),
        padding: '6px 0',
        minWidth: 168,
        boxShadow: '0 16px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: T.faint,
          padding: '4px 12px 8px',
          borderBottom: `1px solid ${T.hairline}`,
          marginBottom: 4,
        }}
      >
        Move to pool
      </div>
      {POOLS.map((pool) => {
        const isCurrent = pool.id === currentPoolId;
        return (
          <button
            key={pool.id}
            type="button"
            onClick={() => {
              if (!isCurrent) onMove(pool.id);
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              width: '100%',
              padding: '7px 12px',
              background: isCurrent ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: 'none',
              cursor: isCurrent ? 'default' : 'pointer',
              color: isCurrent ? T.dim : T.text,
              fontSize: 13,
              textAlign: 'left',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
            }}
            onMouseLeave={(e) => {
              if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: pool.accentColor,
                flexShrink: 0,
                boxShadow: isCurrent ? `0 0 6px ${pool.accentColor}80` : 'none',
              }}
            />
            <span style={{ flex: 1 }}>{pool.label}</span>
            {isCurrent && (
              <CheckCircle2 size={12} style={{ color: pool.accentColor }} />
            )}
          </button>
        );
      })}
    </motion.div>
  );
}

// ─── Workspace card ──────────────────────────────────────────────────────────

const CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.88, y: 14 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.88,
    y: -10,
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};

function WorkspaceCard({
  ws,
  poolColor,
  onMove,
}: {
  ws: Workspace;
  poolColor: string;
  onMove: (wsId: string, newPoolId: PoolId) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const handleMove = useCallback(
    (newPoolId: PoolId) => {
      onMove(ws.id, newPoolId);
    },
    [ws.id, onMove],
  );

  const repColor =
    ws.reputation >= 0.9 ? T.success : ws.reputation >= 0.75 ? T.warning : T.danger;

  return (
    <motion.div
      layout
      layoutId={`ws-card-${ws.id}`}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover={{
        y: -3,
        boxShadow: `0 12px 36px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.14)`,
      }}
      whileTap={{ scale: 0.97 }}
      transition={{ layout: { type: 'spring', stiffness: 260, damping: 26 } }}
      style={{
        ...glassBox({ borderRadius: 14 }),
        padding: '12px 14px',
        cursor: 'default',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Card top — avatar + name + plan */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <Avatar ws={ws} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 2,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: T.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 100,
              }}
            >
              {ws.name}
            </span>
            <span style={planStyle(ws.plan)}>{ws.plan}</span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: T.faint,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {ws.domain}
          </div>
        </div>

        {/* Move menu trigger */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <motion.button
            ref={menuBtnRef}
            type="button"
            whileHover={{ background: 'rgba(255,255,255,0.12)' }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 8,
              background: menuOpen ? 'rgba(255,255,255,0.10)' : 'transparent',
              border: menuOpen ? '1px solid rgba(255,255,255,0.16)' : '1px solid transparent',
              cursor: 'pointer',
              color: T.dim,
              padding: 0,
              transition: 'background 0.14s, border-color 0.14s',
            }}
            aria-label={`Move ${ws.name} to a different pool`}
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={14} strokeWidth={2.2} />
          </motion.button>

          <AnimatePresence>
            {menuOpen && (
              <MoveMenu
                currentPoolId={ws.poolId}
                onMove={handleMove}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 4,
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: T.faint, marginBottom: 2 }}>
            Mailboxes
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{ws.mailboxes}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: T.faint, marginBottom: 2 }}>
            Sends/30d
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
            {ws.sends30d >= 1000
              ? `${(ws.sends30d / 1000).toFixed(1)}k`
              : ws.sends30d}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: T.faint, marginBottom: 2 }}>
            Rep
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: repColor }}>
            {ws.reputation.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Reputation bar */}
      <RepBar value={ws.reputation} width={undefined} />

      {/* Pool accent line at bottom */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: 0,
          left: 10,
          right: 10,
          height: 2,
          borderRadius: '0 0 14px 14px',
          background: `linear-gradient(90deg, ${poolColor}60, ${poolColor}20)`,
        }}
      />
    </motion.div>
  );
}

// ─── Lane container variants ─────────────────────────────────────────────────

const LANE_CONTAINER_VARIANTS: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
};

const LANE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 28 },
  },
};

// ─── Lane header ─────────────────────────────────────────────────────────────

function LaneHeader({
  pool,
  count,
  avgRep,
}: {
  pool: Pool;
  count: number;
  avgRep: number;
}) {
  const pct = pool.capacityTotal > 0 ? (pool.capacityUsed / pool.capacityTotal) * 100 : 0;
  const utilTone =
    pct >= 90 ? T.danger : pct >= 75 ? T.warning : pool.accentColor;

  return (
    <div
      style={{
        padding: '12px 14px 10px',
        borderBottom: `1px solid ${T.hairline}`,
        marginBottom: 2,
      }}
    >
      {/* Pool name + count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: pool.accentColor,
            boxShadow: `0 0 8px ${pool.accentColor}70`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.text,
            flex: 1,
            letterSpacing: '-0.01em',
          }}
        >
          {pool.label}
        </span>
        {/* Animated count badge */}
        <motion.span
          layout
          style={{
            minWidth: 22,
            height: 20,
            borderRadius: 999,
            background: `${pool.accentColor}22`,
            border: `1px solid ${pool.accentColor}44`,
            color: pool.accentColor,
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <SpringCounter to={count} decimals={0} />
        </motion.span>
      </div>

      {/* Animated capacity meter */}
      <AnimCapacityBar
        used={pool.capacityUsed}
        total={pool.capacityTotal}
        color={pool.accentColor}
      />

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          gap: 8,
        }}
      >
        <div style={{ fontSize: 10, color: T.faint }}>
          <span style={{ color: utilTone, fontWeight: 700 }}>
            {pool.capacityUsed}
          </span>
          <span>/{pool.capacityTotal} cap</span>
        </div>
        <div style={{ fontSize: 10, color: T.faint }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 3 }}>
            avg rep
          </span>
          <span
            style={{
              fontWeight: 700,
              color:
                avgRep >= 0.9 ? T.success : avgRep >= 0.75 ? T.warning : T.danger,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <SpringCounter to={avgRep} decimals={2} />
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          marginTop: 5,
          fontSize: 10,
          color: T.faint,
        }}
      >
        <Network size={10} strokeWidth={2.2} />
        {pool.peerCount} peers
      </div>
    </div>
  );
}

// ─── Toast notification ───────────────────────────────────────────────────────

interface ToastData {
  id: string;
  wsName: string;
  fromLabel: string;
  toLabel: string;
  toColor: string;
}

const TOAST_VARIANTS: Variants = {
  hidden: { opacity: 0, x: 60, scale: 0.94 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 340, damping: 28 },
  },
  exit: {
    opacity: 0,
    x: 60,
    scale: 0.92,
    transition: { duration: 0.22, ease: 'easeIn' },
  },
};

function Toast({ t }: { t: ToastData }) {
  return (
    <motion.div
      key={t.id}
      variants={TOAST_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        ...glassBox({ borderRadius: 12 }),
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 240,
        maxWidth: 300,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        borderColor: `${t.toColor}50`,
      }}
    >
      <CheckCircle2 size={15} style={{ color: t.toColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>
          {t.wsName} moved
        </div>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>
          {t.fromLabel} → <span style={{ color: t.toColor }}>{t.toLabel}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Header info popover ─────────────────────────────────────────────────────

const POPOVER_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 28 },
  },
  exit: { opacity: 0, scale: 0.94, y: 6, transition: { duration: 0.14 } },
};

function PrecedencePopover({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  const steps: Array<{ icon: ReactNode; label: string; desc: string }> = [
    {
      icon: <Shield size={12} style={{ color: T.accent }} />,
      label: '1. Workspace pin',
      desc: 'Explicit assignment in this board overrides everything',
    },
    {
      icon: <Network size={12} style={{ color: T.warning }} />,
      label: '2. Default pool',
      desc: 'Fallback when no explicit pool is assigned',
    },
    {
      icon: <Zap size={12} style={{ color: T.success }} />,
      label: '3. Reputation-weighted',
      desc: 'Random pick from active peers, weighted by reputation score',
    },
  ];

  return (
    <motion.div
      ref={ref}
      variants={POPOVER_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 6,
        zIndex: 100,
        ...glassBox({ borderRadius: 14 }),
        padding: '14px 16px',
        width: 300,
        boxShadow: '0 20px 48px rgba(0,0,0,0.55)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: T.accent,
          }}
        >
          Routing precedence
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: T.faint,
            padding: 2,
            display: 'flex',
          }}
        >
          <X size={13} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s) => (
          <div key={s.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ marginTop: 1 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{s.label}</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AdmPoolR8Board() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(INITIAL_WORKSPACES);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<Plan | 'all'>('all');
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [showPrecedence, setShowPrecedence] = useState(false);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup toast timers on unmount
  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleMove = useCallback(
    (wsId: string, newPoolId: PoolId) => {
      const ws = workspaces.find((w) => w.id === wsId);
      if (!ws || ws.poolId === newPoolId) return;

      const fromPool = POOLS.find((p) => p.id === ws.poolId);
      const toPool = POOLS.find((p) => p.id === newPoolId);
      if (!fromPool || !toPool) return;

      setWorkspaces((prev) =>
        prev.map((w) => (w.id === wsId ? { ...w, poolId: newPoolId } : w)),
      );

      // Show toast
      const toastId = `toast-${wsId}-${Date.now()}`;
      setToasts((prev) => [
        ...prev,
        {
          id: toastId,
          wsName: ws.name,
          fromLabel: fromPool.label,
          toLabel: toPool.label,
          toColor: toPool.accentColor,
        },
      ]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
        toastTimersRef.current.delete(toastId);
      }, 3200);
      toastTimersRef.current.set(toastId, timer);
    },
    [workspaces],
  );

  // Derived: filter workspaces for display
  const filtered = workspaces.filter((ws) => {
    const matchSearch =
      search.trim() === '' ||
      ws.name.toLowerCase().includes(search.toLowerCase()) ||
      ws.domain.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === 'all' || ws.plan === planFilter;
    return matchSearch && matchPlan;
  });

  // Per-lane computed data
  function laneWorkspaces(poolId: PoolId) {
    return filtered.filter((w) => w.poolId === poolId);
  }

  function laneAvgRep(poolId: PoolId): number {
    const ws = workspaces.filter((w) => w.poolId === poolId);
    if (ws.length === 0) return 0;
    return ws.reduce((s, w) => s + w.reputation, 0) / ws.length;
  }

  // Summary totals
  const totalWorkspaces = workspaces.length;
  const totalPools = POOLS.length;
  const totalPeers = POOLS.reduce((s, p) => s + p.peerCount, 0);
  const overallAvgRep =
    workspaces.reduce((s, w) => s + w.reputation, 0) / (workspaces.length || 1);

  const plans: Plan[] = ['Starter', 'Growth', 'Scale', 'Enterprise'];

  return (
    <div
      style={{
        width: '100%',
        color: T.text,
        fontFamily: 'inherit',
        position: 'relative',
        paddingBottom: 40,
      }}
    >
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        {/* Eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Network size={13} strokeWidth={2.4} style={{ color: T.accent }} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: T.accent,
            }}
          >
            Admin · Pool Routing · Motion Board
          </span>
        </div>

        {/* Title + summary */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '-0.025em',
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              Peer Pool Routing
            </h1>
            <p style={{ fontSize: 13, color: T.dim, marginTop: 5, maxWidth: 500 }}>
              Assign each workspace to a peer pool. Cards glide between lanes on reassign.
            </p>
          </div>

          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { icon: <Users size={12} />, label: 'Workspaces', value: totalWorkspaces },
              { icon: <Network size={12} />, label: 'Pools', value: totalPools },
              { icon: <Mail size={12} />, label: 'Peers', value: totalPeers },
              {
                icon: <Zap size={12} />,
                label: 'Avg Rep',
                value: overallAvgRep.toFixed(2),
                tone:
                  overallAvgRep >= 0.9 ? T.success : overallAvgRep >= 0.75 ? T.warning : T.danger,
              },
            ].map((chip) => (
              <div
                key={chip.label}
                style={{
                  ...glassBox({ borderRadius: 10 }),
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                }}
              >
                <span style={{ color: T.faint }}>{chip.icon}</span>
                <span style={{ color: T.faint }}>{chip.label}</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: 'tone' in chip && chip.tone ? chip.tone : T.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {chip.value}
                </span>
              </div>
            ))}

            {/* Precedence info */}
            <div style={{ position: 'relative' }}>
              <motion.button
                type="button"
                whileHover={{ background: 'rgba(255,255,255,0.10)' }}
                whileTap={{ scale: 0.93 }}
                onClick={() => setShowPrecedence((v) => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  ...glassBox({ borderRadius: 10 }),
                  padding: '6px 11px',
                  fontSize: 12,
                  color: T.dim,
                  cursor: 'pointer',
                  border: showPrecedence
                    ? `1px solid ${T.accent}60`
                    : '1px solid rgba(255,255,255,0.10)',
                  transition: 'border-color 0.2s',
                }}
                aria-label="Show routing precedence rules"
              >
                <Info size={12} />
                Routing rules
                <ChevronDown
                  size={11}
                  style={{
                    transform: showPrecedence ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s',
                  }}
                />
              </motion.button>
              <AnimatePresence>
                {showPrecedence && (
                  <PrecedencePopover onClose={() => setShowPrecedence(false)} />
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            ...glassBox({ borderRadius: 10 }),
            padding: '7px 12px',
            flex: '1 1 200px',
            maxWidth: 260,
          }}
        >
          <Search size={13} style={{ color: T.faint, flexShrink: 0 }} strokeWidth={2.2} />
          <input
            type="text"
            placeholder="Search workspaces…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: T.text,
              fontSize: 13,
              flex: 1,
              minWidth: 0,
            }}
          />
          <AnimatePresence>
            {search.trim() !== '' && (
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                type="button"
                onClick={() => setSearch('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: T.faint,
                  padding: 0,
                  display: 'flex',
                  flexShrink: 0,
                }}
              >
                <X size={12} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Plan filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Filter size={12} style={{ color: T.faint }} strokeWidth={2.2} />
          {(['all', ...plans] as Array<Plan | 'all'>).map((p) => {
            const active = planFilter === p;
            return (
              <motion.button
                key={p}
                type="button"
                whileHover={{ background: active ? undefined : 'rgba(255,255,255,0.08)' }}
                whileTap={{ scale: 0.94 }}
                onClick={() => setPlanFilter(p)}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: active
                    ? `1px solid ${T.accent}60`
                    : '1px solid rgba(255,255,255,0.10)',
                  background: active
                    ? 'rgba(242,101,34,0.15)'
                    : 'rgba(255,255,255,0.04)',
                  color: active ? T.accent : T.dim,
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
              >
                {p === 'all' ? 'All' : p}
              </motion.button>
            );
          })}
        </div>

        {/* New pool button */}
        <motion.button
          type="button"
          whileHover={{ background: 'rgba(242,101,34,0.22)' }}
          whileTap={{ scale: 0.94 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 10,
            background: 'rgba(242,101,34,0.14)',
            border: `1px solid ${T.accent}50`,
            color: T.accent,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            marginLeft: 'auto',
            transition: 'background 0.15s',
          }}
        >
          <Plus size={13} strokeWidth={2.4} />
          New pool
        </motion.button>
      </div>

      {/* ── Kanban board ─────────────────────────────────────────────────── */}
      {/* Horizontal scroll wrapper */}
      <div
        style={{
          overflowX: 'auto',
          paddingBottom: 12,
          marginLeft: -4,
          paddingLeft: 4,
        }}
      >
        <motion.div
          variants={LANE_CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${POOLS.length}, minmax(220px, 1fr))`,
            gap: 12,
            minWidth: POOLS.length * 232,
          }}
        >
          {POOLS.map((pool) => {
            const cards = laneWorkspaces(pool.id);
            const avgRep = laneAvgRep(pool.id);

            return (
              <motion.div
                key={pool.id}
                variants={LANE_VARIANTS}
                style={{
                  ...glassBox({ borderRadius: 18 }),
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 420,
                  border: `1px solid rgba(255,255,255,0.09)`,
                  overflow: 'hidden',
                }}
              >
                {/* Lane header */}
                <LaneHeader
                  pool={pool}
                  count={cards.length}
                  avgRep={avgRep}
                />

                {/* Cards area */}
                <motion.div
                  layout
                  style={{
                    flex: 1,
                    padding: '10px 10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    overflowY: 'auto',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(255,255,255,0.12) transparent',
                  }}
                >
                  <AnimatePresence initial={false}>
                    {cards.length === 0 ? (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                          textAlign: 'center',
                          padding: '32px 16px',
                          color: T.faint,
                          fontSize: 12,
                          border: `1px dashed rgba(255,255,255,0.10)`,
                          borderRadius: 12,
                          marginTop: 4,
                        }}
                      >
                        <AlertTriangle
                          size={18}
                          style={{ marginBottom: 6, opacity: 0.4 }}
                          strokeWidth={1.8}
                        />
                        <div>No workspaces</div>
                        <div style={{ marginTop: 4, fontSize: 11 }}>
                          Move a workspace here
                        </div>
                      </motion.div>
                    ) : (
                      cards.map((ws) => (
                        <WorkspaceCard
                          key={ws.id}
                          ws={ws}
                          poolColor={pool.accentColor}
                          onMove={handleMove}
                        />
                      ))
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 18,
          fontSize: 11.5,
          color: T.faint,
        }}
      >
        <Shield size={12} style={{ color: T.accent }} />
        Workspace pin takes precedence → Default pool → Reputation-weighted random ·
        <span style={{ color: T.dim }}>
          {totalWorkspaces} workspaces across {totalPools} pools · {totalPeers} active peers
        </span>
      </div>

      {/* ── Toast stack ──────────────────────────────────────────────────── */}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 200,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <Toast key={t.id} t={t} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default AdmPoolR8Board;
