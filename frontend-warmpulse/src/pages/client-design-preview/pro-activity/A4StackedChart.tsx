import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { DEMO_EVENTS, DEMO_MAILBOXES, formatRelTime } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { ACTION_META, ActionChip } from './shared';
import type { DemoEvent } from '../pro-dashboards/demoData';

/**
 * A4 — Stacked Chart. Datadog-style hourly stacked bar.
 * Big chart top, live event tape right.
 */

interface HourBucket {
  hour: number;
  sent: number;
  opened: number;
  replied: number;
  starred: number;
  spam_rescued: number;
}

export function A4StackedChart() {
  const buckets = useMemo(() => {
    const hours = 24;
    const arr: HourBucket[] = Array.from({ length: hours }).map((_, i) => ({
      hour: i,
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescued: 0,
    }));
    DEMO_EVENTS.forEach((e) => {
      const h = new Date(e.ts).getHours();
      const bucket = arr.find((b) => b.hour === h);
      if (!bucket) return;
      bucket[e.action]++;
    });
    // Pad busy hours so the chart looks realistic
    const busy = [9, 10, 11, 14, 15, 16];
    busy.forEach((h) => {
      const b = arr.find((x) => x.hour === h);
      if (!b) return;
      b.sent += 2 + (h % 3);
      b.opened += 3 + (h % 4);
      b.replied += 1;
      if (h % 5 === 0) b.starred += 1;
    });
    return arr;
  }, []);

  const [hovered, setHovered] = useState<number | null>(null);
  const totals = {
    sent: buckets.reduce((s, b) => s + b.sent, 0),
    opened: buckets.reduce((s, b) => s + b.opened, 0),
    replied: buckets.reduce((s, b) => s + b.replied, 0),
    starred: buckets.reduce((s, b) => s + b.starred, 0),
    spam_rescued: buckets.reduce((s, b) => s + b.spam_rescued, 0),
  };
  const maxTotal = Math.max(1, ...buckets.map((b) => b.sent + b.opened + b.replied + b.starred + b.spam_rescued));

  return (
    <div className="a4">
      <div className="a4__main">
        {/* Top KPI strip */}
        <header className="a4__kpis">
          <span className="a4__kpi-eyebrow">
            <Activity size={11} strokeWidth={2.4} />
            24-hour activity
          </span>
          {(['sent', 'opened', 'replied', 'starred', 'spam_rescued'] as const).map((a) => (
            <div key={a} className="a4__kpi">
              <span className={`a4__kpi-dot a4__kpi-dot--${ACTION_META[a].tone}`} />
              <span className="a4__kpi-num">{totals[a]}</span>
              <span className="a4__kpi-lbl">{ACTION_META[a].label}</span>
            </div>
          ))}
        </header>

        {/* Stacked chart */}
        <section className="a4__chart">
          <div className="a4__chart-grid" aria-hidden>
            {[0, 25, 50, 75, 100].map((p) => (
              <span key={p} style={{ bottom: `${p}%` }} className="a4__chart-grid-line">
                <span className="a4__chart-grid-lbl">
                  {Math.round((maxTotal * p) / 100)}
                </span>
              </span>
            ))}
          </div>
          <div className="a4__chart-bars">
            {buckets.map((b, i) => {
              const total = b.sent + b.opened + b.replied + b.starred + b.spam_rescued;
              return (
                <div
                  key={i}
                  className={`a4__bar ${hovered === i ? 'a4__bar--hover' : ''}`}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {total > 0 && (
                    <div className="a4__bar-stack" style={{ height: `${(total / maxTotal) * 100}%` }}>
                      {(['spam_rescued', 'starred', 'replied', 'opened', 'sent'] as const).map((a) => {
                        const v = b[a];
                        if (v === 0) return null;
                        return (
                          <motion.span
                            key={a}
                            className={`a4__bar-seg a4__bar-seg--${ACTION_META[a].tone}`}
                            initial={{ height: 0 }}
                            animate={{ height: `${(v / total) * 100}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.02 }}
                          />
                        );
                      })}
                    </div>
                  )}
                  <span className="a4__bar-lbl">{i % 4 === 0 ? `${b.hour}h` : ''}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Live tape */}
      <aside className="a4__tape">
        <header className="a4__tape-head">
          <span className="a4__tape-eyebrow">Live tape</span>
          <span className="a4__tape-live">
            <span className="a4__tape-live-dot" />
            LIVE
          </span>
        </header>
        <div className="a4__tape-list">
          {DEMO_EVENTS.slice(0, 12).map((evt, i) => (
            <motion.div
              key={evt.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, delay: i * 0.03 }}
              className="a4__tape-row"
            >
              <span className="a4__tape-time">{formatRelTime(evt.ts)}</span>
              <EventInline evt={evt} />
            </motion.div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function EventInline({ evt }: { evt: DemoEvent }) {
  const mb = DEMO_MAILBOXES.find((m) => m.email === evt.mailbox);
  return (
    <div className="a4__tape-evt">
      <header className="a4__tape-evt-head">
        {mb && <ProviderSwatch provider={mb.provider} size={18} />}
        <span className="a4__tape-evt-mb">{evt.mailbox.split('@')[0]}</span>
        <ActionChip action={evt.action} compact />
      </header>
      <span className="a4__tape-evt-peer">→ {evt.peer}</span>
    </div>
  );
}
