/**
 * /admin/crm — CR3 Workspace Grid (live)
 *
 * Visual design: CR3 Workspace CRM Grid (AdmCrmCR3Grid candidate).
 * ALL data wired to real hooks:
 *   useAdminCrmOverview    → overview totals + workspace card grid
 *   useAdminCrmWorkspaceDetail → workspace drill-in (campaign_list, sequence_list, recent_activities)
 *   useSetSequenceStatus   → pause/resume a sequence + cache invalidation
 *
 * Field mapping:
 *   Grid cards             → overview.workspaces (name, plan, owner_email, campaigns, leads,
 *                            sequences_active/paused, active_enrollments, open_rate, reply_rate,
 *                            last_activity_at)
 *   Health indicator       → derived from open_rate + reply_rate + last_activity_at (honest)
 *   KPI header             → overview totals (total_campaigns, total_leads, sequences_active+paused,
 *                            active_enrollments, open_rate)
 *   Sparkline / trend      → DROPPED — no per-workspace time series in API. Rate bars
 *                            (open_rate + reply_rate) are used instead.
 *   Engagement tier filter → derived from open_rate (high ≥55, low <30, else medium)
 *   Detail panel           → campaign_list, sequence_list, recent_activities
 *   Pause/resume toggle    → useSetSequenceStatus → POST /admin/crm/sequences/{id}/status
 *   layoutId morph         → card-{workspace_id} → centered panel (fixed left:0 right:0 margin:0 auto)
 *
 * Motion preserved from CR3 preview:
 *   staggered card entrance, whileHover lift+glow, layoutId card→detail morph,
 *   AnimatePresence, animated KPI counters (useMotionValue+animate+cleanup),
 *   RateBar animate scaleX, filter chips + search with layout re-sort,
 *   pulse HealthDot, sequence stagger in detail panel.
 *
 * Palette: warm Aurora Glass — orange #F26522/#FF8A4B, success #3ddc97,
 *   danger #ff5c7a, warning #FF8A4B. NO purple/violet/blue/teal/pink.
 */

import {
  useEffect,
  useState,
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
  Building2,
  Users,
  Layers,
  Activity,
  ChevronRight,
  X,
  Play,
  Pause,
  Search,
  RefreshCw,
  Target,
  BarChart2,
  Filter,
  CheckCircle2,
  Clock,
  Eye,
  Reply,
  Loader2,
} from 'lucide-react';
import {
  useAdminCrmOverview,
  useAdminCrmWorkspaceDetail,
  useSetSequenceStatus,
} from '@/features/admin/api';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';
import type {
  AdminCrmWorkspaceRow,
  AdminCrmWorkspaceDetail,
  AdminCrmRecentActivity,
} from '@/features/admin/types';
import { formatNumber } from '@/lib/format';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';

// ─── CSV export columns ───────────────────────────────────────────────────────
const CRM_EXPORT_COLUMNS: CsvColumn<AdminCrmWorkspaceRow>[] = [
  { header: 'Workspace', value: (w) => w.name },
  { header: 'Owner Email', value: (w) => w.owner_email },
  { header: 'Plan', value: (w) => w.plan ?? 'Free' },
  { header: 'Campaigns', value: (w) => w.campaigns },
  { header: 'Leads', value: (w) => w.leads },
  { header: 'Sequences Active', value: (w) => w.sequences_active },
  { header: 'Sequences Paused', value: (w) => w.sequences_paused },
  { header: 'Active Enrollments', value: (w) => w.active_enrollments },
  { header: 'Open Rate %', value: (w) => w.open_rate.toFixed(1) },
  { header: 'Reply Rate %', value: (w) => w.reply_rate.toFixed(1) },
  { header: 'Last Activity', value: (w) => w.last_activity_at ?? '' },
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text: '#fff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.38)',
  hairline: 'rgba(255,255,255,0.08)',
  accent: '#F26522',
  accentMid: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,
  glassDeep: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.13)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRadius: 14,
  } as CSSProperties,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.42)',
  } as CSSProperties,
};

// ─── Derived types ────────────────────────────────────────────────────────────
type HealthTier = 'healthy' | 'warning' | 'critical';
type EngagementTier = 'high' | 'medium' | 'low';

function deriveHealth(ws: AdminCrmWorkspaceRow): HealthTier {
  if (ws.open_rate < 25 || ws.reply_rate < 5) return 'critical';
  if (ws.open_rate < 45 || ws.reply_rate < 10) return 'warning';
  return 'healthy';
}

