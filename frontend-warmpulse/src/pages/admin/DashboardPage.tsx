/**
 * Admin Dashboard — E4 Insight Spotlight (live)
 *
 * Ported from the winning design candidate E4Spotlight.tsx.
 * All data comes from real admin API hooks — no hardcoded metrics.
 *
 * Chips: Sends · Users · MRR · Mailboxes · Pool health
 * Hero:  line/area chart for time-series chips; bar breakdown for the rest.
 * Bento: Plan distribution · Pool capacity · System status · Top workspaces
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Mail,
  DollarSign,
  Users,
  Server,
  Database,
  Building2,
  Activity,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import {
  useAdminOverview,
  useAdminSendVolume,
  useAdminSignupRate,
  useAdminPlanDistribution,
  useAdminPeerInboxStats,
  useAdminTopClients,
} from '@/features/admin/api';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatMoney, formatNumber, formatDate } from '@/lib/format';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';
import type { TopClient } from '@/features/admin/types';

// ─── Design tokens (warm Aurora-Glass palette) ─────────────────────────────
const T = {
  text: '#fff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.42)',
  accent: '#F26522',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  hairline: 'rgba(255,255,255,0.08)',
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 18,
  } as CSSProperties,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.42)',
  } as CSSProperties,
};

// ─── Chip / metric IDs ──────────────────────────────────────────────────────
type MetricId = 'sends' | 'users' | 'mrr' | 'mailboxes' | 'pool';
type ValueKind = 'currency' | 'count' | 'percent';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(value: number, kind: ValueKind, decimals = 0): string {
  if (kind === 'currency') {
    return formatMoney(value, { decimals });
  }
  if (kind === 'percent') {
    return `${formatNumber(value, { decimals: 1 })}%`;
  }
  return formatNumber(value, { decimals });
}

/** Plan color palette (warm only) */
const PLAN_COLORS: Record<string, string> = {
  agency: '#F26522',
  pro_plus: '#FF8A4B',
  pro: '#3ddc97',
  starter: 'rgba(255,255,255,0.35)',
};

function planColor(plan: string | null | undefined): string {
  if (!plan) return 'rgba(255,255,255,0.35)';
  const key = plan.toLowerCase().replace(/[\s-]+/g, '_');
  return PLAN_COLORS[key] ?? '#F26522';
}

// ─── Animated headline value ────────────────────────────────────────────────
function AnimatedValue({
  to,
  kind,
  dur = 0.7,
}: {
  to: number;
  kind: ValueKind;
  dur?: number;
}) {
  const [n, setN] = useState(to);
  const fromRef = useRef(to);
  const rafRef = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const from = fromRef.current;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (dur * 1000));
      const e = 1 - Math.pow(1 - p, 3);
      setN(from + (to - from) * e);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, dur]);

  const decimals = kind === 'percent' ? 1 : 0;
  return <>{fmt(n, kind, decimals)}</>;
}

// ─── Glass tile ─────────────────────────────────────────────────────────────
function Tile({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        ...T.glass,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function MicroLabel({ children }: { children: ReactNode }) {
  return <div style={T.micro}>{children}</div>;
}

// ─── Skeleton line ─────────────────────────────────────────────────────────
function SkeletonLine({ w = '60%', h = 14 }: { w?: string; h?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 6,
        background: 'rgba(255,255,255,0.08)',
        animation: 'pulse 1.6s ease-in-out infinite',
      }}
    />
  );
}

