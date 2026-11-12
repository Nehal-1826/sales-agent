import { motion } from 'framer-motion';
import { Check, Crown, X } from 'lucide-react';
import { PLAN_TIERS } from './demoBilling';

/**
 * B3 — Plan Compare. 3-column comparison cards (Starter / Pro / Agency).
 * Current plan highlighted with violet glow. Highlighted features get a star.
 */
export function B3PlanCompare() {
  return (
    <div className="b3">
      <header className="b3__head">
        <span className="b3__eyebrow">
          <Crown size={11} strokeWidth={2.4} />
          Plan & pricing
        </span>
        <h2 className="b3__head-title">Compare plans</h2>
        <p className="b3__head-sub">
          You're on <strong>Pro</strong>. Annual billing saves 20% across all tiers.
        </p>
        <div className="b3__cycle-toggle">
          <button type="button" className="b3__cycle-btn b3__cycle-btn--active">Monthly</button>
          <button type="button" className="b3__cycle-btn">
            Yearly <span className="b3__cycle-save">−20%</span>
          </button>
        </div>
      </header>

      <div className="b3__grid">
        {PLAN_TIERS.map((p, i) => (
          <motion.section
            key={p.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08 }}
            className={`b3__card ${p.isCurrent ? 'b3__card--current' : ''}`}
          >
            {p.isCurrent && (
              <span className="b3__card-ribbon">
                <Crown size={9} strokeWidth={2.4} />
                Current plan
              </span>
            )}
            <header className="b3__card-head">
              <span className={`b3__card-name b3__card-name--${p.key}`}>{p.name}</span>
              <p className="b3__card-tagline">{p.tagline}</p>
            </header>
            <div className="b3__card-price">
              <span className="b3__card-currency">₹</span>
              <span className="b3__card-num">{p.price.toLocaleString('en-IN')}</span>
              <span className="b3__card-period">/ month</span>
            </div>
            <ul className="b3__card-feats">
              {p.features.map((f) => (
                <li
                  key={f.label}
                  className={`b3__feat ${f.highlight ? 'b3__feat--highlight' : ''} ${
                    f.included ? '' : 'b3__feat--off'
                  }`}
                >
                  <span className="b3__feat-icon">
                    {f.included ? (
                      <Check size={11} strokeWidth={2.6} />
                    ) : (
                      <X size={11} strokeWidth={2.6} />
                    )}
                  </span>
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`b3__card-cta ${
                p.isCurrent
                  ? 'b3__card-cta--current'
                  : p.key === 'agency'
                    ? 'b3__card-cta--upgrade'
                    : 'b3__card-cta--ghost'
              }`}
              disabled={p.isCurrent}
            >
              {p.cta}
            </button>
          </motion.section>
        ))}
      </div>

      <footer className="b3__foot">
        <span>All plans include unlimited domains · GDPR data export · 30-day uptime SLA</span>
        <span className="b3__foot-link">Need enterprise? <strong>Talk to sales →</strong></span>
      </footer>
    </div>
  );
}