function deriveEngagementTier(ws: AdminCrmWorkspaceRow): EngagementTier {
  if (ws.open_rate >= 55) return 'high';
  if (ws.open_rate < 30) return 'low';
  return 'medium';
}

// ─── Framer-motion variants ───────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 280, damping: 26 } },
  exit: { opacity: 0, y: -12, scale: 0.97, transition: { duration: 0.18 } },
};
const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};
const detailVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { delay: 0.12, duration: 0.24 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};
const chipVariants: Variants = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1 },
};
const kpiVariants: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, type: 'spring', stiffness: 300, damping: 24 },
  }),
};

// ─── Animated counter hook ────────────────────────────────────────────────────
function useAnimatedCounter(target: number, decimals = 0, delay = 0): string {
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    let ctrl: ReturnType<typeof animate> | null = null;
    const timeout = setTimeout(() => {
      ctrl = animate(motionVal, target, {
        duration: 1.4,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (v) => setDisplay(v.toFixed(decimals)),
      });
    }, delay);
    return () => {
      clearTimeout(timeout);
      ctrl?.stop();
    };
  }, [target, decimals, delay, motionVal]);

  return display;
}

// ─── Mini bar for rate display ────────────────────────────────────────────────
function RateBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <motion.div
        style={{ position: 'absolute', inset: 0, borderRadius: 2, background: color, transformOrigin: 'left center' }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.min(1, value / 100) }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
      />
    </div>
  );
}

