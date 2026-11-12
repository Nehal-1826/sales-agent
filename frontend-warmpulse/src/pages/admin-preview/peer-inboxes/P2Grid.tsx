/**
 * Admin Peer Inboxes Design Candidate: P2 Capacity Grid
 *
 * "Capacity Grid" — card grid of peer mailboxes, each a glass tile with a
 * prominent SVG capacity ring + reputation bar + provider chip + status dot.
 * Stats summary strip → filter chips + sort → responsive peer card grid →
 * click-a-card detail drawer (Deactivate / Test actions).
 *
 * Self-contained: inline style={{}} only, mock data only, no API / react-query
 * / @/features / @/lib/api imports. Aurora Glass palette: orange accent #F26522
 * → #FF8A4B, success #3ddc97, danger #ff5c7a, warning #FF8A4B.
 * No purple / violet / blue / teal / cyan / indigo / pink / random hsl().
 */

import { useState, useCallback, type CSSProperties } from 'react';
import {
  Plus,
  Upload,
  ChevronDown,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Mail,
  Activity,
  Layers,
  Zap,
  ShieldOff,
  PlayCircle,
  MoreHorizontal,
  Search,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.38)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  surfaceHover: 'rgba(255,255,255,0.07)' as const,
  accent: '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.18)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.14)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.14)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.14)' as const,
  neutral: 'rgba(255,255,255,0.30)' as const,
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
  glassCard: {
    background: 'rgba(255,255,255,0.055)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 14,
  } as CSSProperties,
};

// ─── Types ──────────────────────────────────────────────────────────────────────
type Provider = 'google_ws' | 'office365' | 'yahoo' | 'icloud';
type PeerStatus = 'active' | 'warming' | 'cooling' | 'degraded' | 'offline';

interface PeerInbox {
  id: string;
  email: string;
  provider: Provider;
  status: PeerStatus;
  reputation: number;
  repDelta: number;       // 24-h change
  capacityUsed: number;   // emails sent in last 24h
  capacityTotal: number;  // daily cap
  pool: string | null;
  lastUsed: string;       // relative
  sends24h: number;
  replies24h: number;
  bounceRate: number;     // 0–1
  daysSince: number;      // days in network
}

type SortKey = 'reputation' | 'capacity' | 'lastUsed';
type FilterChip = 'all' | 'google_ws' | 'office365' | 'yahoo' | 'cooling';

