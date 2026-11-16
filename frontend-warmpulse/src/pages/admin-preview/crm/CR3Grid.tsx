/**
 * Admin CRM Design Candidate: CR3 Workspace CRM Grid
 *
 * "Workspace CRM Grid" — each workspace is a health card you can drill into.
 * Staggered entrance, whileHover lift+glow, layoutId morphing to a full detail
 * panel, animated sparklines (motion.path), animated counters, filter chips
 * + search with layout animation re-sort.
 *
 * Fully self-contained: inline styles only, mock data only, no API / feature /
 * lib imports. Rendered inside the admin preview shell's dark canvas (:35001).
 */

import {
  useEffect,
  useRef,
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
  TrendingUp,
  TrendingDown,
  ChevronRight,
  X,
  Play,
  Pause,
  Search,
  RefreshCw,
  Target,
  MessageSquare,
  BarChart2,
  Filter,
  CheckCircle2,
  Clock,
  Eye,
  Reply,
} from 'lucide-react';

// ─── Design tokens ───────────────────────────────────────────────────────────
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

// ─── Mock data types ──────────────────────────────────────────────────────────
type Plan = 'Agency' | 'Pro Plus' | 'Pro' | 'Starter';
type EngagementTier = 'high' | 'medium' | 'low';

interface MockSequence {
  id: string;
  name: string;
  status: 'active' | 'paused';
  enrolled: number;
  completed: number;
  openRate: number;
  replyRate: number;
}

interface MockCampaign {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'completed';
  leads: number;
  sent: number;
  openRate: number;
  replyRate: number;
  createdAt: string;
}

interface MockActivity {
  id: string;
  type: 'open' | 'reply' | 'enrolled' | 'completed';
  lead: string;
  campaign: string;
  timeAgo: string;
}

interface MockWorkspace {
  id: string;
  name: string;
  plan: Plan;
  owner: string;
  campaigns: number;
  leads: number;
  activeSequences: number;
  pausedSequences: number;
  enrollments: number;
  openRate: number;
  replyRate: number;
  lastActivity: string;
  trend: number[]; // 12-point sparkline (engagement index)
  health: 'healthy' | 'warning' | 'critical';
  engagementTier: EngagementTier;
  // drill-down data
  campaignList: MockCampaign[];
  sequenceList: MockSequence[];
  recentActivity: MockActivity[];
}

