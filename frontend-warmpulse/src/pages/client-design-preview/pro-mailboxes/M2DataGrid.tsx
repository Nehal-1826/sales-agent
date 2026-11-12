import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Plus, Search } from 'lucide-react';
import { DEMO_AGGREGATE, DEMO_MAILBOXES, providerLabel } from '../pro-dashboards/demoData';
import { DnsCell, MiniSpark, ProviderSwatch, StatusPill, toneFor } from './shared';

/**
 * M2 — Data Grid. Linear/Airtable-style dense table view.
 * Every mailbox is a row. Inline sparklines, sortable headers,
 * total row at the bottom.
 */

type SortKey = 'email' | 'warmth' | 'day' | 'sent' | 'status';

export function M2DataGrid() {
  const [sortKey, setSortKey] = useState<SortKey>('warmth');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...DEMO_MAILBOXES].sort((a, b) => {
    const mul = dir === 'asc' ? 1 : -1;
    if (sortKey === 'email') return a.email.localeCompare(b.email) * mul;
    if (sortKey === 'warmth') return (a.warmth - b.warmth) * mul;
    if (sortKey === 'day') return (a.day - b.day) * mul;
    if (sortKey === 'sent') return (a.sentToday - b.sentToday) * mul;
    return a.status.localeCompare(b.status) * mul;
  });

  const toggle = (k: SortKey) => {
    if (sortKey === k) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(k);
      setDir('desc');
    }
  };

  return (
    <div className="m2">
      {/* Toolbar */}
      <header className="m2__toolbar">
        <div className="m2__toolbar-left">
          <div className="m2__search">
            <Search size={11} strokeWidth={2.4} />
            <input placeholder="Search mailboxes…" disabled />
          </div>
          <button type="button" className="m2-btn m2-btn--ghost">
            <Filter size={11} strokeWidth={2.4} />
            Filter
          </button>
        </div>
        <div className="m2__toolbar-right">
          <span className="m2__toolbar-count">
            {DEMO_MAILBOXES.length} mailboxes · {DEMO_AGGREGATE.activeCount} active
          </span>
          <button type="button" className="m2-btn m2-btn--primary">
            <Plus size={11} strokeWidth={2.4} />
            Add mailbox
          </button>
        </div>
      </header>

      {/* Table */}
      <div className="m2__table" role="table">
        <div className="m2__th" role="row">
          <SortBtn label="Mailbox" k="email" sortKey={sortKey} dir={dir} onClick={toggle} />
          <SortBtn label="Status" k="status" sortKey={sortKey} dir={dir} onClick={toggle} />
          <SortBtn label="Warmth" k="warmth" sortKey={sortKey} dir={dir} onClick={toggle} />
          <span className="m2__th-cell">14d trend</span>
          <SortBtn label="Day" k="day" sortKey={sortKey} dir={dir} onClick={toggle} />
          <SortBtn label="Sent today" k="sent" sortKey={sortKey} dir={dir} onClick={toggle} />
          <span className="m2__th-cell">DNS</span>
          <span className="m2__th-cell m2__th-cell--right">Actions</span>
        </div>

        {sorted.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: i * 0.03 }}
            className="m2__row"
            role="row"
          >
            <span className="m2__cell m2__cell--mailbox">
              <ProviderSwatch provider={m.provider} size={26} />
              <span className="m2__cell-stack">
                <span className="m2__cell-email">{m.email}</span>
                <span className="m2__cell-sub">{providerLabel(m.provider)}</span>
              </span>
            </span>
            <span className="m2__cell">
              <StatusPill status={m.status} compact />
            </span>
            <span className="m2__cell">
              <WarmthBar value={m.warmth} tone={toneFor(m)} />
            </span>
            <span className="m2__cell">
              <MiniSpark data={m.spark} tone={toneFor(m)} width={80} />
            </span>
            <span className="m2__cell m2__cell--mono">
              {m.day}<span className="m2__cell-dim">/30</span>
            </span>
            <span className="m2__cell m2__cell--mono">
              {m.sentToday}<span className="m2__cell-dim">/{m.dailyTarget}</span>
            </span>
            <span className="m2__cell m2__cell--dns">
              <DnsCell ok={m.spfOk} />
              <DnsCell ok={m.dkimOk} />
              <DnsCell ok={m.dmarcOk} />
            </span>
            <span className="m2__cell m2__cell--right">
              <button className="m2-btn m2-btn--ghost m2-btn--sm" type="button">Open</button>
            </span>
          </motion.div>
        ))}

        {/* Total row */}
        <div className="m2__total" role="row">
          <span className="m2__cell m2__cell--total-lbl">Totals across {DEMO_MAILBOXES.length} mailboxes</span>
          <span className="m2__cell" />
          <span className="m2__cell m2__cell--mono">
            Avg <strong>{DEMO_AGGREGATE.avgWarmth}</strong>
          </span>
          <span className="m2__cell" />
          <span className="m2__cell" />
          <span className="m2__cell m2__cell--mono">
            <strong>{DEMO_AGGREGATE.totalSentToday}</strong>
            <span className="m2__cell-dim">/{DEMO_AGGREGATE.totalTarget}</span>
          </span>
          <span className="m2__cell" />
          <span className="m2__cell" />
        </div>
      </div>
    </div>
  );
}

function SortBtn({
  label, k, sortKey, dir, onClick,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button type="button" onClick={() => onClick(k)} className={`m2__th-cell m2__th-btn ${active ? 'm2__th-btn--active' : ''}`}>
      {label}
      <Icon size={10} strokeWidth={2.6} />
    </button>
  );
}

function WarmthBar({ value, tone }: { value: number; tone: 'success' | 'warning' | 'danger' }) {
  return (
    <span className="m2__warmth">
      <span className="m2__warmth-track">
        <span className={`m2__warmth-fill m2__warmth-fill--${tone}`} style={{ width: `${value}%` }} />
      </span>
      <span className="m2__warmth-num">{value}</span>
    </span>
  );
}