// ─── Health indicator ─────────────────────────────────────────────────────────
function HealthDot({ health }: { health: HealthTier }) {
  const color = health === 'healthy' ? T.success : health === 'warning' ? T.warning : T.danger;
  return (
    <motion.div
      style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
      animate={{ boxShadow: [`0 0 0 0 ${color}55`, `0 0 0 5px ${color}00`] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

// ─── Plan badge ───────────────────────────────────────────────────────────────
function PlanBadge({ plan }: { plan: string | null }) {
  const label = plan ?? 'Free';
  const lower = label.toLowerCase();
  const color =
    lower === 'agency' ? T.accent :
    lower === 'pro plus' || lower === 'pro_plus' ? T.accentMid :
    lower === 'pro' ? T.success :
    T.faint;

  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color,
      background: `${color}18`,
      border: `1px solid ${color}40`,
      borderRadius: 6,
      padding: '2px 7px',
    }}>
      {label}
    </span>
  );
}

// ─── Relative time helper ─────────────────────────────────────────────────────
function relativeTime(isoStr: string | null): string {
  if (!isoStr) return 'never';
  const diff = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ─── Activity icon/color by kind ─────────────────────────────────────────────
const ACTIVITY_ICON: Record<string, typeof Eye> = {
  open: Eye,
  reply: Reply,
  enrolled: Target,
  completed: CheckCircle2,
};
const ACTIVITY_COLOR: Record<string, string> = {
  open: T.faint,
  reply: T.success,
  enrolled: T.accentMid,
  completed: T.accent,
};
function activityIcon(kind: string): typeof Eye {
  return ACTIVITY_ICON[kind] ?? Activity;
}
function activityColor(kind: string): string {
  return ACTIVITY_COLOR[kind] ?? T.dim;
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
interface KpiTileProps {
  label: string;
  value: number;
  suffix?: string;
  icon: typeof Building2;
  color: string;
  index: number;
  decimals?: number;
}

function KpiTile({ label, value, suffix = '', icon: Icon, color, index, decimals = 0 }: KpiTileProps) {
  const count = useAnimatedCounter(value, decimals, index * 80);
  return (
    <motion.div
      custom={index}
      variants={kpiVariants}
      initial="hidden"
      animate="visible"
      style={{ ...T.glass, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 160px' }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>
          {count}{suffix}
        </div>
        <div style={{ ...T.micro, marginTop: 2 }}>{label}</div>
      </div>
    </motion.div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────
interface DetailPanelProps {
  ws: AdminCrmWorkspaceRow;
  detail: AdminCrmWorkspaceDetail | null | undefined;
  detailLoading: boolean;
  onClose: () => void;
  onPauseToggle: (seqId: string, currentlyPaused: boolean) => void;
  pausingId: string | null;
}

function DetailPanel({ ws, detail, detailLoading, onClose, onPauseToggle, pausingId }: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'sequences' | 'activity'>('sequences');
  const health = deriveHealth(ws);

  const sequences = detail?.sequence_list ?? [];
  const campaigns = detail?.campaign_list ?? [];
  const activities = detail?.recent_activities ?? [];

  // Helper to format recent activity timestamps
  function actAt(act: AdminCrmRecentActivity): string {
    return relativeTime(act.at);
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ duration: 0.22 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Panel — layoutId morphs from card */}
      <motion.div
        layoutId={`card-${ws.workspace_id}`}
        style={{
          position: 'fixed',
          top: '5%', left: 0, right: 0,
          margin: '0 auto',
          width: 'min(860px, 94vw)',
          maxHeight: '90vh',
          zIndex: 101,
          overflowY: 'auto',
          ...T.glass,
          background: 'rgba(20,20,22,0.92)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: `0 32px 80px rgba(0,0,0,0.7)`,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.12) transparent',
        }}
      >
        {/* Panel header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <HealthDot health={health} />
              <span style={{ ...T.micro, color: T.faint }}>Workspace CRM</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: T.text }}>{ws.name}</span>
              <PlanBadge plan={ws.plan} />
            </div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>{ws.owner_email}</div>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.1, background: 'rgba(255,255,255,0.10)' }}
            whileTap={{ scale: 0.93 }}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, padding: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim, flexShrink: 0, marginTop: 4 }}
          >
            <X size={16} />
          </motion.button>
        </div>

        {/* KPI strip */}
        <motion.div
          variants={detailVariants}
          initial="hidden" animate="visible" exit="exit"
          style={{ display: 'flex', gap: 12, padding: '18px 28px 0', flexWrap: 'wrap' }}
        >
          {[
            { label: 'Campaigns', value: ws.campaigns, icon: Layers, color: T.accent },
            { label: 'Leads', value: ws.leads >= 1000 ? `${(ws.leads / 1000).toFixed(1)}k` : String(ws.leads), icon: Users, color: T.accentMid },
            { label: 'Enrollments', value: ws.active_enrollments, icon: Target, color: T.success },
            { label: 'Open Rate', value: `${ws.open_rate.toFixed(1)}%`, icon: Eye, color: T.dim },
            { label: 'Reply Rate', value: `${ws.reply_rate.toFixed(1)}%`, icon: Reply, color: T.success },
          ].map((k) => (
            <div key={k.label} style={{ ...T.glassDeep, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 9, flex: '1 1 auto', minWidth: 100 }}>
              <k.icon size={14} color={k.color} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{typeof k.value === 'number' ? formatNumber(k.value) : k.value}</div>
                <div style={{ ...T.micro, marginTop: 1 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Tab bar */}
        <motion.div
          variants={detailVariants}
          initial="hidden" animate="visible" exit="exit"
          style={{ display: 'flex', gap: 4, padding: '20px 28px 0' }}
        >
          {(['sequences', 'campaigns', 'activity'] as const).map((tab) => (
            <motion.button
              key={tab}
              onClick={() => setActiveTab(tab)}
              whileHover={{ background: 'rgba(255,255,255,0.08)' }}
              whileTap={{ scale: 0.97 }}
              style={{
                background: activeTab === tab ? `rgba(242,101,34,0.18)` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeTab === tab ? T.accent + '50' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8,
                padding: '7px 16px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: activeTab === tab ? T.text : T.dim,
                textTransform: 'capitalize',
                letterSpacing: '0.04em',
                transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              }}
            >
              {tab}
            </motion.button>
          ))}
        </motion.div>

        {/* Tab content */}
        <motion.div
          variants={detailVariants}
          initial="hidden" animate="visible" exit="exit"
          style={{ padding: '16px 28px 28px' }}
        >
          {detailLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.faint, fontSize: 12, padding: '20px 0' }}>
              <Loader2 size={14} className="animate-spin" />
              Loading detail…
            </div>
          )}

          {!detailLoading && (
            <AnimatePresence mode="wait">
              {activeTab === 'sequences' && (
                <motion.div
                  key="sequences"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {sequences.length === 0 && (
                    <div style={{ color: T.faint, fontSize: 13, padding: '20px 0' }}>No sequences found.</div>
                  )}
                  {sequences.map((seq, idx) => {
                    const isPaused = seq.paused;
                    const isPausing = pausingId === seq.id;
                    return (
                      <motion.div
                        key={seq.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        style={{ ...T.glassDeep, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seq.name}</div>
                          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.dim }}>
                            <span>{seq.enrolled} enrolled</span>
                            <span style={{ color: T.success }}>{seq.open_rate.toFixed(1)}% open</span>
                            <span style={{ color: T.accentMid }}>{seq.reply_rate.toFixed(1)}% reply</span>
                          </div>
                        </div>
                        {/* toggle */}
                        <motion.button
                          onClick={() => { if (!isPausing) onPauseToggle(seq.id, isPaused); }}
                          whileHover={{ scale: isPausing ? 1 : 1.05 }}
                          whileTap={{ scale: isPausing ? 1 : 0.94 }}
                          disabled={isPausing}
                          style={{
                            flexShrink: 0,
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: isPaused ? 'rgba(61,220,151,0.14)' : 'rgba(255,92,122,0.12)',
                            border: `1px solid ${isPaused ? T.success + '40' : T.danger + '40'}`,
                            borderRadius: 8,
                            padding: '5px 10px',
                            cursor: isPausing ? 'default' : 'pointer',
                            fontSize: 11,
                            fontWeight: 600,
                            color: isPaused ? T.success : T.danger,
                            opacity: isPausing ? 0.6 : 1,
                          }}
                        >
                          {isPausing
                            ? <Loader2 size={11} className="animate-spin" />
                            : isPaused ? <Play size={11} /> : <Pause size={11} />
                          }
                          {isPaused ? 'Resume' : 'Pause'}
                        </motion.button>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}

              {activeTab === 'campaigns' && (
                <motion.div
                  key="campaigns"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {campaigns.length === 0 && (
                    <div style={{ color: T.faint, fontSize: 13, padding: '20px 0' }}>No campaigns found.</div>
                  )}
                  {campaigns.map((camp, idx) => {
                    const lower = camp.status.toLowerCase();
                    const statusColor = lower === 'active' ? T.success : lower === 'draft' ? T.dim : T.faint;
                    return (
                      <motion.div
                        key={camp.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        style={{ ...T.glassDeep, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{camp.name}</div>
                          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.dim }}>
                            <span>{formatNumber(camp.leads)} leads</span>
                          </div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}40`, borderRadius: 6, padding: '2px 7px' }}>
                          {camp.status}
                        </span>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}

              {activeTab === 'activity' && (
                <motion.div
                  key="activity"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {activities.length === 0 && (
                    <div style={{ color: T.faint, fontSize: 13, padding: '20px 0' }}>No recent activity.</div>
                  )}
                  {activities.map((act, idx) => {
                    const Icon = activityIcon(act.kind);
                    const col = activityColor(act.kind);
                    return (
                      <motion.div
                        key={`${act.kind}-${idx}`}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        style={{ ...T.glassDeep, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${col}18`, border: `1px solid ${col}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={13} color={col} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{act.lead_label}</div>
                          <div style={{ fontSize: 11, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ textTransform: 'capitalize', color: col }}>{act.kind}</span>
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.faint }}>
                          <Clock size={10} />
                          {actAt(act)}
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </motion.div>
      </motion.div>
    </>
  );
}

// ─── Workspace card ───────────────────────────────────────────────────────────
interface WorkspaceCardProps {
  ws: AdminCrmWorkspaceRow;
  onClick: () => void;
}

function WorkspaceCard({ ws, onClick }: WorkspaceCardProps) {
  const health = deriveHealth(ws);
  const sparkColor = health === 'critical' ? T.danger : health === 'warning' ? T.warning : T.success;

  return (
    <motion.div
      layoutId={`card-${ws.workspace_id}`}
      variants={cardVariants}
      layout
      onClick={onClick}
      whileHover={{
        y: -5,
        boxShadow: `0 20px 48px rgba(0,0,0,0.5), 0 0 0 1px ${sparkColor}30`,
        transition: { duration: 0.22 },
      }}
      whileTap={{ scale: 0.985 }}
      style={{
        ...T.glass,
        padding: '18px 20px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
      }}
    >
      {/* Glow accent line on hover */}
      <motion.div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${sparkColor}80, transparent)`,
          opacity: 0,
        }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${T.accent}18`, border: `1px solid ${T.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={15} color={T.accent} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</div>
            <div style={{ fontSize: 10, color: T.faint, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.owner_email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 6 }}>
          <HealthDot health={health} />
          <PlanBadge plan={ws.plan} />
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Campaigns', val: ws.campaigns, icon: Layers },
          { label: 'Leads', val: ws.leads >= 1000 ? `${(ws.leads / 1000).toFixed(1)}k` : String(ws.leads), icon: Users },
          { label: 'Enrollments', val: ws.active_enrollments, icon: Target },
        ].map((k) => (
          <div key={k.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <k.icon size={10} color={T.faint} />
              <span style={{ ...T.micro, fontSize: 9 }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{typeof k.val === 'number' ? formatNumber(k.val) : k.val}</div>
          </div>
        ))}
      </div>

      {/* Sequence pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {ws.sequences_active > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: T.success, background: `${T.success}14`, border: `1px solid ${T.success}30`, borderRadius: 6, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Play size={8} fill={T.success} />
            {ws.sequences_active} active
          </span>
        )}
        {ws.sequences_paused > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: T.warning, background: `${T.warning}14`, border: `1px solid ${T.warning}30`, borderRadius: 6, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Pause size={8} />
            {ws.sequences_paused} paused
          </span>
        )}
      </div>

      {/* Rate bars (honest — no sparkline, no time series in API) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ ...T.micro, fontSize: 9 }}>Open rate</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.success }}>{ws.open_rate.toFixed(1)}%</span>
        </div>
        <RateBar value={ws.open_rate} color={T.success} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, marginBottom: 3 }}>
          <span style={{ ...T.micro, fontSize: 9 }}>Reply rate</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.accentMid }}>{ws.reply_rate.toFixed(1)}%</span>
        </div>
        <RateBar value={ws.reply_rate} color={T.accentMid} />
      </div>

      {/* Footer */}
      <div style={{ marginTop: 4, paddingTop: 10, borderTop: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.faint }}>
          <Clock size={9} />
          <span>{relativeTime(ws.last_activity_at)}</span>
        </div>
        <motion.div
          style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: T.accent, fontWeight: 600 }}
          animate={{ x: [0, 2, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
        >
          Manage <ChevronRight size={10} />
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function CrmManagementPage() {
  const overview = useAdminCrmOverview();
  const setSequenceStatus = useSetSequenceStatus();

  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [hasActiveFilter, setHasActiveFilter] = useState(false);
  const [tierFilter, setTierFilter] = useState<EngagementTier | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);

  // Fetch workspace detail only when a card is expanded
  const detail = useAdminCrmWorkspaceDetail(expandedId);

  const workspaces: AdminCrmWorkspaceRow[] = overview.data?.workspaces ?? [];

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Unique plan labels from real data
  const planLabels = Array.from(new Set(workspaces.map((w) => w.plan ?? 'Free').filter(Boolean)));

  // Filter
  const filtered = workspaces.filter((ws) => {
    if (planFilter !== 'all' && (ws.plan ?? 'Free') !== planFilter) return false;
    if (hasActiveFilter && ws.sequences_active === 0) return false;
    if (tierFilter !== 'all' && deriveEngagementTier(ws) !== tierFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !ws.name.toLowerCase().includes(q) && !ws.owner_email.toLowerCase().includes(q)) return false;
    return true;
  });

  const expandedWs = expandedId != null ? (workspaces.find((w) => w.workspace_id === expandedId) ?? null) : null;

  // KPI totals from real overview
  const kpiTotalCampaigns = overview.data?.total_campaigns ?? 0;
  const kpiTotalLeads = overview.data?.total_leads ?? 0;
  const kpiSeqsActive = overview.data?.sequences_active ?? 0;
  const kpiSeqsPaused = overview.data?.sequences_paused ?? 0;
  const kpiAvgOpen = overview.data?.open_rate ?? 0;

  const handlePauseToggle = useCallback(async (seqId: string, currentlyPaused: boolean) => {
    setPausingId(seqId);
    try {
      await setSequenceStatus.mutateAsync({
        sequenceId: seqId,
        paused: !currentlyPaused,
        workspaceId: expandedId ?? undefined,
      });
      toast.success(currentlyPaused ? 'Sequence resumed.' : 'Sequence paused.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to update sequence.'));
    } finally {
      setPausingId(null);
    }
  }, [setSequenceStatus, expandedId]);

  const tierChips: Array<{ label: string; val: EngagementTier | 'all' }> = [
    { label: 'High Activity', val: 'high' },
    { label: 'Medium', val: 'medium' },
    { label: 'Low', val: 'low' },
  ];

  return (
    <div style={{ minHeight: '100%', padding: '28px 28px 60px', fontFamily: 'Inter, system-ui, sans-serif', color: T.text, position: 'relative' }}>

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <BarChart2 size={16} color={T.accent} />
            <span style={{ ...T.micro }}>Admin · CRM Management</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: 0, background: `linear-gradient(135deg, #fff 60%, ${T.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Workspace CRM Grid
          </h1>
          <p style={{ fontSize: 13, color: T.dim, margin: '6px 0 0' }}>
            Cross-workspace view — campaign health, sequence management, opens and replies at a glance.
          </p>
        </div>
        <ExportButton
          rows={filtered}
          columns={CRM_EXPORT_COLUMNS}
          filename={`crm-${exportStamp()}`}
        />
      </motion.div>

      {/* Loading state */}
      {overview.isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.faint, fontSize: 12, marginBottom: 20 }}>
          <Loader2 size={14} className="animate-spin" />
          Loading CRM overview…
        </div>
      )}

      {/* KPI header row */}
      {!overview.isLoading && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
          <KpiTile label="Workspaces w/ CRM" value={workspaces.length} icon={Building2} color={T.accent} index={0} />
          <KpiTile label="Total Campaigns" value={kpiTotalCampaigns} icon={Layers} color={T.accentMid} index={1} />
          <KpiTile label="Total Leads" value={kpiTotalLeads} icon={Users} color={T.success} index={2} />
          <KpiTile label="Active Sequences" value={kpiSeqsActive + kpiSeqsPaused} icon={Activity} color={T.warning} index={3} />
          <KpiTile label="Avg Open Rate" value={kpiAvgOpen} suffix="%" icon={Eye} color={T.success} index={4} decimals={1} />
        </div>
      )}

      {/* Filter row */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22, alignItems: 'center' }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <Search size={12} color={T.faint} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspace or owner…"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 9,
              padding: '8px 12px 8px 28px',
              fontSize: 12,
              color: T.text,
              outline: 'none',
              width: 210,
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ width: 1, height: 24, background: T.hairline }} />

        {/* Plan chips (dynamic from real data) */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', ...planLabels].map((p, i) => (
            <motion.button
              key={p}
              custom={i}
              variants={chipVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.08 + i * 0.04 }}
              onClick={() => setPlanFilter(p)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              style={{
                background: planFilter === p ? `${T.accent}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${planFilter === p ? T.accent + '60' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8,
                padding: '5px 12px',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                color: planFilter === p ? T.accent : T.dim,
                transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              }}
            >
              {p === 'all' ? 'All Plans' : p}
            </motion.button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: T.hairline }} />

        {/* Active sequences toggle */}
        <motion.button
          onClick={() => setHasActiveFilter((v) => !v)}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          style={{
            background: hasActiveFilter ? `${T.success}18` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${hasActiveFilter ? T.success + '50' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 8,
            padding: '5px 12px',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            color: hasActiveFilter ? T.success : T.dim,
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          }}
        >
          <Filter size={10} />
          Has Active Sequences
        </motion.button>

        {/* Tier chips */}
        {tierChips.map((c, i) => (
          <motion.button
            key={c.val}
            variants={chipVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.24 + i * 0.04 }}
            onClick={() => setTierFilter(tierFilter === c.val ? 'all' : c.val)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            style={{
              background: tierFilter === c.val ? `${T.accentMid}1c` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${tierFilter === c.val ? T.accentMid + '55' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 8,
              padding: '5px 12px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              color: tierFilter === c.val ? T.accentMid : T.dim,
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
          >
            {c.label}
          </motion.button>
        ))}

        {/* Results count */}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.faint }}>
          {filtered.length} of {workspaces.length} workspaces
        </span>
      </motion.div>

      {/* Card grid */}
      <motion.div
        layout
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((ws) => (
            <WorkspaceCard
              key={ws.workspace_id}
              ws={ws}
              onClick={() => setExpandedId(ws.workspace_id)}
            />
          ))}
        </AnimatePresence>

        {!overview.isLoading && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 20px', color: T.faint, fontSize: 14 }}
          >
            <RefreshCw size={28} color={T.faint} style={{ marginBottom: 12, opacity: 0.5 }} />
            <div>No workspaces match your filters.</div>
          </motion.div>
        )}
      </motion.div>

      {/* Expanded detail panel */}
      <AnimatePresence>
        {expandedWs != null && (
          <DetailPanel
            key={expandedWs.workspace_id}
            ws={expandedWs}
            detail={detail.data}
            detailLoading={detail.isLoading}
            onClose={() => setExpandedId(null)}
            onPauseToggle={handlePauseToggle}
            pausingId={pausingId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default CrmManagementPage;
