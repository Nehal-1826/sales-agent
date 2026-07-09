import { useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  Mail,
  Server,
  Settings,
  Shield,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Mock data — fully inline, no API
// ---------------------------------------------------------------------------

const SENDS_TREND: { day: string; sends: number }[] = [
  { day: 'May 18', sends: 58_210 },
  { day: 'May 19', sends: 61_440 },
  { day: 'May 20', sends: 55_800 },
  { day: 'May 21', sends: 63_990 },
  { day: 'May 22', sends: 67_120 },
  { day: 'May 23', sends: 59_500 },
  { day: 'May 24', sends: 52_300 },
  { day: 'May 25', sends: 64_750 },
  { day: 'May 26', sends: 68_920 },
  { day: 'May 27', sends: 70_100 },
  { day: 'May 28', sends: 66_430 },
  { day: 'May 29', sends: 69_880 },
  { day: 'May 30', sends: 70_950 },
  { day: 'May 31', sends: 71_540 },
];

type SubsystemStatus = 'ok' | 'warn' | 'error';

interface Subsystem {
  id: string;
  name: string;
  status: SubsystemStatus;
  metric: string;
  icon: typeof Server;
}

const SUBSYSTEMS: Subsystem[] = [
  { id: 'api',    name: 'API',           status: 'ok',   metric: '38ms p95',     icon: Zap },
  { id: 'worker', name: 'Worker',        status: 'ok',   metric: '4 active',     icon: Layers },
  { id: 'beat',   name: 'Beat',          status: 'ok',   metric: '41s ago',      icon: Clock },
  { id: 'pg',     name: 'Postgres',      status: 'ok',   metric: '12 conns',     icon: Database },
  { id: 'redis',  name: 'Redis',         status: 'ok',   metric: '0.4ms',        icon: Server },
  { id: 'smtp',   name: 'SMTP / IMAP',   status: 'warn', metric: '2 peers failing', icon: Mail },
];

type AlertSeverity = 'ok' | 'warn' | 'error';

interface AlertItem {
  id: string;
  severity: AlertSeverity;
  message: string;
  ts: string;
}

const ALERTS: AlertItem[] = [
  { id: 'a1', severity: 'warn', message: '2 peer inboxes below reputation floor', ts: '4 min ago' },
  { id: 'a2', severity: 'ok',   message: 'Daily rollup completed (30 mailboxes)',  ts: '12 min ago' },
  { id: 'a3', severity: 'warn', message: 'Quota near cap: 3 mailboxes at 95%+',   ts: '38 min ago' },
  { id: 'a4', severity: 'ok',   message: 'Beat heartbeat healthy (41s ago)',       ts: '1 hr ago' },
];

// ---------------------------------------------------------------------------
// Color tokens (warm + neutral, NO blue/purple/violet/teal/cyan)
// ---------------------------------------------------------------------------
const C = {
  ok:       '#3ddc97',
  warn:     '#F26522',
  warnMid:  '#FF8A4B',
  error:    '#ff5c7a',
  text:     '#ffffff',
  dim:      'rgba(255,255,255,0.62)',
  faint:    'rgba(255,255,255,0.38)',
  glass:    'rgba(255,255,255,0.05)',
  glassMid: 'rgba(255,255,255,0.08)',
  border:   '1px solid rgba(255,255,255,0.10)',
  borderOk: '1px solid rgba(61,220,151,0.30)',
  borderW:  '1px solid rgba(242,101,34,0.35)',
} as const;

const statusColor: Record<SubsystemStatus | AlertSeverity, string> = {
  ok:    C.ok,
  warn:  C.warn,
  error: C.error,
};

// ---------------------------------------------------------------------------
// Tiny sparkline — pure SVG, area fill
// ---------------------------------------------------------------------------
function SparkArea({ data }: { data: { sends: number }[] }) {
  const W = 340;
  const H = 72;
  const pad = 4;
  const max = Math.max(...data.map((d) => d.sends));
  const min = Math.min(...data.map((d) => d.sends));
  const range = max - min || 1;

  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((d.sends - min) / range) * (H - pad * 2);
    return [x, y] as [number, number];
  });

  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1]![0]},${H} L${pts[0]![0]},${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: H, display: 'block' }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="hh-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={C.ok} stopOpacity={0.28} />
          <stop offset="100%" stopColor={C.ok} stopOpacity={0.00} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#hh-area-grad)" />
      <path d={linePath} fill="none" stroke={C.ok} strokeWidth={1.8} strokeLinejoin="round" />
      {/* last-day dot */}
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={3.5} fill={C.ok} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Health ring — SVG conic-gradient approximated with a stroked arc
// ---------------------------------------------------------------------------
function HealthRing({ score }: { score: number }) {
  const r = 72;
  const cx = 90;
  const cy = 90;
  const stroke = 10;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  // Animated counter
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 1200;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplayed(Math.round(score * ease));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
      <svg viewBox="0 0 180 180" style={{ width: 180, height: 180 }}>
        {/* track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {/* arc */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={C.ok}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 6px ${C.ok}66)` }}
        />
      </svg>
      {/* centre label */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: C.ok, lineHeight: 1 }}>
          {displayed}%
        </span>
        <span style={{ fontSize: 10, color: C.dim, marginTop: 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          health
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pulse dot — animated breathing circle
// ---------------------------------------------------------------------------
function PulseDot({ color }: { color: string }) {
  const [scale, setScale] = useState(1);
  const dir = useRef(1);
  useEffect(() => {
    const id = setInterval(() => {
      setScale((s) => {
        const next = s + dir.current * 0.06;
        if (next >= 1.35) dir.current = -1;
        if (next <= 1.00) dir.current = 1;
        return next;
      });
    }, 60);
    return () => clearInterval(id);
  }, []);

  return (
    <span style={{
      display: 'inline-block',
      width: 8, height: 8,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 6px ${color}88`,
      transform: `scale(${scale})`,
      flexShrink: 0,
    }} />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdmDshD3HealthHub() {
  const SCORE = 96;

  // inline KPI strip in hero
  const HERO_KPIS = [
    { label: 'Sends today',       value: '71,540' },
    { label: 'Active mailboxes',  value: '3,910' },
    { label: 'Avg inbox rate',    value: '92%' },
    { label: 'MRR',               value: '$48,250' },
  ] as const;

  // quick actions
  const ACTIONS = [
    { label: 'Manage peers',   icon: Shield,   path: '/admin/peer-inboxes' },
    { label: 'Review users',   icon: Users,    path: '/admin/users' },
    { label: 'View audit log', icon: Activity, path: '/admin/audit' },
    { label: 'System settings',icon: Settings, path: '/admin/settings' },
  ] as const;

  // delta badge
  const sendsDelta = '+3.7%';
  const sendsToday = '71,540';

  return (
    <div style={{
      padding: '28px 28px 40px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      minHeight: '100%',
      boxSizing: 'border-box',
      color: C.text,
      fontFamily: 'inherit',
    }}>

      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: C.text }}>
            Platform health
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.ok, boxShadow: `0 0 5px ${C.ok}` }} />
            All systems nominal&nbsp;·&nbsp;updated 12s ago
          </p>
        </div>
        <div style={{
          background: 'rgba(61,220,151,0.10)',
          border: C.borderOk,
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          color: C.ok,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 600,
        }}>
          <CheckCircle2 size={13} strokeWidth={2.4} />
          Score&nbsp;<strong style={{ fontSize: 14 }}>{SCORE}%</strong>
        </div>
      </div>

      {/* ── HERO CARD — ring + KPIs ──────────────────────────────────────── */}
      <div style={{
        background: C.glass,
        border: C.border,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: 18,
        padding: '28px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 32,
        flexWrap: 'wrap',
      }}>
        {/* ring */}
        <HealthRing score={SCORE} />

        {/* right side */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.dim, marginBottom: 6 }}>
            Overall status
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: C.text }}>
            Everything's running smoothly
          </h2>
          <p style={{ margin: '0 0 22px', fontSize: 13, color: C.dim }}>
            1 subsystem on watch — SMTP / IMAP probe reporting 2 failing peers.
          </p>

          {/* KPI chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {HERO_KPIS.map((kpi) => (
              <div key={kpi.label} style={{
                background: C.glassMid,
                border: C.border,
                borderRadius: 10,
                padding: '8px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{kpi.value}</span>
                <span style={{ fontSize: 11, color: C.dim }}>{kpi.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SUBSYSTEM STATUS ROW ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12 }}>
        {SUBSYSTEMS.map((sub) => {
          const color = statusColor[sub.status];
          const isWarn = sub.status === 'warn';
          const SubIcon = sub.icon;
          return (
            <div key={sub.id} style={{
              background: isWarn ? 'rgba(242,101,34,0.07)' : C.glass,
              border: isWarn ? C.borderW : C.border,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 14,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              {/* icon + status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SubIcon size={16} color={isWarn ? C.warn : C.dim} strokeWidth={2} />
                {sub.status === 'ok'
                  ? <PulseDot color={C.ok} />
                  : <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 600, color: C.warn,
                      background: 'rgba(242,101,34,0.15)', borderRadius: 4, padding: '2px 6px',
                    }}>
                      <AlertTriangle size={9} strokeWidth={2.5} />
                      WARN
                    </span>
                }
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: isWarn ? C.warnMid : C.text }}>
                  {sub.name}
                </div>
                <div style={{ fontSize: 11, color: isWarn ? C.warnMid : C.dim, marginTop: 2 }}>
                  {sub.metric}
                </div>
              </div>
              {/* tiny status bar */}
              <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: sub.status === 'warn' ? '62%' : '100%',
                  background: color,
                  borderRadius: 99,
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── SPLIT ROW: Trend | Alerts ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Sends trend */}
        <div style={{
          background: C.glass,
          border: C.border,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: 16,
          padding: '20px 22px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                Sends trend · 14 days
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>
                  {sendsToday}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: C.ok,
                  background: 'rgba(61,220,151,0.12)', borderRadius: 6, padding: '2px 7px',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <TrendingUp size={10} strokeWidth={2.5} />
                  {sendsDelta}
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>today vs. yesterday</div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(61,220,151,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <TrendingUp size={15} color={C.ok} strokeWidth={2.2} />
            </div>
          </div>

          {/* Sparkline */}
          <div style={{ marginTop: 4 }}>
            <SparkArea data={SENDS_TREND} />
            {/* x-axis labels — first + last */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: C.faint }}>{SENDS_TREND[0]!.day}</span>
              <span style={{ fontSize: 10, color: C.faint }}>{SENDS_TREND[SENDS_TREND.length - 1]!.day}</span>
            </div>
          </div>
        </div>

        {/* Alerts list */}
        <div style={{
          background: C.glass,
          border: C.border,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: 16,
          padding: '20px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          minWidth: 0,
        }}>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Recent alerts
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {ALERTS.map((alert, i) => {
              const color = statusColor[alert.severity];
              const isLast = i === ALERTS.length - 1;
              return (
                <div key={alert.id} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  paddingBottom: isLast ? 0 : 12,
                  marginBottom: isLast ? 0 : 12,
                  borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)',
                }}>
                  {/* dot */}
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: color,
                    boxShadow: `0 0 5px ${color}66`,
                    marginTop: 4,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{alert.message}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{alert.ts}</div>
                  </div>
                  {alert.severity === 'warn' && (
                    <AlertTriangle size={13} color={C.warn} strokeWidth={2.2} style={{ marginTop: 2, flexShrink: 0 }} />
                  )}
                  {alert.severity === 'ok' && (
                    <CheckCircle2 size={13} color={C.ok} strokeWidth={2.2} style={{ marginTop: 2, flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── QUICK ACTIONS ROW ───────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
          Quick actions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {ACTIONS.map((action) => {
            const ActionIcon = action.icon;
            return (
            <a
              key={action.label}
              href={action.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: C.glass,
                border: C.border,
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                borderRadius: 14,
                padding: '14px 16px',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = C.glassMid;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = C.glass;
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: 'rgba(242,101,34,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <ActionIcon size={15} color={C.warnMid} strokeWidth={2.1} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{action.label}</span>
              </div>
              <ArrowRight size={14} color={C.faint} strokeWidth={2} />
            </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
