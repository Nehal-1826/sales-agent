/**
 * /admin/platform-analytics — A1 Analytics Cockpit (live, real-data).
 *
 * Design: "Analytics Cockpit" — mission-control view: top control/KPI bar,
 * dense responsive grid of glass chart cards.
 *
 * Panels and their real data sources:
 *  1. KPI chips            → useAdminOverview()  (sends_today, active_mailboxes,
 *                            total_users, mrr_usd, peer_pool_health_pct)
 *  2. Sends + Signups area → useAdminSendVolume(days) + useAdminSignupRate(days)
 *  3. Plan-mix donut       → useAdminPlanDistribution()
 *  4. Warmth histogram     → useAdminWarmthDistribution()
 *  5. MRR per-plan bars    → useAdminPlanDistribution()  [.mrr field]
 *     (replaces mock "MRR-over-time" — no real time-series endpoint)
 *  6. Peer-pool health     → overview.peer_pool_health_pct (real single metric)
 *     (replaces mock "deliverability" line — no real inbox-placement endpoint)
 *  7. Top workspaces table → useAdminTopClients()
 *
 * Range toggle (7d/30d/90d) drives days param to both time-series hooks.
 * Export CSV is carried over from the previous page.
 */

import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  type TooltipProps,
} from 'recharts';
import {
  Mail,
  Users,
  CreditCard,
  Gauge,
  Activity,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Download,
  Loader2,
} from 'lucide-react';
import {
  useAdminOverview,
  useAdminSendVolume,
  useAdminSignupRate,
  useAdminPlanDistribution,
  useAdminWarmthDistribution,
  useAdminTopClients,
} from '@/features/admin/api';
import type { VolumePoint, WarmthBin, TopClient } from '@/features/admin/types';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/components/ui/AppToast';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';

// ---------------------------------------------------------------------------
// Palette — warm + neutral only. Matches A1 Cockpit design exactly.
// ---------------------------------------------------------------------------

const C = {
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.42)',
  ghost: 'rgba(255,255,255,0.22)',
  accent: '#F26522',
  accent2: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  glass: 'rgba(255,255,255,0.05)',
  glass2: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.07)',
} as const;

const GLASS: React.CSSProperties = {
  background: C.glass,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: 16,
};

