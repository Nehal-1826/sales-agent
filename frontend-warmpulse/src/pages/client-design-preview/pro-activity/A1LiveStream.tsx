import { motion } from 'framer-motion';
import { useState } from 'react';
import { Filter, Pause, Play } from 'lucide-react';
import { DEMO_EVENTS, DEMO_MAILBOXES, formatRelTime } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { ACTION_META, ActionChip } from './shared';
import type { DemoEvent } from '../pro-dashboards/demoData';

/**
 * A1 — Live Stream. Slack/Twitter-style vertical chronological feed
 * with a live "now playing" indicator. Filter strip at top.
 */

type ActionFilter = DemoEvent['action'] | 'all';

export function A1LiveStream() {
  const [filter, setFilter] = useState<ActionFilter>('all');
  const [live, setLive] = useState(true);

  const filtered = filter === 'all' ? DEMO_EVENTS : DEMO_EVENTS.filter((e) => e.action === filter);

  const counts = {
    all: DEMO_EVENTS.length,
    sent: DEMO_EVENTS.filter((e) => e.action === 'sent').length,
    opened: DEMO_EVENTS.filter((e) => e.action === 'opened').length,
    replied: DEMO_EVENTS.filter((e) => e.action === 'replied').length,
    starred: DEMO_EVENTS.filter((e) => e.action === 'starred').length,
    spam_rescued: DEMO_EVENTS.filter((e) => e.action === 'spam_rescued').length,
  };

  return (
    <div className="a1">
      {/* Top bar */}
      <header className="a1__head">
        <div className="a1__head-left">
          <span className={`a1__live ${live ? 'a1__live--on' : ''}`}>
            <span className="a1__live-dot" />
            {live ? 'LIVE' : 'PAUSED'}
          </span>
          <button type="button" className="a1-btn a1-btn--ghost" onClick={() => setLive(!live)}>
            {live ? <Pause size={11} strokeWidth={2.4} /> : <Play size={11} strokeWidth={2.4} />}
            {live ? 'Pause stream' : 'Resume'}
          </button>
        </div>
        <div className="a1__head-right">
          <Filter size={11} strokeWidth={2.4} style={{ color: 'var(--wp-text-faint)' }} />
          {(['all', 'sent', 'opened', 'replied', 'starred', 'spam_rescued'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`a1__chip ${filter === k ? 'a1__chip--active' : ''} ${k !== 'all' ? `a1__chip--${ACTION_META[k as DemoEvent['action']].tone}` : ''}`}
            >
              {k === 'all' ? 'All' : ACTION_META[k as DemoEvent['action']].label}
              <span className="a1__chip-count">{counts[k]}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Stream */}
      <div className="a1__stream">
        {filtered.map((evt, i) => {
          const mb = DEMO_MAILBOXES.find((m) => m.email === evt.mailbox);
          return (
            <motion.div
              key={evt.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.02 }}
              className="a1__evt"
            >
              <span className="a1__evt-time">{formatRelTime(evt.ts)}</span>
              <span className="a1__evt-rail">
                <span className="a1__evt-rail-dot" />
                {i < filtered.length - 1 && <span className="a1__evt-rail-line" />}
              </span>
              <div className="a1__evt-card">
                <header className="a1__evt-head">
                  {mb && <ProviderSwatch provider={mb.provider} size={20} />}
                  <span className="a1__evt-email">{evt.mailbox.split('@')[0]}</span>
                  <ActionChip action={evt.action} compact />
                  <span className="a1__evt-arrow">→</span>
                  <span className="a1__evt-peer">{evt.peer}</span>
                </header>
                {evt.subject && (
                  <p className="a1__evt-subject">"{evt.subject}"</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