// ─── Mock workspaces ──────────────────────────────────────────────────────────
const MOCK_WORKSPACES: MockWorkspace[] = [
  {
    id: 'ws-001',
    name: 'Acme Corp Sales',
    plan: 'Agency',
    owner: 'sarah@acme.com',
    campaigns: 12,
    leads: 3840,
    activeSequences: 5,
    pausedSequences: 1,
    enrollments: 624,
    openRate: 68.4,
    replyRate: 22.1,
    lastActivity: '2 min ago',
    trend: [42, 48, 51, 47, 55, 62, 58, 66, 71, 68, 74, 78],
    health: 'healthy',
    engagementTier: 'high',
    campaignList: [
      { id: 'c1', name: 'Q2 Outbound Push', status: 'active', leads: 920, sent: 4180, openRate: 71.2, replyRate: 24.8, createdAt: 'May 12' },
      { id: 'c2', name: 'Enterprise Re-engage', status: 'active', leads: 410, sent: 1640, openRate: 65.8, replyRate: 19.2, createdAt: 'May 18' },
      { id: 'c3', name: 'SMB Warm Intro', status: 'completed', leads: 780, sent: 3120, openRate: 62.4, replyRate: 17.6, createdAt: 'Apr 30' },
      { id: 'c4', name: 'Follow-up Sequence A', status: 'draft', leads: 0, sent: 0, openRate: 0, replyRate: 0, createdAt: 'May 29' },
    ],
    sequenceList: [
      { id: 's1', name: 'Cold Outreach 5-Step', status: 'active', enrolled: 210, completed: 88, openRate: 72, replyRate: 26 },
      { id: 's2', name: 'Demo Follow-up', status: 'active', enrolled: 94, completed: 41, openRate: 81, replyRate: 38 },
      { id: 's3', name: 'Enterprise Nurture', status: 'active', enrolled: 168, completed: 55, openRate: 66, replyRate: 19 },
      { id: 's4', name: 'Re-engagement Drip', status: 'active', enrolled: 112, completed: 62, openRate: 58, replyRate: 14 },
      { id: 's5', name: 'SMB Quick Close', status: 'active', enrolled: 40, completed: 18, openRate: 68, replyRate: 22 },
      { id: 's6', name: 'Churn Recovery', status: 'paused', enrolled: 55, completed: 12, openRate: 44, replyRate: 8 },
    ],
    recentActivity: [
      { id: 'a1', type: 'reply', lead: 'James Horton', campaign: 'Q2 Outbound Push', timeAgo: '2 min' },
      { id: 'a2', type: 'open', lead: 'Claire Moss', campaign: 'Enterprise Re-engage', timeAgo: '5 min' },
      { id: 'a3', type: 'enrolled', lead: 'Phil Crane', campaign: 'SMB Quick Close', timeAgo: '11 min' },
      { id: 'a4', type: 'completed', lead: 'Amy Chen', campaign: 'SMB Warm Intro', timeAgo: '22 min' },
    ],
  },
  {
    id: 'ws-002',
    name: 'BlueSky Ventures',
    plan: 'Pro Plus',
    owner: 'alex@bluesky.io',
    campaigns: 7,
    leads: 1620,
    activeSequences: 3,
    pausedSequences: 2,
    enrollments: 318,
    openRate: 54.2,
    replyRate: 14.8,
    lastActivity: '18 min ago',
    trend: [38, 35, 40, 44, 39, 43, 48, 45, 52, 49, 53, 56],
    health: 'healthy',
    engagementTier: 'medium',
    campaignList: [
      { id: 'c1', name: 'Seed Round Prospects', status: 'active', leads: 480, sent: 1920, openRate: 58, replyRate: 16, createdAt: 'May 10' },
      { id: 'c2', name: 'Partner Outreach', status: 'active', leads: 220, sent: 880, openRate: 51, replyRate: 13, createdAt: 'May 22' },
      { id: 'c3', name: 'Investor Update', status: 'completed', leads: 140, sent: 420, openRate: 74, replyRate: 28, createdAt: 'May 1' },
    ],
    sequenceList: [
      { id: 's1', name: 'Investor Warm Touch', status: 'active', enrolled: 140, completed: 62, openRate: 60, replyRate: 18 },
      { id: 's2', name: 'Partner Intro 3-Step', status: 'active', enrolled: 98, completed: 44, openRate: 52, replyRate: 12 },
      { id: 's3', name: 'LP Newsletter Drip', status: 'active', enrolled: 80, completed: 38, openRate: 48, replyRate: 11 },
      { id: 's4', name: 'Cold Deck Send', status: 'paused', enrolled: 60, completed: 8, openRate: 38, replyRate: 6 },
      { id: 's5', name: 'No-reply Bump', status: 'paused', enrolled: 44, completed: 4, openRate: 32, replyRate: 4 },
    ],
    recentActivity: [
      { id: 'a1', type: 'open', lead: 'Dana Wu', campaign: 'Seed Round Prospects', timeAgo: '18 min' },
      { id: 'a2', type: 'reply', lead: 'Karl Stern', campaign: 'Partner Outreach', timeAgo: '31 min' },
      { id: 'a3', type: 'enrolled', lead: 'Maria Lopes', campaign: 'Investor Warm Touch', timeAgo: '44 min' },
    ],
  },
  {
    id: 'ws-003',
    name: 'Meridian SaaS',
    plan: 'Agency',
    owner: 'tom@meridian.com',
    campaigns: 18,
    leads: 5210,
    activeSequences: 8,
    pausedSequences: 0,
    enrollments: 1042,
    openRate: 72.6,
    replyRate: 28.4,
    lastActivity: '4 min ago',
    trend: [55, 60, 58, 65, 70, 67, 74, 78, 75, 82, 88, 92],
    health: 'healthy',
    engagementTier: 'high',
    campaignList: [
      { id: 'c1', name: 'Enterprise AE Push', status: 'active', leads: 1400, sent: 7000, openRate: 76, replyRate: 31, createdAt: 'May 5' },
      { id: 'c2', name: 'Mid-Market Nurture', status: 'active', leads: 920, sent: 3680, openRate: 70, replyRate: 25, createdAt: 'May 14' },
      { id: 'c3', name: 'Trial Convert', status: 'active', leads: 560, sent: 1680, openRate: 79, replyRate: 38, createdAt: 'May 20' },
      { id: 'c4', name: 'Churned Win-back', status: 'active', leads: 340, sent: 1020, openRate: 58, replyRate: 18, createdAt: 'May 24' },
    ],
    sequenceList: [
      { id: 's1', name: '7-Touch Cold', status: 'active', enrolled: 310, completed: 124, openRate: 74, replyRate: 30 },
      { id: 's2', name: 'Demo No-show', status: 'active', enrolled: 188, completed: 82, openRate: 68, replyRate: 26 },
      { id: 's3', name: 'Trial Onboard', status: 'active', enrolled: 220, completed: 110, openRate: 82, replyRate: 42 },
      { id: 's4', name: 'ACV Expansion', status: 'active', enrolled: 144, completed: 58, openRate: 72, replyRate: 28 },
      { id: 's5', name: 'Renewal Reminder', status: 'active', enrolled: 100, completed: 40, openRate: 76, replyRate: 32 },
    ],
    recentActivity: [
      { id: 'a1', type: 'reply', lead: 'Steve Park', campaign: 'Enterprise AE Push', timeAgo: '4 min' },
      { id: 'a2', type: 'reply', lead: 'Nina Reyes', campaign: 'Trial Convert', timeAgo: '8 min' },
      { id: 'a3', type: 'open', lead: 'Brad Olson', campaign: 'Mid-Market Nurture', timeAgo: '12 min' },
    ],
  },
  {
    id: 'ws-004',
    name: 'Cornerstone Labs',
    plan: 'Pro',
    owner: 'priya@corner.dev',
    campaigns: 4,
    leads: 890,
    activeSequences: 2,
    pausedSequences: 3,
    enrollments: 174,
    openRate: 41.8,
    replyRate: 9.2,
    lastActivity: '1h 12m ago',
    trend: [52, 48, 44, 42, 40, 38, 36, 39, 41, 38, 36, 40],
    health: 'warning',
    engagementTier: 'low',
    campaignList: [
      { id: 'c1', name: 'DevTools Early Access', status: 'active', leads: 380, sent: 1140, openRate: 44, replyRate: 10, createdAt: 'May 8' },
      { id: 'c2', name: 'OSS Community', status: 'active', leads: 260, sent: 520, openRate: 39, replyRate: 8, createdAt: 'May 19' },
      { id: 'c3', name: 'Webinar Invite', status: 'completed', leads: 200, sent: 400, openRate: 62, replyRate: 18, createdAt: 'Apr 25' },
      { id: 'c4', name: 'Product Hunt List', status: 'draft', leads: 0, sent: 0, openRate: 0, replyRate: 0, createdAt: 'May 30' },
    ],
    sequenceList: [
      { id: 's1', name: 'Early Adopter 4-step', status: 'active', enrolled: 98, completed: 30, openRate: 44, replyRate: 10 },
      { id: 's2', name: 'Feature Drip', status: 'active', enrolled: 76, completed: 22, openRate: 40, replyRate: 8 },
      { id: 's3', name: 'Inactive Users Bump', status: 'paused', enrolled: 44, completed: 2, openRate: 28, replyRate: 4 },
      { id: 's4', name: 'NPS Low-score Follow', status: 'paused', enrolled: 30, completed: 0, openRate: 22, replyRate: 2 },
      { id: 's5', name: 'Churned Dev Winback', status: 'paused', enrolled: 22, completed: 0, openRate: 18, replyRate: 1 },
    ],
    recentActivity: [
      { id: 'a1', type: 'open', lead: 'Dev Patel', campaign: 'DevTools Early Access', timeAgo: '1h 12m' },
      { id: 'a2', type: 'enrolled', lead: 'Sam Liu', campaign: 'OSS Community', timeAgo: '2h 4m' },
    ],
  },
  {
    id: 'ws-005',
    name: 'Nova Growth',
    plan: 'Pro Plus',
    owner: 'lena@novagrowth.co',
    campaigns: 9,
    leads: 2140,
    activeSequences: 4,
    pausedSequences: 1,
    enrollments: 448,
    openRate: 61.3,
    replyRate: 18.9,
    lastActivity: '34 min ago',
    trend: [40, 45, 50, 48, 54, 58, 55, 61, 64, 60, 66, 70],
    health: 'healthy',
    engagementTier: 'medium',
    campaignList: [
      { id: 'c1', name: 'Growth Hacker Outreach', status: 'active', leads: 680, sent: 2720, openRate: 64, replyRate: 20, createdAt: 'May 13' },
      { id: 'c2', name: 'Content Partnership', status: 'active', leads: 420, sent: 1260, openRate: 58, replyRate: 17, createdAt: 'May 21' },
      { id: 'c3', name: 'Affiliate Program', status: 'active', leads: 300, sent: 600, openRate: 72, replyRate: 28, createdAt: 'May 25' },
    ],
    sequenceList: [
      { id: 's1', name: 'Referral Partner 5-step', status: 'active', enrolled: 148, completed: 60, openRate: 64, replyRate: 22 },
      { id: 's2', name: 'Influencer Warm', status: 'active', enrolled: 110, completed: 44, openRate: 60, replyRate: 18 },
      { id: 's3', name: 'Co-marketing Ask', status: 'active', enrolled: 84, completed: 32, openRate: 58, replyRate: 16 },
      { id: 's4', name: 'Podcast Guest Invite', status: 'active', enrolled: 66, completed: 20, openRate: 62, replyRate: 20 },
      { id: 's5', name: 'Dormant Partner Nudge', status: 'paused', enrolled: 40, completed: 4, openRate: 38, replyRate: 6 },
    ],
    recentActivity: [
      { id: 'a1', type: 'reply', lead: 'Tom Bright', campaign: 'Growth Hacker Outreach', timeAgo: '34 min' },
      { id: 'a2', type: 'open', lead: 'Zoe Klein', campaign: 'Content Partnership', timeAgo: '52 min' },
      { id: 'a3', type: 'enrolled', lead: 'Marco Ricci', campaign: 'Referral Partner 5-step', timeAgo: '1h 8m' },
    ],
  },
  {
    id: 'ws-006',
    name: 'Dynamo Fintech',
    plan: 'Starter',
    owner: 'raj@dynamo.fi',
    campaigns: 2,
    leads: 340,
    activeSequences: 1,
    pausedSequences: 1,
    enrollments: 68,
    openRate: 35.4,
    replyRate: 6.8,
    lastActivity: '3h 22m ago',
    trend: [30, 28, 32, 29, 26, 30, 28, 32, 30, 28, 26, 30],
    health: 'critical',
    engagementTier: 'low',
    campaignList: [
      { id: 'c1', name: 'Beta Tester Invite', status: 'active', leads: 200, sent: 400, openRate: 38, replyRate: 8, createdAt: 'May 20' },
      { id: 'c2', name: 'Early Adopter List', status: 'active', leads: 140, sent: 280, openRate: 32, replyRate: 5, createdAt: 'May 26' },
    ],
    sequenceList: [
      { id: 's1', name: 'Onboard Fintech 3-step', status: 'active', enrolled: 48, completed: 12, openRate: 38, replyRate: 8 },
      { id: 's2', name: 'Compliance Intro', status: 'paused', enrolled: 20, completed: 0, openRate: 22, replyRate: 2 },
    ],
    recentActivity: [
      { id: 'a1', type: 'open', lead: 'Kai Pham', campaign: 'Beta Tester Invite', timeAgo: '3h 22m' },
    ],
  },
  {
    id: 'ws-007',
    name: 'Stellar Healthcare',
    plan: 'Pro Plus',
    owner: 'mo@stellar.health',
    campaigns: 6,
    leads: 1480,
    activeSequences: 3,
    pausedSequences: 1,
    enrollments: 296,
    openRate: 59.7,
    replyRate: 16.4,
    lastActivity: '27 min ago',
    trend: [44, 48, 46, 52, 56, 54, 59, 62, 58, 64, 68, 66],
    health: 'healthy',
    engagementTier: 'medium',
    campaignList: [
      { id: 'c1', name: 'Provider Network Reach', status: 'active', leads: 560, sent: 2240, openRate: 62, replyRate: 18, createdAt: 'May 9' },
      { id: 'c2', name: 'Payer Partner Init', status: 'active', leads: 320, sent: 960, openRate: 58, replyRate: 15, createdAt: 'May 17' },
      { id: 'c3', name: 'Conference Follow-up', status: 'completed', leads: 240, sent: 480, openRate: 71, replyRate: 24, createdAt: 'May 2' },
    ],
    sequenceList: [
      { id: 's1', name: 'Provider Warm 4-step', status: 'active', enrolled: 140, completed: 56, openRate: 62, replyRate: 18 },
      { id: 's2', name: 'Compliance Check-in', status: 'active', enrolled: 88, completed: 36, openRate: 58, replyRate: 14 },
      { id: 's3', name: 'EHR Integration Ask', status: 'active', enrolled: 68, completed: 24, openRate: 56, replyRate: 14 },
      { id: 's4', name: 'Billing Query Drip', status: 'paused', enrolled: 44, completed: 6, openRate: 40, replyRate: 8 },
    ],
    recentActivity: [
      { id: 'a1', type: 'reply', lead: 'Anita Shah', campaign: 'Provider Network Reach', timeAgo: '27 min' },
      { id: 'a2', type: 'open', lead: 'Felix Bauer', campaign: 'Payer Partner Init', timeAgo: '48 min' },
      { id: 'a3', type: 'enrolled', lead: 'Grace Kim', campaign: 'Provider Warm 4-step', timeAgo: '1h 2m' },
    ],
  },
  {
    id: 'ws-008',
    name: 'Quantum EdTech',
    plan: 'Pro',
    owner: 'jess@qedu.io',
    campaigns: 5,
    leads: 1120,
    activeSequences: 2,
    pausedSequences: 2,
    enrollments: 214,
    openRate: 47.2,
    replyRate: 11.8,
    lastActivity: '56 min ago',
    trend: [38, 42, 40, 44, 48, 45, 50, 46, 52, 49, 54, 52],
    health: 'warning',
    engagementTier: 'medium',
    campaignList: [
      { id: 'c1', name: 'Instructor Onboard', status: 'active', leads: 420, sent: 1260, openRate: 50, replyRate: 13, createdAt: 'May 11' },
      { id: 'c2', name: 'Student Success Loop', status: 'active', leads: 360, sent: 720, openRate: 44, replyRate: 10, createdAt: 'May 22' },
      { id: 'c3', name: 'Parent Engagement', status: 'draft', leads: 0, sent: 0, openRate: 0, replyRate: 0, createdAt: 'May 30' },
    ],
    sequenceList: [
      { id: 's1', name: 'Instructor Welcome 5-step', status: 'active', enrolled: 120, completed: 48, openRate: 52, replyRate: 14 },
      { id: 's2', name: 'Certification Push', status: 'active', enrolled: 94, completed: 36, openRate: 46, replyRate: 10 },
      { id: 's3', name: 'Dropout Save', status: 'paused', enrolled: 60, completed: 8, openRate: 36, replyRate: 6 },
      { id: 's4', name: 'Alumni Upsell', status: 'paused', enrolled: 40, completed: 4, openRate: 30, replyRate: 4 },
    ],
    recentActivity: [
      { id: 'a1', type: 'reply', lead: 'Chris Wade', campaign: 'Instructor Onboard', timeAgo: '56 min' },
      { id: 'a2', type: 'open', lead: 'Lily Hart', campaign: 'Student Success Loop', timeAgo: '1h 18m' },
      { id: 'a3', type: 'enrolled', lead: 'Omar Farid', campaign: 'Instructor Welcome 5-step', timeAgo: '1h 44m' },
    ],
  },
];

