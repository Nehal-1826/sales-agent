import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { DEMO_REPORTS, REPORT_TYPE_META, relTime, type DemoReport } from './demoReports';

/**
 * R3 — Calendar Heatmap. Monthly calendar with markers per report run.
 */
export function R3Calendar() {
  // Build a 6-row × 7-col grid for the current month + index reports by ISO date.
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const monthStart = new Date(view.year, view.month, 1);
  const monthEnd = new Date(view.year, view.month + 1, 0);
  const startDay = monthStart.getDay(); // 0 = Sun
  const daysInMonth = monthEnd.getDate();

  const reportsByDay = useMemo(() => {
    const map = new Map<string, DemoReport[]>();
    DEMO_REPORTS.forEach((r) => {
      const d = new Date(r.createdAt);
      if (d.getFullYear() === view.year && d.getMonth() === view.month) {
        const key = String(d.getDate());
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(r);
      }
    });
    return map;
  }, [view.year, view.month]);

  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const selectedReports = selectedDay !== null ? (reportsByDay.get(String(selectedDay)) ?? []) : [];

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < startDay; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length < 42) cells.push({ day: null });

  return (
    <div className="r3">
      <header className="r3__head">
        <div>
          <span className="r3-eyebrow"><CalendarDays size={11} strokeWidth={2.4} />Calendar view</span>
          <h2 className="r3__head-title">
            {monthStart.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
        </div>
        <div className="r3__nav">
          <button type="button" className="r3__nav-btn" onClick={() => setView({ year: view.month === 0 ? view.year - 1 : view.year, month: view.month === 0 ? 11 : view.month - 1 })}>
            <ChevronLeft size={13} strokeWidth={2.4} />
          </button>
          <button type="button" className="r3__nav-btn" onClick={() => setView({ year: today.getFullYear(), month: today.getMonth() })}>
            Today
          </button>
          <button type="button" className="r3__nav-btn" onClick={() => setView({ year: view.month === 11 ? view.year + 1 : view.year, month: view.month === 11 ? 0 : view.month + 1 })}>
            <ChevronRight size={13} strokeWidth={2.4} />
          </button>
        </div>
      </header>

      <div className="r3__body">
        {/* Calendar grid */}
        <section className="r3__cal">
          <div className="r3__cal-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <span key={d} className="r3__cal-weekday">{d}</span>
            ))}
          </div>
          <div className="r3__cal-grid">
            {cells.map((c, i) => {
              if (c.day === null) return <span key={i} className="r3__cal-cell r3__cal-cell--empty" />;
              const reports = reportsByDay.get(String(c.day)) ?? [];
              const isToday = c.day === today.getDate() && view.year === today.getFullYear() && view.month === today.getMonth();
              const isSel = selectedDay === c.day;
              return (
                <motion.button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDay(c.day)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: i * 0.005 }}
                  className={`r3__cal-cell ${isToday ? 'r3__cal-cell--today' : ''} ${isSel ? 'r3__cal-cell--sel' : ''} ${reports.length > 0 ? 'r3__cal-cell--has' : ''}`}
                >
                  <span className="r3__cal-day">{c.day}</span>
                  {reports.length > 0 && (
                    <span className="r3__cal-dots">
                      {reports.slice(0, 4).map((r, j) => (
                        <span key={j} className={`r3__cal-dot r3__cal-dot--${REPORT_TYPE_META[r.type].tone}`} />
                      ))}
                      {reports.length > 4 && <span className="r3__cal-more">+{reports.length - 4}</span>}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Legend */}
          <footer className="r3__cal-legend">
            {Object.entries(REPORT_TYPE_META).map(([t, m]) => (
              <span key={t}>
                <span className={`r3__cal-dot r3__cal-dot--${m.tone}`} />
                {m.label}
              </span>
            ))}
          </footer>
        </section>

        {/* Selected-day detail */}
        <aside className="r3__detail">
          <header className="r3__detail-head">
            <span className="r3-eyebrow">Selected day</span>
            <span className="r3__detail-date">
              {selectedDay !== null
                ? new Date(view.year, view.month, selectedDay).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
                : '—'}
            </span>
          </header>

          {selectedReports.length === 0 ? (
            <div className="r3__detail-empty">No reports generated on this day.</div>
          ) : (
            <ul className="r3__detail-list">
              {selectedReports.map((r) => {
                const meta = REPORT_TYPE_META[r.type];
                const Icon = meta.Icon;
                return (
                  <li key={r.id} className="r3__detail-row">
                    <span className={`r3__detail-icon r3__detail-icon--${meta.tone}`}>
                      <Icon size={12} strokeWidth={2.4} />
                    </span>
                    <div className="r3__detail-body">
                      <span className="r3__detail-title">{r.title}</span>
                      <span className="r3__detail-sub">{r.range} · {r.format.toUpperCase()} · {r.sizeKb} KB</span>
                    </div>
                    <span className="r3__detail-time">{relTime(r.createdAt)}</span>
                    <button type="button" className="r3__detail-dl" title="Download">
                      <Download size={11} strokeWidth={2.4} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <footer className="r3__detail-foot">
            <span className="r3__detail-foot-lbl">This month</span>
            <strong className="r3__detail-foot-num">{Array.from(reportsByDay.values()).flat().length}</strong>
            <span className="r3__detail-foot-sub">reports</span>
          </footer>
        </aside>
      </div>
    </div>
  );
}
