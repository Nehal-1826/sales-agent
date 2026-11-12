import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, CalendarDays, Plus } from 'lucide-react';
import { DEMO_AGGREGATE, DEMO_MAILBOXES, providerLabel, type DemoMailbox } from '../pro-dashboards/demoData';
import { DnsCell, ProviderSwatch, StatusPill, toneFor } from './shared';

/**
 * M5 — Heatmap Calendar.
 * 5 rows (mailboxes) × 14 cols (days) heatmap.
 * Each cell shows that mailbox's warmth on that day, colored on a violet
 * intensity scale. Right side panel shows hover/selected cell detail.
 */

interface SelectedCell {
  mailbox: DemoMailbox;
  dayIdx: number;
  warmth: number;
}

function dateLabel(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function intensityClass(v: number): string {
  if (v >= 90) return 'm5__cell--l5';
  if (v >= 75) return 'm5__cell--l4';
  if (v >= 60) return 'm5__cell--l3';
  if (v >= 40) return 'm5__cell--l2';
  return 'm5__cell--l1';
}

export function M5Heatmap() {
  const [sel, setSel] = useState<SelectedCell>({
    mailbox: DEMO_MAILBOXES[0]!,
    dayIdx: 13,
    warmth: DEMO_MAILBOXES[0]!.spark[13]!,
  });

  const days = 14;

  return (
    <div className="m5">
      {/* Top bar */}
      <header className="m5__topbar">
        <div>
          <span className="m5__topbar-eyebrow">
            <CalendarDays size={11} strokeWidth={2.4} />
            14-day warmth heatmap
          </span>
          <h2 className="m5__topbar-title">5 mailboxes · 70 cells · all violet, all data</h2>
        </div>
        <div className="m5__topbar-stats">
          <span><strong>{DEMO_AGGREGATE.avgWarmth}</strong> avg warmth</span>
          <span className="m5__topbar-divider" />
          <span><strong>{DEMO_AGGREGATE.totalSentToday}</strong> sent today</span>
          <span className="m5__topbar-divider" />
          <button type="button" className="m5-btn m5-btn--primary">
            <Plus size={11} strokeWidth={2.4} />
            Add mailbox
          </button>
        </div>
      </header>

      <div className="m5__body">
        {/* Heatmap */}
        <section className="m5__heatmap">
          <div className="m5__hm-head">
            <span className="m5__hm-head-spacer" />
            {Array.from({ length: days }).map((_, i) => (
              <span key={i} className="m5__hm-col-lbl">
                {i === 0 || i === days - 1 || i === Math.floor(days / 2) ? dateLabel(days - 1 - i) : ''}
              </span>
            ))}
          </div>

          {DEMO_MAILBOXES.map((m, rowIdx) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: rowIdx * 0.04 }}
              className="m5__hm-row"
            >
              <div className="m5__hm-row-head">
                <ProviderSwatch provider={m.provider} size={22} />
                <span className="m5__hm-row-email">{m.email.split('@')[0]}</span>
                <span className={`m5__hm-row-dot m5__hm-row-dot--${toneFor(m)}`} />
              </div>
              {m.spark.map((v, d) => {
                const isSel = sel.mailbox.id === m.id && sel.dayIdx === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSel({ mailbox: m, dayIdx: d, warmth: v })}
                    onMouseEnter={() => setSel({ mailbox: m, dayIdx: d, warmth: v })}
                    className={`m5__cell ${intensityClass(v)} ${isSel ? 'm5__cell--sel' : ''}`}
                    title={`${m.email.split('@')[0]} · ${dateLabel(days - 1 - d)} · ${v}/100`}
                  />
                );
              })}
              <span className="m5__hm-row-now">{m.warmth}</span>
            </motion.div>
          ))}

          {/* Legend */}
          <footer className="m5__hm-legend">
            <span>Low</span>
            <span className="m5__legend-chip m5__cell--l1" />
            <span className="m5__legend-chip m5__cell--l2" />
            <span className="m5__legend-chip m5__cell--l3" />
            <span className="m5__legend-chip m5__cell--l4" />
            <span className="m5__legend-chip m5__cell--l5" />
            <span>High</span>
          </footer>
        </section>

        {/* Right panel — selected cell drilldown */}
        <aside className="m5__detail">
          <header className="m5__detail-head">
            <span className="m5__detail-eyebrow">Selected cell</span>
            <span className="m5__detail-date">{dateLabel(days - 1 - sel.dayIdx)}</span>
          </header>

          <div className="m5__detail-hero">
            <ProviderSwatch provider={sel.mailbox.provider} size={36} />
            <div>
              <span className="m5__detail-email">{sel.mailbox.email}</span>
              <span className="m5__detail-sub">{providerLabel(sel.mailbox.provider)}</span>
            </div>
          </div>

          <div className="m5__detail-big">
            <span className="m5__detail-big-num">{sel.warmth}</span>
            <span className="m5__detail-big-lbl">warmth on that day</span>
          </div>

          <div className="m5__detail-mini">
            <div className="m5__detail-stat">
              <span className="m5__detail-stat-lbl">Today's warmth</span>
              <span className="m5__detail-stat-num">{sel.mailbox.warmth}</span>
            </div>
            <div className="m5__detail-stat">
              <span className="m5__detail-stat-lbl">Day in ramp</span>
              <span className="m5__detail-stat-num">{sel.mailbox.day}/30</span>
            </div>
            <div className="m5__detail-stat">
              <span className="m5__detail-stat-lbl">Status</span>
              <StatusPill status={sel.mailbox.status} />
            </div>
            <div className="m5__detail-stat m5__detail-stat--dns">
              <span className="m5__detail-stat-lbl">DNS</span>
              <span className="m5__detail-dns-row">
                <DnsCell ok={sel.mailbox.spfOk} />
                <DnsCell ok={sel.mailbox.dkimOk} />
                <DnsCell ok={sel.mailbox.dmarcOk} />
              </span>
            </div>
          </div>

          <button className="m5-btn m5-btn--primary m5-btn--full" type="button">
            Open mailbox
            <ArrowUpRight size={11} strokeWidth={2.4} />
          </button>
        </aside>
      </div>
    </div>
  );
}
