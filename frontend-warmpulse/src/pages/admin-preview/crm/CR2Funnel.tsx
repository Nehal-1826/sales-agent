/**
 * Admin CRM Design Candidate: CR2 Pipeline Funnel
 *
 * "Pipeline Funnel" — cross-workspace engagement funnel (Enrolled → Delivered →
 * Opened → Replied → Converted) with spring-animated stage bars, animated
 * counters, conversion-rate markers, a sequence/campaign leaderboard with
 * FLIP reordering on metric toggle, per-row pause/resume management, and
 * workspace drill-down via AnimatePresence.
 *
 * Fully self-contained: inline style={{}} only, mock data only,
 * no API / react-query / @/features / @/lib imports.
 * Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. No purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Users,
  Mail,
  MailOpen,
  MessageSquare,
  CheckCircle2,
  ChevronRight,
  Play,
  Pause,
  Eye,
  TrendingUp,
  BarChart2,
  Activity,
  Building2,
  X,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.42)' as const,
  ghost: 'rgba(255,255,255,0.22)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentHi: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.15)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.12)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.12)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.12)' as const,
  gold: '#f5c542' as const,
  goldDim: 'rgba(245,197,66,0.12)' as const,
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

// ─── Types ──────────────────────────────────────────────────────────────────────
type Range = '14d' | '30d';
type LeaderMetric = 'replyRate' | 'openRate' | 'volume';
type DrillTarget = 'workspace' | 'sequence' | null;
type SeqStatus = 'active' | 'paused' | 'draft';

interface FunnelData {
  enrolled: number;
  delivered: number;
  opened: number;
  replied: number;
  converted: number;
}

interface WorkspaceContrib {
  id: string;
  name: string;
  color: string;
  enrolled: number;
  delivered: number;
  opened: number;
  replied: number;
  converted: number;
}

interface SequenceRow {
  id: string;
  name: string;
  workspace: string;
  workspaceColor: string;
  campaign: string;
  enrolled: number;
  openRate: number;
  replyRate: number;
  conversions: number;
  status: SeqStatus;
  steps: number;
  avgDaysToConvert: number;
}

interface DayPoint {
  day: string;
  opens: number;
  replies: number;
  enrolls: number;
}

// ─── Mock data ─────────────────────────────────────────────────────────────────
const FUNNEL_14D: FunnelData = {
  enrolled: 8_420,
  delivered: 8_011,
  opened: 5_408,
  replied: 2_163,
  converted: 681,
};

const FUNNEL_30D: FunnelData = {
  enrolled: 19_850,
  delivered: 18_754,
  opened: 12_388,
  replied: 4_826,
  converted: 1_542,
};

const WORKSPACES: WorkspaceContrib[] = [
  { id: 'ws1', name: 'TechForge Solutions',    color: '#F26522', enrolled: 1840, delivered: 1751, opened: 1192, replied: 481, converted: 154 },
  { id: 'ws2', name: 'BrightMail Agency',       color: '#FF8A4B', enrolled: 2210, delivered: 2099, opened: 1408, replied: 563, converted: 178 },
  { id: 'ws3', name: 'Outbound Co.',            color: '#3ddc97', enrolled: 980,  delivered: 931,  opened: 614,  replied: 242, converted: 76  },
  { id: 'ws4', name: 'SalesBlast Labs',         color: '#f5c542', enrolled: 720,  delivered: 684,  opened: 462,  replied: 187, converted: 58  },
  { id: 'ws5', name: 'GrowthStack Inc.',        color: '#F26522', enrolled: 1350, delivered: 1284, opened: 856,  replied: 344, converted: 109 },
  { id: 'ws6', name: 'SendWarm EU',             color: '#FF8A4B', enrolled: 880,  delivered: 836,  opened: 570,  replied: 228, converted: 71  },
  { id: 'ws7', name: 'InboxRise JP',            color: '#3ddc97', enrolled: 440,  delivered: 426,  opened: 306,  replied: 118, converted: 35  },
];

const SEQUENCES: SequenceRow[] = [
  { id: 's1', name: 'Cold Outreach Blast',      workspace: 'BrightMail Agency',    workspaceColor: '#FF8A4B', campaign: 'Q2 Pipeline',      enrolled: 2210, openRate: 63.7, replyRate: 25.5, conversions: 178, status: 'active',  steps: 5, avgDaysToConvert: 8  },
  { id: 's2', name: 'Enterprise Decision Maker', workspace: 'TechForge Solutions',  workspaceColor: '#F26522', campaign: 'ENT Series',        enrolled: 1840, openRate: 64.8, replyRate: 26.1, conversions: 154, status: 'active',  steps: 7, avgDaysToConvert: 12 },
  { id: 's3', name: 'SaaS Founder Nurture',      workspace: 'GrowthStack Inc.',     workspaceColor: '#F26522', campaign: 'Founder Pipeline',  enrolled: 1350, openRate: 63.4, replyRate: 25.5, conversions: 109, status: 'active',  steps: 6, avgDaysToConvert: 10 },
  { id: 's4', name: 'SMB Re-engagement',         workspace: 'SendWarm EU',          workspaceColor: '#FF8A4B', campaign: 'EMEA Revival',      enrolled: 880,  openRate: 64.8, replyRate: 25.9, conversions: 71,  status: 'paused',  steps: 4, avgDaysToConvert: 6  },
  { id: 's5', name: 'Mid-Market AE Sequence',    workspace: 'Outbound Co.',         workspaceColor: '#3ddc97', campaign: 'MM Expansion',      enrolled: 980,  openRate: 62.7, replyRate: 24.7, conversions: 76,  status: 'active',  steps: 8, avgDaysToConvert: 14 },
  { id: 's6', name: 'Healthcare Decision Track', workspace: 'SalesBlast Labs',      workspaceColor: '#f5c542', campaign: 'Vertical Series',   enrolled: 720,  openRate: 64.2, replyRate: 26.0, conversions: 58,  status: 'active',  steps: 5, avgDaysToConvert: 9  },
  { id: 's7', name: 'JP Tech Warm Intro',        workspace: 'InboxRise JP',         workspaceColor: '#3ddc97', campaign: 'APAC Launch',       enrolled: 440,  openRate: 69.5, replyRate: 26.8, conversions: 35,  status: 'paused',  steps: 4, avgDaysToConvert: 7  },
  { id: 's8', name: 'Referral Partner Invite',   workspace: 'TechForge Solutions',  workspaceColor: '#F26522', campaign: 'Partner Network',   enrolled: 390,  openRate: 61.5, replyRate: 23.8, conversions: 28,  status: 'draft',   steps: 3, avgDaysToConvert: 5  },
];

function makeDayPoints(range: Range): DayPoint[] {
  const n = range === '14d' ? 14 : 30;
  const pts: DayPoint[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(2026, 4, 31 - (n - 1 - i));
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const base = 180 + Math.sin(i * 0.45) * 60 + i * 2;
    pts.push({
      day: label,
      enrolls: Math.round(base + Math.random() * 40),
      opens: Math.round(base * 0.64 + Math.random() * 30),
      replies: Math.round(base * 0.26 + Math.random() * 15),
    });
  }
  return pts;
}

// ─── Animated counter hook ──────────────────────────────────────────────────────
function useAnimatedCounter(target: number, decimals = 0, duration = 1.2) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState('0');
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.stop();
    ctrlRef.current = animate(mv, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(v) {
        setDisplay(
          decimals > 0
            ? v.toFixed(decimals)
            : Math.round(v).toLocaleString()
        );
      },
    });
    return () => {
      ctrlRef.current?.stop();
    };
  }, [target, decimals, duration, mv]);

  return display;
}

// ─── Variants ───────────────────────────────────────────────────────────────────
const containerV: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const fadeUpV: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

const scaleInV: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const drillV: Variants = {
  hidden: { opacity: 0, height: 0, scaleY: 0.9 },
  show: { opacity: 1, height: 'auto', scaleY: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, height: 0, scaleY: 0.9, transition: { duration: 0.3, ease: [0.36, 0, 0.66, -0.56] } },
};

const toastV: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } },
  exit: { opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.25 } },
};

// ─── Stage color map ────────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  enrolled:  '#F26522',
  delivered: '#FF8A4B',
  opened:    '#f5c542',
  replied:   '#3ddc97',
  converted: '#3ddc97',
};

const STAGE_ICONS: Record<string, (props: { size?: number; color?: string }) => JSX.Element | null> = {
  enrolled:  (p) => <Users size={p.size ?? 16} color={p.color} />,
  delivered: (p) => <Mail size={p.size ?? 16} color={p.color} />,
  opened:    (p) => <MailOpen size={p.size ?? 16} color={p.color} />,
  replied:   (p) => <MessageSquare size={p.size ?? 16} color={p.color} />,
  converted: (p) => <CheckCircle2 size={p.size ?? 16} color={p.color} />,
};

// ─── Funnel stage bar ───────────────────────────────────────────────────────────
interface StageBarProps {
  label: string;
  value: number;
  pct: number;
  color: string;
  convPct?: number;
  isSelected: boolean;
  onClick: () => void;
}

function StageBar({ label, value, pct, color, convPct, isSelected, onClick }: StageBarProps) {
  const Icon = STAGE_ICONS[label] ?? (() => null);
  const count = useAnimatedCounter(value);
  const pctDisp = useAnimatedCounter(pct, 1, 0.9);

  return (
    <motion.div
      layout
      variants={fadeUpV}
      onClick={onClick}
      whileHover={{ scale: 1.015, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
      whileTap={{ scale: 0.98 }}
      style={{
        cursor: 'pointer',
        padding: '14px 18px',
        borderRadius: 12,
        border: isSelected
          ? `1px solid ${color}55`
          : '1px solid rgba(255,255,255,0.08)',
        background: isSelected
          ? `${color}11`
          : 'rgba(255,255,255,0.03)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      {/* animated fill bar */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.1 }}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          background: `linear-gradient(90deg, ${color}22 0%, ${color}08 100%)`,
          borderRadius: 12,
        }}
      />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={15} color={color} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              textTransform: 'capitalize',
              fontWeight: 600, fontSize: 13,
              color: isSelected ? color : T.text,
              transition: 'color 0.2s',
            }}>
              {label}
            </span>
            {convPct !== undefined && (
              <span style={{
                ...T.micro,
                color: convPct >= 60 ? T.success : convPct >= 40 ? T.warning : T.danger,
                fontSize: 9,
              }}>
                ↓ {convPct.toFixed(1)}%
              </span>
            )}
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              height: 4, flex: 1,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 2, overflow: 'hidden',
            }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.15 }}
                style={{ height: '100%', background: color, borderRadius: 2 }}
              />
            </div>
            <span style={{ fontSize: 11, color: T.faint, whiteSpace: 'nowrap' }}>
              {pctDisp}%
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: T.text, letterSpacing: '-0.02em' }}>
            {count}
          </div>
          <div style={{ fontSize: 10, color: T.faint }}>leads</div>
        </div>

        <motion.div
          animate={{ rotate: isSelected ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <ChevronRight size={14} color={isSelected ? color : T.ghost} />
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Mini sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ data, color, width = 80, height = 28 }: {
  data: number[]; color: string; width?: number; height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const pathD = `M${pts.join(' L')}`;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
export function AdmCrmCR2Funnel() {
  const [range, setRange] = useState<Range>('14d');
  const [leaderMetric, setLeaderMetric] = useState<LeaderMetric>('replyRate');
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [drillMode, setDrillMode] = useState<DrillTarget>(null);
  const [seqStatuses, setSeqStatuses] = useState<Record<string, SeqStatus>>(
    () => Object.fromEntries(SEQUENCES.map(s => [s.id, s.status]))
  );
  const [expandedSeq, setExpandedSeq] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'danger' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chartPoints] = useState(() => makeDayPoints('30d'));

  const funnel = range === '14d' ? FUNNEL_14D : FUNNEL_30D;
  const maxVal = funnel.enrolled;

  const stages: { key: keyof FunnelData; label: string }[] = [
    { key: 'enrolled',  label: 'enrolled'  },
    { key: 'delivered', label: 'delivered' },
    { key: 'opened',    label: 'opened'    },
    { key: 'replied',   label: 'replied'   },
    { key: 'converted', label: 'converted' },
  ];

  // conv rates between adjacent stages
  const convRates: number[] = [
    (funnel.delivered / funnel.enrolled) * 100,
    (funnel.opened / funnel.delivered) * 100,
    (funnel.replied / funnel.opened) * 100,
    (funnel.converted / funnel.replied) * 100,
  ];

  // KPI counters
  const totalEnrolled = useAnimatedCounter(funnel.enrolled);
  const overallOpen   = useAnimatedCounter((funnel.opened / funnel.enrolled) * 100, 1);
  const overallReply  = useAnimatedCounter((funnel.replied / funnel.enrolled) * 100, 1);
  const overallConv   = useAnimatedCounter((funnel.converted / funnel.enrolled) * 100, 1);

  // leaderboard sort
  const sortedSeqs = [...SEQUENCES].sort((a, b) => {
    if (leaderMetric === 'replyRate') return b.replyRate - a.replyRate;
    if (leaderMetric === 'openRate')  return b.openRate - a.openRate;
    return b.enrolled - a.enrolled;
  });

  const showToast = useCallback((msg: string, kind: 'success' | 'danger' | 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, kind });
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const toggleSeq = useCallback((id: string) => {
    const cur = seqStatuses[id] ?? 'active';
    const next: SeqStatus = cur === 'active' ? 'paused' : 'active';
    setSeqStatuses(prev => ({ ...prev, [id]: next }));
    const seq = SEQUENCES.find(s => s.id === id);
    if (!seq) return;
    showToast(
      next === 'paused'
        ? `"${seq.name}" paused`
        : `"${seq.name}" resumed`,
      next === 'paused' ? 'info' : 'success'
    );
  }, [seqStatuses, showToast]);

  const handleStageClick = (label: string) => {
    if (selectedStage === label) {
      setSelectedStage(null);
      setDrillMode(null);
    } else {
      setSelectedStage(label);
      setDrillMode('workspace');
    }
  };

  // sparkline data from chartPoints
  const sparkOpens   = chartPoints.slice(-14).map(p => p.opens);
  const sparkReplies = chartPoints.slice(-14).map(p => p.replies);
  const sparkEnrolls = chartPoints.slice(-14).map(p => p.enrolls);

  const kpis = [
    { label: 'Total Enrolled', value: totalEnrolled, icon: <Users size={16} color={T.accent} />, sparkData: sparkEnrolls, sparkColor: T.accent, suffix: '' },
    { label: 'Open Rate',      value: overallOpen,   icon: <MailOpen size={16} color={T.gold} />,    sparkData: sparkOpens,   sparkColor: T.gold,    suffix: '%' },
    { label: 'Reply Rate',     value: overallReply,  icon: <MessageSquare size={16} color={T.success} />, sparkData: sparkReplies, sparkColor: T.success, suffix: '%' },
    { label: 'Conversion',     value: overallConv,   icon: <CheckCircle2 size={16} color={T.accentHi} />, sparkData: sparkReplies.map(v => v * 0.32), sparkColor: T.accentHi, suffix: '%' },
  ];

  // workspace drill filtered to stage
  const getStageKey = (label: string): keyof WorkspaceContrib => {
    const map: Record<string, keyof WorkspaceContrib> = {
      enrolled: 'enrolled', delivered: 'delivered', opened: 'opened',
      replied: 'replied', converted: 'converted',
    };
    return map[label] ?? 'enrolled';
  };

  const drillWorkspaces = selectedStage
    ? [...WORKSPACES].sort((a, b) => {
        const k = getStageKey(selectedStage);
        return (b[k] as number) - (a[k] as number);
      })
    : [];

  const metricOptions: { key: LeaderMetric; label: string }[] = [
    { key: 'replyRate', label: 'Reply Rate' },
    { key: 'openRate',  label: 'Open Rate'  },
    { key: 'volume',    label: 'Volume'     },
  ];

  // chart path builder
  const chartWidth  = 600;
  const chartHeight = 80;
  const buildPath = (vals: number[], color: string) => {
    if (vals.length < 2) return null;
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const rng = mx - mn || 1;
    const xs = vals.map((_, i) => (i / (vals.length - 1)) * chartWidth);
    const ys = vals.map(v => chartHeight - ((v - mn) / rng) * (chartHeight - 4) - 2);
    const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i] ?? chartHeight}`).join(' ');
    const fill = `${d} L${chartWidth},${chartHeight} L0,${chartHeight} Z`;
    return { d, fill, color };
  };

  const pts14 = chartPoints.slice(-14);
  const openPath   = buildPath(pts14.map(p => p.opens),   T.gold);
  const replyPath  = buildPath(pts14.map(p => p.replies), T.success);
  const enrollPath = buildPath(pts14.map(p => p.enrolls), T.accent);

  return (
    <motion.div
      variants={containerV}
      initial="hidden"
      animate="show"
      style={{
        padding: '24px 20px',
        maxWidth: 1160,
        margin: '0 auto',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: T.text,
        minHeight: '100vh',
      }}
    >
      {/* ── Header ── */}
      <motion.div variants={fadeUpV} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: T.accentDim,
                border: `1px solid ${T.accent}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Activity size={18} color={T.accent} />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: T.text, margin: 0 }}>
                CRM Pipeline Funnel
              </h1>
            </div>
            <p style={{ fontSize: 13, color: T.dim, margin: 0 }}>
              Cross-workspace engagement funnel · sequence performance · lead management
            </p>
          </div>

          {/* range toggle */}
          <div style={{
            display: 'flex', gap: 4, padding: 4,
            ...T.glassTight,
          }}>
            {(['14d', '30d'] as Range[]).map(r => (
              <motion.button
                key={r}
                onClick={() => setRange(r)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  padding: '6px 16px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: range === r ? T.accent : 'transparent',
                  color: range === r ? '#fff' : T.dim,
                  transition: 'background 0.2s, color 0.2s',
                }}
              >
                {r}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── KPI strip ── */}
      <motion.div
        variants={containerV}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            variants={fadeUpV}
            custom={i}
            whileHover={{ y: -2, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
            style={{
              ...T.glass,
              padding: '16px 18px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {k.icon}
              </div>
              <Sparkline data={k.sparkData} color={k.sparkColor} width={60} height={24} />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.04em', color: T.text }}>
                {k.value}{k.suffix}
              </div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>{k.label}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Main layout: Funnel left, Chart right ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        marginBottom: 16,
      }}>
        {/* Funnel column */}
        <motion.div variants={scaleInV} style={{ ...T.glass, padding: '20px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Engagement Funnel</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>Click a stage to drill down</div>
            </div>
            <div style={{
              ...T.micro,
              padding: '4px 8px',
              background: T.accentDim,
              borderRadius: 6,
              border: `1px solid ${T.accent}33`,
              color: T.accentHi,
            }}>
              {WORKSPACES.length} workspaces
            </div>
          </div>

          <motion.div variants={containerV} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stages.map((s, i) => (
              <StageBar
                key={s.key}
                label={s.label}
                value={funnel[s.key]}
                pct={(funnel[s.key] / maxVal) * 100}
                color={STAGE_COLORS[s.label] ?? T.accent}
                convPct={i > 0 ? convRates[i - 1] : undefined}
                isSelected={selectedStage === s.label}
                onClick={() => handleStageClick(s.label)}
              />
            ))}
          </motion.div>

          {/* conversion connectors */}
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {convRates.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px',
                borderRadius: 20,
                background: r >= 60 ? T.successDim : r >= 40 ? T.warningDim : T.dangerDim,
                border: `1px solid ${r >= 60 ? T.success : r >= 40 ? T.warning : T.danger}33`,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: r >= 60 ? T.success : r >= 40 ? T.warning : T.danger }}>
                  {stages[i]?.label?.slice(0, 3) ?? '?'} → {stages[i + 1]?.label?.slice(0, 3) ?? '?'}
                </span>
                <ArrowRight size={9} color={r >= 60 ? T.success : r >= 40 ? T.warning : T.danger} />
                <span style={{ fontSize: 10, fontWeight: 700, color: r >= 60 ? T.success : r >= 40 ? T.warning : T.danger }}>
                  {r.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Engagement trend chart */}
        <motion.div variants={scaleInV} style={{ ...T.glass, padding: '20px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Engagement Trend</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>Last 14 days · cross-workspace</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Enrolls', color: T.accent },
                { label: 'Opens',   color: T.gold },
                { label: 'Replies', color: T.success },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                  <span style={{ fontSize: 10, color: T.faint }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SVG chart */}
          <div style={{ width: '100%', overflowX: 'hidden' }}>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight + 20}`}
              style={{ width: '100%', height: 'auto' }}
              preserveAspectRatio="none"
            >
              {/* grid lines */}
              {[0, 0.33, 0.66, 1].map((f, i) => (
                <line
                  key={i}
                  x1={0} y1={f * chartHeight}
                  x2={chartWidth} y2={f * chartHeight}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={0.8}
                />
              ))}

              {/* area fills */}
              {enrollPath && (
                <motion.path
                  d={enrollPath.fill}
                  fill={`${enrollPath.color}18`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8 }}
                />
              )}
              {openPath && (
                <motion.path
                  d={openPath.fill}
                  fill={`${openPath.color}18`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                />
              )}
              {replyPath && (
                <motion.path
                  d={replyPath.fill}
                  fill={`${replyPath.color}18`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
              )}

              {/* lines */}
              {enrollPath && (
                <motion.path
                  d={enrollPath.d}
                  fill="none" stroke={enrollPath.color} strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                />
              )}
              {openPath && (
                <motion.path
                  d={openPath.d}
                  fill="none" stroke={openPath.color} strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                />
              )}
              {replyPath && (
                <motion.path
                  d={replyPath.d}
                  fill="none" stroke={replyPath.color} strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
                />
              )}

              {/* x-axis labels */}
              {pts14.filter((_, i) => i % 3 === 0).map((p, i) => (
                <text
                  key={i}
                  x={(pts14.findIndex(pt => pt.day === p.day) / (pts14.length - 1)) * chartWidth}
                  y={chartHeight + 16}
                  fill="rgba(255,255,255,0.3)"
                  fontSize={8}
                  textAnchor="middle"
                >
                  {p.day}
                </text>
              ))}
            </svg>
          </div>

          {/* chart mini stats */}
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'Avg. Daily Enrolls', value: Math.round(pts14.reduce((s, p) => s + p.enrolls, 0) / pts14.length), color: T.accent },
              { label: 'Avg. Daily Opens',   value: Math.round(pts14.reduce((s, p) => s + p.opens,   0) / pts14.length), color: T.gold },
              { label: 'Avg. Daily Replies', value: Math.round(pts14.reduce((s, p) => s + p.replies, 0) / pts14.length), color: T.success },
            ].map(stat => (
              <div key={stat.label} style={{
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 8,
                border: `1px solid ${stat.color}22`,
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Workspace drill-down ── */}
      <AnimatePresence>
        {selectedStage && drillMode === 'workspace' && (
          <motion.div
            key="drill"
            variants={drillV}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ originY: 0, marginBottom: 16, overflow: 'hidden' }}
          >
            <div style={{ ...T.glass, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={14} color={STAGE_COLORS[selectedStage] ?? T.accent} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                    Workspace breakdown — <span style={{ color: STAGE_COLORS[selectedStage] ?? T.accent, textTransform: 'capitalize' }}>{selectedStage}</span>
                  </span>
                </div>
                <motion.button
                  onClick={() => { setSelectedStage(null); setDrillMode(null); }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                >
                  <X size={14} color={T.dim} />
                </motion.button>
              </div>

              <motion.div
                variants={containerV}
                initial="hidden"
                animate="show"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}
              >
                {drillWorkspaces.map((ws, i) => {
                  const stageVal = ws[getStageKey(selectedStage)] as number;
                  const total    = ws.enrolled;
                  const pct      = (stageVal / total) * 100;
                  return (
                    <motion.div
                      key={ws.id}
                      variants={fadeUpV}
                      custom={i}
                      whileHover={{ y: -2, scale: 1.02, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
                      style={{
                        padding: '12px 10px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${ws.color}33`,
                        textAlign: 'center',
                        cursor: 'default',
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: `${ws.color}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 8px',
                      }}>
                        <Building2 size={12} color={ws.color} />
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{stageVal.toLocaleString()}</div>
                      <div style={{
                        fontSize: 9, fontWeight: 700,
                        color: pct >= 70 ? T.success : pct >= 50 ? T.warning : T.danger,
                        marginTop: 2,
                      }}>
                        {pct.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 9, color: T.faint, marginTop: 4, lineHeight: 1.3 }}>
                        {ws.name.split(' ').slice(0, 2).join(' ')}
                      </div>
                      {/* progress bar */}
                      <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ type: 'spring', stiffness: 80, damping: 20, delay: i * 0.04 }}
                          style={{ height: '100%', background: ws.color, borderRadius: 2 }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sequence Leaderboard ── */}
      <motion.div variants={scaleInV} style={{ ...T.glass, padding: '20px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={16} color={T.accent} />
            <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Sequence Performance Leaderboard</span>
            <span style={{ ...T.micro, padding: '3px 7px', background: T.accentDim, borderRadius: 5, color: T.accentHi, border: `1px solid ${T.accent}33` }}>
              {SEQUENCES.length} sequences
            </span>
          </div>

          {/* metric toggle */}
          <div style={{ display: 'flex', gap: 4, padding: 4, ...T.glassTight }}>
            {metricOptions.map(opt => (
              <motion.button
                key={opt.key}
                onClick={() => setLeaderMetric(opt.key)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11, fontWeight: 600,
                  background: leaderMetric === opt.key ? T.accent : 'transparent',
                  color: leaderMetric === opt.key ? '#fff' : T.dim,
                  transition: 'background 0.2s, color 0.2s',
                }}
              >
                {opt.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr 130px 80px 80px 80px 80px 100px',
          gap: 8,
          padding: '6px 10px',
          marginBottom: 4,
        }}>
          {['#', 'Sequence / Campaign', 'Workspace', 'Enrolled', 'Open %', 'Reply %', 'Conv.', 'Actions'].map(h => (
            <div key={h} style={{ ...T.micro }}>{h}</div>
          ))}
        </div>

        {/* FLIP-reordered rows */}
        <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <AnimatePresence>
            {sortedSeqs.map((seq, idx) => {
              const status = seqStatuses[seq.id] ?? seq.status;
              const isExpanded = expandedSeq === seq.id;
              const metricVal = leaderMetric === 'replyRate'
                ? seq.replyRate
                : leaderMetric === 'openRate' ? seq.openRate : seq.enrolled;
              const metricMax = leaderMetric === 'volume' ? 2500 : 100;

              return (
                <motion.div
                  key={seq.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                  style={{
                    borderRadius: 10,
                    border: isExpanded
                      ? `1px solid ${seq.workspaceColor}44`
                      : '1px solid rgba(255,255,255,0.07)',
                    background: isExpanded
                      ? `${seq.workspaceColor}0a`
                      : 'rgba(255,255,255,0.025)',
                    overflow: 'hidden',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  {/* main row */}
                  <motion.div
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr 130px 80px 80px 80px 80px 100px',
                      gap: 8,
                      padding: '10px 10px',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => setExpandedSeq(isExpanded ? null : seq.id)}
                  >
                    {/* rank */}
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: idx === 0 ? T.accentDim : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${idx === 0 ? T.accent + '44' : 'transparent'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                      color: idx === 0 ? T.accent : T.faint,
                    }}>
                      {idx + 1}
                    </div>

                    {/* name + campaign */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {seq.name}
                      </div>
                      <div style={{ fontSize: 10, color: T.faint, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {seq.campaign} · {seq.steps} steps
                      </div>
                    </div>

                    {/* workspace */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: seq.workspaceColor, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 10, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {seq.workspace.split(' ').slice(0, 2).join(' ')}
                      </span>
                    </div>

                    {/* enrolled */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                      {seq.enrolled.toLocaleString()}
                    </div>

                    {/* open % */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: leaderMetric === 'openRate' ? T.gold : T.text,
                      }}>
                        {seq.openRate.toFixed(1)}%
                      </span>
                      {leaderMetric === 'openRate' && <TrendingUp size={9} color={T.gold} />}
                    </div>

                    {/* reply % */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: leaderMetric === 'replyRate' ? T.success : T.text,
                      }}>
                        {seq.replyRate.toFixed(1)}%
                      </span>
                      {leaderMetric === 'replyRate' && <TrendingUp size={9} color={T.success} />}
                    </div>

                    {/* conversions */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.accentHi }}>
                      {seq.conversions}
                    </div>

                    {/* actions */}
                    <div
                      style={{ display: 'flex', gap: 4 }}
                      onClick={e => e.stopPropagation()}
                    >
                      {/* pause/resume */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => toggleSeq(seq.id)}
                        title={status === 'active' ? 'Pause' : 'Resume'}
                        style={{
                          width: 28, height: 28, borderRadius: 7,
                          border: `1px solid ${status === 'active' ? T.warning + '44' : T.success + '44'}`,
                          background: status === 'active' ? T.warningDim : T.successDim,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {status === 'active'
                          ? <Pause size={11} color={T.warning} />
                          : <Play  size={11} color={T.success} />}
                      </motion.button>

                      {/* view detail */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          setExpandedSeq(isExpanded ? null : seq.id);
                          showToast(`Viewing "${seq.name}"`, 'info');
                        }}
                        title="View detail"
                        style={{
                          width: 28, height: 28, borderRadius: 7,
                          border: '1px solid rgba(255,255,255,0.10)',
                          background: 'rgba(255,255,255,0.04)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Eye size={11} color={T.dim} />
                      </motion.button>

                      {/* status pill */}
                      <div style={{
                        padding: '3px 7px',
                        borderRadius: 6,
                        fontSize: 9, fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        background: status === 'active' ? T.successDim
                          : status === 'paused' ? T.warningDim
                          : T.dangerDim,
                        color: status === 'active' ? T.success
                          : status === 'paused' ? T.warning
                          : T.danger,
                        border: `1px solid ${
                          status === 'active' ? T.success
                          : status === 'paused' ? T.warning
                          : T.danger}33`,
                        alignSelf: 'center',
                      }}>
                        {status}
                      </div>
                    </div>
                  </motion.div>

                  {/* metric progress bar */}
                  <div style={{ padding: '0 10px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                      <motion.div
                        layout
                        animate={{ width: `${Math.min((metricVal / metricMax) * 100, 100)}%` }}
                        transition={{ type: 'spring', stiffness: 80, damping: 20 }}
                        style={{ height: '100%', background: seq.workspaceColor, borderRadius: 2 }}
                      />
                    </div>
                    <span style={{ fontSize: 9, color: T.ghost, minWidth: 36, textAlign: 'right' }}>
                      {leaderMetric === 'volume'
                        ? seq.enrolled.toLocaleString()
                        : `${metricVal.toFixed(1)}%`}
                    </span>
                  </div>

                  {/* expanded detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{
                          padding: '14px 16px',
                          borderTop: '1px solid rgba(255,255,255,0.07)',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(5, 1fr)',
                          gap: 10,
                        }}>
                          {[
                            { label: 'Campaign',       value: seq.campaign },
                            { label: 'Steps',          value: `${seq.steps} steps` },
                            { label: 'Avg. to Convert',value: `${seq.avgDaysToConvert}d` },
                            { label: 'Status',         value: status },
                            { label: 'Conversions',    value: seq.conversions },
                          ].map(item => (
                            <div key={item.label} style={{
                              padding: '8px 10px',
                              background: 'rgba(255,255,255,0.04)',
                              borderRadius: 8,
                            }}>
                              <div style={{ fontSize: 10, color: T.faint, marginBottom: 3 }}>{item.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{item.value}</div>
                            </div>
                          ))}
                        </div>

                        {/* mini funnel for this sequence */}
                        <div style={{ padding: '0 16px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
                          {[
                            { label: 'Enrolled',  val: seq.enrolled },
                            { label: 'Delivered', val: Math.round(seq.enrolled * 0.952) },
                            { label: 'Opened',    val: Math.round(seq.enrolled * (seq.openRate / 100)) },
                            { label: 'Replied',   val: Math.round(seq.enrolled * (seq.replyRate / 100)) },
                            { label: 'Converted', val: seq.conversions },
                          ].map((st, si) => (
                            <div key={st.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div style={{
                                padding: '4px 8px',
                                borderRadius: 6,
                                background: `${seq.workspaceColor}18`,
                                border: `1px solid ${seq.workspaceColor}33`,
                                textAlign: 'center',
                              }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: seq.workspaceColor }}>
                                  {st.val.toLocaleString()}
                                </div>
                                <div style={{ fontSize: 9, color: T.faint }}>{st.label}</div>
                              </div>
                              {si < 4 && <ArrowRight size={10} color={T.ghost} />}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* ── Workspace summary strip ── */}
      <motion.div variants={fadeUpV} style={{ ...T.glass, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Building2 size={14} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Workspace Health Overview</span>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 10,
        }}>
          {WORKSPACES.map((ws) => {
            const openPct  = (ws.opened  / ws.enrolled) * 100;
            const replyPct = (ws.replied / ws.enrolled) * 100;
            const convPct  = (ws.converted / ws.enrolled) * 100;
            const health   = convPct >= 7 ? 'great' : convPct >= 4 ? 'good' : 'low';
            const healthColor = health === 'great' ? T.success : health === 'good' ? T.warning : T.danger;

            return (
              <motion.div
                key={ws.id}
                whileHover={{ y: -3, scale: 1.02, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
                style={{
                  padding: '12px 10px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${ws.color}28`,
                  cursor: 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: `${ws.color}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Building2 size={11} color={ws.color} />
                  </div>
                  <span style={{ fontSize: 9, color: T.dim, lineHeight: 1.3, fontWeight: 600 }}>
                    {ws.name.split(' ').slice(0, 2).join(' ')}
                  </span>
                </div>

                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>
                  {ws.enrolled.toLocaleString()}
                  <span style={{ fontSize: 9, color: T.faint, fontWeight: 400, marginLeft: 3 }}>enrl</span>
                </div>

                {/* stacked mini metrics */}
                {[
                  { label: 'Open',  pct: openPct,  color: T.gold    },
                  { label: 'Reply', pct: replyPct, color: T.success },
                  { label: 'Conv',  pct: convPct,  color: T.accentHi },
                ].map(m => (
                  <div key={m.label} style={{ marginBottom: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 8, color: T.ghost }}>{m.label}</span>
                      <span style={{ fontSize: 8, color: m.color, fontWeight: 600 }}>{m.pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${m.pct}%` }}
                        transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.3 }}
                        style={{ height: '100%', background: m.color, borderRadius: 1 }}
                      />
                    </div>
                  </div>
                ))}

                {/* health badge */}
                <div style={{ marginTop: 6, textAlign: 'center' }}>
                  <span style={{
                    fontSize: 8, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    color: healthColor,
                    padding: '2px 6px',
                    background: `${healthColor}18`,
                    borderRadius: 4,
                    border: `1px solid ${healthColor}33`,
                  }}>
                    {health}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Footer stat strip ── */}
      <motion.div variants={fadeUpV}>
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.025)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={11} color={T.faint} />
            <span style={{ fontSize: 10, color: T.ghost }}>Cross-workspace · mock data · {range} window</span>
          </div>
          <div style={{ flex: 1 }} />
          {[
            { label: 'Active sequences', value: Object.values(seqStatuses).filter(s => s === 'active').length, color: T.success },
            { label: 'Paused sequences', value: Object.values(seqStatuses).filter(s => s === 'paused').length, color: T.warning },
            { label: 'Workspaces tracked', value: WORKSPACES.length, color: T.accent },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: 10, color: T.ghost }}>{s.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertCircle size={10} color={T.faint} />
            <span style={{ fontSize: 10, color: T.ghost }}>Super-admin only</span>
          </div>
        </div>
      </motion.div>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            variants={toastV}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{
              position: 'fixed',
              bottom: 28, right: 28,
              padding: '12px 18px',
              borderRadius: 12,
              background:
                toast.kind === 'success' ? 'rgba(61,220,151,0.15)'
                : toast.kind === 'danger' ? 'rgba(255,92,122,0.15)'
                : 'rgba(242,101,34,0.15)',
              border: `1px solid ${
                toast.kind === 'success' ? T.success
                : toast.kind === 'danger' ? T.danger
                : T.accent}44`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13, fontWeight: 600,
              color:
                toast.kind === 'success' ? T.success
                : toast.kind === 'danger' ? T.danger
                : T.accentHi,
              zIndex: 9999,
              pointerEvents: 'none',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {toast.kind === 'success' && <CheckCircle2 size={16} color={T.success} />}
            {toast.kind === 'danger'  && <AlertCircle  size={16} color={T.danger}  />}
            {toast.kind === 'info'    && <Activity      size={16} color={T.accent}  />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
