import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CalendarClock,
  Cpu,
  Database,
  Globe,
  Grid3x3,
  HardDrive,
  Network,
  Power,
  Server,
  ServerCog,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';
import './system-health-designs.css';

/**
 * /admin/system-health design picker — round 2.
 */
export function SystemHealthDesigns() {
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
    <div className="shd">
      <div className="shd__atmosphere" aria-hidden>
        <div className="shd__aurora-1" />
        <div className="shd__aurora-2" />
      </div>

      <header className="shd__head">
        <Link to="/admin/system-health" className="shd__back">
          ← Back to live system health
        </Link>
        <div className="shd__head-row">
          <div>
            <span className="shd__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick a System-Health design · round 2
            </span>
            <h1 className="shd__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="shd__sub">{design.tagline}</p>
          </div>
          <div className="shd__counter">
            <span className="shd__counter-now">{index + 1}</span>
            <span className="shd__counter-sep">/</span>
            <span className="shd__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="shd__stage">
        <button type="button" className="shd__arrow" onClick={() => go(-1)} aria-label="Previous">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="shd__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="shd__slide"
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
        <button type="button" className="shd__arrow" onClick={() => go(1)} aria-label="Next">
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="shd__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`shd__dot ${i === index ? 'shd__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="shd__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="shd__bullets-row">
        <ul className="shd__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`shd__pick ${isPicked ? 'shd__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="shd__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build health-{picked}</code> and I'll wire it up at /admin/system-health.
        </div>
      ) : (
        <div className="shd__hint">← / → keys · click arrows · drag the slide · tap a dot</div>
      )}
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'public-status-page' | 'datacenter-rack' | 'terminal-console' | 'heatmap-grid';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Server;
  Full: () => JSX.Element;
}

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

interface Service {
  id: string;
  name: string;
  icon: typeof Server;
  status: 'ok' | 'warn' | 'err';
  uptime: number; // 90d uptime fraction
  metric: string;
  hint: string;
  cpu: number;
  mem: number;
  power: number;
}

const SERVICES: Service[] = [
  { id: 'postgres', name: 'Postgres',     icon: Database,      status: 'ok',   uptime: 0.9998, metric: 'p95 4.2 ms',   hint: '14 connections / 60',     cpu: 18, mem: 42, power: 38 },
  { id: 'redis',    name: 'Redis',        icon: HardDrive,     status: 'ok',   uptime: 1.0,    metric: 'p95 0.8 ms',   hint: 'ping ok · 2 dbs',          cpu: 8,  mem: 16, power: 14 },
  { id: 'api',      name: 'API',          icon: Server,        status: 'ok',   uptime: 0.9994, metric: '236 rps',      hint: 'uvicorn · 4 workers',      cpu: 36, mem: 58, power: 62 },
  { id: 'worker',   name: 'Worker',       icon: Cpu,           status: 'warn', uptime: 0.9912, metric: '23 queued',    hint: 'celery · default+smtp',    cpu: 72, mem: 64, power: 84 },
  { id: 'beat',     name: 'Celery Beat',  icon: CalendarClock, status: 'ok',   uptime: 1.0,    metric: 'tick 8s ago',  hint: '7 schedules',              cpu: 4,  mem: 8,  power: 12 },
  { id: 'smtp',     name: 'SMTP fleet',   icon: Workflow,      status: 'ok',   uptime: 0.9981, metric: '0.6% bounce',  hint: 'Gmail / O365 / Yahoo',     cpu: 12, mem: 20, power: 28 },
  { id: 'imap',     name: 'IMAP watcher', icon: Network,       status: 'ok',   uptime: 0.9990, metric: '14 polls/m',   hint: 'spam-rescue + reply',      cpu: 14, mem: 28, power: 32 },
  { id: 'sentry',   name: 'Sentry',       icon: Zap,           status: 'ok',   uptime: 1.0,    metric: '2 events 1h',  hint: 'release: 2026.05.13.1',   cpu: 0,  mem: 0,  power: 4 },
];

// 90-day uptime strip — each day is up/warn/err
function uptimeStrip(uptime: number): Array<'ok' | 'warn' | 'err'> {
  const days = 90;
  const out: Array<'ok' | 'warn' | 'err'> = [];
  const downDays = Math.round((1 - uptime) * days * 2.5);
  for (let i = 0; i < days; i++) out.push('ok');
  // Sprinkle some non-ok days deterministically based on uptime.
  for (let k = 0; k < downDays; k++) {
    const idx = Math.floor((k + 1) * (days / (downDays + 1)));
    if (idx < days) out[idx] = k % 3 === 0 ? 'err' : 'warn';
  }
  return out;
}

