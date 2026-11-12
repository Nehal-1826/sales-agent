import {
  DEMO_AGGREGATE,
  DEMO_MAILBOXES,
  DEMO_EVENTS,
  formatRelTime,
  providerLabel,
} from './demoData';

/**
 * P4 — Editorial Magazine. Stripe Atlas / Linear changelog refinement.
 *
 * Layout:
 *   ┌─ Masthead (issue no · title · date) ──────────────┐
 *   ├─ Double rule divider                              │
 *   ├─ Hero feature (drop cap + multi-col + big stat)   │
 *   ├─ Mailbox cards as "feature articles"              │
 *   └─ Bottom strip — events as bylines                 │
 */
export function P4Magazine() {
  const issueNo = String(42).padStart(3, '0');
  const date = new Date().toLocaleDateString('en-US', {
    day: '2-digit', month: 'long', year: 'numeric',
  }).toUpperCase();

  return (
    <div className="pd-mag">
      <div className="pd-mag__masthead">
        <span className="pd-mag__mast-no">№ {issueNo}</span>
        <span className="pd-mag__mast-title">WARMPULSE</span>
        <span className="pd-mag__mast-date">{date}</span>
      </div>
      <div className="pd-mag__rule" />
      <div className="pd-mag__rule pd-mag__rule--thin" />

      {/* Hero feature */}
      <section className="pd-mag__hero">
        <div className="pd-mag__hero-text">
          <span className="pd-mag__kicker">THE STATE OF YOUR WARMUP</span>
          <h2 className="pd-mag__hero-title">
            The peer network has your back
          </h2>
          <p className="pd-mag__hero-body">
            <span className="pd-mag__drop">F</span>ive mailboxes warming
            across three providers. Today: <em>{DEMO_AGGREGATE.totalSentToday} peer
            messages sent</em>, <em>{DEMO_AGGREGATE.opensToday} opens</em>, and{' '}
            <em>{DEMO_AGGREGATE.repliesToday} replies</em>. Reputation continues
            to compound — average warmth is{' '}
            <strong>{DEMO_AGGREGATE.avgWarmth}/100</strong>, up steadily over
            the last fortnight. Two boxes ({DEMO_MAILBOXES[0]!.email.split('@')[0]}{' '}
            and {DEMO_MAILBOXES[2]!.email.split('@')[0]}) are above the inbox-safe
            threshold and ready for ramped outbound.
          </p>
          <span className="pd-mag__byline">— WarmPulse Engine</span>
        </div>
        <aside className="pd-mag__hero-stat">
          <div className="pd-mag__big-num">{DEMO_AGGREGATE.avgWarmth}</div>
          <div className="pd-mag__big-rule" />
          <span className="pd-mag__big-lbl">AVG WARMTH</span>
          <span className="pd-mag__big-sub">/ 100 across {DEMO_MAILBOXES.length} mailboxes</span>
        </aside>
      </section>

      <div className="pd-mag__rule pd-mag__rule--thin" />

      {/* Mailbox features */}
      <section className="pd-mag__features">
        <span className="pd-mag__section-title">FEATURED MAILBOXES</span>
        <div className="pd-mag__features-grid">
          {DEMO_MAILBOXES.slice(0, 4).map((m, i) => (
            <article key={m.id} className="pd-mag__feature">
              <span className="pd-mag__feature-no">№ {String(i + 1).padStart(2, '0')}</span>
              <h3 className="pd-mag__feature-title">
                {m.email.split('@')[0]}
              </h3>
              <p className="pd-mag__feature-sub">
                {providerLabel(m.provider)} · Day {m.day} · {m.status}
              </p>
              <div className="pd-mag__feature-stats">
                <div>
                  <span className="pd-mag__feature-stat-num">{m.warmth}</span>
                  <span className="pd-mag__feature-stat-lbl">warmth</span>
                </div>
                <div>
                  <span className="pd-mag__feature-stat-num">{m.sentToday}</span>
                  <span className="pd-mag__feature-stat-lbl">today</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="pd-mag__rule pd-mag__rule--thin" />

      {/* Bylines = events */}
      <section className="pd-mag__bylines">
        <span className="pd-mag__section-title">LIVE FROM THE WIRE</span>
        <ul className="pd-mag__byline-list">
          {DEMO_EVENTS.slice(0, 5).map((e) => (
            <li key={e.id} className="pd-mag__byline-row">
              <span className="pd-mag__byline-time">{formatRelTime(e.ts)}</span>
              <span className={`pd-mag__byline-act pd-mag__byline-act--${e.action}`}>
                {e.action.replace('_', ' ')}
              </span>
              <span className="pd-mag__byline-text">
                <em>{e.mailbox.split('@')[0]}</em> · {e.subject}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
