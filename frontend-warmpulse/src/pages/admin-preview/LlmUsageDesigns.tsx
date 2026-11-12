import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Filter,
  Gauge,
  LineChart,
  Settings,
  Sparkles,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import './llm-usage-designs.css';

/**
 * /admin/llm-usage design picker.
 */
export function LlmUsageDesigns() {
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
    <div className="lud">
      <div className="lud__atmosphere" aria-hidden>
        <div className="lud__aurora-1" />
        <div className="lud__aurora-2" />
      </div>

      <header className="lud__head">
        <Link to="/admin/llm-usage" className="lud__back">
          ← Back to live LLM usage
        </Link>
        <div className="lud__head-row">
          <div>
            <span className="lud__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick an LLM-usage design
            </span>
            <h1 className="lud__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="lud__sub">{design.tagline}</p>
          </div>
          <div className="lud__counter">
            <span className="lud__counter-now">{index + 1}</span>
            <span className="lud__counter-sep">/</span>
            <span className="lud__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="lud__stage">
        <button type="button" className="lud__arrow" onClick={() => go(-1)} aria-label="Previous">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="lud__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="lud__slide"
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
        <button type="button" className="lud__arrow" onClick={() => go(1)} aria-label="Next">
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="lud__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`lud__dot ${i === index ? 'lud__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="lud__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="lud__bullets-row">
        <ul className="lud__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`lud__pick ${isPicked ? 'lud__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="lud__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build llm-{picked}</code> and I'll wire it up against /admin/llm-usage.
        </div>
      ) : (
        <div className="lud__hint">← / → keys · click arrows · drag the slide · tap a dot</div>
      )}
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'spend-cockpit' | 'cap-manager' | 'cost-flow' | 'activity-pulse';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Gauge;
  Full: () => JSX.Element;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const TOP_CLIENTS = [
  { email: 'alex@acme.co',        ws: 'Acme',       plan: 'Scale',   cost30d: 312.48, tokens: 4_180_000, hue: 260 },
  { email: 'tk@beacon.app',       ws: 'Beacon',     plan: 'Scale',   cost30d: 248.10, tokens: 3_205_000, hue: 140 },
  { email: 'priya@northwind.io',  ws: 'Northwind',  plan: 'Growth',  cost30d: 182.92, tokens: 2_640_000, hue: 320 },
  { email: 'mei@hibou.co',        ws: 'Hibou',      plan: 'Scale',   cost30d: 164.30, tokens: 2_180_000, hue: 220 },
  { email: 'sofia@vendio.io',     ws: 'Vendio',     plan: 'Growth',  cost30d: 132.74, tokens: 1_740_000, hue: 30 },
  { email: 'el@oxenstudio.com',   ws: 'Oxen',       plan: 'Growth',  cost30d: 108.05, tokens: 1_410_000, hue: 160 },
  { email: 'marcus@lumenlabs.dev',ws: 'Lumen Labs', plan: 'Starter', cost30d: 28.50,  tokens: 380_000,   hue: 200 },
];

const MODES = [
  { mode: 'A', label: 'A · Subject + body',  cost: 412.84, share: 38, color: 'var(--wp-accent)' },
  { mode: 'B', label: 'B · Reply',           cost: 318.21, share: 29, color: '#FF8A4B' },
  { mode: 'C', label: 'C · Spam-rescue',     cost: 198.40, share: 18, color: '#f472b6' },
  { mode: 'D', label: 'D · Variation',       cost: 160.75, share: 15, color: '#fbbf24' },
];

const PLANS = [
  { plan: 'Scale',   cap: 5_000_000, used: 4_180_000, color: 'var(--wp-accent)' },
  { plan: 'Growth',  cap: 1_500_000, used: 1_140_000, color: '#FF8A4B' },
  { plan: 'Starter', cap: 250_000,   used: 88_000,    color: '#f472b6' },
  { plan: 'Trial',   cap: 50_000,    used: 12_400,    color: '#fbbf24' },
];

const SPEND_SERIES = [
  18, 22, 28, 26, 30, 34, 38, 42, 36, 44, 48, 52, 56, 60,
  58, 64, 68, 72, 78, 82, 88, 94, 92, 96, 102, 108, 114, 122, 128, 136,
];

// Calendar heatmap: 7 weeks × 7 days = 49 cells. Higher index = more recent.
const CAL_HEATMAP = Array.from({ length: 49 }, (_, i) => {
  const recencyBoost = (i / 49) * 0.6;
  const noise = Math.sin(i * 0.7) * 0.25 + Math.random() * 0.25;
  return Math.max(0, Math.min(1, 0.25 + recencyBoost + noise));
});

