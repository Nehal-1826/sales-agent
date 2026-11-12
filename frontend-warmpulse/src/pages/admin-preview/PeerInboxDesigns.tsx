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
  Clock,
  Eye,
  Filter,
  MoreHorizontal,
  Network,
  Plus,
  Search,
  Sparkles,
  Table2,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import './peer-inbox-designs.css';

/**
 * /admin/peer-inboxes design picker — round 2 (network / timeline /
 * leaderboard / spreadsheet). Same swipe carousel.
 */
export function PeerInboxDesigns() {
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
    <div className="pid">
      <div className="pid__atmosphere" aria-hidden>
        <div className="pid__aurora-1" />
        <div className="pid__aurora-2" />
      </div>

      <header className="pid__head">
        <Link to="/admin/peer-inboxes" className="pid__back">
          ← Back to live peer-inboxes
        </Link>
        <div className="pid__head-row">
          <div>
            <span className="pid__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick a Peer-inboxes design · round 2
            </span>
            <h1 className="pid__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="pid__sub">{design.tagline}</p>
          </div>
          <div className="pid__counter">
            <span className="pid__counter-now">{index + 1}</span>
            <span className="pid__counter-sep">/</span>
            <span className="pid__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="pid__stage">
        <button type="button" className="pid__arrow" onClick={() => go(-1)} aria-label="Previous">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="pid__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="pid__slide"
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
        <button type="button" className="pid__arrow" onClick={() => go(1)} aria-label="Next">
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="pid__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`pid__dot ${i === index ? 'pid__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="pid__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="pid__bullets-row">
        <ul className="pid__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`pid__pick ${isPicked ? 'pid__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="pid__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build peers-{picked}</code> and I'll wire it up against /admin/peer-inboxes.
        </div>
      ) : (
        <div className="pid__hint">← / → keys · click arrows · drag the slide · tap a dot</div>
      )}
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'network-topology' | 'timeline-stream' | 'leaderboard' | 'spreadsheet-view';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Network;
  Full: () => JSX.Element;
}

// ---------------------------------------------------------------------------
// Shared mock peer data — same set across all 4 mockups
// ---------------------------------------------------------------------------

interface MockPeer {
  email: string;
  provider: 'gmail' | 'o365' | 'yahoo';
  rep: number;
  delta: number;
  status: 'active' | 'warming' | 'degraded' | 'offline';
  pool: 'pool-A' | 'pool-B' | 'pool-C' | null;
  sends24h: number;
}

const PEERS: MockPeer[] = [
  { email: 'pulse.warm.01@gmail.com',   provider: 'gmail', rep: 0.94, delta: +0.03, status: 'active',   pool: 'pool-A', sends24h: 142 },
  { email: 'pulse.warm.02@gmail.com',   provider: 'gmail', rep: 0.92, delta: +0.02, status: 'active',   pool: 'pool-A', sends24h: 128 },
  { email: 'pulse.warm.03@outlook.com', provider: 'o365',  rep: 0.89, delta: -0.01, status: 'active',   pool: 'pool-B', sends24h: 118 },
  { email: 'pulse.warm.04@gmail.com',   provider: 'gmail', rep: 0.86, delta: +0.04, status: 'active',   pool: 'pool-A', sends24h: 156 },
  { email: 'pulse.warm.05@yahoo.com',   provider: 'yahoo', rep: 0.81, delta: +0.01, status: 'active',   pool: 'pool-C', sends24h: 98 },
  { email: 'pulse.warm.06@outlook.com', provider: 'o365',  rep: 0.78, delta: +0.05, status: 'warming',  pool: 'pool-B', sends24h: 64 },
  { email: 'pulse.warm.07@gmail.com',   provider: 'gmail', rep: 0.76, delta: +0.06, status: 'warming',  pool: null,     sends24h: 52 },
  { email: 'pulse.warm.08@yahoo.com',   provider: 'yahoo', rep: 0.72, delta: -0.02, status: 'warming',  pool: 'pool-C', sends24h: 88 },
  { email: 'pulse.warm.09@gmail.com',   provider: 'gmail', rep: 0.68, delta: -0.04, status: 'degraded', pool: 'pool-A', sends24h: 36 },
  { email: 'pulse.warm.10@outlook.com', provider: 'o365',  rep: 0.64, delta: -0.08, status: 'degraded', pool: 'pool-B', sends24h: 44 },
  { email: 'pulse.warm.11@gmail.com',   provider: 'gmail', rep: 0.45, delta: -0.12, status: 'degraded', pool: null,     sends24h: 18 },
  { email: 'pulse.warm.12@yahoo.com',   provider: 'yahoo', rep: 0,    delta: -0.45, status: 'offline',  pool: null,     sends24h: 0 },
];

