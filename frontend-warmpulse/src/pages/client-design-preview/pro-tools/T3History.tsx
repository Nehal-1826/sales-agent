import { useState } from 'react';
import { motion } from 'framer-motion';
import { Filter, History } from 'lucide-react';
import { TOOLS, TOOL_RUNS } from './demoTools';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { DEMO_MAILBOXES } from '../pro-dashboards/demoData';
import type { ToolDef } from './demoTools';

/**
 * T3 — Run History Stream.
 * Chronological log of every tool run across all tools.
 * Filter by tool type. Each entry shows time, tool, mailbox, status, result.
 */
export function T3History() {
  const [filterKey, setFilterKey] = useState<ToolDef['key'] | 'all'>('all');
  const filtered = filterKey === 'all' ? TOOL_RUNS : TOOL_RUNS.filter((r) => r.toolKey === filterKey);

  return (
    <div className="t3">
      <header className="t3__head">
        <span className="t3-eyebrow"><History size={11} strokeWidth={2.4} />Tool run history</span>
        <div className="t3__filters">
          <Filter size={11} strokeWidth={2.4} style={{ color: 'var(--wp-text-faint)' }} />
          <button type="button" className={`t3__chip ${filterKey === 'all' ? 't3__chip--active' : ''}`} onClick={() => setFilterKey('all')}>
            All<span className="t3__chip-count">{TOOL_RUNS.length}</span>
          </button>
          {TOOLS.map((t) => {
            const count = TOOL_RUNS.filter((r) => r.toolKey === t.key).length;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilterKey(t.key)}
                className={`t3__chip t3__chip--${t.tone} ${filterKey === t.key ? 't3__chip--active' : ''}`}
              >
                {t.short}<span className="t3__chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="t3__stream">
        {filtered.length === 0 ? (
          <div className="t3__empty">No runs match this filter.</div>
        ) : (
          filtered.map((r, i) => {
            const tool = TOOLS.find((t) => t.key === r.toolKey)!;
            const mb = DEMO_MAILBOXES.find((m) => m.email === r.mailbox);
            const Icon = tool.Icon;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.025 }}
                className="t3__entry"
              >
                <span className="t3__entry-time">{relTime(r.ts)}</span>
                <span className="t3__entry-rail">
                  <span className={`t3__entry-rail-dot t3__entry-rail-dot--${r.status}`} />
                  {i < filtered.length - 1 && <span className="t3__entry-rail-line" />}
                </span>
                <div className="t3__entry-card">
                  <header className="t3__entry-head">
                    <span className={`t3__entry-tool t3__entry-tool--${tool.tone}`}>
                      <Icon size={11} strokeWidth={2.4} />
                      {tool.name}
                    </span>
                    {mb && <ProviderSwatch provider={mb.provider} size={20} />}
                    <span className="t3__entry-mb">{r.mailbox.split('@')[0]}</span>
                    <span className={`t3__entry-status t3__entry-status--${r.status}`}>
                      {r.status === 'ok' ? 'OK' : r.status === 'warn' ? 'WATCH' : r.status === 'err' ? 'FAIL' : 'INFO'}
                    </span>
                  </header>
                  <span className="t3__entry-result">{r.result}</span>
                  {r.detail && <span className="t3__entry-detail">{r.detail}</span>}
                </div>
              </motion.div>
            );
          })
        )}
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
