/**
 * Admin CRM Design Candidate: CR1 Command Center
 *
 * "Command Center" — a cross-workspace CRM management cockpit for super-admins.
 * KPI row (animated counters) → per-workspace CRM table (search/filter/sort with
 * FLIP-reorder + AnimatePresence) → drill drawer with campaigns, sequences (pause/
 * resume toggles), and lead/activity snapshot.
 *
 * Framer-motion techniques:
 *  - useMotionValue + animate() for KPI counters with cleanup
 *  - Staggered row entrance (containerVariants / rowVariants)
 *  - FLIP-reorder via `layout` on AnimatePresence children
 *  - Spring drawer slide-in (AnimatePresence + drawerVariants)
 *  - whileHover / whileTap on interactive elements
 *  - GPU-friendly transforms only (no box-shadow mutations in keyframes)
 *
 * Fully self-contained: inline style={{}} only, mock data only.
 * Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. No purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
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
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Users,
  Mail,
  Activity,
  Target,
  GitBranch,
  Layers,
  TrendingUp,
  Play,
  Pause,
  StopCircle,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Filter,
  SlidersHorizontal,
  BarChart2,
  UserPlus,
  MessageSquare,
  Inbox,
  Send,
  Star,
  Reply,
  ShieldAlert,
} from 'lucide-react';

// ─── Design tokens ──────────────────────────────────────────────────────────────
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
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.42)',
  } as CSSProperties,
};

// ─── Types ───────────────────────────────────────────────────────────────────────
type Plan = 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';
type SeqStatus = 'active' | 'paused' | 'draft' | 'completed';
type CampaignStatus = 'active' | 'paused' | 'stopped' | 'draft';
type SortKey = 'workspace' | 'campaigns' | 'leads' | 'sequences' | 'enrollments' | 'openRate' | 'replyRate' | 'emailsSent' | 'lastActivity';
type SortDir = 'asc' | 'desc';

interface LeadActivity {
  id: string;
  leadName: string;
  leadEmail: string;
  action: 'opened' | 'replied' | 'clicked' | 'bounced' | 'unsubscribed';
  campaignName: string;
  ts: string;
}

interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  leads: number;
  emailsSent: number;
  openRate: number;
  replyRate: number;
  created: string;
}

interface SequenceRow {
  id: string;
  name: string;
  status: SeqStatus;
  steps: number;
  enrolled: number;
  completed: number;
  campaignName: string;
}

interface WorkspaceRow {
  id: string;
  workspace: string;
  plan: Plan;
  campaigns: number;
  leads: number;
  sequences: number;
  activeSequences: number;
  enrollments: number;
  openRate: number;
  replyRate: number;
  emailsSent: number;
  lastActivity: string;
  riskFlag: boolean;
  drillData: {
    campaigns: CampaignRow[];
    sequences: SequenceRow[];
    recentActivity: LeadActivity[];
  };
}

// ─── Mock data ───────────────────────────────────────────────────────────────────
const WORKSPACES: WorkspaceRow[] = [
  {
    id: 'ws01',
    workspace: 'TechForge Solutions',
    plan: 'Agency',
    campaigns: 14,
    leads: 4820,
    sequences: 9,
    activeSequences: 7,
    enrollments: 1240,
    openRate: 38.4,
    replyRate: 12.1,
    emailsSent: 28400,
    lastActivity: '2 min ago',
    riskFlag: false,
    drillData: {
      campaigns: [
        { id: 'c1', name: 'Q2 Outreach Blitz', status: 'active', leads: 1420, emailsSent: 9800, openRate: 41.2, replyRate: 14.3, created: '2026-04-01' },
        { id: 'c2', name: 'Enterprise Cold Push', status: 'active', leads: 880, emailsSent: 6200, openRate: 36.8, replyRate: 11.4, created: '2026-04-15' },
        { id: 'c3', name: 'Re-engagement Wave', status: 'paused', leads: 560, emailsSent: 3400, openRate: 28.6, replyRate: 6.2, created: '2026-03-20' },
      ],
      sequences: [
        { id: 's1', name: '5-Step Cold Intro', status: 'active', steps: 5, enrolled: 620, completed: 280, campaignName: 'Q2 Outreach Blitz' },
        { id: 's2', name: 'Enterprise Follow-Up', status: 'active', steps: 4, enrolled: 340, completed: 120, campaignName: 'Enterprise Cold Push' },
        { id: 's3', name: 'Nurture Drip', status: 'paused', steps: 7, enrolled: 180, completed: 90, campaignName: 'Re-engagement Wave' },
      ],
      recentActivity: [
        { id: 'a1', leadName: 'Marcus Webb', leadEmail: 'marcus@corp.io', action: 'replied', campaignName: 'Q2 Outreach Blitz', ts: '3 min ago' },
        { id: 'a2', leadName: 'Sarah Kim', leadEmail: 'sarah@tech.co', action: 'opened', campaignName: 'Enterprise Cold Push', ts: '8 min ago' },
        { id: 'a3', leadName: 'David Chen', leadEmail: 'david@vc.com', action: 'clicked', campaignName: 'Q2 Outreach Blitz', ts: '22 min ago' },
      ],
    },
  },
  {
    id: 'ws02',
    workspace: 'BrightMail Agency',
    plan: 'Agency',
    campaigns: 11,
    leads: 3610,
    sequences: 7,
    activeSequences: 6,
    enrollments: 980,
    openRate: 42.1,
    replyRate: 15.8,
    emailsSent: 21600,
    lastActivity: '18 min ago',
    riskFlag: false,
    drillData: {
      campaigns: [
        { id: 'c4', name: 'SaaS Decision-Maker Push', status: 'active', leads: 1100, emailsSent: 7600, openRate: 44.8, replyRate: 17.2, created: '2026-04-10' },
        { id: 'c5', name: 'SMB Nurture', status: 'active', leads: 740, emailsSent: 4800, openRate: 39.4, replyRate: 13.1, created: '2026-04-22' },
      ],
      sequences: [
        { id: 's4', name: 'SaaS Intro Chain', status: 'active', steps: 6, enrolled: 480, completed: 190, campaignName: 'SaaS Decision-Maker Push' },
        { id: 's5', name: 'Value-Add Drip', status: 'active', steps: 4, enrolled: 280, completed: 140, campaignName: 'SMB Nurture' },
      ],
      recentActivity: [
        { id: 'a4', leadName: 'Priya Sharma', leadEmail: 'priya@startup.in', action: 'replied', campaignName: 'SaaS Decision-Maker Push', ts: '20 min ago' },
        { id: 'a5', leadName: 'Tom Holt', leadEmail: 'tom@agency.uk', action: 'opened', campaignName: 'SMB Nurture', ts: '31 min ago' },
      ],
    },
  },
  {
    id: 'ws03',
    workspace: 'GrowthStack Inc.',
    plan: 'Pro Plus',
    campaigns: 6,
    leads: 1840,
    sequences: 4,
    activeSequences: 3,
    enrollments: 420,
    openRate: 33.6,
    replyRate: 9.4,
    emailsSent: 11200,
    lastActivity: '1 hr ago',
    riskFlag: false,
    drillData: {
      campaigns: [
        { id: 'c6', name: 'Product Demo Invite', status: 'active', leads: 640, emailsSent: 4100, openRate: 35.2, replyRate: 10.8, created: '2026-05-01' },
        { id: 'c7', name: 'Webinar Follow-Up', status: 'active', leads: 480, emailsSent: 3200, openRate: 31.6, replyRate: 7.9, created: '2026-05-10' },
      ],
      sequences: [
        { id: 's6', name: 'Demo Invite Flow', status: 'active', steps: 4, enrolled: 220, completed: 88, campaignName: 'Product Demo Invite' },
        { id: 's7', name: 'Post-Webinar Nurture', status: 'paused', steps: 3, enrolled: 160, completed: 72, campaignName: 'Webinar Follow-Up' },
      ],
      recentActivity: [
        { id: 'a6', leadName: 'Alex Torres', leadEmail: 'alex@scaleup.com', action: 'clicked', campaignName: 'Product Demo Invite', ts: '1 hr ago' },
        { id: 'a7', leadName: 'Rachel Ng', leadEmail: 'rachel@b2b.sg', action: 'opened', campaignName: 'Webinar Follow-Up', ts: '1.5 hr ago' },
      ],
    },
  },
  {
    id: 'ws04',
    workspace: 'SalesBlast Labs',
    plan: 'Pro',
    campaigns: 4,
    leads: 920,
    sequences: 3,
    activeSequences: 2,
    enrollments: 210,
    openRate: 29.8,
    replyRate: 7.2,
    emailsSent: 5800,
    lastActivity: '3 hr ago',
    riskFlag: false,
    drillData: {
      campaigns: [
        { id: 'c8', name: 'ICP Outreach Sprint', status: 'active', leads: 480, emailsSent: 3200, openRate: 31.4, replyRate: 8.6, created: '2026-05-05' },
        { id: 'c9', name: 'Partnership Pipeline', status: 'draft', leads: 240, emailsSent: 0, openRate: 0, replyRate: 0, created: '2026-05-28' },
      ],
      sequences: [
        { id: 's8', name: 'ICP 3-Step', status: 'active', steps: 3, enrolled: 160, completed: 62, campaignName: 'ICP Outreach Sprint' },
        { id: 's9', name: 'Partner Intro', status: 'draft', steps: 4, enrolled: 0, completed: 0, campaignName: 'Partnership Pipeline' },
      ],
      recentActivity: [
        { id: 'a8', leadName: 'Benny Okafor', leadEmail: 'benny@fins.co', action: 'opened', campaignName: 'ICP Outreach Sprint', ts: '3 hr ago' },
      ],
    },
  },
  {
    id: 'ws05',
    workspace: 'SendWarm EU',
    plan: 'Agency',
    campaigns: 18,
    leads: 6240,
    sequences: 12,
    activeSequences: 10,
    enrollments: 1820,
    openRate: 45.2,
    replyRate: 18.6,
    emailsSent: 38200,
    lastActivity: '7 min ago',
    riskFlag: false,
    drillData: {
      campaigns: [
        { id: 'c10', name: 'EU Enterprise Wave', status: 'active', leads: 2100, emailsSent: 14200, openRate: 47.8, replyRate: 20.1, created: '2026-03-15' },
        { id: 'c11', name: 'Mid-Market EU', status: 'active', leads: 1640, emailsSent: 11400, openRate: 43.6, replyRate: 17.2, created: '2026-04-01' },
        { id: 'c12', name: 'SME Expansion', status: 'active', leads: 1200, emailsSent: 8200, openRate: 41.4, replyRate: 15.4, created: '2026-04-20' },
      ],
      sequences: [
        { id: 's10', name: 'EU Enterprise 6-Touch', status: 'active', steps: 6, enrolled: 840, completed: 340, campaignName: 'EU Enterprise Wave' },
        { id: 's11', name: 'Mid-Market Funnel', status: 'active', steps: 5, enrolled: 620, completed: 280, campaignName: 'Mid-Market EU' },
        { id: 's12', name: 'SME Accelerator', status: 'active', steps: 4, enrolled: 480, completed: 180, campaignName: 'SME Expansion' },
      ],
      recentActivity: [
        { id: 'a9', leadName: 'Hans Müller', leadEmail: 'hans@de-corp.de', action: 'replied', campaignName: 'EU Enterprise Wave', ts: '8 min ago' },
        { id: 'a10', leadName: 'Isabelle Fontaine', leadEmail: 'isabelle@fr.io', action: 'opened', campaignName: 'Mid-Market EU', ts: '12 min ago' },
      ],
    },
  },
  {
    id: 'ws06',
    workspace: 'OutreachPro MX',
    plan: 'Starter',
    campaigns: 2,
    leads: 340,
    sequences: 1,
    activeSequences: 0,
    enrollments: 0,
    openRate: 0,
    replyRate: 0,
    emailsSent: 820,
    lastActivity: '4 days ago',
    riskFlag: true,
    drillData: {
      campaigns: [
        { id: 'c13', name: 'LATAM Cold Start', status: 'stopped', leads: 340, emailsSent: 820, openRate: 0, replyRate: 0, created: '2026-04-28' },
      ],
      sequences: [
        { id: 's13', name: 'LATAM Intro', status: 'paused', steps: 3, enrolled: 120, completed: 0, campaignName: 'LATAM Cold Start' },
      ],
      recentActivity: [
        { id: 'a11', leadName: 'Carlos Mendez', leadEmail: 'carlos@mx.co', action: 'bounced', campaignName: 'LATAM Cold Start', ts: '4 days ago' },
      ],
    },
  },
  {
    id: 'ws07',
    workspace: 'InboxRise JP',
    plan: 'Pro Plus',
    campaigns: 5,
    leads: 1420,
    sequences: 4,
    activeSequences: 3,
    enrollments: 360,
    openRate: 36.8,
    replyRate: 11.2,
    emailsSent: 8900,
    lastActivity: '2 hr ago',
    riskFlag: false,
    drillData: {
      campaigns: [
        { id: 'c14', name: 'JP Enterprise Push', status: 'active', leads: 780, emailsSent: 5200, openRate: 38.4, replyRate: 12.8, created: '2026-05-03' },
        { id: 'c15', name: 'SMB JP Wave', status: 'active', leads: 420, emailsSent: 2800, openRate: 34.6, replyRate: 9.1, created: '2026-05-12' },
      ],
      sequences: [
        { id: 's14', name: 'JP 4-Touch Enterprise', status: 'active', steps: 4, enrolled: 220, completed: 86, campaignName: 'JP Enterprise Push' },
        { id: 's15', name: 'SMB Quick Intro', status: 'active', steps: 3, enrolled: 140, completed: 68, campaignName: 'SMB JP Wave' },
      ],
      recentActivity: [
        { id: 'a12', leadName: 'Kenji Watanabe', leadEmail: 'kenji@jp-corp.jp', action: 'replied', campaignName: 'JP Enterprise Push', ts: '2.1 hr ago' },
        { id: 'a13', leadName: 'Yui Tanaka', leadEmail: 'yui@sme.jp', action: 'opened', campaignName: 'SMB JP Wave', ts: '2.4 hr ago' },
      ],
    },
  },
];

// ─── Platform totals ─────────────────────────────────────────────────────────────
const TOTALS = {
  campaigns: WORKSPACES.reduce((s, w) => s + w.campaigns, 0),
  leads: WORKSPACES.reduce((s, w) => s + w.leads, 0),
  sequences: WORKSPACES.reduce((s, w) => s + w.sequences, 0),
  enrollments: WORKSPACES.reduce((s, w) => s + w.enrollments, 0),
  avgOpenRate: Math.round((WORKSPACES.reduce((s, w) => s + w.openRate, 0) / WORKSPACES.length) * 10) / 10,
  avgReplyRate: Math.round((WORKSPACES.reduce((s, w) => s + w.replyRate, 0) / WORKSPACES.length) * 10) / 10,
  emailsSent: WORKSPACES.reduce((s, w) => s + w.emailsSent, 0),
};

// ─── Helpers ────────────────────────────────────────────────────────────────────
const PLAN_COLOR: Record<Plan, string> = {
  Starter: T.faint,
  Pro: T.warning,
  'Pro Plus': T.accentHi,
  Agency: T.accent,
};
const PLAN_BG: Record<Plan, string> = {
  Starter: 'rgba(255,255,255,0.07)',
  Pro: 'rgba(255,138,75,0.12)',
  'Pro Plus': 'rgba(255,138,75,0.15)',
  Agency: 'rgba(242,101,34,0.15)',
};

const SEQ_STATUS_COLOR: Record<SeqStatus, string> = {
  active: T.success,
  paused: T.warning,
  draft: T.ghost,
  completed: T.dim,
};
const CAMP_STATUS_COLOR: Record<CampaignStatus, string> = {
  active: T.success,
  paused: T.warning,
  draft: T.ghost,
  stopped: T.danger,
};

const ACTION_COLOR: Record<LeadActivity['action'], string> = {
  opened: T.accent,
  replied: T.success,
  clicked: T.accentHi,
  bounced: T.danger,
  unsubscribed: T.warning,
};
const ACTION_ICON: Record<LeadActivity['action'], typeof Mail> = {
  opened: Inbox,
  replied: Reply,
  clicked: Star,
  bounced: AlertTriangle,
  unsubscribed: X,
};

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function planLabel(p: Plan): string { return p; }

// ─── Animated counter ─────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1.1): number {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(mv, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = mv.on('change', (v) => setDisplay(Math.round(v)));
    return () => {
      controls.stop();
      unsub();
    };
  }, [mv, target, duration]);
  return display;
}

// Separate hook for decimal values (open/reply rates)
function useCountUpDecimal(target: number, duration = 1.1): number {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(mv, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = mv.on('change', (v) => setDisplay(Math.round(v * 10) / 10));
    return () => {
      controls.stop();
      unsub();
    };
  }, [mv, target, duration]);
  return display;
}

// ─── Framer-motion variants ──────────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 280, damping: 22 },
  },
  exit: {
    opacity: 0, x: -20, scale: 0.97,
    transition: { duration: 0.17, ease: 'easeIn' },
  },
};

const kpiVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, type: 'spring', stiffness: 300, damping: 26 },
  }),
};

const drawerVariants: Variants = {
  hidden: { x: '100%', opacity: 0 },
  visible: {
    x: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 320, damping: 32, mass: 0.75 },
  },
  exit: {
    x: '100%', opacity: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 1, 0.6] },
  },
};

const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

// ─── Toast ────────────────────────────────────────────────────────────────────────
interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'warning' | 'danger';
}

const toastVariants: Variants = {
  hidden: { opacity: 0, y: -20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  exit: { opacity: 0, y: -16, scale: 0.93, transition: { duration: 0.18 } },
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: number;
  suffix?: string;
  icon: typeof Mail;
  accentColor: string;
  index: number;
  decimal?: boolean;
}

function KpiCard({ label, value, suffix, icon: Icon, accentColor, index, decimal }: KpiCardProps) {
  const countedInt = useCountUp(value);
  const countedDec = useCountUpDecimal(value);
  const displayed = decimal ? countedDec : countedInt;

  return (
    <motion.div
      custom={index}
      variants={kpiVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -3, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
      style={{
        ...T.glass,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -30,
          right: -20,
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}28 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...T.micro, fontSize: 9 }}>{label}</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${accentColor}22`,
            color: accentColor,
          }}
        >
          <Icon size={14} strokeWidth={2.2} />
        </span>
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          color: T.text,
        }}
      >
        {decimal ? displayed.toFixed(1) : fmtNum(displayed)}
        {suffix && (
          <span style={{ fontSize: 14, fontWeight: 600, color: T.dim, marginLeft: 2 }}>
            {suffix}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Sequence Drill Row ────────────────────────────────────────────────────────────
interface SeqDrillRowProps {
  seq: SequenceRow;
  onToggle: (id: string, newStatus: SeqStatus) => void;
}

function SeqDrillRow({ seq, onToggle }: SeqDrillRowProps) {
  const isActive = seq.status === 'active';
  const canToggle = seq.status === 'active' || seq.status === 'paused';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: SEQ_STATUS_COLOR[seq.status],
          boxShadow: seq.status === 'active' ? `0 0 6px ${T.success}88` : 'none',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {seq.name}
        </div>
        <div style={{ fontSize: 10.5, color: T.faint, marginTop: 1 }}>
          {seq.steps} steps · {seq.enrolled} enrolled · {seq.completed} completed
        </div>
      </div>
      <span style={{ fontSize: 10, color: T.faint, whiteSpace: 'nowrap' }}>{seq.campaignName}</span>
      {canToggle && (
        <motion.button
          type="button"
          onClick={() => onToggle(seq.id, isActive ? 'paused' : 'active')}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          title={isActive ? 'Pause sequence' : 'Resume sequence'}
          style={{
            appearance: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 7,
            border: `1px solid ${isActive ? T.warning + '50' : T.success + '50'}`,
            background: isActive ? T.warningDim : T.successDim,
            color: isActive ? T.warning : T.success,
            fontSize: 10.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {isActive ? <Pause size={11} strokeWidth={2.4} /> : <Play size={11} strokeWidth={2.4} />}
          {isActive ? 'Pause' : 'Resume'}
        </motion.button>
      )}
    </motion.div>
  );
}

// ─── Campaign Drill Row ────────────────────────────────────────────────────────────
interface CampDrillRowProps {
  camp: CampaignRow;
  onStop: (id: string) => void;
}

function CampDrillRow({ camp, onStop }: CampDrillRowProps) {
  const canStop = camp.status === 'active' || camp.status === 'paused';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: CAMP_STATUS_COLOR[camp.status],
          boxShadow: camp.status === 'active' ? `0 0 6px ${T.success}88` : 'none',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {camp.name}
        </div>
        <div style={{ fontSize: 10.5, color: T.faint, marginTop: 1 }}>
          {camp.leads.toLocaleString()} leads · {fmtNum(camp.emailsSent)} sent · {camp.openRate.toFixed(1)}% open · {camp.replyRate.toFixed(1)}% reply
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          padding: '2px 7px',
          borderRadius: 5,
          background: `${CAMP_STATUS_COLOR[camp.status]}18`,
          border: `1px solid ${CAMP_STATUS_COLOR[camp.status]}40`,
          color: CAMP_STATUS_COLOR[camp.status],
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {camp.status}
      </span>
      {canStop && (
        <motion.button
          type="button"
          onClick={() => onStop(camp.id)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          title="Stop campaign"
          style={{
            appearance: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 9px',
            borderRadius: 7,
            border: `1px solid ${T.danger}50`,
            background: T.dangerDim,
            color: T.danger,
            fontSize: 10.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          <StopCircle size={11} strokeWidth={2.2} />
          Stop
        </motion.button>
      )}
    </motion.div>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────────────────────────
interface DrawerProps {
  ws: WorkspaceRow;
  onClose: () => void;
  onToast: (msg: string, tone: Toast['tone']) => void;
}

function DetailDrawer({ ws, onClose, onToast }: DrawerProps) {
  type DrillTab = 'campaigns' | 'sequences' | 'activity';
  const [tab, setTab] = useState<DrillTab>('sequences');
  const [campaigns, setCampaigns] = useState<CampaignRow[]>(ws.drillData.campaigns);
  const [sequences, setSequences] = useState<SequenceRow[]>(ws.drillData.sequences);

  const handleSeqToggle = useCallback((id: string, newStatus: SeqStatus) => {
    setSequences((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s))
    );
    onToast(
      newStatus === 'paused' ? 'Sequence paused' : 'Sequence resumed',
      newStatus === 'paused' ? 'warning' : 'success',
    );
  }, [onToast]);

  const handleCampStop = useCallback((id: string) => {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'stopped' as CampaignStatus } : c))
    );
    onToast('Campaign stopped', 'danger');
  }, [onToast]);

  const tabs: { id: DrillTab; label: string; icon: typeof Mail }[] = [
    { id: 'sequences', label: 'Sequences', icon: GitBranch },
    { id: 'campaigns', label: 'Campaigns', icon: Target },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 40,
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer panel */}
      <motion.div
        variants={drawerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: '92vw',
          background: 'rgba(15,14,18,0.97)',
          borderLeft: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: '20px 22px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <Building2 size={14} style={{ color: T.accent }} />
                <span style={{ ...T.micro }}>{ws.workspace}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 5,
                    background: PLAN_BG[ws.plan],
                    border: `1px solid ${PLAN_COLOR[ws.plan]}40`,
                    color: PLAN_COLOR[ws.plan],
                  }}
                >
                  {planLabel(ws.plan)}
                </span>
                {ws.riskFlag && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.danger, fontSize: 10, fontWeight: 700 }}>
                    <ShieldAlert size={11} />
                    Risk
                  </span>
                )}
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: '-0.02em' }}>
                CRM Overview
              </h2>
            </div>
            <motion.button
              type="button"
              onClick={onClose}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: T.dim,
                flexShrink: 0,
              }}
            >
              <X size={15} />
            </motion.button>
          </div>

          {/* Workspace quick stats */}
          <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Campaigns', value: ws.campaigns, icon: Target, color: T.accent },
              { label: 'Leads', value: ws.leads.toLocaleString(), icon: Users, color: T.accentHi },
              { label: 'Enrollments', value: ws.enrollments.toLocaleString(), icon: UserPlus, color: T.success },
              { label: 'Emails 30d', value: fmtNum(ws.emailsSent), icon: Send, color: T.dim },
            ].map((stat) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <stat.icon size={12} style={{ color: stat.color }} />
                <span style={{ fontSize: 11, color: T.dim }}>{stat.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                  {typeof stat.value === 'number' ? stat.value : stat.value}
                </span>
              </div>
            ))}
          </div>

          {/* Engagement mini bar */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {[
              { label: 'Open Rate', value: ws.openRate, color: T.accent },
              { label: 'Reply Rate', value: ws.replyRate, color: T.success },
            ].map((m) => (
              <div key={m.label} style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: T.faint }}>{m.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.value.toFixed(1)}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(m.value, 100)}%`, height: '100%', borderRadius: 999, background: m.color, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            padding: '10px 22px 0',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  appearance: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '7px 12px',
                  borderRadius: '8px 8px 0 0',
                  background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                  border: 'none',
                  borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
                  color: active ? T.text : T.faint,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  transition: 'all 0.18s ease',
                }}
              >
                <t.icon size={12} strokeWidth={2.2} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 24px' }}>
          <AnimatePresence mode="wait">
            {tab === 'sequences' && (
              <motion.div
                key="seq"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
              >
                <div style={{ ...T.micro, marginBottom: 10 }}>
                  <GitBranch size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                  {sequences.length} sequences · {sequences.filter((s) => s.status === 'active').length} active
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sequences.map((seq) => (
                    <SeqDrillRow key={seq.id} seq={seq} onToggle={handleSeqToggle} />
                  ))}
                </div>
              </motion.div>
            )}
            {tab === 'campaigns' && (
              <motion.div
                key="camp"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
              >
                <div style={{ ...T.micro, marginBottom: 10 }}>
                  <Target size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                  {campaigns.length} campaigns · {campaigns.filter((c) => c.status === 'active').length} active
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {campaigns.map((camp) => (
                    <CampDrillRow key={camp.id} camp={camp} onStop={handleCampStop} />
                  ))}
                </div>
              </motion.div>
            )}
            {tab === 'activity' && (
              <motion.div
                key="act"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
              >
                <div style={{ ...T.micro, marginBottom: 10 }}>
                  <Activity size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                  Recent lead activity
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {ws.drillData.recentActivity.map((item, idx) => {
                    const AIcon = ACTION_ICON[item.action];
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0, transition: { delay: idx * 0.05, type: 'spring', stiffness: 280, damping: 22 } }}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '10px 0',
                          borderBottom: idx < ws.drillData.recentActivity.length - 1 ? `1px solid ${T.hairline}` : 'none',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            background: `${ACTION_COLOR[item.action]}18`,
                            color: ACTION_COLOR[item.action],
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          <AIcon size={12} strokeWidth={2.2} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>
                            {item.leadName}
                            <span style={{ fontWeight: 400, color: T.dim, marginLeft: 5, fontSize: 11.5 }}>
                              {item.action}
                            </span>
                          </div>
                          <div style={{ fontSize: 10.5, color: T.faint, marginTop: 2 }}>
                            {item.leadEmail} · {item.campaignName}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: T.faint, whiteSpace: 'nowrap', marginTop: 3 }}>{item.ts}</span>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────────
export function AdmCrmCR1Command() {
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<Plan | 'all'>('all');
  const [activeSeqFilter, setActiveSeqFilter] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('emailsSent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedWs, setSelectedWs] = useState<WorkspaceRow | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((message: string, tone: Toast['tone']) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return prev; }
      setSortDir('desc');
      return key;
    });
  }, []);

  const filtered = useMemo(() => {
    let rows = WORKSPACES.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((w) => w.workspace.toLowerCase().includes(q));
    }
    if (planFilter !== 'all') {
      rows = rows.filter((w) => w.plan === planFilter);
    }
    if (activeSeqFilter) {
      rows = rows.filter((w) => w.activeSequences > 0);
    }
    rows.sort((a, b) => {
      const va = a[sortKey] as number | string;
      const vb = b[sortKey] as number | string;
      const aNum = typeof va === 'number' ? va : 0;
      const bNum = typeof vb === 'number' ? vb : 0;
      const aStr = typeof va === 'string' ? va : String(va);
      const bStr = typeof vb === 'string' ? vb : String(vb);
      if (typeof va === 'number') return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return rows;
  }, [search, planFilter, activeSeqFilter, sortKey, sortDir]);

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp size={11} style={{ opacity: 0.2 }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={11} style={{ color: T.accent }} />
      : <ChevronDown size={11} style={{ color: T.accent }} />;
  };

  const COL_HEADERS: Array<{ key: SortKey; label: string; align?: 'right' }> = [
    { key: 'workspace', label: 'Workspace' },
    { key: 'campaigns', label: 'Campaigns', align: 'right' },
    { key: 'leads', label: 'Leads', align: 'right' },
    { key: 'sequences', label: 'Sequences', align: 'right' },
    { key: 'enrollments', label: 'Enrollments', align: 'right' },
    { key: 'openRate', label: 'Open %', align: 'right' },
    { key: 'replyRate', label: 'Reply %', align: 'right' },
    { key: 'emailsSent', label: 'Sent 30d', align: 'right' },
    { key: 'lastActivity', label: 'Last Activity' },
  ];

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1320,
        margin: '0 auto',
        padding: '0 4px 40px',
        color: T.text,
        fontFamily: 'inherit',
        position: 'relative',
      }}
    >
      {/* ── Toast stack ─────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              variants={toastVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                background:
                  toast.tone === 'success'
                    ? 'rgba(61,220,151,0.18)'
                    : toast.tone === 'danger'
                      ? 'rgba(255,92,122,0.18)'
                      : 'rgba(255,138,75,0.18)',
                border: `1px solid ${toast.tone === 'success' ? T.success : toast.tone === 'danger' ? T.danger : T.warning}50`,
                color: toast.tone === 'success' ? T.success : toast.tone === 'danger' ? T.danger : T.warning,
                fontSize: 13,
                fontWeight: 600,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                pointerEvents: 'all',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              {toast.tone === 'success' && <CheckCircle2 size={14} />}
              {toast.tone === 'danger' && <StopCircle size={14} />}
              {toast.tone === 'warning' && <AlertTriangle size={14} />}
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
        style={{ marginBottom: 22 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <Layers size={14} strokeWidth={2.4} style={{ color: T.accent }} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: T.accent,
            }}
          >
            Admin · CRM Command Center
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: 0, lineHeight: 1.1 }}>
              Cross-Workspace CRM
            </h1>
            <p style={{ fontSize: 12.5, color: T.dim, marginTop: 5 }}>
              Monitor and manage every workspace's campaigns, sequences, and lead engagement
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 10,
                fontWeight: 700,
                color: T.success,
                background: T.successDim,
                border: `1px solid ${T.success}30`,
                borderRadius: 999,
                padding: '4px 10px',
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
              Live · 31 May 2026
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <KpiCard label="Campaigns" value={TOTALS.campaigns} icon={Target} accentColor={T.accent} index={0} />
        <KpiCard label="Total Leads" value={TOTALS.leads} icon={Users} accentColor={T.accentHi} index={1} />
        <KpiCard label="Sequences" value={TOTALS.sequences} icon={GitBranch} accentColor={T.success} index={2} />
        <KpiCard label="Active Enrollments" value={TOTALS.enrollments} icon={UserPlus} accentColor={T.warning} index={3} />
        <KpiCard label="Avg Open Rate" value={TOTALS.avgOpenRate} suffix="%" icon={BarChart2} accentColor={T.accent} index={4} decimal />
        <KpiCard label="Avg Reply Rate" value={TOTALS.avgReplyRate} suffix="%" icon={MessageSquare} accentColor={T.success} index={5} decimal />
        <KpiCard label="Emails Sent 30d" value={TOTALS.emailsSent} icon={Send} accentColor={T.accentHi} index={6} />
      </div>

      {/* ── Filter / search bar ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.18, duration: 0.3, ease: 'easeOut' } }}
        style={{
          ...T.glass,
          padding: '12px 16px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: T.faint,
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search workspaces…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              paddingLeft: 34,
              paddingRight: search ? 32 : 12,
              paddingTop: 8,
              paddingBottom: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 9,
              color: T.text,
              fontSize: 12.5,
              outline: 'none',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                color: T.faint,
                padding: 0,
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Plan filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Filter size={12} style={{ color: T.faint }} />
          <span style={{ fontSize: 11, color: T.faint }}>Plan:</span>
          {(['all', 'Starter', 'Pro', 'Pro Plus', 'Agency'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlanFilter(p)}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${planFilter === p ? T.accent : 'rgba(255,255,255,0.12)'}`,
                background: planFilter === p ? T.accentDim : 'transparent',
                color: planFilter === p ? T.accent : T.dim,
                transition: 'all 0.15s ease',
              }}
            >
              {p === 'all' ? 'All' : p}
            </button>
          ))}
        </div>

        {/* Active sequences filter */}
        <motion.button
          type="button"
          onClick={() => setActiveSeqFilter((v) => !v)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{
            appearance: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 12px',
            borderRadius: 7,
            fontSize: 11,
            fontWeight: 600,
            border: `1px solid ${activeSeqFilter ? T.success + '60' : 'rgba(255,255,255,0.12)'}`,
            background: activeSeqFilter ? T.successDim : 'transparent',
            color: activeSeqFilter ? T.success : T.dim,
            transition: 'all 0.15s ease',
          }}
        >
          <SlidersHorizontal size={12} />
          Active sequences only
        </motion.button>

        {/* Row count */}
        <span style={{ fontSize: 11, color: T.faint, marginLeft: 'auto' }}>
          {filtered.length} workspace{filtered.length !== 1 ? 's' : ''}
        </span>
      </motion.div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.22, duration: 0.3, ease: 'easeOut' } }}
        style={{ ...T.glass, overflow: 'hidden' }}
      >
        {/* Table head */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.9fr 0.8fr 0.8fr 0.9fr 0.9fr 0.7fr 0.7fr 0.8fr 1fr 0.7fr',
            padding: '10px 16px',
            borderBottom: `1px solid ${T.hairline}`,
            gap: 4,
          }}
        >
          {COL_HEADERS.map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => handleSort(col.key)}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
                padding: 0,
                color: sortKey === col.key ? T.accent : T.faint,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                transition: 'color 0.15s',
              }}
            >
              {col.align === 'right' && <SortIcon k={col.key} />}
              {col.label}
              {col.align !== 'right' && <SortIcon k={col.key} />}
            </button>
          ))}
          {/* Actions header */}
          <span style={{ ...T.micro, textAlign: 'right' }}>Actions</span>
        </div>

        {/* Rows */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((ws) => (
              <motion.div
                key={ws.id}
                layout
                variants={rowVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                whileHover={{
                  background: 'rgba(255,255,255,0.04)',
                  transition: { duration: 0.15 },
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.9fr 0.8fr 0.8fr 0.9fr 0.9fr 0.7fr 0.7fr 0.8fr 1fr 0.7fr',
                  padding: '13px 16px',
                  borderBottom: `1px solid ${T.hairline}`,
                  gap: 4,
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedWs(ws)}
              >
                {/* Workspace + plan */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {ws.riskFlag && (
                      <ShieldAlert size={12} style={{ color: T.danger, flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.workspace}
                    </span>
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignSelf: 'flex-start',
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: '1.5px 6px',
                      borderRadius: 4,
                      background: PLAN_BG[ws.plan],
                      border: `1px solid ${PLAN_COLOR[ws.plan]}35`,
                      color: PLAN_COLOR[ws.plan],
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {planLabel(ws.plan)}
                  </span>
                </div>

                {/* Campaigns */}
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {ws.campaigns}
                </span>

                {/* Leads */}
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {ws.leads.toLocaleString()}
                </span>

                {/* Sequences */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                    {ws.sequences}
                  </span>
                  {ws.activeSequences > 0 && (
                    <span style={{ fontSize: 10, color: T.success, marginLeft: 4 }}>
                      {ws.activeSequences} active
                    </span>
                  )}
                </div>

                {/* Enrollments */}
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {ws.enrollments.toLocaleString()}
                </span>

                {/* Open rate */}
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: ws.openRate >= 35 ? T.success : ws.openRate >= 20 ? T.warning : T.danger,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {ws.openRate.toFixed(1)}%
                  </span>
                </div>

                {/* Reply rate */}
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: ws.replyRate >= 10 ? T.success : ws.replyRate >= 5 ? T.warning : ws.replyRate === 0 ? T.faint : T.danger,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {ws.replyRate.toFixed(1)}%
                  </span>
                </div>

                {/* Emails sent */}
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNum(ws.emailsSent)}
                </span>

                {/* Last activity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} style={{ color: T.faint, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ws.lastActivity}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5 }} onClick={(e) => e.stopPropagation()}>
                  <motion.button
                    type="button"
                    onClick={() => setSelectedWs(ws)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.92 }}
                    title="View CRM details"
                    style={{
                      appearance: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: T.accentDim,
                      border: `1px solid ${T.accent}35`,
                      color: T.accent,
                    }}
                  >
                    <Eye size={13} strokeWidth={2.2} />
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => {
                      pushToast(`Opened ${ws.workspace} CRM`, 'success');
                      setSelectedWs(ws);
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.92 }}
                    title="Manage sequences"
                    style={{
                      appearance: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      color: T.dim,
                    }}
                  >
                    <ChevronRight size={13} strokeWidth={2.4} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: T.faint,
                fontSize: 13,
              }}
            >
              <Search size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
              <div>No workspaces match your filters.</div>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* ── Platform engagement summary strip ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.4, duration: 0.35 } }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          marginTop: 16,
          padding: '12px 18px',
          ...T.glass,
          borderRadius: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <TrendingUp size={13} style={{ color: T.accent }} />
          <span style={{ fontSize: 11.5, color: T.dim, fontWeight: 600 }}>Platform CRM Health</span>
        </div>
        {[
          { label: 'Total Workspaces', value: WORKSPACES.length, color: T.text },
          { label: 'Active Sequences', value: WORKSPACES.reduce((s, w) => s + w.activeSequences, 0), color: T.success },
          { label: 'At Risk', value: WORKSPACES.filter((w) => w.riskFlag).length, color: T.danger },
          { label: 'Avg Open Rate', value: `${TOTALS.avgOpenRate.toFixed(1)}%`, color: T.accent },
          { label: 'Avg Reply Rate', value: `${TOTALS.avgReplyRate.toFixed(1)}%`, color: T.success },
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: T.faint }}>{item.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: item.color, fontVariantNumeric: 'tabular-nums' }}>
              {item.value}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Activity size={11} style={{ color: T.accentHi }} />
          <span style={{ fontSize: 10.5, color: T.faint }}>Auto-refreshes every 60s</span>
        </div>
      </motion.div>

      {/* ── Detail Drawer ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedWs !== null && (
          <DetailDrawer
            ws={selectedWs}
            onClose={() => setSelectedWs(null)}
            onToast={pushToast}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdmCrmCR1Command;
