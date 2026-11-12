/**
 * Admin System Health Design Candidate: H5 Topology Map
 *
 * "Topology Map" — an architecture/data-flow graph of the WarmPulse backend.
 * Nodes = API, Celery Worker, Celery Beat, Postgres, Redis, SMTP Send, IMAP
 * Poll, and Client/LB ingress. Edges show data flow with animated dash/pulse
 * strokes. Node colour = health (green/orange/red); Worker queue is degraded.
 * Click a node → detail panel updates with per-subsystem metrics.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features / @/lib imports.
 * All styling inline style={{}}. Mock data only.
 * Warm Aurora Glass: glass rgba(255,255,255,0.05) + blur(10px). Accent orange
 * #F26522→#FF8A4B. Green/orange/red health semantics. NO purple/blue/teal/cyan.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Mail,
  Network,
  Server,
  Workflow,
  Zap,
} from 'lucide-react';

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  text:        '#ffffff',
  dim:         'rgba(255,255,255,0.62)',
  faint:       'rgba(255,255,255,0.42)',
  ghost:       'rgba(255,255,255,0.18)',
  hairline:    'rgba(255,255,255,0.08)',
  accent:      '#F26522',
  accentB:     '#FF8A4B',
  success:     '#3ddc97',
  successDim:  'rgba(61,220,151,0.18)',
  warning:     '#FF8A4B',
  warningDim:  'rgba(255,138,75,0.18)',
  danger:      '#ff5c7a',
  dangerDim:   'rgba(255,92,122,0.18)',
  glass:       'rgba(255,255,255,0.05)',
  glass2:      'rgba(255,255,255,0.09)',
  border:      'rgba(255,255,255,0.10)',
  borderSoft:  'rgba(255,255,255,0.06)',
} as const;

const GLASS: CSSProperties = {
  background:           C.glass,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius:         16,
};

const GLASS_TIGHT: CSSProperties = {
  background:           C.glass,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius:         10,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Health = 'ok' | 'warn' | 'critical';

interface NodeDef {
  id: string;
  label: string;
  sublabel: string;
  health: Health;
  cx: number;   // SVG coord (0–600)
  cy: number;
  group: 'ingress' | 'app' | 'queue' | 'storage' | 'external';
  metrics: {
    status: string;
    p95ms: number;
    throughput: string;
    queueDepth?: number;
    lastError: string;
    uptime: string;
  };
  detail: string;
}

interface EdgeDef {
  from: string;
  to: string;
  label?: string;
  /** dash animation offset direction — positive = forward, negative = reverse */
  dir?: 1 | -1;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const NODES: NodeDef[] = [
  {
    id: 'lb',
    label: 'Client / LB',
    sublabel: 'Nginx :443',
    health: 'ok',
    cx: 300, cy: 48,
    group: 'ingress',
    metrics: {
      status: 'Operational',
      p95ms: 4,
      throughput: '2 340 req/min',
      lastError: 'None in 72 h',
      uptime: '99.99 %',
    },
    detail: 'Nginx TLS termination + static asset serving. Host-network mode; forwards to FastAPI :8001. No SSL errors in 72 h.',
  },
  {
    id: 'api',
    label: 'API',
    sublabel: 'FastAPI :8001',
    health: 'ok',
    cx: 300, cy: 168,
    group: 'app',
    metrics: {
      status: 'Operational',
      p95ms: 38,
      throughput: '2 288 req/min',
      lastError: 'None in 18 h',
      uptime: '99.97 %',
    },
    detail: 'Uvicorn async workers. JWT auth + Fernet credential decrypt on every /send. Rate-limiter via Redis token-bucket. No 5xx in past hour.',
  },
  {
    id: 'beat',
    label: 'Celery Beat',
    sublabel: 'Scheduler',
    health: 'ok',
    cx: 120, cy: 288,
    group: 'queue',
    metrics: {
      status: 'Operational',
      p95ms: 1,
      throughput: '7 tasks dispatched/min',
      lastError: 'None in 48 h',
      uptime: '100 %',
    },
    detail: 'Beat scheduler drives 7 periodic tasks: warmup-outbound (15 min), inbound (3 min), peer-rotation (1 h), ramp-advance (daily), rollup (daily), alert-check (1 h), heartbeat (1 min). Last tick 42 s ago.',
  },
  {
    id: 'worker',
    label: 'Celery Worker',
    sublabel: 'default + smtp queues',
    health: 'warn',
    cx: 480, cy: 288,
    group: 'queue',
    metrics: {
      status: 'Degraded — queue backlog',
      p95ms: 1840,
      throughput: '48 tasks/min',
      queueDepth: 217,
      lastError: 'SMTP timeout x3 (8 min ago)',
      uptime: '99.81 %',
    },
    detail: 'Single process consuming default + smtp queues. smtp queue backlog: 217 (normal < 50). 3 SMTP timeouts toward yahoo.com peer in last 10 min — circuit-breaker not yet tripped. p95 task latency elevated at 1.84 s.',
  },
  {
    id: 'redis',
    label: 'Redis',
    sublabel: ':6380',
    health: 'ok',
    cx: 120, cy: 408,
    group: 'storage',
    metrics: {
      status: 'Operational',
      p95ms: 0.6,
      throughput: '12 400 ops/min',
      lastError: 'None in 7 d',
      uptime: '100 %',
    },
    detail: 'Shared Redis; key-prefix warmpulse: isolates tenant keys. Used by Celery broker, rate-limiter, and beat schedule. Memory usage 18 % of 1 GB limit. No evictions.',
  },
  {
    id: 'postgres',
    label: 'Postgres',
    sublabel: ':5433',
    health: 'ok',
    cx: 480, cy: 408,
    group: 'storage',
    metrics: {
      status: 'Operational',
      p95ms: 2.4,
      throughput: '3 100 queries/min',
      lastError: 'None in 7 d',
      uptime: '100 %',
    },
    detail: 'Single docker-compose service on host network. UUIDs everywhere, timezone-aware timestamps. Indexes on warmup_logs(mailbox_id, created_at DESC) and partial peer_inboxes(is_active=true). No long-running queries.',
  },
  {
    id: 'smtp',
    label: 'SMTP Send',
    sublabel: 'Outbound warmup',
    health: 'warn',
    cx: 150, cy: 528,
    group: 'external',
    metrics: {
      status: 'Partial — 3 timeouts',
      p95ms: 1100,
      throughput: '184 emails/min',
      lastError: 'Timeout: yahoo-peer-07 8 min ago',
      uptime: '98.3 %',
    },
    detail: 'smtp_sender.send_email fans out per active mailbox. Pairing: workspace pool → default pool → reputation-weighted random; 24 h dedup. 3 Yahoo peer timeouts; other providers nominal. Fernet creds decrypted inline, re-bound to REDACTED after send.',
  },
  {
    id: 'imap',
    label: 'IMAP Poll',
    sublabel: 'Engagement signals',
    health: 'ok',
    cx: 450, cy: 528,
    group: 'external',
    metrics: {
      status: 'Operational',
      p95ms: 420,
      throughput: '62 polls/min',
      lastError: 'None in 4 h',
      uptime: '99.6 %',
    },
    detail: 'imap_watcher.py polls peer inboxes for open/reply/star/spam-rescue signals. Signals feed warmup_logs(direction=inbound). Peer reputation recomputed hourly from 24 h signal-vs-bounce ratio; below 0.3 → deactivated.',
  },
];

