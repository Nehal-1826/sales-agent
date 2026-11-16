import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  CheckCircle2,
  Filter,
  LayoutGrid,
  LineChart,
  MoreHorizontal,
  Search,
  Sparkles,
  Table,
  TrendingDown,
  TrendingUp,
  UserSearch,
} from 'lucide-react';
import './user-designs.css';

/**
 * /admin/users design picker — swipeable carousel of 4 full-page mockups.
 * Pick one and we'll wire it up against /admin/users.
 */
export function UserDesigns() {
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
    <div className="ud">
      <div className="ud__atmosphere" aria-hidden>
        <div className="ud__aurora-1" />
        <div className="ud__aurora-2" />
      </div>

      <header className="ud__head">
        <Link to="/admin/users" className="ud__back">
          ← Back to live users page
        </Link>
        <div className="ud__head-row">
          <div>
            <span className="ud__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick a Users page design
            </span>
            <h1 className="ud__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="ud__sub">{design.tagline}</p>
          </div>
          <div className="ud__counter">
            <span className="ud__counter-now">{index + 1}</span>
            <span className="ud__counter-sep">/</span>
            <span className="ud__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="ud__stage">
        <button
          type="button"
          className="ud__arrow"
          onClick={() => go(-1)}
          aria-label="Previous design"
        >
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>

        <div className="ud__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="ud__slide"
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
          className="ud__arrow"
          onClick={() => go(1)}
          aria-label="Next design"
        >
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="ud__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`ud__dot ${i === index ? 'ud__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="ud__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="ud__bullets-row">
        <ul className="ud__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`ud__pick ${isPicked ? 'ud__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="ud__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build users-{picked}</code> and I'll wire it up against /admin/users.
        </div>
      ) : (
        <div className="ud__hint">
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

type DesignCode = 'roster-table' | 'pipeline-cards' | 'spotlight-profile' | 'cohort-analytics';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Table;
  Full: () => JSX.Element;
}

// ---------------------------------------------------------------------------
// Mock users — shared across mockups so the look-and-feel is consistent.
// ---------------------------------------------------------------------------

interface MockUser {
  initials: string;
  name: string;
  email: string;
  plan: 'Starter' | 'Growth' | 'Scale' | 'Trial';
  status: 'active' | 'trial' | 'suspended';
  mailboxes: number;
  sends30d: number;
  joined: string;
  rep: number;
  hue: number;
}

const USERS: MockUser[] = [
  { initials: 'AC', name: 'Alex Chen', email: 'alex@acme.co', plan: 'Scale', status: 'active', mailboxes: 8, sends30d: 12480, joined: 'Jan 12', rep: 0.94, hue: 260 },
  { initials: 'PS', name: 'Priya Sharma', email: 'priya@northwind.io', plan: 'Growth', status: 'active', mailboxes: 4, sends30d: 5240, joined: 'Feb 03', rep: 0.91, hue: 320 },
  { initials: 'MW', name: 'Marcus Wong', email: 'marcus@lumenlabs.dev', plan: 'Starter', status: 'trial', mailboxes: 2, sends30d: 980, joined: 'Apr 22', rep: 0.83, hue: 200 },
  { initials: 'SR', name: 'Sofia Rivera', email: 'sofia@vendio.io', plan: 'Growth', status: 'active', mailboxes: 5, sends30d: 6810, joined: 'Mar 08', rep: 0.88, hue: 30 },
  { initials: 'TK', name: 'Tomás Köhler', email: 'tk@beacon.app', plan: 'Scale', status: 'active', mailboxes: 12, sends30d: 18420, joined: 'Dec 02', rep: 0.96, hue: 140 },
  { initials: 'DV', name: 'Devika V.', email: 'devika@parable.in', plan: 'Trial', status: 'trial', mailboxes: 1, sends30d: 240, joined: 'May 01', rep: 0.72, hue: 280 },
  { initials: 'JK', name: 'Jin Kwon', email: 'jin@arclamp.co', plan: 'Starter', status: 'suspended', mailboxes: 0, sends30d: 0, joined: 'Feb 28', rep: 0, hue: 0 },
  { initials: 'EL', name: 'Elena Lopez', email: 'el@oxenstudio.com', plan: 'Growth', status: 'active', mailboxes: 3, sends30d: 4120, joined: 'Mar 30', rep: 0.86, hue: 160 },
];

