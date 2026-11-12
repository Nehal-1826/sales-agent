import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  ChevronsDown,
  Filter,
  Gauge,
  Globe,
  LineChart,
  Mail,
  Newspaper,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import './platform-analytics-designs.css';

/**
 * /admin/platform-analytics design picker — 4 directions.
 */
export function PlatformAnalyticsDesigns() {
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
    <div className="pad">
      <div className="pad__atmosphere" aria-hidden>
        <div className="pad__aurora-1" />
        <div className="pad__aurora-2" />
      </div>

      <header className="pad__head">
        <Link to="/admin/platform-analytics" className="pad__back">
          ← Back to live platform analytics
        </Link>
        <div className="pad__head-row">
          <div>
            <span className="pad__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick a Platform-analytics design
            </span>
            <h1 className="pad__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="pad__sub">{design.tagline}</p>
          </div>
          <div className="pad__counter">
            <span className="pad__counter-now">{index + 1}</span>
            <span className="pad__counter-sep">/</span>
            <span className="pad__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="pad__stage">
        <button type="button" className="pad__arrow" onClick={() => go(-1)} aria-label="Previous">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="pad__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="pad__slide"
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
        <button type="button" className="pad__arrow" onClick={() => go(1)} aria-label="Next">
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="pad__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`pad__dot ${i === index ? 'pad__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="pad__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="pad__bullets-row">
        <ul className="pad__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`pad__pick ${isPicked ? 'pad__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="pad__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build analytics-{picked}</code> and I'll wire it up against /admin/platform-analytics.
        </div>
      ) : (
        <div className="pad__hint">← / → keys · click arrows · drag the slide · tap a dot</div>
      )}
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'executive-brief' | 'multi-chart-cockpit' | 'period-comparison' | 'funnel-cohort';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Newspaper;
  Full: () => JSX.Element;
}

