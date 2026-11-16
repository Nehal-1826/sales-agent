import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { TOOLS, TONE_HEX, type ToolStatus } from './demoTools';

/**
 * T5 — Status Board. NOC-style giant stat tiles.
 * Big numbers per tool. Aggregate banner at the top.
 */
export function T5StatusBoard() {
  const totalRuns = TOOLS.reduce((s, t) => s + t.totalRuns, 0);
  const avgSuccess = Math.round(TOOLS.reduce((s, t) => s + t.successRate, 0) / TOOLS.length);
  const warnCount = TOOLS.filter((t) => t.status === 'warn').length;

  return (
    <div className="t5">
      {/* Banner */}
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="t5__banner"
      >
        <span className="t5__banner-light" aria-hidden />
        <div className="t5__banner-text">
          <span className="t5__banner-eyebrow">
            <Radio size={11} strokeWidth={2.4} />
            Tool status board
          </span>
          <h2 className="t5__banner-title">
            All {TOOLS.length} tools operational
          </h2>
        </div>
        <div className="t5__banner-stats">
          <div className="t5__banner-stat">
            <span className="t5__banner-stat-num">{totalRuns}</span>
            <span className="t5__banner-stat-lbl">total runs</span>
          </div>
          <div className="t5__banner-stat">
            <span className="t5__banner-stat-num">{avgSuccess}%</span>
            <span className="t5__banner-stat-lbl">avg success</span>
          </div>
          <div className="t5__banner-stat">
            <span className="t5__banner-stat-num">{warnCount}</span>
            <span className="t5__banner-stat-lbl">attention</span>
          </div>
        </div>
      </motion.header>

      {/* Big stat tiles */}
      <div className="t5__grid">
        {TOOLS.map((t, i) => {
          const Icon = t.Icon;
          const max = Math.max(...t.trend7d);
          return (
            <motion.section
              key={t.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className={`t5__tile t5__tile--${t.tone}`}
            >
              <header className="t5__tile-head">
                <span className={`t5__tile-icon t5__tile-icon--${t.tone}`}>
                  <Icon size={14} strokeWidth={2.4} />
                </span>
                <span className="t5__tile-name">{t.name}</span>
                <span className={`t5__tile-light t5__tile-light--${t.status}`} aria-hidden />
              </header>

              <div className="t5__tile-headline">
                <span className={`t5__tile-headline-num t5__tile-headline-num--${t.tone}`}>
                  {t.highlight.value.split(' ')[0]}
                </span>
                <span className="t5__tile-headline-lbl">{t.highlight.label}</span>
              </div>

              <div className="t5__tile-trend">
                {t.trend7d.map((v, j) => (
                  <span
                    key={j}
                    className="t5__tile-trend-bar"
                    style={{
                      height: `${(v / Math.max(1, max)) * 100}%`,
                      background: TONE_HEX[t.tone],
                    }}
                  />
                ))}
              </div>

              <footer className="t5__tile-foot">
                <Stat lbl="RUNS" val={String(t.totalRuns)} />
                <Stat lbl="SUCCESS" val={`${t.successRate}%`} />
                <Stat lbl="LAST" val={t.lastRunRel} mono />
              </footer>

              <div className={`t5__tile-status-bar t5__tile-status-bar--${statusToBar(t.status)}`} />
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ lbl, val, mono }: { lbl: string; val: string; mono?: boolean }) {
  return (
    <div className="t5__tile-stat">
      <span className="t5__tile-stat-lbl">{lbl}</span>
      <span className={`t5__tile-stat-val ${mono ? 't5__tile-stat-val--mono' : ''}`}>{val}</span>
    </div>
  );
}

function statusToBar(s: ToolStatus): 'ok' | 'warn' | 'err' | 'info' { return s; }
