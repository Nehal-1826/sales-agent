/**
 * H4Immersive.tsx — "Immersive / Product-first" hero candidate
 *
 * SELF-CONTAINED: only react + framer-motion + lucide-react
 * Dark "Aurora Glass" palette — #F26522 / #FF8A4B accent, no purple/blue/teal
 * Plans: Starter · Pro · Pro Plus (NO Agency)
 * All mock data inline. No @/ imports, no .css imports, inline style only.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
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
  ArrowRight,
  Mail,
  MailOpen,
  MessageSquare,
  ShieldCheck,
  Send,
  TrendingUp,
  Inbox,
  Zap,
  Star,
  AlertTriangle,
  CheckCircle2,
  Activity,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   PALETTE TOKENS
───────────────────────────────────────────────────────────────────────────── */
const T = {
  bg: '#0c0a09',
  surface: 'rgba(255,255,255,0.05)',
  surfaceBorder: 'rgba(255,255,255,0.10)',
  accent: '#F26522',
  accentB: '#FF8A4B',
  success: '#3ddc97',
  warning: '#FF8A4B',
  danger: '#ff5c7a',
  text: '#f5f0ec',
  textDim: '#a89a8c',
  textFaint: '#6b5d52',
} as const;

/* ─────────────────────────────────────────────────────────────────────────────
   GLASS SURFACE STYLE HELPER
───────────────────────────────────────────────────────────────────────────── */
function glass(extra?: CSSProperties): CSSProperties {
  return {
    background: T.surface,
    border: `1px solid ${T.surfaceBorder}`,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 16,
    ...extra,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   PLAN DEFINITIONS
───────────────────────────────────────────────────────────────────────────── */
type PlanKey = 'starter' | 'pro' | 'proplus';
const PLANS: { key: PlanKey; label: string }[] = [
  { key: 'starter', label: 'Starter' },
  { key: 'pro',     label: 'Pro' },
  { key: 'proplus', label: 'Pro Plus' },
];

/* ─────────────────────────────────────────────────────────────────────────────
   SIGNAL CHIPS (floating activity signals)
───────────────────────────────────────────────────────────────────────────── */
interface SignalChip {
  id: string;
  icon: 'reply' | 'inbox' | 'star' | 'rep' | 'send' | 'rescue';
  text: string;
  color: string;
}

const SIGNAL_POOL: SignalChip[] = [
  { id: 's1', icon: 'reply',  text: 'Reply received',      color: T.success },
  { id: 's2', icon: 'inbox',  text: 'Moved to inbox',      color: T.accent },
  { id: 's3', icon: 'rep',    text: 'Reputation 98',       color: T.success },
  { id: 's4', icon: 'star',   text: 'Starred by peer',     color: '#FFD700' },
  { id: 's5', icon: 'send',   text: '24 sent today',       color: T.accentB },
  { id: 's6', icon: 'rescue', text: 'Spam rescued',        color: T.warning },
  { id: 's7', icon: 'reply',  text: 'Thread replied',      color: T.success },
  { id: 's8', icon: 'inbox',  text: 'Inbox placement 97%', color: T.accent },
];

function signalIcon(type: SignalChip['icon']): ReactNode {
  const s: CSSProperties = { width: 12, height: 12, flexShrink: 0 };
  switch (type) {
    case 'reply':  return <MessageSquare style={s} />;
    case 'inbox':  return <Inbox style={s} />;
    case 'star':   return <Star style={s} />;
    case 'rep':    return <ShieldCheck style={s} />;
    case 'send':   return <Send style={s} />;
    case 'rescue': return <AlertTriangle style={s} />;
    default:       return <Zap style={s} />;
  }
}

/* Positions for each chip slot — avoid the center device area */
const CHIP_POSITIONS: CSSProperties[] = [
  { top: '8%',  left:  '3%'  },
  { top: '25%', left:  '1%'  },
  { top: '55%', left:  '2%'  },
  { top: '72%', left:  '5%'  },
  { top: '10%', right: '2%'  },
  { top: '30%', right: '1%'  },
  { top: '60%', right: '3%'  },
  { top: '78%', right: '4%'  },
];

const chipV: Variants = {
  hidden: { opacity: 0, scale: 0.7, y: 8 },
  show:   { opacity: 1, scale: 1,   y: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } },
  exit:   { opacity: 0, scale: 0.6, y: -6, transition: { duration: 0.35 } },
};

/* ─────────────────────────────────────────────────────────────────────────────
   MOCK DATA
───────────────────────────────────────────────────────────────────────────── */

// Sparkline points for Starter warmth
const STARTER_TREND = [12, 18, 22, 28, 30, 38, 42, 48, 52, 56, 60, 66, 70, 74, 78, 80, 84, 86, 89, 92, 93, 94, 95, 96, 97, 97, 98, 98, 98, 98];

interface ProMailbox {
  name: string;
  score: number;
  delta: number;
  sent: number;
  status: 'warm' | 'rising' | 'new';
}

const PRO_MAILBOXES: ProMailbox[] = [
  { name: 'alex@ventures.io',    score: 97, delta: +2, sent: 42, status: 'warm'   },
  { name: 'priya@nextstep.com',  score: 89, delta: +4, sent: 38, status: 'warm'   },
  { name: 'kai@growthco.app',    score: 76, delta: +6, sent: 35, status: 'rising' },
  { name: 'sam@outbound.ai',     score: 61, delta: +8, sent: 28, status: 'rising' },
  { name: 'nia@scalehq.com',     score: 42, delta:+12, sent: 20, status: 'new'    },
];

const PRO_COMBO_SENT  = [20, 28, 32, 26, 38, 42, 35, 44, 48, 41, 50, 52, 46, 55, 58];
const PRO_COMBO_INBOX = [14, 21, 26, 20, 32, 37, 30, 39, 44, 37, 46, 49, 43, 52, 55];

interface ProPlusMailbox {
  email: string;
  score: number;
  status: 'warm' | 'rising' | 'new' | 'paused';
  provider: 'gmail' | 'outlook' | 'yahoo';
  day: number;
  sent: number;
  opens: number;
  replies: number;
  spamRescue: number;
}

const PP_MAILBOXES: ProPlusMailbox[] = [
  { email: 'ceo@alphacorp.io',       score: 98, status: 'warm',   provider: 'gmail',   day: 42, sent: 50, opens: 47, replies: 31, spamRescue: 0  },
  { email: 'sales@betafirm.com',     score: 92, status: 'warm',   provider: 'outlook', day: 38, sent: 48, opens: 44, replies: 28, spamRescue: 1  },
  { email: 'ops@gammareach.app',     score: 87, status: 'warm',   provider: 'gmail',   day: 35, sent: 46, opens: 41, replies: 26, spamRescue: 0  },
  { email: 'biz@deltafund.vc',       score: 81, status: 'rising', provider: 'outlook', day: 28, sent: 42, opens: 37, replies: 22, spamRescue: 2  },
  { email: 'founder@epsilo.io',      score: 74, status: 'rising', provider: 'gmail',   day: 22, sent: 38, opens: 32, replies: 18, spamRescue: 1  },
  { email: 'growth@zetahq.com',      score: 66, status: 'rising', provider: 'yahoo',   day: 18, sent: 35, opens: 28, replies: 14, spamRescue: 3  },
  { email: 'hello@etaventures.co',   score: 55, status: 'new',    provider: 'gmail',   day: 14, sent: 28, opens: 22, replies:  9, spamRescue: 2  },
  { email: 'info@thetastart.app',    score: 41, status: 'new',    provider: 'outlook', day:  9, sent: 20, opens: 15, replies:  5, spamRescue: 4  },
  { email: 'team@iotalabs.ai',       score: 28, status: 'new',    provider: 'gmail',   day:  5, sent: 12, opens:  8, replies:  2, spamRescue: 1  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   FRAMER VARIANTS
───────────────────────────────────────────────────────────────────────────── */
const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] } },
};

