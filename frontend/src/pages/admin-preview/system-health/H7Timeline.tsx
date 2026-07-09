/**
 * Admin System Health Design Candidate: H7 Timeline
 *
 * "Timeline" — time-centric view: a 90-day GitHub-style uptime calendar
 * heatmap (range toggle: 30d / 90d / 12mo), per-subsystem horizontal incident
 * swim-lanes, a metrics strip (uptime %, MTTR, incident count, p95), and an
 * incident detail list with severity badges.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only. Warm/neutral Aurora Glass
 * palette only — no blue/purple/violet/teal/cyan/indigo/pink.
 */

import { useState, useCallback, type CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Network,
  Server,
  Timer,
  Workflow,
  XCircle,
  ZapOff,
  Mail,
} from 'lucide-react';

// ─── Palette tokens ───────────────────────────────────────────────────────────
const C = {
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.60)',
  faint: 'rgba(255,255,255,0.35)',
  ghost: 'rgba(255,255,255,0.12)',
  hairline: 'rgba(255,255,255,0.08)',
  accent: '#F26522',
  accentLt: '#FF8A4B',
  success: '#3ddc97',
  successDim: 'rgba(61,220,151,0.18)',
  warning: '#FF8A4B',
  warningDim: 'rgba(255,138,75,0.18)',
  danger: '#ff5c7a',
  dangerDim: 'rgba(255,92,122,0.18)',
  neutral: 'rgba(255,255,255,0.06)',
  glass: 'rgba(255,255,255,0.05)',
  glassMid: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderFaint: '1px solid rgba(255,255,255,0.06)',
  radius: 16,
  radiusSm: 10,
  radiusXs: 6,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function glass(extra?: CSSProperties): CSSProperties {
  return {
    background: C.glass,
    border: C.border,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: C.radius,
    ...extra,
  };
}

function glassTight(extra?: CSSProperties): CSSProperties {
  return {
    background: C.glass,
    border: C.border,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: C.radiusSm,
    ...extra,
  };
}

const micro: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: C.faint,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type HeatLevel = 'ok' | 'warn' | 'err' | 'none'; // 'none' = future / empty
type Range = '30d' | '90d' | '12mo';
type Severity = 'critical' | 'high' | 'medium' | 'low';
type IncStatus = 'resolved' | 'monitoring' | 'investigating';

interface DayCell {
  date: string;      // ISO yyyy-mm-dd
  label: string;     // "May 12"
  level: HeatLevel;
  uptime: number;    // 0–100
  incidents: number;
}

interface SubsystemDef {
  id: string;
  name: string;
  icon: typeof Server;
}

interface IncidentBar {
  subsystemId: string;
  incId: string;
  startOffset: number; // 0..1 relative to window
  width: number;       // 0..1 relative to window
  severity: Severity;
  title: string;
}

