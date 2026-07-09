import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  Download,
  Globe2,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Save,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  ACCENT_COLORS,
  CATEGORIES,
  DATA_ACTIONS,
  DENSITIES,
  INTEGRATIONS,
  LANGUAGES,
  NOTIFICATION_PREFS,
  PROFILE,
  SECURITY_ITEMS,
  SESSIONS,
  THEMES,
  TIMEZONES,
  type CatKey,
} from './demoSettings';

/**
 * S4 — Horizontal Tabs.
 * Stripe / Vercel style. Top tab strip + scrollable form below.
 * Every tab fully populated with real demo data.
 */
export function S4Tabs() {
  const [active, setActive] = useState<CatKey>('profile');

  return (
    <div className="s4">
      <header className="s4__head">
        <h2 className="s4__head-title">Settings</h2>
        <button type="button" className="s4__save">
          <Save size={11} strokeWidth={2.4} />
          Save changes
        </button>
      </header>

      <nav className="s4__tabs" role="tablist">
        {CATEGORIES.map((c) => {
          const Icon = c.Icon;
          const isActive = c.key === active;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(c.key)}
              className={`s4__tab ${isActive ? 's4__tab--active' : ''}`}
            >
              <Icon size={12} strokeWidth={2.4} />
              {c.name}
            </button>
          );
        })}
      </nav>

      <motion.section
        key={active}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="s4__pane"
      >
        {/* ── PROFILE ─────────────────────────────────────────────── */}
        {active === 'profile' && (
          <>
            <Section title="Workspace identity" desc="Name + slug used in nav, reports, and outbound URLs.">
              <FormRow label="Workspace name">
                <input className="s4__input" defaultValue={PROFILE.workspaceName} />
              </FormRow>
              <FormRow label="Slug">
                <div className="s4__slug">
                  <span className="s4__slug-prefix">warmpulse.io /</span>
                  <input className="s4__input s4__input--slug" defaultValue={PROFILE.slug} />
                </div>
              </FormRow>
              <FormRow label="Default sender">
                <div className="s4__input-icon">
                  <Mail size={12} strokeWidth={2.4} />
                  <input className="s4__input" defaultValue={PROFILE.defaultSender} />
                </div>
              </FormRow>
            </Section>

            <Section title="Locale" desc="Timezone, language, and week-start govern every schedule + report.">
              <FormRow label="Timezone">
                <div className="s4__input-icon">
                  <Globe2 size={12} strokeWidth={2.4} />
                  <select className="s4__input" defaultValue={PROFILE.timezone}>
                    {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
                  </select>
                </div>
              </FormRow>
              <FormRow label="Language">
                <select className="s4__input" defaultValue={PROFILE.defaultLanguage}>
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </FormRow>
              <FormRow label="Week starts on">
                <div className="s4__seg">
                  {['Sunday', 'Monday', 'Saturday'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`s4__seg-btn ${d === PROFILE.weekStart ? 's4__seg-btn--active' : ''}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </FormRow>
            </Section>

            <Section title="Brand" desc="Used as accent in white-label reports and outbound email shells.">
              <FormRow label="Brand color">
                <div className="s4__color">
                  <span className="s4__color-swatch" style={{ background: PROFILE.brandColor }} />
                  <input className="s4__input s4__input--mono" defaultValue={PROFILE.brandColor} />
                </div>
              </FormRow>
              <FormRow label="Workspace avatar">
                <div className="s4__avatar-row">
                  <span className="s4__avatar">A</span>
                  <button type="button" className="s4__btn-ghost">Upload image</button>
                  <span className="s4__hint">PNG · 512×512 · max 1 MB</span>
                </div>
              </FormRow>
            </Section>
          </>
        )}

        {/* ── SECURITY ────────────────────────────────────────────── */}
        {active === 'security' && (
          <>
            <Section title="Authentication" desc="How members sign in. 2FA covers 4 of 6 members.">
              {SECURITY_ITEMS.slice(0, 2).map((s) => (
                <div key={s.key} className="s4__sec-row">
                  <div className="s4__sec-text">
                    <span className="s4__sec-label">{s.label}</span>
                    <span className="s4__sec-detail">{s.detail}</span>
                  </div>
                  <span className={`s4__pill s4__pill--${s.status}`}>{s.status}</span>
                  <button
                    type="button"
                    className={s.status === 'enabled' ? 's4__btn-ghost' : 's4__btn-primary'}
                  >
                    {s.status === 'enabled' ? 'Manage' : s.status === 'partial' ? 'Enforce' : 'Upgrade'}
                  </button>
                </div>
              ))}
            </Section>

            <Section title="Network" desc="Restrict workspace access by source IP and session lifetime.">
              {SECURITY_ITEMS.slice(2).map((s) => (
                <div key={s.key} className="s4__sec-row">
                  <div className="s4__sec-text">
                    <span className="s4__sec-label">{s.label}</span>
                    <span className="s4__sec-detail">{s.detail}</span>
                  </div>
                  <span className={`s4__pill s4__pill--${s.status}`}>{s.status}</span>
                  <button type="button" className="s4__btn-ghost">Configure</button>
                </div>
              ))}
            </Section>

            <Section
              title="Active sessions"
              desc={`${SESSIONS.length} devices currently signed in`}
              action={
                <button type="button" className="s4__btn-danger">
                  <LogOut size={11} strokeWidth={2.4} />
                  Sign out all other sessions
                </button>
              }
            >
              <div className="s4__sessions">
                <ul className="s4__sessions-list">
                  {SESSIONS.map((s) => (
                    <li key={s.id} className={`s4__session ${s.isCurrent ? 's4__session--current' : ''}`}>
                      <div className="s4__session-id">
                        <span className="s4__session-device">{s.device}</span>
                        <span className="s4__session-sub">{s.os} · {s.city} · <span className="s4__mono">{s.ip}</span></span>
                      </div>
                      <span className="s4__session-time">{s.lastActiveRel}</span>
                      {s.isCurrent ? (
                        <span className="s4__session-pill">This device</span>
                      ) : (
                        <button type="button" className="s4__session-revoke">Sign out</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          </>
        )}

        {/* ── NOTIFICATIONS ───────────────────────────────────────── */}
        {active === 'notifications' && (
          <>
            <Section
              title="Delivery channels"
              desc="Choose how each event reaches you. Push uses your device's native notifier."
            >
              <div className="s4__notif">
                <header className="s4__notif-head">
                  <span>Event</span>
                  <span>Email</span>
                  <span>In-app</span>
                  <span>Push</span>
                </header>
                {NOTIFICATION_PREFS.map((n) => (
                  <div key={n.key} className="s4__notif-row">
                    <div className="s4__notif-event">
                      <span className="s4__notif-label">{n.label}</span>
                      <span className="s4__notif-desc">{n.desc}</span>
                    </div>
                    <Toggle on={n.email} />
                    <Toggle on={n.inApp} />
                    <Toggle on={n.push} />
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title="Delivery email"
              desc="Where transactional and digest emails are sent."
              action={
                <button type="button" className="s4__btn-ghost">
                  Send test notification
                </button>
              }
            >
              <FormRow label="Notification address">
                <div className="s4__input-icon">
                  <Mail size={12} strokeWidth={2.4} />
                  <input className="s4__input" defaultValue="alerts@acme.com" />
                </div>
              </FormRow>
              <FormRow label="Weekly digest time">
                <select className="s4__input" defaultValue="Mon · 09:00 IST">
                  <option>Mon · 09:00 IST</option>
                  <option>Mon · 18:00 IST</option>
                  <option>Fri · 17:00 IST</option>
                </select>
              </FormRow>
            </Section>
          </>
        )}

        {/* ── INTEGRATIONS ────────────────────────────────────────── */}
        {active === 'integrations' && (
          <>
            <Section
              title="Connected apps"
              desc={`${INTEGRATIONS.filter((i) => i.status === 'connected').length} active · click any tile to manage or disconnect`}
            >
              <div className="s4__integ-grid">
                {INTEGRATIONS.map((i) => (
                  <div key={i.key} className={`s4__integ s4__integ--${i.brand}`}>
                    <div className={`s4__integ-logo s4__integ-logo--${i.brand}`}>
                      {i.brand[0]!.toUpperCase()}
                    </div>
                    <div className="s4__integ-body">
                      <div className="s4__integ-head">
                        <span className="s4__integ-name">{i.name}</span>
                        <span className={`s4__integ-status s4__integ-status--${i.status}`}>{i.status}</span>
                      </div>
                      <p className="s4__integ-desc">{i.desc}</p>
                      <span className="s4__integ-meta">{i.meta}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Custom webhook" desc="Receive every warmup event as a JSON POST.">
              <FormRow label="Endpoint URL">
                <input className="s4__input s4__input--mono" defaultValue="https://acme.com/webhooks/warmpulse" />
              </FormRow>
              <FormRow label="Signing secret">
                <div className="s4__input-icon">
                  <input className="s4__input s4__input--mono" defaultValue="whsec_••••••••••••" />
                  <button type="button" className="s4__btn-ghost s4__btn-ghost--inline">Rotate</button>
                </div>
              </FormRow>
            </Section>
          </>
        )}

        {/* ── APPEARANCE ──────────────────────────────────────────── */}
        {active === 'appearance' && (
          <>
            <Section title="Theme" desc="Choose how WarmPulse looks. System matches your OS.">
              <div className="s4__theme-grid">
                {THEMES.map((t) => {
                  const Icon = t.key === 'light' ? Sun : t.key === 'dark' ? Moon : Monitor;
                  const isCurrent = t.key === 'dark';
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`s4__theme ${isCurrent ? 's4__theme--current' : ''}`}
                    >
                      <span className="s4__theme-preview" style={{ background: t.swatch }} />
                      <span className="s4__theme-label">
                        <Icon size={11} strokeWidth={2.4} />
                        {t.label}
                      </span>
                      {isCurrent && <span className="s4__theme-check"><Check size={10} strokeWidth={2.6} /></span>}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Accent color" desc="Used for buttons, links, and chart accents.">
              <div className="s4__accent-row">
                {ACCENT_COLORS.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    className={`s4__accent ${a.hex === PROFILE.brandColor ? 's4__accent--current' : ''}`}
                    style={{ background: a.hex }}
                    title={a.label}
                  >
                    {a.hex === PROFILE.brandColor && <Check size={10} strokeWidth={2.6} />}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Density" desc="How tightly packed the UI feels.">
              <div className="s4__seg">
                {DENSITIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`s4__seg-btn ${d === 'Comfortable' ? 's4__seg-btn--active' : ''}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Language" desc="UI language and date / number formatting.">
              <select className="s4__select" defaultValue="English (India)">
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Section>
          </>
        )}

        {/* ── DATA & PRIVACY ──────────────────────────────────────── */}
        {active === 'data' && (
          <>
            <Section title="Export & retention" desc="Download a copy of your workspace data or tune retention.">
              {DATA_ACTIONS.filter((d) => d.tone === 'info').map((d) => (
                <div key={d.key} className="s4__data-row">
                  <div className="s4__data-text">
                    <span className="s4__data-label">{d.label}</span>
                    <span className="s4__data-desc">{d.desc}</span>
                  </div>
                  <button type="button" className="s4__btn-ghost">
                    {d.key === 'export' && <Download size={11} strokeWidth={2.4} />}
                    {d.cta}
                  </button>
                </div>
              ))}
            </Section>

            <Section title="Privacy requests" desc="Tools for GDPR / DPDP compliance.">
              {DATA_ACTIONS.filter((d) => d.tone === 'warn').map((d) => (
                <div key={d.key} className="s4__data-row">
                  <div className="s4__data-text">
                    <span className="s4__data-label">{d.label}</span>
                    <span className="s4__data-desc">{d.desc}</span>
                  </div>
                  <button type="button" className="s4__btn-warn">{d.cta}</button>
                </div>
              ))}
            </Section>

            <Section
              title="Danger zone"
              desc="Permanent destructive actions. Owner-only."
              variant="danger"
              action={
                <span className="s4__danger-pill">
                  <AlertTriangle size={11} strokeWidth={2.4} />
                  Cannot be undone
                </span>
              }
            >
              {DATA_ACTIONS.filter((d) => d.tone === 'danger').map((d) => (
                <div key={d.key} className="s4__danger-row">
                  <div className="s4__data-text">
                    <span className="s4__data-label">{d.label}</span>
                    <span className="s4__data-desc">{d.desc}</span>
                  </div>
                  <button type="button" className="s4__btn-danger">
                    <Trash2 size={11} strokeWidth={2.4} />
                    {d.cta}
                  </button>
                </div>
              ))}
            </Section>
          </>
        )}
      </motion.section>
    </div>
  );
}

function Section({
  title,
  desc,
  action,
  variant,
  children,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
  variant?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <section className={`s4__section ${variant ? `s4__section--${variant}` : ''}`}>
      <header className="s4__section-head">
        <div className="s4__section-head-text">
          <h3 className="s4__section-title">{title}</h3>
          <p className="s4__section-desc">{desc}</p>
        </div>
        {action && <div className="s4__section-head-action">{action}</div>}
      </header>
      <div className="s4__section-body">{children}</div>
    </section>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="s4__formrow">
      <span className="s4__formrow-label">{label}</span>
      <div className="s4__formrow-control">{children}</div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <button type="button" className={`s4__toggle ${on ? 's4__toggle--on' : ''}`}>
      <span className="s4__toggle-thumb" />
    </button>
  );
}
