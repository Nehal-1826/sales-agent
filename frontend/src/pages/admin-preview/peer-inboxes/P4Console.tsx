/**
 * Admin Peer Inboxes Design Candidate: P4 Ops Console
 *
 * "Ops Console" — operations-focused: triage by health state, reputation
 * leaderboard with sparklines, selectable peer list with checkbox bulk-actions,
 * provider/capacity summary stats. Dark Aurora Glass aesthetic; accent orange
 * #F26522 → #FF8A4B; success green; danger red; warning orange.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only. Warm/neutral palette only.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Download,
  Filter,
  Inbox,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Upload,
  XCircle,
  Zap,
  Activity,
  Server,
} from 'lucide-react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
} from 'recharts';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const C = {
  text:        '#ffffff',
  dim:         'rgba(255,255,255,0.62)',
  faint:       'rgba(255,255,255,0.40)',
  ghost:       'rgba(255,255,255,0.20)',
  accent:      '#F26522',
  accent2:     '#FF8A4B',
  success:     '#3ddc97',
  danger:      '#ff5c7a',
  warning:     '#FF8A4B',
  glass:       'rgba(255,255,255,0.05)',
  glass2:      'rgba(255,255,255,0.08)',
  glass3:      'rgba(255,255,255,0.03)',
  border:      'rgba(255,255,255,0.10)',
  borderSoft:  'rgba(255,255,255,0.06)',
  surface:     'rgba(26,18,10,0.80)',
} as const;

const GLASS: React.CSSProperties = {
  background:           C.glass,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius:         16,
};

const GLASS2: React.CSSProperties = {
  background:           C.glass2,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  borderRadius:         12,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Provider   = 'gmail' | 'outlook' | 'yahoo';
type HealthState = 'healthy' | 'at-risk' | 'cooling';
type PeerStatus  = 'active' | 'warming' | 'degraded' | 'offline';

interface SparkPoint {
  v: number;
}

interface PeerRow {
  id:         string;
  email:      string;
  provider:   Provider;
  pool:       string | null;
  status:     PeerStatus;
  health:     HealthState;
  rep:        number;
  repDelta:   number; // 24 h change
  sends24h:   number;
  bounces24h: number;
  lastSeen:   string;
  spark:      SparkPoint[];
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function genSpark(base: number, trend: 'up' | 'down' | 'flat', n = 14): SparkPoint[] {
  let v = base;
  return Array.from({ length: n }, () => {
    const direction = trend === 'up' ? 0.55 : trend === 'down' ? 0.45 : 0.5;
    v = Math.max(0, Math.min(1, v + (Math.random() - direction) * 0.04));
    return { v: +v.toFixed(3) };
  });
}

const PEERS: PeerRow[] = [
  { id: 'p01', email: 'pulse.warm.01@gmail.com',   provider: 'gmail',   pool: 'Default-A',    status: 'active',   health: 'healthy',  rep: 0.94, repDelta: +0.03, sends24h: 142, bounces24h: 0, lastSeen: '1 min ago', spark: genSpark(0.91, 'up')   },
  { id: 'p02', email: 'pulse.warm.02@gmail.com',   provider: 'gmail',   pool: 'Default-A',    status: 'active',   health: 'healthy',  rep: 0.92, repDelta: +0.02, sends24h: 128, bounces24h: 1, lastSeen: '2 min ago', spark: genSpark(0.90, 'up')   },
  { id: 'p03', email: 'pulse.warm.03@outlook.com', provider: 'outlook', pool: 'Enterprise-B', status: 'active',   health: 'healthy',  rep: 0.89, repDelta: -0.01, sends24h: 118, bounces24h: 1, lastSeen: '3 min ago', spark: genSpark(0.90, 'flat') },
  { id: 'p04', email: 'pulse.warm.04@gmail.com',   provider: 'gmail',   pool: 'Default-A',    status: 'active',   health: 'healthy',  rep: 0.87, repDelta: +0.04, sends24h: 156, bounces24h: 0, lastSeen: '1 min ago', spark: genSpark(0.83, 'up')   },
  { id: 'p05', email: 'pulse.warm.05@yahoo.com',   provider: 'yahoo',   pool: 'Burst-C',      status: 'active',   health: 'healthy',  rep: 0.83, repDelta: +0.01, sends24h: 98,  bounces24h: 2, lastSeen: '5 min ago', spark: genSpark(0.82, 'up')   },
  { id: 'p06', email: 'pulse.warm.06@outlook.com', provider: 'outlook', pool: 'Enterprise-B', status: 'warming',  health: 'healthy',  rep: 0.78, repDelta: +0.05, sends24h: 64,  bounces24h: 0, lastSeen: '4 min ago', spark: genSpark(0.73, 'up')   },
  { id: 'p07', email: 'pulse.warm.07@gmail.com',   provider: 'gmail',   pool: null,           status: 'warming',  health: 'cooling',  rep: 0.76, repDelta: +0.06, sends24h: 52,  bounces24h: 1, lastSeen: '12 min ago',spark: genSpark(0.70, 'up')   },
  { id: 'p08', email: 'pulse.warm.08@yahoo.com',   provider: 'yahoo',   pool: 'Burst-C',      status: 'warming',  health: 'cooling',  rep: 0.71, repDelta: -0.02, sends24h: 88,  bounces24h: 2, lastSeen: '8 min ago', spark: genSpark(0.73, 'down') },
  { id: 'p09', email: 'pulse.warm.09@gmail.com',   provider: 'gmail',   pool: 'Default-A',    status: 'degraded', health: 'at-risk',  rep: 0.61, repDelta: -0.04, sends24h: 36,  bounces24h: 5, lastSeen: '22 min ago',spark: genSpark(0.65, 'down') },
  { id: 'p10', email: 'pulse.warm.10@outlook.com', provider: 'outlook', pool: 'Enterprise-B', status: 'degraded', health: 'at-risk',  rep: 0.55, repDelta: -0.08, sends24h: 44,  bounces24h: 7, lastSeen: '18 min ago',spark: genSpark(0.63, 'down') },
  { id: 'p11', email: 'pulse.warm.11@gmail.com',   provider: 'gmail',   pool: null,           status: 'degraded', health: 'at-risk',  rep: 0.42, repDelta: -0.12, sends24h: 18,  bounces24h: 9, lastSeen: '35 min ago',spark: genSpark(0.54, 'down') },
  { id: 'p12', email: 'pulse.warm.12@yahoo.com',   provider: 'yahoo',   pool: null,           status: 'offline',  health: 'at-risk',  rep: 0.00, repDelta: -0.45, sends24h: 0,   bounces24h: 0, lastSeen: '4h ago',    spark: genSpark(0.45, 'down') },
  { id: 'p13', email: 'pulse.warm.13@gmail.com',   provider: 'gmail',   pool: 'Default-A',    status: 'active',   health: 'healthy',  rep: 0.85, repDelta: +0.01, sends24h: 110, bounces24h: 1, lastSeen: '2 min ago', spark: genSpark(0.84, 'flat') },
  { id: 'p14', email: 'pulse.warm.14@outlook.com', provider: 'outlook', pool: 'Enterprise-B', status: 'active',   health: 'cooling',  rep: 0.74, repDelta: -0.03, sends24h: 76,  bounces24h: 3, lastSeen: '6 min ago', spark: genSpark(0.77, 'down') },
  { id: 'p15', email: 'pulse.warm.15@yahoo.com',   provider: 'yahoo',   pool: 'Burst-C',      status: 'active',   health: 'healthy',  rep: 0.88, repDelta: +0.02, sends24h: 130, bounces24h: 0, lastSeen: '3 min ago', spark: genSpark(0.86, 'up')   },
];

const PROVIDER_ICON: Record<Provider, string> = {
  gmail:   'G',
  outlook: 'O',
  yahoo:   'Y',
};

// Neutral provider glyph colors (warm/neutral palette only — no off-palette provider brand colors)
const PROVIDER_GLYPH_COLOR: Record<Provider, string> = {
  gmail:   C.warning,
  outlook: C.dim,
  yahoo:   C.faint,
};

function repColor(rep: number): string {
  if (rep >= 0.85) return C.success;
  if (rep >= 0.70) return C.accent2;
  if (rep >= 0.50) return C.warning;
  if (rep >  0)    return C.danger;
  return C.ghost;
}

function healthColor(h: HealthState): string {
  if (h === 'healthy')  return C.success;
  if (h === 'cooling')  return C.warning;
  return C.danger;
}

// ---------------------------------------------------------------------------
// Sparkline tooltip (typed, safe)
// ---------------------------------------------------------------------------

function SparkTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.border}`,
      borderRadius: 6,
      padding:      '3px 7px',
      fontSize:     10,
      color:        C.dim,
      fontFamily:   'system-ui,sans-serif',
    }}>
      rep {(val as number).toFixed(2)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline sparkline component
// ---------------------------------------------------------------------------

interface MiniSparkProps {
  data:  SparkPoint[];
  color: string;
}

function MiniSpark({ data, color }: MiniSparkProps) {
  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Tooltip content={<SparkTooltip />} />
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label:    string;
  value:    string | number;
  sub?:     string;
  accent?:  string;
  icon:     React.ReactNode;
}

function StatCard({ label, value, sub, accent, icon }: StatCardProps) {
  return (
    <div style={{
      ...GLASS,
      padding:        '14px 18px',
      display:        'flex',
      flexDirection:  'column',
      gap:            4,
      position:       'relative',
      overflow:       'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.faint, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ color: accent ?? C.faint, opacity: 0.7 }}>{icon}</span>
      </div>
      <span style={{ fontSize: 26, fontWeight: 700, color: accent ?? C.text, lineHeight: 1.1 }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: C.faint }}>{sub}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Triage summary section
// ---------------------------------------------------------------------------

interface TriageGroupProps {
  health:    HealthState;
  peers:     PeerRow[];
  expanded:  boolean;
  onToggle:  () => void;
}

function TriageGroup({ health, peers, expanded, onToggle }: TriageGroupProps) {
  const color = healthColor(health);
  const label = health === 'healthy' ? 'Healthy' : health === 'at-risk' ? 'At risk' : 'Cooling down';
  const bg    = health === 'at-risk'
    ? 'rgba(255,92,122,0.06)'
    : health === 'cooling'
    ? 'rgba(255,138,75,0.05)'
    : 'rgba(61,220,151,0.04)';

  return (
    <div style={{
      background:   bg,
      border:       `1px solid ${color}25`,
      borderRadius: 12,
      overflow:     'hidden',
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width:          '100%',
          display:        'flex',
          alignItems:     'center',
          gap:            10,
          padding:        '10px 14px',
          background:     'transparent',
          border:         'none',
          cursor:         'pointer',
          color:          C.text,
          textAlign:      'left',
        }}
      >
        <span style={{
          width:        10,
          height:       10,
          borderRadius: '50%',
          background:   color,
          flexShrink:   0,
          boxShadow:    `0 0 6px ${color}88`,
        }} />
        <span style={{ fontWeight: 600, fontSize: 13, color }}>{label}</span>
        <span style={{
          marginLeft:   4,
          fontSize:     11,
          fontWeight:   700,
          color:        color,
          background:   `${color}18`,
          border:       `1px solid ${color}30`,
          borderRadius: 20,
          padding:      '1px 8px',
        }}>
          {peers.length}
        </span>
        <ChevronDown
          size={13}
          style={{
            marginLeft: 'auto',
            color:      C.faint,
            transform:  expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {peers.map((p) => (
            <div key={p.id} style={{
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              padding:      '5px 8px',
              background:   C.glass3,
              border:       `1px solid ${C.borderSoft}`,
              borderRadius: 8,
            }}>
              <span style={{
                fontSize:     10,
                fontWeight:   700,
                color:        PROVIDER_GLYPH_COLOR[p.provider],
                width:        14,
                textAlign:    'center',
                flexShrink:   0,
              }}>
                {PROVIDER_ICON[p.provider]}
              </span>
              <span style={{ fontSize: 12, color: C.dim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.email}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: repColor(p.rep), flexShrink: 0 }}>
                {p.rep > 0 ? p.rep.toFixed(2) : 'off'}
              </span>
              {p.repDelta !== 0 && (
                <span style={{ fontSize: 10, color: p.repDelta > 0 ? C.success : C.danger, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
                  {p.repDelta > 0
                    ? <ArrowUpRight size={10} />
                    : <ArrowDownRight size={10} />}
                  {Math.abs(p.repDelta).toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reputation leaderboard panel
// ---------------------------------------------------------------------------

function LeaderboardPanel({ peers }: { peers: PeerRow[] }) {
  const sorted = [...peers].sort((a, b) => b.rep - a.rep);
  const top5   = sorted.slice(0, 5);
  const bot5   = sorted.slice(-5).reverse();

  return (
    <div style={{ ...GLASS, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Activity size={14} style={{ color: C.accent }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Reputation Leaderboard</span>
      </div>

      {/* Top performers */}
      <div>
        <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
          Top performers
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {top5.map((p, idx) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize:     10,
                fontWeight:   700,
                color:        idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : C.faint,
                width:        14,
                textAlign:    'center',
                flexShrink:   0,
              }}>
                {idx + 1}
              </span>
              <span style={{
                fontSize:     9,
                fontWeight:   700,
                color:        PROVIDER_GLYPH_COLOR[p.provider],
                width:        12,
                flexShrink:   0,
              }}>
                {PROVIDER_ICON[p.provider]}
              </span>
              <span style={{ fontSize: 11, color: C.dim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.email.split('@')[0]}
              </span>
              <MiniSpark data={p.spark} color={repColor(p.rep)} />
              <span style={{ fontSize: 11, fontWeight: 700, color: repColor(p.rep), width: 36, textAlign: 'right', flexShrink: 0 }}>
                {p.rep.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.borderSoft}`, marginTop: 2 }} />

      {/* Bottom performers */}
      <div>
        <div style={{ fontSize: 10, color: C.danger, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <AlertTriangle size={10} />
          Laggards
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bot5.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize:   9,
                fontWeight: 700,
                color:      PROVIDER_GLYPH_COLOR[p.provider],
                width:      12,
                flexShrink: 0,
              }}>
                {PROVIDER_ICON[p.provider]}
              </span>
              <span style={{ fontSize: 11, color: C.dim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.email.split('@')[0]}
              </span>
              <MiniSpark data={p.spark} color={repColor(p.rep)} />
              <span style={{ fontSize: 11, fontWeight: 700, color: repColor(p.rep), width: 36, textAlign: 'right', flexShrink: 0 }}>
                {p.rep > 0 ? p.rep.toFixed(2) : 'off'}
              </span>
              <span style={{ fontSize: 10, color: C.danger, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ArrowDownRight size={10} />
                {Math.abs(p.repDelta).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: PeerStatus }) {
  const cfg: Record<PeerStatus, { color: string; bg: string; label: string }> = {
    active:   { color: C.success, bg: 'rgba(61,220,151,0.12)',  label: 'active'   },
    warming:  { color: C.accent2, bg: 'rgba(255,138,75,0.12)',  label: 'warming'  },
    degraded: { color: C.danger,  bg: 'rgba(255,92,122,0.12)',  label: 'degraded' },
    offline:  { color: C.ghost,   bg: 'rgba(255,255,255,0.07)', label: 'offline'  },
  };
  const { color, bg, label } = cfg[status];
  return (
    <span style={{
      fontSize:     10,
      fontWeight:   600,
      color,
      background:   bg,
      border:       `1px solid ${color}30`,
      borderRadius: 20,
      padding:      '2px 8px',
      whiteSpace:   'nowrap',
    }}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Bulk action bar (appears when rows selected)
// ---------------------------------------------------------------------------

interface BulkBarProps {
  count:     number;
  onClear:   () => void;
  onAction:  (action: string) => void;
}

function BulkBar({ count, onClear, onAction }: BulkBarProps) {
  const actions = [
    { id: 'deactivate', label: 'Deactivate', icon: <XCircle size={13} />,   danger: true  },
    { id: 'move-pool',  label: 'Move to pool', icon: <Server size={13} />,  danger: false },
    { id: 'test',       label: 'Test SMTP',   icon: <Zap size={13} />,      danger: false },
    { id: 'rotate',     label: 'Rotate creds', icon: <RefreshCw size={13} />,danger: false },
    { id: 'remove',     label: 'Remove',       icon: <Trash2 size={13} />,   danger: true  },
  ];

  return (
    <div style={{
      position:     'sticky',
      bottom:       16,
      left:         0,
      right:        0,
      zIndex:       100,
      display:      'flex',
      alignItems:   'center',
      gap:          10,
      padding:      '10px 18px',
      background:   'rgba(30,18,8,0.96)',
      border:       `1px solid ${C.accent}40`,
      borderRadius: 14,
      boxShadow:    `0 0 40px rgba(242,101,34,0.25), 0 8px 32px rgba(0,0,0,0.6)`,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      margin:       '12px 0 0',
    }}>
      <span style={{
        fontSize:     12,
        fontWeight:   700,
        color:        C.accent,
        flexShrink:   0,
        paddingRight: 10,
        borderRight:  `1px solid ${C.border}`,
      }}>
        {count} selected
      </span>

      <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAction(a.id)}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          5,
              padding:      '5px 12px',
              fontSize:     11,
              fontWeight:   600,
              color:        a.danger ? C.danger : C.dim,
              background:   a.danger ? 'rgba(255,92,122,0.10)' : C.glass2,
              border:       `1px solid ${a.danger ? 'rgba(255,92,122,0.30)' : C.border}`,
              borderRadius: 8,
              cursor:       'pointer',
              transition:   'all 0.15s',
              whiteSpace:   'nowrap',
            }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onClear}
        style={{
          fontSize:     11,
          fontWeight:   600,
          color:        C.faint,
          background:   'transparent',
          border:       'none',
          cursor:       'pointer',
          padding:      '5px 8px',
          borderRadius: 6,
          flexShrink:   0,
        }}
      >
        Clear
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider summary mini-bar
// ---------------------------------------------------------------------------

function ProviderSummary({ peers }: { peers: PeerRow[] }) {
  const counts: Record<Provider, number> = { gmail: 0, outlook: 0, yahoo: 0 };
  peers.forEach((p) => { counts[p.provider]++; });
  const total = peers.length;

  const rows: Array<{ provider: Provider; label: string }> = [
    { provider: 'gmail',   label: 'Gmail'   },
    { provider: 'outlook', label: 'Outlook' },
    { provider: 'yahoo',   label: 'Yahoo'   },
  ];

  return (
    <div style={{ ...GLASS2, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Mail size={12} style={{ color: C.accent }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Provider mix
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(({ provider, label }) => {
          const n   = counts[provider];
          const pct = total > 0 ? (n / total) * 100 : 0;
          return (
            <div key={provider}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: C.dim }}>{label}</span>
                <span style={{ fontSize: 11, color: C.faint }}>{n} / {total}</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height:       '100%',
                  width:        `${pct}%`,
                  background:   `linear-gradient(90deg, ${C.accent}bb, ${C.accent2})`,
                  borderRadius: 4,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pool assignment summary
// ---------------------------------------------------------------------------

function PoolSummary({ peers }: { peers: PeerRow[] }) {
  const poolMap = new Map<string, number>();
  peers.forEach((p) => {
    const key = p.pool ?? 'Unassigned';
    poolMap.set(key, (poolMap.get(key) ?? 0) + 1);
  });
  const pools = Array.from(poolMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ ...GLASS2, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Shield size={12} style={{ color: C.accent }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Pools
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {pools.map(([name, count]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   name === 'Unassigned' ? C.ghost : C.accent2,
              flexShrink:   0,
            }} />
            <span style={{ fontSize: 11, color: C.dim, flex: 1 }}>{name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function AdmPeerP4Console() {
  const [selected,          setSelected]          = useState<Set<string>>(new Set());
  const [searchQuery,       setSearchQuery]        = useState('');
  const [statusFilter,      setStatusFilter]       = useState<PeerStatus | 'all'>('all');
  const [triageExpanded,    setTriageExpanded]     = useState<Record<HealthState, boolean>>({
    'at-risk': true, 'cooling': true, 'healthy': false,
  });
  const [toast,             setToast]             = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived lists
  const filteredPeers = PEERS.filter((p) => {
    const matchSearch = searchQuery.length === 0 || p.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const atRisk  = PEERS.filter((p) => p.health === 'at-risk');
  const cooling  = PEERS.filter((p) => p.health === 'cooling');
  const healthy  = PEERS.filter((p) => p.health === 'healthy');

  // Bulk selection helpers
  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === filteredPeers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredPeers.map((p) => p.id)));
    }
  }, [selected.size, filteredPeers]);

  const clearSelected = useCallback(() => setSelected(new Set()), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  }, []);

  const handleBulkAction = useCallback((action: string) => {
    const n = selected.size;
    const label = action === 'deactivate' ? 'Deactivated'
                : action === 'move-pool'  ? 'Moved to pool'
                : action === 'test'       ? 'SMTP test queued for'
                : action === 'rotate'     ? 'Credentials rotated for'
                : 'Removed';
    showToast(`${label} ${n} peer${n !== 1 ? 's' : ''}`);
    clearSelected();
  }, [selected.size, clearSelected, showToast]);

  const toggleTriage = useCallback((h: HealthState) => {
    setTriageExpanded((prev) => ({ ...prev, [h]: !prev[h] }));
  }, []);

  // Stats
  const totalPeers    = PEERS.length;
  const activePeers   = PEERS.filter((p) => p.status === 'active').length;
  const atRiskCount   = atRisk.length;
  const avgRep        = PEERS.reduce((s, p) => s + p.rep, 0) / PEERS.length;
  const totalSends24h = PEERS.reduce((s, p) => s + p.sends24h, 0);

  const STATUS_FILTERS: Array<{ id: PeerStatus | 'all'; label: string }> = [
    { id: 'all',      label: 'All'      },
    { id: 'active',   label: 'Active'   },
    { id: 'warming',  label: 'Warming'  },
    { id: 'degraded', label: 'Degraded' },
    { id: 'offline',  label: 'Offline'  },
  ];

  const allChecked  = filteredPeers.length > 0 && selected.size === filteredPeers.length;
  const partChecked = selected.size > 0 && !allChecked;

  return (
    <>
      <style>{`
        .p4c-scroll::-webkit-scrollbar { width: 4px; }
        .p4c-scroll::-webkit-scrollbar-track { background: transparent; }
        .p4c-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
        .p4c-row:hover { background: rgba(255,255,255,0.035) !important; }
        .p4c-btn:hover { opacity: 0.75; }
        @keyframes toast-in {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>

      <div style={{
        fontFamily:    'system-ui, -apple-system, sans-serif',
        color:         C.text,
        minHeight:     '100vh',
        display:       'flex',
        flexDirection: 'column',
        padding:       '20px 20px 24px',
        boxSizing:     'border-box',
        position:      'relative',
      }}>

        {/* ------------------------------------------------------------------ */}
        {/* PAGE HEADER */}
        {/* ------------------------------------------------------------------ */}
        <div style={{
          display:       'flex',
          alignItems:    'center',
          gap:           14,
          marginBottom:  20,
        }}>
          <div style={{
            width:        36,
            height:       36,
            borderRadius: 10,
            background:   `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            flexShrink:   0,
          }}>
            <Inbox size={18} style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>
              Peer Inboxes
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>
              Admin · Ops Console · {totalPeers} peers in network
            </div>
          </div>

          {/* Actions */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" style={{
              display:      'flex', alignItems: 'center', gap: 6,
              padding:      '7px 14px', fontSize: 12, fontWeight: 600,
              color:        C.dim, background:   C.glass2,
              border:       `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer',
            }}>
              <Download size={13} />CSV export
            </button>
            <button type="button" style={{
              display:      'flex', alignItems: 'center', gap: 6,
              padding:      '7px 14px', fontSize: 12, fontWeight: 600,
              color:        C.dim, background:   C.glass2,
              border:       `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer',
            }}>
              <Upload size={13} />Bulk import
            </button>
            <button type="button" style={{
              display:      'flex', alignItems: 'center', gap: 6,
              padding:      '7px 14px', fontSize: 12, fontWeight: 600,
              color:        '#fff', background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
              border:       'none', borderRadius: 8, cursor: 'pointer',
              boxShadow:    `0 0 16px ${C.accent}44`,
            }}>
              <Plus size={13} />Add peer
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* TOP STAT CARDS */}
        {/* ------------------------------------------------------------------ */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap:                 10,
          marginBottom:        20,
        }}>
          <StatCard
            label="Total peers"
            value={totalPeers}
            sub="in network"
            icon={<Inbox size={14} />}
          />
          <StatCard
            label="Active"
            value={activePeers}
            sub={`${Math.round(activePeers / totalPeers * 100)}% of fleet`}
            accent={C.success}
            icon={<CheckCircle2 size={14} />}
          />
          <StatCard
            label="At risk"
            value={atRiskCount}
            sub="need attention"
            accent={atRiskCount > 0 ? C.danger : C.success}
            icon={<AlertTriangle size={14} />}
          />
          <StatCard
            label="Avg reputation"
            value={avgRep.toFixed(2)}
            sub="fleet average"
            accent={repColor(avgRep)}
            icon={<Activity size={14} />}
          />
          <StatCard
            label="Sends (24 h)"
            value={totalSends24h.toLocaleString()}
            sub="all peers combined"
            accent={C.accent2}
            icon={<Mail size={14} />}
          />
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* MAIN 2-COLUMN LAYOUT */}
        {/* ------------------------------------------------------------------ */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: '1fr 300px',
          gap:                 16,
          flex:                1,
          minHeight:           0,
          alignItems:          'start',
        }}>

          {/* ------------------------------------------------------------ */}
          {/* LEFT — peer list with checkboxes */}
          {/* ------------------------------------------------------------ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Toolbar */}
            <div style={{
              display:     'flex',
              alignItems:  'center',
              gap:         8,
              flexWrap:    'wrap',
            }}>
              {/* Search */}
              <div style={{
                display:      'flex',
                alignItems:   'center',
                gap:          7,
                background:   C.glass2,
                border:       `1px solid ${C.border}`,
                borderRadius: 8,
                padding:      '6px 12px',
                flex:         '1 1 180px',
              }}>
                <Search size={13} style={{ color: C.faint, flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search peers…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background:  'transparent',
                    border:      'none',
                    outline:     'none',
                    color:       C.text,
                    fontSize:    12,
                    width:       '100%',
                    '::placeholder': { color: C.faint },
                  } as React.CSSProperties}
                />
              </div>

              {/* Status filter chips */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    style={{
                      padding:      '5px 11px',
                      fontSize:     11,
                      fontWeight:   statusFilter === f.id ? 700 : 500,
                      color:        statusFilter === f.id ? C.accent : C.dim,
                      background:   statusFilter === f.id ? 'rgba(242,101,34,0.14)' : C.glass2,
                      border:       `1px solid ${statusFilter === f.id ? 'rgba(242,101,34,0.40)' : C.border}`,
                      borderRadius: 20,
                      cursor:       'pointer',
                      transition:   'all 0.15s',
                      whiteSpace:   'nowrap',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button type="button" style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', fontSize: 11, fontWeight: 500, color: C.dim,
                background: C.glass2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}>
                <Filter size={11} />More filters
              </button>
            </div>

            {/* Peer table */}
            <div style={{ ...GLASS, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{
                display:          'grid',
                gridTemplateColumns: '32px 1fr 90px 90px 70px 76px 76px 54px 28px',
                gap:              0,
                padding:          '8px 16px',
                borderBottom:     `1px solid ${C.borderSoft}`,
                alignItems:       'center',
              }}>
                {/* Select-all checkbox */}
                <button
                  type="button"
                  onClick={toggleAll}
                  aria-label="Select all"
                  style={{
                    width:        16,
                    height:       16,
                    borderRadius: 4,
                    border:       `1.5px solid ${allChecked || partChecked ? C.accent : C.ghost}`,
                    background:   allChecked ? C.accent : partChecked ? 'rgba(242,101,34,0.30)' : 'transparent',
                    cursor:       'pointer',
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    flexShrink:   0,
                    padding:      0,
                  }}
                >
                  {(allChecked || partChecked) && (
                    <span style={{ color: '#fff', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>
                      {allChecked ? '✓' : '—'}
                    </span>
                  )}
                </button>
                {(['Peer', 'Status', 'Pool', 'Reputation', 'Sends 24h', 'Bounces', '', ''] as const).map((h, i) => (
                  <span key={i} style={{ fontSize: 10, fontWeight: 600, color: C.faint, letterSpacing: '0.05em', textTransform: 'uppercase', paddingLeft: i === 0 ? 0 : 8 }}>
                    {h}
                  </span>
                ))}
              </div>

              {/* Table rows */}
              <div className="p4c-scroll" style={{ maxHeight: 460, overflowY: 'auto' }}>
                {filteredPeers.length === 0 && (
                  <div style={{ padding: '32px', textAlign: 'center', color: C.faint, fontSize: 13 }}>
                    No peers match the current filter
                  </div>
                )}
                {filteredPeers.map((p, idx) => {
                  const isChecked = selected.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className="p4c-row"
                      style={{
                        display:             'grid',
                        gridTemplateColumns: '32px 1fr 90px 90px 70px 76px 76px 54px 28px',
                        gap:                 0,
                        padding:             '9px 16px',
                        borderBottom:        idx < filteredPeers.length - 1 ? `1px solid ${C.borderSoft}` : 'none',
                        alignItems:          'center',
                        background:          isChecked ? 'rgba(242,101,34,0.06)' : 'transparent',
                        transition:          'background 0.1s',
                        cursor:              'default',
                      }}
                    >
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleRow(p.id)}
                        aria-label={`Select ${p.email}`}
                        style={{
                          width:          16,
                          height:         16,
                          borderRadius:   4,
                          border:         `1.5px solid ${isChecked ? C.accent : C.ghost}`,
                          background:     isChecked ? C.accent : 'transparent',
                          cursor:         'pointer',
                          display:        'flex',
                          alignItems:     'center',
                          justifyContent: 'center',
                          flexShrink:     0,
                          padding:        0,
                          transition:     'all 0.12s',
                        }}
                      >
                        {isChecked && (
                          <span style={{ color: '#fff', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>
                        )}
                      </button>

                      {/* Peer email + provider */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, minWidth: 0 }}>
                        <span style={{
                          fontSize:     10,
                          fontWeight:   700,
                          color:        PROVIDER_GLYPH_COLOR[p.provider],
                          width:        14,
                          textAlign:    'center',
                          flexShrink:   0,
                          border:       `1px solid ${C.borderSoft}`,
                          borderRadius: 4,
                          padding:      '1px 3px',
                        }}>
                          {PROVIDER_ICON[p.provider]}
                        </span>
                        <span style={{ fontSize: 12, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.email}
                        </span>
                      </div>

                      {/* Status */}
                      <div style={{ paddingLeft: 8 }}>
                        <StatusBadge status={p.status} />
                      </div>

                      {/* Pool */}
                      <div style={{ paddingLeft: 8 }}>
                        <span style={{ fontSize: 11, color: p.pool ? C.dim : C.ghost }}>
                          {p.pool ?? '—'}
                        </span>
                      </div>

                      {/* Reputation + sparkline */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: repColor(p.rep) }}>
                          {p.rep > 0 ? p.rep.toFixed(2) : 'off'}
                        </span>
                      </div>

                      {/* Sends 24h */}
                      <div style={{ paddingLeft: 8 }}>
                        <span style={{ fontSize: 12, color: C.dim }}>{p.sends24h}</span>
                      </div>

                      {/* Bounces */}
                      <div style={{ paddingLeft: 8 }}>
                        <span style={{ fontSize: 12, color: p.bounces24h > 4 ? C.danger : p.bounces24h > 0 ? C.warning : C.faint }}>
                          {p.bounces24h}
                        </span>
                      </div>

                      {/* Sparkline */}
                      <div style={{ paddingLeft: 4 }}>
                        <MiniSpark data={p.spark} color={repColor(p.rep)} />
                      </div>

                      {/* Row action */}
                      <button
                        type="button"
                        style={{
                          background: 'transparent',
                          border:     'none',
                          cursor:     'pointer',
                          color:      C.ghost,
                          display:    'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding:    4,
                          borderRadius: 6,
                        }}
                      >
                        <MoreHorizontal size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Table footer */}
              <div style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                padding:        '8px 16px',
                borderTop:      `1px solid ${C.borderSoft}`,
              }}>
                <span style={{ fontSize: 11, color: C.faint }}>
                  Showing {filteredPeers.length} of {PEERS.length} peers
                </span>
                {selected.size > 0 && (
                  <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>
                    {selected.size} selected
                  </span>
                )}
              </div>
            </div>

            {/* Bulk action bar — sticky at bottom of list column */}
            {selected.size > 0 && (
              <BulkBar
                count={selected.size}
                onClear={clearSelected}
                onAction={handleBulkAction}
              />
            )}
          </div>

          {/* ------------------------------------------------------------ */}
          {/* RIGHT — triage panel + leaderboard + provider summary */}
          {/* ------------------------------------------------------------ */}
          <div className="p4c-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: '85vh' }}>

            {/* Triage summary */}
            <div style={{ ...GLASS, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={14} style={{ color: C.warning }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Health Triage</span>
                {atRiskCount > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: C.danger, background: 'rgba(255,92,122,0.14)',
                    border: `1px solid rgba(255,92,122,0.30)`, borderRadius: 20,
                    padding: '1px 7px', marginLeft: 'auto',
                    animation: 'pulse-dot 2s ease-in-out infinite',
                  }}>
                    {atRiskCount} need action
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <TriageGroup health="at-risk"  peers={atRisk}  expanded={triageExpanded['at-risk']}  onToggle={() => toggleTriage('at-risk')}  />
                <TriageGroup health="cooling"  peers={cooling} expanded={triageExpanded['cooling']}  onToggle={() => toggleTriage('cooling')}  />
                <TriageGroup health="healthy"  peers={healthy} expanded={triageExpanded['healthy']}  onToggle={() => toggleTriage('healthy')}  />
              </div>
            </div>

            {/* Leaderboard */}
            <LeaderboardPanel peers={PEERS} />

            {/* Provider mix */}
            <ProviderSummary peers={PEERS} />

            {/* Pool routing summary */}
            <PoolSummary peers={PEERS} />

            {/* Quick actions card */}
            <div style={{ ...GLASS, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Zap size={13} style={{ color: C.accent }} />
                <span style={{ fontWeight: 700, fontSize: 12, color: C.dim, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Quick actions
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { icon: <Plus size={12} />,       label: 'Add single peer',      accent: true  },
                  { icon: <Upload size={12} />,     label: 'Bulk import CSV',      accent: false },
                  { icon: <RefreshCw size={12} />,  label: 'Rotate all creds',     accent: false },
                  { icon: <Download size={12} />,   label: 'Export peer list',     accent: false },
                  { icon: <Shield size={12} />,     label: 'Run reputation audit', accent: false },
                ].map((a, i) => (
                  <button key={i} type="button" style={{
                    display:      'flex', alignItems: 'center', gap: 8,
                    padding:      '7px 10px',
                    fontSize:     12, fontWeight: 500,
                    color:        a.accent ? C.accent : C.dim,
                    background:   a.accent ? 'rgba(242,101,34,0.08)' : C.glass3,
                    border:       `1px solid ${a.accent ? 'rgba(242,101,34,0.25)' : C.borderSoft}`,
                    borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition:   'background 0.15s',
                  }}>
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* TOAST NOTIFICATION */}
      {/* ------------------------------------------------------------------ */}
      {toast && (
        <div style={{
          position:     'fixed',
          bottom:       28,
          left:         '50%',
          transform:    'translateX(-50%)',
          zIndex:       9999,
          padding:      '10px 20px',
          background:   'rgba(30,18,8,0.95)',
          border:       `1px solid ${C.accent}50`,
          borderRadius: 10,
          fontSize:     13,
          fontWeight:   600,
          color:        C.success,
          boxShadow:    `0 0 28px ${C.accent}30, 0 4px 16px rgba(0,0,0,0.6)`,
          animation:    'toast-in 0.25s ease',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          whiteSpace:   'nowrap',
          display:      'flex',
          alignItems:   'center',
          gap:          8,
        }}>
          <CheckCircle2 size={14} style={{ color: C.success }} />
          {toast}
        </div>
      )}

      {/* Accent glow orbs (decorative background) */}
      <div style={{
        position:     'fixed',
        top:          '20%',
        right:        '8%',
        width:        280,
        height:       280,
        borderRadius: '50%',
        background:   `radial-gradient(circle, ${C.accent}0A, transparent 70%)`,
        pointerEvents:'none',
        zIndex:       0,
      }} />
      <div style={{
        position:     'fixed',
        bottom:       '15%',
        left:         '5%',
        width:        200,
        height:       200,
        borderRadius: '50%',
        background:   `radial-gradient(circle, rgba(61,220,151,0.06), transparent 70%)`,
        pointerEvents:'none',
        zIndex:       0,
      }} />
    </>
  );
}
