import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, FileText, Filter, FolderOpen, Plus, Search, Trash2 } from 'lucide-react';
import { DEMO_REPORTS, REPORT_TYPE_META, relTime, aggregate, type ReportType } from './demoReports';

/**
 * R1 — Report Library. File-manager / Linear-table style.
 */
type Filter = 'all' | ReportType;
type FmtFilter = 'all' | 'pdf' | 'csv';

export function R1Library() {
  const [filter, setFilter] = useState<Filter>('all');
  const [fmt, setFmt] = useState<FmtFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const agg = aggregate();

  const filtered = DEMO_REPORTS.filter((r) =>
    (filter === 'all' || r.type === filter) &&
    (fmt === 'all' || r.format === fmt),
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  return (
    <div className="r1">
      <header className="r1__head">
        <div>
          <span className="r1-eyebrow"><FolderOpen size={11} strokeWidth={2.4} />Report library</span>
          <h2 className="r1__head-title">{agg.total} reports · {(agg.sizeKb / 1024).toFixed(1)} MB</h2>
        </div>
        <div className="r1__head-actions">
          <button type="button" className="r1-btn r1-btn--ghost"><Filter size={11} strokeWidth={2.4} />Filter</button>
          <button type="button" className="r1-btn r1-btn--primary"><Plus size={11} strokeWidth={2.4} />Generate report</button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="r1__toolbar">
        <div className="r1__search">
          <Search size={11} strokeWidth={2.4} />
          <input placeholder="Search reports by title…" disabled />
        </div>
        <div className="r1__chips">
          <Chip label="All" count={DEMO_REPORTS.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          {(Object.keys(REPORT_TYPE_META) as ReportType[]).map((t) => (
            <Chip
              key={t}
              label={REPORT_TYPE_META[t].label}
              count={DEMO_REPORTS.filter((r) => r.type === t).length}
              tone={REPORT_TYPE_META[t].tone}
              active={filter === t}
              onClick={() => setFilter(t)}
            />
          ))}
        </div>
        <div className="r1__fmts">
          <button type="button" onClick={() => setFmt('all')} className={`r1__fmt ${fmt === 'all' ? 'r1__fmt--active' : ''}`}>All</button>
          <button type="button" onClick={() => setFmt('pdf')} className={`r1__fmt ${fmt === 'pdf' ? 'r1__fmt--active r1__fmt--pdf' : ''}`}>PDF</button>
          <button type="button" onClick={() => setFmt('csv')} className={`r1__fmt ${fmt === 'csv' ? 'r1__fmt--active r1__fmt--csv' : ''}`}>CSV</button>
        </div>
      </div>

      {/* Bulk bar (when something selected) */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="r1__bulk"
        >
          <span>{selected.size} selected</span>
          <button type="button" className="r1-btn r1-btn--ghost"><Download size={11} strokeWidth={2.4} />Download</button>
          <button type="button" className="r1-btn r1-btn--ghost-danger"><Trash2 size={11} strokeWidth={2.4} />Delete</button>
          <button type="button" className="r1__bulk-clear" onClick={() => setSelected(new Set())}>Clear</button>
        </motion.div>
      )}

      {/* Table */}
      <div className="r1__table">
        <div className="r1__th">
          <span className="r1__th-check">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          </span>
          <span>Title</span>
          <span>Type</span>
          <span>Range</span>
          <span>Created</span>
          <span>Size</span>
          <span>Highlight</span>
          <span />
        </div>
        {filtered.map((r, i) => {
          const meta = REPORT_TYPE_META[r.type];
          const Icon = meta.Icon;
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: i * 0.02 }}
              className={`r1__row ${selected.has(r.id) ? 'r1__row--selected' : ''}`}
            >
              <span className="r1__cell r1__cell-check">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              </span>
              <span className="r1__cell r1__cell-title">
                <span className={`r1__cell-icon r1__cell-icon--${meta.tone}`}>
                  {r.format === 'pdf' ? <FileText size={12} strokeWidth={2.4} /> : <FileSpreadsheet size={12} strokeWidth={2.4} />}
                </span>
                <span className="r1__cell-title-text">
                  <span className="r1__cell-title-line">{r.title}</span>
                  {r.scheduled && <span className="r1__cell-sched">{r.scheduled} · auto-generated</span>}
                </span>
              </span>
              <span className="r1__cell">
                <span className={`r1__cell-type r1__cell-type--${meta.tone}`}>
                  <Icon size={9} strokeWidth={2.4} />
                  {meta.label}
                </span>
              </span>
              <span className="r1__cell r1__cell-mono">{r.range}</span>
              <span className="r1__cell r1__cell-dim">{relTime(r.createdAt)}</span>
              <span className="r1__cell r1__cell-mono">{r.sizeKb}<span className="r1__cell-dim"> kb</span></span>
              <span className="r1__cell r1__cell-highlight">
                <strong>{r.highlight.value}</strong>
                <span className="r1__cell-dim">{r.highlight.label}</span>
              </span>
              <span className="r1__cell r1__cell-actions">
                <button type="button" className="r1__icon-btn" title="Download"><Download size={11} strokeWidth={2.4} /></button>
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ label, count, tone, active, onClick }: { label: string; count: number; tone?: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`r1__chip ${active ? 'r1__chip--active' : ''} ${tone ? `r1__chip--${tone}` : ''}`}>
      {label}<span className="r1__chip-count">{count}</span>
    </button>
  );
}
