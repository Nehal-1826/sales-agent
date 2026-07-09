import { motion } from 'framer-motion';
import { ArrowUpRight, Sparkles, TrendingUp } from 'lucide-react';
import { TONE_HEX, TOOLS } from './demoTools';

/**
 * T4 — Insight Cards. Each tool gets a magazine-style card with the
 * key insight + 7-day usage trend + primary action.
 */
export function T4Insights() {
  return (
    <div className="t4">
      <header className="t4__head">
        <span className="t4-eyebrow"><Sparkles size={11} strokeWidth={2.4} />Tools, at a glance</span>
        <span className="t4__head-meta">
          {TOOLS.reduce((s, t) => s + t.totalRuns, 0)} runs across {TOOLS.length} tools
        </span>
      </header>

      <div className="t4__grid">
        {TOOLS.map((t, i) => {
          const Icon = t.Icon;
          const max = Math.max(...t.trend7d);
          const sum = t.trend7d.reduce((s, n) => s + n, 0);
          return (
            <motion.section
              key={t.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className={`t4__card t4__card--${t.tone}`}
            >
              <header className="t4__card-head">
                <span className="t4__card-no">№ {String(i + 1).padStart(2, '0')}</span>
                <span className={`t4__card-status t4__card-status--${t.status}`}>{t.statusLabel}</span>
              </header>
              <div className="t4__card-body">
                <span className={`t4__card-icon t4__card-icon--${t.tone}`}>
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <h3 className="t4__card-name">{t.name}</h3>
                <p className="t4__card-desc">{t.desc}</p>
              </div>

              <div className="t4__card-insight">
                <span className="t4__insight-lbl">{t.highlight.label}</span>
                <span className="t4__insight-val">{t.highlight.value}</span>
              </div>

              <div className="t4__card-trend">
                <span className="t4__trend-lbl">
                  <TrendingUp size={10} strokeWidth={2.4} />
                  7d: {sum} runs
                </span>
                <div className="t4__trend-bars">
                  {t.trend7d.map((v, j) => (
                    <span
                      key={j}
                      className="t4__trend-bar"
                      style={{
                        height: `${(v / Math.max(1, max)) * 100}%`,
                        background: TONE_HEX[t.tone],
                      }}
                    />
                  ))}
                </div>
              </div>

              <footer className="t4__card-foot">
                <span className="t4__card-foot-meta">Last run {t.lastRunRel}</span>
                <button type="button" className={`t4__card-btn t4__card-btn--${t.tone}`}>
                  Open
                  <ArrowUpRight size={11} strokeWidth={2.4} />
                </button>
              </footer>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