const deviceEntrance: Variants = {
  hidden: { opacity: 0, y: 60, rotateX: 18, scale: 0.92 },
  show:   { opacity: 1, y: 0,  rotateX: 4,  scale: 1,
    transition: { duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.25 } },
};

const planSurfaceV: Variants = {
  initial:  { opacity: 0, scale: 0.97, y: 10 },
  animate:  { opacity: 1, scale: 1,    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 28 } },
  exit:     { opacity: 0, scale: 0.95, y: -8,
    transition: { duration: 0.22, ease: 'easeIn' } },
};

/* ─────────────────────────────────────────────────────────────────────────────
   ANIMATED KPI COUNTER
───────────────────────────────────────────────────────────────────────────── */
function KpiCounter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const ctrl = animate(motionVal, to, { duration: 1.4, ease: 'easeOut' });
    const unsub = motionVal.on('change', (v) => setDisplay(Math.round(v)));
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [motionVal, to]);

  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PLAN DASHBOARDS
───────────────────────────────────────────────────────────────────────────── */

/* ── Starter ── */
function StarterSurface() {
  const warmth = 98;
  const pct = warmth;
  const dashTotal = 2 * Math.PI * 54;
  const dashFill = (pct / 100) * dashTotal;

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: T.textFaint, fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Starter · Dashboard</div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginTop: 2 }}>alex@myco.com</div>
        </div>
        <span style={{ background: `${T.success}22`, border: `1px solid ${T.success}44`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: T.success, fontFamily: 'monospace' }}>Day 30</span>
      </div>

      {/* Warmth gauge row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 1 }}>
        {/* Radial gauge */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width={130} height={130} viewBox="0 0 130 130">
            <circle cx={65} cy={65} r={54} fill="none" stroke={`${T.accent}22`} strokeWidth={9} />
            <motion.circle
              cx={65} cy={65} r={54}
              fill="none"
              stroke="url(#gaugeGrad)"
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={`${dashTotal}`}
              initial={{ strokeDashoffset: dashTotal }}
              animate={{ strokeDashoffset: dashTotal - dashFill }}
              transition={{ duration: 1.6, ease: 'easeOut', delay: 0.4 }}
              transform="rotate(-90 65 65)"
            />
            <defs>
              <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor={T.accent} />
                <stop offset="100%" stopColor={T.success} />
              </linearGradient>
            </defs>
            {/* Center text */}
            <text x={65} y={55} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={T.textFaint} letterSpacing="2">WARMTH</text>
            <text x={65} y={76} textAnchor="middle" fontSize={28} fontWeight="700" fontFamily="system-ui" fill={T.text}>{warmth}</text>
            <text x={65} y={91} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={T.success}>+2 · 24h</text>
          </svg>
        </div>

        {/* KPI column */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', flex: 1 }}>
          {[
            { icon: <Send style={{ width: 11, height: 11 }} />, label: 'Sent', val: 50,   foot: 'of 50 target' },
            { icon: <MailOpen style={{ width: 11, height: 11 }} />, label: 'Opens', val: 47, foot: '94% rate' },
            { icon: <MessageSquare style={{ width: 11, height: 11 }} />, label: 'Replies', val: 31, foot: '62% rate' },
            { icon: <ShieldCheck style={{ width: 11, height: 11 }} />, label: 'Rescues', val: 0, foot: 'No rescues' },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: `rgba(255,255,255,0.03)`, border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', color: T.textFaint, fontSize: 10, marginBottom: 4 }}>
                {kpi.icon}{kpi.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.text, lineHeight: 1 }}>
                <KpiCounter to={kpi.val} />
              </div>
              <div style={{ fontSize: 9, color: T.textFaint, fontFamily: 'monospace', marginTop: 2 }}>{kpi.foot}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sparkline */}
      <div style={{ ...glass(), padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 10, color: T.textDim }}>
          <TrendingUp style={{ width: 11, height: 11 }} />
          Warmth · last 30 days
          <span style={{ marginLeft: 'auto', color: T.textFaint, fontFamily: 'monospace', fontSize: 9 }}>30d</span>
        </div>
        <svg viewBox="0 0 300 50" style={{ width: '100%', height: 44, display: 'block' }}>
          <defs>
            <linearGradient id="spkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={T.accent} stopOpacity="0.5" />
              <stop offset="100%" stopColor={T.accent} stopOpacity="0"   />
            </linearGradient>
          </defs>
          {(() => {
            const pts = STARTER_TREND;
            const w = 300; const h = 50; const pad = 2;
            const maxV = 100; const minV = 0;
            const xAt = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
            const yAt = (v: number) => pad + (1 - (v - minV) / (maxV - minV)) * (h - pad * 2);
            const pathD = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
            const areaD = `M${xAt(0).toFixed(1)},${h} ${pts.map((v, i) => `L${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ')} L${xAt(pts.length-1).toFixed(1)},${h} Z`;
            return (
              <>
                <path d={areaD} fill="url(#spkFill)" />
                <motion.path d={pathD} fill="none" stroke={T.accent} strokeWidth={1.8} strokeLinecap="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                  transition={{ duration: 1.8, ease: 'easeOut', delay: 0.6 }} />
                <circle cx={xAt(pts.length-1)} cy={yAt(pts[pts.length-1] ?? 0)} r={3} fill={T.accent} />
              </>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

/* ── Pro ── */
function ProSurface() {
  const COLORS_STATUS: Record<ProMailbox['status'], string> = {
    warm: T.success, rising: T.accent, new: T.textDim,
  };

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: T.textFaint, fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Pro · Dashboard</div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginTop: 2 }}>5 mailboxes · Analytics cockpit</div>
        </div>
        <span style={{ background: `${T.accent}22`, border: `1px solid ${T.accent}44`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: T.accent, fontFamily: 'monospace' }}>Live</span>
      </div>

      {/* KPI band */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'Total sent', val: 163, color: T.text },
          { label: 'Avg warmth', val: 73,  color: T.success, suffix: '' },
          { label: 'Inbox rate', val: 94,  color: T.success, suffix: '%' },
          { label: 'Spam rescued', val: 8, color: T.warning },
        ].map((k) => (
          <div key={k.label} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.surfaceBorder}`, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>
              <KpiCounter to={k.val} suffix={k.suffix ?? ''} />
            </div>
            <div style={{ fontSize: 9, color: T.textFaint, fontFamily: 'monospace', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Combo chart */}
      <div style={{ ...glass(), padding: '10px 14px', flex: 1 }}>
        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity style={{ width: 11, height: 11 }} />
          Sends vs Inbox placements · 15-day
        </div>
        <svg viewBox="0 0 280 60" style={{ width: '100%', height: 54, display: 'block' }}>
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.accent} stopOpacity="0.7" />
              <stop offset="100%" stopColor={T.accent} stopOpacity="0.2" />
            </linearGradient>
          </defs>
          {PRO_COMBO_SENT.map((s, i) => {
            const bw = 12; const gap = 6; const x = 4 + i * (bw + gap);
            const maxS = 60;
            const sh = ((s ?? 0) / maxS) * 52;
            const ih = (((PRO_COMBO_INBOX[i] ?? 0)) / maxS) * 52;
            return (
              <g key={i}>
                <motion.rect x={x} y={60 - sh} width={bw} height={sh} rx={2} fill="url(#barGrad)"
                  initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                  style={{ transformOrigin: `${x}px 60px` }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.04 }} />
                <motion.circle cx={x + bw / 2} cy={60 - ih} r={2.5} fill={T.success}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.8 + i * 0.04 }} />
              </g>
            );
          })}
          {/* Connect dots */}
          {(() => {
            const bw = 12; const gap = 6;
            const maxS = 60;
            const linePts = PRO_COMBO_INBOX.map((v, i) => {
              const x = 4 + i * (bw + gap) + bw / 2;
              const y = 60 - (((v ?? 0) / maxS) * 52);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            return (
              <motion.polyline points={linePts} fill="none" stroke={T.success} strokeWidth={1.5} strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, delay: 0.8 }} />
            );
          })()}
        </svg>
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <span style={{ fontSize: 9, color: T.accent, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, background: T.accent, borderRadius: 2, display: 'inline-block' }} />Sends
          </span>
          <span style={{ fontSize: 9, color: T.success, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 3, background: T.success, borderRadius: 1, display: 'inline-block' }} />Inbox
          </span>
        </div>
      </div>

      {/* Leaderboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 10, color: T.textFaint, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Mailbox leaderboard</div>
        {PRO_MAILBOXES.slice(0, 4).map((mb, i) => (
          <div key={mb.name} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.025)', border: `1px solid ${T.surfaceBorder}`, borderRadius: 8, padding: '5px 10px' }}>
            <span style={{ fontSize: 10, color: T.textFaint, fontFamily: 'monospace', width: 14 }}>#{i + 1}</span>
            <Mail style={{ width: 11, height: 11, color: T.textFaint, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 11, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mb.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS_STATUS[mb.status], fontFamily: 'monospace', flexShrink: 0 }}>{mb.score}</span>
            <span style={{ fontSize: 9, color: T.success, fontFamily: 'monospace', flexShrink: 0 }}>+{mb.delta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Pro Plus ── */
const PP_SELECTED_INIT = 0;
const STATUS_COLORS: Record<ProPlusMailbox['status'], string> = {
  warm: T.success, rising: T.accent, new: T.textDim, paused: T.danger,
};
const PROVIDER_COLORS: Record<ProPlusMailbox['provider'], string> = {
  gmail: T.danger, outlook: T.accentB, yahoo: T.textDim,
};

function ProPlusSurface() {
  const [selected, setSelected] = useState<number>(PP_SELECTED_INIT);
  const mb = PP_MAILBOXES[selected] ?? PP_MAILBOXES[0]!;

  return (
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: T.textFaint, fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Pro Plus · Dashboard</div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginTop: 2 }}>{PP_MAILBOXES.length} mailboxes</div>
        </div>
        <span style={{ background: `${T.accentB}22`, border: `1px solid ${T.accentB}44`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: T.accentB, fontFamily: 'monospace' }}>Master-Detail</span>
      </div>

      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Mailbox grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, alignContent: 'start', width: '55%', flexShrink: 0 }}>
          {PP_MAILBOXES.map((m, i) => (
            <motion.div
              key={m.email}
              onClick={() => setSelected(i)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                cursor: 'pointer',
                background: selected === i ? `${T.accent}18` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected === i ? T.accent + '55' : T.surfaceBorder}`,
                borderRadius: 10,
                padding: '7px 8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[m.status], flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: PROVIDER_COLORS[m.provider], fontFamily: 'monospace' }}>{m.provider.slice(0,3).toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: m.status === 'warm' ? T.success : T.text, lineHeight: 1 }}>{m.score}</div>
              <div style={{ fontSize: 8, color: T.textFaint, fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email.split('@')[0] ?? m.email}</div>
            </motion.div>
          ))}
        </div>

        {/* Detail panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.25 }}
            style={{ ...glass(), flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}
          >
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mb.email}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ background: `${STATUS_COLORS[mb.status]}22`, border: `1px solid ${STATUS_COLORS[mb.status]}44`, borderRadius: 12, padding: '2px 7px', fontSize: 9, color: STATUS_COLORS[mb.status], fontFamily: 'monospace', textTransform: 'capitalize' }}>{mb.status}</span>
              <span style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.surfaceBorder}`, borderRadius: 12, padding: '2px 7px', fontSize: 9, color: T.textFaint, fontFamily: 'monospace' }}>Day {mb.day}</span>
            </div>

            {/* Score bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.textFaint, fontFamily: 'monospace', marginBottom: 3 }}>
                <span>Warmth</span><span style={{ color: STATUS_COLORS[mb.status] }}>{mb.score}</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <motion.div
                  style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${T.accent}, ${T.success})` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${mb.score}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </div>

            {/* Mini stats */}
            {[
              { label: 'Sent', val: mb.sent,       icon: <Send        style={{ width: 9, height: 9 }} /> },
              { label: 'Opens', val: mb.opens,     icon: <MailOpen    style={{ width: 9, height: 9 }} /> },
              { label: 'Replies', val: mb.replies, icon: <MessageSquare style={{ width: 9, height: 9 }} /> },
            ].map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: T.textDim }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.textFaint }}>{s.icon}{s.label}</span>
                <span style={{ fontWeight: 700, color: T.text }}>{s.val}</span>
              </div>
            ))}

            {mb.spamRescue > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: T.warning, background: `${T.warning}11`, border: `1px solid ${T.warning}33`, borderRadius: 6, padding: '4px 7px' }}>
                <CheckCircle2 style={{ width: 9, height: 9 }} />
                {mb.spamRescue} spam rescues
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FLOATING SIGNAL CHIPS LAYER
───────────────────────────────────────────────────────────────────────────── */
function SignalChipsLayer() {
  const [visible, setVisible] = useState<number[]>([0, 3, 6]);

  useEffect(() => {
    const cycle = setInterval(() => {
      setVisible((prev) => {
        const next = [...prev];
        // Remove a random visible chip
        const removeIdx = Math.floor(Math.random() * next.length);
        next.splice(removeIdx, 1);
        // Add a chip not already visible
        const candidates = SIGNAL_POOL
          .map((_, i) => i)
          .filter((i) => !next.includes(i));
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          if (pick !== undefined) next.push(pick);
        }
        return next;
      });
    }, 2200);
    return () => clearInterval(cycle);
  }, []);

  return (
    <>
      {visible.map((chipIdx) => {
        const chip = SIGNAL_POOL[chipIdx];
        const pos = CHIP_POSITIONS[chipIdx % CHIP_POSITIONS.length];
        if (!chip || !pos) return null;
        return (
          <AnimatePresence key={`chip-${chipIdx}`}>
            <motion.div
              variants={chipV}
              initial="hidden"
              animate="show"
              exit="exit"
              style={{
                position: 'absolute',
                ...pos,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(12,10,9,0.85)',
                border: `1px solid ${chip.color}44`,
                borderRadius: 20,
                padding: '5px 10px',
                fontSize: 11,
                color: chip.color,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 20,
                boxShadow: `0 0 12px ${chip.color}22`,
              }}
            >
              {signalIcon(chip.icon)}
              {chip.text}
            </motion.div>
          </AnimatePresence>
        );
      })}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TRUST / KPI BAR
───────────────────────────────────────────────────────────────────────────── */
const KPIS = [
  { val: 99.2,  suffix: '%', label: 'Inbox rate'     },
  { val: 250000, suffix: '+', label: 'Emails warmed'  },
  { val: 4800,   suffix: '+', label: 'Mailboxes live' },
  { val: 14,     suffix: 'd', label: 'Free trial'     },
] as const;

function KpiBar() {
  return (
    <motion.div
      variants={fadeUp}
      style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px 36px', paddingTop: 12 }}
    >
      {KPIS.map((k) => (
        <div key={k.label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: 'monospace', lineHeight: 1 }}>
            <KpiCounter to={k.val} suffix={k.suffix} />
          </div>
          <div style={{ fontSize: 10, color: T.textFaint, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: 'monospace' }}>{k.label}</div>
        </div>
      ))}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PLAN PILL SWITCHER
───────────────────────────────────────────────────────────────────────────── */
function PlanPills({ active, onChange }: { active: PlanKey; onChange: (k: PlanKey) => void }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${T.surfaceBorder}`,
        borderRadius: 28,
        padding: 4,
        gap: 2,
        position: 'relative',
      }}
    >
      {PLANS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          style={{
            position: 'relative',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '7px 18px',
            borderRadius: 22,
            fontSize: 13,
            fontWeight: active === p.key ? 700 : 500,
            color: active === p.key ? T.text : T.textDim,
            transition: 'color 0.2s',
            zIndex: 2,
            fontFamily: 'inherit',
          }}
        >
          {active === p.key && (
            <motion.div
              layoutId="pill-bg"
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, ${T.accent}cc, ${T.accentB}99)`,
                borderRadius: 22,
                zIndex: -1,
                boxShadow: `0 2px 16px ${T.accent}44`,
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEVICE / PRODUCT SURFACE (the big tilted dashboard)
───────────────────────────────────────────────────────────────────────────── */
function ProductDevice({ activePlan }: { activePlan: PlanKey }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 680,
        aspectRatio: '16/9',
        borderRadius: 18,
        overflow: 'hidden',
        background: 'rgba(22,18,14,0.95)',
        border: `1px solid rgba(255,255,255,0.13)`,
        boxShadow: `0 32px 80px rgba(0,0,0,0.7), 0 0 60px ${T.accent}18, inset 0 1px 0 rgba(255,255,255,0.1)`,
        position: 'relative',
      }}
    >
      {/* Window chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: `1px solid rgba(255,255,255,0.07)`, background: 'rgba(0,0,0,0.25)' }}>
        {[T.danger, T.warning, T.success].map((c, i) => (
          <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.7 }} />
        ))}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 10, color: T.textFaint, fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: 6, border: `1px solid rgba(255,255,255,0.07)` }}>
            app.warmpulse.io · dashboard
          </span>
        </div>
      </div>

      {/* Dashboard content with plan switch */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activePlan}
          variants={planSurfaceV}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ height: 'calc(100% - 32px)' }}
        >
          {activePlan === 'starter'  && <StarterSurface />}
          {activePlan === 'pro'      && <ProSurface />}
          {activePlan === 'proplus'  && <ProPlusSurface />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN HERO COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export function LandHeroH4Immersive() {
  const [activePlan, setActivePlan] = useState<PlanKey>('starter');

  // Mouse-parallax for device
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 20 });

  const sectionRef = useRef<HTMLElement | null>(null);

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    mouseX.set(((e.clientX - cx) / rect.width)  * 12);
    mouseY.set(((e.clientY - cy) / rect.height) * 8);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  // Auto-cycle plans
  useEffect(() => {
    const cycle = setInterval(() => {
      setActivePlan((p) => {
        const idx = PLANS.findIndex((x) => x.key === p);
        return PLANS[(idx + 1) % PLANS.length]?.key ?? 'starter';
      });
    }, 5500);
    return () => clearInterval(cycle);
  }, []);

  // Gentle device float loop — vertical only
  const floatY = useMotionValue(0);
  const floatSpring = useSpring(floatY, { stiffness: 40, damping: 14 });

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = (ts - start) / 1000;
      floatY.set(Math.sin(t * 0.55) * 7);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [floatY]);

  return (
    <section
      ref={sectionRef as RefObject<HTMLElement>}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: T.bg,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px 60px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Background radial glows ── */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* Warm orange glow — top-center */}
        <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 900, height: 600, background: `radial-gradient(ellipse at 50% 0%, ${T.accent}1a 0%, transparent 70%)`, borderRadius: '50%' }} />
        {/* Amber glow — bottom-right */}
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: 700, height: 500, background: `radial-gradient(ellipse, ${T.accentB}10 0%, transparent 65%)`, borderRadius: '50%' }} />
        {/* Success glow — left */}
        <div style={{ position: 'absolute', top: '30%', left: '-8%', width: 500, height: 400, background: `radial-gradient(ellipse, ${T.success}0d 0%, transparent 60%)`, borderRadius: '50%' }} />
        {/* Subtle grid */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }} aria-hidden>
          <defs>
            <pattern id="h4grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0 L0 0 L0 48" fill="none" stroke={T.text} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#h4grid)" />
        </svg>
      </div>

      {/* ── Content wrapper ── */}
      <motion.div
        variants={heroContainer}
        initial="hidden"
        animate="show"
        style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}
      >
        {/* Badge */}
        <motion.div variants={fadeUp}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            border: `1px solid ${T.accent}44`, background: `${T.accent}0f`,
            borderRadius: 24, padding: '5px 14px',
            fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.18em', textTransform: 'uppercase', color: T.accent,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent, boxShadow: `0 0 8px ${T.accent}` }} />
            Email Warmup · Peer-Inbox Network
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={fadeUp}
          style={{
            margin: 0, padding: 0,
            fontSize: 'clamp(36px, 6vw, 68px)',
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            textAlign: 'center',
            maxWidth: 780,
            color: T.text,
          }}
        >
          Land in the inbox.{' '}
          <span style={{
            backgroundImage: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentB} 60%, ${T.success} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Every time.
          </span>
        </motion.h1>

        {/* Subline */}
        <motion.p
          variants={fadeUp}
          style={{
            margin: 0, textAlign: 'center',
            maxWidth: 540, fontSize: 17, lineHeight: 1.65, color: T.textDim,
          }}
        >
          WarmPulse runs a real peer-inbox network that trains ESPs to trust your
          domain — so your outreach lands in inbox, not Spam or Promotions.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={fadeUp}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}
        >
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: `0 0 32px ${T.accent}55` }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentB})`,
              border: 'none', borderRadius: 28, padding: '13px 28px',
              fontSize: 15, fontWeight: 700, color: '#fff',
              cursor: 'pointer', boxShadow: `0 4px 24px ${T.accent}44`,
              fontFamily: 'inherit',
            }}
          >
            Start warming free
            <ArrowRight style={{ width: 16, height: 16 }} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03, background: 'rgba(255,255,255,0.09)' }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${T.surfaceBorder}`,
              borderRadius: 28, padding: '13px 28px',
              fontSize: 15, fontWeight: 600, color: T.textDim,
              cursor: 'pointer', backdropFilter: 'blur(8px)',
              fontFamily: 'inherit',
            }}
          >
            See plans
          </motion.button>
        </motion.div>

        {/* Plan pills */}
        <motion.div variants={fadeUp}>
          <PlanPills active={activePlan} onChange={setActivePlan} />
        </motion.div>

        {/* ── BIG DEVICE ── */}
        <motion.div
          variants={deviceEntrance}
          style={{
            width: '100%',
            perspective: 1200,
            perspectiveOrigin: '50% 50%',
            position: 'relative',
          }}
        >
          <motion.div
            style={{
              rotateX: springY,
              rotateY: springX,
              y: floatSpring,
              transformStyle: 'preserve-3d',
            }}
          >
            <ProductDevice activePlan={activePlan} />
          </motion.div>

          {/* Floating signal chips around the device */}
          <SignalChipsLayer />

          {/* Soft glow under the device */}
          <div aria-hidden style={{
            position: 'absolute',
            bottom: -40,
            left: '10%',
            width: '80%',
            height: 80,
            background: `radial-gradient(ellipse, ${T.accent}22 0%, transparent 70%)`,
            filter: 'blur(20px)',
            pointerEvents: 'none',
          }} />
        </motion.div>

        {/* KPI / trust bar */}
        <KpiBar />

        {/* Trusted by */}
        <motion.div
          variants={fadeUp}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, opacity: 0.55 }}
        >
          <span style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.22em', textTransform: 'uppercase', color: T.textFaint }}>
            Trusted by outbound teams at
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 24px' }}>
            {['Acme Labs', 'Northwind', 'Stratus', 'Vexel', 'Quanta'].map((n) => (
              <span key={n} style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: T.textDim, letterSpacing: '0.05em' }}>{n}</span>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Scroll hint */}
      <div
        aria-hidden
        style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.3em', textTransform: 'uppercase',
          color: T.textFaint, opacity: 0.6,
        }}
      >
        scroll
      </div>
    </section>
  );
}
