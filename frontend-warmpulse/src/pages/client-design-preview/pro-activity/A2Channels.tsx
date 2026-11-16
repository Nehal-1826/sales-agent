import { useState } from 'react';
import { motion } from 'framer-motion';
import { Hash, Search } from 'lucide-react';
import { DEMO_EVENTS, DEMO_MAILBOXES, formatRelTime } from '../pro-dashboards/demoData';
import { ProviderSwatch, toneFor } from '../pro-mailboxes/shared';
import { ActionChip } from './shared';

/**
 * A2 — Mailbox Channels. Slack channels view.
 * Left: 5 mailbox "channels". Right: events from selected mailbox.
 */
export function A2Channels() {
  const [activeId, setActiveId] = useState(DEMO_MAILBOXES[0]!.id);
  const active = DEMO_MAILBOXES.find((m) => m.id === activeId) ?? DEMO_MAILBOXES[0]!;
  const events = DEMO_EVENTS.filter((e) => e.mailbox === active.email);

  return (
    <div className="a2">
      <aside className="a2__sidebar">
        <header className="a2__sidebar-head">
          <Hash size={11} strokeWidth={2.4} />
          <span>Channels</span>
        </header>
        <div className="a2__search">
          <Search size={10} strokeWidth={2.4} />
          <input placeholder="Filter…" disabled />
        </div>
        <ul className="a2__channels">
          {DEMO_MAILBOXES.map((m) => {
            const count = DEMO_EVENTS.filter((e) => e.mailbox === m.email).length;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(m.id)}
                  className={`a2__channel ${m.id === activeId ? 'a2__channel--active' : ''}`}
                >
                  <Hash size={10} strokeWidth={2.4} />
                  <span className="a2__channel-name">{m.email.split('@')[0]}</span>
                  <span className={`a2__channel-dot a2__channel-dot--${toneFor(m)}`} />
                  <span className="a2__channel-count">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="a2__sidebar-foot">
          <span className="a2__sidebar-foot-label">Total events</span>
          <span className="a2__sidebar-foot-num">{DEMO_EVENTS.length}</span>
        </footer>
      </aside>

      <section className="a2__main">
        <header className="a2__main-head">
          <ProviderSwatch provider={active.provider} size={36} />
          <div>
            <h2 className="a2__main-title">
              <Hash size={12} strokeWidth={2.6} style={{ color: 'var(--wp-text-faint)' }} />
              {active.email.split('@')[0]}
            </h2>
            <span className="a2__main-sub">
              {active.email} · Day {active.day} · Warmth {active.warmth}/100
            </span>
          </div>
          <span className="a2__main-count">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </span>
        </header>

        <div className="a2__feed">
          {events.length === 0 ? (
            <div className="a2__empty">No events for this channel.</div>
          ) : (
            events.map((evt, i) => (
              <motion.div
                key={evt.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: i * 0.03 }}
                className="a2__msg"
              >
                <div className="a2__msg-avatar">
                  {evt.mailbox.charAt(0).toUpperCase()}
                </div>
                <div className="a2__msg-body">
                  <header className="a2__msg-head">
                    <span className="a2__msg-name">{evt.mailbox.split('@')[0]}</span>
                    <span className="a2__msg-time">{formatRelTime(evt.ts)}</span>
                  </header>
                  <p className="a2__msg-line">
                    <ActionChip action={evt.action} compact />
                    {' '}
                    <span className="a2__msg-arrow">→</span>{' '}
                    <span className="a2__msg-peer">{evt.peer}</span>
                  </p>
                  {evt.subject && <p className="a2__msg-subject">"{evt.subject}"</p>}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

