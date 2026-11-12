/**
 * Admin Pool Routing Design Candidate: R6 Flow Streams
 *
 * "Flow Streams" — an animated three-column flow: workspaces (left) →
 * peer pools (center) → email providers (right). Continuously flowing
 * particle dots travel along bezier ribbons; thickness ∝ volume.
 * Click a pool node → spring-animated detail panel with reassign control
 * that reflows ribbons + redistributes particles live.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features / @/lib imports.
 * All styling via inline style={{}} + framer-motion props. Mock data only.
 * Aurora Glass palette: glass rgba(255,255,255,0.05) + blur(10px).
 * Accent orange #F26522→#FF8A4B. Success #3ddc97. Danger #ff5c7a.
 * Warning #FF8A4B. NO purple/violet/blue/teal/cyan/indigo/pink.
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
  animate,
  type Variants,
} from 'framer-motion';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Globe,
  Layers,
  Mail,
  Network,
  RefreshCw,
  Server,
  Shield,
  Shuffle,
  Users,
  X,
  Zap,
} from 'lucide-react';

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  text:         '#ffffff',
  dim:          'rgba(255,255,255,0.62)',
  faint:        'rgba(255,255,255,0.42)',
  hairline:     'rgba(255,255,255,0.08)',
  accent:       '#F26522',
  accentB:      '#FF8A4B',
  success:      '#3ddc97',
  successDim:   'rgba(61,220,151,0.15)',
  glass:        'rgba(255,255,255,0.05)',
  glass2:       'rgba(255,255,255,0.09)',
  border:       'rgba(255,255,255,0.10)',
  borderSoft:   'rgba(255,255,255,0.06)',
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
  backdropFilter:       'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius:         12,
};

// ─── Mock Data ────────────────────────────────────────────────────────────────

type PoolId = 'default' | 'warmup-a' | 'high-rep' | 'cooldown' | 'custom-eu';
type ProviderId = 'google' | 'o365' | 'yahoo';
type Tier = 'Starter' | 'Growth' | 'Scale';

interface WorkspaceRow {
  id: string;
  name: string;
  email: string;
  tier: Tier;
  poolId: PoolId;
  sends30d: number;
  hue: number; // warm hues only: 10–60
}

interface PoolDef {
  id: PoolId;
  label: string;
  peers: number;
  capacity: number;
  reputation: number;  // 0–1
  color: string;       // warm/status accent
  providers: ProviderId[];
}

interface ProviderDef {
  id: ProviderId;
  label: string;
  shortLabel: string;
  peers: number;
  deliverability: number; // 0–1
  color: string;
}

const POOLS: PoolDef[] = [
  {
    id: 'default',    label: 'Default',    peers: 48, capacity: 4800,
    reputation: 0.91, color: '#3ddc97',
    providers: ['google', 'o365', 'yahoo'],
  },
  {
    id: 'warmup-a',   label: 'Warm-up A',  peers: 24, capacity: 2400,
    reputation: 0.88, color: '#F26522',
    providers: ['google', 'o365'],
  },
  {
    id: 'high-rep',   label: 'High-Rep',   peers: 18, capacity: 1800,
    reputation: 0.97, color: '#FF8A4B',
    providers: ['google'],
  },
  {
    id: 'cooldown',   label: 'Cooldown',   peers: 12, capacity: 1200,
    reputation: 0.74, color: '#fbbf24',
    providers: ['o365', 'yahoo'],
  },
  {
    id: 'custom-eu',  label: 'Custom EU',  peers: 9,  capacity: 900,
    reputation: 0.83, color: '#f59e0b',
    providers: ['google', 'o365'],
  },
];

const PROVIDERS: ProviderDef[] = [
  { id: 'google', label: 'Google Workspace', shortLabel: 'Google WS', peers: 62, deliverability: 0.96, color: '#F26522' },
  { id: 'o365',   label: 'Microsoft 365',    shortLabel: 'O365',      peers: 38, deliverability: 0.93, color: '#FF8A4B' },
  { id: 'yahoo',  label: 'Yahoo Mail',       shortLabel: 'Yahoo',     peers: 11, deliverability: 0.88, color: '#fbbf24' },
];

const TIERS: Record<Tier, string> = {
  Starter: '#3ddc97',
  Growth:  '#FF8A4B',
  Scale:   '#F26522',
};

const INITIAL_WORKSPACES: WorkspaceRow[] = [
  { id: 'ws1',  name: 'Acme Corp',      email: 'alex@acme.co',         tier: 'Scale',   poolId: 'high-rep',  sends30d: 18420, hue: 20 },
  { id: 'ws2',  name: 'Northwind',      email: 'priya@northwind.io',   tier: 'Growth',  poolId: 'default',   sends30d: 5240,  hue: 35 },
  { id: 'ws3',  name: 'Lumen Labs',     email: 'marcus@lumenlabs.dev', tier: 'Starter', poolId: 'warmup-a',  sends30d: 980,   hue: 45 },
  { id: 'ws4',  name: 'Vendio',         email: 'sofia@vendio.io',      tier: 'Growth',  poolId: 'default',   sends30d: 6810,  hue: 28 },
  { id: 'ws5',  name: 'Beacon',         email: 'tk@beacon.app',        tier: 'Scale',   poolId: 'high-rep',  sends30d: 24110, hue: 15 },
  { id: 'ws6',  name: 'Parable',        email: 'dev@parable.in',       tier: 'Starter', poolId: 'cooldown',  sends30d: 240,   hue: 50 },
  { id: 'ws7',  name: 'Oxen Studio',    email: 'el@oxenstudio.com',    tier: 'Growth',  poolId: 'default',   sends30d: 4120,  hue: 38 },
  { id: 'ws8',  name: 'Hibou',          email: 'mei@hibou.co',         tier: 'Scale',   poolId: 'warmup-a',  sends30d: 9840,  hue: 22 },
  { id: 'ws9',  name: 'Arclamp',        email: 'jin@arclamp.co',       tier: 'Starter', poolId: 'custom-eu', sends30d: 410,   hue: 42 },
  { id: 'ws10', name: 'Parch.io',       email: 'ras@parch.io',         tier: 'Starter', poolId: 'cooldown',  sends30d: 510,   hue: 55 },
];

// ─── Container / stagger variants ────────────────────────────────────────────

const colVariants: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};

const nodeVariants: Variants = {
  hidden:  { opacity: 0, y: 18, scale: 0.93 },
  visible: { opacity: 1, y: 0,  scale: 1,
    transition: { type: 'spring', stiffness: 340, damping: 28 } },
};

const panelVariants: Variants = {
  hidden:  { opacity: 0, x: 24, scale: 0.96 },
  visible: { opacity: 1, x: 0,  scale: 1,
    transition: { type: 'spring', stiffness: 280, damping: 26 } },
  exit:    { opacity: 0, x: 24, scale: 0.96,
    transition: { duration: 0.22 } },
};

// ─── Animated Counter ─────────────────────────────────────────────────────────

function AnimCounter({ value, decimals = 0, suffix = '' }:
  { value: number; decimals?: number; suffix?: string }) {
  const mv = useMotionValue(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ctrl = animate(mv, value, { duration: 1.2, ease: 'easeOut' });
    const unsub = mv.on('change', (v) => {
      if (ref.current) {
        ref.current.textContent = v.toFixed(decimals) + suffix;
      }
    });
    return () => { ctrl.stop(); unsub(); };
  }, [mv, value, decimals, suffix]);

  return <span ref={ref}>{(0).toFixed(decimals) + suffix}</span>;
}

// ─── Reputation Bar ───────────────────────────────────────────────────────────

function RepBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 4, background: C.hairline, borderRadius: 2, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value * 100}%` }}
        transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
        style={{ height: '100%', background: color, borderRadius: 2 }}
      />
    </div>
  );
}

// ─── Pool Volume by Provider ──────────────────────────────────────────────────

function poolVolume(workspaces: WorkspaceRow[], poolId: PoolId): number {
  return workspaces.filter(w => w.poolId === poolId).reduce((s, w) => s + w.sends30d, 0);
}

function poolWorkspaces(workspaces: WorkspaceRow[], poolId: PoolId): WorkspaceRow[] {
  return workspaces.filter(w => w.poolId === poolId);
}

// ─── SVG Ribbon Path helpers ──────────────────────────────────────────────────

function makePath(
  x1: number, y1: number,
  x2: number, y2: number,
  cpOffset = 0.45,
): string {
  const dx = (x2 - x1) * cpOffset;
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

// Evaluate a cubic bezier at t → {x, y}
// Control points share the same y as endpoints (horizontal-ish curves),
// so y simplifies to a cubic lerp between y1 and y2.
function evalBezier(
  x1: number, y1: number,
  x2: number, y2: number,
  t: number,
  cpOffset = 0.45,
): { x: number; y: number } {
  const dx = (x2 - x1) * cpOffset;
  const cp1x = x1 + dx;
  const cp2x = x2 - dx;
  const mt = 1 - t;
  const x = mt*mt*mt*x1 + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*x2;
  const y = mt*mt*mt*y1 + 3*mt*mt*t*y1    + 3*mt*t*t*y2   + t*t*t*y2;
  return { x, y };
}

// ─── Particle Dot ─────────────────────────────────────────────────────────────

interface ParticleDef {
  id: number;
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
  size: number;
  duration: number;
  delay: number;
  cpOffset: number;
}

function Particle({ p, paused }: { p: ParticleDef; paused: boolean }) {
  const tRef   = useRef(0);
  const rafRef = useRef<number | null>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (paused) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return;
    }

    // stagger start
    const startDelay = p.delay * 1000;
    let startTimeout: ReturnType<typeof setTimeout> | null = null;

    const tick = (ts: number) => {
      if (lastTs.current === 0) lastTs.current = ts;
      const dt = ts - lastTs.current;
      lastTs.current = ts;
      tRef.current = (tRef.current + dt / (p.duration * 1000)) % 1;

      const { x, y } = evalBezier(p.x1, p.y1, p.x2, p.y2, tRef.current, p.cpOffset);
      if (dotRef.current) {
        dotRef.current.setAttribute('cx', String(x));
        dotRef.current.setAttribute('cy', String(y));
        // fade in near start, fade out near end
        const t = tRef.current;
        const alpha = t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1;
        dotRef.current.setAttribute('opacity', String(alpha));
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    startTimeout = setTimeout(() => {
      tRef.current = 0;
      lastTs.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }, startDelay);

    return () => {
      if (startTimeout) clearTimeout(startTimeout);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [p, paused]);

  return (
    <circle
      ref={dotRef}
      r={p.size}
      fill={p.color}
      opacity={0}
    />
  );
}

// ─── Ribbon with Particles ────────────────────────────────────────────────────

let _pid = 0;

function buildParticles(
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
  volume: number,
  maxVolume: number,
  cpOffset: number,
): ParticleDef[] {
  const count = Math.max(2, Math.round(1 + (volume / maxVolume) * 7));
  const particles: ParticleDef[] = [];
  for (let i = 0; i < count; i++) {
    const dur = 2.2 + Math.random() * 1.4;
    particles.push({
      id: _pid++,
      x1, y1, x2, y2,
      color,
      size: 2 + Math.random() * 1.5,
      duration: dur,
      delay: (i / count) * dur,
      cpOffset,
    });
  }
  return particles;
}

// ─── Flow Diagram SVG (workspace→pool, pool→provider) ────────────────────────

const SVG_W = 820;
const SVG_H = 440;
const COL_LEFT   = 90;
const COL_MID    = 410;
const COL_RIGHT  = 730;

function computeLayout(workspaces: WorkspaceRow[]) {
  // Y positions for workspace nodes
  const wsCount = INITIAL_WORKSPACES.length;
  const wsYs = INITIAL_WORKSPACES.map((_, i) => 28 + i * (SVG_H - 56) / (wsCount - 1));

  // Y positions for pool nodes
  const poolCount = POOLS.length;
  const poolYs = POOLS.map((_, i) => 44 + i * (SVG_H - 88) / (poolCount - 1));

  // Y positions for provider nodes
  const provCount = PROVIDERS.length;
  const provYs = PROVIDERS.map((_, i) => 80 + i * (SVG_H - 160) / (provCount - 1));

  // Total volume per pool (from current workspaces state)
  const poolVols = POOLS.map(p => poolVolume(workspaces, p.id));
  const maxPoolVol = Math.max(...poolVols, 1);

  return { wsYs, poolYs, provYs, poolVols, maxPoolVol };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdmPoolR6Streams() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>(INITIAL_WORKSPACES);
  const [selectedPool, setSelectedPool] = useState<PoolId | null>(null);
  const [hoveredPool, setHoveredPool] = useState<PoolId | null>(null);
  const [hoveredWs, setHoveredWs] = useState<string | null>(null);
  const [hoveredProv, setHoveredProv] = useState<ProviderId | null>(null);
  const [reassignWs, setReassignWs] = useState<string | null>(null);
  const [particlePaused, setParticlePaused] = useState(false);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);

  const layout = computeLayout(workspaces);

  // Total stats
  const totalVol    = workspaces.reduce((s, w) => s + w.sends30d, 0);
  const avgUtil     = POOLS.reduce((s, p, i) => {
    const vol = layout.poolVols[i] ?? 0;
    return s + vol / p.capacity;
  }, 0) / POOLS.length;

  const selectedPoolDef = POOLS.find(p => p.id === selectedPool) ?? null;
  const selectedPoolWs  = selectedPoolDef ? poolWorkspaces(workspaces, selectedPool!) : [];

  const handleReassign = useCallback((wsId: string, newPool: PoolId) => {
    setParticlePaused(true);
    setWorkspaces(prev => prev.map(w => w.id === wsId ? { ...w, poolId: newPool } : w));
    setReassignWs(null);
    const ws = workspaces.find(w => w.id === wsId);
    setReassignSuccess(`${ws?.name ?? wsId} → ${POOLS.find(p => p.id === newPool)?.label}`);
    setTimeout(() => { setParticlePaused(false); setReassignSuccess(null); }, 2200);
  }, [workspaces]);

  // Build ribbon segments + particles
  const maxVol = Math.max(...workspaces.map(w => w.sends30d), 1);
  const maxPoolVol = layout.maxPoolVol;

  // ws → pool ribbons
  const wsPoolRibbons: Array<{
    wsId: string; poolId: PoolId;
    x1: number; y1: number;
    x2: number; y2: number;
    thickness: number;
    color: string;
    particles: ParticleDef[];
  }> = workspaces.map((ws) => {
    const wsIdx  = INITIAL_WORKSPACES.findIndex(w => w.id === ws.id);
    const poolIdx = POOLS.findIndex(p => p.id === ws.poolId);
    const pool    = POOLS[poolIdx]!;
    const y1 = layout.wsYs[wsIdx] ?? (28 + wsIdx * 40);
    const y2 = layout.poolYs[poolIdx] ?? (44 + poolIdx * 80);
    const thick = 1.2 + (ws.sends30d / maxVol) * 5.5;
    return {
      wsId: ws.id, poolId: ws.poolId,
      x1: COL_LEFT, y1,
      x2: COL_MID, y2,
      thickness: thick,
      color: pool.color,
      particles: buildParticles(COL_LEFT, y1, COL_MID, y2, pool.color, ws.sends30d, maxVol, 0.42),
    };
  });

  // pool → provider ribbons
  const poolProvRibbons: Array<{
    poolId: PoolId; provId: ProviderId;
    x1: number; y1: number;
    x2: number; y2: number;
    thickness: number;
    color: string;
    particles: ParticleDef[];
  }> = [];
  POOLS.forEach((pool, pi) => {
    const vol = layout.poolVols[pi] ?? 0;
    pool.providers.forEach(provId => {
      const provIdx = PROVIDERS.findIndex(p => p.id === provId);
      const y1 = layout.poolYs[pi] ?? (44 + pi * 80);
      const y2 = layout.provYs[provIdx] ?? (80 + provIdx * 120);
      const thick = 1 + (vol / maxPoolVol) * 4;
      poolProvRibbons.push({
        poolId: pool.id, provId,
        x1: COL_MID, y1,
        x2: COL_RIGHT, y2,
        thickness: thick,
        color: pool.color,
        particles: buildParticles(COL_MID, y1, COL_RIGHT, y2, pool.color, vol / pool.providers.length, maxPoolVol, 0.42),
      });
    });
  });

  // Dimming logic
  const dimRibbon = (wsId: string, poolId: PoolId, provId?: ProviderId): boolean => {
    if (!hoveredPool && !hoveredWs && !hoveredProv && !selectedPool) return false;
    if (hoveredWs) return wsId !== hoveredWs;
    if (hoveredPool) return poolId !== hoveredPool;
    if (hoveredProv) return provId !== hoveredProv;
    if (selectedPool) return poolId !== selectedPool;
    return false;
  };

  return (
    <div style={{
      minHeight: '100%',
      padding: '20px 24px 32px',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: C.text,
      boxSizing: 'border-box',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glows */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{
          position: 'absolute', width: 480, height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(242,101,34,0.09) 0%, transparent 70%)',
          top: -120, left: '20%', filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', width: 360, height: 360,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(61,220,151,0.06) 0%, transparent 70%)',
          bottom: 0, right: '10%', filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', width: 300, height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,138,75,0.07) 0%, transparent 70%)',
          top: '40%', left: '45%', filter: 'blur(50px)',
        }} />
      </div>

      {/* Page Header */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Admin · Pool Routing
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Flow Streams
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.dim }}>
              Workspaces flow through peer pools into provider networks
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 500,
              background: C.glass, border: `1px solid ${C.border}`, color: C.dim,
              cursor: 'pointer',
            }}>
              <RefreshCw size={12} strokeWidth={2.2} />
              Rebalance
            </button>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 9, fontSize: 12, fontWeight: 600,
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentB})`,
              border: 'none', color: '#fff', cursor: 'pointer',
            }}>
              <Layers size={12} strokeWidth={2.4} />
              New Pool
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <motion.div
          variants={colVariants} initial="hidden" animate="visible"
          style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}
        >
          {[
            { icon: Activity, label: 'Total Volume',   val: <AnimCounter value={totalVol} />, sub: 'sends / 30d' },
            { icon: Layers,   label: 'Avg Utilization', val: <><AnimCounter value={avgUtil * 100} decimals={1} />%</>, sub: 'across all pools' },
            { icon: Network,  label: 'Pools Active',   val: POOLS.length, sub: 'peer pools' },
            { icon: Users,    label: 'Workspaces',     val: workspaces.length, sub: 'routed' },
            { icon: Shield,   label: 'Avg Reputation', val: <><AnimCounter value={POOLS.reduce((s, p) => s + p.reputation, 0) / POOLS.length * 100} decimals={1} />%</>, sub: 'network-wide' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              variants={nodeVariants}
              style={{
                ...GLASS, flex: '1 1 130px', minWidth: 110,
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `rgba(242,101,34,${0.08 + i * 0.02})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <s.icon size={14} color={C.accentB} strokeWidth={2.2} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                  {s.val}
                </div>
                <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{s.label}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Routing precedence note */}
        <div style={{
          ...GLASS,
          padding: '8px 14px', borderRadius: 10, marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 8,
          borderLeft: `3px solid ${C.accentB}`,
        }}>
          <Zap size={12} color={C.accentB} strokeWidth={2.4} />
          <span style={{ fontSize: 11, color: C.dim }}>
            Routing precedence: <strong style={{ color: C.text }}>Workspace pool override</strong> → Default pool → Reputation-weighted random. Changes take effect on the next warmup cycle.
          </span>
        </div>

        {/* Reassign success toast */}
        <AnimatePresence>
          {reassignSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              style={{
                position: 'fixed', top: 20, right: 24, zIndex: 100,
                background: C.successDim,
                border: `1px solid ${C.success}`,
                borderRadius: 10, padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 8,
                backdropFilter: 'blur(12px)',
              }}
            >
              <CheckCircle2 size={14} color={C.success} strokeWidth={2.4} />
              <span style={{ fontSize: 12, color: C.success, fontWeight: 600 }}>
                Reassigned: {reassignSuccess}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Layout: Flow + Panel */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Flow canvas */}
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            {/* Column headers */}
            <div style={{ display: 'flex', marginBottom: 8 }}>
              <div style={{ width: COL_LEFT + 60, textAlign: 'center', fontSize: 11, color: C.faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Workspaces
              </div>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: C.faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Peer Pools
              </div>
              <div style={{ width: 120, textAlign: 'center', fontSize: 11, color: C.faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Providers
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              {/* SVG ribbons + particles */}
              <svg
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  pointerEvents: 'none', overflow: 'visible',
                }}
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  {POOLS.map(pool => (
                    <linearGradient key={pool.id} id={`grad-ws-${pool.id}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={pool.color} stopOpacity="0.08" />
                      <stop offset="50%" stopColor={pool.color} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={pool.color} stopOpacity="0.45" />
                    </linearGradient>
                  ))}
                  {POOLS.map(pool => (
                    <linearGradient key={pool.id} id={`grad-pp-${pool.id}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={pool.color} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={pool.color} stopOpacity="0.18" />
                    </linearGradient>
                  ))}
                </defs>

                {/* ws → pool ribbons */}
                {wsPoolRibbons.map((r) => {
                  const dim = dimRibbon(r.wsId, r.poolId);
                  return (
                    <g key={`ws-${r.wsId}-${r.poolId}`}>
                      <motion.path
                        d={makePath(r.x1, r.y1, r.x2, r.y2)}
                        stroke={`url(#grad-ws-${r.poolId})`}
                        strokeWidth={r.thickness}
                        fill="none"
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{
                          pathLength: 1,
                          opacity: dim ? 0.08 : 0.7,
                        }}
                        transition={{
                          pathLength: { duration: 1.1, ease: 'easeOut', delay: 0.2 },
                          opacity: { type: 'spring', stiffness: 220, damping: 28 },
                        }}
                      />
                      {!dim && r.particles.map(p => (
                        <Particle key={p.id} p={p} paused={particlePaused} />
                      ))}
                    </g>
                  );
                })}

                {/* pool → provider ribbons */}
                {poolProvRibbons.map((r, i) => {
                  const dim = dimRibbon('', r.poolId, r.provId);
                  return (
                    <g key={`pp-${r.poolId}-${r.provId}-${i}`}>
                      <motion.path
                        d={makePath(r.x1, r.y1, r.x2, r.y2)}
                        stroke={`url(#grad-pp-${r.poolId})`}
                        strokeWidth={r.thickness}
                        fill="none"
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{
                          pathLength: 1,
                          opacity: dim ? 0.06 : 0.55,
                        }}
                        transition={{
                          pathLength: { duration: 1.2, ease: 'easeOut', delay: 0.4 },
                          opacity: { type: 'spring', stiffness: 220, damping: 28 },
                        }}
                      />
                      {!dim && r.particles.map(p => (
                        <Particle key={p.id} p={p} paused={particlePaused} />
                      ))}
                    </g>
                  );
                })}
              </svg>

              {/* Nodes overlay */}
              <div style={{
                position: 'relative', zIndex: 1,
                display: 'flex', gap: 0,
                minHeight: SVG_H,
              }}>
                {/* LEFT: Workspace nodes */}
                <motion.div
                  variants={colVariants} initial="hidden" animate="visible"
                  style={{
                    width: COL_LEFT + 60,
                    display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-around',
                    paddingRight: 8,
                  }}
                >
                  {INITIAL_WORKSPACES.map((wsBase) => {
                    const ws = workspaces.find(w => w.id === wsBase.id) ?? wsBase;
                    const poolDef = POOLS.find(p => p.id === ws.poolId)!;
                    const isHov = hoveredWs === ws.id;
                    const isDim = (hoveredPool && ws.poolId !== hoveredPool) ||
                      (hoveredWs && ws.id !== hoveredWs) ||
                      (selectedPool && ws.poolId !== selectedPool) || false;

                    return (
                      <motion.div
                        key={ws.id}
                        variants={nodeVariants}
                        onHoverStart={() => setHoveredWs(ws.id)}
                        onHoverEnd={() => setHoveredWs(null)}
                        animate={{ opacity: isDim ? 0.32 : 1, scale: isHov ? 1.03 : 1 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                        style={{
                          ...GLASS2,
                          padding: '6px 8px',
                          cursor: 'default',
                          userSelect: 'none',
                          display: 'flex', alignItems: 'center', gap: 7,
                          marginBottom: 2,
                        }}
                      >
                        {/* Avatar */}
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                          background: `linear-gradient(135deg, hsl(${ws.hue} 78% 54%), hsl(${ws.hue + 20} 72% 46%))`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700, color: '#fff',
                        }}>
                          {ws.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ws.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 4,
                              background: `${TIERS[ws.tier]}22`,
                              color: TIERS[ws.tier], fontWeight: 600,
                            }}>{ws.tier}</span>
                            <span style={{ fontSize: 9, color: C.faint }}>
                              {ws.sends30d >= 1000 ? `${(ws.sends30d / 1000).toFixed(1)}k` : ws.sends30d}
                            </span>
                          </div>
                        </div>
                        {/* Pool color dot */}
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: poolDef.color, flexShrink: 0,
                        }} />
                      </motion.div>
                    );
                  })}
                </motion.div>

                {/* CENTER: Pool nodes */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', padding: '0 12px' }}>
                  <motion.div
                    variants={colVariants} initial="hidden" animate="visible"
                    style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: '100%' }}
                  >
                    {POOLS.map((pool, pi) => {
                      const vol = layout.poolVols[pi] ?? 0;
                      const util = vol / pool.capacity;
                      const isHov = hoveredPool === pool.id;
                      const isSel = selectedPool === pool.id;
                      const isDim = (hoveredPool && !isHov) || (hoveredWs && !wsPoolRibbons.some(r => r.wsId === hoveredWs && r.poolId === pool.id)) || false;

                      return (
                        <motion.div
                          key={pool.id}
                          variants={nodeVariants}
                          onHoverStart={() => setHoveredPool(pool.id)}
                          onHoverEnd={() => setHoveredPool(null)}
                          onClick={() => setSelectedPool(prev => prev === pool.id ? null : pool.id)}
                          animate={{
                            opacity: isDim ? 0.28 : 1,
                            scale: isHov ? 1.04 : 1,
                            boxShadow: isSel
                              ? `0 0 0 2px ${pool.color}, 0 8px 28px rgba(0,0,0,0.35)`
                              : isHov
                                ? `0 0 0 1px ${pool.color}66, 0 6px 20px rgba(0,0,0,0.28)`
                                : `0 2px 10px rgba(0,0,0,0.18)`,
                          }}
                          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                          style={{
                            ...GLASS,
                            padding: '10px 12px',
                            borderRadius: 14,
                            cursor: 'pointer',
                            userSelect: 'none',
                            marginBottom: 4,
                            borderLeft: `3px solid ${pool.color}`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                              background: `${pool.color}22`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Server size={13} color={pool.color} strokeWidth={2.2} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{pool.label}</div>
                              <div style={{ fontSize: 10, color: C.faint }}>{pool.peers} peers</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: pool.color }}>
                                {(pool.reputation * 100).toFixed(0)}%
                              </div>
                              <div style={{ fontSize: 9, color: C.faint }}>rep</div>
                            </div>
                          </div>
                          {/* Utilization bar */}
                          <RepBar value={Math.min(util, 1)} color={pool.color} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                            <span style={{ fontSize: 9, color: C.faint }}>{(util * 100).toFixed(0)}% utilized</span>
                            <span style={{ fontSize: 9, color: C.faint }}>{vol.toLocaleString()} / {pool.capacity.toLocaleString()} cap</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </div>

                {/* RIGHT: Provider nodes */}
                <motion.div
                  variants={colVariants} initial="hidden" animate="visible"
                  style={{
                    width: 120,
                    display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-around',
                    paddingLeft: 8,
                  }}
                >
                  {PROVIDERS.map((prov) => {
                    const isHov = hoveredProv === prov.id;
                    const isDim = (hoveredProv && !isHov) ||
                      (hoveredPool && !poolProvRibbons.some(r => r.poolId === hoveredPool && r.provId === prov.id)) || false;

                    return (
                      <motion.div
                        key={prov.id}
                        variants={nodeVariants}
                        onHoverStart={() => setHoveredProv(prov.id)}
                        onHoverEnd={() => setHoveredProv(null)}
                        animate={{
                          opacity: isDim ? 0.28 : 1,
                          scale: isHov ? 1.04 : 1,
                        }}
                        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                        style={{
                          ...GLASS2,
                          padding: '8px 10px',
                          borderRadius: 12,
                          cursor: 'default',
                          userSelect: 'none',
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                            background: `${prov.color}22`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Globe size={11} color={prov.color} strokeWidth={2.2} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {prov.shortLabel}
                            </div>
                            <div style={{ fontSize: 9, color: C.faint }}>{prov.peers} peers</div>
                          </div>
                        </div>
                        <RepBar value={prov.deliverability} color={prov.color} />
                        <div style={{ fontSize: 9, color: C.faint, marginTop: 3, textAlign: 'right' }}>
                          {(prov.deliverability * 100).toFixed(0)}% deliv.
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            </div>
          </div>

          {/* RIGHT: Detail Panel */}
          <AnimatePresence>
            {selectedPoolDef && (
              <motion.div
                key={selectedPoolDef.id}
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{
                  ...GLASS,
                  width: 240, flexShrink: 0,
                  padding: '16px 16px 20px',
                  borderTop: `3px solid ${selectedPoolDef.color}`,
                }}
              >
                {/* Panel header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: `${selectedPoolDef.color}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Server size={14} color={selectedPoolDef.color} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{selectedPoolDef.label}</div>
                      <div style={{ fontSize: 10, color: C.faint }}>Pool details</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedPool(null)}
                    style={{
                      width: 24, height: 24, borderRadius: 6, border: 'none',
                      background: C.glass, color: C.dim, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <X size={12} strokeWidth={2.4} />
                  </button>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {[
                    { label: 'Peers', value: selectedPoolDef.peers },
                    { label: 'Capacity', value: `${selectedPoolDef.capacity.toLocaleString()}/d` },
                    { label: 'Reputation', value: `${(selectedPoolDef.reputation * 100).toFixed(0)}%` },
                    { label: 'Utilization', value: (() => {
                      const idx = POOLS.findIndex(p => p.id === selectedPoolDef.id);
                      const vol = layout.poolVols[idx] ?? 0;
                      return `${(vol / selectedPoolDef.capacity * 100).toFixed(0)}%`;
                    })() },
                  ].map(s => (
                    <div key={s.label} style={{ ...GLASS2, padding: '8px 10px', borderRadius: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: selectedPoolDef.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Routed Workspaces */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Routed Workspaces</span>
                    <span style={{ color: C.faint }}>{selectedPoolWs.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 200, overflowY: 'auto' }}>
                    <AnimatePresence>
                      {selectedPoolWs.map((ws, i) => (
                        <motion.div
                          key={ws.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ delay: i * 0.04, type: 'spring', stiffness: 320, damping: 28 }}
                          style={{
                            ...GLASS2,
                            padding: '6px 8px', borderRadius: 9,
                            display: 'flex', alignItems: 'center', gap: 7,
                          }}
                        >
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: `linear-gradient(135deg, hsl(${ws.hue} 78% 54%), hsl(${ws.hue + 20} 72% 46%))`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8, fontWeight: 700, color: '#fff',
                          }}>
                            {ws.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ws.name}
                            </div>
                            <div style={{ fontSize: 9, color: C.faint }}>
                              {ws.sends30d >= 1000 ? `${(ws.sends30d / 1000).toFixed(1)}k` : ws.sends30d}/30d
                            </div>
                          </div>
                          {/* Reassign button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReassignWs(prev => prev === ws.id ? null : ws.id);
                            }}
                            style={{
                              padding: '3px 6px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                              background: C.glass, border: `1px solid ${C.border}`,
                              color: C.dim, cursor: 'pointer', whiteSpace: 'nowrap',
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            <Shuffle size={9} strokeWidth={2.4} />
                            Move
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {selectedPoolWs.length === 0 && (
                      <div style={{ fontSize: 11, color: C.faint, textAlign: 'center', padding: '12px 0' }}>
                        No workspaces assigned
                      </div>
                    )}
                  </div>
                </div>

                {/* Reassign Dropdown */}
                <AnimatePresence>
                  {reassignWs && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                      style={{
                        background: 'rgba(20,18,16,0.95)',
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: '10px',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8, fontWeight: 600 }}>
                        Move <strong style={{ color: C.text }}>
                          {workspaces.find(w => w.id === reassignWs)?.name}
                        </strong> to:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {POOLS.filter(p => p.id !== selectedPool).map(p => (
                          <motion.button
                            key={p.id}
                            onClick={() => handleReassign(reassignWs, p.id)}
                            whileHover={{ x: 3 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '6px 8px', borderRadius: 7, width: '100%',
                              background: C.glass, border: `1px solid ${C.borderSoft}`,
                              color: C.text, cursor: 'pointer', fontSize: 11,
                              fontWeight: 500, textAlign: 'left',
                            }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{p.label}</span>
                            <ArrowRight size={10} color={C.faint} strokeWidth={2.2} />
                          </motion.button>
                        ))}
                      </div>
                      <button
                        onClick={() => setReassignWs(null)}
                        style={{
                          marginTop: 8, width: '100%', padding: '5px',
                          borderRadius: 6, background: 'none', border: `1px solid ${C.hairline}`,
                          color: C.faint, cursor: 'pointer', fontSize: 10,
                        }}
                      >
                        Cancel
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Providers for this pool */}
                <div>
                  <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 6 }}>Providers</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {selectedPoolDef.providers.map(provId => {
                      const prov = PROVIDERS.find(p => p.id === provId)!;
                      return (
                        <div key={provId} style={{
                          padding: '4px 8px', borderRadius: 6,
                          background: `${prov.color}18`,
                          border: `1px solid ${prov.color}44`,
                          fontSize: 10, color: prov.color, fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <Mail size={9} strokeWidth={2.4} />
                          {prov.shortLabel}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: C.faint }}>Ribbon thickness = send volume</span>
          <span style={{ fontSize: 10, color: C.faint }}>·</span>
          <span style={{ fontSize: 10, color: C.faint }}>Particle density ∝ volume</span>
          <span style={{ fontSize: 10, color: C.faint }}>·</span>
          <span style={{ fontSize: 10, color: C.faint }}>Click a pool node to open details + reassign workspaces</span>
          <span style={{ fontSize: 10, color: C.faint }}>·</span>
          <span style={{ fontSize: 10, color: C.faint }}>Hover to highlight a routing path</span>
        </div>
      </div>
    </div>
  );
}
