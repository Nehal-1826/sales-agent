/**
 * Admin Peer Inboxes Design Candidate: P3 Network / Pools
 *
 * "Network / Pools" — structured by provider + peer-pool.
 * Provider overview cards → Pool capacity cards → reputation histogram
 * → filtered peer list reacting to provider/pool selection.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features / @/lib imports.
 * All styling via inline style={{}} only. Mock data only.
 * Aurora Glass palette: glass rgba(255,255,255,0.05) + blur(10px).
 * Accent orange #F26522→#FF8A4B. Success #3ddc97. Danger #ff5c7a.
 * Warning #FF8A4B. NO purple/violet/blue/teal/cyan/indigo/pink.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  Filter,
  Inbox,
  LayoutGrid,
  Mail,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  Sliders,
  Upload,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  text:        '#ffffff',
  dim:         'rgba(255,255,255,0.62)',
  faint:       'rgba(255,255,255,0.42)',
  ghost:       'rgba(255,255,255,0.18)',
  hairline:    'rgba(255,255,255,0.08)',
  accent:      '#F26522',
  accentB:     '#FF8A4B',
  success:     '#3ddc97',
  successDim:  'rgba(61,220,151,0.15)',
  warning:     '#FF8A4B',
  warningDim:  'rgba(255,138,75,0.15)',
  danger:      '#ff5c7a',
  dangerDim:   'rgba(255,92,122,0.15)',
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
  borderRadius:         12,
};

// ─── Types ─────────────────────────────────────────────────────────────────────

type Provider = 'google_ws' | 'office365' | 'yahoo';
type PoolId = 'default' | 'warmup_a' | 'high_rep' | 'cooldown';
type PeerStatus = 'active' | 'warming' | 'degraded' | 'offline';

interface MockPeer {
  id:       string;
  email:    string;
  provider: Provider;
  pool:     PoolId;
  status:   PeerStatus;
  rep:      number;
  repDelta: number;
  sends24h: number;
  /** days since peer inbox was provisioned (informational, shown in tooltip) */
  dayAge:   number;
}

interface ProviderMeta {
  id:        Provider;
  label:     string;
  domain:    string;
  icon:      typeof Mail;
  iconColor: string;
}

