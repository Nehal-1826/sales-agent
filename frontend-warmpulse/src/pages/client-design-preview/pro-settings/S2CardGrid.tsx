import { motion } from 'framer-motion';
import { ChevronRight, Search, Settings2 } from 'lucide-react';
import { CATEGORIES } from './demoSettings';

/**
 * S2 — Card Grid Launcher.
 * Apple System Preferences style: 3×2 grid of category cards.
 * Each card shows icon + name + 2-line description + status pill.
 */
export function S2CardGrid() {
  return (
    <div className="s2">
      <header className="s2__head">
        <div className="s2__head-text">
          <span className="s2__eyebrow">
            <Settings2 size={11} strokeWidth={2.4} />
            Settings · Pro workspace
          </span>
          <h2 className="s2__head-title">Acme · WarmPulse</h2>
          <p className="s2__head-sub">Click any card to configure that area. Hover for a quick peek.</p>
        </div>
        <div className="s2__search">
          <Search size={12} strokeWidth={2.4} />
          <input placeholder="Search settings…" disabled />
          <kbd>⌘K</kbd>
        </div>
      </header>

      <div className="s2__grid">
        {CATEGORIES.map((c, i) => {
          const Icon = c.Icon;
          return (
            <motion.button
              key={c.key}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              className={`s2__card s2__card--${c.tone}`}
            >
              <span className={`s2__card-icon s2__card-icon--${c.tone}`}>
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <div className="s2__card-body">
                <div className="s2__card-head">
                  <span className="s2__card-name">{c.name}</span>
                  <span className="s2__card-count">{c.count} settings</span>
                </div>
                <p className="s2__card-desc">{c.desc}</p>
                <div className="s2__card-foot">
                  <span className={`s2__status s2__status--${c.status}`}>
                    {c.statusLabel}
                  </span>
                  <ChevronRight size={12} strokeWidth={2.4} className="s2__card-chev" />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <footer className="s2__foot">
        <span className="s2__foot-text">
          Pro tier · 6 settings categories · 34 individual options
        </span>
        <span className="s2__foot-link">
          Need to find something specific? Press <kbd>⌘K</kbd> to search.
        </span>
      </footer>
    </div>
  );
}