// ===========================================================================
// 1) PUBLIC STATUS PAGE — statuspage.io style with 90-day uptime strips
// ===========================================================================
function FullPublicStatusPage() {
  const allOk = SERVICES.every((s) => s.status === 'ok');
  return (
    <div className="page page--statuspage">
      <div className="page__topbar">
        <div className="page__crumb">Admin · System health · Public</div>
        <div className="page__count">
          <Globe size={11} strokeWidth={2.4} />
          status.warmpulse.app · refresh 60s
        </div>
      </div>

      <motion.div
        className={`sp-hero sp-hero--${allOk ? 'ok' : 'warn'}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="sp-hero__icon">
          {allOk ? (
            <CheckCircle2 size={28} strokeWidth={2.2} />
          ) : (
            <Activity size={28} strokeWidth={2.2} />
          )}
        </div>
        <div className="sp-hero__title">
          {allOk ? 'All systems operational' : 'Some systems are degraded'}
        </div>
        <div className="sp-hero__sub">
          Refreshed 4 seconds ago · subscribe to updates via email or webhook
        </div>
        <div className="sp-hero__meta">
          <span><strong>99.984%</strong> uptime · 90d</span>
          <span><strong>2</strong> incidents · 30d</span>
          <span><strong>14m</strong> MTTR</span>
        </div>
      </motion.div>

      <div className="sp-list">
        <div className="sp-list__h">
          <span className="shd__eyebrow">Components</span>
          <span className="sp-list__legend">
            <span><span className="sp-legend-cell sp-legend-cell--ok" /> operational</span>
            <span><span className="sp-legend-cell sp-legend-cell--warn" /> degraded</span>
            <span><span className="sp-legend-cell sp-legend-cell--err" /> down</span>
          </span>
        </div>
        {SERVICES.map((s, i) => {
          const days = uptimeStrip(s.uptime);
          return (
            <motion.div
              key={s.id}
              className="sp-row"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.06 + i * 0.04 }}
            >
              <div className="sp-row__id">
                <span className="sp-row__icon">
                  <s.icon size={14} strokeWidth={2.2} />
                </span>
                <div>
                  <div className="sp-row__name">{s.name}</div>
                  <div className="sp-row__hint">{s.hint}</div>
                </div>
              </div>
              <div className="sp-row__strip">
                {days.map((d, j) => (
                  <motion.span
                    key={j}
                    className={`sp-cell sp-cell--${d}`}
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={{ delay: 0.1 + i * 0.02 + j * 0.004 }}
                    title={`Day -${90 - j}: ${d}`}
                  />
                ))}
              </div>
              <div className="sp-row__right">
                <span className={`sp-pill sp-pill--${s.status}`}>{s.status}</span>
                <span className="sp-uptime">{(s.uptime * 100).toFixed(2)}%</span>
              </div>
            </motion.div>
          );
        })}
        <div className="sp-list__foot">
          <span>← 90 days ago</span>
          <span>today →</span>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 2) DATACENTER RACK — server-rack visual with LEDs + power + temp
// ===========================================================================
function FullDatacenterRack() {
  return (
    <div className="page page--rack">
      <div className="page__topbar">
        <div className="page__crumb">Admin · System health · Rack</div>
        <div className="page__count">
          <ServerCog size={11} strokeWidth={2.4} />
          rack-01 · {SERVICES.length} U units
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Datacenter rack</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">rack-01 <ChevronDown size={11} /></button>
          <button className="btn btn--solid"><Power size={12} />Power summary</button>
        </div>
      </div>

      <div className="rack-wrap">
        <div className="rack">
          <div className="rack__chassis">
            <span className="rack__label">RACK-01 · WP-PROD-EU</span>
          </div>
          {SERVICES.map((s, i) => (
            <motion.div
              key={s.id}
              className={`rack-u rack-u--${s.status}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.05 }}
            >
              <span className="rack-u__slot">U{String(SERVICES.length - i).padStart(2, '0')}</span>
              <span className="rack-u__leds" aria-hidden>
                <span className={`rack-led rack-led--${s.status}`} />
                <span className={`rack-led rack-led--${s.status === 'ok' ? 'ok' : 'off'}`} />
                <span className="rack-led rack-led--blue" />
              </span>
              <div className="rack-u__id">
                <span className="rack-u__icon">
                  <s.icon size={12} strokeWidth={2.2} />
                </span>
                <div>
                  <div className="rack-u__name">{s.name}</div>
                  <div className="rack-u__hint">{s.hint}</div>
                </div>
              </div>
              <span className="rack-u__metric">{s.metric}</span>
              <div className="rack-u__gauges">
                <RackGauge label="CPU" value={s.cpu} />
                <RackGauge label="MEM" value={s.mem} />
                <RackGauge label="PWR" value={s.power} color="#fbbf24" />
              </div>
              <span className={`rack-u__pill rack-u__pill--${s.status}`}>{s.status}</span>
            </motion.div>
          ))}
          <div className="rack__chassis rack__chassis--bottom">
            <span className="rack__label">PSU · 1.2 kW / 1.6 kW · TEMP 24°C</span>
          </div>
        </div>

        <aside className="rack-side">
          <div className="rack-side__h">Power budget</div>
          <div className="rack-side__num">
            {SERVICES.reduce((a, s) => a + s.power, 0)}<span>%</span>
          </div>
          <div className="rack-side__sub">aggregated · 60% threshold</div>
          <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="rack-side__chart">
            <motion.polyline
              points="0,60 20,56 40,58 60,48 80,52 100,42 120,46 140,36 160,40 180,28 200,32"
              fill="none"
              stroke="var(--wp-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4 }}
            />
          </svg>
          <div className="rack-side__h">Fans</div>
          <div className="rack-side__fans">
            {[
              { id: 'F1', rpm: 4280, status: 'ok' },
              { id: 'F2', rpm: 4180, status: 'ok' },
              { id: 'F3', rpm: 3640, status: 'warn' },
              { id: 'F4', rpm: 4220, status: 'ok' },
            ].map((f) => (
              <div className="rack-fan" key={f.id}>
                <span className={`rack-fan__spin rack-fan__spin--${f.status}`} aria-hidden>
                  <span className="rack-fan__blades" />
                </span>
                <div>
                  <div className="rack-fan__id">{f.id}</div>
                  <div className="rack-fan__rpm">{f.rpm} rpm</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function RackGauge({ label, value, color }: { label: string; value: number; color?: string }) {
  const tone = value > 80 ? '#ef4444' : value > 60 ? '#fbbf24' : color ?? 'var(--wp-accent)';
  return (
    <div className="rack-gauge">
      <span className="rack-gauge__label">{label}</span>
      <span className="rack-gauge__bar">
        <motion.span
          className="rack-gauge__fill"
          style={{ background: tone }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </span>
      <span className="rack-gauge__num">{value}%</span>
    </div>
  );
}

// ===========================================================================
// 3) TERMINAL CONSOLE — multi-pane log tail view
// ===========================================================================
function FullTerminalConsole() {
  const panes = [
    {
      title: 'api · uvicorn',
      lines: [
        'INFO  2026-05-13T02:14:08 200 GET /admin/overview     12ms',
        'INFO  2026-05-13T02:14:08 200 GET /admin/peer-stats   28ms',
        'INFO  2026-05-13T02:14:09 200 POST /auth/login        46ms',
        'WARN  2026-05-13T02:14:09 retry SMTP probe (mbx-481)',
        'INFO  2026-05-13T02:14:10 200 GET /me                  4ms',
      ],
      kind: 'api' as const,
    },
    {
      title: 'worker · celery',
      lines: [
        '[INFO] tasks.warmup_send.send_single_warmup_email[ab12] succeeded in 1.84s',
        '[INFO] pairing.pick_peer_inbox → peer-pool-A · gws-02',
        '[INFO] tasks.warmup_send.send_single_warmup_email[cd34] succeeded in 1.62s',
        '[WARN] queue depth 23 jobs (default+smtp)',
        '[INFO] tasks.peer_actions.hourly_peer_health_check started',
      ],
      kind: 'worker' as const,
    },
    {
      title: 'beat · scheduler',
      lines: [
        'Scheduler: Sending due task warmup-outbound-every-15min',
        'Scheduler: Sending due task warmup-inbound-every-3min',
        'Scheduler: Sending due task beat-heartbeat-1min',
        'Heartbeat ok · last_tick=8s ago',
        'Scheduler: Sending due task alert-check-hourly',
      ],
      kind: 'beat' as const,
    },
    {
      title: 'postgres · pg_stat',
      lines: [
        'p99 5.4 ms · p95 4.2 ms · p50 1.1 ms',
        'connections 14/60 · idle 6 · active 8',
        'slow_query: SELECT FROM warmup_logs WHERE ...   42 ms',
        'cache hit ratio 99.4%',
        'WAL pos 0/2A4F3 · 28 MB',
      ],
      kind: 'pg' as const,
    },
  ];
  return (
    <div className="page page--term">
      <div className="page__topbar">
        <div className="page__crumb">Admin · System health · Console</div>
        <div className="page__count">
          <Terminal size={11} strokeWidth={2.4} />
          tail -f · 4 panes · live
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Live console</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Wrap lines</button>
          <button className="btn btn--ghost">Filter <ChevronDown size={11} /></button>
          <button className="btn btn--solid">Pause</button>
        </div>
      </div>

      <div className="term-grid">
        {panes.map((p, i) => (
          <motion.div
            key={p.title}
            className="term"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.05 }}
          >
            <div className="term__h">
              <span className="term__dots" aria-hidden>
                <span className="term__dot term__dot--red" />
                <span className="term__dot term__dot--yellow" />
                <span className="term__dot term__dot--green" />
              </span>
              <span className="term__title">{p.title}</span>
              <span className="term__tag">tail -f</span>
            </div>
            <div className={`term__body term__body--${p.kind}`}>
              {p.lines.map((line, j) => (
                <motion.div
                  key={j}
                  className={`term__line term__line--${
                    line.toLowerCase().includes('warn') ? 'warn'
                      : line.toLowerCase().includes('error') ? 'err'
                      : 'info'
                  }`}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.04 + j * 0.06 }}
                >
                  {line}
                </motion.div>
              ))}
              <span className="term__cursor">_</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="term-foot">
        <span className="term-foot__live">
          <span className="term-foot__dot" />
          live · 4 panes streaming
        </span>
        <span className="term-foot__rate">≈ 86 lines/min</span>
        <span className="term-foot__filter">filter: <code>level&gt;=INFO</code></span>
      </div>
    </div>
  );
}

// ===========================================================================
// 4) HEATMAP GRID — service × hour intensity grid
// ===========================================================================
function FullHeatmapGrid() {
  const HOURS = 24;
  // Build a deterministic intensity matrix [service][hour].
  const matrix: number[][] = SERVICES.map((s, si) =>
    Array.from({ length: HOURS }, (_, h) => {
      const base = 0.4 + Math.sin((h - 9 + si) / 4) * 0.3;
      const burst = h >= 9 && h <= 17 ? 0.2 : -0.05;
      const wobble = ((h * 37 + si * 13) % 11) / 33;
      let v = base + burst + wobble;
      if (s.status === 'warn' && h > 12 && h < 18) v += 0.25;
      if (s.status === 'err') v = 0.9;
      return Math.max(0.05, Math.min(1, v));
    }),
  );

  function cellColor(v: number, status: Service['status']): string {
    if (status === 'err' && v > 0.7) return `color-mix(in srgb, #ef4444 ${v * 100}%, transparent)`;
    if (status === 'warn' && v > 0.6) return `color-mix(in srgb, #fbbf24 ${v * 100}%, transparent)`;
    return `color-mix(in srgb, var(--wp-accent) ${v * 100}%, transparent)`;
  }

  return (
    <div className="page page--heatmap">
      <div className="page__topbar">
        <div className="page__crumb">Admin · System health · Heatmap</div>
        <div className="page__count">
          <Grid3x3 size={11} strokeWidth={2.4} />
          {SERVICES.length} services × 24 hours · last day
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Load heatmap</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 24h <ChevronDown size={11} /></button>
          <button className="btn btn--ghost">Service mix <ChevronDown size={11} /></button>
          <button className="btn btn--solid">Export</button>
        </div>
      </div>

      <div className="hm-stats">
        {[
          { label: 'Hottest service', value: 'Worker', sub: 'avg 78%' },
          { label: 'Quietest service', value: 'Sentry', sub: 'avg 6%' },
          { label: 'Peak hour', value: '14:00', sub: 'avg load 71%' },
          { label: 'Active alerts', value: '1', sub: 'worker queue +18 in 5m' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="hm-stat"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.04 }}
          >
            <span className="hm-stat__label">{s.label}</span>
            <span className="hm-stat__num">{s.value}</span>
            <span className="hm-stat__sub">{s.sub}</span>
          </motion.div>
        ))}
      </div>

      <div className="hm-card">
        <div className="hm-card__h">
          <span className="shd__eyebrow"><Activity size={11} />Service × hour load · last 24h</span>
          <div className="hm-legend">
            <span>low</span>
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((v, i) => (
              <span
                key={i}
                className="hm-legend__cell"
                style={{ background: `color-mix(in srgb, var(--wp-accent) ${v * 100}%, transparent)` }}
              />
            ))}
            <span>high</span>
          </div>
        </div>
        <div className="hm-grid" style={{ gridTemplateColumns: `120px repeat(${HOURS}, 1fr)` }}>
          {/* Header row */}
          <span className="hm-cell hm-cell--corner" />
          {Array.from({ length: HOURS }, (_, h) => (
            <span key={`h-${h}`} className="hm-h">
              {h % 6 === 0 ? String(h).padStart(2, '0') : ''}
            </span>
          ))}
          {/* Service rows */}
          {SERVICES.map((s, si) => (
            <FragmentRow key={s.id} si={si} s={s} matrix={matrix[si]!} cellColor={cellColor} />
          ))}
        </div>
        <div className="hm-card__foot">
          <span>00:00</span>
          <span className="hm-card__foot-mid">last 24 hours</span>
          <span>now</span>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({
  s,
  si,
  matrix,
  cellColor,
}: {
  s: Service;
  si: number;
  matrix: number[];
  cellColor: (v: number, status: Service['status']) => string;
}) {
  return (
    <>
      <span className="hm-name">
        <span className="hm-name__icon">
          <s.icon size={11} strokeWidth={2.2} />
        </span>
        {s.name}
      </span>
      {matrix.map((v, h) => (
        <motion.span
          key={h}
          className="hm-cell"
          style={{ background: cellColor(v, s.status) }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.08 + si * 0.03 + h * 0.005, duration: 0.25 }}
          title={`${s.name} · ${String(h).padStart(2, '0')}:00 → ${Math.round(v * 100)}%`}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'public-status-page',
    name: 'Public Status Page',
    tagline: 'Statuspage.io-style — 90-day uptime strips per component.',
    bullets: [
      'Big "All systems operational" hero (flips tone with overall state)',
      'Uptime / incidents / MTTR badges in the hero strip',
      'Per-component row with icon · 90-day uptime cells · status pill · uptime %',
      'Looks like a public status page · ready to expose on status.warmpulse.app',
    ],
    icon: Globe,
    Full: FullPublicStatusPage,
  },
  {
    code: 'datacenter-rack',
    name: 'Datacenter Rack',
    tagline: 'Server-rack metaphor — each service is a 1U slot with LEDs.',
    bullets: [
      'Rack chassis with U-slot labels (U08 … U01)',
      'Per-slot LEDs (status / activity / link) + CPU / MEM / PWR gauges',
      'Right rail: aggregated power budget + spinning fan widgets',
      'Best when you want "ops-room display" vibes',
    ],
    icon: ServerCog,
    Full: FullDatacenterRack,
  },
  {
    code: 'terminal-console',
    name: 'Terminal Console',
    tagline: 'Multi-pane `tail -f` — live log stream per service.',
    bullets: [
      '4 terminal panes (api · worker · beat · postgres) with macOS chrome dots',
      'Lines colored by level (info / warn / err) · blinking cursor',
      'Footer chip: live · lines/min · active filter',
      'Best when SREs want raw logs without leaving the admin app',
    ],
    icon: Terminal,
    Full: FullTerminalConsole,
  },
  {
    code: 'heatmap-grid',
    name: 'Load Heatmap',
    tagline: 'Service × hour intensity grid — spot hot zones at a glance.',
    bullets: [
      '8 services × 24 hours · cell color = load · warn/err tinted differently',
      'Summary tiles: hottest service · quietest · peak hour · active alerts',
      'Hover any cell for time + load %',
      'Best when "when does it spike" is the operating question',
    ],
    icon: Grid3x3,
    Full: FullHeatmapGrid,
  },
];

export default SystemHealthDesigns;
