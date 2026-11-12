import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Calendar, Mail, Pause, Play, Plus, Search, Send, ShieldCheck } from 'lucide-react';
import { DEMO_MAILBOXES, providerLabel } from '../pro-dashboards/demoData';
import { DnsCell, HeroSparkline, ProviderSwatch, StatusPill, toneFor } from './shared';

/**
 * M1 — Split Pane Inbox.
 * Gmail-like: left rail with mailbox list, right pane shows selected mailbox detail.
 */
export function M1SplitPane() {
  const [activeId, setActiveId] = useState(DEMO_MAILBOXES[0]!.id);
  const m = DEMO_MAILBOXES.find((x) => x.id === activeId) ?? DEMO_MAILBOXES[0]!;
  const sentPct = Math.round((m.sentToday / m.dailyTarget) * 100);

  return (
    <div className="m1">
      {/* Left rail */}
      <aside className="m1__rail">
        <header className="m1__rail-head">
          <span className="m1__rail-title">
            <Mail size={12} strokeWidth={2.4} />
            Mailboxes
          </span>
          <span className="m1__rail-count">{DEMO_MAILBOXES.length} / 5</span>
        </header>
        <div className="m1__search">
          <Search size={11} strokeWidth={2.4} />
          <input placeholder="Filter mailboxes…" disabled />
        </div>
        <ul className="m1__list">
          {DEMO_MAILBOXES.map((mb) => (
            <li key={mb.id}>
              <button
                type="button"
                onClick={() => setActiveId(mb.id)}
                className={`m1__row ${mb.id === activeId ? 'm1__row--active' : ''}`}
              >
                <ProviderSwatch provider={mb.provider} size={28} />
                <span className="m1__row-text">
                  <span className="m1__row-email">{mb.email.split('@')[0]}</span>
                  <span className="m1__row-meta">Day {mb.day} · {mb.warmth}/100</span>
                </span>
                <span className={`m1__row-dot m1__row-dot--${toneFor(mb)}`} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="m1__add">
          <Plus size={12} strokeWidth={2.6} />
          Add mailbox
        </button>
      </aside>

      {/* Right pane — selected detail */}
      <motion.section
        key={m.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="m1__pane"
      >
        <header className="m1__pane-head">
          <div className="m1__pane-id">
            <ProviderSwatch provider={m.provider} size={48} />
            <div>
              <span className="m1__pane-eyebrow">
                {providerLabel(m.provider)} · Day {m.day}
              </span>
              <h2 className="m1__pane-email">{m.email}</h2>
              <StatusPill status={m.status} />
            </div>
          </div>
          <div className="m1__pane-actions">
            <button className="m1-btn m1-btn--ghost" type="button">
              {m.status === 'paused' ? <><Play size={11} strokeWidth={2.4} /> Resume</> : <><Pause size={11} strokeWidth={2.4} /> Pause</>}
            </button>
            <button className="m1-btn m1-btn--primary" type="button">
              Open
              <ArrowUpRight size={11} strokeWidth={2.4} />
            </button>
          </div>
        </header>

        {/* KPI strip */}
        <div className="m1__kpis">
          <div className="m1__kpi">
            <span className="m1__kpi-num">{m.warmth}</span>
            <span className="m1__kpi-lbl">Warmth</span>
          </div>
          <div className="m1__kpi">
            <span className="m1__kpi-num">{m.sentToday}<span className="m1__kpi-sfx">/{m.dailyTarget}</span></span>
            <span className="m1__kpi-lbl">Sent today</span>
            <span className="m1__kpi-bar">
              <span style={{ width: `${Math.min(100, sentPct)}%` }} className={`m1__kpi-bar-fill m1__kpi-bar-fill--${toneFor(m)}`} />
            </span>
          </div>
          <div className="m1__kpi">
            <span className="m1__kpi-num">{m.day}<span className="m1__kpi-sfx">/30</span></span>
            <span className="m1__kpi-lbl">Ramp day</span>
          </div>
          <div className="m1__kpi">
            <span className="m1__kpi-num">+{m.spark[m.spark.length - 1]! - m.spark[0]!}</span>
            <span className="m1__kpi-lbl">14d trend</span>
          </div>
        </div>

        {/* Sparkline */}
        <section className="m1__chart">
          <span className="m1__chart-title">
            <Calendar size={11} strokeWidth={2.4} />
            14-day warmth
          </span>
          <HeroSparkline data={m.spark} height={80} />
        </section>

        {/* DNS row */}
        <section className="m1__dns">
          <header className="m1__panel-head">
            <span className="m1__panel-title">
              <ShieldCheck size={11} strokeWidth={2.4} />
              DNS health
            </span>
          </header>
          <div className="m1__dns-cells">
            <span className="m1__dns-row"><span>SPF</span><DnsCell ok={m.spfOk} /></span>
            <span className="m1__dns-row"><span>DKIM</span><DnsCell ok={m.dkimOk} /></span>
            <span className="m1__dns-row"><span>DMARC</span><DnsCell ok={m.dmarcOk} /></span>
          </div>
        </section>

        <section className="m1__send">
          <header className="m1__panel-head">
            <span className="m1__panel-title">
              <Send size={11} strokeWidth={2.4} />
              Recent send
            </span>
          </header>
          <p className="m1__send-text">
            Last warmup send <strong>4 minutes ago</strong> to a Gmail peer.
            Next scheduled send in ~12 minutes.
          </p>
        </section>
      </motion.section>
    </div>
  );
}
