/**
 * Admin Dashboard — D2 Bento Grid
 *
 * Asymmetric bento-tile layout for the WarmPulse admin Platform Overview.
 * Self-contained: inline styles only, mock data only, no API imports.
 * Rendered inside the admin preview shell's dark canvas.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Mail,
  DollarSign,
  Users,
  Inbox,
  Database,
  Building2,
  Clock,
  TrendingUp,
} from 'lucide-react';

// ─── Design tokens (inline) ─────────────────────────────────────────────────
const T = {
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,
  text: '#fff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.42)',
  accent: '#F26522',
  success: '#3ddc97',
  micro:
    ({
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.42)',
    } as CSSProperties),
};

// ─── Mock data ───────────────────────────────────────────────────────────────

// 14-day sends history
const SENDS_DATA: Array<{ day: string; sends: number }> = [
  { day: 'May 18', sends: 54200 },
  { day: 'May 19', sends: 57800 },
  { day: 'May 20', sends: 53100 },
  { day: 'May 21', sends: 61400 },
  { day: 'May 22', sends: 59700 },
  { day: 'May 23', sends: 48300 },
  { day: 'May 24', sends: 52100 },
  { day: 'May 25', sends: 63800 },
  { day: 'May 26', sends: 66500 },
  { day: 'May 27', sends: 69200 },
  { day: 'May 28', sends: 64900 },
  { day: 'May 29', sends: 72100 },
  { day: 'May 30', sends: 68800 },
  { day: 'May 31', sends: 71540 },
];

// MRR trend (7 points for sparkline)
const MRR_SPARK: number[] = [42100, 43500, 44200, 45800, 46300, 47100, 48250];

// Users trend
const USERS_SPARK: number[] = [1140, 1170, 1195, 1210, 1240, 1268, 1284];

// Plan mix
interface PlanSlice {
  name: string;
  count: number;
  color: string;
}
const PLAN_MIX: PlanSlice[] = [
  { name: 'Starter', count: 540, color: 'rgba(255,255,255,0.28)' },
  { name: 'Pro', count: 410, color: '#FF8A4B' },
  { name: 'Pro Plus', count: 220, color: '#F26522' },
  { name: 'Agency', count: 114, color: '#3ddc97' },
];
const PLAN_TOTAL = PLAN_MIX.reduce((s, p) => s + p.count, 0);

// Recent activity
interface ActivityItem {
  label: string;
  sub: string;
  tone: string;
  ts: string;
}
const ACTIVITY: ActivityItem[] = [
  { label: 'New Agency signup', sub: 'Northwind Inc.', tone: '#3ddc97', ts: '2m ago' },
  { label: 'Peer pool O365 at 81%', sub: 'Pool capacity alert', tone: '#FF8A4B', ts: '7m ago' },
  { label: 'Mailbox warmed to 90%', sub: 'lumen.co · Day 28', tone: '#F26522', ts: '12m ago' },
  { label: 'Pro Plus upgrade', sub: 'acme-ventures.io', tone: '#3ddc97', ts: '18m ago' },
  { label: 'Peer reputation drop', sub: 'yahoo-peer-07 → 0.31', tone: '#ff5c7a', ts: '34m ago' },
  { label: 'Beat heartbeat OK', sub: 'Worker · celery beat alive', tone: 'rgba(255,255,255,0.42)', ts: '1m ago' },
  { label: 'Daily rollup complete', sub: '1,284 mailboxes logged', tone: 'rgba(255,255,255,0.42)', ts: '2h ago' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Animated counter — ticks 0 → target on mount
function Ctr({
  to,
  prefix = '',
  suffix = '',
  decimals = 0,
  dur = 1.4,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  dur?: number;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (dur * 1000));
      const e = 1 - Math.pow(1 - p, 3);
      setN(to * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, dur]);
  return (
    <>
      {prefix}
      {n.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </>
  );
}

// Inline SVG sparkline — warm accent
function Spark({ data, color = '#F26522' }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const W = 80;
  const H = 28;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4);
      return `${x},${y}`;
    })
    .join(' ');
  const fillPts = `0,${H} ${pts} ${W},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, overflow: 'visible' }}>
      <defs>
        <linearGradient id={`spk-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={fillPts}
        fill={`url(#spk-${color.replace('#', '')})`}
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Circular ring progress — SVG donut
function Ring({
  pct,
  size = 96,
  stroke = 8,
  color = '#F26522',
  label,
  sub,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: string;
  sub: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: size, height: size, transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 1s ease-out' }}
        />
      </svg>
      <div style={{ textAlign: 'center', marginTop: -4 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, lineHeight: 1 }}>{label}</div>
        <div style={{ fontSize: 11, color: T.dim, marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  );
}

// Glass tile wrapper
function Tile({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        ...T.glass,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Micro label
function MicroLabel({ children }: { children: ReactNode }) {
  return <div style={T.micro}>{children}</div>;
}

// Recharts custom tooltip
function SendsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div
      style={{
        background: 'rgba(20,20,28,0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 12,
      }}
    >
      <div style={{ color: T.dim, marginBottom: 2 }}>{label}</div>
      <div style={{ color: T.accent, fontWeight: 700 }}>
        {val.toLocaleString()} sends
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AdmDshD2Bento() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const inboxPct = 92;
  const poolPct = 78;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 4px 32px',
        color: T.text,
        fontFamily: 'inherit',
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <TrendingUp
            size={16}
            strokeWidth={2.4}
            style={{ color: T.accent }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: T.accent,
            }}
          >
            Admin
          </span>
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            lineHeight: 1.15,
            color: T.text,
          }}
        >
          Platform overview
        </h1>
        <p style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
          Warmup engine · peer network · revenue · 31 May 2026
        </p>
      </div>

      {/* ── Bento grid ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridTemplateRows: 'auto',
          gap: 14,
        }}
      >
        {/* ── HERO: Sends area chart (2 col × 2 row) ── */}
        <Tile
          style={{
            gridColumn: '1 / 3',
            gridRow: '1 / 3',
            minHeight: 280,
          }}
        >
          {/* Accent glow top-right */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 180,
              height: 180,
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(242,101,34,0.18) 0%, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <MicroLabel>
                <Mail size={9} style={{ display: 'inline', marginRight: 4 }} />
                Sends · last 14 days
              </MicroLabel>
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: T.text,
                  lineHeight: 1.1,
                  marginTop: 6,
                }}
              >
                {mounted ? <Ctr to={71540} /> : '0'}
              </div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>
                sends today
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(61,220,151,0.12)',
                border: '1px solid rgba(61,220,151,0.25)',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: T.success,
                whiteSpace: 'nowrap',
              }}
            >
              <TrendingUp size={11} />
              +8.4%
            </div>
          </div>

          {/* Chart */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart
                data={SENDS_DATA}
                margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="sends-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F26522" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.38)' }}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.38)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip content={<SendsTooltip />} />
                <Area
                  type="monotone"
                  dataKey="sends"
                  stroke="#F26522"
                  strokeWidth={2}
                  fill="url(#sends-fill)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#F26522', stroke: '#fff', strokeWidth: 1.5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Tile>

        {/* ── MRR tile (col 3, row 1) ── */}
        <Tile style={{ gridColumn: '3 / 4', gridRow: '1 / 2' }}>
          <MicroLabel>
            <DollarSign size={9} style={{ display: 'inline', marginRight: 3 }} />
            Monthly Recurring Revenue
          </MicroLabel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: T.text,
                }}
              >
                {mounted ? <Ctr to={48250} prefix="$" /> : '$0'}
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.success,
                  background: 'rgba(61,220,151,0.12)',
                  border: '1px solid rgba(61,220,151,0.2)',
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                <TrendingUp size={10} />
                +4.1% MoM
              </div>
            </div>
            <Spark data={MRR_SPARK} color="#F26522" />
          </div>
        </Tile>

        {/* ── Users tile (col 4, row 1) ── */}
        <Tile style={{ gridColumn: '4 / 5', gridRow: '1 / 2' }}>
          <MicroLabel>
            <Users size={9} style={{ display: 'inline', marginRight: 3 }} />
            Total Users
          </MicroLabel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: T.text,
                }}
              >
                {mounted ? <Ctr to={1284} /> : '0'}
              </div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
                +79 new (7d)
              </div>
            </div>
            <Spark data={USERS_SPARK} color="#FF8A4B" />
          </div>
        </Tile>

        {/* ── Inbox Placement ring (col 3, row 2) ── */}
        <Tile
          style={{
            gridColumn: '3 / 4',
            gridRow: '2 / 3',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MicroLabel>
            <Inbox size={9} style={{ display: 'inline', marginRight: 3 }} />
            Inbox Placement
          </MicroLabel>
          <Ring
            pct={mounted ? inboxPct : 0}
            size={90}
            stroke={7}
            color="#F26522"
            label="92%"
            sub="inbox rate"
          />
        </Tile>

        {/* ── Pool Capacity ring (col 4, row 2) ── */}
        <Tile
          style={{
            gridColumn: '4 / 5',
            gridRow: '2 / 3',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MicroLabel>
            <Database size={9} style={{ display: 'inline', marginRight: 3 }} />
            Pool Capacity
          </MicroLabel>
          <Ring
            pct={mounted ? poolPct : 0}
            size={90}
            stroke={7}
            color="#FF8A4B"
            label="78%"
            sub="utilisation"
          />
        </Tile>

        {/* ── Plan mix tile (col 1-3, row 3) ── */}
        <Tile style={{ gridColumn: '1 / 4', gridRow: '3 / 4' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <MicroLabel>
              <Building2 size={9} style={{ display: 'inline', marginRight: 3 }} />
              Plan Mix · {PLAN_TOTAL.toLocaleString()} accounts
            </MicroLabel>
          </div>

          {/* Stacked bar */}
          <div
            style={{
              display: 'flex',
              height: 12,
              borderRadius: 999,
              overflow: 'hidden',
              gap: 2,
            }}
          >
            {PLAN_MIX.map((p) => (
              <div
                key={p.name}
                title={`${p.name}: ${p.count}`}
                style={{
                  width: `${(p.count / PLAN_TOTAL) * 100}%`,
                  background: p.color,
                  borderRadius: 999,
                  transition: 'width 0.9s ease-out',
                }}
              />
            ))}
          </div>

          {/* Legend */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              flexWrap: 'wrap',
              marginTop: 2,
            }}
          >
            {PLAN_MIX.map((p) => (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: p.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: T.dim }}>{p.name}</span>
                <span style={{ color: T.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {p.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Tile>

        {/* ── Recent Activity feed (col 4, row 3-4) ── */}
        <Tile
          style={{
            gridColumn: '4 / 5',
            gridRow: '3 / 5',
            minHeight: 200,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>
              <Clock size={9} style={{ display: 'inline', marginRight: 3 }} />
              Recent Activity
            </MicroLabel>
            {/* live dot */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: T.success,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: T.success,
                  boxShadow: `0 0 6px ${T.success}`,
                }}
              />
              live
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, overflow: 'hidden' }}>
            {ACTIVITY.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '9px 0',
                  borderBottom:
                    i < ACTIVITY.length - 1
                      ? '1px solid rgba(255,255,255,0.06)'
                      : 'none',
                }}
              >
                {/* Colored dot */}
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: item.tone,
                    flexShrink: 0,
                    marginTop: 4,
                    boxShadow:
                      item.tone !== 'rgba(255,255,255,0.42)'
                        ? `0 0 5px ${item.tone}70`
                        : 'none',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: T.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{item.sub}</div>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: T.faint,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    marginTop: 2,
                  }}
                >
                  {item.ts}
                </div>
              </div>
            ))}
          </div>
        </Tile>

        {/* ── Extended plan context (col 1-3, row 4) ── */}
        <Tile
          style={{
            gridColumn: '1 / 4',
            gridRow: '4 / 5',
            flexDirection: 'row',
            gap: 0,
            padding: 0,
            overflow: 'visible',
          }}
        >
          {/* 4 mini KPI chips */}
          {[
            {
              icon: Building2,
              label: 'Starter',
              value: 540,
              share: 42,
              color: 'rgba(255,255,255,0.28)',
            },
            {
              icon: Building2,
              label: 'Pro',
              value: 410,
              share: 32,
              color: '#FF8A4B',
            },
            {
              icon: Building2,
              label: 'Pro Plus',
              value: 220,
              share: 17,
              color: '#F26522',
            },
            {
              icon: Building2,
              label: 'Agency',
              value: 114,
              share: 9,
              color: '#3ddc97',
            },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '18px 20px',
                  borderRight:
                    i < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ ...T.micro, fontSize: 9 }}>{item.label}</span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      background: `${item.color}20`,
                    }}
                  >
                    <Icon size={12} style={{ color: item.color }} />
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: T.text,
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {mounted ? <Ctr to={item.value} dur={1.0} /> : item.value}
                </div>
                {/* mini progress bar */}
                <div
                  style={{
                    height: 3,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${item.share}%`,
                      height: '100%',
                      background: item.color,
                      borderRadius: 999,
                      transition: 'width 1s ease-out',
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: T.faint }}>{item.share}% of total</div>
              </div>
            );
          })}
        </Tile>
      </div>
    </div>
  );
}

export default AdmDshD2Bento;