interface PoolMeta {
  id:       PoolId;
  label:    string;
  desc:     string;
  capacity: number;
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const PROVIDERS: ProviderMeta[] = [
  { id: 'google_ws',  label: 'Google Workspace', domain: '@warmpulse-peers.io',   icon: Mail,   iconColor: C.accentB },
  { id: 'office365',  label: 'Office 365',        domain: '@wp-warm.onmicrosoft.com', icon: Inbox,  iconColor: '#d48a3b' },
  { id: 'yahoo',      label: 'Yahoo Mail',         domain: '@yahoo.com',            icon: Server, iconColor: C.warning },
];

const POOLS: PoolMeta[] = [
  { id: 'default',   label: 'Default Pool',   desc: 'General-purpose shared warmup pool', capacity: 200 },
  { id: 'warmup_a',  label: 'Warm-up A',      desc: 'Onboarding ramp — days 1–14',        capacity: 100 },
  { id: 'high_rep',  label: 'High-Rep',        desc: 'Rep ≥ 0.90 peers only',              capacity: 80  },
  { id: 'cooldown',  label: 'Cooldown',        desc: 'Recovering / post-degraded',         capacity: 50  },
];

const PEERS: MockPeer[] = [
  { id: 'p01', email: 'peer-01@warmpulse-peers.io', provider: 'google_ws', pool: 'default',  status: 'active',   rep: 0.96, repDelta: +0.02, sends24h: 148, dayAge: 62 },
  { id: 'p02', email: 'peer-02@warmpulse-peers.io', provider: 'google_ws', pool: 'default',  status: 'active',   rep: 0.94, repDelta: +0.01, sends24h: 136, dayAge: 55 },
  { id: 'p03', email: 'peer-03@warmpulse-peers.io', provider: 'google_ws', pool: 'high_rep', status: 'active',   rep: 0.93, repDelta: +0.03, sends24h: 152, dayAge: 88 },
  { id: 'p04', email: 'peer-04@warmpulse-peers.io', provider: 'google_ws', pool: 'high_rep', status: 'active',   rep: 0.91, repDelta: +0.00, sends24h: 144, dayAge: 71 },
  { id: 'p05', email: 'peer-05@warmpulse-peers.io', provider: 'google_ws', pool: 'warmup_a', status: 'warming',  rep: 0.78, repDelta: +0.06, sends24h: 74,  dayAge: 9  },
  { id: 'p06', email: 'peer-06@warmpulse-peers.io', provider: 'google_ws', pool: 'warmup_a', status: 'warming',  rep: 0.72, repDelta: +0.04, sends24h: 62,  dayAge: 6  },
  { id: 'p07', email: 'peer-07@warmpulse-peers.io', provider: 'google_ws', pool: 'default',  status: 'degraded', rep: 0.54, repDelta: -0.09, sends24h: 22,  dayAge: 34 },
  { id: 'p08', email: 'peer-08@warmpulse-peers.io', provider: 'google_ws', pool: 'cooldown', status: 'warming',  rep: 0.61, repDelta: +0.08, sends24h: 40,  dayAge: 21 },
  { id: 'p09', email: 'p-warm-01@wp-warm.onmicrosoft.com', provider: 'office365', pool: 'default',  status: 'active',   rep: 0.89, repDelta: +0.01, sends24h: 128, dayAge: 44 },
  { id: 'p10', email: 'p-warm-02@wp-warm.onmicrosoft.com', provider: 'office365', pool: 'default',  status: 'active',   rep: 0.87, repDelta: +0.02, sends24h: 118, dayAge: 38 },
  { id: 'p11', email: 'p-warm-03@wp-warm.onmicrosoft.com', provider: 'office365', pool: 'warmup_a', status: 'warming',  rep: 0.76, repDelta: +0.05, sends24h: 68,  dayAge: 11 },
  { id: 'p12', email: 'p-warm-04@wp-warm.onmicrosoft.com', provider: 'office365', pool: 'warmup_a', status: 'warming',  rep: 0.69, repDelta: +0.03, sends24h: 52,  dayAge: 7  },
  { id: 'p13', email: 'p-warm-05@wp-warm.onmicrosoft.com', provider: 'office365', pool: 'cooldown', status: 'warming',  rep: 0.58, repDelta: +0.07, sends24h: 34,  dayAge: 18 },
  { id: 'p14', email: 'p-warm-06@wp-warm.onmicrosoft.com', provider: 'office365', pool: 'default',  status: 'degraded', rep: 0.48, repDelta: -0.11, sends24h: 16,  dayAge: 29 },
  { id: 'p15', email: 'p-warm-07@wp-warm.onmicrosoft.com', provider: 'office365', pool: 'default',  status: 'offline',  rep: 0.00, repDelta: -0.38, sends24h: 0,   dayAge: 12 },
  { id: 'p16', email: 'warmup-001@yahoo.com',              provider: 'yahoo',      pool: 'default',  status: 'active',   rep: 0.84, repDelta: +0.00, sends24h: 108, dayAge: 50 },
  { id: 'p17', email: 'warmup-002@yahoo.com',              provider: 'yahoo',      pool: 'default',  status: 'active',   rep: 0.82, repDelta: +0.01, sends24h: 96,  dayAge: 43 },
  { id: 'p18', email: 'warmup-003@yahoo.com',              provider: 'yahoo',      pool: 'warmup_a', status: 'warming',  rep: 0.74, repDelta: +0.04, sends24h: 58,  dayAge: 8  },
  { id: 'p19', email: 'warmup-004@yahoo.com',              provider: 'yahoo',      pool: 'warmup_a', status: 'warming',  rep: 0.66, repDelta: +0.02, sends24h: 44,  dayAge: 5  },
  { id: 'p20', email: 'warmup-005@yahoo.com',              provider: 'yahoo',      pool: 'cooldown', status: 'degraded', rep: 0.42, repDelta: -0.14, sends24h: 12,  dayAge: 15 },
];

// ─── Derived helpers ───────────────────────────────────────────────────────────

function repColor(rep: number): string {
  if (rep >= 0.85) return C.success;
  if (rep >= 0.70) return C.accentB;
  if (rep >= 0.50) return '#e8a84f';
  if (rep > 0)     return C.danger;
  return C.ghost;
}

function repLabel(rep: number): string {
  if (rep >= 0.85) return 'Excellent';
  if (rep >= 0.70) return 'Good';
  if (rep >= 0.50) return 'Fair';
  if (rep > 0)     return 'Poor';
  return 'Offline';
}

function statusColor(s: PeerStatus): string {
  if (s === 'active')   return C.success;
  if (s === 'warming')  return C.accentB;
  if (s === 'degraded') return C.danger;
  return C.ghost;
}

function capColor(pct: number): string {
  if (pct >= 85) return C.danger;
  if (pct >= 65) return C.warning;
  return C.success;
}

function avgRep(peers: MockPeer[]): number {
  if (peers.length === 0) return 0;
  const active = peers.filter((p) => p.rep > 0);
  if (active.length === 0) return 0;
  return active.reduce((s, p) => s + p.rep, 0) / active.length;
}

// ─── Histogram data ────────────────────────────────────────────────────────────

function buildHistogram(peers: MockPeer[]): { bucket: string; count: number; color: string }[] {
  const buckets = [
    { label: '0–0.3', min: 0,    max: 0.3,  color: C.danger  },
    { label: '0.3–0.5', min: 0.3, max: 0.5, color: '#e8784a' },
    { label: '0.5–0.7', min: 0.5, max: 0.7, color: '#e8a84f' },
    { label: '0.7–0.85', min: 0.7, max: 0.85, color: C.accentB },
    { label: '0.85–1',  min: 0.85, max: 1.01, color: C.success },
  ];
  return buckets.map((b) => ({
    bucket: b.label,
    count:  peers.filter((p) => p.rep >= b.min && p.rep < b.max).length,
    color:  b.color,
  }));
}

// ─── Animated capacity bar ─────────────────────────────────────────────────────

function CapBar({ pct, color }: { pct: number; color: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div style={{ height: 6, borderRadius: 3, background: C.hairline, overflow: 'hidden', flex: 1 }}>
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          borderRadius: 3,
          background: `linear-gradient(90deg, ${color}bb, ${color})`,
          transition: 'width 0.9s cubic-bezier(0.34,1.36,0.64,1)',
        }}
      />
    </div>
  );
}

