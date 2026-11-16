import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Play, Save, Wand2, X } from 'lucide-react';
import { TOOLS, TOOL_RUNS } from './demoTools';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { DEMO_MAILBOXES } from '../pro-dashboards/demoData';
import type { ToolDef } from './demoTools';

/**
 * T6 — Split Workbench. Active tool occupies the main canvas,
 * side pane shows run history. Like a sandbox / playground.
 */
export function T6Workbench() {
  const [activeKey, setActiveKey] = useState<ToolDef['key']>('preview');
  const tool = TOOLS.find((t) => t.key === activeKey) ?? TOOLS[0]!;
  const runs = TOOL_RUNS.filter((r) => r.toolKey === tool.key);
  const Icon = tool.Icon;

  return (
    <div className="t6">
      {/* Top tool selector strip */}
      <header className="t6__tools">
        {TOOLS.map((t) => {
          const TIcon = t.Icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveKey(t.key)}
              className={`t6__tool ${t.key === activeKey ? `t6__tool--active t6__tool--${t.tone}` : ''}`}
            >
              <TIcon size={12} strokeWidth={2.4} />
              {t.short}
            </button>
          );
        })}
      </header>

      <div className="t6__split">
        {/* Main workbench */}
        <motion.section
          key={tool.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="t6__workbench"
        >
          <header className="t6__wb-head">
            <span className={`t6__wb-icon t6__wb-icon--${tool.tone}`}>
              <Icon size={18} strokeWidth={2.2} />
            </span>
            <div className="t6__wb-id">
              <h2 className="t6__wb-title">{tool.name}</h2>
              <p className="t6__wb-desc">{tool.desc}</p>
            </div>
            <span className={`t6__wb-status t6__wb-status--${tool.status}`}>{tool.statusLabel}</span>
          </header>

          {/* Mock "playground" UI */}
          <div className="t6__playground">
            <div className="t6__pg-row">
              <label className="t6__pg-label">Mailbox</label>
              <div className="t6__pg-mbs">
                {DEMO_MAILBOXES.slice(0, 3).map((m) => (
                  <span key={m.id} className="t6__pg-mb">
                    <ProviderSwatch provider={m.provider} size={18} />
                    {m.email.split('@')[0]}
                    <X size={10} strokeWidth={2.4} />
                  </span>
                ))}
                <button type="button" className="t6__pg-mb-add">+ Add</button>
              </div>
            </div>

            <div className="t6__pg-row">
              <label className="t6__pg-label">Configuration</label>
              <div className="t6__pg-config">
                <div className="t6__pg-field"><span>Type</span><span className="t6__pg-field-val">{tool.short}</span></div>
                <div className="t6__pg-field"><span>Highlight</span><span className="t6__pg-field-val">{tool.highlight.value}</span></div>
                <div className="t6__pg-field"><span>Success rate</span><span className="t6__pg-field-val">{tool.successRate}%</span></div>
              </div>
            </div>

            <div className="t6__pg-canvas">
              <div className="t6__pg-canvas-art" aria-hidden>
                <Wand2 size={28} strokeWidth={1.6} />
              </div>
              <span className="t6__pg-canvas-label">Tool output preview</span>
              <p className="t6__pg-canvas-text">
                Run the tool to populate this canvas. Configuration above is locked
                to the selected mailbox(es). Recent runs from the right pane
                can be re-loaded here.
              </p>
            </div>
          </div>

          <footer className="t6__wb-foot">
            <button type="button" className="t6-btn t6-btn--ghost">
              <Save size={11} strokeWidth={2.4} />
              Save config
            </button>
            <button type="button" className={`t6-btn t6-btn--primary t6-btn--${tool.tone}`}>
              <Play size={12} strokeWidth={2.6} fill="currentColor" />
              Run {tool.short}
            </button>
          </footer>
        </motion.section>

        {/* Side history */}
        <aside className="t6__history">
          <header className="t6__history-head">
            <span><Clock size={11} strokeWidth={2.4} /> Run history</span>
            <span className="t6__history-meta">{runs.length}</span>
          </header>
          <div className="t6__history-list">
            {runs.length === 0 ? (
              <div className="t6__empty">No runs for this tool yet.</div>
            ) : (
              runs.map((r, i) => {
                const mb = DEMO_MAILBOXES.find((m) => m.email === r.mailbox);
                return (
                  <motion.button
                    key={r.id}
                    type="button"
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22, delay: i * 0.03 }}
                    className={`t6__history-row t6__history-row--${r.status}`}
                  >
                    <header className="t6__history-row-head">
                      <span className={`t6__history-row-dot t6__history-row-dot--${r.status}`} />
                      <span className="t6__history-row-time">{relTime(r.ts)}</span>
                      {mb && <ProviderSwatch provider={mb.provider} size={16} />}
                      <span className="t6__history-row-mb">{r.mailbox.split('@')[0]}</span>
                    </header>
                    <span className="t6__history-row-result">{r.result}</span>
                    {r.detail && <span className="t6__history-row-detail">{r.detail}</span>}
                  </motion.button>
                );
              })
            )}
          </div>
        </aside>
      </div>
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
