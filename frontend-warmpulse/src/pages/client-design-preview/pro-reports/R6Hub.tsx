import { Download, FileSpreadsheet, FileText, FolderOpen, Inbox, Layers, Plus, Send, Sparkles, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { DEMO_REPORTS, DEMO_SCHEDULED, REPORT_TYPE_META, aggregate, relTime } from './demoReports';

/**
 * R6 — Hub. Multi-panel layout: quick actions, recent library, schedules, stats.
 */
export function R6Hub() {
  const agg = aggregate();

  return (
    <div className="r6">
      {/* Header */}
      <header className="r6__head">
        <div>
          <span className="r6-eyebrow"><Layers size={11} strokeWidth={2.4} />Reports hub</span>
          <h2 className="r6__head-title">Everything reports, on one page</h2>
        </div>
        <div className="r6__head-stats">
          <span><strong>{agg.total}</strong> total</span>
          <span className="r6__head-divider" />
          <span><strong>{agg.scheduled}</strong> scheduled</span>
          <span className="r6__head-divider" />
          <span><strong>{(agg.sizeKb / 1024).toFixed(1)} MB</strong> storage</span>
        </div>
      </header>

      <div className="r6__grid">
        {/* Quick generate CTAs */}
        <section className="r6__quick">
          <header className="r6-panel-head">
            <span><Zap size={11} strokeWidth={2.4} />Quick generate</span>
            <span className="r6-panel-meta">One-click report types</span>
          </header>
          <div className="r6__quick-grid">
            {(['warmth', 'engagement', 'placement', 'white_label'] as const).map((t, i) => {
              const m = REPORT_TYPE_META[t];
              const Icon = m.Icon;
              return (
                <motion.button
                  key={t}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  className={`r6__quick-tile r6__quick-tile--${m.tone}`}
                >
                  <span className={`r6__quick-icon r6__quick-icon--${m.tone}`}><Icon size={16} strokeWidth={2.2} /></span>
                  <span className="r6__quick-name">{m.label}</span>
                  <span className="r6__quick-sub">Last 7 days</span>
                  <span className={`r6__quick-cta r6__quick-cta--${m.tone}`}><Send size={10} strokeWidth={2.4} />Run</span>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Schedule overview */}
        <section className="r6__schedule">
          <header className="r6-panel-head">
            <span><Inbox size={11} strokeWidth={2.4} />Scheduled digests</span>
            <button type="button" className="r6-btn r6-btn--ghost"><Plus size={11} strokeWidth={2.4} />Add</button>
          </header>
          <ul className="r6__sched-list">
            {DEMO_SCHEDULED.map((s) => {
              const meta = REPORT_TYPE_META[s.type];
              return (
                <li key={s.id} className="r6__sched-row">
                  <span className={`r6__sched-icon r6__sched-icon--${meta.tone}`}><meta.Icon size={12} strokeWidth={2.4} /></span>
                  <div className="r6__sched-body">
                    <span className="r6__sched-name">{meta.label}</span>
                    <span className="r6__sched-sub">{s.frequency} · {s.recipients.length} {s.recipients.length === 1 ? 'recipient' : 'recipients'}</span>
                  </div>
                  <div className="r6__sched-times">
                    <span className="r6__sched-time">Last run · {relTime(s.lastRun)}</span>
                    <span className="r6__sched-next">Next · {relTime(s.nextRun)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Library / recent */}
        <section className="r6__library">
          <header className="r6-panel-head">
            <span><FolderOpen size={11} strokeWidth={2.4} />Recent reports</span>
            <span className="r6-panel-meta">{agg.last30} this month</span>
          </header>
          <ul className="r6__lib-list">
            {DEMO_REPORTS.slice(0, 6).map((r) => {
              const meta = REPORT_TYPE_META[r.type];
              return (
                <li key={r.id} className="r6__lib-row">
                  <span className={`r6__lib-fmt r6__lib-fmt--${r.format}`}>
                    {r.format === 'pdf' ? <FileText size={11} strokeWidth={2.4} /> : <FileSpreadsheet size={11} strokeWidth={2.4} />}
                  </span>
                  <div className="r6__lib-body">
                    <span className="r6__lib-title">{r.title}</span>
                    <span className="r6__lib-sub">{r.range}</span>
                  </div>
                  <span className={`r6__lib-type r6__lib-type--${meta.tone}`}>{meta.label}</span>
                  <span className="r6__lib-time">{relTime(r.createdAt)}</span>
                  <button type="button" className="r6__lib-dl"><Download size={11} strokeWidth={2.4} /></button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Highlight callout */}
        <section className="r6__highlight">
          <span className="r6__highlight-icon"><Sparkles size={18} strokeWidth={2.2} /></span>
          <div className="r6__highlight-body">
            <span className="r6__highlight-eyebrow">THIS WEEK</span>
            <h3 className="r6__highlight-title">Warmth up 6 pts week-over-week</h3>
            <p className="r6__highlight-desc">
              Your latest weekly digest hits inboxes Monday. Three mailboxes crossed
              80 warmth — Acme is in the inbox-safe zone.
            </p>
          </div>
          <button type="button" className="r6__highlight-btn">
            View latest
            <Send size={11} strokeWidth={2.4} />
          </button>
        </section>
      </div>
    </div>
  );
}
