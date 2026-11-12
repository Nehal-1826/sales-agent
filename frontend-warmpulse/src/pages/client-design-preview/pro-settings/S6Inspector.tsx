import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Database,
  ExternalLink,
  Mail,
  Plug,
  Shield,
} from 'lucide-react';
import {
  CATEGORIES,
  DATA_ACTIONS,
  INTEGRATIONS,
  NOTIFICATION_PREFS,
  SECURITY_ITEMS,
  type CatKey,
} from './demoSettings';

/**
 * S6 — Three-Pane Inspector.
 * macOS Mail / Finder style:
 *   Left = category tree
 *   Middle = items in selected category
 *   Right = detail / inspector for selected item
 */

type ItemRow = { key: string; label: string; meta: string };

function getItems(cat: CatKey): ItemRow[] {
  switch (cat) {
    case 'security':
      return SECURITY_ITEMS.map((s) => ({ key: s.key, label: s.label, meta: s.detail }));
    case 'notifications':
      return NOTIFICATION_PREFS.map((n) => ({
        key: n.key,
        label: n.label,
        meta: [n.email && 'email', n.inApp && 'in-app', n.push && 'push'].filter(Boolean).join(' · ') || 'off',
      }));
    case 'integrations':
      return INTEGRATIONS.map((i) => ({ key: i.key, label: i.name, meta: i.meta ?? i.status }));
    case 'data':
      return DATA_ACTIONS.map((d) => ({ key: d.key, label: d.label, meta: d.cta }));
    case 'profile':
      return [
        { key: 'name',  label: 'Workspace name',  meta: 'Acme · WarmPulse' },
        { key: 'slug',  label: 'Workspace slug',  meta: 'acme' },
        { key: 'send',  label: 'Default sender',  meta: 'alex@acme.com' },
        { key: 'tz',    label: 'Timezone',        meta: 'Asia/Kolkata · UTC+5:30' },
        { key: 'brand', label: 'Brand color',     meta: '#F26522' },
        { key: 'week',  label: 'Week starts on',  meta: 'Monday' },
      ];
    case 'appearance':
      return [
        { key: 'theme',   label: 'Theme',          meta: 'Dark' },
        { key: 'accent',  label: 'Accent color',   meta: 'Violet · #F26522' },
        { key: 'density', label: 'Density',        meta: 'Comfortable' },
        { key: 'lang',    label: 'Language',       meta: 'English (India)' },
      ];
  }
}

export function S6Inspector() {
  const [activeCat, setActiveCat] = useState<CatKey>('security');
  const items = getItems(activeCat);
  const [activeItem, setActiveItem] = useState<string>(items[0]?.key ?? '');
  const cat = CATEGORIES.find((c) => c.key === activeCat)!;
  const item = items.find((i) => i.key === activeItem) ?? items[0]!;

  function onCatChange(c: CatKey) {
    setActiveCat(c);
    const next = getItems(c);
    setActiveItem(next[0]?.key ?? '');
  }

  return (
    <div className="s6">
      {/* Pane 1 — categories */}
      <aside className="s6__cats">
        <header className="s6__cats-head">Settings</header>
        <ul className="s6__cats-list">
          {CATEGORIES.map((c) => {
            const Icon = c.Icon;
            const isActive = c.key === activeCat;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => onCatChange(c.key)}
                  className={`s6__cat-btn ${isActive ? 's6__cat-btn--active' : ''}`}
                >
                  <span className={`s6__cat-icon s6__cat-icon--${c.tone}`}>
                    <Icon size={11} strokeWidth={2.4} />
                  </span>
                  <span className="s6__cat-name">{c.name}</span>
                  <ChevronRight size={10} strokeWidth={2.4} className="s6__cat-chev" />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Pane 2 — items */}
      <section className="s6__items">
        <header className="s6__items-head">
          <span className="s6__items-title">{cat.name}</span>
          <span className="s6__items-count">{items.length} items</span>
        </header>
        <ul className="s6__items-list">
          {items.map((i) => {
            const isActive = i.key === activeItem;
            return (
              <li key={i.key}>
                <button
                  type="button"
                  onClick={() => setActiveItem(i.key)}
                  className={`s6__item ${isActive ? 's6__item--active' : ''}`}
                >
                  <div className="s6__item-text">
                    <span className="s6__item-label">{i.label}</span>
                    <span className="s6__item-meta">{i.meta}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Pane 3 — inspector */}
      <motion.aside
        key={activeCat + activeItem}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18 }}
        className="s6__inspector"
      >
        <header className="s6__inspector-head">
          <span className={`s6__inspector-icon s6__inspector-icon--${cat.tone}`}>
            {activeCat === 'security' ? <Shield size={14} strokeWidth={2.4} /> :
             activeCat === 'integrations' ? <Plug size={14} strokeWidth={2.4} /> :
             activeCat === 'data' ? <Database size={14} strokeWidth={2.4} /> :
             <Mail size={14} strokeWidth={2.4} />}
          </span>
          <div className="s6__inspector-text">
            <span className="s6__inspector-breadcrumb">{cat.name}</span>
            <h3 className="s6__inspector-title">{item.label}</h3>
          </div>
        </header>

        <dl className="s6__inspector-meta">
          <dt>Current value</dt>
          <dd>{item.meta}</dd>
          <dt>Last changed</dt>
          <dd>2 weeks ago by alex@acme.com</dd>
          <dt>Affects</dt>
          <dd>All 5 mailboxes · 6 members</dd>
        </dl>

        <div className="s6__inspector-actions">
          <button type="button" className="s6__inspector-btn s6__inspector-btn--primary">
            Edit value
          </button>
          <button type="button" className="s6__inspector-btn">
            View history
            <ExternalLink size={10} strokeWidth={2.4} />
          </button>
        </div>

        {activeCat === 'data' && item.key === 'delete' && (
          <div className="s6__inspector-warn">
            <AlertTriangle size={11} strokeWidth={2.4} />
            <span>This action is irreversible. All warmup history, peer-pool reputation, reports, and audit logs will be permanently deleted.</span>
          </div>
        )}

        {activeCat === 'security' && (
          <section className="s6__inspector-section">
            <span className="s6__inspector-section-title">Status</span>
            <div className="s6__inspector-status">
              <Check size={11} strokeWidth={2.6} />
              <span>Compliant with Pro tier baseline</span>
            </div>
          </section>
        )}
      </motion.aside>
    </div>
  );
}