const EDGES: EdgeDef[] = [
  { from: 'lb',     to: 'api',     label: 'HTTPS' },
  { from: 'api',    to: 'beat',    label: 'schedule read' },
  { from: 'api',    to: 'worker',  label: 'enqueue task' },
  { from: 'beat',   to: 'redis',   label: 'broker' },
  { from: 'worker', to: 'redis',   label: 'broker / rate' },
  { from: 'api',    to: 'postgres',label: 'queries' },
  { from: 'worker', to: 'postgres',label: 'write logs' },
  { from: 'worker', to: 'smtp',    label: 'send warmup' },
  { from: 'worker', to: 'imap',    label: 'poll signals' },
  { from: 'beat',   to: 'worker',  label: 'fan-out', dir: 1 },
];

// ─── Derived helpers ──────────────────────────────────────────────────────────

function healthColor(h: Health): string {
  if (h === 'ok')       return C.success;
  if (h === 'warn')     return C.warning;
  return C.danger;
}

function healthDim(h: Health): string {
  if (h === 'ok')       return C.successDim;
  if (h === 'warn')     return C.warningDim;
  return C.dangerDim;
}

function healthLabel(h: Health): string {
  if (h === 'ok')       return 'Operational';
  if (h === 'warn')     return 'Degraded';
  return 'Critical';
}

