import { motion } from 'framer-motion';
import { ArrowUpRight, Clock, Play, Wrench } from 'lucide-react';
import { TOOLS, TONE_HEX } from './demoTools';

/**
 * T1 — Launcher Grid. App-launcher style.
 * 5 big equal-weight tiles in a grid. Each shows the tool's identity,
 * last run, status, key highlight, mini trend, and a primary Run button.
 */
export function T1Launcher() {
  return (
    <div className="t1">
      <header className="t1__head">
        <span className="t1-eyebrow"><Wrench size={11} strokeWidth={2.4} />Tool launcher</span>
        <span className="t1__head-meta">Click any tile to launch the tool</span>
      </header>

      <div className="t1__grid">
        {TOOLS.map((t, i) => {
          const Icon = t.Icon;
          return (
            <motion.section
              key={t.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className={`t1__tile t1__tile--${t.tone}`}
            >
              <header className="t1__tile-head">
                <span className={`t1__tile-icon t1__tile-icon--${t.tone}`}>
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <span className={`t1__tile-status t1__tile-status--${t.status}`}>
                  {t.statusLabel}
                </span>
              </header>

              <div className="t1__tile-body">
                <h3 className="t1__tile-name">{t.name}</h3>
                <p className="t1__tile-desc">{t.desc}</p>
              </div>

              <div className="t1__tile-trend">
                <TrendBars data={t.trend7d} color={TONE_HEX[t.tone]} />
                <span className="t1__tile-trend-lbl">7-day usage</span>
              </div>

              <footer className="t1__tile-foot">
                <span className="t1__tile-meta">
                  <Clock size={9} strokeWidth={2.6} />
                  {t.lastRunRel}
                  <span className="t1__tile-meta-dot" />
                  {t.totalRuns} runs
                </span>
                <button type="button" className={`t1__tile-run t1__tile-run--${t.tone}`}>
                  <Play size={11} strokeWidth={2.6} fill="currentColor" />
                  Run
                  <ArrowUpRight size={11} strokeWidth={2.4} />
                </button>
              </footer>
            </motion.section>
          );
        })}

        {/* 6th tile: "Run all" CTA */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="t1__tile t1__tile--cta"
        >
          <div className="t1__cta-body">
            <span className="t1__cta-eyebrow">SHORTCUT</span>
            <h3 className="t1__cta-title">Run health check</h3>
            <p className="t1__cta-desc">
              Triggers DNS check, Placement test, and Spam scan in sequence across
              all mailboxes. ~2 minutes.
            </p>
          </div>
          <button type="button" className="t1__cta-btn">
            <Play size={13} strokeWidth={2.6} fill="currentColor" />
            Run health check
          </button>
        </motion.section>
      </div>
    </div>
  );
}

function TrendBars({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  return (
    <div className="t1__trend-bars">
      {data.map((v, i) => (
        <span
          key={i}
          className="t1__trend-bar"
          style={{ height: `${(v / max) * 100}%`, background: color }}
        />
      ))}
    </div>
  );
}
