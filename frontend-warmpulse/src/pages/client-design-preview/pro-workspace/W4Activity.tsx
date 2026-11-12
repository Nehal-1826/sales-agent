import { motion } from 'framer-motion';
import { Activity, Filter, RotateCcw } from 'lucide-react';
import { AUDIT, HUE_BG, TEAM, relTime } from './demoWorkspace';

/**
 * W4 — Activity Timeline. Audit-log feed of everything that happens
 * in the workspace.
 */
export function W4Activity() {
  return (
    <div className="w4">
      <header className="w4__head">
        <div>
          <span className="w4-eyebrow"><Activity size={11} strokeWidth={2.4} />Activity log</span>
          <h2 className="w4__head-title">Workspace audit · {AUDIT.length} events</h2>
        </div>
        <div className="w4__head-actions">
          <button type="button" className="w4-btn w4-btn--ghost"><Filter size={11} strokeWidth={2.4} />Filter</button>
          <button type="button" className="w4-btn w4-btn--ghost"><RotateCcw size={11} strokeWidth={2.4} />Refresh</button>
        </div>
      </header>

      <div className="w4__body">
        {/* Filter sidebar */}
        <aside className="w4__filters">
          <header className="w4__filters-head">FILTERS</header>
          <div className="w4__filter-group">
            <span className="w4__filter-lbl">By tone</span>
            <ul className="w4__filter-list">
              <li><span className="w4__filter-dot w4__filter-dot--success" />Success<span className="w4__filter-count">{AUDIT.filter((a) => a.tone === 'success').length}</span></li>
              <li><span className="w4__filter-dot w4__filter-dot--info" />Info<span className="w4__filter-count">{AUDIT.filter((a) => a.tone === 'info').length}</span></li>
              <li><span className="w4__filter-dot w4__filter-dot--warn" />Warn<span className="w4__filter-count">{AUDIT.filter((a) => a.tone === 'warn').length}</span></li>
              <li><span className="w4__filter-dot w4__filter-dot--danger" />Danger<span className="w4__filter-count">{AUDIT.filter((a) => a.tone === 'danger').length}</span></li>
            </ul>
          </div>
          <div className="w4__filter-group">
            <span className="w4__filter-lbl">By actor</span>
            <ul className="w4__filter-list">
              {TEAM.slice(0, 4).map((m) => (
                <li key={m.id}>
                  <span className="w4__filter-avatar" style={{ background: HUE_BG(m.hue) }}>{m.avatar}</span>
                  {m.name.split(' ')[0]}
                  <span className="w4__filter-count">{AUDIT.filter((a) => a.actor === m.email).length}</span>
                </li>
              ))}
              <li>
                <span className="w4__filter-avatar w4__filter-avatar--system">⚙</span>
                system
                <span className="w4__filter-count">{AUDIT.filter((a) => a.actor === 'system').length}</span>
              </li>
            </ul>
          </div>
        </aside>

        {/* Timeline */}
        <section className="w4__timeline">
          {AUDIT.map((e, i) => {
            const member = TEAM.find((t) => t.email === e.actor);
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.025 }}
                className="w4__entry"
              >
                <span className="w4__entry-time">{relTime(e.ts)}</span>
                <span className="w4__entry-rail">
                  <span className={`w4__entry-rail-dot w4__entry-rail-dot--${e.tone}`} />
                  {i < AUDIT.length - 1 && <span className="w4__entry-rail-line" />}
                </span>
                <div className="w4__entry-card">
                  <header className="w4__entry-head">
                    {member ? (
                      <span className="w4__entry-avatar" style={{ background: HUE_BG(member.hue) }}>{member.avatar}</span>
                    ) : (
                      <span className="w4__entry-avatar w4__entry-avatar--system">⚙</span>
                    )}
                    <span className="w4__entry-actor">{member ? member.name : 'System'}</span>
                    <span className="w4__entry-action">{e.action}</span>
                    <span className={`w4__entry-target w4__entry-target--${e.tone}`}>{e.target}</span>
                  </header>
                </div>
              </motion.div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