// ─── Mock data ──────────────────────────────────────────────────────────────────
const PEERS: PeerInbox[] = [
  {
    id: 'p01', email: 'pulse.ws.alpha@googleworkspace.com', provider: 'google_ws',
    status: 'active', reputation: 0.96, repDelta: +0.02,
    capacityUsed: 148, capacityTotal: 160, pool: 'pool-A',
    lastUsed: '2 min ago', sends24h: 148, replies24h: 31, bounceRate: 0.01, daysSince: 142,
  },
  {
    id: 'p02', email: 'pulse.ws.beta@googleworkspace.com', provider: 'google_ws',
    status: 'active', reputation: 0.93, repDelta: +0.01,
    capacityUsed: 135, capacityTotal: 160, pool: 'pool-A',
    lastUsed: '5 min ago', sends24h: 135, replies24h: 27, bounceRate: 0.02, daysSince: 118,
  },
  {
    id: 'p03', email: 'relay.ent.01@contoso.net', provider: 'office365',
    status: 'active', reputation: 0.91, repDelta: +0.03,
    capacityUsed: 112, capacityTotal: 140, pool: 'pool-B',
    lastUsed: '8 min ago', sends24h: 112, replies24h: 22, bounceRate: 0.02, daysSince: 96,
  },
  {
    id: 'p04', email: 'pulse.ws.gamma@googleworkspace.com', provider: 'google_ws',
    status: 'active', reputation: 0.88, repDelta: -0.01,
    capacityUsed: 122, capacityTotal: 160, pool: 'pool-A',
    lastUsed: '12 min ago', sends24h: 122, replies24h: 19, bounceRate: 0.03, daysSince: 84,
  },
  {
    id: 'p05', email: 'warmup.yh.prime@yahoo.com', provider: 'yahoo',
    status: 'active', reputation: 0.85, repDelta: +0.02,
    capacityUsed: 88, capacityTotal: 100, pool: 'pool-C',
    lastUsed: '18 min ago', sends24h: 88, replies24h: 14, bounceRate: 0.03, daysSince: 71,
  },
  {
    id: 'p06', email: 'relay.ent.02@fabrikam.com', provider: 'office365',
    status: 'active', reputation: 0.82, repDelta: +0.04,
    capacityUsed: 98, capacityTotal: 140, pool: 'pool-B',
    lastUsed: '22 min ago', sends24h: 98, replies24h: 16, bounceRate: 0.04, daysSince: 58,
  },
  {
    id: 'p07', email: 'pulse.ws.delta@googleworkspace.com', provider: 'google_ws',
    status: 'warming', reputation: 0.77, repDelta: +0.06,
    capacityUsed: 48, capacityTotal: 160, pool: null,
    lastUsed: '1 hr ago', sends24h: 48, replies24h: 7, bounceRate: 0.05, daysSince: 12,
  },
  {
    id: 'p08', email: 'warmup.yh.two@yahoo.com', provider: 'yahoo',
    status: 'warming', reputation: 0.74, repDelta: +0.05,
    capacityUsed: 62, capacityTotal: 100, pool: 'pool-C',
    lastUsed: '1 hr ago', sends24h: 62, replies24h: 9, bounceRate: 0.05, daysSince: 8,
  },
  {
    id: 'p09', email: 'relay.ent.03@northwind.io', provider: 'office365',
    status: 'cooling', reputation: 0.79, repDelta: -0.03,
    capacityUsed: 0, capacityTotal: 140, pool: 'pool-B',
    lastUsed: '6 hr ago', sends24h: 0, replies24h: 0, bounceRate: 0.07, daysSince: 45,
  },
  {
    id: 'p10', email: 'pulse.ws.epsilon@googleworkspace.com', provider: 'google_ws',
    status: 'degraded', reputation: 0.61, repDelta: -0.08,
    capacityUsed: 24, capacityTotal: 160, pool: 'pool-A',
    lastUsed: '3 hr ago', sends24h: 24, replies24h: 2, bounceRate: 0.14, daysSince: 67,
  },
  {
    id: 'p11', email: 'relay.ent.04@enterprise.ms', provider: 'office365',
    status: 'degraded', reputation: 0.52, repDelta: -0.11,
    capacityUsed: 18, capacityTotal: 140, pool: 'pool-B',
    lastUsed: '4 hr ago', sends24h: 18, replies24h: 1, bounceRate: 0.18, daysSince: 34,
  },
  {
    id: 'p12', email: 'warmup.yh.three@yahoo.com', provider: 'yahoo',
    status: 'degraded', reputation: 0.43, repDelta: -0.14,
    capacityUsed: 10, capacityTotal: 100, pool: null,
    lastUsed: '8 hr ago', sends24h: 10, replies24h: 0, bounceRate: 0.22, daysSince: 22,
  },
  {
    id: 'p13', email: 'icloud.warm.01@icloud.com', provider: 'icloud',
    status: 'warming', reputation: 0.71, repDelta: +0.08,
    capacityUsed: 35, capacityTotal: 80, pool: null,
    lastUsed: '2 hr ago', sends24h: 35, replies24h: 5, bounceRate: 0.06, daysSince: 6,
  },
  {
    id: 'p14', email: 'pulse.ws.zeta@googleworkspace.com', provider: 'google_ws',
    status: 'offline', reputation: 0, repDelta: -0.42,
    capacityUsed: 0, capacityTotal: 160, pool: null,
    lastUsed: '2 days ago', sends24h: 0, replies24h: 0, bounceRate: 0, daysSince: 91,
  },
];

// ─── Derived palette helpers ────────────────────────────────────────────────────
function repColor(rep: number): string {
  if (rep >= 0.85) return T.success;
  if (rep >= 0.70) return T.accentLight;
  if (rep >= 0.50) return T.warning;
  if (rep > 0)     return T.danger;
  return T.neutral;
}