// ─── Keyframe injection ────────────────────────────────────────────────────────

function useKeyframes() {
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    const id = 'p3-network-kf';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      @keyframes p3-pulse-dot {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.35; }
      }
      @keyframes p3-slide-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes p3-live-blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.2; }
      }
    `;
    document.head.appendChild(el);
    return () => {
      const existing = document.getElementById(id);
      if (existing) document.head.removeChild(existing);
    };
  }, []);
}

// ─── Tooltip (Recharts) ────────────────────────────────────────────────────────

function HistTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const val = payload[0]?.value ?? 0;
  const col = (payload[0] as { color?: string } | undefined)?.color ?? C.accent;
  return (
    <div
      style={{
        background: 'rgba(16,16,20,0.95)',
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 12,
        color: C.text,
      }}
    >
      <div style={{ color: C.faint, fontSize: 10, marginBottom: 4 }}>Rep {label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: col, display: 'inline-block' }} />
        <strong style={{ color: C.text }}>{val} peer{val !== 1 ? 's' : ''}</strong>
      </div>
    </div>
  );
}

// ─── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: PeerStatus }) {
  const col = statusColor(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: col,
        background: `${col}1a`,
        border: `1px solid ${col}44`,
        borderRadius: 6,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 5, height: 5, borderRadius: '50%',
          background: col,
          display: 'inline-block',
          animation: status === 'active' ? 'p3-pulse-dot 2s ease-in-out infinite' : undefined,
        }}
      />
      {status}
    </span>
  );
}

// ─── Section header label ──────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, children }: { icon: typeof Network; children: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: C.faint,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}
    >
      <Icon size={12} strokeWidth={2.4} color={C.accent} />
      {children}
    </div>
  );
}

// ─── Mini rep distribution bar (for pool cards) ────────────────────────────────

function MiniRepBar({ peers }: { peers: MockPeer[] }) {
  const total = peers.length || 1;
  const excellent = peers.filter((p) => p.rep >= 0.85).length;
  const good      = peers.filter((p) => p.rep >= 0.70 && p.rep < 0.85).length;
  const fair      = peers.filter((p) => p.rep >= 0.50 && p.rep < 0.70).length;
  const poor      = peers.filter((p) => p.rep > 0 && p.rep < 0.50).length;
  const segments  = [
    { count: excellent, color: C.success  },
    { count: good,      color: C.accentB  },
    { count: fair,      color: '#e8a84f'  },
    { count: poor,      color: C.danger   },
  ];
  return (
    <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 5 }}>
      {segments.map((seg, i) =>
        seg.count > 0 ? (
          <div
            key={i}
            style={{
              width: `${(seg.count / total) * 100}%`,
              background: seg.color,
              height: '100%',
            }}
          />
        ) : null,
      )}
    </div>
  );
}

// ─── Provider overview card ────────────────────────────────────────────────────

function ProviderCard({
  provider,
  peers,
  selected,
  onSelect,
}: {
  provider: ProviderMeta;
  peers:    MockPeer[];
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = provider.icon;
  const total    = peers.length;
  const active   = peers.filter((p) => p.status === 'active').length;
  const offline  = peers.filter((p) => p.status === 'offline').length;
  const avg      = avgRep(peers);
  const sends    = peers.reduce((s, p) => s + p.sends24h, 0);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...GLASS_TIGHT,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        flex: '1 1 0',
        cursor: 'pointer',
        textAlign: 'left',
        border: selected ? `1.5px solid ${provider.iconColor}` : `1px solid ${C.border}`,
        background: selected ? `${provider.iconColor}10` : C.glass,
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {/* Selected indicator */}
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: 3, height: '100%',
            background: `linear-gradient(180deg, ${provider.iconColor}, ${provider.iconColor}44)`,
            borderRadius: '12px 0 0 12px',
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `${provider.iconColor}1a`,
              border: `1px solid ${provider.iconColor}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={18} color={provider.iconColor} strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
              {provider.label}
            </div>
            <div style={{ fontSize: 10, color: C.faint, fontFamily: 'ui-monospace, monospace', marginTop: 1 }}>
              {provider.domain}
            </div>
          </div>
        </div>
        {offline > 0 && (
          <XCircle size={14} color={C.danger} strokeWidth={2} style={{ flexShrink: 0 }} />
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 0 }}>
        {[
          { label: 'Peers',   value: String(total)  },
          { label: 'Active',  value: String(active)  },
          { label: 'Avg Rep', value: avg.toFixed(2), color: repColor(avg) },
          { label: 'Sends/d', value: sends.toLocaleString() },
        ].map((s, i) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              paddingLeft: i === 0 ? 0 : 12,
              borderLeft: i === 0 ? 'none' : `1px solid ${C.hairline}`,
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: s.color ?? C.text, lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Rep distribution mini-bar */}
      <div>
        <div style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Reputation spread
        </div>
        <MiniRepBar peers={peers} />
      </div>
    </button>
  );
}

