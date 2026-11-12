/**
 * Admin Pool Routing Design Candidate: R7 Capacity Vessels
 *
 * "Capacity Vessels" — each peer pool is a liquid-filled tank. The fill level
 * springs to capacity-used. Reassigning a workspace chip raises the target
 * level and lowers the source level. Animated sine-wave liquid surface,
 * rising bubbles, FLIP chip transfers, spring counters.
 *
 * Self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}} only. Mock data only.
 * Aurora Glass palette. Accent orange #F26522→#FF8A4B.
 * NO purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
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
  CheckCircle2,
  ChevronDown,
  Info,
  Layers,
  MoreHorizontal,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';

// ─── Palette ──────────────────────────────────────────────────────────────────
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

// ─── Liquid colour by utilisation ─────────────────────────────────────────────
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

// ─── Mock data ────────────────────────────────────────────────────────────────
type PoolId = 'default' | 'warmup-a' | 'high-rep' | 'cooldown' | 'custom-eu';

interface Pool {
  id: PoolId;
  label: string;
  peers: number;
  capacityTotal: number;   // sends/day total
  avgReputation: number;
}

interface Workspace {
  id: string;
  name: string;
  plan: 'Starter' | 'Growth' | 'Scale';
  mailboxes: number;
  sends30d: number;
  pool: PoolId;
  hue: number;             // avatar colour hue
}

const POOLS: Pool[] = [
  { id: 'default',   label: 'Default',    peers: 18, capacityTotal: 18000, avgReputation: 0.89 },
  { id: 'warmup-a',  label: 'Warm-up A',  peers: 12, capacityTotal: 12000, avgReputation: 0.82 },
  { id: 'high-rep',  label: 'High-Rep',   peers:  8, capacityTotal:  8000, avgReputation: 0.97 },
  { id: 'cooldown',  label: 'Cooldown',   peers:  6, capacityTotal:  6000, avgReputation: 0.74 },
  { id: 'custom-eu', label: 'Custom-EU',  peers: 10, capacityTotal: 10000, avgReputation: 0.93 },
];

const INITIAL_WORKSPACES: Workspace[] = [
  { id: 'ws-01', name: 'Acme Corp',    plan: 'Scale',   mailboxes: 12, sends30d: 14200, pool: 'high-rep',  hue:  22 },
  { id: 'ws-02', name: 'Northwind',    plan: 'Growth',  mailboxes:  6, sends30d:  5800, pool: 'default',   hue: 340 },
  { id: 'ws-03', name: 'Lumen Labs',   plan: 'Starter', mailboxes:  2, sends30d:   840, pool: 'warmup-a',  hue: 195 },
  { id: 'ws-04', name: 'Vendio',       plan: 'Growth',  mailboxes:  5, sends30d:  6210, pool: 'default',   hue:  38 },
  { id: 'ws-05', name: 'Beacon',       plan: 'Scale',   mailboxes: 14, sends30d: 19400, pool: 'high-rep',  hue: 145 },
  { id: 'ws-06', name: 'Parable',      plan: 'Starter', mailboxes:  1, sends30d:   320, pool: 'cooldown',  hue: 275 },
  { id: 'ws-07', name: 'Arclamp',      plan: 'Starter', mailboxes:  2, sends30d:   610, pool: 'warmup-a',  hue:   8 },
  { id: 'ws-08', name: 'Oxen Studio',  plan: 'Growth',  mailboxes:  7, sends30d:  4980, pool: 'default',   hue: 165 },
  { id: 'ws-09', name: 'Hibou',        plan: 'Scale',   mailboxes: 10, sends30d: 11200, pool: 'custom-eu', hue: 215 },
  { id: 'ws-10', name: 'Parch',        plan: 'Starter', mailboxes:  2, sends30d:   490, pool: 'cooldown',  hue:  88 },
  { id: 'ws-11', name: 'Solaris',      plan: 'Growth',  mailboxes:  4, sends30d:  3700, pool: 'custom-eu', hue:  55 },
  { id: 'ws-12', name: 'Tessera',      plan: 'Scale',   mailboxes:  8, sends30d:  9100, pool: 'custom-eu', hue: 295 },
  { id: 'ws-13', name: 'Folio AI',     plan: 'Growth',  mailboxes:  5, sends30d:  4200, pool: 'warmup-a',  hue: 120 },
  { id: 'ws-14', name: 'Driftwood',    plan: 'Starter', mailboxes:  1, sends30d:   280, pool: 'cooldown',  hue:  32 },
];

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
function Bubble({
  x,
  delay,
  fillPct,
  liquidTop,
}: {
  x: number;
  delay: number;
  fillPct: number;
  liquidTop: number;
}) {
  // bubbles only visible when there's liquid
  if (fillPct < 0.05) return null;
  const size = 3 + Math.random() * 4;  // captured in closure — static per render
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
        duration: 1.8 + Math.random() * 1.5,
        delay,
        repeat: Infinity,
        repeatDelay: 0.5 + Math.random() * 2,
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

  // Build wave path string reactively
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
  pool: Pool;
  workspaces: Workspace[];
  allPools: Pool[];
  isSelected: boolean;
  onSelect: () => void;
  onReassign: (wsId: string, targetPool: PoolId) => void;
  index: number;
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

function Vessel({ pool, workspaces, allPools, isSelected, onSelect, onReassign, index }: VesselProps) {
  const pws = workspaces.filter((w) => w.pool === pool.id);
  const used = pws.reduce((s, w) => s + w.sends30d, 0);
  const pct = Math.min(1, used / (pool.capacityTotal || 1));

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
    (wsId: string, targetPool: PoolId) => {
      onReassign(wsId, targetPool);
      setMenuWsId(null);
    },
    [onReassign],
  );

  // Static bubble positions (stable across renders)
  const bubblePositions = useRef<Array<{ x: number; delay: number }>>(
    Array.from({ length: 5 }, (_, i) => ({
      x: 10 + i * 18 + Math.random() * 8,
      delay: i * 0.38,
    })),
  ).current;

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
      {/* Glass card */}
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
            <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{pool.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            {/* Wave surface */}
            <WaveSurface width={vesselW - 28} col={liqColor} />
            {/* Bubbles */}
            {bubblePositions.map((b, i) => (
              <Bubble
                key={i}
                x={b.x}
                delay={b.delay}
                fillPct={pct}
                liquidTop={vesselH * 0.8}
              />
            ))}
          </motion.div>

          {/* % label centred */}
          <motion.div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <motion.span
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
            </motion.span>
          </motion.div>

          {/* Capacity grid lines */}
          {[0.25, 0.5, 0.75].map((mark) => (
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
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 0,
            margin: '10px 14px 12px',
            borderRadius: 10,
            overflow: 'hidden',
            border: `1px solid ${C.borderSoft}`,
          }}
        >
          {[
            { label: 'Peers', value: pool.peers, dec: 0 },
            { label: 'Reputation', value: pool.avgReputation, dec: 2 },
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
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: C.text,
                }}
              >
                <AnimatedNumber value={s.value} decimals={s.dec} />
              </div>
              <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Capacity used / total */}
        <div
          style={{
            padding: '0 14px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 11, color: C.faint }}>
            <AnimatedNumber value={used} /> / {pool.capacityTotal.toLocaleString()} sends/day
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
              pws.map((ws) => (
                <WorkspaceChip
                  key={ws.id}
                  ws={ws}
                  allPools={allPools}
                  currentPool={pool.id}
                  menuOpen={menuWsId === ws.id}
                  onMenuToggle={(e) => handleChipMenu(e, ws.id)}
                  onMenuClose={() => setMenuWsId(null)}
                  onReassign={(targetPool) => handleReassign(ws.id, targetPool)}
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
interface ChipProps {
  ws: Workspace;
  allPools: Pool[];
  currentPool: PoolId;
  menuOpen: boolean;
  onMenuToggle: (e: React.MouseEvent) => void;
  onMenuClose: () => void;
  onReassign: (target: PoolId) => void;
}

const planColor: Record<string, string> = {
  Starter: C.faint,
  Growth:  C.accentB,
  Scale:   C.success,
};

function WorkspaceChip({ ws, allPools, currentPool, menuOpen, onMenuToggle, onMenuClose, onReassign }: ChipProps) {
  const chipRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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
      layoutId={`chip-${ws.id}`}
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
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={onMenuToggle}
      >
        {/* Avatar bubble */}
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: `linear-gradient(135deg, hsl(${ws.hue} 70% 58%), hsl(${ws.hue + 30} 65% 48%))`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 7,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {ws.name.slice(0, 2).toUpperCase()}
        </div>
        <span style={{ fontSize: 11, color: C.text, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {ws.name}
        </span>
        <span
          style={{
            fontSize: 9,
            color: planColor[ws.plan] ?? C.faint,
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {ws.plan.toUpperCase()}
        </span>
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
              Move to pool
            </div>
            {allPools.map((p) => (
              <motion.button
                key={p.id}
                whileHover={{ background: 'rgba(255,255,255,0.07)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (p.id !== currentPool) onReassign(p.id);
                }}
                disabled={p.id === currentPool}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: p.id === currentPool ? 'default' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: p.id === currentPool ? C.ghost : C.success,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: p.id === currentPool ? C.ghost : C.text,
                    fontWeight: 500,
                  }}
                >
                  {p.label}
                </span>
                {p.id === currentPool && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: C.faint }}>current</span>
                )}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
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
  onReassign: (wsId: string, targetPool: PoolId) => void;
}) {
  const pws = workspaces.filter((w) => w.pool === pool.id);
  const used = pws.reduce((s, w) => s + w.sends30d, 0);
  const pct = Math.min(1, used / (pool.capacityTotal || 1));
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
              {pool.label}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>
            {pool.peers} peers · avg rep {pool.avgReputation.toFixed(2)}
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
          <span>Capacity utilisation</span>
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
          <span><AnimatedNumber value={used} /> used</span>
          <span>{pool.capacityTotal.toLocaleString()} total</span>
        </div>
      </div>

      {/* Workspace list */}
      <div
        style={{
          padding: '0 16px 14px',
          overflowY: 'auto',
          flex: 1,
        }}
      >
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
          {pws.map((ws) => (
            <DetailWorkspaceRow
              key={ws.id}
              ws={ws}
              allPools={allPools}
              currentPool={pool.id}
              onReassign={(targetPool) => onReassign(ws.id, targetPool)}
            />
          ))}
        </AnimatePresence>
        {pws.length === 0 && (
          <div style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>
            No workspaces assigned to this pool.
          </div>
        )}
      </div>
    </motion.div>
  );
}

function DetailWorkspaceRow({
  ws,
  allPools,
  currentPool,
  onReassign,
}: {
  ws: Workspace;
  allPools: Pool[];
  currentPool: PoolId;
  onReassign: (target: PoolId) => void;
}) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

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
      layoutId={`detail-row-${ws.id}`}
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
          cursor: 'pointer',
        }}
        onClick={() => setOpen((p) => !p)}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: `linear-gradient(135deg, hsl(${ws.hue} 70% 58%), hsl(${ws.hue + 30} 65% 48%))`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {ws.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ws.name}
          </div>
          <div style={{ fontSize: 10, color: C.faint }}>
            {ws.mailboxes} mbx · {ws.sends30d.toLocaleString()} sends/30d
          </div>
        </div>
        <span
          style={{
            fontSize: 9,
            color: planColor[ws.plan] ?? C.faint,
            fontWeight: 600,
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          {ws.plan.toUpperCase()}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={12} color={C.faint} strokeWidth={2.2} />
        </motion.div>
      </motion.div>

      {/* Move-to submenu */}
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
            <div style={{ padding: '6px 10px 4px', fontSize: 9, color: C.faint, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Move to pool
            </div>
            {allPools.map((p) => (
              <motion.button
                key={p.id}
                whileHover={{ background: 'rgba(255,255,255,0.07)' }}
                disabled={p.id === currentPool}
                onClick={(e) => {
                  e.stopPropagation();
                  if (p.id !== currentPool) {
                    onReassign(p.id);
                    setOpen(false);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 10px',
                  background: 'transparent',
                  border: 'none',
                  cursor: p.id === currentPool ? 'default' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: p.id === currentPool ? C.ghost : C.accentB,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: p.id === currentPool ? C.ghost : C.dim }}>
                  {p.label}
                </span>
                {p.id === currentPool && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: C.faint }}>current</span>
                )}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────
function SummaryBar({ workspaces, pools }: { workspaces: Workspace[]; pools: Pool[] }) {
  const totalCap = pools.reduce((s, p) => s + p.capacityTotal, 0);
  const totalUsed = workspaces.reduce((s, w) => s + w.sends30d, 0);
  const avgUtil = pools.reduce((s, p) => {
    const used = workspaces.filter((w) => w.pool === p.id).reduce((a, w) => a + w.sends30d, 0);
    return s + used / (p.capacityTotal || 1);
  }, 0) / pools.length;
  const overloaded = pools.filter((p) => {
    const used = workspaces.filter((w) => w.pool === p.id).reduce((a, w) => a + w.sends30d, 0);
    return used / (p.capacityTotal || 1) >= 0.85;
  }).length;

  const stats = [
    { icon: Server, label: 'Total capacity', value: totalCap, suffix: '/day', dec: 0 },
    { icon: Layers, label: 'Total assigned', value: totalUsed, suffix: '/day', dec: 0 },
    { icon: Zap,    label: 'Avg utilisation', value: avgUtil * 100, suffix: '%', dec: 1 },
    { icon: AlertTriangle, label: 'Overloaded pools', value: overloaded, suffix: '', dec: 0, danger: overloaded > 0 },
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

// ─── Routing precedence notice ────────────────────────────────────────────────
function PrecedenceNotice() {
  return (
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
        workspace pin → default pool → reputation-weighted random.
        Assignments here set the workspace pin.
      </span>
    </motion.div>
  );
}

// ─── Toast notification ────────────────────────────────────────────────────────
interface ToastMsg {
  id: number;
  text: string;
}

function Toast({ msg }: { msg: ToastMsg }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      style={{
        background: 'rgba(30,28,35,0.96)',
        border: `1px solid ${C.success}55`,
        borderRadius: 12,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 260,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <CheckCircle2 size={15} color={C.success} strokeWidth={2.2} />
      <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{msg.text}</span>
    </motion.div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function AdmPoolR7Vessels() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(INITIAL_WORKSPACES);
  const [selectedPool, setSelectedPool] = useState<PoolId | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastIdRef = useRef(0);

  const pushToast = useCallback((text: string) => {
    const id = ++toastIdRef.current;
    setToasts((p) => [...p, { id, text }]);
    const timer = setTimeout(() => {
      setToasts((p) => p.filter((t) => t.id !== id));
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleReassign = useCallback(
    (wsId: string, targetPool: PoolId) => {
      setWorkspaces((prev) => {
        const ws = prev.find((w) => w.id === wsId);
        if (!ws || ws.pool === targetPool) return prev;
        return prev.map((w) => (w.id === wsId ? { ...w, pool: targetPool } : w));
      });
      const ws = workspaces.find((w) => w.id === wsId);
      const tPool = POOLS.find((p) => p.id === targetPool);
      if (ws && tPool) {
        pushToast(`${ws.name} moved to ${tPool.label}`);
      }
    },
    [workspaces, pushToast],
  );

  const selectedPoolObj = POOLS.find((p) => p.id === selectedPool) ?? null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'transparent',
        padding: '24px 24px 40px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
            Admin · Pool Routing
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
            Each pool is a liquid tank — fill level = capacity used. Reassign workspaces to balance load.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
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
          <motion.button
            whileHover={{ scale: 1.04, background: '#e5541a' }}
            whileTap={{ scale: 0.95 }}
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
            <ShieldCheck size={13} strokeWidth={2.2} />
            Auto-balance
          </motion.button>
        </div>
      </motion.div>

      {/* Summary stats */}
      <SummaryBar workspaces={workspaces} pools={POOLS} />

      {/* Precedence note */}
      <PrecedenceNotice />

      {/* Main content: vessels + optional detail panel */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
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
          {POOLS.map((pool, i) => (
            <Vessel
              key={pool.id}
              pool={pool}
              workspaces={workspaces}
              allPools={POOLS}
              isSelected={selectedPool === pool.id}
              onSelect={() =>
                setSelectedPool((prev) => (prev === pool.id ? null : pool.id))
              }
              onReassign={handleReassign}
              index={i}
            />
          ))}
        </motion.div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedPoolObj && (
            <DetailPanel
              key={selectedPoolObj.id}
              pool={selectedPoolObj}
              workspaces={workspaces}
              allPools={POOLS}
              onClose={() => setSelectedPool(null)}
              onReassign={handleReassign}
            />
          )}
        </AnimatePresence>
      </div>

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
          { color: C.danger,  label: 'Overloaded (≥ 85%)' },
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
          Click a vessel to inspect · Click a chip menu to reassign
        </div>
      </motion.div>

      {/* Toast stack */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <Toast key={t.id} msg={t} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
