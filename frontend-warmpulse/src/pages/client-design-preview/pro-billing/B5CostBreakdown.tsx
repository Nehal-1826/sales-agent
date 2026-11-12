import { motion } from 'framer-motion';
import { ArrowUpRight, BarChart3, PieChart, Sparkles, TrendingUp } from 'lucide-react';
import { COST_BREAKDOWN, SPENDING_TREND_6MO, formatINR } from './demoBilling';

/**
 * B5 — Cost Breakdown. Donut of cost categories + 6-month spending trend bars.
 */
export function B5CostBreakdown() {
  const total = COST_BREAKDOWN.reduce((s, c) => s + c.amount, 0);

  const r = 60;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const segments = COST_BREAKDOWN.map((cat) => {
    const dash = (cat.pct / 100) * c;
    const offset = -acc;
    acc += dash;
    return { ...cat, dash, offset };
  });

  const trendMax = Math.max(...SPENDING_TREND_6MO.map((s) => s.amount));

  return (
    <div className="b5">
      <header className="b5__head">
        <span className="b5__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          May 2026 cost breakdown
        </span>
        <h2 className="b5__head-title">Where your money goes</h2>
        <p className="b5__head-sub">
          ₹{total.toLocaleString('en-IN')} projected this cycle · subscription is your dominant cost.
        </p>
      </header>

      <div className="b5__row">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="b5__donut-card"
        >
          <header className="b5__panel-head">
            <span className="b5__panel-title">
              <PieChart size={11} strokeWidth={2.4} />
              By category
            </span>
          </header>
          <div className="b5__donut-wrap">
            <svg viewBox="0 0 160 160" className="b5__donut">
              <circle cx="80" cy="80" r={r} fill="none" stroke="var(--wp-border)" strokeWidth="14" />
              {segments.map((s, i) => (
                <motion.circle
                  key={s.key}
                  initial={{ strokeDasharray: `0 ${c}` }}
                  animate={{ strokeDasharray: `${s.dash} ${c}` }}
                  transition={{ duration: 0.7, delay: 0.1 + i * 0.08 }}
                  cx="80" cy="80" r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="14"
                  strokeDashoffset={s.offset}
                  transform="rotate(-90 80 80)"
                  strokeLinecap="butt"
                />
              ))}
            </svg>
            <div className="b5__donut-center">
              <span className="b5__donut-currency">₹</span>
              <span className="b5__donut-num">{total.toLocaleString('en-IN')}</span>
              <span className="b5__donut-lbl">May projected</span>
            </div>
          </div>
          <ul className="b5__legend">
            {COST_BREAKDOWN.map((cat) => (
              <li key={cat.key}>
                <span className="b5__legend-swatch" style={{ background: cat.color }} />
                <span className="b5__legend-label">{cat.label}</span>
                <span className="b5__legend-amount">{formatINR(cat.amount)}</span>
                <span className="b5__legend-pct">{cat.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="b5__trend-card"
        >
          <header className="b5__panel-head">
            <span className="b5__panel-title">
              <BarChart3 size={11} strokeWidth={2.4} />
              6-month spending trend
            </span>
            <span className="b5__trend-pill">
              <TrendingUp size={9} strokeWidth={2.4} />
              +2.1% vs Apr
            </span>
          </header>
          <div className="b5__trend-chart">
            {SPENDING_TREND_6MO.map((m, i) => {
              const h = (m.amount / trendMax) * 100;
              const isCurrent = i === SPENDING_TREND_6MO.length - 1;
              return (
                <div key={m.month} className="b5__trend-col">
                  <div className="b5__trend-amount">{formatINR(m.amount)}</div>
                  <div className="b5__trend-bar-track">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.5, delay: 0.2 + i * 0.06 }}
                      className={`b5__trend-bar ${isCurrent ? 'b5__trend-bar--current' : ''}`}
                    />
                  </div>
                  <span className="b5__trend-month">{m.month}</span>
                </div>
              );
            })}
          </div>

          <section className="b5__insights">
            <header className="b5__insights-head">Smart insights</header>
            <ul className="b5__insights-list">
              <li>
                <span className="b5__insight-dot b5__insight-dot--info" />
                <span>
                  Switching to <strong>annual billing</strong> would save you{' '}
                  <strong>₹12,000 / year</strong> (20%).
                </span>
                <button type="button" className="b5__insight-link">
                  Switch <ArrowUpRight size={10} strokeWidth={2.4} />
                </button>
              </li>
              <li>
                <span className="b5__insight-dot b5__insight-dot--warn" />
                <span>
                  <strong>LLM overage</strong> trending up — consider the Agency tier for unlimited generation.
                </span>
              </li>
              <li>
                <span className="b5__insight-dot b5__insight-dot--success" />
                <span>
                  Your team is using <strong>60% of seats</strong> · no upgrade needed yet.
                </span>
              </li>
            </ul>
          </section>
        </motion.section>
      </div>
    </div>
  );
}
