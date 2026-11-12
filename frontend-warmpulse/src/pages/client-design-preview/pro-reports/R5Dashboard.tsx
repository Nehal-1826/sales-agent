import { motion } from 'framer-motion';
import { BarChart3, CalendarClock, Download, FileText, Layers, PieChart, Plus, TrendingUp } from 'lucide-react';
import { DEMO_REPORTS, DEMO_SCHEDULED, REPORT_TYPE_META, TONE_HEX, aggregate, relTime, type ReportType } from './demoReports';

/**
 * R5 — Reports Dashboard. KPIs + volume chart + type breakdown.
 */
export function R5Dashboard() {
  const agg = aggregate();

  // Build last 14d daily counts
  const days = 14;
  const dayCounts: number[] = Array.from({ length: days }).map((_, i) => {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - (days - 1 - i));
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return DEMO_REPORTS.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    }).length;
  });

  // Type distribution
  const typeDist = (Object.keys(REPORT_TYPE_META) as ReportType[]).map((t) => ({
    type: t,
    count: DEMO_REPORTS.filter((r) => r.type === t).length,
  }));

  return (
    <div className="r5">
      <header className="r5__head">
        <div>
          <span className="r5-eyebrow"><BarChart3 size={11} strokeWidth={2.4} />Reports dashboard</span>
          <h2 className="r5__head-title">Reporting at a glance</h2>
        </div>
        <button type="button" className="r5-btn r5-btn--primary"><Plus size={11} strokeWidth={2.4} />Generate report</button>
      </header>

      {/* KPI strip */}
      <div className="r5__kpis">
        <Kpi label="Total generated" value={agg.total} Icon={FileText} tone="violet" />
        <Kpi label="Last 30 days" value={agg.last30} Icon={CalendarClock} tone="cyan" delta="+3 vs prev 30d" />
        <Kpi label="Scheduled" value={agg.scheduled} Icon={Layers} tone="green" />
        <Kpi label="Storage" value={`${(agg.sizeKb / 1024).toFixed(1)} MB`} Icon={PieChart} tone="yellow" />
      </div>

      {/* Volume chart + type donut */}
      <div className="r5__row">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="r5__chart"
        >
          <header className="r5-panel-head">
            <span><TrendingUp size={11} strokeWidth={2.4} />Reports per day · last 14d</span>
            <span className="r5-panel-meta">{dayCounts.reduce((s, n) => s + n, 0)} total</span>
          </header>
          <div className="r5__chart-bars">
            {dayCounts.map((v, i) => {
              const max = Math.max(1, ...dayCounts);
              return (
                <div key={i} className="r5__chart-col">
                  <span style={{ height: `${(v / max) * 100}%` }} className="r5__chart-bar" />
                  <span className="r5__chart-day">D-{days - 1 - i}</span>
                </div>
              );
            })}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="r5__types"
        >
          <header className="r5-panel-head">
            <span><PieChart size={11} strokeWidth={2.4} />By type</span>
          </header>
          <TypeDonut dist={typeDist} />
          <ul className="r5__types-legend">
            {typeDist.map((d) => {
              const meta = REPORT_TYPE_META[d.type];
              return (
                <li key={d.type}>
                  <span className={`r5__legend-dot r5__legend-dot--${meta.tone}`} />
                  <span className="r5__legend-name">{meta.label}</span>
                  <span className="r5__legend-pct">{Math.round((d.count / agg.total) * 100)}%</span>
                  <span className="r5__legend-count">{d.count}</span>
                </li>
              );
            })}
          </ul>
        </motion.section>
      </div>

      {/* Recent reports + scheduled */}
      <div className="r5__row">
        <section className="r5__recent">
          <header className="r5-panel-head">
            <span>Recent reports</span>
            <span className="r5-panel-meta">5 most recent</span>
          </header>
          <ul className="r5__recent-list">
            {DEMO_REPORTS.slice(0, 5).map((r) => {
              const meta = REPORT_TYPE_META[r.type];
              return (
                <li key={r.id} className="r5__recent-row">
                  <span className={`r5__recent-icon r5__recent-icon--${meta.tone}`}><meta.Icon size={11} strokeWidth={2.4} /></span>
                  <span className="r5__recent-title">{r.title}</span>
                  <span className="r5__recent-meta">{relTime(r.createdAt)} · {r.format.toUpperCase()}</span>
                  <button type="button" className="r5__recent-dl"><Download size={11} strokeWidth={2.4} /></button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="r5__scheduled">
          <header className="r5-panel-head">
            <span>Scheduled</span>
            <span className="r5-panel-meta">{DEMO_SCHEDULED.length} active</span>
          </header>
          <ul className="r5__sched-list">
            {DEMO_SCHEDULED.map((s) => {
              const meta = REPORT_TYPE_META[s.type];
              return (
                <li key={s.id} className="r5__sched-row">
                  <span className={`r5__sched-icon r5__sched-icon--${meta.tone}`}><meta.Icon size={11} strokeWidth={2.4} /></span>
                  <div className="r5__sched-body">
                    <span className="r5__sched-name">{meta.label} · {s.frequency}</span>
                    <span className="r5__sched-sub">→ {s.recipients.length} {s.recipients.length === 1 ? 'recipient' : 'recipients'}</span>
                  </div>
                  <span className="r5__sched-next">Next: {relTime(s.nextRun)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, Icon, tone, delta }: { label: string; value: number | string; Icon: typeof FileText; tone: string; delta?: string }) {
  return (
    <div className={`r5__kpi r5__kpi--${tone}`}>
      <span className={`r5__kpi-icon r5__kpi-icon--${tone}`}><Icon size={13} strokeWidth={2.4} /></span>
      <span className="r5__kpi-lbl">{label}</span>
      <span className="r5__kpi-val">{value}</span>
      {delta && <span className="r5__kpi-delta">{delta}</span>}
    </div>
  );
}

function TypeDonut({ dist }: { dist: Array<{ type: ReportType; count: number }> }) {
  const total = Math.max(1, dist.reduce((s, d) => s + d.count, 0));
  const R = 38, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="r5__donut">
      <circle cx={50} cy={50} r={R} fill="none" stroke="#1f1f1f" strokeWidth={10} />
      {dist.map((d) => {
        const meta = REPORT_TYPE_META[d.type];
        const len = (d.count / total) * C;
        const dasharray = `${len.toFixed(2)} ${(C - len).toFixed(2)}`;
        const dashoffset = -offset;
        offset += len;
        return (
          <circle
            key={d.type}
            cx={50} cy={50} r={R} fill="none"
            stroke={TONE_HEX[meta.tone]} strokeWidth={10}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform="rotate(-90 50 50)"
          />
        );
      })}
      <text x={50} y={50} textAnchor="middle" dominantBaseline="central" fontSize={20} fontWeight={800} fill="#f4f4f5" fontFamily="Outfit, sans-serif">{total}</text>
      <text x={50} y={66} textAnchor="middle" fontSize={6} fill="#a1a1aa" fontWeight={700} letterSpacing={1}>TOTAL</text>
    </svg>
  );
}
