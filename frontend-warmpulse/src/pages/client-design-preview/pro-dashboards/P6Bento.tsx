import { Activity, ArrowUpRight, MailOpen, Reply, Send, Sparkles, Star } from 'lucide-react';
import {
  DEMO_AGGREGATE,
  DEMO_EVENTS,
  DEMO_MAILBOXES,
  formatRelTime,
} from './demoData';

/**
 * P6 — Bento Layout. Linear/Raycast asymmetric bento cards.
 *
 * Asymmetric grid — each card has its own size and role.
 *   ┌─────────────────────┬───────────────┬─────────────┐
 *   │       HERO          │  TODAY STATS  │  MAILBOXES  │
 *   │       (big)         │  (2 stacked)  │   (tall)    │
 *   ├─────────────────────┼───────────────┴─────────────┤
 *   │  SENDS 30D (wide)   │       LIVE FEED             │
 *   └─────────────────────┴─────────────────────────────┘
 */
export function P6Bento() {
  return (
    <div className="pd-bento">
      {/* HERO — workspace warmth */}
      <div className="pd-bento__hero">
        <div className="pd-bento__hero-glow" aria-hidden />
        <span className="pd-bento__hero-eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Workspace warmth
        </span>
        <div className="pd-bento__hero-num">{DEMO_AGGREGATE.avgWarmth}</div>
        <div className="pd-bento__hero-rule" />
        <span className="pd-bento__hero-sub">
          Avg across {DEMO_MAILBOXES.length} mailboxes · {DEMO_AGGREGATE.activeCount} active
        </span>
        <div className="pd-bento__hero-mini">
          {DEMO_MAILBOXES.map((m) => (
            <span
              key={m.id}
              className="pd-bento__hero-pill"
              style={{
                background: `linear-gradient(135deg, hsl(${260 + m.warmth}, 70%, 65%) 0%, hsl(${230 + m.warmth}, 60%, 50%) 100%)`,
              }}
            >
              {m.warmth}
            </span>
          ))}
        </div>
      </div>

      {/* TODAY STATS — two stacked */}
      <div className="pd-bento__stat pd-bento__stat--sent">
        <span className="pd-bento__stat-icon"><Send size={14} strokeWidth={2.4} /></span>
        <span className="pd-bento__stat-num">{DEMO_AGGREGATE.totalSentToday}</span>
        <span className="pd-bento__stat-lbl">sent today</span>
        <span className="pd-bento__stat-bar">
          <span style={{ width: `${(DEMO_AGGREGATE.totalSentToday / DEMO_AGGREGATE.totalTarget) * 100}%` }} />
        </span>
      </div>
      <div className="pd-bento__stat pd-bento__stat--opens">
        <span className="pd-bento__stat-icon"><MailOpen size={14} strokeWidth={2.4} /></span>
        <span className="pd-bento__stat-num">{DEMO_AGGREGATE.opensToday}</span>
        <span className="pd-bento__stat-lbl">opens today</span>
        <span className="pd-bento__stat-delta">
          <ArrowUpRight size={10} strokeWidth={2.6} />
          +18%
        </span>
      </div>

      {/* MAILBOXES — tall list */}
      <div className="pd-bento__mailboxes">
        <header className="pd-bento__panel-head">
          <span className="pd-bento__panel-title">Mailboxes</span>
          <span className="pd-bento__panel-count">{DEMO_MAILBOXES.length}</span>
        </header>
        <ul className="pd-bento__mb-list">
          {DEMO_MAILBOXES.map((m) => {
            const tone = m.status === 'paused' ? 'err' : m.warmth >= 80 ? 'ok' : 'warn';
            return (
              <li key={m.id} className="pd-bento__mb-row">
                <span className={`pd-bento__mb-dot pd-bento__mb-dot--${tone}`} />
                <span className="pd-bento__mb-email">{m.email.split('@')[0]}</span>
                <span className="pd-bento__mb-warmth">{m.warmth}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* SENDS 30D — wide sparkline */}
      <div className="pd-bento__sends">
        <header className="pd-bento__panel-head">
          <span className="pd-bento__panel-title">
            <Activity size={11} strokeWidth={2.4} style={{ marginRight: 4 }} />
            Sends · last 30 days
          </span>
          <span className="pd-bento__panel-meta pd-bento__panel-meta--up">+18% wow</span>
        </header>
        <SendsBars />
      </div>

      {/* LIVE FEED */}
      <div className="pd-bento__feed">
        <header className="pd-bento__panel-head">
          <span className="pd-bento__panel-title">Live activity</span>
          <span className="pd-bento__panel-live">
            <span className="pd-bento__panel-live-dot" />
            live
          </span>
        </header>
        <ul className="pd-bento__feed-list">
          {DEMO_EVENTS.slice(0, 5).map((e) => {
            const ActIcon =
              e.action === 'sent' ? Send :
              e.action === 'opened' ? MailOpen :
              e.action === 'replied' ? Reply :
              e.action === 'starred' ? Star : MailOpen;
            return (
              <li key={e.id} className="pd-bento__feed-row">
                <span className={`pd-bento__feed-icon pd-bento__feed-icon--${e.action}`}>
                  <ActIcon size={11} strokeWidth={2.4} />
                </span>
                <span className="pd-bento__feed-text">
                  <strong>{e.mailbox.split('@')[0]}</strong> {e.action.replace('_', ' ')} <span className="pd-bento__feed-peer">{e.peer}</span>
                </span>
                <span className="pd-bento__feed-time">{formatRelTime(e.ts)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SendsBars() {
  const data = [
    12, 15, 14, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45, 48, 50, 52, 55,
    58, 62, 65, 68, 72, 75, 78, 82, 85, 88, 86,
  ];
  const max = Math.max(...data);
  return (
    <div className="pd-bento__sends-bars">
      {data.map((v, i) => (
        <span key={i} style={{ height: `${(v / max) * 100}%` }} className="pd-bento__sends-bar" />
      ))}
    </div>
  );
}
