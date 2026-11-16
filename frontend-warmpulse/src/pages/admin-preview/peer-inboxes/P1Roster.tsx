/**
 * Admin Peer Inboxes Design Candidate: P1 Roster
 *
 * "Roster" — dense data-table command center:
 *   Header (title + Add peer / Bulk import + search)
 *   → Stats cards row
 *   → Provider mix mini-chart + reputation distribution
 *   → Big sortable/filterable peer table
 *   → Detail drawer on row click (reputation sparkline, capacity, pool, actions)
 *
 * Fully self-contained: inline style={{}} only, mock data only,
 * no API / react-query / @/features / @/lib imports.
 * Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97, danger #ff5c7a,
 * warning #FF8A4B. No purple/violet/blue/teal/cyan/indigo/pink.
 */

import { useState, type CSSProperties } from 'react';
import {
  Search,
  Plus,
  Upload,
  ChevronUp,
  ChevronDown,
  X,
  Activity,
  Server,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  Mail,
  MoreHorizontal,
  Inbox,
  Layers,
  RefreshCw,
  Zap,
  Shield,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartTooltip,
  type TooltipProps,
} from 'recharts';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.42)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentHi: '#FF8A4B' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.12)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.12)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.12)' as const,
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
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.42)',
  } as CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Provider = 'google_ws' | 'o365' | 'yahoo';
type PeerStatus = 'active' | 'inactive' | 'cooling';
type SortKey = 'email' | 'provider' | 'reputation' | 'capacity' | 'status' | 'lastUsed';
type SortDir = 'asc' | 'desc';

interface PeerRow {
  id: string;
  email: string;
  provider: Provider;
  reputation: number;
  repHistory: number[]; // last 7 days
  capacityUsed: number;
  capacityTotal: number;
  status: PeerStatus;
  pool: string | null;
  lastUsed: string; // ISO-ish
  sends24h: number;
  bounceRate: number;
  openRate: number;
}

