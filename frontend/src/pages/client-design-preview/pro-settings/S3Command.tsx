import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Command, Search, Settings2 } from 'lucide-react';
import { CATEGORIES, SEARCHABLE, type CatKey } from './demoSettings';

/**
 * S3 — Command Search.
 * Linear / Raycast style. Big search bar dominates. Results group by
 * category. Type to filter. Recommended for power users.
 */
export function S3Command() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return SEARCHABLE;
    const q = query.toLowerCase();
    return SEARCHABLE.filter(
      (s) => s.label.toLowerCase().includes(q) || s.hint.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<CatKey, typeof SEARCHABLE>();
    filtered.forEach((s) => {
      const arr = map.get(s.cat) ?? [];
      arr.push(s);
      map.set(s.cat, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="s3">
      <header className="s3__head">
        <span className="s3__eyebrow">
          <Command size={11} strokeWidth={2.4} />
          Command palette settings
        </span>
        <h2 className="s3__head-title">Find any setting</h2>
        <p className="s3__head-sub">
          Type to search across all 34 settings. Press <kbd>↵</kbd> to jump. Power-user mode.
        </p>
      </header>

      <div className="s3__search-shell">
        <div className="s3__search">
          <Search size={14} strokeWidth={2.4} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings, shortcuts, integrations…"
          />
          <kbd>esc</kbd>
        </div>
      </div>

      <div className="s3__results">
        {filtered.length === 0 ? (
          <div className="s3__empty">
            No settings match "<strong>{query}</strong>". Try another term.
          </div>
        ) : (
          grouped.map(([catKey, items]) => {
            const cat = CATEGORIES.find((c) => c.key === catKey)!;
            const Icon = cat.Icon;
            return (
              <section key={catKey} className="s3__group">
                <header className="s3__group-head">
                  <span className={`s3__group-icon s3__group-icon--${cat.tone}`}>
                    <Icon size={11} strokeWidth={2.4} />
                  </span>
                  <span className="s3__group-name">{cat.name}</span>
                  <span className="s3__group-count">{items.length}</span>
                </header>
                <ul className="s3__group-list">
                  {items.map((s, i) => (
                    <motion.li
                      key={s.key}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15, delay: i * 0.02 }}
                      className="s3__result"
                    >
                      <div className="s3__result-text">
                        <span className="s3__result-label">{highlight(s.label, query)}</span>
                        <span className="s3__result-hint">{s.hint}</span>
                      </div>
                      {s.shortcut && <kbd className="s3__result-kbd">{s.shortcut}</kbd>}
                      <ArrowUpRight size={12} strokeWidth={2.4} className="s3__result-arrow" />
                    </motion.li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      <footer className="s3__foot">
        <span>
          <Settings2 size={10} strokeWidth={2.4} />
          {SEARCHABLE.length} settings across {CATEGORIES.length} categories
        </span>
        <div className="s3__foot-hints">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> jump</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </footer>
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="s3__mark">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
