/**
 * Admin LLM Usage Design Candidate: L3 Token Stream
 *
 * "Token Stream" — a live streaming visualization of token consumption flowing
 * into a budget reservoir. The centerpiece is a particle/dash animation where
 * requests arrive from the left, route through provider nodes (Gemini → Claude →
 * Static), and pour into an animated liquid reservoir on the right.
 *
 * Self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only. Warm/neutral palette only.
 * All rAF/intervals/motion subscriptions cleaned up on unmount.
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
  type Variants,
} from 'framer-motion';
import {
  Activity,
  Pause,
  Play,
  Zap,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  Hash,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.38)' as const,
  ghost: 'rgba(255,255,255,0.15)' as const,
  accent: '#F26522' as const,
  accentLt: '#FF8A4B' as const,
  success: '#3ddc97' as const,
  danger: '#ff5c7a' as const,
  warning: '#FF8A4B' as const,
  hair: 'rgba(255,255,255,0.08)' as const,
  glass: 'rgba(255,255,255,0.05)' as const,
  glassMid: 'rgba(255,255,255,0.08)' as const,
  border: 'rgba(255,255,255,0.10)' as const,
};

function glassBox(extra?: CSSProperties): CSSProperties {
  return {
    background: T.glass,
    border: `1px solid ${T.border}`,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
    ...extra,
  };
}

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: T.faint,
};

// ─── Mock data & types ────────────────────────────────────────────────────────

interface Provider {
  id: 'gemini' | 'claude' | 'static';
  label: string;
  shortLabel: string;
  color: string;
  /** fraction of total traffic 0..1 */
  share: number;
  tokPerReq: number;   // avg tokens per request
  costPerMtok: number; // $ per million tokens
  p95ms: number;       // p95 latency ms
  successRate: number; // 0..1
}

const PROVIDERS: Provider[] = [
  {
    id: 'gemini',
    label: 'Gemini 1.5 Flash',
    shortLabel: 'Gemini',
    color: '#FF8A4B',
    share: 0.64,
    tokPerReq: 820,
    costPerMtok: 0.075,
    p95ms: 310,
    successRate: 0.991,
  },
  {
    id: 'claude',
    label: 'Claude Haiku 3',
    shortLabel: 'Claude',
    color: '#F26522',
    share: 0.32,
    tokPerReq: 940,
    costPerMtok: 0.25,
    p95ms: 480,
    successRate: 0.987,
  },
  {
    id: 'static',
    label: 'Static Templates',
    shortLabel: 'Static',
    color: 'rgba(255,255,255,0.55)',
    share: 0.04,
    tokPerReq: 0,
    costPerMtok: 0,
    p95ms: 4,
    successRate: 1.0,
  },
];

interface EventRow {
  id: string;
  provider: Provider;
  model: string;
  tokens: number;
  cost: number;
  latencyMs: number;
  success: boolean;
  ts: string;
}

// Seed initial event log
function makeEvent(id: string): EventRow {
  const roll = Math.random();
  let acc = 0;
  let prov = PROVIDERS[0]!;
  for (const p of PROVIDERS) {
    acc += p.share;
    if (roll < acc) { prov = p; break; }
  }
  const jitter = 0.8 + Math.random() * 0.4;
  const tokens = Math.round(prov.tokPerReq * jitter);
  const cost = (tokens / 1_000_000) * prov.costPerMtok;
  const latencyMs = Math.round(prov.p95ms * (0.5 + Math.random() * 0.8));
  const success = Math.random() < prov.successRate;
  const secsAgo = Math.floor(Math.random() * 90);
  const ts = secsAgo < 5 ? 'just now' : secsAgo < 60 ? `${secsAgo}s ago` : `${Math.floor(secsAgo / 60)}m ago`;
  return { id, provider: prov, model: prov.label, tokens, cost, latencyMs, success, ts };
}

const SEED_EVENTS: EventRow[] = Array.from({ length: 12 }, (_, i) => makeEvent(`seed-${i}`));

// Monthly budget & running totals
const MONTHLY_BUDGET = 80;          // $
const BUDGET_USED_START = 38.42;    // $ already consumed this month
const TOKENS_START = 12_840_000;    // total tokens consumed so far

// ─── Particle system types ────────────────────────────────────────────────────