function nodeById(id: string): NodeDef | undefined {
  return NODES.find((n) => n.id === id);
}

function groupColor(g: NodeDef['group']): string {
  if (g === 'ingress')  return C.accentB;
  if (g === 'app')      return C.accent;
  if (g === 'queue')    return '#c8944a';
  if (g === 'storage')  return '#a0956b';
  return '#8a8a8a';
}

// ─── SVG Topology ─────────────────────────────────────────────────────────────

const SVG_W = 600;
const SVG_H = 600;
const NODE_R = 36;

function computeEdgePath(from: NodeDef, to: NodeDef): string {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;
  const x1 = from.cx + ux * NODE_R;
  const y1 = from.cy + uy * NODE_R;
  const x2 = to.cx - ux * NODE_R;
  const y2 = to.cy - uy * NODE_R;

  // Slight curve via mid-control point offset
  const mx = (x1 + x2) / 2 - uy * 18;
  const my = (y1 + y2) / 2 + ux * 18;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

function edgeIsWarn(e: EdgeDef): boolean {
  const f = nodeById(e.from);
  const t = nodeById(e.to);
  if (!f || !t) return false;
  return f.health !== 'ok' || t.health !== 'ok';
}

function edgeStroke(e: EdgeDef): string {
  if (edgeIsWarn(e)) return C.warning;
  return 'rgba(255,255,255,0.22)';
}

// NodeIcon maps group to lucide component
function NodeIcon({ node, size }: { node: NodeDef; size: number }) {
  const col = healthColor(node.health);
  const props = { size, color: col, strokeWidth: 1.8 };
  if (node.id === 'lb')     return <Network {...props} />;
  if (node.id === 'api')    return <Server {...props} />;
  if (node.id === 'beat')   return <CalendarClock {...props} />;
  if (node.id === 'worker') return <Cpu {...props} />;
  if (node.id === 'redis')  return <HardDrive {...props} />;
  if (node.id === 'postgres') return <Database {...props} />;
  if (node.id === 'smtp')   return <Mail {...props} />;
  if (node.id === 'imap')   return <Workflow {...props} />;
  return <Activity {...props} />;
}

// ─── Animation keyframe injection ─────────────────────────────────────────────

function useKeyframes() {
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    const id = 'h5-topology-kf';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      @keyframes h5-dash-fwd {
        from { stroke-dashoffset: 0; }
        to   { stroke-dashoffset: -60; }
      }
      @keyframes h5-dash-rev {
        from { stroke-dashoffset: 0; }
        to   { stroke-dashoffset: 60; }
      }
      @keyframes h5-pulse-dot {
        0%   { opacity: 1; r: 4px; }
        70%  { opacity: 0; r: 9px; }
        100% { opacity: 0; r: 4px; }
      }
      @keyframes h5-glow-ring {
        0%, 100% { opacity: 0.35; r: 38px; }
        50%       { opacity: 0.08; r: 44px; }
      }
      @keyframes h5-node-sel {
        0%, 100% { opacity: 0.6; }
        50%       { opacity: 1; }
      }
    `;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);
}

// ─── Topology SVG component ────────────────────────────────────────────────────

function TopologySVG({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
      aria-label="System topology map"
    >
      {/* Defs: arrowhead markers */}
      <defs>
        <marker
          id="arr-ok"
          markerWidth="7" markerHeight="7"
          refX="5" refY="3.5"
          orient="auto"
        >
          <polyline
            points="0,0 5,3.5 0,7"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.2"
          />
        </marker>
        <marker
          id="arr-warn"
          markerWidth="7" markerHeight="7"
          refX="5" refY="3.5"
          orient="auto"
        >
          <polyline
            points="0,0 5,3.5 0,7"
            fill="none"
            stroke={C.warning}
            strokeWidth="1.2"
          />
        </marker>
        {/* Subtle radial gradient for node bodies */}
        {NODES.map((n) => (
          <radialGradient key={`rg-${n.id}`} id={`rg-${n.id}`} cx="50%" cy="35%" r="60%">
            <stop offset="0%"   stopColor={healthColor(n.health)} stopOpacity={0.22} />
            <stop offset="100%" stopColor={healthColor(n.health)} stopOpacity={0.06} />
          </radialGradient>
        ))}
      </defs>

      {/* ── Edges ── */}
      {EDGES.map((e) => {
        const from = nodeById(e.from);
        const to   = nodeById(e.to);
        if (!from || !to) return null;
        const d    = computeEdgePath(from, to);
        const warn = edgeIsWarn(e);
        const stroke = edgeStroke(e);
        const markId = warn ? 'arr-warn' : 'arr-ok';
        const animName = (e.dir ?? 1) > 0 ? 'h5-dash-fwd' : 'h5-dash-rev';
        const speed = warn ? '1.2s' : '2.2s';
        return (
          <g key={`${e.from}-${e.to}`}>
            {/* Base path */}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={warn ? 1.6 : 1.2}
              strokeOpacity={warn ? 0.7 : 0.45}
              markerEnd={`url(#${markId})`}
            />
            {/* Animated dash overlay */}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={warn ? 2.2 : 1.8}
              strokeDasharray="8 10"
              strokeLinecap="round"
              style={{
                animation: `${animName} ${speed} linear infinite`,
                opacity: warn ? 0.9 : 0.5,
              }}
            />
            {/* Edge label */}
            {e.label && (() => {
              const mx = (from.cx + to.cx) / 2;
              const my = (from.cy + to.cy) / 2;
              return (
                <text
                  x={mx}
                  y={my - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill={warn ? C.warning : C.faint}
                  fontFamily="ui-monospace, monospace"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {e.label}
                </text>
              );
            })()}
          </g>
        );
      })}

      {/* ── Nodes ── */}
      {NODES.map((n) => {
        const isSel = selected === n.id;
        const hc    = healthColor(n.health);
        const gc    = groupColor(n.group);
        return (
          <g
            key={n.id}
            transform={`translate(${n.cx},${n.cy})`}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(n.id)}
            role="button"
            aria-label={`${n.label} — ${healthLabel(n.health)}`}
          >
            {/* Selection halo (animated when selected) */}
            {isSel && (
              <circle
                r={NODE_R + 10}
                fill="none"
                stroke={hc}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                style={{ animation: 'h5-node-sel 1.4s ease-in-out infinite', opacity: 0.7 }}
              />
            )}
            {/* Glow ring (health pulse) */}
            <circle
              r={NODE_R + 4}
              fill={healthDim(n.health)}
              style={{ animation: 'h5-glow-ring 3s ease-in-out infinite', animationDelay: `${NODES.indexOf(n) * 0.4}s` }}
            />
            {/* Node body */}
            <circle
              r={NODE_R}
              fill={`url(#rg-${n.id})`}
              stroke={hc}
              strokeWidth={isSel ? 2.5 : 1.5}
            />
            {/* Inner circle (glass surface) */}
            <circle
              r={NODE_R - 2}
              fill="rgba(0,0,0,0.35)"
              stroke="none"
            />
            {/* Group accent stripe */}
            <circle
              r={NODE_R - 2}
              fill="none"
              stroke={gc}
              strokeWidth={2}
              strokeDasharray={`${Math.PI * (NODE_R - 2) * 0.25} ${Math.PI * (NODE_R - 2) * 0.75}`}
              strokeDashoffset={-Math.PI * (NODE_R - 2) * 0.1}
              opacity={0.45}
            />
            {/* Health dot (top-right) */}
            <circle
              cx={NODE_R - 8}
              cy={-(NODE_R - 8)}
              r={5}
              fill={hc}
              stroke="rgba(0,0,0,0.6)"
              strokeWidth={1.5}
            />
            {n.health === 'warn' && (
              <circle
                cx={NODE_R - 8}
                cy={-(NODE_R - 8)}
                r={5}
                fill="none"
                stroke={hc}
                strokeWidth={2}
                style={{ animation: 'h5-pulse-dot 2s ease-out infinite' }}
              />
            )}

            {/* Lucide icon — rendered as foreignObject for simplicity */}
            <foreignObject
              x={-14} y={-22}
              width={28} height={28}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                }}
              >
                <NodeIcon node={n} size={18} />
              </div>
            </foreignObject>

            {/* Node label below icon */}
            <text
              y={10}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              fill={C.text}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {n.label}
            </text>
            <text
              y={21}
              textAnchor="middle"
              fontSize={7.5}
              fill={C.faint}
              fontFamily="ui-monospace, monospace"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {n.sublabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Metric pill ──────────────────────────────────────────────────────────────

function MetricPill({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        ...GLASS_TIGHT,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        flex: '1 1 0',
        minWidth: 100,
      }}
    >
      <span style={{ fontSize: 10, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ fontSize: 18, fontWeight: 700, color: accent ?? C.text, lineHeight: 1.1 }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 10, color: C.dim }}>{sub}</span>
      )}
    </div>
  );
}

