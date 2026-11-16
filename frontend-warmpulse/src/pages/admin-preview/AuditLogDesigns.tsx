import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  Diff,
  Flame,
  Globe2,
  Search,
  ShieldAlert,
  Sparkles,
  UserCog,
} from 'lucide-react';
import './audit-log-designs.css';

export function AuditLogDesigns() {
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
    <div className="ald">
      <div className="ald__atmosphere" aria-hidden>
        <div className="ald__aurora-1" />
        <div className="ald__aurora-2" />
      </div>

      <header className="ald__head">
        <Link to="/admin/audit-log" className="ald__back">
          ← Back to live audit log
        </Link>
        <div className="ald__head-row">
          <div>
            <span className="ald__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick an Audit-Log design · round 2
            </span>
            <h1 className="ald__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="ald__sub">{design.tagline}</p>
          </div>
          <div className="ald__counter">
            <span className="ald__counter-now">{index + 1}</span>
            <span className="ald__counter-sep">/</span>
            <span className="ald__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="ald__stage">
        <button type="button" className="ald__arrow" onClick={() => go(-1)} aria-label="Previous">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="ald__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="ald__slide"
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
        <button type="button" className="ald__arrow" onClick={() => go(1)} aria-label="Next">
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="ald__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`ald__dot ${i === index ? 'ald__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="ald__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="ald__bullets-row">
        <ul className="ald__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`ald__pick ${isPicked ? 'ald__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="ald__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build audit-{picked}</code> and I'll wire it up at /admin/audit-log.
        </div>
      ) : (
        <div className="ald__hint">← / → keys · click arrows · drag the slide · tap a dot</div>
      )}
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'diff-viewer' | 'actor-profile' | 'risk-board' | 'geo-origin';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Diff;
  Full: () => JSX.Element;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface Actor {
  email: string;
  role: 'super_admin' | 'admin' | 'system';
  hue: number;
}
const ACTORS: Actor[] = [
  { email: 'admin@warmpulse.app', role: 'super_admin', hue: 260 },
  { email: 'ops@warmpulse.app',   role: 'admin',       hue: 200 },
  { email: 'system',              role: 'system',      hue: 0 },
];