// ─── Tooltip for hero chart ─────────────────────────────────────────────────
function HeroTooltip({
  active,
  payload,
  label,
  kind,
  unit,
  color,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  kind: ValueKind;
  unit: string;
  color: string;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value ?? 0;
  return (
    <div
      style={{
        background: 'rgba(18,18,24,0.94)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ color: T.dim, marginBottom: 3 }}>{label}</div>
      <div style={{ color, fontWeight: 700, display: 'flex', alignItems: 'baseline', gap: 5 }}>
        {fmt(raw, kind, kind === 'percent' ? 1 : 0)}
        <span style={{ color: T.faint, fontWeight: 500, fontSize: 11 }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── KPI chip ───────────────────────────────────────────────────────────────
interface ChipDef {
  id: MetricId;
  label: string;
  short: string;
  icon: typeof Mail;
  color: string;
  kind: ValueKind;
  value: number;
  loading: boolean;
}

function MetricChip({
  chip,
  selected,
  onSelect,
}: {
  chip: ChipDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hover, setHover] = useState(false);
  const Icon = chip.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={selected}
      style={{
        appearance: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        flex: '1 1 150px',
        minWidth: 140,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '13px 15px',
        borderRadius: 14,
        background: selected
          ? `linear-gradient(135deg, ${chip.color}26, rgba(255,255,255,0.04))`
          : hover
            ? 'rgba(255,255,255,0.07)'
            : 'rgba(255,255,255,0.04)',
        border: selected
          ? `1px solid ${chip.color}`
          : '1px solid rgba(255,255,255,0.10)',
        boxShadow: selected
          ? `0 0 0 1px ${chip.color}55, 0 10px 30px ${chip.color}1f`
          : 'none',
        transform: selected ? 'translateY(-2px)' : hover ? 'translateY(-1px)' : 'none',
        transition: 'all 0.22s cubic-bezier(0.22,1,0.36,1)',
        color: T.text,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 8,
            background: selected ? chip.color : `${chip.color}22`,
            color: selected ? '#15110d' : chip.color,
            transition: 'all 0.22s ease',
          }}
        >
          <Icon size={14} strokeWidth={2.4} />
        </span>
      </div>
      <div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: selected ? 'rgba(255,255,255,0.7)' : T.faint,
          }}
        >
          {chip.short}
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            marginTop: 2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {chip.loading ? (
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            fmt(chip.value, chip.kind, chip.kind === 'percent' ? 1 : 0)
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Plan chip badge ─────────────────────────────────────────────────────────
function PlanBadge({ plan }: { plan: string | null | undefined }) {
  const color = planColor(plan);
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color,
        background: `${color}1f`,
        border: `1px solid ${color}40`,
        borderRadius: 999,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {plan ?? 'No plan'}
    </span>
  );
}

// ─── CSV export columns (Top workspaces) ─────────────────────────────────────
const TOP_CLIENT_COLUMNS: CsvColumn<TopClient>[] = [
  { header: 'Workspace', value: (r) => r.workspace_name ?? r.email },
  { header: 'Email', value: (r) => r.email },
  { header: 'Plan', value: (r) => r.plan },
  { header: 'Mailboxes', value: (r) => r.mailbox_count },
  { header: 'Send volume', value: (r) => r.send_volume },
  { header: 'Avg warmth', value: (r) => r.avg_warmth },
];

// ─── Main component ─────────────────────────────────────────────────────────
export function AdminDashboardPage() {
  const overview = useAdminOverview();
  const sendVolume = useAdminSendVolume(14);
  const signupRate = useAdminSignupRate(30);
  const planDist = useAdminPlanDistribution();
  const peerStats = useAdminPeerInboxStats();
  const topClients = useAdminTopClients('send_volume');
  const { money } = useLocaleFormat();

  const [selectedId, setSelectedId] = useState<MetricId>('sends');

  // ── Derive chip values from real data ──────────────────────────────────────
  const sendsToday = overview.data?.sends_today ?? 0;
  const totalUsers = overview.data?.total_users ?? 0;
  const mrrRaw = overview.data?.mrr_usd ?? 0;
  const activeMailboxes = overview.data?.active_mailboxes ?? 0;
  const totalMailboxes = overview.data?.total_mailboxes ?? 0;
  const poolHealthPct = overview.data?.peer_pool_health_pct ?? 0;
  const queueDepth = overview.data?.queue_depth ?? 0;

  const activePeers = peerStats.data?.active ?? 0;
  const totalPeers = peerStats.data?.total ?? 0;
  const usedCapacity = peerStats.data?.used_capacity_today ?? 0;
  const totalCapacity = peerStats.data?.total_capacity ?? 0;

  const overviewLoading = overview.isLoading;

  const CHIPS: ChipDef[] = useMemo(
    () => [
      {
        id: 'sends' as MetricId,
        label: 'Warmup Sends',
        short: 'Sends',
        icon: Mail,
        color: '#F26522',
        kind: 'count' as ValueKind,
        value: sendsToday,
        loading: overviewLoading,
      },
      {
        id: 'users' as MetricId,
        label: 'Total Users',
        short: 'Users',
        icon: Users,
        color: '#3ddc97',
        kind: 'count' as ValueKind,
        value: totalUsers,
        loading: overviewLoading,
      },
      {
        id: 'mrr' as MetricId,
        label: 'Monthly Recurring Revenue',
        short: 'MRR',
        icon: DollarSign,
        color: '#FF8A4B',
        kind: 'currency' as ValueKind,
        value: mrrRaw,
        loading: overviewLoading,
      },
      {
        id: 'mailboxes' as MetricId,
        label: 'Active Mailboxes',
        short: 'Mailboxes',
        icon: Mail,
        color: '#F26522',
        kind: 'count' as ValueKind,
        value: activeMailboxes,
        loading: overviewLoading,
      },
      {
        id: 'pool' as MetricId,
        label: 'Account Group Health',
        short: 'Group Health',
        icon: Server,
        color: poolHealthPct >= 80 ? '#3ddc97' : poolHealthPct >= 50 ? '#FF8A4B' : '#ff5c7a',
        kind: 'percent' as ValueKind,
        value: poolHealthPct,
        loading: overviewLoading,
      },
    ],
    [sendsToday, totalUsers, mrrRaw, activeMailboxes, poolHealthPct, overviewLoading],
  );

  const chip = useMemo(
    () => CHIPS.find((c) => c.id === selectedId) ?? CHIPS[0]!,
    [CHIPS, selectedId],
  );

  // ── Hero series: time-series for Sends and Users; breakdown for MRR/Mailboxes/Pool ──
  const isTimeSeries = selectedId === 'sends' || selectedId === 'users';

  // Build a normalised { day, v } series for the area chart
  const heroSeries = useMemo(() => {
    if (selectedId === 'sends') {
      const pts = sendVolume.data ?? [];
      return pts.map((pt) => {
        // Pick first numeric non-date key
        const seriesKey =
          Object.keys(pt).find((k) => k !== 'date' && typeof pt[k] === 'number') ?? 'sends';
        return { day: pt.date, v: (pt[seriesKey] as number) ?? 0 };
      });
    }
    if (selectedId === 'users') {
      const pts = signupRate.data ?? [];
      return pts.map((pt) => ({ day: pt.date, v: pt.signups ?? 0 }));
    }
    return [];
  }, [selectedId, sendVolume.data, signupRate.data]);

  const heroSeriesLoading =
    selectedId === 'sends' ? sendVolume.isLoading : selectedId === 'users' ? signupRate.isLoading : false;

  // Stat rail derived from the series
  const seriesVals = heroSeries.map((d) => d.v);
  const peakVal = seriesVals.length ? Math.max(...seriesVals) : 0;
  const lowVal = seriesVals.length ? Math.min(...seriesVals) : 0;
  const avgVal = seriesVals.length ? seriesVals.reduce((s, v) => s + v, 0) / seriesVals.length : 0;

  // ── Breakdown bars for non-time-series chips ──────────────────────────────
  interface BreakdownRow { label: string; value: number; detail: string; color: string }

  const breakdownData = useMemo((): BreakdownRow[] => {
    if (selectedId === 'mrr') {
      const rows = planDist.data ?? [];
      const totalMrr = rows.reduce((s, r) => s + (r.mrr ?? 0), 0);
      return rows.map((r) => ({
        label: r.plan,
        value: totalMrr > 0 ? Math.round(((r.mrr ?? 0) / totalMrr) * 100) : 0,
        detail: r.mrr != null ? money(r.mrr) + ' / mo' : `${r.count} seats`,
        color: planColor(r.plan),
      }));
    }
    if (selectedId === 'mailboxes') {
      const rows = peerStats.data?.by_provider ?? [];
      const total = rows.reduce((s, r) => s + r.count, 0);
      const colors = ['#F26522', '#FF8A4B', '#3ddc97', 'rgba(255,255,255,0.40)'];
      return rows.map((r, i) => ({
        label: r.provider,
        value: total > 0 ? Math.round((r.count / total) * 100) : 0,
        detail: `${r.count} total · ${r.active} active`,
        color: colors[i % colors.length] ?? '#F26522',
      }));
    }
    if (selectedId === 'pool') {
      const used = usedCapacity;
      const total = totalCapacity;
      const usedPct = total > 0 ? Math.round((used / total) * 100) : 0;
      const freePct = 100 - usedPct;
      const activePct = totalPeers > 0 ? Math.round((activePeers / totalPeers) * 100) : 0;
      const inactivePct = 100 - activePct;
      return [
        { label: 'Daily limit used', value: usedPct, detail: `${formatNumber(used)} / ${formatNumber(total)} slots`, color: usedPct >= 90 ? '#ff5c7a' : usedPct >= 70 ? '#FF8A4B' : '#F26522' },
        { label: 'Daily limit free', value: freePct, detail: `${formatNumber(total - used)} slots available`, color: '#3ddc97' },
        { label: 'Helpers active', value: activePct, detail: `${activePeers} / ${totalPeers} inboxes`, color: '#FF8A4B' },
        { label: 'Helpers inactive', value: inactivePct, detail: `${(totalPeers - activePeers)} offline`, color: 'rgba(255,255,255,0.35)' },
      ];
    }
    return [];
  }, [selectedId, planDist.data, peerStats.data, usedCapacity, totalCapacity, activePeers, totalPeers, money]);

  const breakdownTitle =
    selectedId === 'mrr' ? 'MRR by plan' :
    selectedId === 'mailboxes' ? 'Mailboxes by provider' :
    selectedId === 'pool' ? 'Account group daily-limit breakdown' : '';

  const gradId = `hero-fill-${selectedId}`;
  const unit =
    selectedId === 'mrr' ? '/ mo' :
    selectedId === 'sends' ? 'sends' :
    selectedId === 'users' ? 'signups' : '';

  // ── Plan distribution bento ───────────────────────────────────────────────
  const planRows = planDist.data ?? [];
  const planTotal = planRows.reduce((s, r) => s + r.count, 0);
  const planChartData = planRows.map((r) => ({
    name: r.plan,
    count: r.count,
    color: planColor(r.plan),
  }));

  // ── System status rows from real fields ───────────────────────────────────
  interface SystemRow { label: string; status: 'ok' | 'warn' | 'down'; detail: string }
  const systemRows: SystemRow[] = [
    {
      label: 'SMTP backlog',
      status: queueDepth > 500 ? 'warn' : 'ok',
      detail: `${queueDepth} jobs`,
    },
    {
      label: 'Account group health',
      status: poolHealthPct >= 80 ? 'ok' : poolHealthPct >= 50 ? 'warn' : 'down',
      detail: `${poolHealthPct.toFixed(0)}%`,
    },
    {
      label: 'Active helpers',
      status: activePeers === 0 ? 'down' : activePeers < 5 ? 'warn' : 'ok',
      detail: `${activePeers} / ${totalPeers}`,
    },
    {
      label: 'Total mailboxes',
      status: totalMailboxes === 0 ? 'warn' : 'ok',
      detail: formatNumber(totalMailboxes),
    },
  ];

  const allOk = systemRows.every((r) => r.status === 'ok');
  const anyDown = systemRows.some((r) => r.status === 'down');
  const systemOverall: SystemRow['status'] = anyDown ? 'down' : allOk ? 'ok' : 'warn';
  const systemOverallLabel = anyDown ? 'degraded' : allOk ? 'healthy' : 'attention';
  const systemOverallColor = anyDown ? T.danger : allOk ? T.success : T.warning;

  function statusColor(s: SystemRow['status']): string {
    if (s === 'ok') return T.success;
    if (s === 'warn') return T.warning;
    return T.danger;
  }

  // ── Top workspaces ────────────────────────────────────────────────────────
  const clients = topClients.data ?? [];

  // ── Today's date label ────────────────────────────────────────────────────
  const dateLabel = formatDate(new Date());

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 4px 36px',
        color: T.text,
        fontFamily: 'inherit',
      }}
    >
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <Sparkles size={15} strokeWidth={2.4} style={{ color: T.accent }} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: T.accent,
            }}
          >
            Admin · Insight Spotlight
          </span>
        </div>
        <h1
          style={{
            fontSize: 27,
            fontWeight: 700,
            letterSpacing: '-0.025em',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Platform overview
        </h1>
        <p style={{ fontSize: 13, color: T.dim, marginTop: 5 }}>
          Pick a metric to spotlight — the hero and its breakdown update live · {dateLabel}
        </p>
        </div>
        <ExportButton
          rows={clients}
          columns={TOP_CLIENT_COLUMNS}
          filename={`admin-dashboard-${exportStamp()}`}
        />
      </div>

      {/* ── KPI chip selector ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {CHIPS.map((c) => (
          <MetricChip
            key={c.id}
            chip={c}
            selected={c.id === selectedId}
            onSelect={() => setSelectedId(c.id)}
          />
        ))}
      </div>

      {/* ── HERO spotlight panel ─────────────────────────────────────────── */}
      <Tile
        style={{
          minHeight: 320,
          padding: 26,
          marginBottom: 14,
          borderColor: `${chip.color}40`,
          background: `linear-gradient(160deg, ${chip.color}14, rgba(255,255,255,0.04) 42%)`,
          transition: 'border-color 0.4s ease, background 0.4s ease',
        }}
      >
        {/* Ambient glow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -90,
            right: -70,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${chip.color}33 0%, transparent 68%)`,
            pointerEvents: 'none',
            transition: 'background 0.5s ease',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
            position: 'relative',
          }}
        >
          {/* Hero value + caption */}
          <div style={{ minWidth: 220 }}>
            <MicroLabel>
              <chip.icon size={11} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} />
              {chip.label}
              {isTimeSeries ? ' · last 14 days' : ' · current'}
            </MicroLabel>
            <div
              key={`val-${selectedId}`}
              style={{
                fontSize: 56,
                fontWeight: 800,
                letterSpacing: '-0.035em',
                lineHeight: 1.02,
                marginTop: 10,
                fontVariantNumeric: 'tabular-nums',
                background: `linear-gradient(180deg, #fff, ${chip.color})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: T.text,
              }}
            >
              {chip.loading ? (
                <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', color: chip.color }} />
              ) : selectedId === 'mrr' ? (
                money(mrrRaw)
              ) : (
                <AnimatedValue to={chip.value} kind={chip.kind} />
              )}
            </div>

            {/* Mailboxes: show active/total sub-label */}
            {selectedId === 'mailboxes' && !overviewLoading && (
              <div style={{ fontSize: 13, color: T.dim, marginTop: 6 }}>
                {formatNumber(activeMailboxes)} active of {formatNumber(totalMailboxes)} total
              </div>
            )}

            {/* Pool: capacity sub-label */}
            {selectedId === 'pool' && !overviewLoading && (
              <div style={{ fontSize: 13, color: T.dim, marginTop: 6 }}>
                {activePeers} active helpers · {formatNumber(usedCapacity)} / {formatNumber(totalCapacity)} daily limit used
              </div>
            )}

            <p style={{ fontSize: 13, color: T.dim, marginTop: 14, maxWidth: 340, lineHeight: 1.5 }}>
              {selectedId === 'sends' && 'Total warmup emails delivered across the helper network today.'}
              {selectedId === 'users' && 'Total registered workspaces. Chart shows daily signups over the last 30 days.'}
              {selectedId === 'mrr' && 'Monthly Recurring Revenue across active subscriptions, broken down by plan.'}
              {selectedId === 'mailboxes' && 'Active mailboxes currently in warmup, broken down by email provider.'}
              {selectedId === 'pool' && 'Test account group health percentage — active helpers vs trust-score floor.'}
            </p>
          </div>

          {/* Quick stat rail (time-series only) */}
          {isTimeSeries && !heroSeriesLoading && heroSeries.length > 0 && (
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
              {[
                { k: 'Peak', v: fmt(peakVal, chip.kind, chip.kind === 'percent' ? 1 : 0) },
                { k: 'Low', v: fmt(lowVal, chip.kind, chip.kind === 'percent' ? 1 : 0) },
                { k: 'Avg', v: fmt(avgVal, chip.kind, chip.kind === 'percent' ? 1 : 0) },
              ].map((stat) => (
                <div key={stat.k} style={{ textAlign: 'right' }}>
                  <div style={{ ...T.micro, fontSize: 9 }}>{stat.k}</div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: T.text,
                      marginTop: 4,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {stat.v}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Hero chart area ──────────────────────────────────────────── */}
        <div style={{ flex: 1, minHeight: 150, marginTop: 8, position: 'relative' }}>
          {isTimeSeries ? (
            heroSeriesLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 170 }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: T.dim }} />
              </div>
            ) : heroSeries.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 170,
                  color: T.faint,
                  fontSize: 13,
                }}
              >
                No data yet — start sending warmup emails to see a trend.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart
                  key={`${selectedId}-chart`}
                  data={heroSeries}
                  margin={{ top: 8, right: 6, left: -22, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chip.color} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={chip.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.38)' }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.max(0, Math.floor(heroSeries.length / 7) - 1)}
                  />
                  <YAxis
                    width={54}
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.38)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      chip.kind === 'currency'
                        ? formatMoney(Math.round(v / 1000) * 1000)
                        : chip.kind === 'percent'
                          ? `${Math.round(v)}%`
                          : v >= 1000
                            ? `${Math.round(v / 1000)}k`
                            : `${v}`
                    }
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
                    content={
                      <HeroTooltip kind={chip.kind} unit={unit} color={chip.color} />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={chip.color}
                    strokeWidth={2.4}
                    fill={`url(#${gradId})`}
                    dot={false}
                    activeDot={{ r: 5, fill: chip.color, stroke: '#fff', strokeWidth: 1.6 }}
                    isAnimationActive
                    animationDuration={650}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )
          ) : (
            /* Breakdown bar chart for MRR / Mailboxes / Pool */
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {breakdownData.length === 0 ? (
                <div style={{ color: T.faint, fontSize: 13 }}>No breakdown data yet.</div>
              ) : (
                breakdownData.map((row) => (
                  <div key={`hero-${selectedId}-${row.label}`}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{row.label}</span>
                      <span style={{ fontSize: 12, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                        {row.detail}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 7,
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.07)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${row.value}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: `linear-gradient(90deg, ${row.color}, ${row.color}aa)`,
                          transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)',
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </Tile>

      {/* ── Supporting bento row ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>

        {/* Contextual breakdown tile (reacts to chip) */}
        {!isTimeSeries && (
          <Tile style={{ gridColumn: 'span 5', minHeight: 230 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <MicroLabel>
                <chip.icon size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                {breakdownTitle}
              </MicroLabel>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: chip.color,
                  background: `${chip.color}1f`,
                  border: `1px solid ${chip.color}40`,
                  borderRadius: 999,
                  padding: '3px 8px',
                }}
              >
                {chip.short}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
              {breakdownData.map((row) => (
                <div key={`bento-${selectedId}-${row.label}`}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{row.label}</span>
                    <span style={{ fontSize: 12, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                      {row.detail}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 7,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.07)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${row.value}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${row.color}, ${row.color}aa)`,
                        transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Tile>
        )}

        {/* Plan distribution (always-on) */}
        <Tile
          style={{
            gridColumn: isTimeSeries ? 'span 5' : 'span 4',
            minHeight: 230,
          }}
        >
          <MicroLabel>
            <Building2 size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
            Plan distribution · {formatNumber(planTotal)} accounts
          </MicroLabel>
          {planDist.isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {[1, 2, 3, 4].map((i) => <SkeletonLine key={i} w="100%" h={20} />)}
            </div>
          ) : planChartData.length === 0 ? (
            <div style={{ color: T.faint, fontSize: 13 }}>No plan data yet.</div>
          ) : (
            <>
              <div style={{ flex: 1, minHeight: 0, marginTop: 2 }}>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={planChartData} margin={{ top: 6, right: 4, left: -28, bottom: 0 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.38)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <div
                            style={{
                              background: 'rgba(18,18,24,0.94)',
                              border: '1px solid rgba(255,255,255,0.14)',
                              borderRadius: 9,
                              padding: '6px 10px',
                              fontSize: 12,
                            }}
                          >
                            <span style={{ color: T.dim }}>{label}: </span>
                            <span style={{ color: T.text, fontWeight: 700 }}>
                              {formatNumber((payload[0]?.value as number) ?? 0)}
                            </span>
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={34}>
                      {planChartData.map((p) => (
                        <Cell key={p.name} fill={p.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                {planChartData.map((p) => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                    <span style={{ color: T.dim }}>{p.name}</span>
                    <span style={{ color: T.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {p.count}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Tile>

        {/* Pool capacity (always-on) */}
        <Tile
          style={{
            gridColumn: isTimeSeries ? 'span 4' : 'span 3',
            minHeight: 230,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>
              <Database size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              Account group daily limit
            </MicroLabel>
            <span style={{ fontSize: 11.5, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(usedCapacity)} / {formatNumber(totalCapacity)}
            </span>
          </div>
          {peerStats.isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map((i) => <SkeletonLine key={i} w="100%" h={16} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 4 }}>
              {[
                { label: 'Daily limit used', used: usedCapacity, cap: totalCapacity },
                { label: 'Helpers active', used: activePeers, cap: totalPeers },
              ].map((row) => {
                const pct = row.cap > 0 ? Math.round((row.used / row.cap) * 100) : 0;
                const tone = pct >= 90 ? T.danger : pct >= 80 ? T.warning : T.accent;
                return (
                  <div key={row.label}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 5,
                      }}
                    >
                      <span style={{ fontSize: 12.5, color: T.text, fontWeight: 500 }}>{row.label}</span>
                      <span style={{ fontSize: 11.5, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                        {formatNumber(row.used)}/{formatNumber(row.cap)} · {pct}%
                      </span>
                    </div>
                    <div
                      style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: `linear-gradient(90deg, ${tone}, ${tone}bb)`,
                          transition: 'width 0.8s ease-out',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 4, fontSize: 12, color: T.dim }}>
                Avg trust score:{' '}
                <span style={{ color: T.text, fontWeight: 600 }}>
                  {(peerStats.data?.avg_reputation ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </Tile>

        {/* System status (always-on) */}
        <Tile
          style={{
            gridColumn: isTimeSeries ? 'span 3' : 'span 3',
            minHeight: 230,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>
              <Server size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              System status
            </MicroLabel>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: systemOverallColor,
              }}
            >
              {systemOverall === 'ok' ? (
                <CheckCircle2 size={11} />
              ) : (
                <AlertTriangle size={11} />
              )}
              {systemOverallLabel}
            </span>
          </div>
          {overviewLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3, 4].map((i) => <SkeletonLine key={i} w="100%" h={14} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 2 }}>
              {systemRows.map((row, i) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '8.5px 0',
                    borderBottom: i < systemRows.length - 1 ? `1px solid ${T.hairline}` : 'none',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: statusColor(row.status),
                      boxShadow: `0 0 6px ${statusColor(row.status)}88`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12.5, color: T.text, flex: 1, fontWeight: 500 }}>
                    {row.label}
                  </span>
                  <span style={{ fontSize: 11, color: T.faint, whiteSpace: 'nowrap' }}>
                    {row.detail}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Tile>

        {/* Top workspaces (always-on, replaces fake activity feed) */}
        <Tile style={{ gridColumn: 'span 7', minHeight: 190 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>
              <Users size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              Top workspaces · by send volume
            </MicroLabel>
            <TrendingUp size={12} style={{ color: T.accent }} />
          </div>
          {topClients.isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((i) => <SkeletonLine key={i} w="100%" h={16} />)}
            </div>
          ) : clients.length === 0 ? (
            <div style={{ color: T.faint, fontSize: 13 }}>No workspace data yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              {/* Header row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr 80px 80px',
                  gap: '0 10px',
                  padding: '0 0 6px',
                  borderBottom: `1px solid ${T.hairline}`,
                  marginBottom: 2,
                }}
              >
                {['#', 'Workspace', 'Plan', 'Sends'].map((h) => (
                  <span key={h} style={{ ...T.micro, fontSize: 9 }}>{h}</span>
                ))}
              </div>
              {clients.slice(0, 6).map((client, i) => (
                <div
                  key={client.user_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr 80px 80px',
                    gap: '0 10px',
                    alignItems: 'center',
                    padding: '7px 0',
                    borderBottom: i < Math.min(clients.length, 6) - 1 ? `1px solid ${T.hairline}` : 'none',
                  }}
                >
                  <span style={{ fontSize: 11, color: T.faint, fontVariantNumeric: 'tabular-nums' }}>
                    {i + 1}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: T.text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {client.workspace_name ?? client.email}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: T.faint,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {client.email}
                    </div>
                  </div>
                  <PlanBadge plan={client.plan} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: T.text,
                      fontVariantNumeric: 'tabular-nums',
                      textAlign: 'right',
                    }}
                  >
                    {formatNumber(client.send_volume)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Tile>

        {/* Pool capacity details (span 5, always-on, second row) */}
        <Tile style={{ gridColumn: 'span 5', minHeight: 190 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>
              <Database size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              Helper providers
            </MicroLabel>
            <span style={{ fontSize: 11.5, color: T.dim }}>
              {totalPeers} total · {activePeers} active
            </span>
          </div>
          {peerStats.isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map((i) => <SkeletonLine key={i} w="100%" h={16} />)}
            </div>
          ) : (peerStats.data?.by_provider ?? []).length === 0 ? (
            <div style={{ color: T.faint, fontSize: 13 }}>No test accounts configured yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 4 }}>
              {(peerStats.data?.by_provider ?? []).map((row, i) => {
                const colors = ['#F26522', '#FF8A4B', '#3ddc97', 'rgba(255,255,255,0.40)'];
                const color = colors[i % colors.length] ?? '#F26522';
                const activePct = row.count > 0 ? Math.round((row.active / row.count) * 100) : 0;
                return (
                  <div key={row.provider}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 5,
                      }}
                    >
                      <span style={{ fontSize: 12.5, color: T.text, fontWeight: 500, textTransform: 'capitalize' }}>
                        {row.provider.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: 11.5, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                        {row.active}/{row.count} · {activePct}%
                      </span>
                    </div>
                    <div
                      style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          width: `${activePct}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: `linear-gradient(90deg, ${color}, ${color}bb)`,
                          transition: 'width 0.8s ease-out',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Tile>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 16,
          fontSize: 11.5,
          color: T.faint,
        }}
      >
        <Activity size={12} style={{ color: T.accent }} />
        Live snapshot · data from real admin API · auto-stale every 5 min ·
        {poolHealthPct < 80 && (
          <>
            <AlertTriangle size={12} style={{ color: T.warning, marginLeft: 2 }} />
            Account group health below 80% — review test accounts
          </>
        )}
      </div>
    </div>
  );
}

export default AdminDashboardPage;