// ─── Variants ─────────────────────────────────────────────────────────────────
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
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, type: 'spring', stiffness: 300, damping: 24 } }),
};

// ─── Animated counter hook ────────────────────────────────────────────────────
function useAnimatedCounter(target: number, decimals = 0, delay = 0) {
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

// ─── Sparkline component (motion.path pathLength) ─────────────────────────────
interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

function Sparkline({ data, color, width = 88, height = 28 }: SparklineProps) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height * 0.82 - height * 0.08;
    return `${x},${y}`;
  });
  const d = `M ${points.join(' L ')}`;

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={1} />
        </linearGradient>
      </defs>
      <motion.path
        d={d}
        fill="none"
        stroke={`url(#spark-${color.replace('#', '')})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
      />
      {/* last point dot */}
      {points.length > 0 && (
        <motion.circle
          cx={parseFloat(points[points.length - 1]?.split(',')[0] ?? '0')}
          cy={parseFloat(points[points.length - 1]?.split(',')[1] ?? '0')}
          r={3}
          fill={color}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.3, duration: 0.2 }}
        />
      )}
    </svg>
  );
}

// ─── Mini bar for rate display ────────────────────────────────────────────────
function RateBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <motion.div
        style={{ position: 'absolute', inset: 0, borderRadius: 2, background: color, transformOrigin: 'left center' }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: value / 100 }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
      />
    </div>
  );
}

// ─── Health indicator ─────────────────────────────────────────────────────────
function HealthDot({ health }: { health: MockWorkspace['health'] }) {
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
function PlanBadge({ plan }: { plan: Plan }) {
  const colorMap: Record<Plan, string> = {
    Agency: T.accent,
    'Pro Plus': T.accentMid,
    Pro: T.success,
    Starter: T.faint,
  };
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: colorMap[plan],
      background: `${colorMap[plan]}18`,
      border: `1px solid ${colorMap[plan]}40`,
      borderRadius: 6,
      padding: '2px 7px',
    }}>
      {plan}
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
interface ToastItem {
  id: number;
  msg: string;
  kind: 'success' | 'info';
}

// ─── Detail panel (expanded workspace view) ───────────────────────────────────
interface DetailPanelProps {
  ws: MockWorkspace;
  onClose: () => void;
  seqStates: Record<string, 'active' | 'paused'>;
  onToggleSeq: (id: string) => void;
  onToast: (msg: string, kind: 'success' | 'info') => void;
}

function DetailPanel({ ws, onClose, seqStates, onToggleSeq, onToast }: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'sequences' | 'activity'>('sequences');

  const activityIcon: Record<MockActivity['type'], typeof Eye> = {
    open: Eye,
    reply: Reply,
    enrolled: Target,
    completed: CheckCircle2,
  };
  const activityColor: Record<MockActivity['type'], string> = {
    open: T.faint,
    reply: T.success,
    enrolled: T.accentMid,
    completed: T.accent,
  };

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

      {/* Panel */}
      <motion.div
        layoutId={`card-${ws.id}`}
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
          boxShadow: `0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(${T.accent},0.08)`,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.12) transparent',
        }}
      >
        {/* Panel header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <HealthDot health={ws.health} />
              <span style={{ ...T.micro, color: T.faint }}>Workspace CRM</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: T.text }}>{ws.name}</span>
              <PlanBadge plan={ws.plan} />
            </div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>{ws.owner}</div>
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
            { label: 'Leads', value: ws.leads.toLocaleString(), icon: Users, color: T.accentMid },
            { label: 'Enrollments', value: ws.enrollments, icon: Target, color: T.success },
            { label: 'Open Rate', value: `${ws.openRate}%`, icon: Eye, color: T.dim },
            { label: 'Reply Rate', value: `${ws.replyRate}%`, icon: Reply, color: T.success },
          ].map((k) => (
            <div key={k.label} style={{ ...T.glassDeep, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 9, flex: '1 1 auto', minWidth: 100 }}>
              <k.icon size={14} color={k.color} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{k.value}</div>
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
                background: activeTab === tab ? `rgba(${tab === 'sequences' ? '242,101,34' : '255,138,75'},0.18)` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeTab === tab ? (tab === 'sequences' ? T.accent : T.accentMid) + '50' : 'rgba(255,255,255,0.08)'}`,
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
                {ws.sequenceList.map((seq, idx) => {
                  const st = seqStates[seq.id] ?? seq.status;
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
                          <span>{seq.completed} done</span>
                          <span style={{ color: T.success }}>{seq.openRate}% open</span>
                          <span style={{ color: T.accentMid }}>{seq.replyRate}% reply</span>
                        </div>
                      </div>
                      {/* progress bar */}
                      <div style={{ width: 72, flexShrink: 0 }}>
                        <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <motion.div
                            style={{ position: 'absolute', inset: 0, borderRadius: 2, background: T.accent, transformOrigin: 'left center' }}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: seq.enrolled > 0 ? seq.completed / seq.enrolled : 0 }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                        <div style={{ fontSize: 9, color: T.faint, marginTop: 3, textAlign: 'right' }}>
                          {seq.enrolled > 0 ? Math.round((seq.completed / seq.enrolled) * 100) : 0}% done
                        </div>
                      </div>
                      {/* toggle */}
                      <motion.button
                        onClick={() => { onToggleSeq(seq.id); onToast(`Sequence "${seq.name}" ${st === 'active' ? 'paused' : 'resumed'}`, 'success'); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.94 }}
                        style={{
                          flexShrink: 0,
                          display: 'flex', alignItems: 'center', gap: 5,
                          background: st === 'active' ? 'rgba(61,220,151,0.14)' : 'rgba(255,92,122,0.12)',
                          border: `1px solid ${st === 'active' ? T.success + '40' : T.danger + '40'}`,
                          borderRadius: 8,
                          padding: '5px 10px',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 600,
                          color: st === 'active' ? T.success : T.danger,
                        }}
                      >
                        {st === 'active' ? <Pause size={11} /> : <Play size={11} />}
                        {st === 'active' ? 'Pause' : 'Resume'}
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
                {ws.campaignList.map((camp, idx) => {
                  const statusColor: Record<MockCampaign['status'], string> = { active: T.success, draft: T.dim, completed: T.faint };
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
                          <span>{camp.leads} leads</span>
                          <span>{camp.sent.toLocaleString()} sent</span>
                          {camp.openRate > 0 && <span style={{ color: T.success }}>{camp.openRate}% open</span>}
                          {camp.replyRate > 0 && <span style={{ color: T.accentMid }}>{camp.replyRate}% reply</span>}
                          <span style={{ color: T.faint }}>Created {camp.createdAt}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusColor[camp.status], background: `${statusColor[camp.status]}18`, border: `1px solid ${statusColor[camp.status]}40`, borderRadius: 6, padding: '2px 7px' }}>
                          {camp.status}
                        </span>
                        <motion.button
                          whileHover={{ scale: 1.05, background: 'rgba(242,101,34,0.18)' }}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => onToast(`Opened "${camp.name}" campaign view`, 'info')}
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: T.dim, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          View <ChevronRight size={11} />
                        </motion.button>
                      </div>
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
                {ws.recentActivity.map((act, idx) => {
                  const Icon = activityIcon[act.type];
                  return (
                    <motion.div
                      key={act.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.06 }}
                      style={{ ...T.glassDeep, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${activityColor[act.type]}18`, border: `1px solid ${activityColor[act.type]}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={13} color={activityColor[act.type]} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{act.lead}</div>
                        <div style={{ fontSize: 11, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ textTransform: 'capitalize', color: activityColor[act.type] }}>{act.type}</span> · {act.campaign}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.faint }}>
                        <Clock size={10} />
                        {act.timeAgo} ago
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </>
  );
}

// ─── Workspace card ───────────────────────────────────────────────────────────
interface WorkspaceCardProps {
  ws: MockWorkspace;
  onClick: () => void;
}

function WorkspaceCard({ ws, onClick }: WorkspaceCardProps) {
  const trendLast = ws.trend[ws.trend.length - 1] ?? 0;
  const trendPrev = ws.trend[ws.trend.length - 2] ?? trendLast;
  const trendUp = trendLast >= trendPrev;
  const sparkColor = ws.health === 'critical' ? T.danger : ws.health === 'warning' ? T.warning : T.success;

  return (
    <motion.div
      layoutId={`card-${ws.id}`}
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
      {/* Glow accent line */}
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
            <div style={{ fontSize: 10, color: T.faint, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.owner}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 6 }}>
          <HealthDot health={ws.health} />
          <PlanBadge plan={ws.plan} />
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Campaigns', val: ws.campaigns, icon: Layers },
          { label: 'Leads', val: ws.leads >= 1000 ? `${(ws.leads / 1000).toFixed(1)}k` : ws.leads, icon: Users },
          { label: 'Enrollments', val: ws.enrollments, icon: Target },
        ].map((k) => (
          <div key={k.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <k.icon size={10} color={T.faint} />
              <span style={{ ...T.micro, fontSize: 9 }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Sequences pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {ws.activeSequences > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: T.success, background: `${T.success}14`, border: `1px solid ${T.success}30`, borderRadius: 6, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Play size={8} fill={T.success} />
            {ws.activeSequences} active
          </span>
        )}
        {ws.pausedSequences > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: T.warning, background: `${T.warning}14`, border: `1px solid ${T.warning}30`, borderRadius: 6, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Pause size={8} />
            {ws.pausedSequences} paused
          </span>
        )}
      </div>

      {/* Rates + sparkline */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ ...T.micro, fontSize: 9 }}>Open rate</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.success }}>{ws.openRate}%</span>
          </div>
          <RateBar value={ws.openRate} color={T.success} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, marginBottom: 3 }}>
            <span style={{ ...T.micro, fontSize: 9 }}>Reply rate</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.accentMid }}>{ws.replyRate}%</span>
          </div>
          <RateBar value={ws.replyRate} color={T.accentMid} />
        </div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <Sparkline data={ws.trend} color={sparkColor} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: trendUp ? T.success : T.danger }}>
            {trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            <span>{trendUp ? '+' : ''}{Math.round(trendLast - trendPrev)} pts</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.faint }}>
          <Clock size={9} />
          <span>Active {ws.lastActivity}</span>
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