// ─── Mock peer data (14 rows) ─────────────────────────────────────────────────
const PEERS: PeerRow[] = [
  {
    id: 'p01', email: 'warmnet.relay01@gmail.com',     provider: 'google_ws',
    reputation: 0.96, repHistory: [0.88, 0.90, 0.91, 0.92, 0.94, 0.95, 0.96],
    capacityUsed: 142, capacityTotal: 160, status: 'active',  pool: 'Default A',
    lastUsed: '2026-05-31T22:08:00Z', sends24h: 142, bounceRate: 0.3, openRate: 91,
  },
  {
    id: 'p02', email: 'warmnet.relay02@gmail.com',     provider: 'google_ws',
    reputation: 0.94, repHistory: [0.89, 0.90, 0.91, 0.92, 0.93, 0.94, 0.94],
    capacityUsed: 128, capacityTotal: 160, status: 'active',  pool: 'Default A',
    lastUsed: '2026-05-31T22:07:42Z', sends24h: 128, bounceRate: 0.4, openRate: 88,
  },
  {
    id: 'p03', email: 'warmnet.relay03@outlook.com',   provider: 'o365',
    reputation: 0.91, repHistory: [0.85, 0.87, 0.88, 0.89, 0.90, 0.91, 0.91],
    capacityUsed: 118, capacityTotal: 150, status: 'active',  pool: 'Enterprise B',
    lastUsed: '2026-05-31T22:06:18Z', sends24h: 118, bounceRate: 0.6, openRate: 85,
  },
  {
    id: 'p04', email: 'warmnet.relay04@gmail.com',     provider: 'google_ws',
    reputation: 0.89, repHistory: [0.80, 0.82, 0.84, 0.86, 0.87, 0.88, 0.89],
    capacityUsed: 156, capacityTotal: 160, status: 'active',  pool: 'Default A',
    lastUsed: '2026-05-31T22:05:55Z', sends24h: 156, bounceRate: 0.5, openRate: 86,
  },
  {
    id: 'p05', email: 'warmnet.relay05@yahoo.com',     provider: 'yahoo',
    reputation: 0.85, repHistory: [0.79, 0.80, 0.81, 0.82, 0.83, 0.84, 0.85],
    capacityUsed: 98,  capacityTotal: 120, status: 'active',  pool: 'Burst C',
    lastUsed: '2026-05-31T22:04:31Z', sends24h: 98,  bounceRate: 0.8, openRate: 82,
  },
  {
    id: 'p06', email: 'warmnet.relay06@outlook.com',   provider: 'o365',
    reputation: 0.79, repHistory: [0.70, 0.72, 0.73, 0.75, 0.77, 0.78, 0.79],
    capacityUsed: 64,  capacityTotal: 150, status: 'active',  pool: 'Enterprise B',
    lastUsed: '2026-05-31T22:02:10Z', sends24h: 64,  bounceRate: 1.1, openRate: 78,
  },
  {
    id: 'p07', email: 'warmnet.relay07@gmail.com',     provider: 'google_ws',
    reputation: 0.77, repHistory: [0.65, 0.67, 0.69, 0.71, 0.73, 0.75, 0.77],
    capacityUsed: 52,  capacityTotal: 160, status: 'cooling', pool: null,
    lastUsed: '2026-05-31T21:50:00Z', sends24h: 52,  bounceRate: 1.4, openRate: 74,
  },
  {
    id: 'p08', email: 'warmnet.relay08@yahoo.com',     provider: 'yahoo',
    reputation: 0.74, repHistory: [0.71, 0.73, 0.74, 0.74, 0.75, 0.74, 0.74],
    capacityUsed: 88,  capacityTotal: 120, status: 'cooling', pool: 'Burst C',
    lastUsed: '2026-05-31T21:44:17Z', sends24h: 88,  bounceRate: 1.6, openRate: 71,
  },
  {
    id: 'p09', email: 'warmnet.relay09@gmail.com',     provider: 'google_ws',
    reputation: 0.67, repHistory: [0.80, 0.76, 0.72, 0.70, 0.68, 0.67, 0.67],
    capacityUsed: 36,  capacityTotal: 160, status: 'cooling', pool: 'Default A',
    lastUsed: '2026-05-31T21:30:00Z', sends24h: 36,  bounceRate: 2.8, openRate: 62,
  },
  {
    id: 'p10', email: 'warmnet.relay10@outlook.com',   provider: 'o365',
    reputation: 0.58, repHistory: [0.80, 0.74, 0.68, 0.64, 0.60, 0.58, 0.58],
    capacityUsed: 44,  capacityTotal: 150, status: 'inactive', pool: 'Enterprise B',
    lastUsed: '2026-05-31T20:15:00Z', sends24h: 44,  bounceRate: 4.2, openRate: 55,
  },
  {
    id: 'p11', email: 'warmnet.relay11@gmail.com',     provider: 'google_ws',
    reputation: 0.44, repHistory: [0.75, 0.67, 0.59, 0.52, 0.48, 0.45, 0.44],
    capacityUsed: 18,  capacityTotal: 160, status: 'inactive', pool: null,
    lastUsed: '2026-05-31T19:00:00Z', sends24h: 18,  bounceRate: 7.5, openRate: 40,
  },
  {
    id: 'p12', email: 'warmnet.relay12@yahoo.com',     provider: 'yahoo',
    reputation: 0.38, repHistory: [0.55, 0.50, 0.45, 0.42, 0.40, 0.39, 0.38],
    capacityUsed: 12,  capacityTotal: 120, status: 'inactive', pool: null,
    lastUsed: '2026-05-31T14:30:00Z', sends24h: 12,  bounceRate: 9.1, openRate: 32,
  },
  {
    id: 'p13', email: 'warmnet.relay13@outlook.com',   provider: 'o365',
    reputation: 0.82, repHistory: [0.78, 0.79, 0.80, 0.81, 0.81, 0.82, 0.82],
    capacityUsed: 104, capacityTotal: 150, status: 'active',  pool: 'Enterprise B',
    lastUsed: '2026-05-31T22:01:05Z', sends24h: 104, bounceRate: 0.7, openRate: 80,
  },
  {
    id: 'p14', email: 'warmnet.relay14@gmail.com',     provider: 'google_ws',
    reputation: 0.87, repHistory: [0.82, 0.83, 0.84, 0.85, 0.86, 0.87, 0.87],
    capacityUsed: 134, capacityTotal: 160, status: 'active',  pool: 'Default A',
    lastUsed: '2026-05-31T22:03:44Z', sends24h: 134, bounceRate: 0.4, openRate: 87,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function repColor(rep: number): string {
  if (rep >= 0.85) return T.success;
  if (rep >= 0.70) return T.warning;
  if (rep >= 0.50) return '#fbbf24';
  return T.danger;
}

function statusColor(s: PeerStatus): string {
  if (s === 'active') return T.success;
  if (s === 'cooling') return T.warning;
  return T.danger;
}

function statusBg(s: PeerStatus): string {
  if (s === 'active') return T.successDim;
  if (s === 'cooling') return T.warningDim;
  return T.dangerDim;
}

function providerLabel(p: Provider): string {
  if (p === 'google_ws') return 'Google WS';
  if (p === 'o365') return 'Office 365';
  return 'Yahoo';
}

function providerColor(p: Provider): string {
  if (p === 'google_ws') return '#F26522';
  if (p === 'o365') return '#FF8A4B';
  return '#fbbf24';
}

function relativeTime(iso: string): string {
  const delta = (Date.now() - new Date(iso).getTime()) / 1000;
  if (delta < 60) return `${Math.round(delta)}s ago`;
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86400)}d ago`;
}

function sortPeers(peers: PeerRow[], key: SortKey, dir: SortDir): PeerRow[] {
  return [...peers].sort((a, b) => {
    let av: number | string = 0;
    let bv: number | string = 0;
    if (key === 'email')     { av = a.email; bv = b.email; }
    if (key === 'provider')  { av = a.provider; bv = b.provider; }
    if (key === 'reputation'){ av = a.reputation; bv = b.reputation; }
    if (key === 'capacity')  { av = a.capacityUsed / a.capacityTotal; bv = b.capacityUsed / b.capacityTotal; }
    if (key === 'status')    { av = a.status; bv = b.status; }
    if (key === 'lastUsed')  { av = a.lastUsed; bv = b.lastUsed; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// Provider distribution data
const PROVIDER_DIST = [
  { name: 'Google WS',   value: PEERS.filter(p => p.provider === 'google_ws').length, color: '#F26522' },
  { name: 'Office 365',  value: PEERS.filter(p => p.provider === 'o365').length,       color: '#FF8A4B' },
  { name: 'Yahoo',       value: PEERS.filter(p => p.provider === 'yahoo').length,       color: '#fbbf24' },
];

// Reputation distribution buckets
const REP_DIST = [
  { range: '0.9+',    count: PEERS.filter(p => p.reputation >= 0.90).length, color: '#3ddc97' },
  { range: '0.8–0.9', count: PEERS.filter(p => p.reputation >= 0.80 && p.reputation < 0.90).length, color: '#6ee7b7' },
  { range: '0.7–0.8', count: PEERS.filter(p => p.reputation >= 0.70 && p.reputation < 0.80).length, color: '#FF8A4B' },
  { range: '0.5–0.7', count: PEERS.filter(p => p.reputation >= 0.50 && p.reputation < 0.70).length, color: '#fbbf24' },
  { range: '< 0.5',   count: PEERS.filter(p => p.reputation < 0.50).length, color: '#ff5c7a' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: PeerStatus }) {
  const Icon = status === 'active' ? Wifi : status === 'cooling' ? AlertTriangle : WifiOff;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 99,
        background: statusBg(status),
        border: `1px solid ${statusColor(status)}33`,
        fontSize: 11,
        fontWeight: 700,
        color: statusColor(status),
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={10} strokeWidth={2.2} />
      {status}
    </span>
  );
}

function ProviderChip({ provider }: { provider: Provider }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 6,
        background: `${providerColor(provider)}18`,
        border: `1px solid ${providerColor(provider)}33`,
        fontSize: 10,
        fontWeight: 700,
        color: providerColor(provider),
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {providerLabel(provider)}
    </span>
  );
}

function MeterBar({
  value,
  max,
  color,
  height = 5,
}: {
  value: number;
  max: number;
  color: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      style={{
        height,
        borderRadius: height,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: height,
          background: color,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

function RepBar({
  rep,
  width = 64,
}: {
  rep: number;
  width?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width,
          height: 5,
          borderRadius: 3,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${rep * 100}%`,
            borderRadius: 3,
            background: repColor(rep),
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: repColor(rep),
          minWidth: 32,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rep.toFixed(2)}
      </span>
    </div>
  );
}

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) {
    return <ChevronDown size={10} strokeWidth={2} style={{ opacity: 0.3 }} />;
  }
  return dir === 'asc'
    ? <ChevronUp size={10} strokeWidth={2.5} style={{ color: T.accent }} />
    : <ChevronDown size={10} strokeWidth={2.5} style={{ color: T.accent }} />;
}

