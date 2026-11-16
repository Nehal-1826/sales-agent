import { Play, Pause, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  DEMO_AGGREGATE,
  DEMO_MAILBOXES,
  providerLabel,
} from './demoData';

/**
 * P2 — Glass Studio. Spotify Premium aesthetic.
 *
 * Layout:
 *   ┌─ Hero card (frosted glass, big number, gradient art) ┐
 *   ├─ Horizontal mailbox carousel (album-tile style) ─────┤
 *   ├─ KPI strip (4 glass tiles)                           │
 *   └──────────────────────────────────────────────────────┘
 */
export function P2Glass() {
  return (
    <div className="pd-glass">
      <div className="pd-glass__atmosphere" aria-hidden>
        <div className="pd-glass__blob pd-glass__blob--1" />
        <div className="pd-glass__blob pd-glass__blob--2" />
        <div className="pd-glass__blob pd-glass__blob--3" />
      </div>

      {/* Hero — premium subscription-card vibe */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="pd-glass__hero"
      >
        <div className="pd-glass__hero-art" aria-hidden>
          <span className="pd-glass__hero-art-num">{DEMO_AGGREGATE.activeCount}</span>
          <span className="pd-glass__hero-art-lbl">active</span>
        </div>
        <div className="pd-glass__hero-text">
          <span className="pd-glass__pill">
            <Sparkles size={11} strokeWidth={2.4} />
            NOW WARMING
          </span>
          <h2 className="pd-glass__hero-title">Workspace warmth</h2>
          <div className="pd-glass__hero-num">{DEMO_AGGREGATE.avgWarmth}</div>
          <span className="pd-glass__hero-sub">
            avg across {DEMO_MAILBOXES.length} mailboxes · {DEMO_AGGREGATE.totalSentToday} sent today
          </span>
          <button type="button" className="pd-glass__play">
            <Pause size={13} strokeWidth={2.4} fill="currentColor" />
            Engine running
          </button>
        </div>
      </motion.div>

      {/* Mailbox carousel — horizontal scroll, album-tile look */}
      <div className="pd-glass__section">
        <span className="pd-glass__section-title">Mailboxes</span>
        <div className="pd-glass__cards">
          {DEMO_MAILBOXES.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.06 * i }}
              className="pd-glass__card"
            >
              <div className={`pd-glass__card-art pd-glass__card-art--${m.provider}`}>
                <span className="pd-glass__card-art-num">{m.warmth}</span>
                <button type="button" className="pd-glass__card-play">
                  {m.status === 'paused' ? (
                    <Play size={13} strokeWidth={2.6} fill="currentColor" />
                  ) : (
                    <Pause size={13} strokeWidth={2.6} fill="currentColor" />
                  )}
                </button>
              </div>
              <div className="pd-glass__card-text">
                <span className="pd-glass__card-title">{m.email.split('@')[0]}</span>
                <span className="pd-glass__card-sub">
                  {providerLabel(m.provider)} · Day {m.day}
                </span>
                <div className="pd-glass__card-bar">
                  <span
                    className="pd-glass__card-fill"
                    style={{ width: `${(m.sentToday / m.dailyTarget) * 100}%` }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="pd-glass__kpis">
        {[
          { lbl: 'SENT TODAY', val: DEMO_AGGREGATE.totalSentToday, sfx: `/ ${DEMO_AGGREGATE.totalTarget}` },
          { lbl: 'OPENS', val: DEMO_AGGREGATE.opensToday, sfx: 'today' },
          { lbl: 'REPLIES', val: DEMO_AGGREGATE.repliesToday, sfx: 'today' },
          { lbl: 'RESCUED', val: DEMO_AGGREGATE.spamRescuedToday, sfx: 'spam → inbox' },
        ].map((k) => (
          <div key={k.lbl} className="pd-glass__kpi">
            <span className="pd-glass__kpi-num">{k.val}</span>
            <span className="pd-glass__kpi-lbl">
              <span className="pd-glass__kpi-lbl-strong">{k.lbl}</span>
              {' '}
              <span className="pd-glass__kpi-lbl-dim">{k.sfx}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