// ─── KPI counter tile ─────────────────────────────────────────────────────────
interface KpiTileProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon: typeof Building2;
  color: string;
  index: number;
  decimals?: number;
}

function KpiTile({ label, value, prefix = '', suffix = '', icon: Icon, color, index, decimals = 0 }: KpiTileProps) {
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
          {prefix}{count}{suffix}
        </div>
        <div style={{ ...T.micro, marginTop: 2 }}>{label}</div>
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmCrmCR3Grid() {
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<Plan | 'all'>('all');
  const [hasActiveFilter, setHasActiveFilter] = useState(false);
  const [tierFilter, setTierFilter] = useState<EngagementTier | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastCounter = useRef(0);

  // Per-workspace per-sequence toggle state (keyed by seqId)
  const [seqStates, setSeqStates] = useState<Record<string, 'active' | 'paused'>>({});

  const handleToggleSeq = useCallback((seqId: string) => {
    setSeqStates((prev) => {
      // find current status from mock or override
      let found: 'active' | 'paused' = 'active';
      for (const ws of MOCK_WORKSPACES) {
        const seq = ws.sequenceList.find((s) => s.id === seqId);
        if (seq) { found = prev[seqId] ?? seq.status; break; }
      }
      return { ...prev, [seqId]: found === 'active' ? 'paused' : 'active' };
    });
  }, []);

  const showToast = useCallback((msg: string, kind: 'success' | 'info') => {
    const id = ++toastCounter.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // Filtered workspaces
  const filtered = MOCK_WORKSPACES.filter((ws) => {
    if (planFilter !== 'all' && ws.plan !== planFilter) return false;
    if (hasActiveFilter && ws.activeSequences === 0) return false;
    if (tierFilter !== 'all' && ws.engagementTier !== tierFilter) return false;
    if (search && !ws.name.toLowerCase().includes(search.toLowerCase()) && !ws.owner.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const expandedWs = expandedId != null ? (MOCK_WORKSPACES.find((w) => w.id === expandedId) ?? null) : null;

  // KPI aggregates
  const totalCampaigns = MOCK_WORKSPACES.reduce((s, w) => s + w.campaigns, 0);
  const totalLeads = MOCK_WORKSPACES.reduce((s, w) => s + w.leads, 0);
  const totalSeqs = MOCK_WORKSPACES.reduce((s, w) => s + w.activeSequences + w.pausedSequences, 0);
  const avgOpen = +(MOCK_WORKSPACES.reduce((s, w) => s + w.openRate, 0) / MOCK_WORKSPACES.length).toFixed(1);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const planChips: Array<{ label: string; val: Plan | 'all' }> = [
    { label: 'All Plans', val: 'all' },
    { label: 'Agency', val: 'Agency' },
    { label: 'Pro Plus', val: 'Pro Plus' },
    { label: 'Pro', val: 'Pro' },
    { label: 'Starter', val: 'Starter' },
  ];
  const tierChips: Array<{ label: string; val: EngagementTier | 'all' }> = [
    { label: 'All Tiers', val: 'all' },
    { label: 'High Engagement', val: 'high' },
    { label: 'Medium', val: 'medium' },
    { label: 'Low', val: 'low' },
  ];

  return (
    <div style={{ minHeight: '100vh', padding: '28px 28px 60px', fontFamily: 'Inter, system-ui, sans-serif', color: T.text, position: 'relative' }}>

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <BarChart2 size={16} color={T.accent} />
          <span style={{ ...T.micro }}>Admin · CRM Management</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: 0, background: `linear-gradient(135deg, #fff 60%, ${T.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Workspace CRM Grid
        </h1>
        <p style={{ fontSize: 13, color: T.dim, margin: '6px 0 0' }}>
          Cross-workspace view — campaign health, sequence management, engagement at a glance.
        </p>
      </motion.div>

      {/* KPI header row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <KpiTile label="Workspaces w/ CRM" value={MOCK_WORKSPACES.length} icon={Building2} color={T.accent} index={0} />
        <KpiTile label="Total Campaigns" value={totalCampaigns} icon={Layers} color={T.accentMid} index={1} />
        <KpiTile label="Total Leads" value={totalLeads} icon={Users} color={T.success} index={2} />
        <KpiTile label="Total Sequences" value={totalSeqs} icon={Activity} color={T.warning} index={3} />
        <KpiTile label="Avg Open Rate" value={avgOpen} suffix="%" icon={Eye} color={T.success} index={4} decimals={1} />
      </div>

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

        {/* Plan chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {planChips.map((c, i) => (
            <motion.button
              key={c.val}
              custom={i}
              variants={chipVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.08 + i * 0.04 }}
              onClick={() => setPlanFilter(c.val)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              style={{
                background: planFilter === c.val ? `${T.accent}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${planFilter === c.val ? T.accent + '60' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8,
                padding: '5px 12px',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                color: planFilter === c.val ? T.accent : T.dim,
                transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              }}
            >
              {c.label}
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
        {tierChips.slice(1).map((c, i) => (
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
          {filtered.length} of {MOCK_WORKSPACES.length} workspaces
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
              key={ws.id}
              ws={ws}
              onClick={() => setExpandedId(ws.id)}
            />
          ))}
        </AnimatePresence>

        {filtered.length === 0 && (
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
            key={expandedWs.id}
            ws={expandedWs}
            onClose={() => setExpandedId(null)}
            seqStates={seqStates}
            onToggleSeq={handleToggleSeq}
            onToast={showToast}
          />
        )}
      </AnimatePresence>

      {/* Toast stack */}
      <div style={{ position: 'fixed', bottom: 28, right: 28, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 200, pointerEvents: 'none' }}>
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 40, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              style={{
                ...T.glassDeep,
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                fontWeight: 600,
                color: T.text,
                background: toast.kind === 'success' ? 'rgba(61,220,151,0.16)' : 'rgba(242,101,34,0.14)',
                border: `1px solid ${toast.kind === 'success' ? T.success + '40' : T.accent + '40'}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                pointerEvents: 'auto',
                maxWidth: 340,
              }}
            >
              {toast.kind === 'success' ? <CheckCircle2 size={13} color={T.success} /> : <MessageSquare size={13} color={T.accent} />}
              {toast.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