function statusColor(s: PeerStatus): string {
  switch (s) {
    case 'active':   return T.success;
    case 'warming':  return T.accentLight;
    case 'cooling':  return 'rgba(255,255,255,0.50)';
    case 'degraded': return T.danger;
    case 'offline':  return 'rgba(255,255,255,0.22)';
  }
}

function statusBg(s: PeerStatus): string {
  switch (s) {
    case 'active':   return T.successDim;
    case 'warming':  return T.accentDim;
    case 'cooling':  return 'rgba(255,255,255,0.06)';
    case 'degraded': return T.dangerDim;
    case 'offline':  return 'rgba(255,255,255,0.04)';
  }
}

function providerLabel(p: Provider): string {
  switch (p) {
    case 'google_ws': return 'Google WS';
    case 'office365': return 'Office 365';
    case 'yahoo':     return 'Yahoo';
    case 'icloud':    return 'iCloud';
  }
}

function providerColor(p: Provider): string {
  switch (p) {
    case 'google_ws': return T.accentLight;
    case 'office365': return 'rgba(255,255,255,0.60)';
    case 'yahoo':     return T.warning;
    case 'icloud':    return 'rgba(255,255,255,0.50)';
  }
}

function capPct(p: PeerInbox): number {
  if (p.capacityTotal === 0) return 0;
  return Math.min(1, p.capacityUsed / p.capacityTotal);
}

// ─── SVG Capacity Ring ─────────────────────────────────────────────────────────
function CapacityRing({
  pct,
  repScore,
  size = 88,
}: {
  pct: number;
  repScore: number;
  size?: number;
}) {
  const r = (size - 14) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const capDash = pct * circ;
  const repR = r - 10;
  const repCirc = 2 * Math.PI * repR;
  const repDash = repScore * repCirc;
  const trackColor = 'rgba(255,255,255,0.08)';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Outer track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={6} />
      {/* Outer fill — capacity */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={pct > 0.85 ? T.warning : T.accent}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${capDash} ${circ}`}
        strokeDashoffset={0}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      {/* Inner track — reputation */}
      <circle cx={cx} cy={cy} r={repR} fill="none" stroke={trackColor} strokeWidth={4} />
      {/* Inner fill — reputation */}
      <circle
        cx={cx} cy={cy} r={repR}
        fill="none"
        stroke={repColor(repScore)}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${repDash} ${repCirc}`}
        strokeDashoffset={0}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      {/* Centre label */}
      <text x={cx} y={cy - 5} textAnchor="middle" fill={T.text} fontSize={13} fontWeight={700} fontFamily="inherit">
        {Math.round(pct * 100)}%
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" fill={T.faint} fontSize={8} fontFamily="inherit">
        cap
      </text>
    </svg>
  );
}