// Sparkline via inline SVG
function RepSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 0.01;
  const W = 120;
  const H = 36;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const area = `0,${H} ${polyline} ${W},${H}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#spark-fill)" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {data.map((v, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - ((v - min) / range) * (H - 4) - 2;
        return i === data.length - 1 ? (
          <circle key={i} cx={x} cy={y} r={3} fill={color} />
        ) : null;
      })}
    </svg>
  );
}

// Recharts tooltip — typed to TooltipProps<number,string>
function ProvTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const val = item?.value ?? 0;
  const name = item?.name ?? '';
  return (
    <div
      style={{
        background: 'rgba(10,10,15,0.96)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: T.text,
      }}
    >
      {name}: {val} peers
    </div>
  );
}

function RepTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div
      style={{
        background: 'rgba(10,10,15,0.96)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: T.text,
      }}
    >
      {label}: {val} peers
    </div>
  );
}

// ─── Dialog mock ─────────────────────────────────────────────────────────────

function AddPeerDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...T.glass,
          borderRadius: 18,
          padding: '28px 32px',
          width: 440,
          maxWidth: '90vw',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: T.faint,
            padding: 4,
          }}
        >
          <X size={16} strokeWidth={2} />
        </button>

        <div style={{ ...T.micro, marginBottom: 8 }}>
          <Plus size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
          Add peer inbox
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 20 }}>
          Add a new peer inbox
        </div>

        {[
          { label: 'Email address', placeholder: 'warmnet.peer15@gmail.com' },
          { label: 'SMTP password', placeholder: '••••••••••••' },
        ].map((f) => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.dim, marginBottom: 5 }}>
              {f.label}
            </div>
            <input
              placeholder={f.placeholder}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 9,
                padding: '10px 14px',
                fontSize: 13,
                color: T.text,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        ))}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.dim, marginBottom: 5 }}>Provider</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['google_ws', 'o365', 'yahoo'] as Provider[]).map((p) => (
              <button
                key={p}
                type="button"
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 8,
                  border: p === 'google_ws' ? `1px solid ${T.accent}` : '1px solid rgba(255,255,255,0.12)',
                  background: p === 'google_ws' ? `${T.accent}18` : 'rgba(255,255,255,0.04)',
                  color: p === 'google_ws' ? T.accent : T.dim,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {providerLabel(p)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.dim, marginBottom: 5 }}>Pool assignment</div>
          <select
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 9,
              padding: '10px 14px',
              fontSize: 13,
              color: T.dim,
              outline: 'none',
            }}
          >
            <option>Default A</option>
            <option>Enterprise B</option>
            <option>Burst C</option>
            <option>— Unassigned —</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: T.dim,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 2,
              padding: '10px 0',
              borderRadius: 9,
              border: 'none',
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Add peer inbox
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkImportDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...T.glass,
          borderRadius: 18,
          padding: '28px 32px',
          width: 480,
          maxWidth: '90vw',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: T.faint,
            padding: 4,
          }}
        >
          <X size={16} strokeWidth={2} />
        </button>

        <div style={{ ...T.micro, marginBottom: 8 }}>
          <Upload size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
          Bulk import
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>
          Import peers from CSV
        </div>
        <div style={{ fontSize: 12, color: T.dim, marginBottom: 20, lineHeight: 1.6 }}>
          CSV format: <code style={{ color: T.accent, fontFamily: 'monospace' }}>email,password,provider,pool</code>.
          One peer per row. Provider: <code style={{ color: T.faint, fontFamily: 'monospace' }}>google_ws|o365|yahoo</code>.
        </div>

        <div
          style={{
            border: '2px dashed rgba(255,255,255,0.14)',
            borderRadius: 12,
            padding: '32px 24px',
            textAlign: 'center',
            marginBottom: 20,
            cursor: 'pointer',
          }}
        >
          <Upload size={28} strokeWidth={1.5} style={{ color: T.faint, marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: T.dim }}>Drop CSV here or click to browse</div>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>Max 500 peers per import</div>
        </div>

        <div
          style={{
            ...T.glassTight,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 11,
            color: T.faint,
          }}
        >
          Sample CSV:
          <br />
          <code style={{ color: T.dim, fontFamily: 'monospace', fontSize: 10 }}>
            warmnet.new01@gmail.com,apppassword123,google_ws,Default A
          </code>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: T.dim,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 2,
              padding: '10px 0',
              borderRadius: 9,
              border: 'none',
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Import CSV
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ peer, onClose }: { peer: PeerRow; onClose: () => void }) {
  const capPct = Math.round((peer.capacityUsed / peer.capacityTotal) * 100);
  const repC = repColor(peer.reputation);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
      }}
    >
      {/* Backdrop */}
      <div
        style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        style={{
          width: 380,
          maxWidth: '92vw',
          height: '100%',
          background: 'rgba(14,14,20,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderLeft: '1px solid rgba(255,255,255,0.10)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: `${repC}18`,
              border: `1px solid ${repC}33`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Inbox size={18} strokeWidth={2} color={repC} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: T.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {peer.email}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <StatusPill status={peer.status} />
              <ProviderChip provider={peer.provider} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: T.faint,
              padding: 4,
              flexShrink: 0,
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', flex: 1 }}>
          {/* Reputation */}
          <div style={{ ...T.micro, marginBottom: 12 }}>
            <Activity size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
            Reputation · 7-day history
          </div>
          <div
            style={{
              ...T.glass,
              padding: '14px 16px',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: repC }}>
                {peer.reputation.toFixed(2)}
              </span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: T.faint }}>vs 7d ago</div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: (peer.repHistory[6] ?? 0) >= (peer.repHistory[0] ?? 0) ? T.success : T.danger,
                  }}
                >
                  {((peer.repHistory[6] ?? 0) - (peer.repHistory[0] ?? 0) >= 0 ? '+' : '')}
                  {((peer.repHistory[6] ?? 0) - (peer.repHistory[0] ?? 0)).toFixed(2)}
                </div>
              </div>
            </div>
            <RepSparkline data={peer.repHistory} color={repC} />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 4,
                fontSize: 10,
                color: T.faint,
              }}
            >
              <span>7d ago</span>
              <span>Today</span>
            </div>
          </div>

          {/* Capacity */}
          <div style={{ ...T.micro, marginBottom: 12 }}>
            <Layers size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
            Capacity
          </div>
          <div style={{ ...T.glass, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                {peer.capacityUsed} / {peer.capacityTotal} sends today
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: capPct >= 90 ? T.danger : capPct >= 70 ? T.warning : T.success,
                }}
              >
                {capPct}%
              </span>
            </div>
            <MeterBar
              value={peer.capacityUsed}
              max={peer.capacityTotal}
              color={capPct >= 90 ? T.danger : capPct >= 70 ? T.warning : T.success}
              height={6}
            />
          </div>

          {/* Stats row */}
          <div style={{ ...T.micro, marginBottom: 12 }}>
            <Server size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
            24h metrics
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {[
              { label: 'Sends', value: String(peer.sends24h), color: T.text },
              { label: 'Bounce', value: `${peer.bounceRate}%`, color: peer.bounceRate > 3 ? T.danger : peer.bounceRate > 1.5 ? T.warning : T.success },
              { label: 'Open rate', value: `${peer.openRate}%`, color: peer.openRate >= 80 ? T.success : peer.openRate >= 60 ? T.warning : T.danger },
            ].map((m) => (
              <div key={m.label} style={{ ...T.glassTight, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Pool membership */}
          <div style={{ ...T.micro, marginBottom: 10 }}>
            <Shield size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
            Pool membership
          </div>
          <div style={{ ...T.glass, padding: '12px 16px', marginBottom: 16 }}>
            {peer.pool ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: 6,
                    background: `${T.accent}18`,
                    border: `1px solid ${T.accent}33`,
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.accent,
                  }}
                >
                  {peer.pool}
                </span>
                <span style={{ fontSize: 11, color: T.faint }}>assigned · can reassign below</span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: T.faint }}>Unassigned — not in any pool</div>
            )}
          </div>

          {/* Recent sends (mock) */}
          <div style={{ ...T.micro, marginBottom: 10 }}>
            <Mail size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
            Recent sends
          </div>
          <div style={{ ...T.glass, padding: '4px 0', marginBottom: 20 }}>
            {[
              { to: 'user@acme.com',    when: '4m ago', result: 'delivered' },
              { to: 'founder@beta.io',  when: '18m ago', result: 'delivered' },
              { to: 'ceo@corp.co',      when: '34m ago', result: 'delivered' },
              { to: 'pm@startup.ai',    when: '51m ago', result: 'opened' },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 16px',
                  borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
              >
                <span style={{ fontSize: 11, color: T.dim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.to}
                </span>
                <span style={{ fontSize: 10, color: T.faint, whiteSpace: 'nowrap' }}>{s.when}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: s.result === 'opened' ? T.success : T.dim,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.result}
                </span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ ...T.micro, marginBottom: 10 }}>Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Zap size={14} strokeWidth={2.2} />
              Test connection
            </button>
            <button
              type="button"
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid rgba(255,92,122,0.30)',
                background: 'rgba(255,92,122,0.08)',
                color: T.danger,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <WifiOff size={14} strokeWidth={2.2} />
              Deactivate peer
            </button>
            <button
              type="button"
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: T.dim,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <RefreshCw size={14} strokeWidth={2.2} />
              Reassign pool
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmPeerP1Roster() {
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<Provider | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PeerStatus | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('reputation');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedPeer, setSelectedPeer] = useState<PeerRow | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const filtered = PEERS.filter((p) => {
    if (search && !p.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (providerFilter !== 'all' && p.provider !== providerFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });
  const sorted = sortPeers(filtered, sortKey, sortDir);

  const totalPeers = 312;
  const activePeers = 287;
  const avgRep = 0.84;
  const capacityUsedPct = 78;
  const providerCount = 3;

  const hStyle = (key: SortKey): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    userSelect: 'none',
    color: sortKey === key ? T.accent : T.faint,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  });

  return (
    <div
      style={{
        padding: '24px 28px 48px',
        minHeight: '100%',
        fontFamily: 'inherit',
        color: T.text,
        position: 'relative',
      }}
    >
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ ...T.micro, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Inbox size={10} strokeWidth={2.2} />
            Admin · Peer Inboxes
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: T.text,
              margin: 0,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            Peer inbox roster
          </h1>
          <p style={{ fontSize: 12, color: T.dim, margin: '4px 0 0', lineHeight: 1.5 }}>
            System-owned warmup peer network · {totalPeers} mailboxes across {providerCount} providers
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 9,
              padding: '8px 14px',
              minWidth: 200,
            }}
          >
            <Search size={13} strokeWidth={2.2} style={{ color: T.faint, flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search peers…"
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                fontSize: 13,
                color: T.text,
                width: '100%',
                minWidth: 0,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowBulkDialog(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: T.dim,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Upload size={12} strokeWidth={2.2} />
            Bulk import
          </button>
          <button
            type="button"
            onClick={() => setShowAddDialog(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              borderRadius: 9,
              border: 'none',
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={12} strokeWidth={2.4} />
            Add peer
          </button>
        </div>
      </div>

      {/* ── Stats cards ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          {
            label: 'Total peers',
            value: totalPeers.toLocaleString(),
            sub: '3 providers',
            icon: Inbox,
            color: T.text,
          },
          {
            label: 'Active',
            value: activePeers.toLocaleString(),
            sub: `${Math.round((activePeers / totalPeers) * 100)}% of roster`,
            icon: Wifi,
            color: T.success,
          },
          {
            label: 'Avg reputation',
            value: avgRep.toFixed(2),
            sub: '7-day rolling',
            icon: Activity,
            color: repColor(avgRep),
          },
          {
            label: 'Capacity used',
            value: `${capacityUsedPct}%`,
            sub: 'across active peers',
            icon: Layers,
            color: capacityUsedPct >= 90 ? T.danger : capacityUsedPct >= 75 ? T.warning : T.success,
          },
          {
            label: 'Providers',
            value: providerCount.toString(),
            sub: 'Google WS · O365 · Yahoo',
            icon: Server,
            color: T.accentHi,
          },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              ...T.glassTight,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <card.icon size={11} strokeWidth={2.2} color={card.color} />
              <span style={{ ...T.micro }}>{card.label}</span>
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: card.color,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}
            >
              {card.value}
            </div>
            <div style={{ fontSize: 10, color: T.faint }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {/* Provider mix */}
        <div style={{ ...T.glass, padding: '18px 20px' }}>
          <div style={{ ...T.micro, marginBottom: 12 }}>
            <Server size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
            Provider mix
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ResponsiveContainer width={120} height={64}>
              <BarChart data={PROVIDER_DIST} barCategoryGap="30%">
                <Bar dataKey="value" name="name" radius={[4, 4, 0, 0]}>
                  {PROVIDER_DIST.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
                <RechartTooltip
                  content={(props: TooltipProps<number, string>) => <ProvTooltip {...props} />}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {PROVIDER_DIST.map((p) => (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: p.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: T.dim }}>{p.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MeterBar value={p.value} max={PEERS.length} color={p.color} height={4} />
                    <span style={{ color: T.text, fontWeight: 700, minWidth: 16 }}>{p.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reputation distribution */}
        <div style={{ ...T.glass, padding: '18px 20px' }}>
          <div style={{ ...T.micro, marginBottom: 12 }}>
            <Activity size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
            Reputation distribution
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ResponsiveContainer width={120} height={64}>
              <BarChart data={REP_DIST} barCategoryGap="20%">
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {REP_DIST.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
                <RechartTooltip
                  content={(props: TooltipProps<number, string>) => (
                    <RepTooltip {...props} />
                  )}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {REP_DIST.map((r) => (
                <div
                  key={r.range}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 5,
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: r.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: T.dim, fontFamily: 'monospace', fontSize: 10 }}>{r.range}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MeterBar value={r.count} max={PEERS.length} color={r.color} height={4} />
                    <span style={{ color: T.text, fontWeight: 700, minWidth: 16 }}>{r.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Provider filter */}
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, overflow: 'hidden' }}>
          {([
            { k: 'all' as const, label: 'All providers' },
            { k: 'google_ws' as const, label: 'Google WS' },
            { k: 'o365' as const, label: 'Office 365' },
            { k: 'yahoo' as const, label: 'Yahoo' },
          ]).map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setProviderFilter(opt.k)}
              style={{
                border: 'none',
                background: providerFilter === opt.k ? T.accent : 'transparent',
                color: providerFilter === opt.k ? '#fff' : T.dim,
                fontSize: 11,
                fontWeight: 700,
                padding: '6px 12px',
                cursor: 'pointer',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, overflow: 'hidden' }}>
          {([
            { k: 'all' as const, label: 'All status' },
            { k: 'active' as const, label: 'Active' },
            { k: 'cooling' as const, label: 'Cooling' },
            { k: 'inactive' as const, label: 'Inactive' },
          ]).map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setStatusFilter(opt.k)}
              style={{
                border: 'none',
                background: statusFilter === opt.k ? T.accent : 'transparent',
                color: statusFilter === opt.k ? '#fff' : T.dim,
                fontSize: 11,
                fontWeight: 700,
                padding: '6px 12px',
                cursor: 'pointer',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span style={{ fontSize: 11, color: T.faint, marginLeft: 'auto' }}>
          {sorted.length} of {PEERS.length} peers shown
        </span>
      </div>

      {/* ── Peer table ─────────────────────────────────────────────────────── */}
      <div style={{ ...T.glass, overflow: 'hidden' }}>
        {/* Table header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 120px 180px 160px 110px 100px 36px',
            gap: 0,
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          {(
            [
              { key: 'email' as SortKey, label: 'Peer email' },
              { key: 'provider' as SortKey, label: 'Provider' },
              { key: 'reputation' as SortKey, label: 'Reputation' },
              { key: 'capacity' as SortKey, label: 'Capacity' },
              { key: 'status' as SortKey, label: 'Status' },
              { key: 'lastUsed' as SortKey, label: 'Last used' },
            ] as Array<{ key: SortKey; label: string }>
          ).map((col) => (
            <div
              key={col.key}
              style={hStyle(col.key)}
              onClick={() => handleSort(col.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleSort(col.key)}
            >
              {col.label}
              <SortIcon col={col.key} active={sortKey} dir={sortDir} />
            </div>
          ))}
          <div />
        </div>

        {/* Table rows */}
        {sorted.length === 0 ? (
          <div
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              color: T.faint,
              fontSize: 13,
            }}
          >
            No peers match your filters.
          </div>
        ) : (
          sorted.map((peer, i) => {
            const capPct = Math.round((peer.capacityUsed / peer.capacityTotal) * 100);
            const isSelected = selectedPeer?.id === peer.id;
            return (
              <div
                key={peer.id}
                onClick={() => setSelectedPeer(isSelected ? null : peer)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 120px 180px 160px 110px 100px 36px',
                  gap: 0,
                  padding: '11px 16px',
                  borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(242,101,34,0.07)' : 'transparent',
                  transition: 'background 0.15s',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = isSelected
                    ? 'rgba(242,101,34,0.07)'
                    : 'transparent';
                }}
              >
                {/* Email */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: `${repColor(peer.reputation)}18`,
                      border: `1px solid ${repColor(peer.reputation)}22`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Mail size={12} strokeWidth={2} color={repColor(peer.reputation)} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: T.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {peer.email}
                    </div>
                    {peer.pool && (
                      <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{peer.pool}</div>
                    )}
                  </div>
                </div>

                {/* Provider */}
                <div>
                  <ProviderChip provider={peer.provider} />
                </div>

                {/* Reputation */}
                <div>
                  <RepBar rep={peer.reputation} width={72} />
                </div>

                {/* Capacity */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.dim }}>
                    <span>{peer.capacityUsed}/{peer.capacityTotal}</span>
                    <span
                      style={{
                        color: capPct >= 90 ? T.danger : capPct >= 75 ? T.warning : T.success,
                        fontWeight: 700,
                      }}
                    >
                      {capPct}%
                    </span>
                  </div>
                  <MeterBar
                    value={peer.capacityUsed}
                    max={peer.capacityTotal}
                    color={capPct >= 90 ? T.danger : capPct >= 75 ? T.warning : T.success}
                    height={4}
                  />
                </div>

                {/* Status */}
                <div>
                  <StatusPill status={peer.status} />
                </div>

                {/* Last used */}
                <div
                  style={{
                    fontSize: 11,
                    color: T.faint,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {relativeTime(peer.lastUsed)}
                </div>

                {/* Action */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPeer(isSelected ? null : peer);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: T.faint,
                      padding: 4,
                      borderRadius: 6,
                    }}
                  >
                    <MoreHorizontal size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Table footer ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 10,
          padding: '0 4px',
          fontSize: 11,
          color: T.faint,
        }}
      >
        <span>
          Showing {sorted.length} peers · click a row to inspect · reputation &lt; 0.30 triggers auto-deactivation
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={11} strokeWidth={2} color={T.success} />
          <span>Peer network healthy · last check 8s ago</span>
        </div>
      </div>

      {/* ── Detail drawer ──────────────────────────────────────────────────── */}
      {selectedPeer && (
        <DetailDrawer peer={selectedPeer} onClose={() => setSelectedPeer(null)} />
      )}

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      {showAddDialog && <AddPeerDialog onClose={() => setShowAddDialog(false)} />}
      {showBulkDialog && <BulkImportDialog onClose={() => setShowBulkDialog(false)} />}
    </div>
  );
}

export default AdmPeerP1Roster;