function Avatar({ hue, label }: { hue: number; label: string }) {
  return (
    <span
      className="lc-avatar"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 56%), hsl(${hue + 40} 65% 48%))` }}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ===========================================================================
// 1) SPEND COCKPIT — multi-chart LLM dashboard
// ===========================================================================
function FullSpendCockpit() {
  return (
    <div className="page page--cockpit">
      <div className="page__topbar">
        <div className="page__crumb">Admin · LLM usage · Cockpit</div>
        <div className="page__count">
          <Gauge size={11} strokeWidth={2.4} />
          spend · 30-day window
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">LLM spend cockpit</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 30 days <ChevronDown size={11} /></button>
          <button className="btn btn--ghost"><Filter size={12} />By provider</button>
          <button className="btn btn--solid">Export</button>
        </div>
      </div>

      <div className="sp-strip">
        {[
          { label: 'Today', value: '$26.40', delta: '+12%' },
          { label: 'MTD', value: '$1,090.20', delta: '+8%' },
          { label: 'Forecast EOM', value: '$1,418.00', delta: '+18%' },
          { label: 'Token volume', value: '14.3M', delta: '+11%' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="sp-stat"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.04 }}
          >
            <span className="sp-stat__label">{s.label}</span>
            <span className="sp-stat__num">{s.value}</span>
            <span className="sp-stat__delta">
              <TrendingUp size={10} />{s.delta}
            </span>
          </motion.div>
        ))}
      </div>

      <div className="sp-grid">
        {/* Big spend area chart */}
        <div className="sp-card sp-card--big">
          <div className="sp-card__head">
            <span className="lud__eyebrow"><LineChart size={11} />Spend · 30 days</span>
            <span className="lud__pill lud__pill--ok">+18%</span>
          </div>
          <svg viewBox="0 0 480 160" preserveAspectRatio="none" className="sp-card__chart">
            <defs>
              <linearGradient id="sp-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.55" />
                <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {(() => {
              const max = Math.max(...SPEND_SERIES);
              const stepX = 480 / (SPEND_SERIES.length - 1);
              const pts = SPEND_SERIES.map((v, i) => `${i * stepX},${160 - (v / max) * 140 - 8}`).join(' ');
              const area = `0,160 ${pts} ${(SPEND_SERIES.length - 1) * stepX},160`;
              return (
                <>
                  <motion.polygon
                    points={area}
                    fill="url(#sp-fill)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.9 }}
                  />
                  <motion.polyline
                    points={pts}
                    fill="none"
                    stroke="var(--wp-accent)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.6, ease: 'easeOut' }}
                  />
                </>
              );
            })()}
          </svg>
        </div>

        {/* Modes donut */}
        <div className="sp-card">
          <div className="sp-card__head">
            <span className="lud__eyebrow"><Workflow size={11} />By mode</span>
          </div>
          <div className="sp-donut">
            <svg viewBox="0 0 60 60">
              {(() => {
                const r = 22;
                const c = 2 * Math.PI * r;
                let offset = 0;
                return MODES.map((m, i) => {
                  const len = (m.share / 100) * c;
                  const el = (
                    <motion.circle
                      key={i}
                      cx="30" cy="30" r={r}
                      stroke={m.color} strokeWidth="8" fill="none"
                      strokeDasharray={`${len} ${c - len}`}
                      strokeDashoffset={-offset}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.45, delay: 0.1 + i * 0.12 }}
                      style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                    />
                  );
                  offset += len;
                  return el;
                });
              })()}
            </svg>
            <div className="sp-donut__center">
              <span className="sp-donut__num">$1.09k</span>
              <span className="sp-donut__label">spend MTD</span>
            </div>
          </div>
          <div className="sp-legend">
            {MODES.map((m) => (
              <span key={m.mode}>
                <span className="sp-sw" style={{ background: m.color }} />
                {m.mode} {m.share}%
              </span>
            ))}
          </div>
        </div>

        {/* Top clients */}
        <div className="sp-card sp-card--wide">
          <div className="sp-card__head">
            <span className="lud__eyebrow"><Award size={11} />Top clients · 30d</span>
            <span className="lud__pill">{TOP_CLIENTS.length} workspaces</span>
          </div>
          <div className="sp-clients">
            {TOP_CLIENTS.slice(0, 6).map((c, i) => (
              <motion.div
                key={c.email}
                className="sp-client"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
              >
                <span className="sp-client__rank">#{i + 1}</span>
                <Avatar hue={c.hue} label={c.ws} />
                <div className="sp-client__id">
                  <div className="sp-client__ws">{c.ws}</div>
                  <div className="sp-client__email">{c.email}</div>
                </div>
                <span className={`u-plan u-plan--${c.plan.toLowerCase()}`}>{c.plan}</span>
                <span className="sp-client__bar">
                  <motion.span
                    className="sp-client__fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${(c.cost30d / 312.48) * 100}%` }}
                    transition={{ duration: 0.9, delay: 0.3 + i * 0.05 }}
                  />
                </span>
                <span className="sp-client__cost">${c.cost30d.toFixed(2)}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 2) CAP MANAGER — plan-tier caps with utilization gauges