function ActorAvatar({ actor, size = 28 }: { actor: Actor; size?: number }) {
  if (actor.role === 'system') {
    return (
      <span
        className="ald-avatar ald-avatar--system"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >⚙</span>
    );
  }
  return (
    <span
      className="ald-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${actor.hue} 70% 56%), hsl(${actor.hue + 40} 65% 48%))`,
      }}
    >
      {actor.email.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ===========================================================================
// 1) DIFF VIEWER — GitHub-style before/after for every event
// ===========================================================================

const DIFFS = [
  {
    id: 'evt_02',
    at: '2026-05-13 14:05:11',
    rel: '5 min ago',
    actor: ACTORS[1]!,
    action: 'plan.update',
    target: 'Growth · $79 → $89',
    kind: 'update' as const,
    before: {
      name: 'Growth',
      price_monthly_usd: 79,
      mailboxes_included: 5,
      max_mailboxes: 12,
      llm_token_cap: 1_200_000,
      features: ['Warmup engine', 'Default pool', 'LLM (Gemini)'],
    },
    after: {
      name: 'Growth',
      price_monthly_usd: 89,
      mailboxes_included: 5,
      max_mailboxes: 12,
      llm_token_cap: 1_500_000,
      features: ['Warmup engine', 'Default pool', 'LLM (Gemini)', 'LLM (Claude)'],
    },
  },
];

function FullDiffViewer() {
  const event = DIFFS[0]!;
  const beforeLines = JSON.stringify(event.before, null, 2).split('\n');
  const afterLines = JSON.stringify(event.after, null, 2).split('\n');
  return (
    <div className="page page--diff">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Audit log · Diff</div>
        <div className="page__count">
          <Diff size={11} strokeWidth={2.4} />
          before / after side-by-side
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Diff viewer</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Unified <ChevronDown size={11} /></button>
          <button className="btn btn--ghost">Copy patch</button>
          <button className="btn btn--solid">Open in detail</button>
        </div>
      </div>

      <div className="diff-head">
        <div className="diff-head__id">
          <span className={`atm-row__kind atm-row__kind--${event.kind}`}>{event.kind}</span>
          <span className="diff-head__action">{event.action}</span>
          <span className="diff-head__target">→ {event.target}</span>
        </div>
        <div className="diff-head__meta">
          <span className="diff-head__actor">
            <ActorAvatar actor={event.actor} size={22} />
            <strong>{event.actor.email}</strong>
            <span className="diff-head__role">{event.actor.role}</span>
          </span>
          <span className="diff-head__sep">·</span>
          <span className="diff-head__time">{event.at}</span>
          <span className="diff-head__sep">·</span>
          <span className="diff-head__id-mono">{event.id}</span>
        </div>
      </div>

      <div className="diff-panes">
        <div className="diff-pane diff-pane--before">
          <div className="diff-pane__h">
            <span className="diff-pane__label">– before</span>
            <span className="diff-pane__sub">previous state</span>
          </div>
          <pre className="diff-pane__body">
            {beforeLines.map((line, i) => {
              const afterLine = afterLines[i] ?? '';
              const changed = line !== afterLine;
              return (
                <motion.div
                  key={i}
                  className={`diff-line ${changed ? 'diff-line--remove' : ''}`}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.03 }}
                >
                  <span className="diff-line__num">{i + 1}</span>
                  <span className="diff-line__sign">{changed ? '−' : ' '}</span>
                  <span className="diff-line__text">{line}</span>
                </motion.div>
              );
            })}
          </pre>
        </div>
        <div className="diff-pane diff-pane--after">
          <div className="diff-pane__h">
            <span className="diff-pane__label">+ after</span>
            <span className="diff-pane__sub">applied 5 min ago</span>
          </div>
          <pre className="diff-pane__body">
            {afterLines.map((line, i) => {
              const beforeLine = beforeLines[i] ?? '';
              const changed = line !== beforeLine;
              return (
                <motion.div
                  key={i}
                  className={`diff-line ${changed ? 'diff-line--add' : ''}`}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.03 }}
                >
                  <span className="diff-line__num">{i + 1}</span>
                  <span className="diff-line__sign">{changed ? '+' : ' '}</span>
                  <span className="diff-line__text">{line}</span>
                </motion.div>
              );
            })}
          </pre>
        </div>
      </div>

      <div className="diff-summary">
        <span className="ald__eyebrow">Summary</span>
        <div className="diff-summary__rows">
          <div className="diff-change">
            <span className="diff-change__field">price_monthly_usd</span>
            <span className="diff-change__from">79</span>
            <ArrowRight size={11} strokeWidth={2.4} />
            <span className="diff-change__to">89</span>
            <span className="diff-change__delta">+$10/mo</span>
          </div>
          <div className="diff-change">
            <span className="diff-change__field">llm_token_cap</span>
            <span className="diff-change__from">1,200,000</span>
            <ArrowRight size={11} strokeWidth={2.4} />
            <span className="diff-change__to">1,500,000</span>
            <span className="diff-change__delta">+300k</span>
          </div>
          <div className="diff-change">
            <span className="diff-change__field">features</span>
            <span className="diff-change__from">3 items</span>
            <ArrowRight size={11} strokeWidth={2.4} />
            <span className="diff-change__to">4 items</span>
            <span className="diff-change__delta">+ LLM (Claude)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 2) ACTOR PROFILE — per-actor "rap sheet" view
// ===========================================================================

const ACTOR_PROFILE_EVENTS = [
  { kind: 'security' as const, action: 'user.suspend',          target: 'jin@arclamp.co',          rel: '2 min ago',  ip: '49.32.21.144' },
  { kind: 'security' as const, action: 'user.impersonate.start', target: 'alex@acme.co',           rel: '50 min ago', ip: '49.32.21.144' },
  { kind: 'update' as const,   action: 'pool_routing.assign',    target: 'Acme · pool-B',          rel: '28 min ago', ip: '49.32.21.144' },
  { kind: 'login' as const,    action: 'auth.login',             target: 'admin@warmpulse.app',    rel: '4h ago',     ip: '49.32.21.144' },
  { kind: 'create' as const,   action: 'plan.create',            target: 'Enterprise',             rel: 'today',      ip: '49.32.21.144' },
  { kind: 'update' as const,   action: 'llm.cap.update',         target: 'Starter (+50k)',         rel: 'yest',       ip: '49.32.21.144' },
];

