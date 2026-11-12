import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { DEMO_EVENTS, DEMO_MAILBOXES, formatRelTime } from '../pro-dashboards/demoData';
import { ACTION_META } from './shared';
import type { DemoEvent } from '../pro-dashboards/demoData';

/**
 * A5 — Action Lanes. Horizontal swim-lanes by action type.
 * 5 lanes, each is a timeline with events as colored dots.
 * Best for action-type pattern spotting.
 */

const LANES: DemoEvent['action'][] = ['sent', 'opened', 'replied', 'starred', 'spam_rescued'];

// Map a timestamp to a 0-1 position on the timeline (0 = oldest event, 1 = now).
function timelinePos(ts: string, oldest: number, newest: number): number {
  const t = new Date(ts).getTime();
  if (newest === oldest) return 1;
  return Math.max(0, Math.min(1, (t - oldest) / (newest - oldest)));
}

export function A5Lanes() {
  const oldest = Math.min(...DEMO_EVENTS.map((e) => new Date(e.ts).getTime()));
  const newest = Math.max(...DEMO_EVENTS.map((e) => new Date(e.ts).getTime()));

  return (
    <div className="a5">
      <header className="a5__head">
        <span className="a5__eyebrow">
          <Activity size={11} strokeWidth={2.4} />
          Action lanes · {DEMO_EVENTS.length} events from {DEMO_MAILBOXES.length} mailboxes
        </span>
        <span className="a5__head-range">
          {formatRelTime(new Date(oldest).toISOString())} → now
        </span>
      </header>

      <div className="a5__lanes">
        {LANES.map((action, laneIdx) => {
          const events = DEMO_EVENTS.filter((e) => e.action === action);
          const meta = ACTION_META[action];
          const Icon = meta.Icon;
          return (
            <motion.div
              key={action}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: laneIdx * 0.05 }}
              className={`a5__lane a5__lane--${meta.tone}`}
            >
              <div className="a5__lane-head">
                <span className={`a5__lane-icon a5__lane-icon--${meta.tone}`}>
                  <Icon size={11} strokeWidth={2.4} />
                </span>
                <span className="a5__lane-name">{meta.label}</span>
                <span className="a5__lane-count">{events.length}</span>
              </div>
              <div className="a5__lane-track">
                <span className="a5__lane-track-line" />
                {events.map((e) => {
                  const pos = timelinePos(e.ts, oldest, newest);
                  return (
                    <span
                      key={e.id}
                      className={`a5__lane-dot a5__lane-dot--${meta.tone}`}
                      style={{ left: `${pos * 100}%` }}
                      title={`${formatRelTime(e.ts)} · ${e.mailbox.split('@')[0]} → ${e.peer}`}
                    >
                      <span className="a5__lane-tooltip">
                        <span className="a5__lane-tooltip-time">{formatRelTime(e.ts)}</span>
                        <span className="a5__lane-tooltip-mb">{e.mailbox.split('@')[0]}</span>
                        <span className="a5__lane-tooltip-peer">→ {e.peer}</span>
                      </span>
                    </span>
                  );
                })}
              </div>
              <div className="a5__lane-meta">
                <span className="a5__lane-meta-bar">
                  <span
                    className={`a5__lane-meta-fill a5__lane-meta-fill--${meta.tone}`}
                    style={{ width: `${(events.length / DEMO_EVENTS.length) * 100}%` }}
                  />
                </span>
                <span className="a5__lane-meta-pct">
                  {Math.round((events.length / DEMO_EVENTS.length) * 100)}%
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <footer className="a5__foot">
        <span>{formatRelTime(new Date(newest).toISOString())}</span>
        <span className="a5__foot-line" />
        <span>{formatRelTime(new Date(oldest).toISOString())}</span>
      </footer>
    </div>
  );
}