// ===========================================================================
// 1) EXECUTIVE BRIEF — newspaper-style hero + chart strip + insight callouts
// ===========================================================================
function FullExecutiveBrief() {
  return (
    <div className="page page--brief">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Platform analytics · Brief</div>
        <div className="page__count">
          <Newspaper size={11} strokeWidth={2.4} />
          generated 4 minutes ago · WTD report
        </div>
      </div>

      <div className="brief__masthead">
        <span className="brief__date">FRIDAY · MAY 13, 2026</span>
        <h1 className="brief__title">Platform performance</h1>
        <p className="brief__lede">
          Volume up <strong className="brief__pos">+18%</strong> week-over-week.{' '}
          New signups concentrated in <strong>Growth</strong>; <strong>peer pool A</strong> is
          carrying 64% of delivered traffic.
        </p>
      </div>

      <div className="brief__hero">
        <div className="brief__hero-stat">
          <span className="brief__hero-label">Sends · 7d</span>
          <span className="brief__hero-num">38,412</span>
          <span className="brief__hero-delta brief__hero-delta--up">
            <TrendingUp size={12} />+18% vs prev wk
          </span>
        </div>
        <svg viewBox="0 0 360 90" preserveAspectRatio="none" className="brief__hero-chart">
          <defs>
            <linearGradient id="brief-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.55" />
              <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.polygon
            points="0,70 40,62 80,58 120,46 160,52 200,38 240,44 280,28 320,32 360,18 360,90 0,90"
            fill="url(#brief-fill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.3 }}
          />
          <motion.polyline
            points="0,70 40,62 80,58 120,46 160,52 200,38 240,44 280,28 320,32 360,18"
            fill="none"
            stroke="var(--wp-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
          />
        </svg>
      </div>

      <div className="brief__strip">
        {[
          { label: 'Signups', value: 34, delta: '+12', up: true },
          { label: 'Active wkspaces', value: 218, delta: '+8', up: true },
          { label: 'MRR', value: '$24.1k', delta: '+6.4%', up: true },
          { label: 'Avg warmth', value: '0.86', delta: '+0.02', up: true },
        ].map((s) => (
          <div className="brief-stat" key={s.label}>
            <span className="brief-stat__label">{s.label}</span>
            <span className="brief-stat__num">{s.value}</span>
            <span className={`brief-stat__delta brief-stat__delta--${s.up ? 'up' : 'down'}`}>
              {s.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{s.delta}
            </span>
          </div>
        ))}
      </div>

      <div className="brief__columns">
        <article className="brief__story">
          <span className="brief__kicker">PEER NETWORK</span>
          <h3 className="brief__story-h">Pool A absorbs the spike</h3>
          <p>
            Pool A handled 24,580 sends in the last 7 days — 64% of total platform volume —
            with median reputation rising from 0.83 to 0.91. Pool B held steady; pool C trended
            down (−4 reputation points) as 3 peers entered warm-up.
          </p>
        </article>
        <article className="brief__story">
          <span className="brief__kicker">REVENUE</span>
          <h3 className="brief__story-h">Growth plan now 44% of MRR</h3>
          <p>
            The Growth tier overtook Scale this week. 5 workspaces upgraded from Starter; 2 from
            Growth to Scale. One churn event ($89/mo).
          </p>
        </article>
        <article className="brief__story">
          <span className="brief__kicker">RELIABILITY</span>
          <h3 className="brief__story-h">SMTP retry rate down 31%</h3>
          <p>
            After last week's peer-rotation tweak, transient SMTP errors dropped from 4.1% to
            2.8% of sends. Bounce rate stable at 0.6%.
          </p>
        </article>
      </div>
    </div>
  );
}

// ===========================================================================
// 2) MULTI-CHART COCKPIT — dense grid of varied chart types
// ===========================================================================
function FullCockpit() {
  return (
    <div className="page page--cockpit">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Platform analytics · Cockpit</div>
        <div className="page__count">
          <Gauge size={11} strokeWidth={2.4} />
          6 panels · 30-day window
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Cockpit view</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 30 days <ChevronDown size={11} /></button>
          <button className="btn btn--ghost"><Filter size={12} />Filters</button>
          <button className="btn btn--solid">Export</button>
        </div>
      </div>

      <div className="cockpit">
        {/* Send volume area chart */}
        <div className="ck ck--big">
          <div className="ck__head">
            <span className="pad__eyebrow"><LineChart size={11} />Send volume · 30 days</span>
            <span className="pad__pill pad__pill--ok">+18%</span>
          </div>
          <svg className="ck__chart" viewBox="0 0 480 140" preserveAspectRatio="none">
            <defs>
              <linearGradient id="ck-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.5" />
                <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.polygon
              points="0,110 32,100 64,104 96,86 128,90 160,72 192,76 224,58 256,62 288,46 320,50 352,32 384,38 416,22 448,26 480,12 480,140 0,140"
              fill="url(#ck-fill)"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9 }}
            />
            <motion.polyline
              points="0,110 32,100 64,104 96,86 128,90 160,72 192,76 224,58 256,62 288,46 320,50 352,32 384,38 416,22 448,26 480,12"
              fill="none" stroke="var(--wp-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8, ease: 'easeOut' }}
            />
          </svg>
        </div>

        {/* Donut: plan mix */}
        <div className="ck">
          <div className="ck__head"><span className="pad__eyebrow">Plan mix</span></div>
          <div className="ck__donut">
            <svg viewBox="0 0 60 60">
              {(() => {
                const slices = [
                  { pct: 44, color: '#FF8A4B' },
                  { pct: 24, color: '#f472b6' },
                  { pct: 22, color: 'var(--wp-accent)' },
                  { pct: 10, color: '#fbbf24' },
                ];
                let offset = 0;
                const r = 22;
                const c = 2 * Math.PI * r;
                return slices.map((s, i) => {
                  const len = (s.pct / 100) * c;
                  const el = (
                    <motion.circle
                      key={i}
                      cx="30" cy="30" r={r}
                      stroke={s.color} strokeWidth="8" fill="none"
                      strokeDasharray={`${len} ${c - len}`}
                      strokeDashoffset={-offset}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ duration: 0.5, delay: i * 0.15 }}
                      style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                    />
                  );
                  offset += len;
                  return el;
                });
              })()}
            </svg>
            <div className="ck__donut-center">
              <span className="ck__donut-num">218</span>
              <span className="ck__donut-label">workspaces</span>
            </div>
          </div>
          <div className="ck__legend">
            <span><span className="ck__sw" style={{ background: '#FF8A4B' }} />Growth 44%</span>
            <span><span className="ck__sw" style={{ background: '#f472b6' }} />Starter 24%</span>
            <span><span className="ck__sw" style={{ background: 'var(--wp-accent)' }} />Scale 22%</span>
            <span><span className="ck__sw" style={{ background: '#fbbf24' }} />Trial 10%</span>
          </div>
        </div>

        {/* Bars: signups by day */}
        <div className="ck">
          <div className="ck__head">
            <span className="pad__eyebrow"><Users size={11} />Signups · 14d</span>
          </div>
          <div className="ck__bars">
            {[3, 4, 6, 5, 8, 7, 9, 6, 8, 10, 9, 12, 14, 16].map((v, i) => (
              <motion.span
                key={i} className="ck__bar"
                initial={{ height: 0 }} animate={{ height: `${(v / 16) * 100}%` }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.04, ease: 'easeOut' }}
              />
            ))}
          </div>
        </div>

        {/* Warmth histogram */}
        <div className="ck ck--wide">
          <div className="ck__head">
            <span className="pad__eyebrow">Mailbox warmth distribution</span>
          </div>
          <div className="ck__hist">
            {[12, 28, 46, 84, 102, 78, 38, 22].map((v, i) => (
              <motion.span
                key={i} className="ck__hist-bar"
                initial={{ height: 0 }} animate={{ height: `${(v / 102) * 100}%` }}
                transition={{ duration: 0.6, delay: 0.3 + i * 0.05 }}
              />
            ))}
          </div>
          <div className="ck__hist-x">
            <span>0–10</span><span>10–20</span><span>20–30</span><span>30–40</span>
            <span>40–50</span><span>50–60</span><span>60–70</span><span>70+</span>
          </div>
        </div>

        {/* Geo dots (mini globe) */}
        <div className="ck">
          <div className="ck__head"><span className="pad__eyebrow"><Globe size={11} />Geo</span></div>
          <svg viewBox="0 0 200 100" className="ck__geo">
            <g stroke="rgba(255,255,255,0.15)" strokeDasharray="1 3" fill="none">
              <ellipse cx="100" cy="50" rx="80" ry="40" />
              <ellipse cx="100" cy="50" rx="80" ry="14" />
              <ellipse cx="100" cy="50" rx="36" ry="40" />
            </g>
            {[
              { x: 50, y: 36, label: 'NA' },
              { x: 100, y: 38, label: 'EU' },
              { x: 140, y: 50, label: 'APAC' },
              { x: 80, y: 70, label: 'LATAM' },
            ].map((d, i) => (
              <motion.g key={d.label}
                initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 + i * 0.1 }}
              >
                <circle cx={d.x} cy={d.y} r="4" fill="var(--wp-accent)" />
                <text x={d.x + 6} y={d.y + 3} fill="rgba(255,255,255,0.7)" fontSize="8">{d.label}</text>
              </motion.g>
            ))}
          </svg>
        </div>

        {/* MRR ring */}
        <div className="ck">
          <div className="ck__head"><span className="pad__eyebrow"><CreditCard size={11} />MRR</span></div>
          <div className="ck__ring" style={{
            background: 'conic-gradient(var(--wp-accent) 264deg, rgba(255,255,255,0.08) 0)',
          }}>
            <div className="ck__ring-inner">
              <span className="ck__ring-num">$24.1k</span>
              <span className="ck__ring-label">73% of target</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 3) PERIOD COMPARISON — this period vs previous, side-by-side