// ─── Stat strip card ───────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Activity;
  color: string;
}) {
  return (
    <div
      style={{
        ...T.glassCard,
        flex: '1 1 160px',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: `${color}22`,
          border: `1px solid ${color}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={17} color={color} strokeWidth={2.2} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Peer card ──────────────────────────────────────────────────────────────────
function PeerCard({
  peer,
  onClick,
}: {
  peer: PeerInbox;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pct = capPct(peer);
  const sc = statusColor(peer.status);
  const sbg = statusBg(peer.status);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...T.glassCard,
        cursor: 'pointer',
        padding: '18px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 12px 36px rgba(0,0,0,0.36), 0 0 0 1px rgba(242,101,34,0.22)'
          : '0 2px 12px rgba(0,0,0,0.18)',
        transition: 'transform 0.22s ease, box-shadow 0.22s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle gradient sheen */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: hovered
            ? 'linear-gradient(135deg, rgba(242,101,34,0.06) 0%, transparent 60%)'
            : 'transparent',
          borderRadius: 'inherit',
          pointerEvents: 'none',
          transition: 'background 0.22s ease',
        }}
      />

      {/* Top row: status dot + provider chip + more */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: sc,
            flexShrink: 0,
            boxShadow: `0 0 6px ${sc}`,
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: sc,
            background: sbg,
            border: `1px solid ${sc}33`,
            borderRadius: 6,
            padding: '2px 7px',
            textTransform: 'capitalize',
            letterSpacing: '0.04em',
          }}
        >
          {peer.status}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: providerColor(peer.provider),
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 6,
            padding: '2px 7px',
            marginLeft: 'auto',
          }}
        >
          {providerLabel(peer.provider)}
        </span>
      </div>

      {/* Capacity ring + email */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <CapacityRing pct={pct} repScore={peer.reputation} size={88} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: T.text,
              wordBreak: 'break-all',
              lineHeight: 1.35,
            }}
          >
            {peer.email}
          </div>
          {peer.pool && (
            <div style={{ fontSize: 10, color: T.accent, marginTop: 4, fontWeight: 600 }}>
              {peer.pool}
            </div>
          )}
          <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>
            {peer.capacityUsed} / {peer.capacityTotal} today
          </div>
        </div>
      </div>

      {/* Reputation bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: T.dim }}>Reputation</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: repColor(peer.reputation) }}>
            {peer.reputation > 0 ? peer.reputation.toFixed(2) : 'N/A'}
            {peer.repDelta !== 0 && (
              <span
                style={{
                  marginLeft: 4,
                  fontSize: 9,
                  color: peer.repDelta >= 0 ? T.success : T.danger,
                }}
              >
                {peer.repDelta >= 0 ? '+' : ''}
                {peer.repDelta.toFixed(2)}
              </span>
            )}
          </span>
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.max(0, peer.reputation) * 100}%`,
              background: `linear-gradient(90deg, ${repColor(peer.reputation)}, ${repColor(peer.reputation)}cc)`,
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }}
          />
        </div>
      </div>

      {/* Footer: last used + sends */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: `1px solid ${T.hairline}`,
          paddingTop: 10,
          marginTop: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.faint }}>
          <Clock size={9} strokeWidth={2.4} />
          {peer.lastUsed}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 10, color: T.dim }}>
            <span style={{ color: T.accentLight, fontWeight: 700 }}>{peer.sends24h}</span> sent
          </span>
          <span style={{ fontSize: 10, color: T.dim }}>
            <span style={{ color: T.success, fontWeight: 700 }}>{peer.replies24h}</span> rep
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────────────────────
function DetailDrawer({
  peer,
  onClose,
}: {
  peer: PeerInbox;
  onClose: () => void;
}) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testDone, setTestDone] = useState(false);

  const pct = capPct(peer);

  const handleTest = useCallback(() => {
    setTestRunning(true);
    setTestDone(false);
    const t = setTimeout(() => {
      setTestRunning(false);
      setTestDone(true);
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Email', value: peer.email },
    { label: 'Provider', value: providerLabel(peer.provider) },
    { label: 'Pool', value: peer.pool ?? 'Unassigned' },
    { label: 'Status', value: peer.status },
    { label: 'Days in network', value: `${peer.daysSince}d` },
    { label: 'Reputation', value: peer.reputation > 0 ? peer.reputation.toFixed(3) : 'N/A' },
    { label: 'Rep 24h delta', value: `${peer.repDelta >= 0 ? '+' : ''}${peer.repDelta.toFixed(3)}` },
    { label: 'Capacity used', value: `${peer.capacityUsed} / ${peer.capacityTotal}` },
    { label: 'Capacity %', value: `${Math.round(pct * 100)}%` },
    { label: 'Sends (24h)', value: String(peer.sends24h) },
    { label: 'Replies (24h)', value: String(peer.replies24h) },
    { label: 'Bounce rate', value: `${(peer.bounceRate * 100).toFixed(1)}%` },
    { label: 'Last used', value: peer.lastUsed },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.44)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          zIndex: 100,
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(420px, 100vw)',
          background: 'rgba(18,18,26,0.96)',
          borderLeft: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: '20px 22px 16px',
            borderBottom: `1px solid ${T.hairline}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: T.faint, marginBottom: 4 }}>Peer Inbox · {peer.id.toUpperCase()}</div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: T.text,
                wordBreak: 'break-all',
                lineHeight: 1.3,
              }}
            >
              {peer.email}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: statusColor(peer.status),
                  boxShadow: `0 0 5px ${statusColor(peer.status)}`,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: statusColor(peer.status),
                  textTransform: 'capitalize',
                }}
              >
                {peer.status}
              </span>
              <span style={{ fontSize: 10, color: T.faint }}>·</span>
              <span style={{ fontSize: 10, color: providerColor(peer.provider), fontWeight: 600 }}>
                {providerLabel(peer.provider)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.04)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.dim,
              flexShrink: 0,
            }}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>

        {/* Capacity ring + rep ring big display */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '24px 22px 20px',
            gap: 32,
            borderBottom: `1px solid ${T.hairline}`,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <CapacityRing pct={pct} repScore={peer.reputation} size={108} />
            <div style={{ fontSize: 10, color: T.faint, marginTop: 8 }}>Capacity ring (outer)</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: T.dim }}>Reputation score</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: repColor(peer.reputation), lineHeight: 1 }}>
                {peer.reputation > 0 ? peer.reputation.toFixed(2) : 'N/A'}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: peer.repDelta >= 0 ? T.success : T.danger,
                  marginTop: 2,
                }}
              >
                {peer.repDelta >= 0 ? '↑' : '↓'} {Math.abs(peer.repDelta).toFixed(2)} (24h)
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.dim }}>Bounce rate</div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: peer.bounceRate > 0.1 ? T.danger : peer.bounceRate > 0.05 ? T.warning : T.success,
                }}
              >
                {(peer.bounceRate * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Detail rows */}
        <div style={{ padding: '16px 22px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' }}>
            Peer details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map((r) => (
              <div
                key={r.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.025)',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 11, color: T.dim, flexShrink: 0 }}>{r.label}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: T.text,
                    textAlign: 'right',
                    wordBreak: 'break-all',
                  }}
                >
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            padding: '16px 22px',
            borderTop: `1px solid ${T.hairline}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* Test connection */}
          <button
            onClick={handleTest}
            disabled={testRunning}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 0',
              borderRadius: 10,
              border: `1px solid ${T.accent}55`,
              background: T.accentDim,
              color: T.accentLight,
              fontWeight: 700,
              fontSize: 13,
              cursor: testRunning ? 'not-allowed' : 'pointer',
              opacity: testRunning ? 0.7 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            <PlayCircle size={14} strokeWidth={2.4} />
            {testRunning ? 'Testing…' : testDone ? '✓ Connection OK' : 'Test connection'}
          </button>

          {/* Deactivate */}
          {!confirmDeactivate ? (
            <button
              onClick={() => setConfirmDeactivate(true)}
              disabled={peer.status === 'offline'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 0',
                borderRadius: 10,
                border: `1px solid ${T.danger}55`,
                background: T.dangerDim,
                color: T.danger,
                fontWeight: 700,
                fontSize: 13,
                cursor: peer.status === 'offline' ? 'not-allowed' : 'pointer',
                opacity: peer.status === 'offline' ? 0.5 : 1,
              }}
            >
              <ShieldOff size={14} strokeWidth={2.4} />
              Deactivate peer
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmDeactivate(false)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: `1px solid ${T.hairline}`,
                  background: 'rgba(255,255,255,0.04)',
                  color: T.dim,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmDeactivate(false);
                  onClose();
                }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: T.danger,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Confirm deactivate
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Filter chip component ──────────────────────────────────────────────────────
function FilterChipBtn({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 8,
        border: active ? `1px solid ${T.accent}88` : `1px solid ${T.hairline}`,
        background: active ? T.accentDim : 'rgba(255,255,255,0.04)',
        color: active ? T.accentLight : T.dim,
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: active ? T.accent : T.faint,
          background: active ? 'rgba(242,101,34,0.18)' : 'rgba(255,255,255,0.06)',
          borderRadius: 4,
          padding: '1px 5px',
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
export function AdmPeerP2Grid() {
  const [filter, setFilter] = useState<FilterChip>('all');
  const [sort, setSort] = useState<SortKey>('reputation');
  const [sortOpen, setSortOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedPeer = selectedId ? (PEERS.find((p) => p.id === selectedId) ?? null) : null;

  // Filter counts
  const counts: Record<FilterChip, number> = {
    all: PEERS.length,
    google_ws: PEERS.filter((p) => p.provider === 'google_ws').length,
    office365: PEERS.filter((p) => p.provider === 'office365').length,
    yahoo: PEERS.filter((p) => p.provider === 'yahoo').length,
    cooling: PEERS.filter((p) => p.status === 'cooling' || p.status === 'warming').length,
  };

  // Stats
  const activePeers = PEERS.filter((p) => p.status === 'active');
  const avgRep =
    PEERS.filter((p) => p.reputation > 0).reduce((s, p) => s + p.reputation, 0) /
    (PEERS.filter((p) => p.reputation > 0).length || 1);
  const totalCap = PEERS.reduce((s, p) => s + p.capacityTotal, 0);
  const usedCap = PEERS.reduce((s, p) => s + p.capacityUsed, 0);

  // Filtered + sorted list
  const visible = PEERS.filter((p) => {
    const matchFilter =
      filter === 'all' ||
      (filter === 'cooling' ? p.status === 'cooling' || p.status === 'warming' : p.provider === filter);
    const matchSearch =
      search === '' ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      (p.pool ?? '').toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  }).sort((a, b) => {
    if (sort === 'reputation') return b.reputation - a.reputation;
    if (sort === 'capacity') return capPct(b) - capPct(a);
    // lastUsed: active first, offline last, else by sends desc
    const statusOrder: Record<PeerStatus, number> = {
      active: 0, warming: 1, cooling: 2, degraded: 3, offline: 4,
    };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  const sortLabels: Record<SortKey, string> = {
    reputation: 'By reputation',
    capacity: 'By capacity %',
    lastUsed: 'By last used',
  };

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '28px 28px 48px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: T.text,
        boxSizing: 'border-box',
      }}
    >
      {/* ── Page header ──────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: T.faint, marginBottom: 4, letterSpacing: '0.04em' }}>
            Admin · Peer Inboxes
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: T.text, lineHeight: 1.15 }}>
            Peer-Inbox Network
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: T.dim }}>
            System-owned mailboxes powering the warmup engine · {PEERS.length} peers in network
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 10,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.05)',
              color: T.dim,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Upload size={13} strokeWidth={2.4} />
            Bulk import
          </button>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 10,
              border: 'none',
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 4px 14px ${T.accent}55`,
            }}
          >
            <Plus size={13} strokeWidth={2.4} />
            Add peer
          </button>
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Total peers"
          value={String(PEERS.length)}
          sub={`${activePeers.length} active`}
          icon={Layers}
          color={T.accentLight}
        />
        <StatCard
          label="Avg reputation"
          value={avgRep.toFixed(2)}
          sub="across active peers"
          icon={Activity}
          color={repColor(avgRep)}
        />
        <StatCard
          label="Capacity used"
          value={`${Math.round((usedCap / Math.max(totalCap, 1)) * 100)}%`}
          sub={`${usedCap} / ${totalCap} today`}
          icon={Zap}
          color={usedCap / Math.max(totalCap, 1) > 0.85 ? T.danger : T.accent}
        />
        <StatCard
          label="Sends (24h)"
          value={PEERS.reduce((s, p) => s + p.sends24h, 0).toLocaleString()}
          sub={`${PEERS.reduce((s, p) => s + p.replies24h, 0)} replies`}
          icon={Mail}
          color={T.success}
        />
        <StatCard
          label="Degraded / offline"
          value={String(PEERS.filter((p) => p.status === 'degraded' || p.status === 'offline').length)}
          sub="need attention"
          icon={AlertTriangle}
          color={PEERS.some((p) => p.status === 'offline') ? T.danger : T.warning}
        />
      </div>

      {/* ── Toolbar: filters + search + sort ─────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        {/* Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 8,
            border: `1px solid ${T.hairline}`,
            background: 'rgba(255,255,255,0.04)',
            minWidth: 200,
          }}
        >
          <Search size={12} strokeWidth={2.4} color={T.faint} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or pool…"
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: T.text,
              fontSize: 12,
              width: '100%',
            }}
          />
        </div>

        {/* Filter chips */}
        <FilterChipBtn label="All" active={filter === 'all'} count={counts.all} onClick={() => setFilter('all')} />
        <FilterChipBtn label="Google WS" active={filter === 'google_ws'} count={counts.google_ws} onClick={() => setFilter('google_ws')} />
        <FilterChipBtn label="Office 365" active={filter === 'office365'} count={counts.office365} onClick={() => setFilter('office365')} />
        <FilterChipBtn label="Yahoo" active={filter === 'yahoo'} count={counts.yahoo} onClick={() => setFilter('yahoo')} />
        <FilterChipBtn label="Cooling / Warming" active={filter === 'cooling'} count={counts.cooling} onClick={() => setFilter('cooling')} />

        {/* Sort dropdown */}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            onClick={() => setSortOpen((o) => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              border: `1px solid ${T.hairline}`,
              background: 'rgba(255,255,255,0.04)',
              color: T.dim,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <MoreHorizontal size={12} strokeWidth={2.4} />
            {sortLabels[sort]}
            <ChevronDown
              size={11}
              strokeWidth={2.4}
              style={{ transform: sortOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            />
          </button>
          {sortOpen && (
            <div
              style={{
                position: 'absolute',
                top: '110%',
                right: 0,
                ...T.glassTight,
                background: 'rgba(20,20,30,0.94)',
                border: `1px solid ${T.hairline}`,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                minWidth: 160,
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              {(Object.keys(sortLabels) as SortKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setSort(k);
                    setSortOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '9px 14px',
                    textAlign: 'left',
                    border: 'none',
                    background: sort === k ? T.accentDim : 'transparent',
                    color: sort === k ? T.accentLight : T.dim,
                    fontSize: 12,
                    fontWeight: sort === k ? 700 : 400,
                    cursor: 'pointer',
                    borderBottom: `1px solid ${T.hairline}`,
                  }}
                >
                  {sortLabels[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Peer card grid ───────────────────────────── */}
      {visible.length === 0 ? (
        <div
          style={{
            ...T.glass,
            padding: '40px 24px',
            textAlign: 'center',
            color: T.faint,
            fontSize: 13,
          }}
        >
          No peers match the current filter.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          {visible.map((peer) => (
            <PeerCard
              key={peer.id}
              peer={peer}
              onClick={() => setSelectedId(peer.id)}
            />
          ))}
        </div>
      )}

      {/* ── Legend strip ────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 28,
          padding: '12px 16px',
          ...T.glassTight,
          fontSize: 10,
          color: T.faint,
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 700, color: T.dim, marginRight: 4 }}>Ring guide:</span>
        <span>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: T.accent, marginRight: 4, verticalAlign: 'middle' }} />
          Outer = capacity used
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: T.success, marginRight: 4, verticalAlign: 'middle' }} />
          Inner = reputation
        </span>
        <span style={{ marginLeft: 8, fontWeight: 700, color: T.dim }}>Rep bands:</span>
        {[
          { label: '≥ 0.85', color: T.success },
          { label: '0.70–0.85', color: T.accentLight },
          { label: '0.50–0.70', color: T.warning },
          { label: '< 0.50', color: T.danger },
        ].map((b) => (
          <span key={b.label}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: b.color,
                marginRight: 4,
                verticalAlign: 'middle',
              }}
            />
            {b.label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={11} color={T.success} />
          <span>active</span>
          <AlertTriangle size={11} color={T.warning} />
          <span>cooling/warming</span>
          <XCircle size={11} color={T.danger} />
          <span>degraded/offline</span>
        </span>
      </div>

      {/* ── Detail drawer (portal-style) ──────────── */}
      {selectedPeer && (
        <DetailDrawer peer={selectedPeer} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