function Avatar({ user, size = 32 }: { user: MockUser; size?: number }) {
  return (
    <span
      className="u-avatar"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${user.hue} 70% 56%), hsl(${user.hue + 30} 65% 48%))`,
        fontSize: size * 0.36,
      }}
    >
      {user.initials}
    </span>
  );
}

function StatusPill({ status }: { status: MockUser['status'] }) {
  return <span className={`u-pill u-pill--${status}`}>{status}</span>;
}

// ===========================================================================
// 1) ROSTER TABLE — dense, sortable, classic SaaS users page
// ===========================================================================
function FullRosterTable() {
  return (
    <div className="page page--roster">
      <div className="page__topbar">
        <div className="page__crumb">Admin / Users</div>
        <div className="page__count">
          {USERS.length} users · {USERS.filter((u) => u.status === 'active').length} active
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Users</h2>
        <div className="page__actions">
          <div className="srch">
            <Search size={13} strokeWidth={2.4} />
            <input className="srch__input" placeholder="Search by email…" />
          </div>
          <button className="btn btn--ghost">
            <Filter size={12} strokeWidth={2.4} />
            Filters
            <ChevronDown size={12} strokeWidth={2.4} />
          </button>
          <button className="btn btn--solid">+ Invite user</button>
        </div>
      </div>

      <div className="page__chips">
        {['All', 'Active', 'Trial', 'Suspended', 'Scale plan'].map((c, i) => (
          <span key={c} className={`chip ${i === 0 ? 'chip--active' : ''}`}>{c}</span>
        ))}
      </div>

      <div className="table-card">
        <div className="rt">
          <div className="rt__row rt__row--head">
            <div className="rt__cell rt__cell--check">
              <span className="rt__checkbox" />
            </div>
            <div className="rt__cell rt__cell--user">User</div>
            <div className="rt__cell">Plan</div>
            <div className="rt__cell">Status</div>
            <div className="rt__cell rt__cell--num">Mailboxes</div>
            <div className="rt__cell rt__cell--num">Sends · 30d</div>
            <div className="rt__cell rt__cell--num">Rep</div>
            <div className="rt__cell rt__cell--act" />
          </div>
          {USERS.map((u, i) => (
            <motion.div
              key={u.email}
              className="rt__row"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.03, duration: 0.3 }}
            >
              <div className="rt__cell rt__cell--check">
                <span className="rt__checkbox" />
              </div>
              <div className="rt__cell rt__cell--user">
                <Avatar user={u} size={28} />
                <div className="rt__id">
                  <div className="rt__name">{u.name}</div>
                  <div className="rt__email">{u.email}</div>
                </div>
              </div>
              <div className="rt__cell">
                <span className={`u-plan u-plan--${u.plan.toLowerCase()}`}>{u.plan}</span>
              </div>
              <div className="rt__cell"><StatusPill status={u.status} /></div>
              <div className="rt__cell rt__cell--num">{u.mailboxes}</div>
              <div className="rt__cell rt__cell--num">{u.sends30d.toLocaleString()}</div>
              <div className="rt__cell rt__cell--num">
                {u.rep > 0 ? (
                  <span className="rt__rep">
                    <span
                      className="rt__rep-bar"
                      style={{ background: `conic-gradient(var(--wp-accent) ${u.rep * 360}deg, rgba(255,255,255,0.08) 0)` }}
                    />
                    {u.rep.toFixed(2)}
                  </span>
                ) : (
                  <span className="rt__rep rt__rep--off">—</span>
                )}
              </div>
              <div className="rt__cell rt__cell--act">
                <button className="rt__more"><MoreHorizontal size={14} /></button>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="table-card__foot">
          <span>Showing 1–{USERS.length} of {USERS.length}</span>
          <div className="pager">
            <button className="pager__btn">Prev</button>
            <span className="pager__page">1</span>
            <button className="pager__btn">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 2) PIPELINE CARDS — kanban lanes (Active / Trial / Suspended)
// ===========================================================================
function FullPipelineCards() {
  const lanes: Array<{ key: MockUser['status']; label: string; accent: string }> = [
    { key: 'active', label: 'Active', accent: '#4ade80' },
    { key: 'trial', label: 'Trial', accent: '#fbbf24' },
    { key: 'suspended', label: 'Suspended', accent: '#fca5a5' },
  ];
  return (
    <div className="page page--pipeline">
      <div className="page__topbar">
        <div className="page__crumb">Admin / Users · Pipeline</div>
        <div className="page__count">
          <LayoutGrid size={11} strokeWidth={2.4} />
          Drag cards between lanes (visual mockup)
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Users</h2>
        <div className="page__actions">
          <div className="srch">
            <Search size={13} strokeWidth={2.4} />
            <input className="srch__input" placeholder="Find a user…" />
          </div>
          <button className="btn btn--solid">+ Invite user</button>
        </div>
      </div>

      <div className="lanes">
        {lanes.map((lane) => {
          const list = USERS.filter((u) => u.status === lane.key);
          return (
            <div className="lane" key={lane.key}>
              <div className="lane__head">
                <span className="lane__dot" style={{ background: lane.accent }} />
                <span className="lane__label">{lane.label}</span>
                <span className="lane__count">{list.length}</span>
              </div>
              <div className="lane__body">
                {list.map((u, i) => (
                  <motion.div
                    key={u.email}
                    className="ucard"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
                    whileHover={{ y: -2 }}
                  >
                    <div className="ucard__head">
                      <Avatar user={u} size={32} />
                      <div className="ucard__id">
                        <div className="ucard__name">{u.name}</div>
                        <div className="ucard__email">{u.email}</div>
                      </div>
                    </div>
                    <div className="ucard__meta">
                      <span className={`u-plan u-plan--${u.plan.toLowerCase()}`}>{u.plan}</span>
                      <span className="ucard__sep">·</span>
                      <span>{u.mailboxes} mbx</span>
                      <span className="ucard__sep">·</span>
                      <span>{u.sends30d.toLocaleString()}/30d</span>
                    </div>
                    <div className="ucard__foot">
                      <span className="ucard__joined">joined {u.joined}</span>
                      {u.rep > 0 && (
                        <span className="ucard__rep">
                          <span
                            className="ucard__rep-bar"
                            style={{ background: `conic-gradient(var(--wp-accent) ${u.rep * 360}deg, rgba(255,255,255,0.08) 0)` }}
                          />
                          {u.rep.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
                {list.length === 0 && (
                  <div className="lane__empty">No users in {lane.label.toLowerCase()}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// 3) SPOTLIGHT PROFILE — master-detail with searchable list + rich panel
// ===========================================================================
function FullSpotlightProfile() {
  const [active, setActive] = useState(0);
  const user = USERS[active]!;
  return (
    <div className="page page--spotlight">
      <div className="page__topbar">
        <div className="page__crumb">Admin / Users · Spotlight</div>
        <div className="page__count">
          <UserSearch size={11} strokeWidth={2.4} />
          Master-detail · click any user
        </div>
      </div>

      <div className="spotlight">
        <aside className="spotlight__list">
          <div className="srch srch--block">
            <Search size={13} strokeWidth={2.4} />
            <input className="srch__input" placeholder="Search users…" />
          </div>
          {USERS.map((u, i) => (
            <motion.button
              type="button"
              key={u.email}
              className={`splitem ${i === active ? 'splitem--active' : ''}`}
              onClick={() => setActive(i)}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.04, duration: 0.3 }}
              whileHover={{ x: 2 }}
            >
              <Avatar user={u} size={28} />
              <div className="splitem__id">
                <div className="splitem__name">{u.name}</div>
                <div className="splitem__email">{u.email}</div>
              </div>
              <StatusPill status={u.status} />
            </motion.button>
          ))}
        </aside>

        <motion.div
          className="spotlight__panel"
          key={user.email}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="profile">
            <Avatar user={user} size={72} />
            <div className="profile__id">
              <div className="profile__name">{user.name}</div>
              <div className="profile__email">{user.email}</div>
              <div className="profile__meta">
                <span className={`u-plan u-plan--${user.plan.toLowerCase()}`}>{user.plan}</span>
                <StatusPill status={user.status} />
                <span className="profile__joined">joined {user.joined}</span>
              </div>
            </div>
            <div className="profile__actions">
              <button className="btn btn--ghost">Suspend</button>
              <button className="btn btn--solid">Open workspace</button>
            </div>
          </div>

          <div className="profile__tabs">
            {['Overview', 'Mailboxes', 'Billing', 'Audit log'].map((t, i) => (
              <span key={t} className={`tab ${i === 0 ? 'tab--active' : ''}`}>{t}</span>
            ))}
          </div>

          <div className="profile__grid">
            <div className="profile__stat">
              <span className="profile__stat-label">Mailboxes</span>
              <span className="profile__stat-num">{user.mailboxes}</span>
            </div>
            <div className="profile__stat">
              <span className="profile__stat-label">Sends · 30d</span>
              <span className="profile__stat-num">{user.sends30d.toLocaleString()}</span>
            </div>
            <div className="profile__stat">
              <span className="profile__stat-label">Reputation</span>
              <span className="profile__stat-num">
                {user.rep > 0 ? user.rep.toFixed(2) : '—'}
              </span>
            </div>
            <div className="profile__stat">
              <span className="profile__stat-label">Trend</span>
              <span className="profile__stat-num profile__stat-num--ok">
                <TrendingUp size={14} strokeWidth={2.4} /> +12%
              </span>
            </div>
          </div>

          <div className="profile__chart-card">
            <div className="profile__chart-head">
              <span className="profile__eyebrow">
                <LineChart size={11} strokeWidth={2.4} />
                Send volume · 30 days
              </span>
            </div>
            <svg className="profile__chart" viewBox="0 0 360 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sp-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.5" />
                  <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.polygon
                points="0,80 30,72 60,76 90,60 120,66 150,48 180,54 210,38 240,42 270,28 300,32 330,22 360,18 360,100 0,100"
                fill="url(#sp-fill)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.9 }}
              />
              <motion.polyline
                points="0,80 30,72 60,76 90,60 120,66 150,48 180,54 210,38 240,42 270,28 300,32 330,22 360,18"
                fill="none"
                stroke="var(--wp-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
              />
            </svg>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ===========================================================================
// 4) COHORT ANALYTICS — charts-first, segment cards, retention table
// ===========================================================================
function FullCohortAnalytics() {
  return (
    <div className="page page--cohort">
      <div className="page__topbar">
        <div className="page__crumb">Admin / Users · Analytics</div>
        <div className="page__count">
          <Activity size={11} strokeWidth={2.4} />
          30-day window
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">User analytics</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 30 days <ChevronDown size={11} /></button>
          <button className="btn btn--ghost">Export CSV</button>
        </div>
      </div>

      <div className="seg-grid">
        {[
          { label: 'Active', value: 248, delta: '+12', tone: 'ok' as const },
          { label: 'Trial', value: 34, delta: '+5', tone: 'ok' as const },
          { label: 'Suspended', value: 7, delta: '-2', tone: 'down' as const },
          { label: 'Churned', value: 3, delta: '+1', tone: 'warn' as const },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="seg"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.35 }}
          >
            <span className="seg__label">{s.label}</span>
            <span className="seg__num">{s.value}</span>
            <span className={`seg__delta seg__delta--${s.tone}`}>
              {s.tone === 'down' ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
              {s.delta}
            </span>
          </motion.div>
        ))}
      </div>

      <div className="cohort-grid">
        <div className="cohort-card">
          <div className="cohort-card__head">
            <span className="profile__eyebrow">
              <LineChart size={11} strokeWidth={2.4} />
              Signups · last 30 days
            </span>
          </div>
          <svg className="cohort-chart" viewBox="0 0 400 120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="cohort-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.45" />
                <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.polygon
              points={`${COHORT_PATH} 400,120 0,120`}
              fill="url(#cohort-fill)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.3 }}
            />
            <motion.polyline
              points={COHORT_PATH}
              fill="none"
              stroke="var(--wp-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.8, ease: 'easeOut' }}
            />
          </svg>
        </div>
        <div className="cohort-card">
          <div className="cohort-card__head">
            <span className="profile__eyebrow">Plan mix</span>
          </div>
          <div className="planmix">
            {[
              { plan: 'Scale', pct: 22, color: 'var(--wp-accent)' },
              { plan: 'Growth', pct: 44, color: '#FF8A4B' },
              { plan: 'Starter', pct: 24, color: '#f472b6' },
              { plan: 'Trial', pct: 10, color: '#fbbf24' },
            ].map((p, i) => (
              <div key={p.plan} className="planmix__row">
                <span className="planmix__label">{p.plan}</span>
                <span className="planmix__bar">
                  <motion.span
                    className="planmix__fill"
                    style={{ background: p.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${p.pct}%` }}
                    transition={{ duration: 0.9, delay: 0.3 + i * 0.08, ease: 'easeOut' }}
                  />
                </span>
                <span className="planmix__pct">{p.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="retain">
        <div className="retain__head">
          <span className="profile__eyebrow">Cohort retention · weeks since signup</span>
        </div>
        <div className="retain__grid">
          <div className="retain__row retain__row--head">
            <span>Cohort</span>
            <span>W0</span>
            <span>W1</span>
            <span>W2</span>
            <span>W3</span>
            <span>W4</span>
          </div>
          {RETENTION.map((row, i) => (
            <motion.div
              key={row.cohort}
              className="retain__row"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 + i * 0.05 }}
            >
              <span className="retain__cohort">{row.cohort}</span>
              {row.values.map((v, j) => (
                <span
                  key={j}
                  className="retain__cell"
                  style={{
                    background: `color-mix(in srgb, var(--wp-accent) ${v}%, transparent)`,
                    color: v > 50 ? '#fff' : 'rgba(255,255,255,0.85)',
                  }}
                >
                  {v}%
                </span>
              ))}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

const COHORT_PATH =
  '0,90 30,82 60,86 90,72 120,76 150,60 180,64 210,50 240,52 270,40 300,42 330,28 360,32 400,22';

const RETENTION = [
  { cohort: 'Apr w1', values: [100, 88, 72, 65, 58] },
  { cohort: 'Apr w2', values: [100, 84, 70, 62, 55] },
  { cohort: 'Apr w3', values: [100, 90, 78, 70, 0] },
  { cohort: 'Apr w4', values: [100, 86, 74, 0, 0] },
  { cohort: 'May w1', values: [100, 92, 0, 0, 0] },
];

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'roster-table',
    name: 'Roster Table',
    tagline: 'Dense sortable table — classic SaaS users page.',
    bullets: [
      'Search · filter chips · bulk-select column',
      'Inline plan + status pills, conic-ring reputation, row actions',
      'Pagination footer at the bottom',
      'Best when admins primarily scan + take action on many users',
    ],
    icon: Table,
    Full: FullRosterTable,
  },
  {
    code: 'pipeline-cards',
    name: 'Pipeline Cards',
    tagline: 'Kanban lanes — Active / Trial / Suspended.',
    bullets: [
      'Three lanes color-coded by status',
      'Each user is a hover-lifting card with plan + mailboxes + sends',
      'Stagger entry animation per card',
      'Best when admins manage upgrades/suspensions as a workflow',
    ],
    icon: LayoutGrid,
    Full: FullPipelineCards,
  },
  {
    code: 'spotlight-profile',
    name: 'Spotlight Profile',
    tagline: 'Master-detail — searchable list + rich profile panel.',
    bullets: [
      'Click any user on the left to swap the right panel',
      'Big profile header with plan, status, joined date, actions',
      'Stat grid + animated send-volume chart inside the panel',
      'Best when each user case warrants deep inspection',
    ],
    icon: UserSearch,
    Full: FullSpotlightProfile,
  },
  {
    code: 'cohort-analytics',
    name: 'Cohort Analytics',
    tagline: 'Charts-first — segments, signups curve, plan mix, retention.',
    bullets: [
      '4 segment cards with deltas (Active / Trial / Suspended / Churned)',
      'Signups area chart + plan-mix horizontal bars',
      'Cohort retention heatmap (weeks since signup)',
      'Best for data-led product / growth review',
    ],
    icon: LineChart,
    Full: FullCohortAnalytics,
  },
];