// ===========================================================================
function FullCapManager() {
  return (
    <div className="page page--caps">
      <div className="page__topbar">
        <div className="page__crumb">Admin · LLM usage · Caps</div>
        <div className="page__count">
          <Settings size={11} strokeWidth={2.4} />
          token caps per plan · current cycle
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Cap manager</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">By plan <ChevronDown size={11} /></button>
          <button className="btn btn--solid">Edit caps</button>
        </div>
      </div>

      <div className="cap-grid">
        {PLANS.map((p, i) => {
          const pct = Math.round((p.used / p.cap) * 100);
          const remaining = p.cap - p.used;
          const tone = pct > 90 ? 'err' : pct > 70 ? 'warn' : 'ok';
          return (
            <motion.div
              key={p.plan}
              className={`cap-card cap-card--${tone}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06 }}
              style={{ ['--cap-tone' as string]: p.color }}
            >
              <div className="cap-card__h">
                <span className="cap-card__plan">{p.plan}</span>
                <span className={`cap-card__pct cap-card__pct--${tone}`}>{pct}%</span>
              </div>
              <div className="cap-card__gauge">
                <svg viewBox="0 0 100 60">
                  <path
                    d="M 8,52 A 42,42 0 0 1 92,52"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  <motion.path
                    d="M 8,52 A 42,42 0 0 1 92,52"
                    fill="none"
                    stroke={p.color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: pct / 100 }}
                    transition={{ duration: 1.2, delay: 0.3 + i * 0.06, ease: 'easeOut' }}
                  />
                </svg>
                <div className="cap-card__center">
                  <span className="cap-card__num">{abbrev(p.used)}</span>
                  <span className="cap-card__sub">of {abbrev(p.cap)} tokens</span>
                </div>
              </div>
              <div className="cap-card__foot">
                <span>Remaining</span>
                <strong>{abbrev(remaining)}</strong>
              </div>
              {tone !== 'ok' && (
                <div className="cap-card__alert">
                  <AlertTriangle size={11} />
                  {tone === 'err' ? 'Nearing cap — alert ops' : 'Above 70% — review usage'}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="cap-list">
        <div className="cap-list__head">
          <span>Plan</span>
          <span>Workspace</span>
          <span className="cap-list__num">Tokens</span>
          <span className="cap-list__num">% of plan cap</span>
          <span />
        </div>
        {TOP_CLIENTS.map((c, i) => {
          const planCap = PLANS.find((p) => p.plan === c.plan)?.cap ?? 1;
          const pct = Math.round((c.tokens / planCap) * 100);
          return (
            <motion.div
              key={c.email}
              className="cap-list__row"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.04 }}
            >
              <span className={`u-plan u-plan--${c.plan.toLowerCase()}`}>{c.plan}</span>
              <span className="cap-list__ws">
                <Avatar hue={c.hue} label={c.ws} />
                <span className="cap-list__email">{c.email}</span>
              </span>
              <span className="cap-list__num">{abbrev(c.tokens)}</span>
              <span className="cap-list__num">
                <span className={`cap-list__pct cap-list__pct--${pct > 90 ? 'err' : pct > 70 ? 'warn' : 'ok'}`}>
                  {pct}%
                </span>
              </span>
              <button className="cap-list__action">Adjust</button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// 3) COST FLOW — Sankey-style provider → mode → top client
// ===========================================================================
function FullCostFlow() {
  const providers = [
    { id: 'gemini', label: 'Gemini', share: 64, color: '#FF8A4B' },
    { id: 'claude', label: 'Claude', share: 32, color: '#f472b6' },
    { id: 'static', label: 'Static',  share: 4,  color: 'rgba(255,255,255,0.4)' },
  ];
  return (
    <div className="page page--flow">
      <div className="page__topbar">
        <div className="page__crumb">Admin · LLM usage · Flow</div>
        <div className="page__count">
          <Workflow size={11} strokeWidth={2.4} />
          provider → mode → client · cost attribution
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Cost attribution</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 30 days <ChevronDown size={11} /></button>
        </div>
      </div>

      <div className="cf">
        <div className="cf__col">
          <div className="cf__col-h">Provider</div>
          {providers.map((p) => (
            <div className="cf__node cf__node--provider" key={p.id}
              style={{ ['--cf-tone' as string]: p.color }}>
              <span className="cf__node-bar" />
              <div>
                <div className="cf__node-name">{p.label}</div>
                <div className="cf__node-sub">{p.share}% of spend</div>
              </div>
            </div>
          ))}
        </div>
        <svg className="cf__svg" viewBox="0 0 320 360" preserveAspectRatio="none">
          <defs>
            {providers.map((p) => (
              <linearGradient key={p.id} id={`cf-grad-${p.id}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={p.color} stopOpacity="0.2" />
                <stop offset="1" stopColor={p.color} stopOpacity="0.55" />
              </linearGradient>
            ))}
          </defs>
          {providers.map((p, pi) =>
            MODES.map((m, mi) => {
              const y1 = 32 + pi * 110;
              const y2 = 28 + mi * 80;
              const thickness = Math.max(2, (p.share / 100) * (m.share / 100) * 80);
              return (
                <motion.path
                  key={`${p.id}-${m.mode}`}
                  d={`M 0,${y1} C 160,${y1} 160,${y2} 320,${y2}`}
                  stroke={`url(#cf-grad-${p.id})`}
                  strokeWidth={thickness}
                  fill="none"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.4, delay: 0.1 + (pi * 4 + mi) * 0.04, ease: 'easeOut' }}
                />
              );
            }),
          )}
        </svg>
        <div className="cf__col">
          <div className="cf__col-h">Mode</div>
          {MODES.map((m) => (
            <div className="cf__node cf__node--mode" key={m.mode}
              style={{ ['--cf-tone' as string]: m.color }}>
              <span className="cf__node-bar" />
              <div>
                <div className="cf__node-name">{m.label}</div>
                <div className="cf__node-sub">${m.cost.toFixed(0)} · {m.share}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="cf-summary">
        {[
          { label: 'Total spend MTD', value: '$1,090.20', icon: CreditCard },
          { label: 'Provider mix', value: '64/32/4', icon: Workflow },
          { label: 'Cheapest mode', value: 'D · $0.11/k', icon: Award },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="cf-summary__card"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.06 }}
          >
            <s.icon size={12} strokeWidth={2.4} />
            <div>
              <div className="cf-summary__label">{s.label}</div>
              <div className="cf-summary__value">{s.value}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 4) ACTIVITY PULSE — GitHub-style calendar heatmap + top spikes
// ===========================================================================
function FullActivityPulse() {
  return (
    <div className="page page--pulse">
      <div className="page__topbar">
        <div className="page__crumb">Admin · LLM usage · Pulse</div>
        <div className="page__count">
          <CalendarDays size={11} strokeWidth={2.4} />
          7 weeks · spend heatmap
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Activity pulse</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 7 weeks <ChevronDown size={11} /></button>
          <button className="btn btn--solid">Export</button>
        </div>
      </div>

      <div className="ap-summary">
        {[
          { label: 'Peak day', value: 'Wed', sub: '$92.40' },
          { label: 'Quiet day', value: 'Sun', sub: '$8.20' },
          { label: 'Hot streak', value: '11 days', sub: 'spend above avg' },
          { label: 'Avg / day', value: '$36.34', sub: 'rolling 30d' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="ap-stat"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.04 }}
          >
            <span className="ap-stat__label">{s.label}</span>
            <span className="ap-stat__num">{s.value}</span>
            <span className="ap-stat__sub">{s.sub}</span>
          </motion.div>
        ))}
      </div>

      <div className="ap-heatmap">
        <div className="ap-heatmap__h">
          <span className="lud__eyebrow"><CalendarDays size={11} />Daily spend · last 7 weeks</span>
          <div className="ap-legend">
            <span>less</span>
            {[0.15, 0.35, 0.55, 0.75, 0.95].map((v, i) => (
              <span
                key={i}
                className="ap-legend__cell"
                style={{ background: `color-mix(in srgb, var(--wp-accent) ${v * 100}%, transparent)` }}
              />
            ))}
            <span>more</span>
          </div>
        </div>
        <div className="ap-cells">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => (
            <div key={d} className="ap-day">{d}</div>
          ))}
          {CAL_HEATMAP.map((v, i) => (
            <motion.span
              key={i}
              className="ap-cell"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.03 * i, duration: 0.3, ease: 'backOut' }}
              style={{
                background: v < 0.1
                  ? 'rgba(255,255,255,0.04)'
                  : `color-mix(in srgb, var(--wp-accent) ${Math.round(v * 100)}%, transparent)`,
              }}
              title={`Day ${i + 1}: ${(v * 100).toFixed(0)}% of peak`}
            />
          ))}
        </div>
      </div>

      <div className="ap-bottom">
        <div className="ap-card">
          <div className="ap-card__h">
            <span className="lud__eyebrow"><Zap size={11} />Top spikes</span>
          </div>
          {[
            { day: 'Wed · May 7', amount: '$92.40', delta: '+184% vs avg' },
            { day: 'Wed · Apr 30', amount: '$78.10', delta: '+141% vs avg' },
            { day: 'Tue · May 6', amount: '$68.20', delta: '+109% vs avg' },
          ].map((s, i) => (
            <motion.div
              key={s.day}
              className="ap-spike"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.06 }}
            >
              <span className="ap-spike__day">{s.day}</span>
              <span className="ap-spike__amount">{s.amount}</span>
              <span className="ap-spike__delta">{s.delta}</span>
            </motion.div>
          ))}
        </div>
        <div className="ap-card">
          <div className="ap-card__h">
            <span className="lud__eyebrow"><Activity size={11} />Hour-of-day load</span>
          </div>
          <div className="ap-hours">
            {Array.from({ length: 24 }, (_, i) => {
              const v = 0.3 + Math.sin((i - 9) / 4) * 0.4 + (i >= 9 && i <= 17 ? 0.2 : -0.1);
              return (
                <motion.span
                  key={i}
                  className="ap-hour"
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(8, v * 100)}%` }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.02, ease: 'easeOut' }}
                  title={`${i}:00 — ${(v * 100).toFixed(0)}%`}
                />
              );
            })}
          </div>
          <div className="ap-hours__x">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function abbrev(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'spend-cockpit',
    name: 'Spend Cockpit',
    tagline: 'Multi-chart LLM dashboard — spend trend, by-mode donut, top clients.',
    bullets: [
      'KPI strip (Today / MTD / Forecast EOM / Token volume)',
      'Big animated spend area chart spans 2 cols',
      'By-mode donut (A · B · C · D) with brand-tinted slices',
      'Animated top-clients leaderboard with cost bars',
    ],
    icon: Gauge,
    Full: FullSpendCockpit,
  },
  {
    code: 'cap-manager',
    name: 'Cap Manager',
    tagline: 'Plan-tier token caps as half-circle gauges — utilization at a glance.',
    bullets: [
      '4 plan cards with animated semi-circle gauges (Scale / Growth / Starter / Trial)',
      'Tone-coded ok/warn/err based on % of cap consumed',
      'Inline alert chips when a plan is above 70% / 90%',
      'Per-workspace cap table at the bottom with adjust action',
    ],
    icon: Settings,
    Full: FullCapManager,
  },
  {
    code: 'cost-flow',
    name: 'Cost Flow',
    tagline: 'Sankey: provider → mode flow with thickness = spend.',
    bullets: [
      'Providers on the left (Gemini / Claude / Static)',
      'Modes on the right (A · B · C · D) tinted by share',
      'Animated curved bands between them, thickness = cost share',
      'Bottom summary cards for total spend / mix / cheapest mode',
    ],
    icon: Workflow,
    Full: FullCostFlow,
  },
  {
    code: 'activity-pulse',
    name: 'Activity Pulse',
    tagline: 'GitHub-style calendar heatmap + hour-of-day load.',
    bullets: [
      '7-week × 7-day spend heatmap, color intensity = $ that day',
      'Peak / quiet / hot-streak / daily-avg summary tiles',
      'Top spikes panel + hour-of-day load bars',
      'Best when you want to spot anomalies and time-of-day patterns',
    ],
    icon: CalendarDays,
    Full: FullActivityPulse,
  },
];