// ─── Pool card ─────────────────────────────────────────────────────────────────

function PoolCard({
  pool,
  peers,
  selected,
  onSelect,
}: {
  pool:     PoolMeta;
  peers:    MockPeer[];
  selected: boolean;
  onSelect: () => void;
}) {
  const count    = peers.length;
  const pct      = Math.round((count / pool.capacity) * 100);
  const col      = capColor(pct);
  const avg      = avgRep(peers);
  const active   = peers.filter((p) => p.status === 'active').length;
  const degraded = peers.filter((p) => p.status === 'degraded' || p.status === 'offline').length;

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...GLASS_TIGHT,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flex: '1 1 0',
        cursor: 'pointer',
        textAlign: 'left',
        border: selected ? `1.5px solid ${col}` : `1px solid ${C.border}`,
        background: selected ? `${col}0d` : C.glass,
        transition: 'border-color 0.15s, background 0.15s',
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{pool.label}</div>
          <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{pool.desc}</div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: col,
            background: `${col}1a`,
            border: `1px solid ${col}44`,
            borderRadius: 6,
            padding: '2px 7px',
            flexShrink: 0,
          }}
        >
          {pct}%
        </span>
      </div>

      {/* Capacity bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: C.faint }}>Capacity</span>
          <span style={{ fontSize: 10, color: C.dim }}>{count} / {pool.capacity}</span>
        </div>
        <CapBar pct={pct} color={col} />
      </div>

      {/* Rep distribution */}
      <div>
        <div style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Reputation distribution
        </div>
        <MiniRepBar peers={peers} />
      </div>

      {/* Bottom stats */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircle2 size={11} color={C.success} strokeWidth={2.4} />
          <span style={{ fontSize: 11, color: C.dim }}>{active} active</span>
        </div>
        {degraded > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={11} color={C.danger} strokeWidth={2.4} />
            <span style={{ fontSize: 11, color: C.dim }}>{degraded} issues</span>
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ShieldCheck size={11} color={repColor(avg)} strokeWidth={2.4} />
          <span style={{ fontSize: 11, color: repColor(avg), fontWeight: 600 }}>
            {avg.toFixed(2)} avg
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Reputation histogram ──────────────────────────────────────────────────────

function ReputationHistogram({ peers }: { peers: MockPeer[] }) {
  const data = buildHistogram(peers);
  return (
    <div style={{ ...GLASS, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <SectionLabel icon={Sliders}>Reputation Distribution</SectionLabel>
          <div style={{ fontSize: 12, color: C.dim, marginTop: -8 }}>
            {peers.filter((p) => p.rep > 0).length} active peers · {peers.filter((p) => p.rep >= 0.85).length} excellent
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Excellent ≥0.85', color: C.success },
            { label: 'Good 0.70–0.85',  color: C.accentB },
            { label: 'Fair 0.50–0.70',  color: '#e8a84f' },
            { label: 'Poor < 0.50',     color: C.danger  },
          ].map((leg) => (
            <div key={leg.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: leg.color }} />
              <span style={{ fontSize: 10, color: C.faint }}>{leg.label}</span>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} barSize={40}>
          <CartesianGrid stroke={C.hairline} vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fill: C.faint, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: C.faint, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<HistTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Peer row (compact) ────────────────────────────────────────────────────────

function PeerRow({ peer, index }: { peer: MockPeer; index: number }) {
  const [hover, setHover] = useState(false);
  const col = repColor(peer.rep);
  const provider = PROVIDERS.find((p) => p.id === peer.provider);
  const pool     = POOLS.find((p) => p.id === peer.pool);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display:        'grid',
        gridTemplateColumns: '28px 1fr 110px 120px 72px 64px 60px 36px',
        alignItems:     'center',
        gap:            8,
        padding:        '9px 16px',
        borderBottom:   `1px solid ${C.hairline}`,
        background:     hover ? 'rgba(255,255,255,0.03)' : 'transparent',
        transition:     'background 0.12s',
        animation:      `p3-slide-in 0.35s ease ${index * 0.03}s both`,
        cursor:         'default',
        minWidth:       0,
      }}
    >
      {/* Rank */}
      <span style={{ fontSize: 11, color: C.ghost, fontWeight: 600, textAlign: 'center' }}>
        {index + 1}
      </span>

      {/* Email */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${provider?.iconColor ?? C.accent}1a`,
            border: `1px solid ${provider?.iconColor ?? C.accent}33`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {provider && <provider.icon size={13} color={provider.iconColor} strokeWidth={1.8} />}
        </div>
        <span style={{ fontSize: 12, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {peer.email}
        </span>
      </div>

      {/* Pool tag */}
      <span
        style={{
          fontSize: 10,
          color: C.dim,
          background: C.hairline,
          borderRadius: 5,
          padding: '2px 7px',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {pool?.label ?? peer.pool}
      </span>

      {/* Status */}
      <StatusPill status={peer.status} />

      {/* Sends 24h */}
      <span style={{ fontSize: 12, color: C.dim, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {peer.sends24h.toLocaleString()}
      </span>

      {/* Rep score */}
      <span style={{ fontSize: 13, fontWeight: 700, color: col, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {peer.rep > 0 ? peer.rep.toFixed(2) : '—'}
      </span>

      {/* Delta */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: peer.repDelta >= 0 ? C.success : C.danger,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {peer.repDelta >= 0 ? '+' : ''}{peer.repDelta.toFixed(2)}
      </span>

      {/* Actions */}
      <button
        type="button"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <MoreHorizontal size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

// ─── Peer list ─────────────────────────────────────────────────────────────────

function PeerList({
  peers,
  filterLabel,
}: {
  peers:       MockPeer[];
  filterLabel: string;
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'rep' | 'sends24h' | 'email'>('rep');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = peers
    .filter((p) => !search || p.email.includes(search.toLowerCase()))
    .sort((a, b) => {
      let diff = 0;
      if (sortKey === 'rep')      diff = a.rep - b.rep;
      if (sortKey === 'sends24h') diff = a.sends24h - b.sends24h;
      if (sortKey === 'email')    diff = a.email.localeCompare(b.email);
      return sortAsc ? diff : -diff;
    });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const colHead = (label: string, key: typeof sortKey | null, align: string = 'left') => (
    <span
      onClick={key ? () => toggleSort(key) : undefined}
      style={{
        fontSize: 10,
        color: key && sortKey === key ? C.accentB : C.faint,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        textAlign: align as CSSProperties['textAlign'],
        cursor: key ? 'pointer' : 'default',
        userSelect: 'none',
        display: 'block',
      }}
    >
      {label}{key && sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </span>
  );

  return (
    <div style={{ ...GLASS, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <SectionLabel icon={Users}>Peer List</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -8 }}>
              <span style={{ fontSize: 12, color: C.dim }}>
                {filtered.length} peer{filtered.length !== 1 ? 's' : ''} — {filterLabel}
              </span>
              {filterLabel !== 'all providers · all pools' && (
                <span
                  style={{
                    fontSize: 10,
                    color: C.accent,
                    background: `${C.accent}14`,
                    border: `1px solid ${C.accent}33`,
                    borderRadius: 5,
                    padding: '1px 7px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <Filter size={9} strokeWidth={2.4} />
                  filtered
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Search */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: C.glass2,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: '5px 10px',
              }}
            >
              <Filter size={11} color={C.faint} strokeWidth={2.4} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter email…"
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: C.text,
                  fontSize: 12,
                  width: 140,
                }}
              />
            </div>
            <button
              type="button"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: C.glass2, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '6px 12px',
                color: C.dim, fontSize: 12, cursor: 'pointer',
              }}
            >
              <Download size={12} strokeWidth={2.4} />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div
        style={{
          display:        'grid',
          gridTemplateColumns: '28px 1fr 110px 120px 72px 64px 60px 36px',
          alignItems:     'center',
          gap:            8,
          padding:        '8px 16px',
          borderBottom:   `1px solid ${C.hairline}`,
          background:     'rgba(255,255,255,0.02)',
        }}
      >
        {colHead('#', null)}
        {colHead('Peer', 'email')}
        {colHead('Pool', null)}
        {colHead('Status', null)}
        {colHead('Sends/d', 'sends24h', 'right')}
        {colHead('Rep', 'rep', 'right')}
        {colHead('Δ 24h', null, 'right')}
        <span />
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Zap size={24} color={C.ghost} strokeWidth={1.5} />
            No peers match this filter
          </div>
        ) : (
          filtered.map((peer, i) => <PeerRow key={peer.id} peer={peer} index={i} />)
        )}
      </div>
    </div>
  );
}

// ─── Action button ─────────────────────────────────────────────────────────────

function ActionBtn({
  icon: Icon,
  label,
  primary,
}: {
  icon: typeof Plus;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        6,
        padding:    '8px 14px',
        borderRadius: 10,
        border:     primary ? 'none' : `1px solid ${C.border}`,
        background: primary
          ? `linear-gradient(135deg, ${C.accent}, ${C.accentB})`
          : C.glass,
        color:      primary ? '#0a0a0f' : C.dim,
        fontSize:   12,
        fontWeight: 600,
        cursor:     'pointer',
        backdropFilter: 'blur(10px)',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={13} strokeWidth={2.4} />
      {label}
    </button>
  );
}

// ─── Global KPI strip ──────────────────────────────────────────────────────────

function GlobalKpis() {
  const total     = PEERS.length;
  const active    = PEERS.filter((p) => p.status === 'active').length;
  const warming   = PEERS.filter((p) => p.status === 'warming').length;
  const degraded  = PEERS.filter((p) => p.status === 'degraded').length;
  const offline   = PEERS.filter((p) => p.status === 'offline').length;
  const healthy   = PEERS.filter((p) => p.rep >= 0.7).length;
  const avgRepAll = avgRep(PEERS);
  const sendsSum  = PEERS.reduce((s, p) => s + p.sends24h, 0);

  const kpis = [
    { label: 'Total Peers',       value: String(total),              sub: '4 providers', icon: Network,     col: C.accentB },
    { label: 'Active',            value: String(active),             sub: `${Math.round(active / total * 100)}% of fleet`, icon: CheckCircle2, col: C.success },
    { label: 'Warming',           value: String(warming),            sub: 'ramping up', icon: Zap,         col: C.warning },
    { label: 'Issues',            value: String(degraded + offline), sub: `${degraded} degraded · ${offline} offline`, icon: AlertTriangle, col: degraded + offline > 0 ? C.danger : C.success },
    { label: 'Healthy (rep≥0.7)', value: String(healthy),            sub: `${Math.round(healthy / total * 100)}% of peers`, icon: ShieldCheck, col: C.success },
    { label: 'Avg Reputation',    value: avgRepAll.toFixed(2),       sub: repLabel(avgRepAll), icon: ShieldCheck, col: repColor(avgRepAll) },
    { label: 'Sends today',       value: sendsSum.toLocaleString(),  sub: 'across all peers', icon: Mail, col: C.accentB },
  ];

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <div
            key={k.label}
            style={{
              ...GLASS_TIGHT,
              padding: '12px 16px',
              flex: '1 1 0',
              minWidth: 110,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.faint, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <Icon size={10} color={k.col} strokeWidth={2.4} />
              {k.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.col, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {k.value}
            </div>
            <div style={{ fontSize: 10, color: C.faint }}>{k.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Pool summary sidebar chip (capacity utilization view) ────────────────────

function CapacityUtilizationRow({ peers }: { peers: MockPeer[] }) {
  return (
    <div style={{ ...GLASS, padding: '18px 20px' }}>
      <SectionLabel icon={LayoutGrid}>Capacity Utilization by Pool</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {POOLS.map((pool) => {
          const pp   = peers.filter((p) => p.pool === pool.id);
          const pct  = Math.round((pp.length / pool.capacity) * 100);
          const col  = capColor(pct);
          const avg  = avgRep(pp);
          return (
            <div key={pool.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{pool.label}</span>
                  <span style={{ fontSize: 10, color: C.faint, marginLeft: 8 }}>{pp.length} / {pool.capacity} peers</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: repColor(avg) }}>avg rep {avg.toFixed(2)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: col, minWidth: 36, textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              </div>
              <CapBar pct={pct} color={col} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.hairline}` }}>
        {[
          { label: 'Healthy',  color: C.success, threshold: '< 65%'  },
          { label: 'Elevated', color: C.warning,  threshold: '65–84%' },
          { label: 'Critical', color: C.danger,   threshold: '≥ 85%'  },
        ].map((leg) => (
          <div key={leg.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: leg.color, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: C.faint }}>{leg.label} {leg.threshold}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root export ───────────────────────────────────────────────────────────────

export function AdmPeerP3Network() {
  useKeyframes();

  const [selProvider, setSelProvider] = useState<Provider | null>(null);
  const [selPool,     setSelPool]     = useState<PoolId | null>(null);

  // Derive filtered peers for the list
  const filteredPeers = PEERS.filter((p) => {
    if (selProvider && p.provider !== selProvider) return false;
    if (selPool && p.pool !== selPool) return false;
    return true;
  });

  function filterLabel(): string {
    const parts: string[] = [];
    if (selProvider) parts.push(PROVIDERS.find((p) => p.id === selProvider)?.label ?? selProvider);
    else parts.push('all providers');
    if (selPool) parts.push(POOLS.find((p) => p.id === selPool)?.label ?? selPool);
    else parts.push('all pools');
    return parts.join(' · ');
  }

  function handleProviderClick(id: Provider) {
    setSelProvider((prev) => (prev === id ? null : id));
  }

  function handlePoolClick(id: PoolId) {
    setSelPool((prev) => (prev === id ? null : id));
  }

  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      style={{
        width:      '100%',
        minHeight:  '100vh',
        padding:    '24px 24px 48px',
        boxSizing:  'border-box',
        color:      C.text,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        display:    'flex',
        flexDirection: 'column',
        gap:        20,
      }}
    >
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Network size={20} color={C.accent} strokeWidth={2} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>
              Peer Inboxes
            </h1>
            {/* Live indicator */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: C.successDim, border: `1px solid ${C.success}44`,
                borderRadius: 20, padding: '3px 10px',
              }}
            >
              <span
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: C.success,
                  display: 'inline-block',
                  boxShadow: `0 0 6px ${C.success}`,
                  animation: 'p3-live-blink 1.8s ease-in-out infinite',
                }}
              />
              <span style={{ fontSize: 10, color: C.success, fontWeight: 600, letterSpacing: '0.06em' }}>
                LIVE · {now}
              </span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: C.faint }}>
            Network organized by provider &amp; pool · click cards to filter peer list
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ActionBtn icon={RefreshCw}  label="Refresh health" />
          <ActionBtn icon={Upload}     label="Bulk import" />
          <ActionBtn icon={Settings2}  label="Manage pools" />
          <ActionBtn icon={Plus}       label="Add peer" primary />
        </div>
      </div>

      {/* ── Global KPI strip ────────────────────────────────────────────────── */}
      <GlobalKpis />

      {/* ── Provider overview cards ──────────────────────────────────────────── */}
      <div>
        <SectionLabel icon={Network}>Provider Overview</SectionLabel>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {PROVIDERS.map((prov) => (
            <ProviderCard
              key={prov.id}
              provider={prov}
              peers={PEERS.filter((p) => p.provider === prov.id)}
              selected={selProvider === prov.id}
              onSelect={() => handleProviderClick(prov.id)}
            />
          ))}
        </div>
        {selProvider && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronRight size={12} color={C.faint} />
            <span style={{ fontSize: 11, color: C.faint }}>
              Showing peers for{' '}
              <strong style={{ color: C.text }}>
                {PROVIDERS.find((p) => p.id === selProvider)?.label}
              </strong>{' '}
              only — click card again to clear
            </span>
          </div>
        )}
      </div>

      {/* ── Peer Pool cards + Capacity utilization ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 16, alignItems: 'start' }}>
        {/* Pool cards */}
        <div>
          <SectionLabel icon={LayoutGrid}>Peer Pools</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {POOLS.map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                peers={PEERS.filter((p) =>
                  p.pool === pool.id &&
                  (!selProvider || p.provider === selProvider),
                )}
                selected={selPool === pool.id}
                onSelect={() => handlePoolClick(pool.id)}
              />
            ))}
          </div>
          {selPool && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChevronRight size={12} color={C.faint} />
              <span style={{ fontSize: 11, color: C.faint }}>
                Showing{' '}
                <strong style={{ color: C.text }}>
                  {POOLS.find((p) => p.id === selPool)?.label}
                </strong>{' '}
                peers only — click card again to clear
              </span>
            </div>
          )}
        </div>

        {/* Capacity utilization sidebar */}
        <CapacityUtilizationRow peers={PEERS.filter((p) => !selProvider || p.provider === selProvider)} />
      </div>

      {/* ── Reputation histogram ──────────────────────────────────────────────── */}
      <ReputationHistogram
        peers={PEERS.filter((p) => {
          if (selProvider && p.provider !== selProvider) return false;
          if (selPool && p.pool !== selPool) return false;
          return true;
        })}
      />

      {/* ── Filtered peer list ────────────────────────────────────────────────── */}
      <PeerList peers={filteredPeers} filterLabel={filterLabel()} />

      {/* ── Footer hint ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.45, paddingTop: 8 }}>
        <Filter size={11} color={C.faint} strokeWidth={2} />
        <span style={{ fontSize: 11, color: C.faint }}>
          Click any provider or pool card to filter the peer list below
        </span>
      </div>
    </div>
  );
}