const PROVIDER_EMOJI: Record<MockPeer['provider'], string> = {
  gmail: '✉️',
  o365: '📨',
  yahoo: '📬',
};

function repColor(rep: number): string {
  if (rep >= 0.85) return '#4ade80';
  if (rep >= 0.7) return 'var(--wp-accent)';
  if (rep >= 0.5) return '#fbbf24';
  if (rep > 0) return '#ef4444';
  return 'rgba(255, 255, 255, 0.18)';
}

// ===========================================================================
// 1) NETWORK TOPOLOGY — pool nodes + orbiting peer dots + animated links
// ===========================================================================
function FullNetworkTopology() {
  return (
    <div className="page page--topo">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Peer inboxes · Topology</div>
        <div className="page__count">
          <Network size={11} strokeWidth={2.4} />
          {PEERS.length} peers · 3 pools · live links
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Peer-network topology</h2>
        <div className="page__actions">
          <button className="btn btn--ghost"><Filter size={12} />All providers</button>
          <button className="btn btn--solid"><Plus size={12} />Add peer</button>
        </div>
      </div>

      <div className="topo">
        <svg className="topo__svg" viewBox="0 0 720 420">
          <defs>
            <radialGradient id="topo-pool-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.5" />
              <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="topo-link" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.05" />
              <stop offset="0.5" stopColor="var(--wp-accent)" stopOpacity="0.55" />
              <stop offset="1" stopColor="#FF8A4B" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Pool glow halos */}
          {POOLS.map((p) => (
            <circle key={`g-${p.id}`} cx={p.x} cy={p.y} r={70} fill="url(#topo-pool-glow)" />
          ))}

          {/* Static link lines from each peer to its pool */}
          {PEERS.map((peer, i) => {
            const pool = POOLS.find((p) => p.id === peer.pool);
            if (!pool) return null;
            const pos = peerPos(i);
            return (
              <line
                key={`l-${peer.email}`}
                x1={pos.x}
                y1={pos.y}
                x2={pool.x}
                y2={pool.y}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="1"
              />
            );
          })}

          {/* Animated traffic lines (signal travelling pool→peer) */}
          {PEERS.filter((p) => p.pool).slice(0, 5).map((peer, i) => {
            const pool = POOLS.find((p) => p.id === peer.pool)!;
            const idx = PEERS.indexOf(peer);
            const pos = peerPos(idx);
            return (
              <motion.line
                key={`a-${peer.email}`}
                x1={pool.x}
                y1={pool.y}
                x2={pos.x}
                y2={pos.y}
                stroke="url(#topo-link)"
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: [0, 1, 1], opacity: [0, 0.9, 0] }}
                transition={{
                  duration: 1.8,
                  delay: i * 0.4,
                  repeat: Infinity,
                  repeatDelay: 1.6,
                  ease: 'easeInOut',
                }}
              />
            );
          })}

          {/* Pool nodes */}
          {POOLS.map((p, i) => (
            <g key={p.id}>
              <motion.circle
                cx={p.x}
                cy={p.y}
                r="14"
                fill="none"
                stroke={p.color}
                strokeWidth="1.4"
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ duration: 2.2, delay: i * 0.4, repeat: Infinity, ease: 'easeOut' }}
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              />
              <circle cx={p.x} cy={p.y} r="14" fill={p.color} stroke="#0a0a14" strokeWidth="2" />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#0a0a14" fontSize="10" fontWeight="800">
                {p.id.slice(-1)}
              </text>
              <text x={p.x} y={p.y + 32} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="600" opacity="0.85">
                {p.label}
              </text>
            </g>
          ))}

          {/* Peer dots */}
          {PEERS.map((peer, i) => {
            const pos = peerPos(i);
            return (
              <motion.g
                key={peer.email}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.04, duration: 0.4, ease: 'backOut' }}
              >
                <circle cx={pos.x} cy={pos.y} r="6" fill={repColor(peer.rep)} stroke="#0a0a14" strokeWidth="1.5" />
              </motion.g>
            );
          })}
        </svg>

        <aside className="topo__legend">
          <div className="topo__legend-h">Legend</div>
          {POOLS.map((p) => (
            <div key={p.id} className="topo__leg">
              <span className="topo__leg-dot" style={{ background: p.color }} />
              <span>{p.label}</span>
              <strong>{PEERS.filter((x) => x.pool === p.id).length}</strong>
            </div>
          ))}
          <div className="topo__leg">
            <span className="topo__leg-dot" style={{ background: 'rgba(255,255,255,0.3)' }} />
            <span>Unassigned</span>
            <strong>{PEERS.filter((x) => x.pool === null).length}</strong>
          </div>
          <div className="topo__legend-h" style={{ marginTop: 8 }}>Health</div>
          {[
            { color: '#4ade80', label: '≥ 0.85' },
            { color: 'var(--wp-accent)', label: '0.70 – 0.85' },
            { color: '#fbbf24', label: '0.50 – 0.70' },
            { color: '#ef4444', label: '< 0.50' },
          ].map((row) => (
            <div key={row.label} className="topo__leg">
              <span className="topo__leg-dot" style={{ background: row.color }} />
              <span>{row.label}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

const POOLS = [
  { id: 'pool-A' as const, label: 'Default · A', color: '#4ade80', x: 220, y: 130 },
  { id: 'pool-B' as const, label: 'Enterprise · B', color: '#FF8A4B', x: 520, y: 150 },
  { id: 'pool-C' as const, label: 'Burst · C', color: '#f472b6', x: 380, y: 300 },
];

function peerPos(i: number): { x: number; y: number } {
  const peer = PEERS[i]!;
  const pool = POOLS.find((p) => p.id === peer.pool);
  if (!pool) {
    // Unassigned — scatter top
    const idx = PEERS.filter((p, k) => p.pool === null && k <= i).length - 1;
    return { x: 60 + idx * 70, y: 40 };
  }
  const siblings = PEERS.filter((p) => p.pool === peer.pool);
  const myIdx = siblings.indexOf(peer);
  const angle = (myIdx / siblings.length) * Math.PI * 2 + (pool.x / 100);
  const radius = 56 + (myIdx % 2) * 18;
  return { x: pool.x + Math.cos(angle) * radius, y: pool.y + Math.sin(angle) * radius };
}

// ===========================================================================
// 2) TIMELINE STREAM — chronological event feed
// ===========================================================================
function FullTimelineStream() {
  return (
    <div className="page page--timeline">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Peer inboxes · Activity</div>
        <div className="page__count">
          <Clock size={11} strokeWidth={2.4} />
          last 24h · {EVENTS.length} events
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Activity timeline</h2>
        <div className="page__actions">
          <div className="srch">
            <Search size={13} strokeWidth={2.4} />
            <input className="srch__input" placeholder="Filter by peer or event…" />
          </div>
          <button className="btn btn--solid"><Plus size={12} />Add peer</button>
        </div>
      </div>

      <div className="page__chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['All', 'Sends', 'Replies', 'Bounces', 'Reputation', 'Status'].map((c, i) => (
          <span key={c} className={`tm-chip ${i === 0 ? 'tm-chip--active' : ''}`}>{c}</span>
        ))}
      </div>

      <div className="tm">
        <div className="tm__live">
          <span className="tm__live-dot" />
          live · streaming via /admin/peer-events ws
        </div>
        {EVENTS.map((e, i) => (
          <motion.div
            key={i}
            className={`tm-row tm-row--${e.kind}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.35 }}
          >
            <div className="tm-row__time">
              <span className="tm-row__time-rel">{e.rel}</span>
              <span className="tm-row__time-abs">{e.abs}</span>
            </div>
            <div className="tm-row__rail">
              <span className={`tm-row__dot tm-row__dot--${e.kind}`} />
              {i !== EVENTS.length - 1 && <span className="tm-row__line" />}
            </div>
            <div className="tm-row__body">
              <div className="tm-row__head">
                <span className={`tm-row__kind tm-row__kind--${e.kind}`}>{e.kind}</span>
                <span className="tm-row__peer">
                  {PROVIDER_EMOJI[e.provider]} <strong>{e.peer}</strong>
                </span>
              </div>
              <div className="tm-row__msg">{e.msg}</div>
              {e.meta && (
                <div className="tm-row__meta">
                  {e.meta.map((m, j) => (
                    <span key={j} className="tm-row__meta-item">
                      <span className="tm-row__meta-label">{m.label}</span>
                      <span className="tm-row__meta-value">{m.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const EVENTS: Array<{
  rel: string;
  abs: string;
  kind: 'send' | 'reply' | 'bounce' | 'rep' | 'status';
  peer: string;
  provider: MockPeer['provider'];
  msg: string;
  meta?: Array<{ label: string; value: string }>;
}> = [
  { rel: 'just now', abs: '22:14:08', kind: 'send', peer: 'pulse.warm.04@gmail.com', provider: 'gmail',
    msg: 'Delivered 14 warmup messages in this minute.',
    meta: [{ label: 'pool', value: 'pool-A' }, { label: '24h sends', value: '156' }] },
  { rel: '32s ago', abs: '22:13:36', kind: 'reply', peer: 'pulse.warm.02@gmail.com', provider: 'gmail',
    msg: 'Replied to warmup thread — peer engagement detected.',
    meta: [{ label: 'rep δ', value: '+0.02' }] },
  { rel: '1m ago', abs: '22:13:08', kind: 'rep', peer: 'pulse.warm.06@outlook.com', provider: 'o365',
    msg: 'Reputation rose to 0.78 (warming).',
    meta: [{ label: 'prev', value: '0.73' }, { label: 'rep δ', value: '+0.05' }] },
  { rel: '3m ago', abs: '22:11:14', kind: 'bounce', peer: 'pulse.warm.10@outlook.com', provider: 'o365',
    msg: '2 hard bounces — SMTP returned 550 over the last 5 min.',
    meta: [{ label: 'pool', value: 'pool-B' }, { label: '24h bnc', value: '6' }] },
  { rel: '5m ago', abs: '22:09:02', kind: 'status', peer: 'pulse.warm.12@yahoo.com', provider: 'yahoo',
    msg: 'Marked offline — auth probe failed 3× consecutively.',
    meta: [{ label: 'last ok', value: '4h ago' }] },
  { rel: '7m ago', abs: '22:06:50', kind: 'send', peer: 'pulse.warm.01@gmail.com', provider: 'gmail',
    msg: 'Delivered 12 warmup messages · open rate 91%.',
    meta: [{ label: 'pool', value: 'pool-A' }] },
];

// ===========================================================================
// 3) LEADERBOARD — gold/silver/bronze podium + ranked list
// ===========================================================================
function FullLeaderboard() {
  const ranked = [...PEERS].sort((a, b) => b.rep - a.rep);
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  return (
    <div className="page page--lb">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Peer inboxes · Leaderboard</div>
        <div className="page__count">
          <Trophy size={11} strokeWidth={2.4} />
          ranked by reputation · 24h delta shown
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Reputation leaderboard</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 24h <ChevronDown size={11} /></button>
          <button className="btn btn--solid"><Plus size={12} />Add peer</button>
        </div>
      </div>

      <div className="lb-podium">
        {/* Silver · Gold · Bronze ordering for visual balance */}
        {[podium[1], podium[0], podium[2]].map((p, idx) => {
          if (!p) return null;
          const place = idx === 1 ? 1 : idx === 0 ? 2 : 3;
          return (
            <motion.div
              key={p.email}
              className={`lb-pod lb-pod--${place}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.1, duration: 0.5, ease: 'easeOut' }}
            >
              <div className="lb-pod__medal">
                <Award size={20} strokeWidth={2.4} />
                <span>{place}</span>
              </div>
              <div className="lb-pod__email">
                {PROVIDER_EMOJI[p.provider]} {p.email.split('@')[0]}
              </div>
              <div className="lb-pod__rep" style={{ color: repColor(p.rep) }}>{p.rep.toFixed(2)}</div>
              <div className="lb-pod__delta">
                <TrendingUp size={11} />+{p.delta.toFixed(2)} (24h)
              </div>
              <motion.div
                className="lb-pod__bar"
                initial={{ height: 0 }}
                animate={{ height: place === 1 ? 80 : place === 2 ? 56 : 40 }}
                transition={{ delay: 0.4 + idx * 0.1, duration: 0.6, ease: 'easeOut' }}
              />
            </motion.div>
          );
        })}
      </div>

      <div className="lb-list">
        <div className="lb-list__head">
          <span>#</span>
          <span>Peer</span>
          <span>Pool</span>
          <span className="lb-list__num">Sends 24h</span>
          <span className="lb-list__num">Rep</span>
          <span className="lb-list__num">24h δ</span>
        </div>
        {rest.map((p, i) => (
          <motion.div
            key={p.email}
            className="lb-list__row"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.05, duration: 0.3 }}
          >
            <span className="lb-list__rank">{i + 4}</span>
            <span className="lb-list__peer">
              <span className="lb-list__provider">{PROVIDER_EMOJI[p.provider]}</span>
              {p.email}
            </span>
            <span className="lb-list__pool">{p.pool ?? '—'}</span>
            <span className="lb-list__num">{p.sends24h}</span>
            <span className="lb-list__num" style={{ color: repColor(p.rep) }}>
              {p.rep > 0 ? p.rep.toFixed(2) : 'off'}
            </span>
            <span className={`lb-list__num lb-list__delta lb-list__delta--${p.delta >= 0 ? 'up' : 'down'}`}>
              {p.delta >= 0 ? '+' : ''}{p.delta.toFixed(2)}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 4) SPREADSHEET VIEW — Notion-database with view-switcher