// ─── Node detail panel ────────────────────────────────────────────────────────

function NodeDetail({ node }: { node: NodeDef }) {
  const hc = healthColor(node.health);
  const hd = healthDim(node.health);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div
        style={{
          ...GLASS,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: hd,
            border: `1.5px solid ${hc}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <NodeIcon node={node} size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{node.label}</span>
            <span
              style={{
                background: hd,
                border: `1px solid ${hc}`,
                color: hc,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                borderRadius: 6,
                padding: '2px 7px',
              }}
            >
              {healthLabel(node.health)}
            </span>
          </div>
          <span style={{ fontSize: 11, color: C.faint, fontFamily: 'ui-monospace, monospace' }}>
            {node.sublabel}
          </span>
        </div>
      </div>

      {/* Metrics grid */}
      <div
        style={{
          ...GLASS,
          padding: '14px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        {[
          { k: 'Status',     v: node.metrics.status,     c: hc },
          { k: 'Uptime',     v: node.metrics.uptime },
          { k: 'p95 Latency',v: `${node.metrics.p95ms} ms` },
          { k: 'Throughput', v: node.metrics.throughput },
          ...(node.metrics.queueDepth !== undefined
            ? [{ k: 'Queue Depth', v: String(node.metrics.queueDepth), c: C.warning }]
            : []),
          { k: 'Last Error', v: node.metrics.lastError, c: C.faint },
        ].map((item) => (
          <div key={item.k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {item.k}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: item.c ?? C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>
              {item.v}
            </span>
          </div>
        ))}
      </div>

      {/* Detail prose */}
      <div
        style={{
          ...GLASS,
          padding: '12px 16px',
        }}
      >
        <span style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
          Notes
        </span>
        <p style={{ margin: 0, fontSize: 11.5, color: C.dim, lineHeight: 1.6 }}>
          {node.detail}
        </p>
      </div>
    </div>
  );
}

// ─── No-selection placeholder ─────────────────────────────────────────────────

function SelectPrompt() {
  return (
    <div
      style={{
        ...GLASS,
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        textAlign: 'center',
      }}
    >
      <Zap size={28} color={C.accent} strokeWidth={1.5} />
      <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Select a node</span>
      <span style={{ fontSize: 12, color: C.dim, maxWidth: 200 }}>
        Click any component in the topology graph to inspect its live metrics.
      </span>
    </div>
  );
}

// ─── Overall health banner ────────────────────────────────────────────────────

function OverallBanner() {
  const degraded = NODES.filter((n) => n.health !== 'ok');
  const critical = NODES.filter((n) => n.health === 'critical');
  const status   = critical.length > 0 ? 'critical' : degraded.length > 0 ? 'warn' : 'ok';
  const hc       = healthColor(status);
  const hd       = healthDim(status);

  const Icon = status === 'ok' ? CheckCircle2 : status === 'warn' ? AlertTriangle : AlertTriangle;
  const label = status === 'ok' ? 'All Systems Operational' : `${degraded.length} Subsystem${degraded.length > 1 ? 's' : ''} Degraded`;

  return (
    <div
      style={{
        ...GLASS,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderColor: hc,
        background: hd,
        flexWrap: 'wrap',
      }}
    >
      <Icon size={20} color={hc} strokeWidth={2} />
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{label}</span>
        {degraded.length > 0 && (
          <span style={{ fontSize: 11, color: C.dim, marginLeft: 10 }}>
            Affected: {degraded.map((n) => n.label).join(', ')}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={12} color={C.faint} />
        <span style={{ fontSize: 10, color: C.faint }}>as of {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { label: 'Operational', color: C.success },
    { label: 'Degraded',    color: C.warning },
    { label: 'Critical',    color: C.danger },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
          <span style={{ fontSize: 10, color: C.faint }}>{item.label}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 18, height: 1.5, background: `repeating-linear-gradient(to right, ${C.warning} 0 5px, transparent 5px 10px)` }} />
        <span style={{ fontSize: 10, color: C.faint }}>Degraded flow</span>
      </div>
    </div>
  );
}

// ─── Bottom metric strip ──────────────────────────────────────────────────────

function MetricStrip() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <MetricPill label="smtp queue"    value="217"    sub="tasks pending" accent={C.warning} />
      <MetricPill label="Workers"       value="1"      sub="consuming both queues" />
      <MetricPill label="Beat tick"     value="42 s"   sub="last heartbeat ago" />
      <MetricPill label="Error rate"    value="0.04 %" sub="last 15 min" />
      <MetricPill label="p95 API"       value="38 ms"  sub="last hour" accent={C.success} />
      <MetricPill label="Emails/min"    value="184"    sub="outbound warmup" />
      <MetricPill label="Active peers"  value="312"    sub="inboxes" />
      <MetricPill label="Peer rep ≥0.3" value="98.7 %" sub="healthy ratio" accent={C.success} />
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function AdmHlthH5Topology() {
  useKeyframes();
  const [selected, setSelected] = useState<string | null>(null);
  const selectedNode = selected !== null ? nodeById(selected) ?? null : null;

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '24px 24px 40px',
        boxSizing: 'border-box',
        color: C.text,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Activity size={18} color={C.accent} strokeWidth={2} />
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
              System Topology
            </h1>
            <span
              style={{
                background: C.warningDim,
                border: `1px solid ${C.warning}`,
                color: C.warning,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                borderRadius: 6,
                padding: '2px 8px',
              }}
            >
              1 Degraded
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: C.faint }}>
            Live architecture graph · click a node to inspect
          </p>
        </div>
        <Legend />
      </div>

      {/* Overall status banner */}
      <OverallBanner />

      {/* Main layout: graph + detail panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) 320px',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* Topology graph */}
        <div
          style={{
            ...GLASS,
            padding: 0,
            position: 'relative',
            overflow: 'hidden',
            aspectRatio: '1 / 1',
            maxHeight: 620,
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          {/* subtle grid pattern */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative', width: '100%', padding: 12 }}>
            <TopologySVG selected={selected} onSelect={setSelected} />
          </div>
        </div>

        {/* Right panel: detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Node detail or prompt */}
          {selectedNode !== null ? (
            <NodeDetail node={selectedNode} />
          ) : (
            <SelectPrompt />
          )}

          {/* System overview mini-list */}
          <div style={{ ...GLASS, padding: '14px 16px' }}>
            <span style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 10 }}>
              All Components
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {NODES.map((n) => {
                const hc = healthColor(n.health);
                const isSel = selected === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => setSelected(n.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: isSel ? `1px solid ${hc}` : `1px solid ${C.borderSoft}`,
                      background: isSel ? healthDim(n.health) : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: hc,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, color: C.text, flex: 1, fontWeight: isSel ? 700 : 400 }}>
                      {n.label}
                    </span>
                    <span style={{ fontSize: 9, color: hc, fontWeight: 600 }}>
                      {healthLabel(n.health)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom metric strip */}
      <MetricStrip />
    </div>
  );
}
