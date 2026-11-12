import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  type PanInfo,
} from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Globe2,
  Inbox,
  Mail,
  Radar,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import './main-dashboard-designs.css';

/**
 * Main-dashboard design picker — swipeable carousel.
 *
 * Each slide is a full-width mockup of what the entire /admin/dashboard
 * page would look like if that design wins. Navigate with arrow buttons,
 * keyboard ← / →, or by dragging the slide horizontally.
 */
export function MainDashboardDesigns() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [picked, setPicked] = useState<DesignCode | null>(null);

  const go = (dir: 1 | -1) => {
    setDirection(dir);
    setIndex((i) => (i + dir + DESIGNS.length) % DESIGNS.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 80) go(-1);
    else if (info.offset.x < -80) go(1);
  };

  const design = DESIGNS[index]!;
  const isPicked = picked === design.code;

  return (
    <div className="mdd">
      <div className="mdd__atmosphere" aria-hidden>
        <div className="mdd__aurora-1" />
        <div className="mdd__aurora-2" />
      </div>

      <header className="mdd__head">
        <Link to="/admin/dashboard" className="mdd__back">
          ← Back to live dashboard
        </Link>
        <div className="mdd__head-row">
          <div>
            <span className="mdd__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick a main dashboard
            </span>
            <h1 className="mdd__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="mdd__sub">{design.tagline}</p>
          </div>
          <div className="mdd__counter">
            <span className="mdd__counter-now">{index + 1}</span>
            <span className="mdd__counter-sep">/</span>
            <span className="mdd__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="mdd__stage">
        <button
          type="button"
          className="mdd__arrow mdd__arrow--left"
          onClick={() => go(-1)}
          aria-label="Previous design"
        >
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>

        <div className="mdd__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="mdd__slide"
              custom={direction}
              variants={SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={onDragEnd}
            >
              <design.Full />
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          className="mdd__arrow mdd__arrow--right"
          onClick={() => go(1)}
          aria-label="Next design"
        >
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="mdd__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`mdd__dot ${i === index ? 'mdd__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="mdd__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="mdd__bullets-row">
        <ul className="mdd__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`mdd__pick ${isPicked ? 'mdd__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="mdd__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build {picked}</code> and I'll wire it up section by section.
        </div>
      ) : (
        <div className="mdd__hint">
          ← / → keys · click arrows · drag the slide · tap a dot
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'pulse-radar' | 'live-telemetry' | 'network-globe' | 'cinematic-hub';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Radar;
  Full: () => JSX.Element;
}

// Counter that animates from 0 → target on mount, then sits.
function AnimatedCounter({
  to,
  duration = 1.6,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      const e = 1 - Math.pow(1 - p, 3);
      setN(to * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return (
    <>
      {prefix}
      {n.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </>
  );
}

// ===========================================================================
// FULL MOCKUP 1 — PULSE RADAR
// Layout: hero radar (center) + 4 KPI tiles row + top peers + activity feed
// ===========================================================================
function FullPulseRadar() {
  return (
    <div className="dash dash--pr">
      <div className="dash__topbar">
        <span className="dash__crumb">Admin / Health Hub</span>
        <span className="dash__time">
          <Activity size={10} /> LIVE · updated 4s ago
        </span>
      </div>

      <div className="dash__kpis">
        {[
          { icon: Users, label: 'Users', to: 248, suffix: '' },
          { icon: Inbox, label: 'Mailboxes', to: 1204, suffix: '' },
          { icon: Mail, label: 'Sends today', to: 4812, suffix: '' },
          { icon: CreditCard, label: 'MRR', to: 24, suffix: 'k', prefix: '$' },
        ].map((k) => (
          <div className="kpi" key={k.label}>
            <k.icon size={12} strokeWidth={2.4} />
            <span className="kpi__num">
              <AnimatedCounter to={k.to} prefix={k.prefix ?? ''} suffix={k.suffix} />
            </span>
            <span className="kpi__label">{k.label}</span>
          </div>
        ))}
      </div>

      <div className="dash__main dash__main--pr">
        <div className="card card--radar">
          <div className="card__head">
            <span className="card__eyebrow">
              <Radar size={11} /> Peer-network radar
            </span>
            <span className="card__tag card__tag--ok">healthy</span>
          </div>
          <div className="pr2">
            <div className="pr2__rings" aria-hidden>
              <span className="pr2__ring pr2__ring--1" />
              <span className="pr2__ring pr2__ring--2" />
              <span className="pr2__ring pr2__ring--3" />
              <span className="pr2__ring pr2__ring--4" />
            </div>
            <div className="pr2__sweep" aria-hidden />
            {RADAR_PEERS.map((p, i) => (
              <span
                key={i}
                className={`pr2__peer pr2__peer--${p.tone}`}
                style={{ top: `${p.y}%`, left: `${p.x}%`, animationDelay: `${p.delay}s` }}
              />
            ))}
            <div className="pr2__center">
              <div className="pr2__center-num">
                <AnimatedCounter to={94.2} decimals={1} suffix="%" />
              </div>
              <div className="pr2__center-label">inbox placement</div>
            </div>
          </div>
          <div className="pr2__legend">
            <span className="pr2__leg">
              <span className="pr2__dot pr2__dot--ok" /> Active <strong>86</strong>
            </span>
            <span className="pr2__leg">
              <span className="pr2__dot pr2__dot--warn" /> Degraded <strong>3</strong>
            </span>
            <span className="pr2__leg">
              <span className="pr2__dot pr2__dot--err" /> Failed <strong>1</strong>
            </span>
          </div>
        </div>

        <div className="card card--list">
          <div className="card__head">
            <span className="card__eyebrow">
              <TrendingUp size={11} /> Top peers by reputation
            </span>
          </div>
          {TOP_PEERS.map((p, i) => (
            <motion.div
              key={p.id}
              className="row-peer"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.06, duration: 0.4 }}
            >
              <span className="row-peer__rank">#{i + 1}</span>
              <span className="row-peer__id">{p.id}</span>
              <span className="row-peer__bar">
                <motion.span
                  className="row-peer__fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${p.rep * 100}%` }}
                  transition={{ delay: 0.3 + i * 0.06, duration: 0.9, ease: 'easeOut' }}
                />
              </span>
              <span className="row-peer__rep">{p.rep.toFixed(2)}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <ActivityStrip />
    </div>
  );
}

const RADAR_PEERS = [
  { x: 22, y: 30, tone: 'ok' as const, delay: 0 },
  { x: 70, y: 25, tone: 'ok' as const, delay: 0.3 },
  { x: 80, y: 60, tone: 'ok' as const, delay: 0.6 },
  { x: 30, y: 70, tone: 'warn' as const, delay: 0.9 },
  { x: 55, y: 78, tone: 'ok' as const, delay: 1.2 },
  { x: 12, y: 52, tone: 'ok' as const, delay: 1.5 },
  { x: 88, y: 38, tone: 'err' as const, delay: 1.8 },
  { x: 45, y: 18, tone: 'ok' as const, delay: 2.1 },
];

const TOP_PEERS = [
  { id: 'peer-pool-A · gws-01', rep: 0.94 },
  { id: 'peer-pool-A · gws-02', rep: 0.92 },
  { id: 'peer-pool-B · o365-04', rep: 0.89 },
  { id: 'peer-pool-A · gws-03', rep: 0.86 },
  { id: 'peer-pool-C · yhoo-01', rep: 0.81 },
];

// ===========================================================================
// FULL MOCKUP 2 — LIVE TELEMETRY
// Layout: 4 sparkline KPIs + big drawing chart + donut + rising bars + feed
// ===========================================================================
function FullLiveTelemetry() {
  return (
    <div className="dash dash--lt">
      <div className="dash__topbar">
        <span className="dash__crumb">Admin / Telemetry</span>
        <span className="dash__time">
          <Activity size={10} /> 7-day window
        </span>
      </div>

      <div className="dash__kpis">
        {[
          { label: 'Users', to: 248, spark: [4, 6, 5, 7, 8, 7, 9] },
          { label: 'Sends', to: 4812, spark: [3, 5, 4, 6, 7, 8, 9] },
          { label: 'Peers', to: 86, spark: [5, 6, 6, 7, 7, 8, 8], suffix: '%' },
          { label: 'MRR', to: 24, prefix: '$', suffix: 'k', spark: [3, 4, 4, 5, 6, 6, 7] },
        ].map((k) => (
          <div className="kpi kpi--spark" key={k.label}>
            <div className="kpi__top">
              <span className="kpi__label">{k.label}</span>
              <Sparkline points={k.spark} />
            </div>
            <span className="kpi__num">
              <AnimatedCounter
                to={k.to}
                prefix={k.prefix ?? ''}
                suffix={k.suffix ?? ''}
              />
            </span>
          </div>
        ))}
      </div>

      <div className="dash__main dash__main--lt">
        <div className="card card--chart">
          <div className="card__head">
            <span className="card__eyebrow">
              <TrendingUp size={11} /> Outbound sends · last 24h
            </span>
            <span className="card__tag card__tag--ok">+12% vs yesterday</span>
          </div>
          <svg className="lt2__chart" viewBox="0 0 600 180" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lt2-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.55" />
                <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Y gridlines. */}
            {[0, 1, 2, 3].map((g) => (
              <line
                key={g}
                x1="0"
                x2="600"
                y1={30 + g * 38}
                y2={30 + g * 38}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 5"
              />
            ))}
            <motion.polygon
              points={`${LT_POINTS} 600,180 0,180`}
              fill="url(#lt2-fill)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.4, delay: 0.4 }}
            />
            <motion.polyline
              points={LT_POINTS}
              fill="none"
              stroke="var(--wp-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2.2, ease: 'easeOut' }}
            />
          </svg>
        </div>

        <div className="card card--donut">
          <div className="card__head">
            <span className="card__eyebrow">
              <Radar size={11} /> Peer health
            </span>
          </div>
          <div className="lt2__donut">
            <svg viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="22" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
              <motion.circle
                cx="30"
                cy="30"
                r="22"
                stroke="var(--wp-accent)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 22}
                initial={{ strokeDashoffset: 2 * Math.PI * 22 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 22 * (1 - 0.86) }}
                transition={{ duration: 1.8, ease: 'easeOut', delay: 0.4 }}
                style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
              />
            </svg>
            <div className="lt2__donut-label">
              <span className="lt2__donut-num">
                <AnimatedCounter to={86} suffix="%" />
              </span>
              <span className="lt2__donut-sub">healthy</span>
            </div>
          </div>
        </div>

        <div className="card card--bars">
          <div className="card__head">
            <span className="card__eyebrow">
              <Zap size={11} /> 7-day reputation
            </span>
          </div>
          <div className="lt2__bars">
            {[42, 55, 50, 68, 72, 80, 86].map((v, i) => (
              <motion.span
                key={i}
                className="lt2__bar"
                initial={{ height: 0 }}
                animate={{ height: `${v}%` }}
                transition={{ duration: 0.7, delay: 0.5 + i * 0.08, ease: 'easeOut' }}
              />
            ))}
          </div>
          <div className="lt2__bars-x">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
        </div>
      </div>

      <ActivityStrip />
    </div>
  );
}

const LT_POINTS =
  '0,140 40,120 80,128 120,108 160,116 200,90 240,98 280,72 320,80 360,56 400,64 440,40 480,46 520,28 560,34 600,22';

// ===========================================================================
// FULL MOCKUP 3 — NETWORK GLOBE
// Layout: globe (left, big) | region breakdown (right) | KPIs + feed below
// ===========================================================================
function FullNetworkGlobe() {
  return (
    <div className="dash dash--ng">
      <div className="dash__topbar">
        <span className="dash__crumb">Admin / Network</span>
        <span className="dash__time">
          <Globe2 size={10} /> 1,204 mailboxes across 38 countries
        </span>
      </div>

      <div className="dash__main dash__main--ng">
        <div className="card card--globe">
          <div className="card__head">
            <span className="card__eyebrow">
              <Globe2 size={11} /> Peer-mailbox network
            </span>
            <span className="card__tag card__tag--ok">all regions online</span>
          </div>
          <svg className="ng2__svg" viewBox="0 0 520 360">
            <defs>
              <radialGradient id="ng2-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.4" />
                <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="ng2-arc" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0" />
                <stop offset="0.5" stopColor="var(--wp-accent)" stopOpacity="1" />
                <stop offset="1" stopColor="#FF8A4B" stopOpacity="0" />
              </linearGradient>
            </defs>
            <circle cx="260" cy="180" r="150" fill="url(#ng2-glow)" />
            <g
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="0.6"
              strokeDasharray="1 3"
              fill="none"
            >
              <ellipse cx="260" cy="180" rx="130" ry="130" />
              <ellipse cx="260" cy="180" rx="130" ry="40" />
              <ellipse cx="260" cy="180" rx="130" ry="80" />
              <ellipse cx="260" cy="180" rx="40" ry="130" />
              <ellipse cx="260" cy="180" rx="80" ry="130" />
            </g>
            {ARCS_FULL.map((d, i) => (
              <motion.path
                key={i}
                d={d}
                stroke="url(#ng2-arc)"
                strokeWidth="1.6"
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
                transition={{
                  duration: 2.6,
                  delay: i * 0.5,
                  repeat: Infinity,
                  repeatDelay: 1.4,
                  ease: 'easeInOut',
                }}
              />
            ))}
            {HUBS_FULL.map((h, i) => (
              <g key={i}>
                <motion.circle
                  cx={h.x}
                  cy={h.y}
                  r="4"
                  fill="none"
                  stroke="var(--wp-accent)"
                  strokeWidth="1.2"
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 3.5, opacity: 0 }}
                  transition={{
                    duration: 2,
                    delay: i * 0.3,
                    repeat: Infinity,
                    ease: 'easeOut',
                  }}
                  style={{ transformOrigin: `${h.x}px ${h.y}px` }}
                />
                <circle cx={h.x} cy={h.y} r="3" fill="var(--wp-accent)" />
              </g>
            ))}
          </svg>
        </div>

        <div className="card card--regions">
          <div className="card__head">
            <span className="card__eyebrow">Regional breakdown</span>
          </div>
          {REGIONS.map((r, i) => (
            <div key={r.name} className="region">
              <div className="region__head">
                <span>{r.flag} {r.name}</span>
                <strong>{r.count}</strong>
              </div>
              <span className="region__bar">
                <motion.span
                  className="region__fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${r.pct}%` }}
                  transition={{ duration: 1, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
                />
              </span>
            </div>
          ))}
          <div className="card__foot">
            <span className="card__foot-label">Total</span>
            <span className="card__foot-num">1,204</span>
          </div>
        </div>
      </div>

      <div className="dash__kpis">
        {[
          { icon: Users, label: 'Users', to: 248 },
          { icon: Mail, label: 'Sends today', to: 4812 },
          { icon: Inbox, label: 'Active peers', to: 86 },
          { icon: CreditCard, label: 'MRR', to: 24, prefix: '$', suffix: 'k' },
        ].map((k) => (
          <div className="kpi" key={k.label}>
            <k.icon size={12} strokeWidth={2.4} />
            <span className="kpi__num">
              <AnimatedCounter
                to={k.to}
                prefix={k.prefix ?? ''}
                suffix={k.suffix ?? ''}
              />
            </span>
            <span className="kpi__label">{k.label}</span>
          </div>
        ))}
      </div>

      <ActivityStrip globe />
    </div>
  );
}

const ARCS_FULL = [
  'M 150,170 Q 260,80 370,160',
  'M 180,240 Q 320,330 410,220',
  'M 170,150 Q 280,60 390,200',
  'M 140,210 Q 240,290 405,170',
];
const HUBS_FULL = [
  { x: 150, y: 170 },
  { x: 370, y: 160 },
  { x: 180, y: 240 },
  { x: 410, y: 220 },
  { x: 390, y: 200 },
  { x: 260, y: 180 },
];
const REGIONS = [
  { name: 'North America', flag: '🇺🇸', count: 412, pct: 100 },
  { name: 'Europe', flag: '🇪🇺', count: 386, pct: 94 },
  { name: 'APAC', flag: '🇮🇳', count: 298, pct: 72 },
  { name: 'LATAM', flag: '🌎', count: 108, pct: 26 },
];

// ===========================================================================
// FULL MOCKUP 4 — CINEMATIC HUB
// Layout: mesh gradient hero + counter + stagger tiles + 2 content cards + feed
// ===========================================================================
function FullCinematicHub() {
  return (
    <div className="dash dash--ch">
      <div className="ch2__hero-wrap">
        <CinematicMesh />
        <div className="ch2__hero">
          <span className="ch2__eyebrow">
            <Sparkles size={10} strokeWidth={2.4} />
            PLATFORM PULSE
          </span>
          <div className="ch2__num">
            <AnimatedCounter to={94.2} decimals={1} suffix="%" />
          </div>
          <div className="ch2__label">overall inbox placement · trending up 2.4pp this week</div>
        </div>
      </div>

      <div className="dash__kpis dash__kpis--ch">
        {[
          { icon: Users, label: 'Users', to: 248 },
          { icon: Mail, label: 'Sends', to: 4812 },
          { icon: Inbox, label: 'Peers', to: 86 },
          { icon: CreditCard, label: 'MRR', to: 24, prefix: '$', suffix: 'k' },
        ].map((k, i) => (
          <motion.div
            key={k.label}
            className="ch2__tile"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.3 + i * 0.08, ease: 'easeOut' }}
            whileHover={{ y: -4, scale: 1.02 }}
          >
            <k.icon size={12} strokeWidth={2.4} />
            <span className="ch2__tile-num">
              <AnimatedCounter
                to={k.to}
                prefix={k.prefix ?? ''}
                suffix={k.suffix ?? ''}
              />
            </span>
            <span className="ch2__tile-label">{k.label}</span>
          </motion.div>
        ))}
      </div>

      <div className="dash__main dash__main--ch">
        <div className="card card--soft">
          <div className="card__head">
            <span className="card__eyebrow">
              <TrendingUp size={11} /> Send volume · last 7 days
            </span>
          </div>
          <svg className="ch2__chart" viewBox="0 0 380 120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="ch2-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.5" />
                <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.polygon
              points="0,90 60,80 120,72 180,58 240,64 300,40 380,32 380,120 0,120"
              fill="url(#ch2-fill)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.4 }}
            />
            <motion.polyline
              points="0,90 60,80 120,72 180,58 240,64 300,40 380,32"
              fill="none"
              stroke="var(--wp-accent)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, ease: 'easeOut' }}
            />
          </svg>
        </div>

        <div className="card card--soft">
          <div className="card__head">
            <span className="card__eyebrow">
              <Inbox size={11} /> Peer-pool spotlight
            </span>
          </div>
          {TOP_PEERS.slice(0, 4).map((p, i) => (
            <motion.div
              key={p.id}
              className="row-peer"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.08, duration: 0.4 }}
            >
              <span className="row-peer__rank">#{i + 1}</span>
              <span className="row-peer__id">{p.id}</span>
              <span className="row-peer__bar">
                <motion.span
                  className="row-peer__fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${p.rep * 100}%` }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.9, ease: 'easeOut' }}
                />
              </span>
              <span className="row-peer__rep">{p.rep.toFixed(2)}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <ActivityStrip />
    </div>
  );
}

function CinematicMesh() {
  const [t, setT] = useState(0);
  useAnimationFrame((time) => setT(time / 1000));
  const x1 = 25 + Math.sin(t * 0.55) * 10;
  const y1 = 40 + Math.cos(t * 0.45) * 12;
  const x2 = 72 + Math.cos(t * 0.4) * 12;
  const y2 = 60 + Math.sin(t * 0.7) * 10;
  return (
    <div className="ch2__mesh" aria-hidden>
      <span className="ch2__blob ch2__blob--a" style={{ left: `${x1}%`, top: `${y1}%` }} />
      <span className="ch2__blob ch2__blob--b" style={{ left: `${x2}%`, top: `${y2}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points, 1);
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * 60},${24 - (p / max) * 18}`)
    .join(' ');
  return (
    <svg viewBox="0 0 60 24" className="kpi__spark">
      <motion.polyline
        points={path}
        fill="none"
        stroke="var(--wp-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
    </svg>
  );
}

function ActivityStrip({ globe = false }: { globe?: boolean }) {
  const events = globe ? GLOBE_EVENTS : EVENTS;
  return (
    <div className="strip">
      <div className="strip__head">
        <span className="strip__eyebrow">
          <AlertTriangle size={10} /> Live activity
        </span>
        <span className="strip__live">
          <span className="strip__live-dot" /> streaming
        </span>
      </div>
      <div className="strip__rows">
        {events.map((e, i) => (
          <motion.div
            key={i}
            className={`strip__row strip__row--${e.kind}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.06, duration: 0.4 }}
          >
            <span className="strip__t">{e.t}</span>
            <span className="strip__k">{e.kind}</span>
            <span className="strip__m">{e.msg}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const EVENTS = [
  { t: '22:14:08', kind: 'send', msg: 'alex@acme → peer-pool-A · delivered' },
  { t: '22:14:07', kind: 'reply', msg: 'peer-pool-B replied · +rep 0.84' },
  { t: '22:14:05', kind: 'signup', msg: 'new user · vendio.io' },
  { t: '22:14:01', kind: 'warn', msg: 'mailbox-#481 SMTP timeout · retry' },
  { t: '22:13:58', kind: 'send', msg: 'pri@northwind → peer-pool-C' },
];

const GLOBE_EVENTS = [
  { t: '22:14:08', kind: 'connect', msg: '🇯🇵 new mailbox in Tokyo' },
  { t: '22:14:05', kind: 'send', msg: '🇩🇪 peer-pool-B sent 32 warmup msgs' },
  { t: '22:14:01', kind: 'reply', msg: '🇺🇸 peer-pool-A replied · +rep 0.91' },
  { t: '22:13:55', kind: 'signup', msg: '🇮🇳 new workspace · bengaluru' },
  { t: '22:13:52', kind: 'connect', msg: '🇧🇷 new peer in São Paulo' },
];

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'pulse-radar',
    name: 'Pulse Radar',
    tagline: 'Sonar sweep at the centerpiece — peer-network health is the headline.',
    bullets: [
      'Rotating radar sweep with concentric glow rings + pulsing peer dots',
      '4 KPI tiles on top · Top peers (by reputation) sidebar',
      'Live activity strip at the bottom',
      'Best when the warmup peer network is the platform-defining metric',
    ],
    icon: Radar,
    Full: FullPulseRadar,
  },
  {
    code: 'live-telemetry',
    name: 'Live Telemetry',
    tagline: 'Charts everywhere — drawing line, filling donut, rising bars.',
    bullets: [
      'KPIs each carry their own animated sparkline',
      'Hero line chart draws itself across last-24h sends',
      'Donut fills to 86% · 7-day bars rise staggered',
      'Best for data-heavy admins who want every metric visible at once',
    ],
    icon: TrendingUp,
    Full: FullLiveTelemetry,
  },
  {
    code: 'network-globe',
    name: 'Network Globe',
    tagline: 'Dotted globe with flying peer arcs + regional breakdown.',
    bullets: [
      'Dotted globe with glow halo + animated peer-to-peer arcs',
      'Pulsing rings on every hub dot',
      'Regional breakdown bars (NA / EU / APAC / LATAM) on the right',
      'Localized activity feed with country flags',
    ],
    icon: Globe2,
    Full: FullNetworkGlobe,
  },
  {
    code: 'cinematic-hub',
    name: 'Cinematic Hub',
    tagline: 'Drifting mesh gradient + big counter + stagger reveal.',
    bullets: [
      'Living gradient blobs drifting in the hero',
      'Massive counter ticks 0 → 94.2% on entry',
      'Glass KPI tiles stagger in + lift on hover',
      'Premium / marketing-grade admin home',
    ],
    icon: Zap,
    Full: FullCinematicHub,
  },
];