interface Particle {
  id: number;
  providerId: Provider['id'];
  color: string;
  // 0 = at source, 1 = fully arrived at reservoir
  progress: number;
  speed: number; // progress units per ms
  // lane 0..2 corresponding to provider index
  lane: number;
  opacity: number;
}

// ─── Animated numeric counter (rAF-driven) ────────────────────────────────────

function useAnimatedCount(target: number, duration = 800) {
  const [displayed, setDisplayed] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplayed(from + (target - from) * ease);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return displayed;
}

// ─── Budget gauge spring value ────────────────────────────────────────────────

function BudgetGauge({ used, budget }: { used: number; budget: number }) {
  const pct = Math.min(1, used / budget);
  const springPct = useSpring(pct, { stiffness: 60, damping: 18 });
  useEffect(() => { springPct.set(Math.min(1, used / budget)); }, [used, budget, springPct]);

  // We draw a vertical liquid-fill gauge
  const [fillHeight, setFillHeight] = useState(pct * 100);
  useEffect(() => {
    const unsub = springPct.on('change', (v) => setFillHeight(v * 100));
    return () => unsub();
  }, [springPct]);

  const tone = pct > 0.85 ? T.danger : pct > 0.65 ? T.warning : T.success;
  const labelPct = (pct * 100).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {/* Vessel */}
      <div
        style={{
          position: 'relative',
          width: 64,
          height: 130,
          borderRadius: 14,
          border: `2px solid ${tone}55`,
          background: 'rgba(0,0,0,0.25)',
          overflow: 'hidden',
          boxShadow: `0 0 24px ${tone}22, inset 0 0 12px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Liquid fill */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${fillHeight}%`,
            background: `linear-gradient(180deg, ${tone}99, ${tone}dd)`,
            transition: 'height 0.4s ease-out',
          }}
        />
        {/* Wave shimmer */}
        <div
          style={{
            position: 'absolute',
            bottom: `calc(${fillHeight}% - 4px)`,
            left: 0,
            right: 0,
            height: 8,
            background: `linear-gradient(90deg, transparent, ${tone}88, transparent)`,
            animation: 'waveShimmer 2s ease-in-out infinite',
            transition: 'bottom 0.4s ease-out',
          }}
        />
        {/* Tick marks */}
        {[0.25, 0.5, 0.75].map((t) => (
          <div
            key={t}
            style={{
              position: 'absolute',
              bottom: `${t * 100}%`,
              left: 4,
              right: 4,
              height: 1,
              background: 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
        {/* Percentage label inside */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: fillHeight > 45 ? '#000' : T.text,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              textShadow: fillHeight > 45 ? 'none' : '0 1px 4px rgba(0,0,0,0.8)',
            }}
          >
            {labelPct}%
          </span>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: tone,
            letterSpacing: '-0.03em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          ${used.toFixed(2)}
        </div>
        <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>
          of ${budget} budget
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 5,
            fontSize: 10,
            fontWeight: 700,
            color: tone,
            background: `${tone}18`,
            border: `1px solid ${tone}44`,
            borderRadius: 999,
            padding: '3px 8px',
          }}
        >
          {pct > 0.85 ? <AlertTriangle size={9} /> : <CheckCircle2 size={9} />}
          {pct > 0.85 ? 'High burn' : pct > 0.65 ? 'Moderate' : 'On track'}
        </div>
      </div>
    </div>
  );
}

// ─── Provider node ────────────────────────────────────────────────────────────

const nodeVariants: Variants = {
  idle: { scale: 1, boxShadow: '0 0 0px transparent' },
  pulse: (color: string) => ({
    scale: [1, 1.06, 1],
    boxShadow: [`0 0 0px ${color}00`, `0 0 18px ${color}66`, `0 0 0px ${color}00`],
    transition: { duration: 0.55, ease: 'easeInOut' },
  }),
};

function ProviderNode({
  prov,
  rps,
  active,
}: {
  prov: Provider;
  rps: number; // requests/sec estimate
  active: boolean;
}) {
  const [pulsing, setPulsing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;
    const interval = Math.max(400, 1200 / (rps + 0.1));
    const fire = () => {
      setPulsing(true);
      timerRef.current = setTimeout(() => {
        setPulsing(false);
        timerRef.current = setTimeout(fire, interval + Math.random() * interval * 0.5);
      }, 550);
    };
    timerRef.current = setTimeout(fire, Math.random() * interval);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, rps]);

  return (
    <motion.div
      variants={nodeVariants}
      animate={pulsing ? 'pulse' : 'idle'}
      custom={prov.color}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        cursor: 'default',
        userSelect: 'none',
      }}
      whileHover={{ y: -2 }}
    >
      {/* Badge */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          border: `2px solid ${prov.color}66`,
          background: `linear-gradient(135deg, ${prov.color}22, rgba(0,0,0,0.2))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: prov.color,
            letterSpacing: '0.01em',
          }}
        >
          {prov.shortLabel[0]}
        </span>
        {/* Glow ring when pulsing */}
        {pulsing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 12,
              background: `radial-gradient(circle, ${prov.color}33, transparent 70%)`,
            }}
          />
        )}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: prov.color }}>
          {prov.shortLabel}
        </div>
        <div style={{ fontSize: 9.5, color: T.faint, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(prov.share * 100)}% · {rps.toFixed(1)} r/s
        </div>
      </div>
    </motion.div>
  );
}

// ─── Stream canvas (particle flow) ───────────────────────────────────────────

const CANVAS_H = 120;
const LANE_HEIGHT = CANVAS_H / 3;

function StreamCanvas({
  playing,
  particles,
}: {
  playing: boolean;
  particles: Particle[];
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: CANVAS_H,
        overflow: 'hidden',
      }}
    >
      {/* Lane guides */}
      {[0, 1, 2].map((lane) => (
        <div
          key={lane}
          style={{
            position: 'absolute',
            top: lane * LANE_HEIGHT + LANE_HEIGHT * 0.5 - 0.5,
            left: 0,
            right: 0,
            height: 1,
            background: T.hair,
            zIndex: 0,
          }}
        />
      ))}

      {/* Provider labels on left */}
      {PROVIDERS.map((p, i) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: 4,
            top: i * LANE_HEIGHT + LANE_HEIGHT * 0.5 - 7,
            fontSize: 9,
            fontWeight: 700,
            color: p.color,
            opacity: 0.7,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          {p.shortLabel}
        </div>
      ))}

      {/* Particles */}
      {particles.map((pt) => {
        const x = `${pt.progress * 96}%`;
        const y = pt.lane * LANE_HEIGHT + LANE_HEIGHT * 0.5;
        const wobble = Math.sin(pt.progress * Math.PI * 4 + pt.lane) * 4;
        return (
          <div
            key={pt.id}
            style={{
              position: 'absolute',
              left: x,
              top: y + wobble - 2,
              width: 20,
              height: 4,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${pt.color}00, ${pt.color}cc, ${pt.color}00)`,
              opacity: pt.opacity * (playing ? 1 : 0.3),
              transform: 'translateX(-50%)',
              willChange: 'transform',
            }}
          />
        );
      })}

      {/* "consumed" burst on right edge */}
      {particles
        .filter((pt) => pt.progress > 0.94)
        .map((pt) => (
          <div
            key={`burst-${pt.id}`}
            style={{
              position: 'absolute',
              right: 4,
              top: pt.lane * LANE_HEIGHT + LANE_HEIGHT * 0.5 - 6,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${pt.color}88, transparent 70%)`,
              opacity: (1 - pt.progress) * 8 * pt.opacity,
            }}
          />
        ))}
    </div>
  );
}

// ─── Event feed row ──────────────────────────────────────────────────────────

const rowVariants: Variants = {
  hidden: { opacity: 0, y: -18, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 340, damping: 28 },
  },
  exit: {
    opacity: 0,
    y: 12,
    scale: 0.95,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

function EventFeedRow({ ev }: { ev: EventRow }) {
  const fmtTokens = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

  return (
    <motion.div
      layout
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr 64px 64px 56px 44px',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        borderBottom: `1px solid ${T.hair}`,
        fontSize: 11.5,
        color: T.text,
      }}
      whileHover={{ background: 'rgba(255,255,255,0.03)' }}
    >
      {/* Provider chip */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 7px',
          borderRadius: 6,
          background: `${ev.provider.color}1a`,
          border: `1px solid ${ev.provider.color}44`,
          color: ev.provider.color,
          fontSize: 10,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: ev.provider.color,
            boxShadow: `0 0 4px ${ev.provider.color}`,
            flexShrink: 0,
          }}
        />
        {ev.provider.shortLabel}
      </span>

      {/* Model */}
      <span
        style={{
          color: T.dim,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 11,
        }}
      >
        {ev.model}
      </span>

      {/* Tokens */}
      <span
        style={{
          color: T.text,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          fontWeight: 600,
        }}
      >
        {fmtTokens(ev.tokens)}
      </span>

      {/* Cost */}
      <span
        style={{
          color: ev.cost > 0 ? T.accentLt : T.faint,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          fontWeight: 600,
        }}
      >
        {ev.cost > 0 ? `$${ev.cost.toFixed(4)}` : '—'}
      </span>

      {/* Latency */}
      <span
        style={{
          color:
            ev.latencyMs > 600 ? T.danger : ev.latencyMs > 350 ? T.warning : T.success,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          fontWeight: 600,
        }}
      >
        {ev.latencyMs}ms
      </span>

      {/* Success */}
      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {ev.success ? (
          <CheckCircle2 size={12} style={{ color: T.success }} />
        ) : (
          <AlertTriangle size={12} style={{ color: T.danger }} />
        )}
      </span>
    </motion.div>
  );
}

// ─── KPI counter tile ─────────────────────────────────────────────────────────

function KpiTile({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <motion.div
      style={{
        ...glassBox({ padding: '14px 16px', flex: 1, minWidth: 130 }),
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      whileHover={{ y: -2, boxShadow: `0 8px 24px ${color}1a` }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 7,
            background: `${color}22`,
            color,
          }}
        >
          <Icon size={12} strokeWidth={2.4} />
        </span>
        <span style={{ ...MICRO }}>{label}</span>
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: T.text,
          letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: T.faint }}>{sub}</div>
      )}
    </motion.div>
  );
}

// ─── Provider share bar ───────────────────────────────────────────────────────

function ProviderShareBar({
  shares,
}: {
  shares: { provider: Provider; pct: number }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Stacked bar */}
      <div
        style={{
          display: 'flex',
          height: 10,
          borderRadius: 999,
          overflow: 'hidden',
          background: T.hair,
        }}
      >
        {shares.map(({ provider, pct }) => (
          <motion.div
            key={provider.id}
            style={{
              height: '100%',
              background: provider.color,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.3 }}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {shares.map(({ provider, pct }) => (
          <div
            key={provider.id}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: provider.color,
                flexShrink: 0,
                boxShadow: `0 0 4px ${provider.color}88`,
              }}
            />
            <span style={{ color: T.dim }}>{provider.shortLabel}</span>
            <span style={{ color: T.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmLlmL3Stream() {
  // --- Live state ---
  const [playing, setPlaying] = useState(true);
  const [events, setEvents] = useState<EventRow[]>(SEED_EVENTS);
  const [tokenCount, setTokenCount] = useState(TOKENS_START);
  const [costUsed, setCostUsed] = useState(BUDGET_USED_START);
  const [requestCount, setRequestCount] = useState(18_240);
  const [successCount, setSuccessCount] = useState(18_058);

  // Provider live share state (drift slightly over time)
  const [provShares, setProvShares] = useState<{ provider: Provider; pct: number }[]>(
    PROVIDERS.map((p) => ({ provider: p, pct: p.share * 100 })),
  );

  // Particle system
  const [particles, setParticles] = useState<Particle[]>([]);
  const nextParticleId = useRef(0);

  // Animated display values (smooth ticking)
  const displayTokens = useAnimatedCount(tokenCount, 1200);
  const displayCost = useAnimatedCount(costUsed, 900);
  const displayRequests = useAnimatedCount(requestCount, 900);

  // Motion values for large ticker
  const tickerMv = useMotionValue(TOKENS_START);
  const tickerSpring = useSpring(tickerMv, { stiffness: 30, damping: 15 });
  const [tickerDisplay, setTickerDisplay] = useState(TOKENS_START);

  useEffect(() => {
    const unsub = tickerSpring.on('change', (v) => setTickerDisplay(v));
    return () => unsub();
  }, [tickerSpring]);

  // Sync ticker spring with actual token count
  useEffect(() => {
    tickerMv.set(tokenCount);
  }, [tokenCount, tickerMv]);

  // --- Particle rAF loop ---
  const playingRef = useRef(playing);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  const particlesRef = useRef(particles);
  useEffect(() => { particlesRef.current = particles; }, [particles]);

  const rafRef = useRef(0);
  const lastTickRef = useRef(0);
  const spawnAccumRef = useRef(0);

  useEffect(() => {
    let running = true;

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(80, now - (lastTickRef.current || now));
      lastTickRef.current = now;

      if (playingRef.current) {
        // Spawn particles proportional to provider share
        spawnAccumRef.current += dt * 0.018; // ~18 particles/sec total
        while (spawnAccumRef.current >= 1) {
          spawnAccumRef.current -= 1;
          const roll = Math.random();
          let acc = 0;
          let lane = 0;
          let color = PROVIDERS[0]!.color;
          let pid: Provider['id'] = 'gemini';
          for (let i = 0; i < PROVIDERS.length; i++) {
            acc += PROVIDERS[i]!.share;
            if (roll < acc) {
              lane = i;
              color = PROVIDERS[i]!.color;
              pid = PROVIDERS[i]!.id;
              break;
            }
          }
          const newP: Particle = {
            id: nextParticleId.current++,
            providerId: pid,
            color,
            progress: 0,
            speed: 0.00045 + Math.random() * 0.00035,
            lane,
            opacity: 0.5 + Math.random() * 0.5,
          };
          particlesRef.current = [...particlesRef.current, newP];
        }

        // Advance and cull
        const updated: Particle[] = [];
        for (const pt of particlesRef.current) {
          const np = pt.progress + pt.speed * dt;
          if (np < 1.05) {
            updated.push({ ...pt, progress: np });
          }
        }
        // Cap total particles to avoid runaway
        const capped = updated.length > 60 ? updated.slice(-60) : updated;
        particlesRef.current = capped;
        setParticles([...capped]);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // --- Live event injection ---
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventCounterRef = useRef(0);

  const scheduleNextEvent = useCallback(() => {
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    const delay = 1200 + Math.random() * 1800;
    eventTimerRef.current = setTimeout(() => {
      if (!playingRef.current) {
        scheduleNextEvent();
        return;
      }
      eventCounterRef.current++;
      const ev = makeEvent(`live-${eventCounterRef.current}`);

      setEvents((prev) => {
        const next = [ev, ...prev];
        return next.length > 20 ? next.slice(0, 20) : next;
      });

      setTokenCount((prev) => prev + ev.tokens);
      setCostUsed((prev) => prev + ev.cost);
      setRequestCount((prev) => prev + 1);
      if (ev.success) setSuccessCount((prev) => prev + 1);

      // Drift provider shares slightly
      setProvShares((prev) =>
        prev.map(({ provider, pct }) => ({
          provider,
          pct: Math.max(
            provider.id === 'static' ? 1 : 5,
            Math.min(provider.id === 'gemini' ? 85 : provider.id === 'claude' ? 60 : 15,
              pct + (Math.random() - 0.5) * 1.5),
          ),
        })),
      );

      scheduleNextEvent();
    }, delay);
  }, []);

  useEffect(() => {
    scheduleNextEvent();
    return () => {
      if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    };
  }, [scheduleNextEvent]);

  // --- Derived stats ---
  const successRate = requestCount > 0 ? (successCount / requestCount) * 100 : 100;
  const avgCostPerReq = requestCount > 0 ? (costUsed / requestCount) * 1000 : 0; // $ per 1k reqs
  const tokensM = tokenCount / 1_000_000;
  const displayTokensM = displayTokens / 1_000_000;
  const tickerM = tickerDisplay / 1_000_000;

  // Entrance stagger
  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.07, delayChildren: 0.1 },
    },
  };

  const sectionVariants: Variants = {
    hidden: { opacity: 0, y: 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 280, damping: 26 },
    },
  };

  return (
    <>
      {/* Inline keyframe for wave shimmer */}
      <style>{`
        @keyframes waveShimmer {
          0%, 100% { opacity: 0.4; transform: scaleX(0.7); }
          50%       { opacity: 1;   transform: scaleX(1.1); }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{
          width: '100%',
          maxWidth: 1280,
          margin: '0 auto',
          padding: '0 4px 40px',
          color: T.text,
          fontFamily: 'inherit',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <motion.div variants={sectionVariants}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 5,
                }}
              >
                <Zap size={14} style={{ color: T.accent }} strokeWidth={2.4} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: T.accent,
                  }}
                >
                  Admin · LLM Usage · Token Stream
                </span>
                {/* Live badge */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: T.success,
                    background: 'rgba(61,220,151,0.12)',
                    border: '1px solid rgba(61,220,151,0.30)',
                    borderRadius: 999,
                    padding: '3px 8px',
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: T.success,
                      animation: 'livePulse 1.4s ease-in-out infinite',
                    }}
                  />
                  Live simulation
                </span>
              </div>
              <h1
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                Token Stream
              </h1>
              <p style={{ fontSize: 13, color: T.dim, marginTop: 5, maxWidth: 560 }}>
                Live token consumption flowing through Gemini → Claude → Static into the monthly budget
                reservoir · mock data simulated client-side · 31 May 2026
              </p>
            </div>

            {/* Pause/Play toggle */}
            <motion.button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 18px',
                borderRadius: 10,
                border: `1px solid ${playing ? T.accent + '66' : T.border}`,
                background: playing
                  ? `linear-gradient(135deg, ${T.accent}22, rgba(0,0,0,0.1))`
                  : T.glass,
                color: playing ? T.accent : T.dim,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                appearance: 'none',
              }}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.96 }}
            >
              {playing ? (
                <>
                  <Pause size={14} strokeWidth={2.4} />
                  Pause stream
                </>
              ) : (
                <>
                  <Play size={14} strokeWidth={2.4} />
                  Resume stream
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* ── Big token ticker ─────────────────────────────────────────────── */}
        <motion.div variants={sectionVariants}>
          <div
            style={{
              ...glassBox({
                padding: '20px 26px',
                background: `linear-gradient(135deg, ${T.accent}14, rgba(255,255,255,0.03))`,
                borderColor: `${T.accent}44`,
              }),
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              flexWrap: 'wrap',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Ambient glow */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: -80,
                right: -60,
                width: 280,
                height: 280,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${T.accent}22 0%, transparent 65%)`,
                pointerEvents: 'none',
              }}
            />

            <div>
              <div style={{ ...MICRO, marginBottom: 6 }}>
                <Hash size={10} style={{ display: 'inline', marginRight: 4 }} />
                Total tokens consumed — month to date
              </div>
              <div
                style={{
                  fontSize: 52,
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  background: `linear-gradient(180deg, #fff 30%, ${T.accent})`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: T.text,
                }}
              >
                {tickerM.toFixed(3)}M
              </div>
              <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6 }}>
                {Math.round(displayTokensM * 100) / 100}M tokens · approx{' '}
                <span style={{ color: T.accentLt, fontWeight: 700 }}>
                  ${displayCost.toFixed(2)}
                </span>{' '}
                spent
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
                alignSelf: 'stretch',
                alignItems: 'center',
              }}
            >
              {[
                {
                  label: 'Requests',
                  value: Math.round(displayRequests).toLocaleString(),
                  color: T.accentLt,
                },
                {
                  label: 'Success rate',
                  value: `${successRate.toFixed(2)}%`,
                  color: T.success,
                },
                {
                  label: 'Cost / 1k req',
                  value: `$${avgCostPerReq.toFixed(3)}`,
                  color: T.warning,
                },
                {
                  label: 'Avg latency',
                  value: '384ms',
                  color: T.faint,
                },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ ...MICRO, marginBottom: 4 }}>{s.label}</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: s.color,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Stream visualizer + Budget reservoir ─────────────────────────── */}
        <motion.div variants={sectionVariants}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 16,
              alignItems: 'center',
            }}
          >
            {/* Provider nodes column */}
            <div
              style={{
                ...glassBox({ padding: '18px 16px' }),
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
                minWidth: 96,
              }}
            >
              <div style={{ ...MICRO, textAlign: 'center', marginBottom: 4 }}>
                <Activity size={9} style={{ display: 'inline', marginRight: 3 }} />
                Providers
              </div>
              {PROVIDERS.map((p) => {
                // rps estimate
                const rps = (requestCount / (30 * 24 * 3600)) * p.share;
                return (
                  <ProviderNode key={p.id} prov={p} rps={rps} active={playing} />
                );
              })}
            </div>

            {/* Stream canvas */}
            <div
              style={{
                ...glassBox({ padding: 0, overflow: 'hidden' }),
                position: 'relative',
              }}
            >
              <div style={{ padding: '12px 14px 8px' }}>
                <div style={{ ...MICRO, marginBottom: 8 }}>
                  Token flow — requests → reservoir
                  {!playing && (
                    <span
                      style={{
                        marginLeft: 10,
                        color: T.warning,
                        background: `${T.warning}18`,
                        border: `1px solid ${T.warning}44`,
                        borderRadius: 999,
                        padding: '2px 7px',
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                      }}
                    >
                      paused
                    </span>
                  )}
                </div>
                <StreamCanvas playing={playing} particles={particles} />
              </div>

              {/* Provider share bar at bottom of canvas */}
              <div
                style={{
                  padding: '10px 14px 14px',
                  borderTop: `1px solid ${T.hair}`,
                }}
              >
                <div style={{ ...MICRO, marginBottom: 8 }}>
                  Provider share · live traffic split
                </div>
                <ProviderShareBar shares={provShares} />
              </div>
            </div>

            {/* Budget reservoir */}
            <div
              style={{
                ...glassBox({ padding: '18px 14px' }),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                minWidth: 110,
              }}
            >
              <div style={{ ...MICRO, textAlign: 'center' }}>
                <DollarSign size={9} style={{ display: 'inline', marginRight: 3 }} />
                Budget
              </div>
              <BudgetGauge used={costUsed} budget={MONTHLY_BUDGET} />
              <div
                style={{
                  fontSize: 10,
                  color: T.faint,
                  textAlign: 'center',
                  lineHeight: 1.4,
                  marginTop: 4,
                }}
              >
                ${(MONTHLY_BUDGET - costUsed).toFixed(2)} remaining
                <br />
                this month
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── KPI strip ────────────────────────────────────────────────────── */}
        <motion.div variants={sectionVariants}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <KpiTile
              icon={Activity}
              label="Req / hr (est)"
              value={`${Math.round((requestCount / 30 / 24)).toLocaleString()}`}
              color={T.accent}
              sub="monthly avg rate"
            />
            <KpiTile
              icon={TrendingUp}
              label="Tokens / req (avg)"
              value={`${requestCount > 0 ? Math.round(tokensM * 1e6 / requestCount) : 0}`}
              color={T.accentLt}
              sub="all providers"
            />
            <KpiTile
              icon={Clock}
              label="p95 latency"
              value="412ms"
              color={T.success}
              sub="Gemini primary path"
            />
            <KpiTile
              icon={CheckCircle2}
              label="Success rate"
              value={`${successRate.toFixed(2)}%`}
              color={T.success}
              sub={`${(requestCount - successCount).toLocaleString()} errors`}
            />
            <KpiTile
              icon={DollarSign}
              label="Cost / M tokens"
              value={`$${tokensM > 0 ? (costUsed / tokensM).toFixed(3) : '0.000'}`}
              color={T.warning}
              sub="blended rate"
            />
          </div>
        </motion.div>

        {/* ── Live event feed + provider breakdown ─────────────────────────── */}
        <motion.div variants={sectionVariants}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 300px',
              gap: 16,
              alignItems: 'start',
            }}
          >
            {/* Event feed */}
            <div style={glassBox({ overflow: 'hidden' })}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 64px 64px 56px 44px',
                  gap: 8,
                  padding: '10px 12px 8px',
                  borderBottom: `1px solid ${T.hair}`,
                }}
              >
                {['Provider', 'Model', 'Tokens', 'Cost', 'Latency', ''].map((h) => (
                  <div key={h} style={{ ...MICRO, textAlign: h === 'Tokens' || h === 'Cost' || h === 'Latency' ? 'right' : 'left' }}>
                    {h}
                  </div>
                ))}
              </div>

              <div
                style={{
                  maxHeight: 320,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  scrollbarWidth: 'none',
                }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {events.map((ev) => (
                    <EventFeedRow key={ev.id} ev={ev} />
                  ))}
                </AnimatePresence>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  borderTop: `1px solid ${T.hair}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10.5,
                  color: T.faint,
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: playing ? T.success : T.warning,
                    animation: playing ? 'livePulse 1.4s ease-in-out infinite' : 'none',
                  }}
                />
                {playing ? 'Live feed — new events every ~1-3s (mock simulation)' : 'Stream paused — press Resume to continue'}
              </div>
            </div>

            {/* Provider breakdown card */}
            <div
              style={{
                ...glassBox({ padding: '16px' }),
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ ...MICRO }}>
                <Zap size={9} style={{ display: 'inline', marginRight: 4 }} />
                Provider breakdown
              </div>

              {PROVIDERS.map((prov, i) => {
                const share = provShares[i]?.pct ?? prov.share * 100;
                const tokForProvider = (tokenCount * (share / 100));
                const costForProvider = (tokForProvider / 1_000_000) * prov.costPerMtok;
                return (
                  <motion.div
                    key={prov.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.08, type: 'spring', stiffness: 300, damping: 26 }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: `${prov.color}0d`,
                      border: `1px solid ${prov.color}33`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                    whileHover={{ scale: 1.01, borderColor: `${prov.color}66` }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: prov.color }}>
                        {prov.label}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: T.text,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {share.toFixed(1)}%
                      </span>
                    </div>

                    {/* Share bar */}
                    <div
                      style={{
                        height: 5,
                        borderRadius: 999,
                        background: T.hair,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        style={{
                          height: '100%',
                          borderRadius: 999,
                          background: `linear-gradient(90deg, ${prov.color}cc, ${prov.color}66)`,
                        }}
                        animate={{ width: `${share}%` }}
                        transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 6,
                      }}
                    >
                      {[
                        { k: 'Tokens', v: tokForProvider >= 1e6 ? `${(tokForProvider / 1e6).toFixed(2)}M` : `${(tokForProvider / 1e3).toFixed(0)}k` },
                        { k: 'Cost', v: prov.id === 'static' ? '$0.00' : `$${costForProvider.toFixed(2)}` },
                        { k: 'p95 lat', v: `${prov.p95ms}ms` },
                        { k: 'Success', v: `${(prov.successRate * 100).toFixed(1)}%` },
                      ].map((s) => (
                        <div key={s.k}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.faint, marginBottom: 2 }}>
                            {s.k}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                            {s.v}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Priority note */}
                    {prov.id === 'gemini' && (
                      <div
                        style={{
                          fontSize: 9.5,
                          color: prov.color,
                          background: `${prov.color}14`,
                          border: `1px solid ${prov.color}33`,
                          borderRadius: 6,
                          padding: '3px 8px',
                          fontWeight: 600,
                        }}
                      >
                        Primary provider — first in routing chain
                      </div>
                    )}
                    {prov.id === 'claude' && (
                      <div
                        style={{
                          fontSize: 9.5,
                          color: T.accentLt,
                          background: `${T.accentLt}14`,
                          border: `1px solid ${T.accentLt}33`,
                          borderRadius: 6,
                          padding: '3px 8px',
                          fontWeight: 600,
                        }}
                      >
                        Fallback — activates when Gemini unavailable
                      </div>
                    )}
                    {prov.id === 'static' && (
                      <div
                        style={{
                          fontSize: 9.5,
                          color: T.faint,
                          background: 'rgba(255,255,255,0.05)',
                          border: `1px solid ${T.hair}`,
                          borderRadius: 6,
                          padding: '3px 8px',
                          fontWeight: 600,
                        }}
                      >
                        Last resort — zero cost, no LLM
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {/* Routing note */}
              <div
                style={{
                  fontSize: 10.5,
                  color: T.faint,
                  lineHeight: 1.5,
                  padding: '8px 10px',
                  background: T.hair,
                  borderRadius: 8,
                }}
              >
                Routing priority: <span style={{ color: T.accentLt }}>Gemini</span> →{' '}
                <span style={{ color: T.accent }}>Claude</span> →{' '}
                <span style={{ color: T.ghost }}>Static</span>. Fallback triggered on provider error or timeout.
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Footer note ──────────────────────────────────────────────────── */}
        <motion.div variants={sectionVariants}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: T.faint,
            }}
          >
            <Activity size={11} style={{ color: T.accent }} />
            Token stream is mock data simulated client-side. Build this design to wire it to{' '}
            <code
              style={{
                background: T.hair,
                borderRadius: 4,
                padding: '1px 5px',
                fontSize: 10.5,
                color: T.accentLt,
              }}
            >
              /admin/llm-usage
            </code>{' '}
            real backend data.
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

export default AdmLlmL3Stream;