function FullActorProfile() {
  const actor = ACTORS[0]!;
  return (
    <div className="page page--profile">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Audit log · Actor</div>
        <div className="page__count">
          <UserCog size={11} strokeWidth={2.4} />
          activity rap sheet
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Actor profile</h2>
        <div className="page__actions">
          <div className="srch">
            <Search size={13} strokeWidth={2.4} />
            <input className="srch__input" placeholder="Switch actor…" />
          </div>
          <button className="btn btn--ghost">All actors <ChevronDown size={11} /></button>
          <button className="btn btn--solid">Open user</button>
        </div>
      </div>

      <div className="ap-hero">
        <ActorAvatar actor={actor} size={72} />
        <div className="ap-hero__id">
          <div className="ap-hero__email">{actor.email}</div>
          <div className="ap-hero__role">
            <span className="ap-hero__role-pill">{actor.role}</span>
            <span className="ap-hero__sub">Member since 2026-01-12 · last seen 2 min ago</span>
          </div>
        </div>
        <div className="ap-hero__stats">
          <div>
            <span className="ap-hero__num">142</span>
            <span className="ap-hero__label">events · 30d</span>
          </div>
          <div>
            <span className="ap-hero__num">2</span>
            <span className="ap-hero__label">security · 30d</span>
          </div>
          <div>
            <span className="ap-hero__num ap-hero__num--warn">1</span>
            <span className="ap-hero__label">impersonations</span>
          </div>
          <div>
            <span className="ap-hero__num">49.32.21.144</span>
            <span className="ap-hero__label">primary IP</span>
          </div>
        </div>
      </div>

      <div className="ap-grid">
        <div className="ap-card ap-card--big">
          <div className="ap-card__h">
            <span className="ald__eyebrow"><Clock size={11} />Recent activity</span>
            <span className="ap-card__sub">last 7 days</span>
          </div>
          <div className="ap-timeline">
            {ACTOR_PROFILE_EVENTS.map((e, i) => (
              <motion.div
                key={i}
                className={`ap-event ap-event--${e.kind}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 + i * 0.05 }}
              >
                <span className="ap-event__time">{e.rel}</span>
                <span className="ap-event__rail">
                  <span className={`ap-event__dot ap-event__dot--${e.kind}`} />
                  {i !== ACTOR_PROFILE_EVENTS.length - 1 && <span className="ap-event__line" />}
                </span>
                <div className="ap-event__body">
                  <div className="ap-event__head">
                    <span className={`ap-event__kind ap-event__kind--${e.kind}`}>{e.kind}</span>
                    <span className="ap-event__action">{e.action}</span>
                  </div>
                  <div className="ap-event__target">→ {e.target}</div>
                  <div className="ap-event__ip">ip {e.ip}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="ap-side">
          <div className="ap-card">
            <div className="ap-card__h">
              <span className="ald__eyebrow"><Flame size={11} />Top actions</span>
            </div>
            {[
              { label: 'plan.update', count: 18 },
              { label: 'user.suspend', count: 12 },
              { label: 'pool_routing.assign', count: 9 },
              { label: 'auth.login', count: 8 },
            ].map((row, i) => {
              const max = 18;
              return (
                <div className="ap-top" key={row.label}>
                  <span className="ap-top__name">{row.label}</span>
                  <span className="ap-top__bar">
                    <motion.span
                      className="ap-top__fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${(row.count / max) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.06 }}
                    />
                  </span>
                  <span className="ap-top__count">{row.count}</span>
                </div>
              );
            })}
          </div>

          <div className="ap-card">
            <div className="ap-card__h">
              <span className="ald__eyebrow"><Bell size={11} />Quick filters</span>
            </div>
            <button className="ap-filter">Only security events (2)</button>
            <button className="ap-filter">Off-hours actions (1)</button>
            <button className="ap-filter">Impersonation sessions (1)</button>
            <button className="ap-filter">Same IP · 49.32.21.144 (142)</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 3) RISK BOARD — SIEM-style severity-scored events
// ===========================================================================

interface RiskEvent {
  id: string;
  action: string;
  target: string;
  actor: Actor;
  rel: string;
  score: number;
  factors: string[];
  ack: boolean;
}

const RISK_EVENTS: RiskEvent[] = [
  { id: 'evt_05', action: 'user.impersonate.start', target: 'alex@acme.co',     actor: ACTORS[0]!, rel: '50 min ago', score: 88, factors: ['super_admin', 'paid customer', 'no MFA challenge'], ack: false },
  { id: 'evt_07', action: 'beat.heartbeat.miss',    target: 'celery_beat',      actor: ACTORS[2]!, rel: '3h ago',     score: 76, factors: ['delay 92s', 'production', 'no auto-recovery'], ack: false },
  { id: 'evt_03', action: 'peer.deactivate',        target: 'pulse.warm.12@…',  actor: ACTORS[2]!, rel: '12 min ago', score: 62, factors: ['reputation 0.12', 'pool downsize', 'auto-triggered'], ack: true },
  { id: 'evt_01', action: 'user.suspend',           target: 'jin@arclamp.co',   actor: ACTORS[0]!, rel: '2 min ago',  score: 54, factors: ['paying customer', '3× payment fail', 'admin action'], ack: false },
  { id: 'evt_02', action: 'plan.update',            target: 'Growth · $79→$89', actor: ACTORS[1]!, rel: '5 min ago',  score: 32, factors: ['pricing change', 'public-facing', 'reversible'], ack: false },
];

function severity(score: number): { tone: 'crit' | 'high' | 'med' | 'low'; label: string } {
  if (score >= 80) return { tone: 'crit', label: 'CRITICAL' };
  if (score >= 60) return { tone: 'high', label: 'HIGH' };
  if (score >= 40) return { tone: 'med', label: 'MEDIUM' };
  return { tone: 'low', label: 'LOW' };
}

function FullRiskBoard() {
  return (
    <div className="page page--risk">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Audit log · Risk</div>
        <div className="page__count">
          <ShieldAlert size={11} strokeWidth={2.4} />
          siem · scored events · last 24h
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Risk board</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 24h <ChevronDown size={11} /></button>
          <button className="btn btn--ghost">Acknowledged</button>
          <button className="btn btn--solid">Tune rules</button>
        </div>
      </div>

      <div className="rb-summary">
        {[
          { label: 'Critical', count: 1, tone: 'crit', icon: Flame },
          { label: 'High',     count: 1, tone: 'high', icon: ShieldAlert },
          { label: 'Medium',   count: 2, tone: 'med',  icon: Bell },
          { label: 'Low',      count: 1, tone: 'low',  icon: CheckCircle2 },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className={`rb-stat rb-stat--${s.tone}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.04 }}
          >
            <s.icon size={14} strokeWidth={2.4} />
            <div>
              <span className="rb-stat__num">{s.count}</span>
              <span className="rb-stat__label">{s.label}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="rb-list">
        {RISK_EVENTS.map((e, i) => {
          const sev = severity(e.score);
          return (
            <motion.div
              key={e.id}
              className={`rb-row rb-row--${sev.tone} ${e.ack ? 'rb-row--ack' : ''}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
            >
              <div className="rb-row__score">
                <svg viewBox="0 0 50 50" className="rb-score">
                  <circle cx="25" cy="25" r="20" stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
                  <motion.circle
                    cx="25" cy="25" r="20"
                    stroke={
                      sev.tone === 'crit' ? '#ef4444'
                        : sev.tone === 'high' ? '#fb923c'
                        : sev.tone === 'med' ? '#fbbf24'
                        : '#86efac'
                    }
                    strokeWidth="4" fill="none" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 20}
                    initial={{ strokeDashoffset: 2 * Math.PI * 20 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - e.score / 100) }}
                    transition={{ duration: 1.1, delay: 0.2 + i * 0.05 }}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                  />
                </svg>
                <span className="rb-score__num">{e.score}</span>
                <span className={`rb-score__pill rb-score__pill--${sev.tone}`}>{sev.label}</span>
              </div>

              <div className="rb-row__body">
                <div className="rb-row__head">
                  <span className="rb-row__action">{e.action}</span>
                  <span className="rb-row__target">→ {e.target}</span>
                </div>
                <div className="rb-row__meta">
                  <ActorAvatar actor={e.actor} size={20} />
                  <strong>{e.actor.email}</strong>
                  <span className="rb-row__sep">·</span>
                  <span className="rb-row__time">{e.rel}</span>
                  <span className="rb-row__sep">·</span>
                  <span className="rb-row__id">{e.id}</span>
                </div>
                <div className="rb-row__factors">
                  {e.factors.map((f) => (
                    <span key={f} className="rb-factor">{f}</span>
                  ))}
                </div>
              </div>

              <div className="rb-row__actions">
                {e.ack ? (
                  <span className="rb-ack">
                    <CheckCircle2 size={11} strokeWidth={2.4} />
                    Acknowledged
                  </span>
                ) : (
                  <button className="rb-action rb-action--primary">Investigate</button>
                )}
                {!e.ack && <button className="rb-action">Acknowledge</button>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// 4) GEO ORIGIN — world map showing where audit events came from
// ===========================================================================

interface GeoBlip {
  id: string;
  city: string;
  country: string;
  flag: string;
  ip: string;
  x: number; // 0..100 of the map width
  y: number;
  count: number;
  risk: 'ok' | 'warn' | 'err';
  actor: string;
}

const GEO_BLIPS: GeoBlip[] = [
  { id: 'g1', city: 'Bengaluru',  country: 'India',         flag: '🇮🇳', ip: '49.32.21.144',  x: 70,  y: 56, count: 142, risk: 'ok',   actor: 'admin@warmpulse.app' },
  { id: 'g2', city: 'Berlin',     country: 'Germany',       flag: '🇩🇪', ip: '85.214.140.7',  x: 50,  y: 30, count: 42,  risk: 'ok',   actor: 'ops@warmpulse.app' },
  { id: 'g3', city: 'New York',   country: 'United States', flag: '🇺🇸', ip: '54.234.12.88',  x: 26,  y: 40, count: 18,  risk: 'warn', actor: 'admin@warmpulse.app' },
  { id: 'g4', city: 'São Paulo',  country: 'Brazil',        flag: '🇧🇷', ip: '177.32.6.142',  x: 32,  y: 68, count: 4,   risk: 'err',  actor: 'unknown' },
  { id: 'g5', city: 'Tokyo',      country: 'Japan',         flag: '🇯🇵', ip: '210.140.142.21',x: 84,  y: 38, count: 9,   risk: 'ok',   actor: 'system' },
];

function FullGeoOrigin() {
  return (
    <div className="page page--geo">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Audit log · Geo</div>
        <div className="page__count">
          <Globe2 size={11} strokeWidth={2.4} />
          {GEO_BLIPS.length} origin cities · 24h
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Origin map</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 24h <ChevronDown size={11} /></button>
          <button className="btn btn--ghost">All actors <ChevronDown size={11} /></button>
          <button className="btn btn--solid">Investigate São Paulo</button>
        </div>
      </div>

      <div className="geo-grid">
        <div className="geo-map">
          <svg className="geo-map__svg" viewBox="0 0 100 70" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="geo-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.45" />
                <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Dotted world outline — concentric ellipses approximating continents */}
            <g stroke="rgba(255,255,255,0.18)" strokeWidth="0.25" strokeDasharray="0.4 1" fill="none">
              <ellipse cx="50" cy="35" rx="48" ry="30" />
              <ellipse cx="50" cy="35" rx="48" ry="10" />
              <ellipse cx="50" cy="35" rx="24" ry="30" />
              <ellipse cx="50" cy="35" rx="36" ry="22" />
              <ellipse cx="50" cy="35" rx="48" ry="20" />
            </g>
            {/* Glow halos behind blips */}
            {GEO_BLIPS.map((b) => (
              <circle
                key={`g-${b.id}`}
                cx={b.x}
                cy={b.y}
                r={Math.min(10, 2 + b.count / 18)}
                fill="url(#geo-glow)"
              />
            ))}
            {/* Animated pulse rings */}
            {GEO_BLIPS.map((b, i) => {
              const color =
                b.risk === 'err' ? '#ef4444' :
                b.risk === 'warn' ? '#fbbf24' : '#4ade80';
              return (
                <g key={b.id}>
                  <motion.circle
                    cx={b.x}
                    cy={b.y}
                    r={2.5}
                    fill="none"
                    stroke={color}
                    strokeWidth="0.4"
                    initial={{ scale: 1, opacity: 0.7 }}
                    animate={{ scale: 4, opacity: 0 }}
                    transition={{ duration: 2.4, delay: i * 0.3, repeat: Infinity, ease: 'easeOut' }}
                    style={{ transformOrigin: `${b.x}px ${b.y}px` }}
                  />
                  <circle cx={b.x} cy={b.y} r="1.6" fill={color} stroke="#0a0a14" strokeWidth="0.4" />
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="geo-rail">
          <div className="geo-rail__h">Origins</div>
          {GEO_BLIPS.map((b, i) => (
            <motion.div
              key={b.id}
              className={`geo-item geo-item--${b.risk}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.06 }}
            >
              <span className="geo-item__flag">{b.flag}</span>
              <div className="geo-item__id">
                <div className="geo-item__city">{b.city}</div>
                <div className="geo-item__ip">{b.ip}</div>
              </div>
              <span className="geo-item__count">{b.count}</span>
              <span className={`geo-item__risk geo-item__risk--${b.risk}`}>{b.risk}</span>
            </motion.div>
          ))}
        </aside>
      </div>

      <div className="geo-anomaly">
        <div className="geo-anomaly__h">
          <span className="ald__eyebrow"><ShieldAlert size={11} />Anomalies</span>
          <span className="geo-anomaly__sub">unfamiliar geographies · last 24h</span>
        </div>
        {[
          { city: 'São Paulo, Brazil', ip: '177.32.6.142', actor: 'unknown', reason: 'no prior auth from BR · failed login', tone: 'err' as const },
          { city: 'New York, USA',     ip: '54.234.12.88', actor: 'admin@warmpulse.app', reason: 'admin usually IN · NY hit at 02:14 AM', tone: 'warn' as const },
        ].map((row, i) => (
          <motion.div
            key={i}
            className={`geo-anomaly__row geo-anomaly__row--${row.tone}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 + i * 0.08 }}
          >
            <span className="geo-anomaly__city">{row.city}</span>
            <span className="geo-anomaly__ip">{row.ip}</span>
            <span className="geo-anomaly__actor">{row.actor}</span>
            <span className="geo-anomaly__reason">{row.reason}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'diff-viewer',
    name: 'Diff Viewer',
    tagline: 'GitHub-style before / after — exactly what changed, line by line.',
    bullets: [
      'Side-by-side panes with `-` red / `+` green line markers',
      'Numbered gutter on every line; changed lines highlighted',
      'Bottom summary: per-field from → to with computed delta',
      'Best when "what did they actually change?" is the question',
    ],
    icon: Diff,
    Full: FullDiffViewer,
  },
  {
    code: 'actor-profile',
    name: 'Actor Profile',
    tagline: 'Per-actor "rap sheet" — hero + activity + top actions.',
    bullets: [
      'Big avatar header with role pill, primary IP, last-seen',
      'Stats row: events · security · impersonations · primary IP',
      'Vertical activity timeline + Top-actions bars + Quick filter chips',
      'Best when investigating a single admin\'s footprint',
    ],
    icon: UserCog,
    Full: FullActorProfile,
  },
  {
    code: 'risk-board',
    name: 'Risk Board',
    tagline: 'SIEM-style — events scored by severity, animated risk rings.',
    bullets: [
      'Severity summary (Critical / High / Medium / Low) with tone-coded tiles',
      'Each row carries an animated conic risk-score ring (0–100) and factors list',
      'Acknowledge button per row + "Investigate" CTA on unacknowledged',
      'Best for security-led teams running daily review',
    ],
    icon: ShieldAlert,
    Full: FullRiskBoard,
  },
  {
    code: 'geo-origin',
    name: 'Geo Origin Map',
    tagline: 'World map of audit events — pulse rings + anomaly panel.',
    bullets: [
      'Dotted world map with glow halos sized by event count',
      'Pulsing rings on every origin · tone = ok / warn / err',
      'Right rail: ranked city list with risk pill',
      'Bottom: "Anomalies" panel for unfamiliar geographies',
    ],
    icon: Globe2,
    Full: FullGeoOrigin,
  },
];

export default AuditLogDesigns;
