import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Clock, Layers, Play, Settings2 } from 'lucide-react';
import { TOOLS, TOOL_RUNS, TONE_HEX } from './demoTools';
import type { ToolDef } from './demoTools';

/**
 * T2 — IDE Workspace. Sidebar tool list + right pane with tool details.
 */
export function T2Workspace() {
  const [activeKey, setActiveKey] = useState<ToolDef['key']>(TOOLS[0]!.key);
  const tool = TOOLS.find((t) => t.key === activeKey) ?? TOOLS[0]!;
  const runs = TOOL_RUNS.filter((r) => r.toolKey === tool.key);
  const Icon = tool.Icon;

  return (
    <div className="t2">
      <aside className="t2__rail">
        <header className="t2__rail-head">
          <Layers size={11} strokeWidth={2.4} />
          Tools
        </header>
        <ul className="t2__rail-list">
          {TOOLS.map((t) => {
            const TIcon = t.Icon;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setActiveKey(t.key)}
                  className={`t2__rail-row ${t.key === activeKey ? 't2__rail-row--active' : ''}`}
                >
                  <span className={`t2__rail-icon t2__rail-icon--${t.tone}`}>
                    <TIcon size={13} strokeWidth={2.4} />
                  </span>
                  <span className="t2__rail-text">
                    <span className="t2__rail-name">{t.name}</span>
                    <span className="t2__rail-sub">{t.lastRunRel} · {t.totalRuns} runs</span>
                  </span>
                  <span className={`t2__rail-status t2__rail-status--${t.status}`} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="t2__rail-foot">
          <button className="t2-btn t2-btn--ghost" type="button">
            <Settings2 size={11} strokeWidth={2.4} />
            Tool settings
          </button>
        </footer>
      </aside>

      <motion.section
        key={tool.key}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="t2__pane"
      >
        <header className="t2__pane-head">
          <span className={`t2__pane-icon t2__pane-icon--${tool.tone}`}>
            <Icon size={20} strokeWidth={2.2} />
          </span>
          <div className="t2__pane-id">
            <span className={`t2__pane-status t2__pane-status--${tool.status}`}>
              {tool.statusLabel}
            </span>
            <h2 className="t2__pane-title">{tool.name}</h2>
            <p className="t2__pane-desc">{tool.desc}</p>
          </div>
          <button className={`t2-btn t2-btn--primary t2-btn--${tool.tone}`} type="button">
            <Play size={13} strokeWidth={2.6} fill="currentColor" />
            Run {tool.short}
          </button>
        </header>

        <div className="t2__pane-stats">
          <div className="t2__stat">
            <span className="t2__stat-lbl">Last run</span>
            <span className="t2__stat-val">{tool.lastRunRel}</span>
          </div>
          <div className="t2__stat">
            <span className="t2__stat-lbl">Total runs</span>
            <span className="t2__stat-val">{tool.totalRuns}</span>
          </div>
          <div className="t2__stat">
            <span className="t2__stat-lbl">Success rate</span>
            <span className="t2__stat-val">{tool.successRate}%</span>
          </div>
          <div className="t2__stat">
            <span className="t2__stat-lbl">{tool.highlight.label}</span>
            <span className="t2__stat-val">{tool.highlight.value}</span>
          </div>
        </div>

        <div className="t2__pane-trend">
          <header className="t2-panel-head">
            <span>7-day usage</span>
            <span className="t2-panel-meta">{tool.trend7d.reduce((s, n) => s + n, 0)} runs</span>
          </header>
          <div className="t2__trend-bars">
            {tool.trend7d.map((v, i) => {
              const max = Math.max(1, ...tool.trend7d);
              return (
                <div key={i} className="t2__trend-col">
                  <span style={{ height: `${(v / max) * 100}%`, background: TONE_HEX[tool.tone] }} className="t2__trend-bar" />
                  <span className="t2__trend-day">D{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>

        <section className="t2__pane-runs">
          <header className="t2-panel-head">
            <span><Clock size={11} strokeWidth={2.4} /> Recent runs</span>
            <span className="t2-panel-meta">{runs.length} for this tool</span>
          </header>
          {runs.length === 0 ? (
            <div className="t2__empty">No runs yet.</div>
          ) : (
            <ul className="t2__runs">
              {runs.map((r) => (
                <li key={r.id} className="t2__run">
                  <span className={`t2__run-dot t2__run-dot--${r.status}`} />
                  <span className="t2__run-time">{relTime(r.ts)}</span>
                  <span className="t2__run-mb">{r.mailbox.split('@')[0]}</span>
                  <span className="t2__run-result">{r.result}</span>
                  <ChevronRight size={11} strokeWidth={2.4} className="t2__run-chev" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </motion.section>
    </div>
  );
}

function relTime(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