// ===========================================================================
function FullPeriodComparison() {
  return (
    <div className="page page--compare">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Platform analytics · Comparison</div>
        <div className="page__count">
          <TrendingUp size={11} strokeWidth={2.4} />
          this 30 days vs previous 30 days
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Period comparison</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 30 days <ChevronDown size={11} /></button>
          <button className="btn btn--ghost">vs Previous 30 days</button>
        </div>
      </div>

      <div className="cmp-grid">
        {[
          { label: 'Total sends', cur: '38,412', prev: '32,540', delta: '+18%', up: true },
          { label: 'Signups', cur: '142', prev: '108', delta: '+31%', up: true },
          { label: 'MRR', cur: '$24,108', prev: '$22,640', delta: '+6.4%', up: true },
          { label: 'Bounce rate', cur: '0.6%', prev: '0.9%', delta: '−33%', up: true },
          { label: 'Avg warmth', cur: '0.86', prev: '0.84', delta: '+0.02', up: true },
          { label: 'Churn', cur: '3', prev: '2', delta: '+1', up: false },
        ].map((c, i) => (
          <motion.div
            key={c.label}
            className="cmp-card"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.06 }}
          >
            <div className="cmp-card__h">{c.label}</div>
            <div className="cmp-card__row">
              <div className="cmp-card__cur">
                <span className="cmp-card__cur-num">{c.cur}</span>
                <span className="cmp-card__cur-label">this 30d</span>
              </div>
              <div className="cmp-card__arrow">
                <ArrowRight size={14} strokeWidth={2.4} />
              </div>
              <div className="cmp-card__prev">
                <span className="cmp-card__prev-num">{c.prev}</span>
                <span className="cmp-card__prev-label">prev 30d</span>
              </div>
            </div>
            <div className={`cmp-card__delta cmp-card__delta--${c.up ? 'up' : 'down'}`}>
              {c.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{c.delta}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="cmp-charts">
        <div className="cmp-chart">
          <div className="cmp-chart__h">
            <span className="pad__eyebrow">Send volume · overlay</span>
            <span className="cmp-chart__legend">
              <span><span className="cmp-chart__sw cmp-chart__sw--cur" /> current</span>
              <span><span className="cmp-chart__sw cmp-chart__sw--prev" /> previous</span>
            </span>
          </div>
          <svg viewBox="0 0 500 140" preserveAspectRatio="none" className="cmp-chart__svg">
            <motion.polyline
              points="0,108 50,98 100,104 150,82 200,90 250,68 300,76 350,52 400,58 450,38 500,28"
              fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"
              strokeDasharray="4 5" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5 }}
            />
            <motion.polyline
              points="0,118 50,114 100,108 150,98 200,102 250,86 300,90 350,74 400,80 450,68 500,62"
              fill="none" stroke="var(--wp-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8, ease: 'easeOut' }}
            />
          </svg>
        </div>

        <div className="cmp-chart">
          <div className="cmp-chart__h">
            <span className="pad__eyebrow">Plan mix · side-by-side</span>
          </div>
          <div className="cmp-stack">
            {[
              { plan: 'Growth', cur: 44, prev: 38, color: '#FF8A4B' },
              { plan: 'Starter', cur: 24, prev: 28, color: '#f472b6' },
              { plan: 'Scale', cur: 22, prev: 20, color: 'var(--wp-accent)' },
              { plan: 'Trial', cur: 10, prev: 14, color: '#fbbf24' },
            ].map((row, i) => (
              <div key={row.plan} className="cmp-stack__row">
                <span className="cmp-stack__plan">{row.plan}</span>
                <div className="cmp-stack__bars">
                  <span className="cmp-stack__bar cmp-stack__bar--cur" style={{ background: row.color }}>
                    <motion.span
                      className="cmp-stack__fill"
                      initial={{ width: 0 }} animate={{ width: `${row.cur}%` }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.06 }}
                      style={{ background: row.color }}
                    />
                  </span>
                  <span className="cmp-stack__bar cmp-stack__bar--prev">
                    <motion.span
                      className="cmp-stack__fill cmp-stack__fill--dim"
                      initial={{ width: 0 }} animate={{ width: `${row.prev}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.06 }}
                      style={{ background: row.color }}
                    />
                  </span>
                </div>
                <span className="cmp-stack__delta">{row.cur - row.prev >= 0 ? '+' : ''}{row.cur - row.prev}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 4) FUNNEL + COHORT — growth-style: signup funnel + cohort retention heatmap
// ===========================================================================
function FullFunnelCohort() {
  const stages = [
    { label: 'Visited', count: 4280, pct: 100 },
    { label: 'Signed up', count: 312, pct: 7.3 },
    { label: 'Connected mailbox', count: 218, pct: 5.1 },
    { label: 'Sent first batch', count: 184, pct: 4.3 },
    { label: 'Paying', count: 148, pct: 3.5 },
  ];
  const RETENTION = [
    { cohort: 'Apr w1', values: [100, 88, 72, 65, 58] },
    { cohort: 'Apr w2', values: [100, 84, 70, 62, 0] },
    { cohort: 'Apr w3', values: [100, 90, 78, 0, 0] },
    { cohort: 'Apr w4', values: [100, 86, 0, 0, 0] },
    { cohort: 'May w1', values: [100, 0, 0, 0, 0] },
  ];
  return (
    <div className="page page--fc">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Platform analytics · Funnel</div>
        <div className="page__count">
          <ChevronsDown size={11} strokeWidth={2.4} />
          last 30 days · conversion path
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Conversion + retention</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 30 days <ChevronDown size={11} /></button>
          <button className="btn btn--ghost">By plan</button>
        </div>
      </div>

      <div className="funnel">
        <div className="funnel__head">
          <span className="pad__eyebrow"><ChevronsDown size={11} />Acquisition funnel</span>
          <span className="funnel__hint">5 stages · last 30 days</span>
        </div>
        <div className="funnel__rows">
          {stages.map((s, i) => (
            <motion.div
              key={s.label}
              className="funnel__row"
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
            >
              <span className="funnel__rank">{i + 1}</span>
              <div className="funnel__bar-wrap">
                <motion.span
                  className="funnel__bar"
                  initial={{ width: 0 }} animate={{ width: `${s.pct}%` }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.08, ease: 'easeOut' }}
                  style={{
                    background: `linear-gradient(90deg, var(--wp-accent), color-mix(in srgb, var(--wp-accent) ${100 - i * 16}%, #FF8A4B))`,
                  }}
                />
                <span className="funnel__label">{s.label}</span>
                <span className="funnel__count">{s.count.toLocaleString()} · {s.pct.toFixed(1)}%</span>
              </div>
              {i > 0 && (
                <span className="funnel__drop">
                  −{(stages[i - 1]!.pct - s.pct).toFixed(1)}pp
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      <div className="fc-bottom">
        <div className="fc-card">
          <div className="fc-card__h">
            <span className="pad__eyebrow"><Award size={11} />Top performers · activated → paying</span>
          </div>
          {[
            { name: 'Acme', email: 'alex@acme.co', d: '4d 12h' },
            { name: 'Beacon', email: 'tk@beacon.app', d: '6d 03h' },
            { name: 'Hibou', email: 'mei@hibou.co', d: '7d 18h' },
            { name: 'Northwind', email: 'priya@northwind.io', d: '9d 06h' },
          ].map((t, i) => (
            <motion.div
              key={t.email}
              className="fc-perf"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.06 }}
            >
              <span className="fc-perf__rank">#{i + 1}</span>
              <div>
                <div className="fc-perf__name">{t.name}</div>
                <div className="fc-perf__email">{t.email}</div>
              </div>
              <div className="fc-perf__time">{t.d}</div>
            </motion.div>
          ))}
        </div>

        <div className="fc-card">
          <div className="fc-card__h">
            <span className="pad__eyebrow"><Mail size={11} />Cohort retention</span>
          </div>
          <div className="fc-retain">
            <div className="fc-retain__row fc-retain__row--head">
              <span>Cohort</span><span>W0</span><span>W1</span><span>W2</span><span>W3</span><span>W4</span>
            </div>
            {RETENTION.map((row, i) => (
              <motion.div
                key={row.cohort}
                className="fc-retain__row"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.05 }}
              >
                <span className="fc-retain__cohort">{row.cohort}</span>
                {row.values.map((v, j) => (
                  <span
                    key={j}
                    className="fc-retain__cell"
                    style={{
                      background: v === 0
                        ? 'transparent'
                        : `color-mix(in srgb, var(--wp-accent) ${v}%, transparent)`,
                      color: v > 50 ? '#fff' : v === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {v === 0 ? '—' : `${v}%`}
                  </span>
                ))}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'executive-brief',
    name: 'Executive Brief',
    tagline: 'Newspaper-style brief — masthead, hero chart, narrated stories.',
    bullets: [
      'Dated masthead + a lede paragraph that auto-narrates the week',
      'Big hero chart for the headline metric with delta pill',
      'Stat strip (Signups / Active / MRR / Warmth) underneath',
      'Three "story" columns — Peer network · Revenue · Reliability',
    ],
    icon: Newspaper,
    Full: FullExecutiveBrief,
  },
  {
    code: 'multi-chart-cockpit',
    name: 'Multi-Chart Cockpit',
    tagline: 'Dense 6-panel grid: area, donut, bars, histogram, geo, MRR ring.',
    bullets: [
      'Big send-volume area chart spans 2 columns',
      'Plan-mix donut with animated slices',
      '14-day signups bar chart + warmth distribution histogram',
      'Mini geo dots + MRR conic-ring with progress toward target',
    ],
    icon: Gauge,
    Full: FullCockpit,
  },
  {
    code: 'period-comparison',
    name: 'Period Comparison',
    tagline: 'This 30 days vs previous 30 days — side-by-side everywhere.',
    bullets: [
      '6 comparison cards (sends / signups / MRR / bounce / warmth / churn)',
      'Each card shows current → previous with delta pill',
      'Overlay line chart (current solid · previous dashed)',
      'Plan-mix split bars: current vs faded previous, with δ on the right',
    ],
    icon: TrendingUp,
    Full: FullPeriodComparison,
  },
  {
    code: 'funnel-cohort',
    name: 'Funnel + Cohort',
    tagline: 'Growth-style: acquisition funnel + cohort retention heatmap.',
    bullets: [
      'Animated horizontal funnel (Visited → Signed up → Mailbox → Batch → Paying)',
      'Drop-off pill per stage (in percentage points)',
      'Top-performers panel: fastest activated-to-paying conversions',
      'Cohort retention heatmap by week-since-signup',
    ],
    icon: ChevronsDown,
    Full: FullFunnelCohort,
  },
];
