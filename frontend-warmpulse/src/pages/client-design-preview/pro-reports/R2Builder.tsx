import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, FileSpreadsheet, FileText, Mail, Send, Sparkles, Users, Wand2 } from 'lucide-react';
import { DEMO_MAILBOXES } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { REPORT_TYPE_META, type ReportFormat, type ReportType } from './demoReports';

/**
 * R2 — Builder Workspace. Left: report builder controls, right: live preview.
 */
export function R2Builder() {
  const [type, setType] = useState<ReportType>('warmth');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [schedule, setSchedule] = useState<'once' | 'weekly' | 'monthly'>('weekly');
  const [selectedMailboxes, setSelectedMailboxes] = useState<Set<string>>(new Set(DEMO_MAILBOXES.map((m) => m.id)));

  const meta = REPORT_TYPE_META[type];
  const Icon = meta.Icon;

  const toggleMb = (id: string) => {
    const next = new Set(selectedMailboxes);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedMailboxes(next);
  };

  return (
    <div className="r2">
      {/* Controls */}
      <aside className="r2__controls">
        <header className="r2__controls-head">
          <span className="r2-eyebrow"><Wand2 size={11} strokeWidth={2.4} />Build a report</span>
          <h2 className="r2__controls-title">Configure & preview</h2>
        </header>

        {/* Report type */}
        <section className="r2__section">
          <label className="r2__label">Report type</label>
          <div className="r2__type-grid">
            {(Object.keys(REPORT_TYPE_META) as ReportType[]).map((t) => {
              const m = REPORT_TYPE_META[t];
              const TIcon = m.Icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`r2__type r2__type--${m.tone} ${active ? 'r2__type--active' : ''}`}
                >
                  <span className={`r2__type-icon r2__type-icon--${m.tone}`}><TIcon size={12} strokeWidth={2.4} /></span>
                  <span className="r2__type-name">{m.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Format */}
        <section className="r2__section">
          <label className="r2__label">Format</label>
          <div className="r2__format">
            <button type="button" onClick={() => setFormat('pdf')} className={`r2__fmt ${format === 'pdf' ? 'r2__fmt--active' : ''}`}>
              <FileText size={12} strokeWidth={2.4} />
              <span>PDF</span>
              <span className="r2__fmt-sub">Polished for sharing</span>
            </button>
            <button type="button" onClick={() => setFormat('csv')} className={`r2__fmt ${format === 'csv' ? 'r2__fmt--active' : ''}`}>
              <FileSpreadsheet size={12} strokeWidth={2.4} />
              <span>CSV</span>
              <span className="r2__fmt-sub">Crunch the numbers</span>
            </button>
          </div>
        </section>

        {/* Date range */}
        <section className="r2__section">
          <label className="r2__label">Range</label>
          <div className="r2__range">
            <CalendarRange size={11} strokeWidth={2.4} />
            <span>Last 7 days</span>
            <span className="r2__range-sub">May 7 → May 14</span>
          </div>
        </section>

        {/* Mailboxes */}
        <section className="r2__section">
          <label className="r2__label">
            <Users size={11} strokeWidth={2.4} />
            Mailboxes ({selectedMailboxes.size}/{DEMO_MAILBOXES.length})
          </label>
          <div className="r2__mbs">
            {DEMO_MAILBOXES.map((m) => {
              const checked = selectedMailboxes.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMb(m.id)}
                  className={`r2__mb ${checked ? 'r2__mb--checked' : ''}`}
                >
                  <ProviderSwatch provider={m.provider} size={18} />
                  <span>{m.email.split('@')[0]}</span>
                  {checked && <span className="r2__mb-tick" aria-hidden />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Schedule */}
        <section className="r2__section">
          <label className="r2__label">Schedule</label>
          <div className="r2__schedule">
            {(['once', 'weekly', 'monthly'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSchedule(s)}
                className={`r2__sched ${schedule === s ? 'r2__sched--active' : ''}`}
              >
                {s === 'once' ? 'One-off' : s === 'weekly' ? 'Weekly · Mondays' : 'Monthly · 1st'}
              </button>
            ))}
          </div>
        </section>

        {/* CTA */}
        <footer className="r2__controls-foot">
          <button type="button" className="r2-btn r2-btn--ghost"><Mail size={11} strokeWidth={2.4} />Email to me</button>
          <button type="button" className="r2-btn r2-btn--primary"><Send size={11} strokeWidth={2.4} />Generate now</button>
        </footer>
      </aside>

      {/* Preview */}
      <motion.section
        key={`${type}-${format}-${schedule}`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="r2__preview"
      >
        <header className="r2__preview-head">
          <span className="r2-eyebrow"><Sparkles size={11} strokeWidth={2.4} />Live preview</span>
          <span className="r2__preview-meta">{format.toUpperCase()} · {schedule}</span>
        </header>

        <div className={`r2__cover r2__cover--${meta.tone}`}>
          <div className="r2__cover-band">
            <span className="r2__cover-eyebrow">WARMPULSE · REPORT</span>
            <h3 className="r2__cover-title">{meta.label} report</h3>
            <span className="r2__cover-meta">May 7 → May 14 · {selectedMailboxes.size} mailboxes</span>
          </div>
          <div className="r2__cover-hero">
            <Icon size={56} strokeWidth={1.6} className="r2__cover-hero-icon" />
            <span className="r2__cover-hero-stat">
              <span className="r2__cover-hero-num">
                {type === 'warmth' ? '78' : type === 'engagement' ? '62%' : type === 'placement' ? '87%' : '5'}
              </span>
              <span className="r2__cover-hero-lbl">
                {type === 'warmth' ? 'avg warmth' : type === 'engagement' ? 'open rate' : type === 'placement' ? 'inbox' : 'mailboxes'}
              </span>
            </span>
          </div>
          <div className="r2__cover-body">
            <div className="r2__cover-line" style={{ width: '70%' }} />
            <div className="r2__cover-line" style={{ width: '55%' }} />
            <div className="r2__cover-line" style={{ width: '85%' }} />
            <div className="r2__cover-chart">
              {[55, 70, 65, 80, 75, 88, 82].map((h, i) => (
                <span key={i} style={{ height: `${h}%` }} className={`r2__cover-bar r2__cover-bar--${meta.tone}`} />
              ))}
            </div>
            <div className="r2__cover-line" style={{ width: '60%' }} />
            <div className="r2__cover-line" style={{ width: '45%' }} />
          </div>
          <footer className="r2__cover-foot">
            <span>WarmPulse · {new Date().toLocaleDateString()}</span>
            <span>Page 1 of 6</span>
          </footer>
        </div>
      </motion.section>
    </div>
  );
}
