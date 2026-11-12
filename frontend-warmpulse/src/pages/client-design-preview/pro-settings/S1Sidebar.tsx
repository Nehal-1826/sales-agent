import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Globe2,
  LogOut,
  Mail,
  Save,
  Search,
} from 'lucide-react';
import {
  CATEGORIES,
  NOTIFICATION_PREFS,
  PROFILE,
  SECURITY_ITEMS,
  SESSIONS,
  TIMEZONES,
  type CatKey,
} from './demoSettings';

/**
 * S1 — Linear Sidebar.
 * Left vertical nav (settings categories) + right scrollable pane.
 * Most "real-product" feel for a settings UI.
 */
export function S1Sidebar() {
  const [active, setActive] = useState<CatKey>('profile');
  const current = CATEGORIES.find((c) => c.key === active)!;

  return (
    <div className="s1">
      {/* Left rail */}
      <aside className="s1__rail">
        <div className="s1__search">
          <Search size={11} strokeWidth={2.4} />
          <input placeholder="Search settings…" disabled />
          <kbd>⌘K</kbd>
        </div>
        <nav className="s1__nav">
          {CATEGORIES.map((c) => {
            const Icon = c.Icon;
            const isActive = c.key === active;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setActive(c.key)}
                className={`s1__nav-item ${isActive ? 's1__nav-item--active' : ''}`}
              >
                <span className={`s1__nav-icon s1__nav-icon--${c.tone}`}>
                  <Icon size={13} strokeWidth={2.4} />
                </span>
                <div className="s1__nav-text">
                  <span className="s1__nav-name">{c.name}</span>
                  <span className="s1__nav-desc">{c.desc}</span>
                </div>
                <ChevronRight size={11} strokeWidth={2.4} className="s1__nav-chev" />
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Right pane */}
      <motion.section
        key={active}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="s1__pane"
      >
        <header className="s1__pane-head">
          <div>
            <span className="s1__pane-breadcrumb">Settings / {current.name}</span>
            <h2 className="s1__pane-title">{current.name}</h2>
            <p className="s1__pane-sub">{current.desc}</p>
          </div>
          <button type="button" className="s1__pane-save">
            <Save size={11} strokeWidth={2.4} />
            Save changes
          </button>
        </header>

        {active === 'profile' && (
          <div className="s1__form">
            <Row label="Workspace name" hint="Shown in nav, reports, and emails">
              <input className="s1__input" defaultValue={PROFILE.workspaceName} />
            </Row>
            <Row label="Workspace slug" hint="acme.warmpulse.io">
              <div className="s1__slug">
                <span className="s1__slug-prefix">warmpulse.io /</span>
                <input className="s1__input s1__input--slug" defaultValue={PROFILE.slug} />
              </div>
            </Row>
            <Row label="Default sender" hint="Used for outbound transactional mail">
              <div className="s1__input-icon">
                <Mail size={12} strokeWidth={2.4} />
                <input className="s1__input" defaultValue={PROFILE.defaultSender} />
              </div>
            </Row>
            <Row label="Timezone" hint="All schedule windows reference this zone">
              <div className="s1__input-icon">
                <Globe2 size={12} strokeWidth={2.4} />
                <select className="s1__input" defaultValue={PROFILE.timezone}>
                  {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
                </select>
              </div>
            </Row>
            <Row label="Brand color" hint="White-label report header accent">
              <div className="s1__color">
                <span className="s1__color-swatch" style={{ background: PROFILE.brandColor }} />
                <input className="s1__input s1__input--mono" defaultValue={PROFILE.brandColor} />
              </div>
            </Row>
            <Row label="Week starts on" hint="Used in heatmaps + reports">
              <div className="s1__seg">
                {['Sunday', 'Monday', 'Saturday'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`s1__seg-btn ${d === PROFILE.weekStart ? 's1__seg-btn--active' : ''}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Row>
          </div>
        )}

        {active === 'security' && (
          <div className="s1__form">
            {SECURITY_ITEMS.map((s) => (
              <Row key={s.key} label={s.label} hint={s.detail}>
                <span className={`s1__pill s1__pill--${s.status}`}>
                  {s.status === 'enabled' && <Check size={9} strokeWidth={2.6} />}
                  {s.status}
                </span>
              </Row>
            ))}
            <section className="s1__sessions">
              <header className="s1__sessions-head">
                <span>Active sessions · {SESSIONS.length}</span>
                <button type="button" className="s1__sessions-btn">
                  <LogOut size={11} strokeWidth={2.4} />
                  Sign out others
                </button>
              </header>
              <ul className="s1__sessions-list">
                {SESSIONS.map((s) => (
                  <li key={s.id} className={s.isCurrent ? 's1__session s1__session--current' : 's1__session'}>
                    <div className="s1__session-id">
                      <span className="s1__session-device">{s.device}</span>
                      <span className="s1__session-sub">{s.os} · {s.city}</span>
                    </div>
                    <span className="s1__session-ip">{s.ip}</span>
                    <span className="s1__session-time">{s.lastActiveRel}</span>
                    {s.isCurrent && <span className="s1__session-pill">This device</span>}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {active === 'notifications' && (
          <div className="s1__notif-table">
            <header className="s1__notif-head">
              <span>Event</span>
              <span>Email</span>
              <span>In-app</span>
              <span>Push</span>
            </header>
            {NOTIFICATION_PREFS.map((n) => (
              <div key={n.key} className="s1__notif-row">
                <div className="s1__notif-event">
                  <span className="s1__notif-label">{n.label}</span>
                  <span className="s1__notif-desc">{n.desc}</span>
                </div>
                <Toggle on={n.email} />
                <Toggle on={n.inApp} />
                <Toggle on={n.push} />
              </div>
            ))}
          </div>
        )}

        {active === 'integrations' && (
          <div className="s1__placeholder">
            <p>Switch to S2 / S3 / S6 to see how each variant renders Integrations.</p>
          </div>
        )}
        {active === 'appearance' && (
          <div className="s1__placeholder">
            <p>Switch to S2 / S4 to see Appearance pickers (theme, accent, density).</p>
          </div>
        )}
        {active === 'data' && (
          <div className="s1__danger">
            <header className="s1__danger-head">
              <AlertTriangle size={13} strokeWidth={2.4} />
              <span>Danger zone</span>
            </header>
            <p>Permanent actions. Cannot be undone.</p>
            <button type="button" className="s1__danger-btn">Export workspace data</button>
            <button type="button" className="s1__danger-btn s1__danger-btn--red">Delete workspace</button>
          </div>
        )}
      </motion.section>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="s1__row">
      <div className="s1__row-label">
        <span className="s1__row-name">{label}</span>
        <span className="s1__row-hint">{hint}</span>
      </div>
      <div className="s1__row-control">{children}</div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <button type="button" className={`s1__toggle ${on ? 's1__toggle--on' : ''}`}>
      <span className="s1__toggle-thumb" />
    </button>
  );
}
