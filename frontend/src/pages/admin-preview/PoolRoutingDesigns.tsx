import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Filter,
  Grid3x3,
  Layers,
  Move,
  Plus,
  Search,
  Shuffle,
  Sparkles,
  Workflow,
} from 'lucide-react';
import './pool-routing-designs.css';

/**
 * /admin/pool-routing design picker — 4 directions.
 */
export function PoolRoutingDesigns() {
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
    <div className="prd">
      <div className="prd__atmosphere" aria-hidden>
        <div className="prd__aurora-1" />
        <div className="prd__aurora-2" />
      </div>

      <header className="prd__head">
        <Link to="/admin/pool-routing" className="prd__back">
          ← Back to live pool routing
        </Link>
        <div className="prd__head-row">
          <div>
            <span className="prd__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick a Pool-routing design
            </span>
            <h1 className="prd__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="prd__sub">{design.tagline}</p>
          </div>
          <div className="prd__counter">
            <span className="prd__counter-now">{index + 1}</span>
            <span className="prd__counter-sep">/</span>
            <span className="prd__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="prd__stage">
        <button type="button" className="prd__arrow" onClick={() => go(-1)} aria-label="Previous">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="prd__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="prd__slide"
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
        <button type="button" className="prd__arrow" onClick={() => go(1)} aria-label="Next">
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="prd__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`prd__dot ${i === index ? 'prd__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="prd__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="prd__bullets-row">
        <ul className="prd__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`prd__pick ${isPicked ? 'prd__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="prd__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build routing-{picked}</code> and I'll wire it up against /admin/pool-routing.
        </div>
      ) : (
        <div className="prd__hint">← / → keys · click arrows · drag the slide · tap a dot</div>
      )}
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'assignment-matrix' | 'sankey-flow' | 'workspace-cards' | 'kanban-lanes';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Layers;
  Full: () => JSX.Element;
}

// ---------------------------------------------------------------------------
// Mock pools + clients
// ---------------------------------------------------------------------------

const POOLS = [
  { id: 'pool-A' as const, label: 'Default', color: '#4ade80', peers: 12, capacity: 1200 },
  { id: 'pool-B' as const, label: 'Enterprise', color: '#FF8A4B', peers: 6, capacity: 480 },
  { id: 'pool-C' as const, label: 'Burst', color: '#f472b6', peers: 4, capacity: 320 },
];

interface MockClient {
  email: string;
  workspace: string;
  plan: 'Starter' | 'Growth' | 'Scale';
  pool: 'pool-A' | 'pool-B' | 'pool-C' | null;
  sends30d: number;
  rep: number;
  joined: string;
  hue: number;
}

const CLIENTS: MockClient[] = [
  { email: 'alex@acme.co',       workspace: 'Acme',         plan: 'Scale',   pool: 'pool-B', sends30d: 12480, rep: 0.94, joined: 'Jan 12', hue: 260 },
  { email: 'priya@northwind.io', workspace: 'Northwind',    plan: 'Growth',  pool: 'pool-A', sends30d: 5240,  rep: 0.91, joined: 'Feb 03', hue: 320 },
  { email: 'marcus@lumenlabs.dev', workspace: 'Lumen Labs', plan: 'Starter', pool: 'pool-A', sends30d: 980,   rep: 0.83, joined: 'Apr 22', hue: 200 },
  { email: 'sofia@vendio.io',    workspace: 'Vendio',       plan: 'Growth',  pool: 'pool-A', sends30d: 6810,  rep: 0.88, joined: 'Mar 08', hue: 30 },
  { email: 'tk@beacon.app',      workspace: 'Beacon',       plan: 'Scale',   pool: 'pool-B', sends30d: 18420, rep: 0.96, joined: 'Dec 02', hue: 140 },
  { email: 'devika@parable.in',  workspace: 'Parable',      plan: 'Starter', pool: 'pool-C', sends30d: 240,   rep: 0.72, joined: 'May 01', hue: 280 },
  { email: 'jin@arclamp.co',     workspace: 'Arclamp',      plan: 'Starter', pool: null,     sends30d: 0,     rep: 0,    joined: 'Feb 28', hue: 0 },
  { email: 'el@oxenstudio.com',  workspace: 'Oxen',         plan: 'Growth',  pool: 'pool-A', sends30d: 4120,  rep: 0.86, joined: 'Mar 30', hue: 160 },
  { email: 'mei@hibou.co',       workspace: 'Hibou',        plan: 'Scale',   pool: 'pool-B', sends30d: 9840,  rep: 0.92, joined: 'Jan 30', hue: 220 },
  { email: 'ras@parch.io',       workspace: 'Parch',        plan: 'Starter', pool: 'pool-C', sends30d: 410,   rep: 0.68, joined: 'Apr 15', hue: 90 },
];

