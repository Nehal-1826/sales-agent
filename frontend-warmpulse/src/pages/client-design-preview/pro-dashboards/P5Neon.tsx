import { Zap } from 'lucide-react';
import {
  DEMO_AGGREGATE,
  DEMO_MAILBOXES,
  DEMO_SENDS_30D,
} from './demoData';

/**
 * P5 — Neon Synthwave. Cyberpunk hacker aesthetic.
 *
 * Layout:
 *   ┌─ Neon top bar (pink/cyan/green chips) ─────────────┐
 *   ├─ Hero with glowing warmth number                   │
 *   ├─ Per-mailbox neon cards (cycling colors)           │
 *   ├─ Bottom: glowing bar chart 30d                     │
 *   └────────────────────────────────────────────────────┘
 */
export function P5Neon() {
  return (
    <div className="pd-neon">
      <div className="pd-neon__grid" aria-hidden />
      <div className="pd-neon__scanlines" aria-hidden />

      {/* Top chips */}
      <div className="pd-neon__top">
        <span className="pd-neon__chip pd-neon__chip--pink">
          <span className="pd-neon__chip-dot" />
          SYS.ONLINE
        </span>
        <span className="pd-neon__chip pd-neon__chip--cyan">
          ⌬ {DEMO_MAILBOXES.length} MAILBOXES
        </span>
        <span className="pd-neon__chip pd-neon__chip--green">
          ↑ {DEMO_AGGREGATE.totalSentToday} SENT
        </span>
        <span className="pd-neon__chip pd-neon__chip--cyan">
          ⊕ {DEMO_AGGREGATE.opensToday} OPEN
        </span>
        <span className="pd-neon__chip pd-neon__chip--pink">
          ↩ {DEMO_AGGREGATE.repliesToday} REPLY
        </span>
      </div>

      {/* Hero with mega glow */}
      <div className="pd-neon__hero">
        <span className="pd-neon__hero-eyebrow">// WORKSPACE.WARMTH</span>
        <div className="pd-neon__hero-num">{DEMO_AGGREGATE.avgWarmth}</div>
        <div className="pd-neon__hero-rule" />
        <span className="pd-neon__hero-sub">
          AVG ACROSS {DEMO_MAILBOXES.length} ENDPOINTS — UPLINK STABLE
        </span>
      </div>

      {/* Mailbox cards */}
      <div className="pd-neon__cards">
        {DEMO_MAILBOXES.map((m, i) => {
          const tone = i % 3 === 0 ? 'pink' : i % 3 === 1 ? 'cyan' : 'green';
          return (
            <div key={m.id} className={`pd-neon__card pd-neon__card--${tone}`}>
              <span className="pd-neon__card-id">SDR.{String(i + 1).padStart(2, '0')}</span>
              <span className="pd-neon__card-email">{m.email}</span>
              <div className="pd-neon__card-num">{m.warmth}</div>
              <div className="pd-neon__card-meter">
                <span
                  className="pd-neon__card-meter-fill"
                  style={{ width: `${(m.sentToday / m.dailyTarget) * 100}%` }}
                />
              </div>
              <span className="pd-neon__card-bottom">
                <span>{m.sentToday}/{m.dailyTarget}</span>
                <span>D{m.day}</span>
                <span className="pd-neon__card-status">
                  <Zap size={9} fill="currentColor" />
                  {m.status === 'paused' ? 'IDLE' : 'LIVE'}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Bottom bar chart */}
      <div className="pd-neon__chart">
        <span className="pd-neon__chart-title">// SENDS · 30D · TX_HIST</span>
        <div className="pd-neon__bars">
          {DEMO_SENDS_30D.map((v, i) => {
            const max = Math.max(...DEMO_SENDS_30D);
            const tone = i % 3 === 0 ? 'pink' : i % 3 === 1 ? 'cyan' : 'green';
            return (
              <span
                key={i}
                style={{ height: `${(v / max) * 100}%` }}
                className={`pd-neon__bar pd-neon__bar--${tone}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
