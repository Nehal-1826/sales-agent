import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, MessagesSquare } from 'lucide-react';
import { DEMO_EVENTS, DEMO_MAILBOXES, formatRelTime } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { ACTION_META, ActionChip } from './shared';
import type { DemoEvent } from '../pro-dashboards/demoData';

/**
 * A6 — Conversation Threads. Gmail-style threaded view.
 * Each warmup conversation = one thread card.
 * Expand to see the back-and-forth chronologically.
 */

interface Thread {
  key: string;          // mailbox|peer
  mailbox: string;
  peer: string;
  events: DemoEvent[];
  lastTs: string;
  outcome: 'replied' | 'opened' | 'sent' | 'starred' | 'spam_rescued';
}

function buildThreads(): Thread[] {
  const map = new Map<string, Thread>();
  DEMO_EVENTS.forEach((e) => {
    const key = `${e.mailbox}|${e.peer}`;
    const t = map.get(key);
    if (!t) {
      map.set(key, {
        key, mailbox: e.mailbox, peer: e.peer,
        events: [e], lastTs: e.ts, outcome: e.action,
      });
    } else {
      t.events.push(e);
      if (new Date(e.ts) > new Date(t.lastTs)) {
        t.lastTs = e.ts;
        // outcome = best signal in the thread (replied > starred > opened > sent > rescued)
        const order: Record<DemoEvent['action'], number> = {
          replied: 5, starred: 4, opened: 3, spam_rescued: 2, sent: 1,
        };
        if (order[e.action] > order[t.outcome]) t.outcome = e.action;
      }
    }
  });
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime(),
  );
}

export function A6Threads() {
  const threads = useMemo(() => buildThreads(), []);
  const [expanded, setExpanded] = useState<string | null>(threads[0]?.key ?? null);

  return (
    <div className="a6">
      <header className="a6__head">
        <span className="a6__eyebrow">
          <MessagesSquare size={11} strokeWidth={2.4} />
          Conversation threads
        </span>
        <span className="a6__head-count">
          {threads.length} threads · {DEMO_EVENTS.length} events
        </span>
      </header>

      <ul className="a6__list">
        {threads.map((t, i) => {
          const isOpen = expanded === t.key;
          const mb = DEMO_MAILBOXES.find((m) => m.email === t.mailbox);
          const meta = ACTION_META[t.outcome];
          return (
            <motion.li
              key={t.key}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: i * 0.025 }}
              className={`a6__thread ${isOpen ? 'a6__thread--open' : ''}`}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : t.key)}
                className="a6__thread-row"
              >
                <span className="a6__thread-chev">
                  {isOpen ? <ChevronDown size={11} strokeWidth={2.4} /> : <ChevronRight size={11} strokeWidth={2.4} />}
                </span>
                {mb && <ProviderSwatch provider={mb.provider} size={24} />}
                <div className="a6__thread-id">
                  <span className="a6__thread-mb">{t.mailbox.split('@')[0]}</span>
                  <span className="a6__thread-arrow">↔</span>
                  <span className="a6__thread-peer">{t.peer}</span>
                </div>
                <span className="a6__thread-count">
                  {t.events.length} {t.events.length === 1 ? 'msg' : 'msgs'}
                </span>
                <span className={`a6__thread-outcome a6__thread-outcome--${meta.tone}`}>
                  {meta.label}
                </span>
                <span className="a6__thread-time">{formatRelTime(t.lastTs)}</span>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="a6__thread-body"
                  >
                    <ul className="a6__thread-events">
                      {[...t.events]
                        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
                        .map((e) => (
                          <li key={e.id} className="a6__thread-event">
                            <span className="a6__thread-event-rail">
                              <span className={`a6__thread-event-dot a6__thread-event-dot--${ACTION_META[e.action].tone}`} />
                            </span>
                            <div className="a6__thread-event-body">
                              <header className="a6__thread-event-head">
                                <ActionChip action={e.action} compact />
                                <span className="a6__thread-event-time">{formatRelTime(e.ts)}</span>
                              </header>
                              {e.subject && <p className="a6__thread-event-subject">"{e.subject}"</p>}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
