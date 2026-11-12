import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Mail, Pause, Play, Plus, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { DEMO_AGGREGATE, DEMO_MAILBOXES, providerLabel, type DemoMailbox } from '../pro-dashboards/demoData';
import { DnsCell, HeroSparkline, MiniSpark, ProviderSwatch, StatusPill, toneFor } from './shared';

/**
 * M6 — Bento Layout.
 * Asymmetric bento grid: hero · DNS matrix · featured drill-in · provider donut · 5 mailbox tiles.
 */
export function M6Bento() {
  const [active, setActive] = useState<string>(DEMO_MAILBOXES[0]!.id);
  const featured = DEMO_MAILBOXES.find((m) => m.id === active) ?? DEMO_MAILBOXES[0]!;
  const fullyValid = DEMO_MAILBOXES.filter((m) => m.spfOk && m.dkimOk && m.dmarcOk).length;

  return (
    <div className="m6">
      {/* HERO */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="m6__hero"
      >
        <div className="m6__hero-glow" aria-hidden />
        <div className="m6__hero-text">
          <span className="m6__hero-eyebrow">
            <Mail size={11} strokeWidth={2.4} />
            All mailboxes
          </span>
          <h2 className="m6__hero-name">{DEMO_MAILBOXES.length} mailboxes warming</h2>
          <p className="m6__hero-desc">
            <strong>{DEMO_AGGREGATE.activeCount} active</strong> · <strong>{DEMO_AGGREGATE.warmupCount} warming</strong> · <strong>{DEMO_AGGREGATE.pausedCount} paused</strong>.
            Avg workspace warmth <strong>{DEMO_AGGREGATE.avgWarmth}/100</strong>.
          </p>
          <div className="m6__hero-stats">
            <span className="m6__hero-stat">
              <span className="m6__hero-stat-num">{DEMO_AGGREGATE.totalSentToday}</span>
              <span className="m6__hero-stat-lbl">sent today</span>
            </span>
            <span className="m6__hero-stat-divider" />
            <span className="m6__hero-stat">
              <span className="m6__hero-stat-num">{DEMO_AGGREGATE.opensToday}</span>
              <span className="m6__hero-stat-lbl">opens</span>
            </span>
            <span className="m6__hero-stat-divider" />
            <span className="m6__hero-stat">
              <span className="m6__hero-stat-num">{DEMO_AGGREGATE.repliesToday}</span>
              <span className="m6__hero-stat-lbl">replies</span>
            </span>
          </div>
        </div>
        <div className="m6__hero-actions">
          <button type="button" className="m6__hero-add">
            <Plus size={14} strokeWidth={2.4} />
            Add mailbox
            <span className="m6__hero-cap">{DEMO_MAILBOXES.length} / 5</span>
          </button>
          <span className="m6__hero-hint">Pro caps at 5 mailboxes</span>
        </div>
      </motion.section>

      {/* DNS MATRIX */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="m6__dns"
      >
        <header className="m6-panel-head">
          <span className="m6-panel-title">
            <ShieldCheck size={12} strokeWidth={2.4} />
            DNS health
          </span>
          <span className="m6-panel-meta">{fullyValid} / {DEMO_MAILBOXES.length} fully valid</span>
        </header>
        <div className="m6__dns-grid">
          <div className="m6__dns-headers">
            <span />
            <span>SPF</span><span>DKIM</span><span>DMARC</span>
          </div>
          {DEMO_MAILBOXES.map((m) => (
            <div key={m.id} className="m6__dns-row">
              <span className="m6__dns-name">{m.email.split('@')[0]}</span>
              <DnsCell ok={m.spfOk} />
              <DnsCell ok={m.dkimOk} />
              <DnsCell ok={m.dmarcOk} />
            </div>
          ))}
        </div>
      </motion.section>

      {/* FEATURED */}
      <motion.section
        key={featured.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="m6__featured"
      >
        <div className={`m6__featured-art m6__featured-art--${featured.provider}`}>
          <span className="m6__featured-art-num">{featured.warmth}</span>
          <span className="m6__featured-art-lbl">warmth</span>
        </div>
        <div className="m6__featured-body">
          <header className="m6__featured-head">
            <div>
              <span className="m6__featured-tag">
                <Sparkles size={10} strokeWidth={2.4} />
                Featured
              </span>
              <h3 className="m6__featured-email">{featured.email}</h3>
              <p className="m6__featured-meta">
                {providerLabel(featured.provider)} · Day {featured.day} · <StatusPill status={featured.status} />
              </p>
            </div>
            <div className="m6__featured-actions">
              <button type="button" className="m6-btn m6-btn--ghost">
                {featured.status === 'paused' ? <><Play size={11} strokeWidth={2.4} /> Resume</> : <><Pause size={11} strokeWidth={2.4} /> Pause</>}
              </button>
              <button type="button" className="m6-btn m6-btn--primary">
                Open
                <ArrowUpRight size={11} strokeWidth={2.4} />
              </button>
            </div>
          </header>
          <div className="m6__featured-stats">
            <FeaturedStat lbl="Sent today" num={featured.sentToday} sub={`/ ${featured.dailyTarget} target`} />
            <FeaturedStat lbl="Day in ramp" num={featured.day} sub="of 30" />
            <FeaturedStat lbl="14d trend" num={`+${featured.spark[featured.spark.length - 1]! - featured.spark[0]!}`} sub="delta" />
            <FeaturedStat lbl="DNS" num={`${[featured.spfOk, featured.dkimOk, featured.dmarcOk].filter(Boolean).length}/3`} sub="valid" />
          </div>
          <HeroSparkline data={featured.spark} height={60} />
        </div>
      </motion.section>

      {/* COVERAGE */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="m6__coverage"
      >
        <header className="m6-panel-head">
          <span className="m6-panel-title">Coverage</span>
          <span className="m6-panel-meta">{DEMO_MAILBOXES.length} mailboxes</span>
        </header>
        <ProviderDonut />
        <div className="m6__coverage-legend">
          <LegendRow tone="violet" label="Gmail" value={3} pct={60} />
          <LegendRow tone="violet-soft" label="Outlook" value={1} pct={20} />
          <LegendRow tone="warning" label="Yahoo" value={1} pct={20} />
        </div>
      </motion.section>

      {/* ALL MAILBOXES */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
        className="m6__all"
      >
        <header className="m6-panel-head m6__all-head">
          <span className="m6-panel-title">All mailboxes</span>
          <span className="m6-panel-meta">click a card to feature it above</span>
        </header>
        <div className="m6__all-grid">
          {DEMO_MAILBOXES.map((m) => (
            <MailboxTile key={m.id} mailbox={m} active={m.id === active} onClick={() => setActive(m.id)} />
          ))}
        </div>
      </motion.section>
    </div>
  );
}

function MailboxTile({ mailbox: m, active, onClick }: { mailbox: DemoMailbox; active: boolean; onClick: () => void }) {
  const tone = toneFor(m);
  const sentPct = Math.round((m.sentToday / m.dailyTarget) * 100);
  return (
    <button type="button" onClick={onClick} className={`m6-tile m6-tile--${tone} ${active ? 'm6-tile--active' : ''}`}>
      <header className="m6-tile__head">
        <ProviderSwatch provider={m.provider} size={26} />
        <StatusPill status={m.status} compact />
      </header>
      <span className="m6-tile__email">{m.email}</span>
      <div className="m6-tile__warmth-row">
        <div className="m6-tile__warmth">
          <span className="m6-tile__warmth-num">{m.warmth}</span>
          <span className="m6-tile__warmth-lbl">warmth</span>
        </div>
        <MiniSpark data={m.spark} tone={tone} width={70} height={22} />
      </div>
      <div className="m6-tile__bar">
        <span style={{ width: `${Math.min(100, sentPct)}%` }} className={`m6-tile__bar-fill m6-tile__bar-fill--${tone}`} />
      </div>
      <footer className="m6-tile__foot">
        <span className="m6-tile__foot-stat"><Send size={9} strokeWidth={2.6} /> {m.sentToday}/{m.dailyTarget}</span>
        <span className="m6-tile__foot-stat">Day {m.day}</span>
      </footer>
    </button>
  );
}

function FeaturedStat({ lbl, num, sub }: { lbl: string; num: string | number; sub: string }) {
  return (
    <div className="m6__featured-stat">
      <span className="m6__featured-stat-lbl">{lbl}</span>
      <span className="m6__featured-stat-num">{num}</span>
      <span className="m6__featured-stat-sub">{sub}</span>
    </div>
  );
}

function LegendRow({ tone, label, value, pct }: { tone: 'violet' | 'violet-soft' | 'warning'; label: string; value: number; pct: number }) {
  return (
    <div className="m6__legend-row">
      <span className={`m6__legend-dot m6__legend-dot--${tone}`} />
      <span className="m6__legend-label">{label}</span>
      <span className="m6__legend-track">
        <span className={`m6__legend-fill m6__legend-fill--${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="m6__legend-val">{value}</span>
    </div>
  );
}

function ProviderDonut() {
  const slices = [
    { value: 3, color: '#F26522' },
    { value: 1, color: '#FF9670' },
    { value: 1, color: '#ffb454' },
  ];
  const total = 5, R = 38, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="m6__donut">
      <circle cx={50} cy={50} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
      {slices.map((s, i) => {
        const len = (s.value / total) * C;
        const dasharray = `${len.toFixed(2)} ${(C - len).toFixed(2)}`;
        const dashoffset = -offset;
        offset += len;
        return (
          <circle key={i} cx={50} cy={50} r={R} fill="none" stroke={s.color} strokeWidth={10}
            strokeDasharray={dasharray} strokeDashoffset={dashoffset}
            transform="rotate(-90 50 50)" strokeLinecap="butt" />
        );
      })}
      <text x={50} y={50} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={800} fill="#f4f4f5" fontFamily="Outfit, sans-serif">5</text>
      <text x={50} y={66} textAnchor="middle" fontSize={6} fill="#a1a1aa" fontWeight={700} letterSpacing={1.5}>MAILBOXES</text>
    </svg>
  );
}