const GLASS_INNER: React.CSSProperties = {
  background: C.glass2,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  borderRadius: 12,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RangeId = '7d' | '30d' | '90d';

const RANGE_DAYS: Record<RangeId, 7 | 30 | 90> = { '7d': 7, '30d': 30, '90d': 90 };

// Per-plan colors for donut + table badges
const PLAN_COLORS: Record<string, string> = {
  Trial:   'rgba(255,255,255,0.30)',
  Starter: '#c2a46e',
  Growth:  '#FF8A4B',
  Scale:   '#F26522',
  Pro:     '#F26522',
  Agency:  '#c2a46e',
};

function planColor(plan: string): string {
  return PLAN_COLORS[plan] ?? C.ghost;
}

// ---------------------------------------------------------------------------
// Tooltip helpers
// ---------------------------------------------------------------------------

type CustomTooltipProps = TooltipProps<number, string>;

function GlassTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      ...GLASS_INNER,
      padding: '10px 14px',
      fontSize: 12,
      minWidth: 130,
      boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
    }}>
      {label && (
        <div style={{ color: C.dim, marginBottom: 6, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em' }}>
          {label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={entry.name ?? i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
          <span style={{ color: entry.color, fontSize: 11 }}>{entry.name}</span>
          <span style={{ color: C.text, fontWeight: 700 }}>
            {typeof entry.value === 'number' && entry.value > 999
              ? entry.value.toLocaleString()
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface DonutPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; payload: DonutPayloadEntry }[];
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0];
  if (!d) return null;
  return (
    <div style={{ ...GLASS_INNER, padding: '8px 12px', fontSize: 12 }}>
      <span style={{ color: d.payload.color, fontWeight: 700 }}>{d.payload.name}</span>
      <span style={{ color: C.dim, marginLeft: 8 }}>{d.payload.value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  pill?: string;
  pillColor?: string;
}

function SectionHeader({ title, icon, pill, pillColor }: SectionHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {icon && <span style={{ color: C.accent, opacity: 0.8, display: 'flex' }}>{icon}</span>}
        <span style={{ color: C.dim, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      {pill && (
        <span style={{
          background: (pillColor ?? C.accent) + '22',
          color: pillColor ?? C.accent,
          border: `1px solid ${(pillColor ?? C.accent)}44`,
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 700,
        }}>
          {pill}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading / empty states
// ---------------------------------------------------------------------------

function CardSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, gap: 8, color: C.faint, fontSize: 12 }}>
      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
      <span>Loading…</span>
    </div>
  );
}

function CardEmpty({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: C.faint, fontSize: 12 }}>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers — sum all numeric non-date fields from VolumePoint
// ---------------------------------------------------------------------------

function sumVolumePoint(point: VolumePoint): number {
  let total = 0;
  for (const [k, v] of Object.entries(point)) {
    if (k === 'date') continue;
    if (typeof v === 'number') total += v;
  }
  return total;
}

// Formats raw VolumePoint[] into chart-ready data with a `sends` key
function prepSends(data: VolumePoint[]): Array<{ label: string; sends: number }> {
  return data.map((p) => ({
    label: p.date.slice(5), // MM-DD from YYYY-MM-DD
    sends: sumVolumePoint(p),
  }));
}

// Formats SignupRatePoint[] into chart-ready data
function prepSignups(
  data: Array<{ date: string; signups: number; cumulative?: number }>,
): Array<{ label: string; signups: number }> {
  return data.map((p) => ({
    label: p.date.slice(5),
    signups: p.signups ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Export CSV helper
// ---------------------------------------------------------------------------

function exportCsv(
  volume: VolumePoint[],
  days: number,
): void {
  const lines: string[] = ['date,sends'];
  for (const p of volume) {
    lines.push(`${p.date},${sumVolumePoint(p)}`);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `send-volume-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(`Exported ${volume.length} day${volume.length === 1 ? '' : 's'} of send volume.`);
}

// ---------------------------------------------------------------------------
// CSV export columns — merged sends + signups time series (one row per day)
// ---------------------------------------------------------------------------

type TrendRow = { label: string; sends: number; signups: number };

const ANALYTICS_EXPORT_COLUMNS: CsvColumn<TrendRow>[] = [
  { header: 'Date', value: (r) => r.label },
  { header: 'Sends', value: (r) => r.sends },
  { header: 'Signups', value: (r) => r.signups },
];

// ---------------------------------------------------------------------------
// Main component — PlatformAnalyticsPage
// ---------------------------------------------------------------------------

export function PlatformAnalyticsPage() {
  const [range, setRange] = useState<RangeId>('30d');
  const days = RANGE_DAYS[range];

  // ── Real data hooks ──────────────────────────────────────────────────────
  const overview = useAdminOverview();
  const volume   = useAdminSendVolume(days);
  const signups  = useAdminSignupRate(days);
  const planDist = useAdminPlanDistribution();
  const warmth   = useAdminWarmthDistribution();
  const topClients = useAdminTopClients('send_volume');
  const { money, number } = useLocaleFormat();

  // ── Derived KPI values ───────────────────────────────────────────────────
  const ov = overview.data;
  const totalSends = useMemo(() => volume.data?.reduce((s, p) => s + sumVolumePoint(p), 0) ?? 0, [volume.data]);
  const totalSignups = useMemo(() => signups.data?.reduce((s, p) => s + (p.signups ?? 0), 0) ?? 0, [signups.data]);
  const mrr = ov?.mrr_usd ?? 0;
  const peerHealth = ov?.peer_pool_health_pct ?? 0;

  // ── Chart-ready series ────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const sv = prepSends(volume.data ?? []);
    const sg = prepSignups(signups.data ?? []);
    // merge by index (both are same-range, same-length)
    const len = Math.max(sv.length, sg.length);
    return Array.from({ length: len }, (_, i) => ({
      label: sv[i]?.label ?? sg[i]?.label ?? '',
      sends: sv[i]?.sends ?? 0,
      signups: sg[i]?.signups ?? 0,
    }));
  }, [volume.data, signups.data]);

  const trendLoading = volume.isLoading || signups.isLoading;

  // ── Plan donut ─────────────────────────────────────────────────────────────
  const planSlices = useMemo(() => {
    const list = planDist.data ?? [];
    return list
      .filter((p) => p.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((p) => ({ name: p.plan, value: p.count, color: planColor(p.plan), mrr: p.mrr ?? 0 }));
  }, [planDist.data]);
  const planTotal = planSlices.reduce((s, p) => s + p.value, 0);

  // ── Warmth bins ───────────────────────────────────────────────────────────
  const warmthBins: WarmthBin[] = warmth.data ?? [];

  // ── Per-plan MRR bars (replaces mock MRR-over-time — no real time-series) ─
  const planMrrBars = useMemo(() => {
    return planSlices
      .filter((p) => p.mrr > 0)
      .map((p) => ({ name: p.name, mrr: p.mrr, color: p.color }));
  }, [planSlices]);

  // ── Top clients ────────────────────────────────────────────────────────────
  const clients: TopClient[] = topClients.data ?? [];

  // ── KPI chips ──────────────────────────────────────────────────────────────
  type KpiChip = { label: string; value: string; icon: typeof Mail; loading: boolean };
  const kpis: KpiChip[] = [
    {
      label: 'Sends Today',
      value: overview.isLoading ? '…' : number(ov?.sends_today ?? 0),
      icon: Mail,
      loading: overview.isLoading,
    },
    {
      label: 'Active Mailboxes',
      value: overview.isLoading ? '…' : number(ov?.active_mailboxes ?? 0),
      icon: Activity,
      loading: overview.isLoading,
    },
    {
      label: 'Total Signups',
      value: signups.isLoading ? '…' : number(totalSignups),
      icon: Users,
      loading: signups.isLoading,
    },
    {
      label: 'MRR',
      value: overview.isLoading ? '…' : money(mrr),
      icon: CreditCard,
      loading: overview.isLoading,
    },
    {
      label: 'Peer Health',
      value: overview.isLoading ? '…' : `${Math.round(peerHealth)}%`,
      icon: Gauge,
      loading: overview.isLoading,
    },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '24px 28px 40px',
      boxSizing: 'border-box',
    }}>

      {/* ── TOP CONTROL BAR ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
            Admin · Platform Stats
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: C.text }}>
            Analytics Cockpit
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Time-range toggle — drives days param to both trend hooks */}
          <div style={{
            display: 'flex',
            background: C.glass,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 3,
            gap: 2,
          }}>
            {(['7d', '30d', '90d'] as RangeId[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                style={{
                  background: range === r
                    ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})`
                    : 'transparent',
                  color: range === r ? '#fff' : C.dim,
                  border: 'none',
                  borderRadius: 7,
                  padding: '5px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  letterSpacing: '0.02em',
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => exportCsv(volume.data ?? [], days)}
            disabled={volume.isLoading || (volume.data ?? []).length === 0}
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              opacity: (volume.isLoading || (volume.data ?? []).length === 0) ? 0.5 : 1,
            }}
          >
            <Download size={12} />
            Export CSV
          </button>

          {/* Shared report export — merged sends + signups daily series */}
          <ExportButton
            rows={trendData}
            columns={ANALYTICS_EXPORT_COLUMNS}
            filename={`platform-analytics-${exportStamp()}`}
            disabled={trendLoading}
          />
        </div>
      </div>

      {/* ── KPI CHIPS BAR ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        marginBottom: 24,
      }}>
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} style={{
              ...GLASS,
              padding: '14px 16px',
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: C.faint, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {k.label}
                </span>
                <Icon size={13} style={{ color: C.accent, opacity: 0.7 }} />
              </div>
              {k.loading ? (
                <div style={{ height: 22, display: 'flex', alignItems: 'center' }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: C.faint }} />
                </div>
              ) : (
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {k.value}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ArrowUpRight size={11} style={{ color: C.success }} />
                <span style={{ fontSize: 10, color: C.faint }}>real-time</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MAIN CHART GRID ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
      }}>

        {/* ── CARD 1: Sends + Signups trend (full width) ── */}
        <div style={{ ...GLASS, padding: '20px 22px', gridColumn: '1 / -1', borderRadius: 16 }}>
          <SectionHeader
            title="Sends &amp; Signups Over Time"
            icon={<Mail size={13} />}
            pill={trendLoading ? range : `${number(totalSends)} sends · ${range}`}
          />
          {trendLoading ? (
            <CardSpinner />
          ) : trendData.length === 0 ? (
            <CardEmpty label="No send data in this window." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="aCkSends" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.accent} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="aCkSignups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.success} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: C.faint, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="sends"
                  orientation="left"
                  tick={{ fill: C.faint, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  width={36}
                />
                <YAxis
                  yAxisId="signups"
                  orientation="right"
                  tick={{ fill: C.faint, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  allowDecimals={false}
                  domain={[0, (dataMax: number) => Math.max(4, Math.ceil(dataMax * 1.25))]}
                />
                <Tooltip content={<GlassTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: C.dim, paddingTop: 8 }}
                  formatter={(value: string) => (
                    <span style={{ color: C.dim }}>{value}</span>
                  )}
                />
                <Area
                  yAxisId="sends"
                  type="monotone"
                  dataKey="sends"
                  name="Sends"
                  stroke={C.accent}
                  strokeWidth={2}
                  fill="url(#aCkSends)"
                  dot={false}
                  activeDot={{ r: 4, fill: C.accent, strokeWidth: 0 }}
                />
                <Area
                  yAxisId="signups"
                  type="monotone"
                  dataKey="signups"
                  name="Signups"
                  stroke={C.success}
                  strokeWidth={2}
                  fill="url(#aCkSignups)"
                  dot={false}
                  activeDot={{ r: 4, fill: C.success, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── CARD 2: Plan-mix donut ── */}
        <div style={{ ...GLASS, padding: '20px 22px', borderRadius: 16 }}>
          <SectionHeader title="Plan Distribution" icon={<Users size={13} />} />
          {planDist.isLoading ? (
            <CardSpinner />
          ) : planSlices.length === 0 ? (
            <CardEmpty label="No plan data yet." />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: '0 0 160px', height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={planSlices}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {planSlices.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {planSlices.map((p) => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: p.color,
                      flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, fontSize: 12, color: C.dim }}>{p.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.value}</span>
                  </div>
                ))}
                <div style={{
                  marginTop: 4,
                  paddingTop: 8,
                  borderTop: `1px solid ${C.borderSoft}`,
                  fontSize: 11,
                  color: C.faint,
                }}>
                  {planTotal} total workspaces
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── CARD 3: Warmth / health distribution histogram ── */}
        <div style={{ ...GLASS, padding: '20px 22px', borderRadius: 16 }}>
          <SectionHeader title="Warmth / Health Distribution" icon={<Activity size={13} />} />
          {warmth.isLoading ? (
            <CardSpinner />
          ) : warmthBins.length === 0 ? (
            <CardEmpty label="No warmth data yet." />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={warmthBins} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} barCategoryGap="14%">
                <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
                <XAxis
                  dataKey="bin"
                  tick={{ fill: C.faint, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={28}
                />
                <YAxis
                  tick={{ fill: C.faint, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  content={({ active, payload, label }: CustomTooltipProps) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const entry = payload[0];
                    if (!entry) return null;
                    return (
                      <div style={{ ...GLASS_INNER, padding: '8px 12px', fontSize: 12 }}>
                        <div style={{ color: C.dim, fontSize: 10, marginBottom: 3 }}>Score {label}</div>
                        <div style={{ color: C.accent, fontWeight: 700 }}>{entry.value} mailboxes</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" name="Mailboxes" radius={[4, 4, 0, 0]}>
                  {warmthBins.map((bin, idx) => {
                    const pct = warmthBins.length > 1 ? idx / (warmthBins.length - 1) : 0.5;
                    const color = pct < 0.3
                      ? C.danger
                      : pct < 0.5
                        ? C.warning
                        : C.success;
                    return <Cell key={bin.bin} fill={color} fillOpacity={0.7 + pct * 0.3} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── CARD 4: Per-plan MRR bars
            Replaces mock MRR-over-time (no real time-series endpoint exists).
            Uses real planDistribution.mrr field per plan. ── */}
        <div style={{ ...GLASS, padding: '20px 22px', borderRadius: 16 }}>
          <SectionHeader
            title="MRR by Plan"
            icon={<CreditCard size={13} />}
            pill={overview.isLoading ? '…' : money(mrr)}
            pillColor={C.success}
          />
          {planDist.isLoading ? (
            <CardSpinner />
          ) : planMrrBars.length === 0 ? (
            <CardEmpty label="No per-plan MRR data yet." />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={planMrrBars} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: C.faint, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: C.faint, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v: number) => money(Math.round(v))}
                />
                <Tooltip
                  content={({ active, payload, label }: CustomTooltipProps) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const entry = payload[0];
                    if (!entry) return null;
                    return (
                      <div style={{ ...GLASS_INNER, padding: '8px 12px', fontSize: 12 }}>
                        <div style={{ color: C.dim, fontSize: 10, marginBottom: 3 }}>{label}</div>
                        <div style={{ color: C.accent2, fontWeight: 700 }}>{money(Number(entry.value))}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="mrr" name="MRR" radius={[4, 4, 0, 0]}>
                  {planMrrBars.map((p) => (
                    <Cell key={p.name} fill={p.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── CARD 5: Peer Pool Health gauge
            Replaces mock deliverability time-series (no real inbox-placement
            endpoint exists). Shows overview.peer_pool_health_pct as a single
            real gauge with color bands. ── */}
        <div style={{ ...GLASS, padding: '20px 22px', borderRadius: 16 }}>
          <SectionHeader
            title="Peer Pool Health"
            icon={<Gauge size={13} />}
            pill={overview.isLoading ? '…' : `${Math.round(peerHealth)}%`}
            pillColor={peerHealth >= 80 ? C.success : peerHealth >= 60 ? C.warning : C.danger}
          />
          {overview.isLoading ? (
            <CardSpinner />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
              {/* Arc-style gauge via a thick progress bar */}
              <div>
                <div style={{
                  height: 12,
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(0, peerHealth))}%`,
                    background: peerHealth >= 80
                      ? `linear-gradient(90deg, ${C.success}, #5ef9b8)`
                      : peerHealth >= 60
                        ? `linear-gradient(90deg, ${C.warning}, ${C.accent2})`
                        : `linear-gradient(90deg, ${C.danger}, #ff8a6a)`,
                    borderRadius: 6,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: C.faint }}>
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Big number */}
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{
                  fontSize: 48,
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                  color: peerHealth >= 80 ? C.success : peerHealth >= 60 ? C.warning : C.danger,
                  lineHeight: 1,
                }}>
                  {Math.round(peerHealth)}%
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>
                  of test accounts healthy
                </div>
              </div>

              {/* Status rows */}
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  {
                    label: 'Status',
                    value: peerHealth >= 80 ? 'Healthy' : peerHealth >= 60 ? 'Degraded' : 'At Risk',
                    color: peerHealth >= 80 ? C.success : peerHealth >= 60 ? C.warning : C.danger,
                  },
                  {
                    label: 'Active',
                    value: `${ov?.active_mailboxes ?? 0}`,
                    color: C.dim,
                  },
                  {
                    label: 'Backlog',
                    value: `${ov?.queue_depth ?? 0}`,
                    color: (ov?.queue_depth ?? 0) > 500 ? C.warning : C.dim,
                  },
                ].map((m) => (
                  <div key={m.label} style={{
                    flex: 1,
                    background: C.glass2,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 8,
                    padding: '6px 8px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── CARD 6: Top Workspaces table (full width) ── */}
        <div style={{ ...GLASS, padding: '20px 22px', gridColumn: '1 / -1', borderRadius: 16 }}>
          <SectionHeader
            title="Top Workspaces by Volume"
            icon={<Building2 size={13} />}
            pill={`${range} window`}
          />
          {topClients.isLoading ? (
            <CardSpinner />
          ) : clients.length === 0 ? (
            <CardEmpty label="No workspace data yet." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: 12,
              }}>
                <thead>
                  <tr>
                    {['#', 'Workspace', 'Plan', 'Mailboxes', 'Sends', 'Avg Warmth', 'Health'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '6px 10px',
                          textAlign: h === '#' ? 'center' : 'left',
                          color: C.faint,
                          fontWeight: 700,
                          fontSize: 10,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          borderBottom: `1px solid ${C.borderSoft}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.slice(0, 15).map((row, i) => {
                    const warmthVal = row.avg_warmth ?? 0;
                    const healthStatus = warmthVal >= 80
                      ? 'healthy'
                      : warmthVal >= 50
                        ? 'warn'
                        : 'risk';
                    return (
                      <tr
                        key={row.user_id}
                        style={{
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <td style={{
                          padding: '9px 10px',
                          textAlign: 'center',
                          color: C.faint,
                          fontWeight: 700,
                          fontSize: 11,
                        }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: '9px 10px', fontWeight: 600, color: C.text }}>
                          {row.workspace_name ?? row.email}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{
                            background: planColor(row.plan) + '22',
                            color: planColor(row.plan),
                            border: `1px solid ${planColor(row.plan)}44`,
                            borderRadius: 5,
                            padding: '2px 7px',
                            fontSize: 10,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}>
                            {row.plan}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: C.dim, fontWeight: 600 }}>
                          {number(row.mailbox_count ?? 0)}
                        </td>
                        <td style={{ padding: '9px 10px', color: C.dim, fontWeight: 600 }}>
                          {number(row.send_volume ?? 0)}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              flex: 1,
                              height: 4,
                              background: 'rgba(255,255,255,0.10)',
                              borderRadius: 2,
                              maxWidth: 80,
                            }}>
                              <div style={{
                                height: '100%',
                                borderRadius: 2,
                                width: `${Math.min(100, warmthVal)}%`,
                                background: warmthVal >= 80
                                  ? C.success
                                  : warmthVal >= 50
                                    ? C.warning
                                    : C.danger,
                              }} />
                            </div>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: warmthVal >= 80
                                ? C.success
                                : warmthVal >= 50
                                  ? C.warning
                                  : C.danger,
                              minWidth: 28,
                            }}>
                              {warmthVal.toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          {healthStatus === 'healthy' && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.success }}>
                              <CheckCircle2 size={12} />
                              <span style={{ fontSize: 11, fontWeight: 600 }}>Healthy</span>
                            </span>
                          )}
                          {healthStatus === 'warn' && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.warning }}>
                              <AlertTriangle size={12} />
                              <span style={{ fontSize: 11, fontWeight: 600 }}>Watch</span>
                            </span>
                          )}
                          {healthStatus === 'risk' && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.danger }}>
                              <AlertTriangle size={12} />
                              <span style={{ fontSize: 11, fontWeight: 600 }}>At Risk</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Keyframe for spinner — injected once */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default PlatformAnalyticsPage;
