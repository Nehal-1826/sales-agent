import { motion } from 'framer-motion';
import { GripVertical, MoreHorizontal, Plus, Send } from 'lucide-react';
import { DEMO_MAILBOXES, providerLabel, type DemoMailbox, type DemoStatus } from '../pro-dashboards/demoData';
import { DnsCell, MiniSpark, ProviderSwatch, toneFor } from './shared';

/**
 * M3 — Kanban Status Board.
 * Three columns: ACTIVE · WARMING · PAUSED.
 * Each mailbox is a draggable-looking card in its current column.
 */

const COLUMNS: Array<{ status: DemoStatus; title: string; tone: 'success' | 'warning' | 'danger' }> = [
  { status: 'active', title: 'Active', tone: 'success' },
  { status: 'warmup', title: 'Warming up', tone: 'warning' },
  { status: 'paused', title: 'Paused', tone: 'danger' },
];

export function M3Kanban() {
  return (
    <div className="m3">
      {COLUMNS.map((col) => {
        const items = DEMO_MAILBOXES.filter((m) => m.status === col.status);
        return (
          <section key={col.status} className={`m3__col m3__col--${col.tone}`}>
            <header className="m3__col-head">
              <span className={`m3__col-dot m3__col-dot--${col.tone}`} />
              <span className="m3__col-title">{col.title}</span>
              <span className="m3__col-count">{items.length}</span>
              <button type="button" className="m3__col-more" aria-label="more">
                <MoreHorizontal size={13} strokeWidth={2.4} />
              </button>
            </header>

            <div className="m3__col-body">
              {items.length === 0 ? (
                <div className="m3__empty">No mailboxes here.</div>
              ) : (
                items.map((m, i) => <KanbanCard key={m.id} mailbox={m} idx={i} />)
              )}
              <button type="button" className="m3__add-card">
                <Plus size={11} strokeWidth={2.6} />
                Add card
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KanbanCard({ mailbox: m, idx }: { mailbox: DemoMailbox; idx: number }) {
  const tone = toneFor(m);
  const sentPct = Math.round((m.sentToday / m.dailyTarget) * 100);
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: idx * 0.05 }}
      className={`m3-card m3-card--${tone}`}
    >
      <header className="m3-card__head">
        <span className="m3-card__grip" aria-hidden>
          <GripVertical size={11} strokeWidth={2.2} />
        </span>
        <ProviderSwatch provider={m.provider} size={24} />
        <span className="m3-card__email">{m.email.split('@')[0]}</span>
      </header>
      <div className="m3-card__body">
        <div className="m3-card__warmth">
          <span className="m3-card__warmth-num">{m.warmth}</span>
          <span className="m3-card__warmth-lbl">warmth · {providerLabel(m.provider)}</span>
        </div>
        <MiniSpark data={m.spark} tone={tone} width={92} height={26} />
      </div>
      <div className="m3-card__bar">
        <span style={{ width: `${sentPct}%` }} className={`m3-card__bar-fill m3-card__bar-fill--${tone}`} />
      </div>
      <footer className="m3-card__foot">
        <span className="m3-card__chip">
          <Send size={9} strokeWidth={2.6} />
          {m.sentToday}/{m.dailyTarget}
        </span>
        <span className="m3-card__chip">Day {m.day}</span>
        <span className="m3-card__dns">
          <DnsCell ok={m.spfOk} />
          <DnsCell ok={m.dkimOk} />
          <DnsCell ok={m.dmarcOk} />
        </span>
      </footer>
    </motion.article>
  );
}
