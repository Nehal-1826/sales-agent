/**
 * Admin CRM Design Candidate: CR4 Activity Stream
 *
 * "Activity Stream" — a live cross-workspace CRM engagement feed. Centerpiece
 * is an AnimatePresence activity feed (spring slide-in rows with pause/play),
 * flanked by a FLIP-reordering top campaigns leaderboard and a hand-built
 * SVG engagement timeline (motion.path pathLength 0→1 lines). KPI counters
 * animate in with staggered springs. All mock data; no backend needed.
 *
 * Self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * Styling via inline style={{}} only. Warm Aurora Glass palette only.
 * All intervals/rAF/animate() controls/motion-value subscriptions cleaned up.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type CSSProperties,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Activity,
  MailOpen,
  MessageSquare,
  UserPlus,
  ArrowUpRight,
  ArrowDownRight,
  Pause,
  Play,
  ChevronDown,
  BarChart2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Clock,
  Building2,
  X,
  TrendingUp,
  Target,
  Send,
  RefreshCw,
} from 'lucide-react';

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  text:       '#ffffff',
  dim:        'rgba(255,255,255,0.62)',
  faint:      'rgba(255,255,255,0.40)',
  ghost:      'rgba(255,255,255,0.18)',
  accent:     '#F26522',
  accent2:    '#FF8A4B',
  success:    '#3ddc97',
  danger:     '#ff5c7a',
  warning:    '#FF8A4B',
  glass:      'rgba(255,255,255,0.05)',
  glass2:     'rgba(255,255,255,0.08)',
  glass3:     'rgba(255,255,255,0.03)',
  border:     'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.06)',
  hair:       'rgba(255,255,255,0.06)',
} as const;

const GLASS: CSSProperties = {
  background:           C.glass,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius:         16,
};

const GLASS2: CSSProperties = {
  background:           C.glass2,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  borderRadius:         12,
};

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: C.faint,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityType = 'open' | 'reply' | 'sent' | 'enrolled' | 'bounced' | 'unsubscribed';
type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft';
type LeaderMetric = 'replies' | 'opens' | 'volume';
type ChartRange = '14d' | '30d';
type WsFilter = 'all' | string;

interface Workspace {
  id: string;
  name: string;
  short: string;
  color: string;
}

interface ActivityEvent {
  id: string;
  wsId: string;
  type: ActivityType;
  campaignName: string;
  leadName?: string;
  stepLabel?: string;
  detail: string;
  ts: string;
}

interface Campaign {
  id: string;
  wsId: string;
  name: string;
  status: CampaignStatus;
  sends: number;
  opens: number;
  replies: number;
  leads: number;
  openRate: number;
  replyRate: number;
  paused: boolean; // local UI toggle
}

interface DaySeries {
  label: string;
  sends: number;
  opens: number;
  replies: number;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const WORKSPACES: Workspace[] = [
  { id: 'ws1', name: 'BrightWave',   short: 'BW',  color: '#F26522' },
  { id: 'ws2', name: 'TechVault',    short: 'TV',  color: '#FF8A4B' },
  { id: 'ws3', name: 'SparkFrame',   short: 'SF',  color: '#3ddc97' },
  { id: 'ws4', name: 'NovaNet',      short: 'NN',  color: '#FF8A4B' },
  { id: 'ws5', name: 'CloudForte',   short: 'CF',  color: '#F26522' },
  { id: 'ws6', name: 'PulseFlow',    short: 'PF',  color: '#3ddc97' },
  { id: 'ws7', name: 'StealthMail',  short: 'SM',  color: '#FF8A4B' },
];

const wsMap: Record<string, Workspace> = {};
for (const w of WORKSPACES) wsMap[w.id] = w;

const CAMPAIGNS: Campaign[] = [
  { id:'c1', wsId:'ws1', name:'Q2 Outreach',         status:'active',    sends:4820, opens:1928, replies:386, leads:220, openRate:40.0, replyRate:8.0,  paused:false },
  { id:'c2', wsId:'ws2', name:'SaaS Trial Push',      status:'active',    sends:3910, opens:1369, replies:312, leads:180, openRate:35.0, replyRate:8.0,  paused:false },
  { id:'c3', wsId:'ws3', name:'Agency Prospect',      status:'active',    sends:2640, opens:1187, replies:237, leads:140, openRate:44.9, replyRate:8.9,  paused:false },
  { id:'c4', wsId:'ws6', name:'Cold Intro — Finance', status:'active',    sends:3150, opens:1008, replies:189, leads:160, openRate:32.0, replyRate:6.0,  paused:false },
  { id:'c5', wsId:'ws4', name:'Re-engage Warm',       status:'active',    sends:1820, opens:820,  replies:164, leads:95,  openRate:45.1, replyRate:9.0,  paused:false },
  { id:'c6', wsId:'ws5', name:'Product Launch Feb',   status:'paused',    sends:2100, opens:735,  replies:84,  leads:110, openRate:35.0, replyRate:4.0,  paused:true  },
  { id:'c7', wsId:'ws7', name:'Enterprise Reach',     status:'active',    sends:980,  opens:490,  replies:98,  leads:60,  openRate:50.0, replyRate:10.0, paused:false },
  { id:'c8', wsId:'ws2', name:'Nurture Drip 30-day',  status:'completed', sends:5600, opens:1680, replies:224, leads:280, openRate:30.0, replyRate:4.0,  paused:false },
];

function makeSeries(): DaySeries[] {
  const base = new Date('2026-05-02');
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const noise = () => (Math.random() - 0.5) * 0.3;
    const t = i / 29;
    const sends  = Math.round(380 + t * 340 + noise() * 120);
    const opens  = Math.round(sends * (0.32 + noise() * 0.08));
    const replies = Math.round(sends * (0.065 + noise() * 0.02));
    return { label, sends, opens, replies };
  });
}
const SERIES_30 = makeSeries();
const SERIES_14 = SERIES_30.slice(16);

const SEED_EVENTS: ActivityEvent[] = [
  { id:'ev1',  wsId:'ws1', type:'open',        campaignName:'Q2 Outreach',         leadName:'James Carter',    stepLabel:'Step 2',   detail:'opened Step 2 subject line "Following up on your expansion plans"', ts:'just now'  },
  { id:'ev2',  wsId:'ws2', type:'reply',        campaignName:'SaaS Trial Push',     leadName:'Petra Kovacs',    stepLabel:'Step 1',   detail:'replied "Happy to jump on a call next Thursday"', ts:'1 min ago' },
  { id:'ev3',  wsId:'ws3', type:'sent',         campaignName:'Agency Prospect',     stepLabel:'Step 3',         detail:'sent Step 3 to 12 leads',  ts:'2 min ago' },
  { id:'ev4',  wsId:'ws6', type:'enrolled',     campaignName:'Cold Intro — Finance',leadName:'Sarah Oyelaran',  stepLabel:'Step 1',   detail:'enrolled into "Cold Intro — Finance" · 1 lead',  ts:'4 min ago' },
  { id:'ev5',  wsId:'ws4', type:'open',         campaignName:'Re-engage Warm',      leadName:'Dmitri Vasiliev', stepLabel:'Step 1',   detail:'opened re-engagement email 32 min after delivery', ts:'6 min ago' },
  { id:'ev6',  wsId:'ws7', type:'reply',        campaignName:'Enterprise Reach',    leadName:'Mina Hashimoto',  stepLabel:'Step 2',   detail:'replied "Sounds interesting, can you send a deck?"', ts:'9 min ago' },
  { id:'ev7',  wsId:'ws5', type:'bounced',      campaignName:'Product Launch Feb',  leadName:'Bob Nguyen',                            detail:'hard bounce — address no longer valid', ts:'13 min ago'},
  { id:'ev8',  wsId:'ws1', type:'sent',         campaignName:'Q2 Outreach',         stepLabel:'Step 1',         detail:'sent Step 1 to 28 leads (batch run)', ts:'15 min ago'},
];

const EVENT_TEMPLATES: Omit<ActivityEvent, 'id' | 'ts'>[] = [
  { wsId:'ws1', type:'open',        campaignName:'Q2 Outreach',          leadName:'Lena Marsh',     stepLabel:'Step 1',   detail:'opened "Quick question about your pipeline" — 4 min after delivery' },
  { wsId:'ws2', type:'reply',       campaignName:'SaaS Trial Push',      leadName:'Omar Hassan',    stepLabel:'Step 2',   detail:'replied "We are evaluating a few tools, your timing is good"' },
  { wsId:'ws3', type:'enrolled',    campaignName:'Agency Prospect',      leadName:'Chloe Brennan',  stepLabel:'Step 1',   detail:'enrolled 3 new leads from Webflow import' },
  { wsId:'ws4', type:'sent',        campaignName:'Re-engage Warm',       stepLabel:'Step 2',                              detail:'sent Step 2 to 7 warm leads' },
  { wsId:'ws6', type:'open',        campaignName:'Cold Intro — Finance', leadName:'Victor Simmons',                       detail:'opened email 11 min after delivery — mobile client' },
  { wsId:'ws7', type:'reply',       campaignName:'Enterprise Reach',     leadName:'Anika Patel',    stepLabel:'Step 1',   detail:'replied "We have budget allocated, let\'s talk scope"' },
  { wsId:'ws5', type:'unsubscribed',campaignName:'Product Launch Feb',   leadName:'Grace Delacroix',                      detail:'unsubscribed via one-click footer link' },
  { wsId:'ws1', type:'open',        campaignName:'Q2 Outreach',          leadName:'Sam Keller',     stepLabel:'Step 3',   detail:'opened follow-up sequence Step 3' },
  { wsId:'ws2', type:'sent',        campaignName:'Nurture Drip 30-day',  stepLabel:'Step 4',                              detail:'sent day-14 drip to 19 active leads' },
  { wsId:'ws3', type:'reply',       campaignName:'Agency Prospect',      leadName:'Felix Gruber',   stepLabel:'Step 2',   detail:'replied "Can you share pricing for 5 seats?"' },
];

// ─── Framer-motion variant presets ───────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0,  transition: { type: 'spring', stiffness: 260, damping: 26 } },
};

const feedRowVariants: Variants = {
  initial: { opacity: 0, x: -28, scale: 0.97 },
  animate: { opacity: 1, x: 0,   scale: 1,    transition: { type: 'spring', stiffness: 320, damping: 30 } },
  exit:    { opacity: 0, x: 28,  scale: 0.95, height: 0, marginBottom: 0, transition: { duration: 0.22, ease: 'easeIn' } },
};

const kpiVariants: Variants = {
  hidden: { opacity: 0, scale: 0.88, y: 14 },
  show:   { opacity: 1, scale: 1,    y: 0,  transition: { type: 'spring', stiffness: 280, damping: 22 } },
};

// ─── Animated counter ─────────────────────────────────────────────────────────

function AnimatedCount({ to, prefix = '', suffix = '', decimals = 0 }: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const mv   = useMotionValue(0);
  const sp   = useSpring(mv, { stiffness: 55, damping: 18 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    mv.set(0);
    const ctrl = animate(mv, to, { duration: 1.4, ease: 'easeOut' });
    const unsub = sp.on('change', (v) => setDisplay(v));
    return () => { ctrl.stop(); unsub(); };
  }, [to, mv, sp]);

  const fmt = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString();

  return <>{prefix}{fmt}{suffix}</>;
}

// ─── Activity type helpers ─────────────────────────────────────────────────────

function typeIcon(t: ActivityType): typeof MailOpen {
  switch (t) {
    case 'open':          return MailOpen;
    case 'reply':         return MessageSquare;
    case 'sent':          return Send;
    case 'enrolled':      return UserPlus;
    case 'bounced':       return AlertTriangle;
    case 'unsubscribed':  return X;
  }
}

function typeColor(t: ActivityType): string {
  switch (t) {
    case 'open':          return C.accent2;
    case 'reply':         return C.success;
    case 'sent':          return C.accent;
    case 'enrolled':      return C.warning;
    case 'bounced':       return C.danger;
    case 'unsubscribed':  return C.faint;
  }
}

function typeLabel(t: ActivityType): string {
  switch (t) {
    case 'open':          return 'Opened';
    case 'reply':         return 'Replied';
    case 'sent':          return 'Sent';
    case 'enrolled':      return 'Enrolled';
    case 'bounced':       return 'Bounced';
    case 'unsubscribed':  return 'Unsubscribed';
  }
}

function statusColor(s: CampaignStatus): string {
  switch (s) {
    case 'active':    return C.success;
    case 'paused':    return C.warning;
    case 'completed': return C.faint;
    case 'draft':     return C.ghost;
  }
}

// ─── Hand-built SVG engagement chart ─────────────────────────────────────────

function EngagementChart({ data, range }: { data: DaySeries[]; range: ChartRange }) {
  const W = 600;
  const H = 130;
  const PAD = { top: 14, right: 12, bottom: 28, left: 38 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  const maxSends  = Math.max(...data.map(d => d.sends), 1);
  const maxOReply = Math.max(...data.map(d => Math.max(d.opens, d.replies)), 1);

  function xOf(i: number): number { return PAD.left + (i / (data.length - 1)) * iW; }
  function yOfSends(v: number):  number { return PAD.top + iH - (v / maxSends) * iH; }
  function yOfSmall(v: number):  number { return PAD.top + iH - (v / maxOReply) * iH; }

  function cubicPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return '';
    return pts.reduce((acc, pt, i) => {
      if (i === 0) return `M${pt.x},${pt.y}`;
      const prev = pts[i - 1];
      if (!prev) return acc;
      const cpx = (prev.x + pt.x) / 2;
      return `${acc} C${cpx},${prev.y} ${cpx},${pt.y} ${pt.x},${pt.y}`;
    }, '');
  }

  function areaPath(pts: { x: number; y: number }[], baseY: number): string {
    if (pts.length < 2) return '';
    const line = cubicPath(pts);
    const first = pts[0];
    const last  = pts[pts.length - 1];
    if (!first || !last) return '';
    return `${line} L${last.x},${baseY} L${first.x},${baseY} Z`;
  }

  const sendsPts  = data.map((d, i) => ({ x: xOf(i), y: yOfSends(d.sends) }));
  const opensPts  = data.map((d, i) => ({ x: xOf(i), y: yOfSmall(d.opens) }));
  const repliesPts = data.map((d, i) => ({ x: xOf(i), y: yOfSmall(d.replies) }));

  const baseY = PAD.top + iH;
  const sendsLine   = cubicPath(sendsPts);
  const opensLine   = cubicPath(opensPts);
  const repliesLine = cubicPath(repliesPts);
  const sendsArea   = areaPath(sendsPts,   baseY);

  // x-axis tick indices
  const tickCount = data.length <= 14 ? 7 : 10;
  const tickStep  = Math.max(1, Math.floor(data.length / tickCount));
  const ticks = data.filter((_, i) => i % tickStep === 0 || i === data.length - 1);

  // y-axis guides
  const yGuides = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: PAD.top + iH * (1 - f),
    label: Math.round(maxSends * f).toLocaleString(),
  }));

  const key = range; // force re-mount on range change so pathLength re-animates

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
      aria-hidden
    >
      <defs>
        <linearGradient id="sg-sends" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.accent}  stopOpacity={0.18} />
          <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
        </linearGradient>
        <clipPath id="sg-clip">
          <rect x={PAD.left} y={PAD.top} width={iW} height={iH} />
        </clipPath>
      </defs>

      {/* Y-axis grid lines */}
      {yGuides.map(g => (
        <g key={g.y}>
          <line
            x1={PAD.left} y1={g.y} x2={PAD.left + iW} y2={g.y}
            stroke={C.hair} strokeDasharray="3 4"
          />
          <text
            x={PAD.left - 6} y={g.y + 4}
            fontSize={8} fill={C.faint} textAnchor="end"
          >
            {g.label}
          </text>
        </g>
      ))}

      {/* X-axis ticks */}
      {ticks.map(d => {
        const idx = data.indexOf(d);
        const x = xOf(idx);
        return (
          <text key={d.label} x={x} y={H - 6}
            fontSize={8} fill={C.faint} textAnchor="middle"
          >
            {d.label}
          </text>
        );
      })}

      <g clipPath="url(#sg-clip)">
        {/* Sends area */}
        <motion.path
          key={`sends-area-${key}`}
          d={sendsArea}
          fill="url(#sg-sends)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />

        {/* Sends line */}
        <motion.path
          key={`sends-line-${key}`}
          d={sendsLine}
          fill="none"
          stroke={C.accent}
          strokeWidth={2}
          pathLength={1}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        />

        {/* Opens line */}
        <motion.path
          key={`opens-line-${key}`}
          d={opensLine}
          fill="none"
          stroke={C.accent2}
          strokeWidth={1.5}
          strokeDasharray="4 2"
          pathLength={1}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.85 }}
          transition={{ duration: 1.3, ease: 'easeInOut', delay: 0.2 }}
        />

        {/* Replies line */}
        <motion.path
          key={`replies-line-${key}`}
          d={repliesLine}
          fill="none"
          stroke={C.success}
          strokeWidth={1.5}
          strokeDasharray="2 3"
          pathLength={1}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.85 }}
          transition={{ duration: 1.4, ease: 'easeInOut', delay: 0.35 }}
        />
      </g>

      {/* Axis baseline */}
      <line
        x1={PAD.left} y1={baseY} x2={PAD.left + iW} y2={baseY}
        stroke={C.border} strokeWidth={1}
      />
    </svg>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: string;
  msg: string;
  kind: 'success' | 'info' | 'warn';
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmCrmCR4Stream() {
  // ── State ──
  const [events, setEvents]           = useState<ActivityEvent[]>(SEED_EVENTS);
  const [paused, setPaused]           = useState(false);
  const [wsFilter, setWsFilter]       = useState<WsFilter>('all');
  const [leaderMetric, setLeaderMetric] = useState<LeaderMetric>('replies');
  const [chartRange, setChartRange]   = useState<ChartRange>('14d');
  const [toasts, setToasts]           = useState<Toast[]>([]);
  const [campaigns, setCampaigns]     = useState<Campaign[]>(CAMPAIGNS);
  const [wsDropOpen, setWsDropOpen]   = useState(false);
  const [metricDropOpen, setMetricDropOpen] = useState(false);

  const counterRef = useRef(0);
  const templateIdx = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // ── Helpers ──
  const addToast = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const id = `t${Date.now()}`;
    setToasts(prev => [...prev, { id, msg, kind }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  // ── Live feed interval ──
  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      counterRef.current += 1;
      const tpl = EVENT_TEMPLATES[templateIdx.current % EVENT_TEMPLATES.length];
      templateIdx.current += 1;
      if (!tpl) return;
      const newEvt: ActivityEvent = {
        ...tpl,
        id: `ev-live-${counterRef.current}`,
        ts: 'just now',
      };
      setEvents(prev => {
        const updated = [newEvt, ...prev];
        return updated.slice(0, 14);
      });
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  // ── Derived data ──
  const filteredEvents = useMemo(() =>
    wsFilter === 'all' ? events : events.filter(e => e.wsId === wsFilter),
    [events, wsFilter]
  );

  const sortedCampaigns = useMemo(() => {
    const metric = leaderMetric;
    return [...campaigns].sort((a, b) => {
      if (metric === 'replies') return b.replies - a.replies;
      if (metric === 'opens')   return b.opens   - a.opens;
      return b.sends - a.sends;
    });
  }, [campaigns, leaderMetric]);

  const filteredCampaigns = useMemo(() =>
    wsFilter === 'all' ? sortedCampaigns : sortedCampaigns.filter(c => c.wsId === wsFilter),
    [sortedCampaigns, wsFilter]
  );

  const chartData = chartRange === '14d' ? SERIES_14 : SERIES_30;

  // ── KPI totals (cross-workspace) ──
  const kpiSends   = campaigns.reduce((s, c) => s + c.sends,   0);
  const kpiOpens   = campaigns.reduce((s, c) => s + c.opens,   0);
  const kpiReplies = campaigns.reduce((s, c) => s + c.replies, 0);
  const kpiOpenPct  = kpiSends  > 0 ? (kpiOpens   / kpiSends)  * 100 : 0;
  const kpiReplyPct = kpiSends  > 0 ? (kpiReplies / kpiSends)  * 100 : 0;

  // ── Campaign actions ──
  const toggleCampaignPause = useCallback((id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = { ...c, paused: !c.paused };
      addToast(`"${c.name}" ${next.paused ? 'paused' : 'resumed'}`, next.paused ? 'warn' : 'success');
      return next;
    }));
  }, [addToast]);

  const viewDetail = useCallback((c: Campaign) => {
    addToast(`Viewing "${c.name}" — ${c.leads} leads, ${c.sends.toLocaleString()} sends`, 'info');
  }, [addToast]);

  // ── Metric bar max ──
  const maxMetricVal = useMemo(() => {
    if (leaderMetric === 'replies') return Math.max(...campaigns.map(c => c.replies), 1);
    if (leaderMetric === 'opens')   return Math.max(...campaigns.map(c => c.opens), 1);
    return Math.max(...campaigns.map(c => c.sends), 1);
  }, [campaigns, leaderMetric]);

  function metricVal(c: Campaign): number {
    if (leaderMetric === 'replies') return c.replies;
    if (leaderMetric === 'opens')   return c.opens;
    return c.sends;
  }

  function metricLabel(m: LeaderMetric): string {
    if (m === 'replies') return 'Replies';
    if (m === 'opens')   return 'Opens';
    return 'Volume';
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px 48px', minHeight: '100vh', position: 'relative' }}>

      {/* ── Page header ── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Activity size={18} color={C.accent} />
            <span style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>
              CRM Activity Stream
            </span>
            <span style={{
              ...MICRO,
              background: 'rgba(242,101,34,0.12)',
              border: `1px solid rgba(242,101,34,0.25)`,
              borderRadius: 99,
              padding: '2px 8px',
              color: C.accent,
            }}>
              Cross-workspace
            </span>
          </div>
          <p style={{ fontSize: 13, color: C.dim, margin: 0, maxWidth: 540 }}>
            Live engagement feed, top campaigns, and engagement trends — simulated from mock CRM data across 7 workspaces.
          </p>
        </div>

        {/* Workspace filter */}
        <div style={{ position: 'relative' }}>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setWsDropOpen(p => !p)}
            style={{
              ...GLASS2,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', cursor: 'pointer',
              border: 'none', color: C.text, fontSize: 13, fontWeight: 500,
            }}
          >
            <Filter size={13} color={C.accent} />
            {wsFilter === 'all' ? 'All Workspaces' : (wsMap[wsFilter]?.name ?? wsFilter)}
            <ChevronDown size={13} color={C.faint} />
          </motion.button>

          <AnimatePresence>
            {wsDropOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0,  scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                style={{
                  position: 'absolute', top: '110%', right: 0, zIndex: 50,
                  ...GLASS,
                  minWidth: 180,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  overflow: 'hidden',
                }}
              >
                {(['all', ...WORKSPACES.map(w => w.id)] as const).map(wid => {
                  const ws = wid === 'all' ? null : wsMap[wid];
                  return (
                    <button
                      key={wid}
                      type="button"
                      onClick={() => { setWsFilter(wid); setWsDropOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '9px 14px',
                        background: wsFilter === wid ? 'rgba(242,101,34,0.10)' : 'transparent',
                        border: 'none', cursor: 'pointer',
                        color: wsFilter === wid ? C.accent : C.dim,
                        fontSize: 13, textAlign: 'left',
                      }}
                    >
                      {ws && (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: ws.color, flexShrink: 0,
                        }} />
                      )}
                      {wid === 'all' ? 'All Workspaces' : (ws?.name ?? wid)}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ── KPI strip ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}
      >
        {(
          [
            { label: 'Total Sends',  icon: Send,          val: kpiSends,    suffix: '',   color: C.accent,  delta: 8.4,  good: true,  decimals: 0 },
            { label: 'Opens',        icon: MailOpen,       val: kpiOpens,    suffix: '',   color: C.accent2, delta: 5.2,  good: true,  decimals: 0 },
            { label: 'Replies',      icon: MessageSquare, val: kpiReplies,  suffix: '',   color: C.success, delta: 11.7, good: true,  decimals: 0 },
            { label: 'Open Rate',    icon: Target,        val: kpiOpenPct,  suffix: '%',  color: C.accent2, delta: -0.8, good: false, decimals: 1 },
            { label: 'Reply Rate',   icon: TrendingUp,    val: kpiReplyPct, suffix: '%',  color: C.success, delta: 1.4,  good: true,  decimals: 1 },
          ] as const
        ).map(kpi => {
          const Icon = kpi.icon;
          const isUp = kpi.delta >= 0;
          const deltaColor = isUp === kpi.good ? C.success : C.danger;
          return (
            <motion.div
              key={kpi.label}
              variants={kpiVariants}
              whileHover={{ scale: 1.03, y: -2 }}
              style={{ ...GLASS, padding: '18px 18px 14px', cursor: 'default' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={MICRO}>{kpi.label}</span>
                <Icon size={14} color={kpi.color} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text, lineHeight: 1, marginBottom: 6 }}>
                <AnimatedCount to={kpi.val} suffix={kpi.suffix} decimals={kpi.decimals} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                {isUp
                  ? <ArrowUpRight size={11} color={deltaColor} />
                  : <ArrowDownRight size={11} color={deltaColor} />
                }
                <span style={{ color: deltaColor, fontWeight: 600 }}>
                  {isUp ? '+' : ''}{kpi.delta}%
                </span>
                <span style={{ color: C.faint }}>vs last 30d</span>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Main 3-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>

        {/* ── Left column: chart + feed ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Engagement timeline chart */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="show"
            style={{ ...GLASS, padding: '20px 20px 14px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart2 size={14} color={C.accent} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Engagement Over Time</span>
                <span style={{ ...MICRO }}>all workspaces</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['14d', '30d'] as const).map(r => (
                  <motion.button
                    key={r}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setChartRange(r)}
                    style={{
                      border: 'none', cursor: 'pointer', borderRadius: 99,
                      padding: '4px 12px', fontSize: 11, fontWeight: 600,
                      background: chartRange === r ? C.accent : 'transparent',
                      color: chartRange === r ? '#0a0a0f' : C.dim,
                      transition: 'background 0.18s, color 0.18s',
                    }}
                  >
                    {r}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 18, marginBottom: 8 }}>
              {[
                { label: 'Sends',   color: C.accent,  dash: false },
                { label: 'Opens',   color: C.accent2, dash: true  },
                { label: 'Replies', color: C.success, dash: true  },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width={18} height={6}>
                    <line
                      x1={0} y1={3} x2={18} y2={3}
                      stroke={l.color}
                      strokeWidth={l.dash ? 1.5 : 2}
                      strokeDasharray={l.dash ? '4 2' : undefined}
                    />
                  </svg>
                  <span style={{ fontSize: 11, color: C.faint }}>{l.label}</span>
                </div>
              ))}
            </div>

            <div style={{ height: 130 }}>
              <EngagementChart data={chartData} range={chartRange} />
            </div>
          </motion.div>

          {/* Live activity feed */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="show"
            style={{ ...GLASS, padding: '18px 18px 8px' }}
          >
            {/* Feed header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={14} color={C.accent} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Live Activity Feed</span>
                {/* pulse indicator */}
                <motion.span
                  animate={paused ? {} : { opacity: [1, 0.25, 1] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                  style={{ width: 6, height: 6, borderRadius: '50%', background: paused ? C.faint : C.success, display: 'inline-block' }}
                />
                {wsFilter !== 'all' && (
                  <span style={{
                    ...MICRO,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 99, padding: '2px 8px', color: C.accent2,
                  }}>
                    {wsMap[wsFilter]?.name}
                  </span>
                )}
              </div>

              <motion.button
                type="button"
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.93 }}
                onClick={() => setPaused(p => !p)}
                style={{
                  ...GLASS2,
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', color: paused ? C.accent : C.dim, fontSize: 12, fontWeight: 600,
                  borderRadius: 99,
                }}
              >
                {paused ? <Play size={12} /> : <Pause size={12} />}
                {paused ? 'Resume' : 'Pause'}
              </motion.button>
            </div>

            {/* Feed rows */}
            <div style={{ minHeight: 360 }}>
              <AnimatePresence initial={false}>
                {filteredEvents.map(evt => {
                  const ws = wsMap[evt.wsId];
                  const Icon = typeIcon(evt.type);
                  const col = typeColor(evt.type);
                  return (
                    <motion.div
                      key={evt.id}
                      variants={feedRowVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      layout
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '11px 10px',
                        borderRadius: 10,
                        marginBottom: 4,
                        alignItems: 'flex-start',
                        transition: 'background 0.15s',
                      }}
                      whileHover={{ background: 'rgba(255,255,255,0.04)' }}
                    >
                      {/* Type icon */}
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: `${col}18`,
                        border: `1px solid ${col}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon size={13} color={col} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                          {/* Workspace chip */}
                          {ws && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
                              background: `${ws.color}1a`, border: `1px solid ${ws.color}30`,
                              color: ws.color, borderRadius: 99, padding: '1px 7px',
                            }}>
                              {ws.name}
                            </span>
                          )}
                          {/* Type label */}
                          <span style={{ fontSize: 11, fontWeight: 600, color: col }}>
                            {typeLabel(evt.type)}
                          </span>
                          {/* Campaign */}
                          <span style={{ fontSize: 11, color: C.dim }}>
                            · {evt.campaignName}
                            {evt.stepLabel && <span style={{ color: C.faint }}> · {evt.stepLabel}</span>}
                          </span>
                        </div>
                        {/* Detail */}
                        <p style={{ margin: 0, fontSize: 11, color: C.faint, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                          {evt.leadName && <span style={{ color: C.dim, fontWeight: 500 }}>{evt.leadName}</span>}
                          {evt.leadName ? ` — ${evt.detail}` : evt.detail}
                        </p>
                      </div>

                      {/* Timestamp */}
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, paddingTop: 2 }}>
                        <Clock size={9} color={C.faint} />
                        <span style={{ fontSize: 10, color: C.faint, whiteSpace: 'nowrap' }}>{evt.ts}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {filteredEvents.length === 0 && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: 200, gap: 8,
                }}>
                  <Activity size={24} color={C.faint} />
                  <span style={{ fontSize: 13, color: C.faint }}>No events for this workspace yet.</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* ── Right column: leaderboard ── */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="show"
          style={{ ...GLASS, padding: '18px 16px' }}
        >
          {/* Leaderboard header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Zap size={13} color={C.accent} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Top Campaigns</span>
            </div>

            {/* Metric toggle dropdown */}
            <div style={{ position: 'relative' }}>
              <motion.button
                type="button"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setMetricDropOpen(p => !p)}
                style={{
                  ...GLASS2,
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', fontSize: 11, fontWeight: 600,
                  color: C.accent, borderRadius: 99,
                }}
              >
                {metricLabel(leaderMetric)}
                <ChevronDown size={11} color={C.faint} />
              </motion.button>
              <AnimatePresence>
                {metricDropOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -5, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0,  scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: 'absolute', top: '110%', right: 0, zIndex: 60,
                      ...GLASS,
                      minWidth: 130,
                      boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
                    }}
                  >
                    {(['replies', 'opens', 'volume'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setLeaderMetric(m); setMetricDropOpen(false); }}
                        style={{
                          display: 'block', width: '100%', padding: '9px 14px',
                          background: leaderMetric === m ? 'rgba(242,101,34,0.10)' : 'transparent',
                          border: 'none', cursor: 'pointer',
                          color: leaderMetric === m ? C.accent : C.dim,
                          fontSize: 12, fontWeight: leaderMetric === m ? 700 : 400,
                          textAlign: 'left',
                        }}
                      >
                        {metricLabel(m)}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Campaign rows — FLIP reorder via layout prop */}
          <div>
            <AnimatePresence initial={false} mode="popLayout">
              {filteredCampaigns.map((c, idx) => {
                const ws = wsMap[c.wsId];
                const val = metricVal(c);
                const barPct = maxMetricVal > 0 ? (val / maxMetricVal) * 100 : 0;
                const barColor = c.paused ? C.faint : (idx === 0 ? C.accent : idx === 1 ? C.accent2 : C.success);
                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                    style={{
                      padding: '12px 10px',
                      borderRadius: 10,
                      marginBottom: 4,
                      borderBottom: `1px solid ${C.hair}`,
                      opacity: c.paused ? 0.65 : 1,
                    }}
                    whileHover={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    {/* Row top */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 7 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Rank + name */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 800, color: barColor,
                            width: 16, textAlign: 'center',
                          }}>
                            #{idx + 1}
                          </span>
                          <span style={{
                            fontSize: 12, fontWeight: 600, color: C.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {c.name}
                          </span>
                        </div>
                        {/* WS + status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 22 }}>
                          {ws && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                              background: `${ws.color}1a`, color: ws.color,
                              borderRadius: 99, padding: '1px 6px', border: `1px solid ${ws.color}25`,
                            }}>
                              {ws.name}
                            </span>
                          )}
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                            color: statusColor(c.status),
                          }}>
                            {c.paused ? 'PAUSED' : c.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => toggleCampaignPause(c.id)}
                          title={c.paused ? 'Resume' : 'Pause'}
                          style={{
                            width: 26, height: 26, borderRadius: 7,
                            background: 'rgba(255,255,255,0.06)',
                            border: `1px solid ${C.borderSoft}`,
                            cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {c.paused
                            ? <Play size={11} color={C.success} />
                            : <Pause size={11} color={C.faint} />
                          }
                        </motion.button>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => viewDetail(c)}
                          title="View detail"
                          style={{
                            width: 26, height: 26, borderRadius: 7,
                            background: 'rgba(255,255,255,0.06)',
                            border: `1px solid ${C.borderSoft}`,
                            cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <ArrowUpRight size={11} color={C.faint} />
                        </motion.button>
                      </div>
                    </div>

                    {/* Metric bar */}
                    <div style={{ paddingLeft: 22 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: C.faint }}>{metricLabel(leaderMetric)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>
                          {val.toLocaleString()}
                        </span>
                      </div>
                      <div style={{ height: 3, background: C.glass2, borderRadius: 99, overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barPct}%` }}
                          transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.1 }}
                          style={{ height: '100%', background: barColor, borderRadius: 99 }}
                        />
                      </div>
                      {/* Mini stats */}
                      <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                        <span style={{ fontSize: 9, color: C.faint }}>{c.openRate.toFixed(1)}% open</span>
                        <span style={{ fontSize: 9, color: C.faint }}>{c.replyRate.toFixed(1)}% reply</span>
                        <span style={{ fontSize: 9, color: C.faint }}>{c.leads} leads</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {filteredCampaigns.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: 120, gap: 8,
              }}>
                <Building2 size={20} color={C.faint} />
                <span style={{ fontSize: 12, color: C.faint }}>No campaigns for this workspace.</span>
              </div>
            )}
          </div>

          {/* Refresh hint */}
          <motion.div
            style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
          >
            <RefreshCw size={10} color={C.faint} />
            <span style={{ fontSize: 10, color: C.faint }}>
              Leaderboard reorders as engagement data flows in. Toggle metric above to FLIP ranks.
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* ── Toast overlay ── */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 100,
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      }}>
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              style={{
                ...GLASS2,
                padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                pointerEvents: 'all',
                maxWidth: 340,
              }}
            >
              {t.kind === 'success' && <CheckCircle2 size={14} color={C.success} />}
              {t.kind === 'warn'    && <AlertTriangle size={14} color={C.warning} />}
              {t.kind === 'info'    && <Activity size={14} color={C.accent} />}
              <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{t.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