// ===========================================================================
function FullSpreadsheet() {
  const [view, setView] = useState<'list' | 'board' | 'gallery'>('list');
  return (
    <div className="page page--ss">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Peer inboxes · Database</div>
        <div className="page__count">
          <Table2 size={11} strokeWidth={2.4} />
          {PEERS.length} rows · 7 columns
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Peer database</h2>
        <div className="page__actions">
          <div className="srch">
            <Search size={13} strokeWidth={2.4} />
            <input className="srch__input" placeholder="Search…" />
          </div>
          <button className="btn btn--ghost"><Filter size={12} />Filter</button>
          <button className="btn btn--solid"><Plus size={12} />New row</button>
        </div>
      </div>

      <div className="ss-tabs">
        {[
          { key: 'list' as const, label: 'List', icon: Table2 },
          { key: 'board' as const, label: 'Board', icon: Eye },
          { key: 'gallery' as const, label: 'Gallery', icon: Sparkles },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            className={`ss-tab ${view === t.key ? 'ss-tab--active' : ''}`}
            onClick={() => setView(t.key)}
          >
            <t.icon size={11} strokeWidth={2.4} />
            {t.label}
          </button>
        ))}
        <span className="ss-tabs__count">{PEERS.length} rows</span>
      </div>

      {view === 'list' && (
        <div className="ss-grid">
          <div className="ss-row ss-row--head">
            <span className="ss-cell">Peer</span>
            <span className="ss-cell">Status</span>
            <span className="ss-cell">Pool</span>
            <span className="ss-cell">Provider</span>
            <span className="ss-cell ss-cell--num">Sends 24h</span>
            <span className="ss-cell ss-cell--num">Rep</span>
            <span className="ss-cell ss-cell--num">δ</span>
            <span className="ss-cell ss-cell--act" />
          </div>
          {PEERS.map((p, i) => (
            <motion.div
              key={p.email}
              className="ss-row"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 * i }}
            >
              <span className="ss-cell ss-cell--peer">
                <span className="ss-prov">{PROVIDER_EMOJI[p.provider]}</span>
                {p.email}
              </span>
              <span className="ss-cell">
                <span className={`stt stt--${p.status}`}>{p.status}</span>
              </span>
              <span className="ss-cell">
                {p.pool ? <span className="ss-pool">{p.pool}</span> : <span className="ss-empty">—</span>}
              </span>
              <span className="ss-cell">{p.provider}</span>
              <span className="ss-cell ss-cell--num">{p.sends24h}</span>
              <span className="ss-cell ss-cell--num" style={{ color: repColor(p.rep) }}>
                {p.rep > 0 ? p.rep.toFixed(2) : '—'}
              </span>
              <span
                className={`ss-cell ss-cell--num ss-delta ss-delta--${p.delta >= 0 ? 'up' : 'down'}`}
              >
                {p.delta >= 0 ? '+' : ''}{p.delta.toFixed(2)}
              </span>
              <span className="ss-cell ss-cell--act">
                <MoreHorizontal size={13} />
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {view === 'board' && (
        <div className="ss-board">
          {(['active', 'warming', 'degraded', 'offline'] as MockPeer['status'][]).map((s) => (
            <div key={s} className="ss-board__col">
              <div className="ss-board__head">
                <span className={`stt stt--${s}`}>{s}</span>
                <strong>{PEERS.filter((p) => p.status === s).length}</strong>
              </div>
              <div className="ss-board__body">
                {PEERS.filter((p) => p.status === s).map((p, i) => (
                  <motion.div
                    key={p.email}
                    className="ss-bcard"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                  >
                    <div className="ss-bcard__email">{PROVIDER_EMOJI[p.provider]} {p.email}</div>
                    <div className="ss-bcard__meta">
                      <span style={{ color: repColor(p.rep) }}>{p.rep > 0 ? p.rep.toFixed(2) : '—'}</span>
                      <span className="ss-empty">·</span>
                      <span>{p.sends24h} sends</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'gallery' && (
        <div className="ss-gallery">
          {PEERS.map((p, i) => (
            <motion.div
              key={p.email}
              className="ss-gcard"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * i, duration: 0.35, ease: 'easeOut' }}
              whileHover={{ y: -3 }}
            >
              <div className="ss-gcard__cover" style={{ background: `linear-gradient(135deg, ${repColor(p.rep)}, rgba(242, 101, 34, 0.25))` }}>
                <span className="ss-gcard__rep">{p.rep > 0 ? p.rep.toFixed(2) : 'off'}</span>
              </div>
              <div className="ss-gcard__body">
                <div className="ss-gcard__email">{PROVIDER_EMOJI[p.provider]} {p.email}</div>
                <div className="ss-gcard__meta">
                  <span className={`stt stt--${p.status}`}>{p.status}</span>
                  <span>{p.sends24h} sends</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'network-topology',
    name: 'Network Topology',
    tagline: 'Pools as nodes, peers as satellites, live traffic lines.',
    bullets: [
      'Pools sit as bright central nodes with pulsing rings',
      'Peer dots orbit their parent pool, colored by reputation',
      'Animated traffic lines loop pool → peer to show live signal',
      'Right-side legend for pools + health bands',
    ],
    icon: Network,
    Full: FullNetworkTopology,
  },
  {
    code: 'timeline-stream',
    name: 'Timeline Stream',
    tagline: 'Vertical chronological feed of every peer event.',
    bullets: [
      'Filter chips: All / Sends / Replies / Bounces / Reputation / Status',
      'Each event has relative + absolute time, kind tag, peer + provider',
      'Inline meta chips (pool / 24h sends / rep δ) per event',
      '"Live · streaming" indicator at the top of the rail',
    ],
    icon: Clock,
    Full: FullTimelineStream,
  },
  {
    code: 'leaderboard',
    name: 'Leaderboard',
    tagline: 'Gold/silver/bronze podium + ranked list with 24h deltas.',
    bullets: [
      'Top 3 peers on an animated podium with medal + rep bar',
      'Ranked list below with rank, sends, rep colored by band, 24h δ',
      'Window dropdown (Last 24h / 7d / 30d)',
      'Best when admins compete pools / spot rising and falling peers',
    ],
    icon: Trophy,
    Full: FullLeaderboard,
  },
  {
    code: 'spreadsheet-view',
    name: 'Spreadsheet View',
    tagline: 'Notion-database: List / Board / Gallery view switcher.',
    bullets: [
      'List view: every column, dense, scannable',
      'Board view: kanban grouped by status (active/warming/degraded/offline)',
      'Gallery view: gradient cover per peer, marketing-grade',
      'Best for power users who want a flexible data view',
    ],
    icon: Table2,
    Full: FullSpreadsheet,
  },
];