interface Incident {
  id: string;
  subsystem: string;
  title: string;
  severity: Severity;
  status: IncStatus;
  started: string;
  resolved: string | null;
  durationMin: number;
  affectedServices: string[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const SUBSYSTEMS: SubsystemDef[] = [
  { id: 'api',    name: 'API',          icon: Server       },
  { id: 'worker', name: 'Worker',       icon: Cpu          },
  { id: 'beat',   name: 'Beat',         icon: CalendarClock },
  { id: 'db',     name: 'Postgres',     icon: Database     },
  { id: 'redis',  name: 'Redis',        icon: HardDrive    },
  { id: 'smtp',   name: 'SMTP',         icon: Mail         },
  { id: 'imap',   name: 'IMAP',         icon: Network      },
];

// Shared incidents used across data
const INCIDENTS: Incident[] = [
  {
    id: 'INC-031',
    subsystem: 'Worker',
    title: 'Celery task queue backlog — SMTP queue stalled',
    severity: 'critical',
    status: 'resolved',
    started: '2026-05-28 09:14',
    resolved: '2026-05-28 09:41',
    durationMin: 27,
    affectedServices: ['Worker', 'SMTP', 'IMAP'],
  },
  {
    id: 'INC-030',
    subsystem: 'Postgres',
    title: 'DB connection pool exhausted (peak traffic)',
    severity: 'high',
    status: 'resolved',
    started: '2026-05-24 17:03',
    resolved: '2026-05-24 17:19',
    durationMin: 16,
    affectedServices: ['Postgres', 'API'],
  },
  {
    id: 'INC-029',
    subsystem: 'SMTP',
    title: 'Gmail OAuth token refresh failed for 3 mailboxes',
    severity: 'medium',
    status: 'resolved',
    started: '2026-05-19 11:50',
    resolved: '2026-05-19 12:08',
    durationMin: 18,
    affectedServices: ['SMTP'],
  },
  {
    id: 'INC-028',
    subsystem: 'API',
    title: 'Elevated p95 latency — OOM on uvicorn workers',
    severity: 'high',
    status: 'resolved',
    started: '2026-05-14 08:22',
    resolved: '2026-05-14 08:49',
    durationMin: 27,
    affectedServices: ['API'],
  },
  {
    id: 'INC-027',
    subsystem: 'Redis',
    title: 'Redis eviction — maxmemory-policy triggered',
    severity: 'medium',
    status: 'resolved',
    started: '2026-05-08 14:30',
    resolved: '2026-05-08 14:44',
    durationMin: 14,
    affectedServices: ['Redis', 'Worker'],
  },
  {
    id: 'INC-026',
    subsystem: 'IMAP',
    title: 'IMAP watcher hung — Yahoo IMAP timeout loop',
    severity: 'medium',
    status: 'resolved',
    started: '2026-04-29 06:05',
    resolved: '2026-04-29 06:22',
    durationMin: 17,
    affectedServices: ['IMAP'],
  },
  {
    id: 'INC-025',
    subsystem: 'Beat',
    title: 'Beat heartbeat silent — container OOM-killed',
    severity: 'critical',
    status: 'resolved',
    started: '2026-04-17 02:11',
    resolved: '2026-04-17 02:38',
    durationMin: 27,
    affectedServices: ['Beat', 'Worker'],
  },
  {
    id: 'INC-024',
    subsystem: 'Worker',
    title: 'Worker queue spike — warmup cycle fan-out delay',
    severity: 'low',
    status: 'resolved',
    started: '2026-04-11 15:44',
    resolved: '2026-04-11 16:01',
    durationMin: 17,
    affectedServices: ['Worker'],
  },
  {
    id: 'INC-023',
    subsystem: 'Postgres',
    title: 'Autovacuum stall — write amplification on warmup_logs',
    severity: 'medium',
    status: 'resolved',
    started: '2026-03-28 09:10',
    resolved: '2026-03-28 09:34',
    durationMin: 24,
    affectedServices: ['Postgres'],
  },
  {
    id: 'INC-022',
    subsystem: 'API',
    title: 'Rate-limit middleware regression — 429 flood',
    severity: 'high',
    status: 'resolved',
    started: '2026-03-15 13:00',
    resolved: '2026-03-15 13:22',
    durationMin: 22,
    affectedServices: ['API'],
  },
];

// Generate deterministic calendar cells for the last N days (ending today = 2026-05-31)
function generateCells(days: number): DayCell[] {
  const today = new Date('2026-05-31');
  const cells: DayCell[] = [];

  // Map incident dates to levels
  const incidentDateMap: Record<string, { level: HeatLevel; count: number }> = {
    '2026-05-28': { level: 'err',  count: 1 },
    '2026-05-24': { level: 'warn', count: 1 },
    '2026-05-19': { level: 'warn', count: 1 },
    '2026-05-14': { level: 'warn', count: 1 },
    '2026-05-08': { level: 'warn', count: 1 },
    '2026-04-29': { level: 'warn', count: 1 },
    '2026-04-17': { level: 'err',  count: 1 },
    '2026-04-11': { level: 'warn', count: 1 },
    '2026-03-28': { level: 'warn', count: 1 },
    '2026-03-15': { level: 'warn', count: 1 },
  };

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const mo = d.toLocaleString('default', { month: 'short' });
    const label = `${mo} ${d.getDate()}`;
    const hit = incidentDateMap[iso];
    const level: HeatLevel = hit ? hit.level : 'ok';
    const uptime = level === 'err' ? 94 + Math.random() * 3 : level === 'warn' ? 97 + Math.random() * 2 : 99.9 + Math.random() * 0.1;
    cells.push({ date: iso, label, level, uptime: Math.min(100, uptime), incidents: hit?.count ?? 0 });
  }
  return cells;
}

// Swim-lane incident bars (relative to 90-day window — 0..1)
const SWIM_BARS: IncidentBar[] = [
  // INC-031 Worker: day 89 of 90
  { subsystemId: 'worker', incId: 'INC-031', startOffset: 89/90, width: 1/90, severity: 'critical', title: 'Queue stall' },
  // INC-030 DB: day 83
  { subsystemId: 'db',     incId: 'INC-030', startOffset: 83/90, width: 1/90, severity: 'high',     title: 'Conn pool' },
  // INC-029 SMTP: day 78
  { subsystemId: 'smtp',   incId: 'INC-029', startOffset: 78/90, width: 1/90, severity: 'medium',   title: 'OAuth fail' },
  // INC-028 API: day 73
  { subsystemId: 'api',    incId: 'INC-028', startOffset: 73/90, width: 1/90, severity: 'high',     title: 'p95 spike' },
  // INC-027 Redis: day 67
  { subsystemId: 'redis',  incId: 'INC-027', startOffset: 67/90, width: 1/90, severity: 'medium',   title: 'Eviction' },
  // INC-026 IMAP: day 57
  { subsystemId: 'imap',   incId: 'INC-026', startOffset: 57/90, width: 1/90, severity: 'medium',   title: 'Timeout loop' },
  // INC-025 Beat: day 44
  { subsystemId: 'beat',   incId: 'INC-025', startOffset: 44/90, width: 1/90, severity: 'critical', title: 'OOM kill' },
  // INC-024 Worker: day 38
  { subsystemId: 'worker', incId: 'INC-024', startOffset: 38/90, width: 1/90, severity: 'low',      title: 'Fan-out delay' },
  // INC-023 DB: day 24
  { subsystemId: 'db',     incId: 'INC-023', startOffset: 24/90, width: 1/90, severity: 'medium',   title: 'Autovacuum' },
  // INC-022 API: day 11
  { subsystemId: 'api',    incId: 'INC-022', startOffset: 11/90, width: 1/90, severity: 'high',     title: '429 flood' },
];

// Range-specific metrics strip
const RANGE_META: Record<Range, { uptime: string; mttr: string; incidents: number; p95: string }> = {
  '30d':  { uptime: '99.93%', mttr: '20m', incidents: 4,  p95: '178 ms' },
  '90d':  { uptime: '99.89%', mttr: '21m', incidents: 10, p95: '183 ms' },
  '12mo': { uptime: '99.84%', mttr: '23m', incidents: 22, p95: '191 ms' },
};

// ─── Severity helpers ─────────────────────────────────────────────────────────
function sevColor(s: Severity): string {
  if (s === 'critical') return C.danger;
  if (s === 'high')     return C.warning;
  if (s === 'medium')   return C.accentLt;
  return C.faint;
}

function sevBg(s: Severity): string {
  if (s === 'critical') return C.dangerDim;
  if (s === 'high')     return C.warningDim;
  if (s === 'medium')   return 'rgba(242,101,34,0.15)';
  return 'rgba(255,255,255,0.06)';
}

function heatColor(level: HeatLevel): string {
  if (level === 'ok')   return C.success;
  if (level === 'warn') return C.warning;
  if (level === 'err')  return C.danger;
  return 'rgba(255,255,255,0.06)';
}

function heatOpacity(level: HeatLevel): number {
  if (level === 'ok')   return 0.7;
  if (level === 'warn') return 0.85;
  if (level === 'err')  return 1;
  return 0.3;
}

function statusIcon(s: IncStatus) {
  if (s === 'resolved')     return <CheckCircle2 size={13} strokeWidth={2.3} color={C.success} />;
  if (s === 'monitoring')   return <Activity     size={13} strokeWidth={2.3} color={C.warning} />;
  return                           <AlertTriangle size={13} strokeWidth={2.3} color={C.danger}  />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface TooltipState {
  date: string;
  label: string;
  uptime: number;
  incidents: number;
  x: number;
  y: number;
}

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={glass({ padding: '18px 22px', flex: 1, minWidth: 130 })}>
      <div style={micro}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? C.text, marginTop: 8, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// Uptime calendar heatmap
function HeatmapGrid({ cells, range }: { cells: DayCell[]; range: Range }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const cellSize = range === '12mo' ? 11 : range === '90d' ? 13 : 17;
  const gap      = range === '12mo' ? 2  : range === '90d' ? 3  : 4;

  // Group cells into weeks (columns)
  const weeks: DayCell[][] = [];
  let week: DayCell[] = [];
  cells.forEach((c, i) => {
    week.push(c);
    if (week.length === 7 || i === cells.length - 1) {
      weeks.push(week);
      week = [];
    }
  });

  // Month label breakpoints
  const monthLabels: { label: string; weekIdx: number }[] = [];
  let lastMonth = '';
  weeks.forEach((w, wi) => {
    const first = w[0];
    if (!first) return;
    const mo = new Date(first.date).toLocaleString('default', { month: 'short' });
    if (mo !== lastMonth) {
      monthLabels.push({ label: mo, weekIdx: wi });
      lastMonth = mo;
    }
  });

  const handleEnter = useCallback((c: DayCell, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltip({ date: c.date, label: c.label, uptime: c.uptime, incidents: c.incidents, x: rect.left + 8, y: rect.top - 8 });
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      {/* Month labels */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 6, marginLeft: 48 }}>
        {weeks.map((_, wi) => {
          const hit = monthLabels.find((m) => m.weekIdx === wi);
          return (
            <div key={wi} style={{ width: cellSize + gap, flexShrink: 0 }}>
              {hit && <span style={{ fontSize: 9, color: C.faint, fontWeight: 600, letterSpacing: '0.05em' }}>{hit.label}</span>}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* Day-of-week labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap, marginRight: 6, paddingTop: 0 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} style={{ fontSize: 9, color: C.faint, fontWeight: 600, lineHeight: 1, height: cellSize, display: 'flex', alignItems: 'center', width: 22 }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: 'flex', gap }}>
          {weeks.map((w, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap }}>
              {w.map((c) => (
                <div
                  key={c.date}
                  onMouseEnter={(e) => handleEnter(c, e)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    borderRadius: range === '12mo' ? 2 : 3,
                    background: heatColor(c.level),
                    opacity: heatOpacity(c.level),
                    cursor: 'default',
                    transition: 'opacity 0.15s',
                    boxShadow: c.level === 'err' ? `0 0 6px ${C.danger}55` : c.level === 'warn' ? `0 0 4px ${C.warning}44` : 'none',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: C.faint }}>Less</span>
        {(['ok', 'warn', 'err'] as HeatLevel[]).map((lv) => (
          <div key={lv} style={{ width: 11, height: 11, borderRadius: 2, background: heatColor(lv), opacity: heatOpacity(lv) }} />
        ))}
        <span style={{ fontSize: 10, color: C.faint }}>More severe</span>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translateY(-100%)',
          pointerEvents: 'none',
          zIndex: 999,
          ...glassTight({ padding: '8px 12px', minWidth: 160 }),
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>{tooltip.label}</div>
          <div style={{ fontSize: 11, color: C.dim }}>
            Uptime <span style={{ color: C.text, fontWeight: 600 }}>{tooltip.uptime.toFixed(2)}%</span>
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
            Incidents{' '}
            <span style={{ color: tooltip.incidents > 0 ? C.warning : C.success, fontWeight: 600 }}>
              {tooltip.incidents}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Swim-lane bar for a single subsystem
function SwimLane({ sub, bars, windowDays, onIncClick, activeInc }: {
  sub: SubsystemDef;
  bars: IncidentBar[];
  windowDays: number;
  onIncClick: (id: string) => void;
  activeInc: string | null;
}) {
  const Icon = sub.icon;
  const myBars = bars.filter((b) => b.subsystemId === sub.id);

  // Scale bars to windowDays (bars are stored relative to 90d window)
  const scaledBars = myBars.map((b) => {
    // shift offset from 90d frame into windowDays frame
    const dayOffset90 = b.startOffset * 90;
    const dayFromEnd = 90 - dayOffset90; // days before today
    if (dayFromEnd > windowDays) return null; // outside window
    const scaledStart = 1 - dayFromEnd / windowDays;
    const scaledWidth = Math.max(b.width * (90 / windowDays), 0.006);
    return { ...b, scaledStart: Math.max(0, scaledStart), scaledWidth };
  }).filter(Boolean) as (IncidentBar & { scaledStart: number; scaledWidth: number })[];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36 }}>
      {/* Label */}
      <div style={{ width: 86, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Icon size={12} color={C.faint} strokeWidth={2} />
        <span style={{ fontSize: 11, color: C.dim, fontWeight: 600 }}>{sub.name}</span>
      </div>

      {/* Track */}
      <div style={{ flex: 1, position: 'relative', height: 18, background: C.neutral, borderRadius: 4, overflow: 'hidden' }}>
        {/* healthy baseline */}
        <div style={{ position: 'absolute', inset: 0, background: `${C.success}18`, borderRadius: 4 }} />

        {/* incident bars */}
        {scaledBars.map((b) => (
          <div
            key={b.incId}
            onClick={() => onIncClick(b.incId)}
            title={`${b.incId}: ${b.title}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${b.scaledStart * 100}%`,
              width: `${Math.max(b.scaledWidth * 100, 0.5)}%`,
              minWidth: 4,
              background: sevColor(b.severity),
              borderRadius: 3,
              cursor: 'pointer',
              opacity: activeInc === b.incId ? 1 : 0.75,
              boxShadow: activeInc === b.incId ? `0 0 8px ${sevColor(b.severity)}88` : 'none',
              transition: 'opacity 0.15s, box-shadow 0.15s',
              zIndex: activeInc === b.incId ? 2 : 1,
            }}
          />
        ))}
      </div>

      {/* Count badge */}
      <div style={{ width: 28, textAlign: 'right', fontSize: 10, color: myBars.length > 0 ? C.warning : C.faint, fontWeight: 700 }}>
        {myBars.length > 0 ? myBars.length : '—'}
      </div>
    </div>
  );
}

// Incident row in the detail list
function IncidentRow({ inc, active, onClick }: { inc: Incident; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '70px 1fr 90px 70px 90px',
        alignItems: 'center',
        gap: 12,
        padding: '11px 16px',
        borderRadius: C.radiusXs,
        background: active ? C.glassMid : 'transparent',
        border: active ? C.border : '1px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.faint }}>{inc.id}</span>
      </div>
      <div>
        <div style={{ fontSize: 12, color: C.text, fontWeight: 600, lineHeight: 1.3 }}>{inc.title}</div>
        <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{inc.subsystem} · {inc.started}</div>
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: 20,
        background: sevBg(inc.severity),
        fontSize: 10, fontWeight: 700, color: sevColor(inc.severity),
        textTransform: 'uppercase', letterSpacing: '0.08em',
        width: 'fit-content',
      }}>
        {inc.severity === 'critical' && <XCircle size={9} strokeWidth={2.5} />}
        {inc.severity === 'high' && <AlertTriangle size={9} strokeWidth={2.5} />}
        {inc.severity === 'medium' && <ZapOff size={9} strokeWidth={2.5} />}
        {inc.severity}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.dim }}>
        <Timer size={11} strokeWidth={2} />
        {inc.durationMin}m
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
        {statusIcon(inc.status)}
        <span style={{ color: inc.status === 'resolved' ? C.success : inc.status === 'monitoring' ? C.warning : C.danger }}>
          {inc.status.charAt(0).toUpperCase() + inc.status.slice(1)}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmHlthH7Timeline() {
  const [range, setRange] = useState<Range>('90d');
  const [activeInc, setActiveInc] = useState<string | null>(null);

  const windowDays = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const cells = generateCells(windowDays);
  const meta = RANGE_META[range];

  // Filter incidents to the selected window
  const visibleIncidents = INCIDENTS.filter((inc) => {
    const incDate = new Date(inc.started.slice(0, 10));
    const cutoff = new Date('2026-05-31');
    cutoff.setDate(cutoff.getDate() - windowDays);
    return incDate >= cutoff;
  });

  const toggleInc = useCallback((id: string) => {
    setActiveInc((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div style={{ padding: '28px 28px 40px', maxWidth: 1100, margin: '0 auto', color: C.text, fontFamily: 'inherit' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ ...micro, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={10} strokeWidth={2.5} />
            System Health · Timeline
          </div>
          <h2 style={{ margin: '6px 0 4px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: C.text }}>
            Uptime & Incident History
          </h2>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>
            Per-subsystem incident swim-lanes + calendar heatmap · 2026-05-31
          </p>
        </div>

        {/* Range toggle */}
        <div style={{ display: 'flex', gap: 4, ...glassTight({ padding: 4 }) }}>
          {(['30d', '90d', '12mo'] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                background: range === r ? C.accent : 'transparent',
                color: range === r ? '#fff' : C.faint,
                transition: 'background 0.2s, color 0.2s',
                letterSpacing: '0.04em',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Metrics strip ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <MetricCard label="Uptime" value={meta.uptime} sub={`Last ${range}`} color={C.success} />
        <MetricCard label="Incidents" value={String(meta.incidents)} sub={`Last ${range}`} color={meta.incidents >= 8 ? C.warning : C.text} />
        <MetricCard label="Avg MTTR" value={meta.mttr} sub="Mean time to resolve" />
        <MetricCard label="p95 Latency" value={meta.p95} sub="API gateway" />
      </div>

      {/* ── Heatmap section ── */}
      <div style={glass({ padding: '22px 24px', marginBottom: 20 })}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ ...micro, marginBottom: 4 }}>Uptime Calendar</div>
            <div style={{ fontSize: 13, color: C.dim }}>
              {windowDays}-day heatmap — green = healthy · orange = degraded · red = outage
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...glassTight({ padding: '4px 10px' }) }}>
            <Clock size={11} color={C.faint} strokeWidth={2} />
            <span style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>UTC</span>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <HeatmapGrid cells={cells} range={range} />
        </div>
      </div>

      {/* ── Swim-lanes ── */}
      <div style={glass({ padding: '20px 24px', marginBottom: 20 })}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={micro}>Per-subsystem Incident Swim-lanes</div>
          {/* Timeline ruler */}
          <div style={{ display: 'flex', gap: 0, marginLeft: 'auto', marginRight: 0, width: 260, justifyContent: 'space-between' }}>
            {[
              '←',
              range === '30d' ? '15d ago' : range === '90d' ? '45d ago' : '6mo ago',
              'Today',
            ].map((lbl) => (
              <span key={lbl} style={{ fontSize: 9, color: C.faint, fontWeight: 600, letterSpacing: '0.05em' }}>{lbl}</span>
            ))}
          </div>
        </div>

        {/* Severity legend */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          {(['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: sevColor(s) }} />
              <span style={{ fontSize: 10, color: C.faint, textTransform: 'capitalize' }}>{s}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 10, color: C.faint }}>Click a bar → jump to incident</div>
        </div>

        {/* Lane rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6, borderBottom: `1px solid ${C.hairline}` }}>
            <div style={{ width: 86, ...micro }}>Subsystem</div>
            <div style={{ flex: 1, ...micro }}>Timeline ({range})</div>
            <div style={{ width: 28, ...micro, textAlign: 'right' }}>#</div>
          </div>
          {SUBSYSTEMS.map((sub) => (
            <SwimLane
              key={sub.id}
              sub={sub}
              bars={SWIM_BARS}
              windowDays={windowDays}
              onIncClick={toggleInc}
              activeInc={activeInc}
            />
          ))}
        </div>
      </div>

      {/* ── Incident detail list ── */}
      <div style={glass({ padding: '20px 24px' })}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={micro}>Incident Log</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
              {visibleIncidents.length} incident{visibleIncidents.length !== 1 ? 's' : ''} in the last {range}
            </div>
          </div>
          {activeInc && (
            <button
              type="button"
              onClick={() => setActiveInc(null)}
              style={{
                fontSize: 11, color: C.accent, background: 'transparent', border: 'none',
                cursor: 'pointer', fontWeight: 700, padding: '4px 8px',
              }}
            >
              Clear selection ×
            </button>
          )}
        </div>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr 90px 70px 90px',
          gap: 12,
          padding: '6px 16px',
          ...micro,
        }}>
          <span>ID</span>
          <span>Title</span>
          <span>Severity</span>
          <span>Duration</span>
          <span>Status</span>
        </div>

        <div style={{ borderTop: `1px solid ${C.hairline}`, marginTop: 4, paddingTop: 4 }}>
          {visibleIncidents.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <CheckCircle2 size={24} color={C.success} strokeWidth={2} style={{ display: 'block', margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, color: C.dim }}>No incidents in the last {range}</div>
            </div>
          ) : (
            visibleIncidents.map((inc) => (
              <IncidentRow
                key={inc.id}
                inc={inc}
                active={activeInc === inc.id}
                onClick={() => toggleInc(inc.id)}
              />
            ))
          )}
        </div>

        {/* Affected services for active incident */}
        {activeInc && (() => {
          const inc = INCIDENTS.find((i) => i.id === activeInc);
          if (!inc) return null;
          return (
            <div style={{ marginTop: 12, ...glassTight({ padding: '12px 16px', background: C.glassMid }) }}>
              <div style={{ ...micro, marginBottom: 8 }}>Affected services — {inc.id}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {inc.affectedServices.map((svc) => (
                  <div key={svc} style={{
                    padding: '4px 10px', borderRadius: 20,
                    background: sevBg(inc.severity), border: `1px solid ${sevColor(inc.severity)}44`,
                    fontSize: 11, color: sevColor(inc.severity), fontWeight: 700,
                  }}>
                    {svc}
                  </div>
                ))}
              </div>
              {inc.resolved && (
                <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>
                  Resolved at <span style={{ color: C.text, fontWeight: 600 }}>{inc.resolved}</span>
                  {' · '}duration <span style={{ color: C.text, fontWeight: 600 }}>{inc.durationMin}m</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
        <Workflow size={11} color={C.faint} strokeWidth={2} />
        <span style={{ fontSize: 10, color: C.faint }}>WarmPulse · System Health · Timeline view · mock data</span>
      </div>
    </div>
  );
}
