import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { DEMO_EVENTS, DEMO_MAILBOXES } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { ACTION_META, ActionChip } from './shared';

/**
 * A3 — Heatmap Activity. GitHub contribution-graph style.
 * 5 mailboxes × 24 hours. Each cell shows # events in that hour for that mailbox.
 * Hover/click a cell to see the events.
 */

interface Cell {
  mailboxId: string;
  hour: number;
  count: number;
}

function intensity(n: number, max: number): number {
  if (max === 0) return 0;
  if (n === 0) return 0;
  return Math.min(5, Math.ceil((n / max) * 5));
}

export function A3Heatmap() {
  // Synthesize hour buckets from the 30 demo events (which span ~218 mins).
  // For visual richness, also weight some hours with extra activity.
  const buckets = useMemo(() => {
    const map = new Map<string, number>();
    DEMO_MAILBOXES.forEach((m) => {
      for (let h = 0; h < 24; h++) map.set(`${m.id}-${h}`, 0);
    });
    // Distribute events across hours-of-day using their ts.
    DEMO_EVENTS.forEach((e) => {
      const mb = DEMO_MAILBOXES.find((m) => m.email === e.mailbox);
      if (!mb) return;
      const hour = new Date(e.ts).getHours();
      const k = `${mb.id}-${hour}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    // Pad with synthetic activity on busy hours for visual texture.
    const busyHours = [9, 10, 11, 14, 15, 16];
    DEMO_MAILBOXES.forEach((mb, mi) => {
      busyHours.forEach((h) => {
        const k = `${mb.id}-${h}`;
        const seed = ((mi + 1) * (h + 1)) % 4;
        map.set(k, (map.get(k) ?? 0) + seed);
      });
    });
    return map;
  }, []);

  const max = Math.max(1, ...Array.from(buckets.values()));
  const [selected, setSelected] = useState<Cell>({
    mailboxId: DEMO_MAILBOXES[0]!.id,
    hour: new Date().getHours(),
    count: buckets.get(`${DEMO_MAILBOXES[0]!.id}-${new Date().getHours()}`) ?? 0,
  });

  // Per-mailbox totals
  const mailboxTotals = DEMO_MAILBOXES.map((m) => ({
    mailbox: m,
    total: DEMO_EVENTS.filter((e) => e.mailbox === m.email).length,
  }));

  const selMb = DEMO_MAILBOXES.find((m) => m.id === selected.mailboxId) ?? DEMO_MAILBOXES[0]!;
  const selEvents = DEMO_EVENTS.filter(
    (e) => e.mailbox === selMb.email && new Date(e.ts).getHours() === selected.hour,
  );

  return (
    <div className="a3">
      {/* Top stat strip */}
      <header className="a3__top">
        <span className="a3__top-eyebrow">
          <Activity size={11} strokeWidth={2.4} />
          24-hour activity heatmap
        </span>
        <div className="a3__top-stats">
          {(['sent', 'opened', 'replied', 'starred', 'spam_rescued'] as const).map((a) => (
            <span key={a} className="a3__top-stat">
              <span className={`a3__top-dot a3__top-dot--${ACTION_META[a].tone}`} />
              <strong>{DEMO_EVENTS.filter((e) => e.action === a).length}</strong>
              {ACTION_META[a].label}
            </span>
          ))}
        </div>
      </header>

      <div className="a3__body">
        {/* Heatmap grid */}
        <section className="a3__map">
          {/* Column headers — hours */}
          <div className="a3__map-head">
            <span />
            {Array.from({ length: 24 }).map((_, h) => (
              <span key={h} className="a3__map-col-lbl">
                {h % 6 === 0 ? `${h}h` : ''}
              </span>
            ))}
            <span />
          </div>
          {/* Mailbox rows */}
          {mailboxTotals.map(({ mailbox: m, total }, idx) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.04 }}
              className="a3__map-row"
            >
              <div className="a3__map-row-head">
                <ProviderSwatch provider={m.provider} size={22} />
                <span className="a3__map-row-email">{m.email.split('@')[0]}</span>
              </div>
              {Array.from({ length: 24 }).map((_, h) => {
                const k = `${m.id}-${h}`;
                const n = buckets.get(k) ?? 0;
                const lvl = intensity(n, max);
                const isSel = selected.mailboxId === m.id && selected.hour === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setSelected({ mailboxId: m.id, hour: h, count: n })}
                    onMouseEnter={() => setSelected({ mailboxId: m.id, hour: h, count: n })}
                    className={`a3__cell a3__cell--l${lvl} ${isSel ? 'a3__cell--sel' : ''}`}
                    title={`${m.email.split('@')[0]} · ${h}:00 · ${n} events`}
                  />
                );
              })}
              <span className="a3__map-row-total">{total}</span>
            </motion.div>
          ))}
          {/* Legend */}
          <footer className="a3__legend">
            <span>Less</span>
            {[0, 1, 2, 3, 4, 5].map((lvl) => (
              <span key={lvl} className={`a3__legend-chip a3__cell--l${lvl}`} />
            ))}
            <span>More</span>
          </footer>
        </section>

        {/* Detail panel */}
        <aside className="a3__detail">
          <header className="a3__detail-head">
            <span className="a3__detail-eyebrow">Selected cell</span>
            <span className="a3__detail-hour">{String(selected.hour).padStart(2, '0')}:00 – {String(selected.hour + 1).padStart(2, '0')}:00</span>
          </header>
          <div className="a3__detail-mb">
            <ProviderSwatch provider={selMb.provider} size={32} />
            <div>
              <span className="a3__detail-email">{selMb.email}</span>
              <span className="a3__detail-sub">Day {selMb.day} · {selMb.warmth}/100</span>
            </div>
          </div>
          <div className="a3__detail-big">
            <span className="a3__detail-big-num">{selected.count}</span>
            <span className="a3__detail-big-lbl">events in this window</span>
          </div>
          <div className="a3__detail-events">
            {selEvents.length === 0 ? (
              <div className="a3__detail-empty">No events in this hour.</div>
            ) : (
              selEvents.map((e) => (
                <div key={e.id} className="a3__detail-evt">
                  <ActionChip action={e.action} compact />
                  <span className="a3__detail-peer">{e.peer}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