function poolMeta(id: MockClient['pool']) {
  return id ? POOLS.find((p) => p.id === id)! : null;
}

function Avatar({ c, size = 28 }: { c: MockClient; size?: number }) {
  return (
    <span
      className="prc-avatar"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${c.hue} 70% 56%), hsl(${c.hue + 30} 65% 48%))`,
        fontSize: size * 0.36,
      }}
    >
      {c.workspace.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ===========================================================================
// 1) ASSIGNMENT MATRIX — clients × pools grid, cells show membership + sends
// ===========================================================================
function FullAssignmentMatrix() {
  return (
    <div className="page page--matrix">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Pool routing · Matrix</div>
        <div className="page__count">
          <Grid3x3 size={11} strokeWidth={2.4} />
          Click any cell to (re)assign · {CLIENTS.length} clients · {POOLS.length} pools
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Client × Pool matrix</h2>
        <div className="page__actions">
          <div className="srch">
            <Search size={13} strokeWidth={2.4} />
            <input className="srch__input" placeholder="Find a client…" />
          </div>
          <button className="btn btn--ghost"><Filter size={12} />Plan</button>
          <button className="btn btn--solid"><Plus size={12} />New pool</button>
        </div>
      </div>

      <div className="mtx">
        <div className="mtx__row mtx__row--head">
          <div className="mtx__cell mtx__cell--client">Client</div>
          {POOLS.map((p) => (
            <div key={p.id} className="mtx__cell mtx__cell--pool">
              <span className="mtx__pool-dot" style={{ background: p.color }} />
              <div>
                <div className="mtx__pool-name">{p.label}</div>
                <div className="mtx__pool-sub">{p.peers} peers · {p.capacity} cap/day</div>
              </div>
            </div>
          ))}
          <div className="mtx__cell mtx__cell--unassigned">
            <span className="mtx__pool-dot" style={{ background: 'rgba(255,255,255,0.3)' }} />
            <div>
              <div className="mtx__pool-name">Unassigned</div>
              <div className="mtx__pool-sub">default fallback</div>
            </div>
          </div>
        </div>
        {CLIENTS.map((c, i) => (
          <motion.div
            key={c.email}
            className="mtx__row"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i, duration: 0.3 }}
          >
            <div className="mtx__cell mtx__cell--client">
              <Avatar c={c} size={28} />
              <div className="mtx__client-id">
                <div className="mtx__client-name">{c.workspace}</div>
                <div className="mtx__client-email">{c.email}</div>
              </div>
              <span className={`u-plan u-plan--${c.plan.toLowerCase()}`}>{c.plan}</span>
            </div>
            {POOLS.map((p) => {
              const active = c.pool === p.id;
              return (
                <button
                  key={p.id}
                  className={`mtx__cell mtx__cell--check ${active ? 'mtx__cell--active' : ''}`}
                  style={active ? { ['--mtx-tone' as string]: p.color } : undefined}
                >
                  {active && (
                    <motion.span
                      className="mtx__tick"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.2, ease: 'backOut' }}
                    >
                      <CheckCircle2 size={16} strokeWidth={2.4} />
                    </motion.span>
                  )}
                  {active && (
                    <span className="mtx__sends">{c.sends30d.toLocaleString()}</span>
                  )}
                </button>
              );
            })}
            <button
              className={`mtx__cell mtx__cell--check ${c.pool === null ? 'mtx__cell--active mtx__cell--active-grey' : ''}`}
            >
              {c.pool === null && <CheckCircle2 size={16} strokeWidth={2.4} />}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 2) SANKEY FLOW — clients on left, pools on right, animated flowing bands
// ===========================================================================
function FullSankeyFlow() {
  // Visible client subset (top 8) for the diagram + ALL clients for the side list.
  const topClients = [...CLIENTS]
    .filter((c) => c.pool !== null)
    .sort((a, b) => b.sends30d - a.sends30d)
    .slice(0, 8);
  const maxSends = Math.max(...topClients.map((c) => c.sends30d), 1);
  const totalSendsByPool = (id: MockClient['pool']) =>
    topClients.filter((c) => c.pool === id).reduce((a, c) => a + c.sends30d, 0);

  return (
    <div className="page page--sankey">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Pool routing · Flow</div>
        <div className="page__count">
          <Workflow size={11} strokeWidth={2.4} />
          send-volume flow · last 30 days
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Routing flow</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 30 days <ChevronDown size={11} /></button>
          <button className="btn btn--solid"><Plus size={12} />New pool</button>
        </div>
      </div>

      <div className="snk">
        <div className="snk__col snk__col--clients">
          <div className="snk__col-h">Clients</div>
          {topClients.map((c) => (
            <div className="snk__node snk__node--client" key={c.email}>
              <Avatar c={c} size={24} />
              <div className="snk__node-id">
                <div className="snk__node-name">{c.workspace}</div>
                <div className="snk__node-sub">{c.sends30d.toLocaleString()} sends</div>
              </div>
            </div>
          ))}
        </div>
        <svg className="snk__svg" viewBox="0 0 400 460" preserveAspectRatio="none">
          <defs>
            {POOLS.map((p) => (
              <linearGradient key={p.id} id={`snk-grad-${p.id}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={p.color} stopOpacity="0.15" />
                <stop offset="1" stopColor={p.color} stopOpacity="0.55" />
              </linearGradient>
            ))}
          </defs>
          {topClients.map((c, i) => {
            const poolIdx = POOLS.findIndex((p) => p.id === c.pool);
            const y1 = 32 + i * 50;
            const y2 = 60 + poolIdx * 140;
            const thickness = Math.max(2, (c.sends30d / maxSends) * 22);
            return (
              <motion.path
                key={c.email}
                d={`M 0,${y1} C 180,${y1} 220,${y2} 400,${y2}`}
                stroke={`url(#snk-grad-${c.pool})`}
                strokeWidth={thickness}
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.4, delay: 0.1 + i * 0.06, ease: 'easeOut' }}
              />
            );
          })}
        </svg>
        <div className="snk__col snk__col--pools">
          <div className="snk__col-h">Pools</div>
          {POOLS.map((p) => (
            <div
              key={p.id}
              className="snk__node snk__node--pool"
              style={{ ['--snk-tone' as string]: p.color }}
            >
              <span className="snk__pool-bar" />
              <div>
                <div className="snk__node-name">{p.label}</div>
                <div className="snk__node-sub">
                  {totalSendsByPool(p.id).toLocaleString()} sends · {p.peers} peers
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 3) WORKSPACE CARDS — each workspace is a card with "Change pool" pill
// ===========================================================================
function FullWorkspaceCards() {
  const [filter, setFilter] = useState<'all' | MockClient['pool']>('all');
  const list = filter === 'all' ? CLIENTS : CLIENTS.filter((c) => c.pool === filter);
  return (
    <div className="page page--cards">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Pool routing · Workspaces</div>
        <div className="page__count">
          <Layers size={11} strokeWidth={2.4} />
          {list.length} of {CLIENTS.length} workspaces
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Workspaces</h2>
        <div className="page__actions">
          <button className="btn btn--ghost"><Shuffle size={12} />Bulk reassign</button>
          <button className="btn btn--solid"><Plus size={12} />New pool</button>
        </div>
      </div>

      <div className="page__chips">
        <button
          className={`chip ${filter === 'all' ? 'chip--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All · {CLIENTS.length}
        </button>
        {POOLS.map((p) => (
          <button
            key={p.id}
            className={`chip ${filter === p.id ? 'chip--active' : ''}`}
            onClick={() => setFilter(p.id)}
            style={filter === p.id ? { ['--chip-tone' as string]: p.color } : undefined}
          >
            <span className="chip__dot" style={{ background: p.color }} />
            {p.label} · {CLIENTS.filter((c) => c.pool === p.id).length}
          </button>
        ))}
        <button
          className={`chip ${filter === null ? 'chip--active' : ''}`}
          onClick={() => setFilter(null)}
        >
          Unassigned · {CLIENTS.filter((c) => c.pool === null).length}
        </button>
      </div>

      <div className="wc-grid">
        {list.map((c, i) => (
          <motion.div
            key={c.email}
            className="wc"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.35 }}
            whileHover={{ y: -3 }}
          >
            <div className="wc__head">
              <Avatar c={c} size={40} />
              <div className="wc__id">
                <div className="wc__name">{c.workspace}</div>
                <div className="wc__email">{c.email}</div>
              </div>
              <span className={`u-plan u-plan--${c.plan.toLowerCase()}`}>{c.plan}</span>
            </div>
            <div className="wc__stats">
              <div>
                <span className="wc__stat-num">{c.sends30d.toLocaleString()}</span>
                <span className="wc__stat-label">sends 30d</span>
              </div>
              <div>
                <span className="wc__stat-num">
                  {c.rep > 0 ? c.rep.toFixed(2) : '—'}
                </span>
                <span className="wc__stat-label">reputation</span>
              </div>
              <div>
                <span className="wc__stat-num">{c.joined}</span>
                <span className="wc__stat-label">joined</span>
              </div>
            </div>
            <div className="wc__foot">
              <span className="wc__foot-label">Pool</span>
              {c.pool ? (
                <button
                  className="wc__pool-pill"
                  style={{ ['--wc-tone' as string]: poolMeta(c.pool)!.color }}
                >
                  <span className="wc__pool-dot" />
                  {poolMeta(c.pool)!.label}
                  <ChevronDown size={12} strokeWidth={2.4} />
                </button>
              ) : (
                <button className="wc__pool-pill wc__pool-pill--empty">
                  Assign…
                  <ChevronDown size={12} strokeWidth={2.4} />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 4) KANBAN LANES — drag workspaces between pool columns
// ===========================================================================
function FullKanbanLanes() {
  const lanes: Array<{ id: MockClient['pool']; label: string; color: string }> = [
    ...POOLS.map((p) => ({ id: p.id, label: p.label, color: p.color })),
    { id: null, label: 'Unassigned', color: '#94a3b8' },
  ];
  return (
    <div className="page page--lanes">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Pool routing · Lanes</div>
        <div className="page__count">
          <Move size={11} strokeWidth={2.4} />
          Drag any workspace between lanes
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Routing lanes</h2>
        <div className="page__actions">
          <button className="btn btn--ghost"><Filter size={12} />All plans</button>
          <button className="btn btn--solid"><Plus size={12} />New pool</button>
        </div>
      </div>

      <div className="lanes-grid">
        {lanes.map((lane) => {
          const list = CLIENTS.filter((c) => c.pool === lane.id);
          const pool = lane.id ? POOLS.find((p) => p.id === lane.id) : null;
          return (
            <div className="rl-lane" key={String(lane.id)}>
              <div className="rl-lane__head">
                <span className="rl-lane__dot" style={{ background: lane.color }} />
                <span className="rl-lane__label">{lane.label}</span>
                <span className="rl-lane__count">{list.length}</span>
              </div>
              {pool && (
                <div className="rl-lane__cap">
                  <span>{pool.peers} peers · {pool.capacity} cap/day</span>
                </div>
              )}
              <div className="rl-lane__body">
                {list.length === 0 && (
                  <div className="rl-lane__empty">drop a workspace here</div>
                )}
                {list.map((c, i) => (
                  <motion.div
                    key={c.email}
                    className="rl-card"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + i * 0.05, duration: 0.3 }}
                    whileHover={{ y: -2 }}
                  >
                    <div className="rl-card__head">
                      <Avatar c={c} size={28} />
                      <div className="rl-card__id">
                        <div className="rl-card__name">{c.workspace}</div>
                        <div className="rl-card__email">{c.email}</div>
                      </div>
                    </div>
                    <div className="rl-card__meta">
                      <span className={`u-plan u-plan--${c.plan.toLowerCase()}`}>{c.plan}</span>
                      <span className="rl-card__sep">·</span>
                      <span>{c.sends30d.toLocaleString()}/30d</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'assignment-matrix',
    name: 'Assignment Matrix',
    tagline: 'Big grid — clients × pools — click any cell to (re)assign.',
    bullets: [
      'Rows are clients with avatar + plan badge',
      'Columns are pools (Default / Enterprise / Burst) + Unassigned',
      'Active cell shows a tick + 30d send count colored to the pool',
      'Best when you want a one-screen overview of every assignment',
    ],
    icon: Grid3x3,
    Full: FullAssignmentMatrix,
  },
  {
    code: 'sankey-flow',
    name: 'Sankey Flow',
    tagline: 'River-style flow diagram — line thickness = send volume.',
    bullets: [
      'Clients on the left, pools on the right',
      'Animated bezier bands drawn pool-tinted, thickness scales with sends',
      'Sum-of-flow shown on each pool node',
      'Best for "where is volume actually going" reviews',
    ],
    icon: Workflow,
    Full: FullSankeyFlow,
  },
  {
    code: 'workspace-cards',
    name: 'Workspace Cards',
    tagline: 'One card per workspace with a "Change pool" pill.',
    bullets: [
      'Filter chips by pool (or Unassigned) up top',
      'Each card: avatar + name + plan + sends + rep + joined',
      'Pill at the bottom shows current pool with a dropdown caret',
      'Best when admins do per-workspace pool changes',
    ],
    icon: Layers,
    Full: FullWorkspaceCards,
  },
  {
    code: 'kanban-lanes',
    name: 'Kanban Lanes',
    tagline: 'Drag workspaces between pool lanes — left-to-right routing.',
    bullets: [
      'One lane per pool + Unassigned bucket',
      'Each card is a workspace with plan + 30d sends',
      'Lane header shows peer count + daily capacity',
      'Best when reassignment is a frequent, fluent workflow',
    ],
    icon: Move,
    Full: FullKanbanLanes,
  },
];
