import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Copy, Crown, EyeOff, Key, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { API_KEYS, HUE_BG, PLAN_ROWS, SETTINGS_SECTIONS, TEAM, WEBHOOKS } from './demoWorkspace';

/**
 * W2 — Settings Sidebar. Linear-style left nav + right content pane.
 */
export function W2Settings() {
  const [activeKey, setActiveKey] = useState(SETTINGS_SECTIONS[0]!.key);
  const active = SETTINGS_SECTIONS.find((s) => s.key === activeKey) ?? SETTINGS_SECTIONS[0]!;

  return (
    <div className="w2">
      <aside className="w2__nav">
        <header className="w2__nav-head">
          <span className="w2-eyebrow"><ShieldCheck size={11} strokeWidth={2.4} />Workspace</span>
          <span className="w2__nav-name">Acme</span>
        </header>
        <ul className="w2__nav-list">
          {SETTINGS_SECTIONS.map((s) => {
            const Icon = s.Icon;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setActiveKey(s.key)}
                  className={`w2__nav-row ${s.key === activeKey ? 'w2__nav-row--active' : ''}`}
                >
                  <span className="w2__nav-icon"><Icon size={12} strokeWidth={2.4} /></span>
                  <div className="w2__nav-text">
                    <span className="w2__nav-row-name">{s.name}</span>
                    <span className="w2__nav-row-sub">{s.desc}</span>
                  </div>
                  <ChevronRight size={11} strokeWidth={2.4} className="w2__nav-chev" />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <motion.section
        key={active.key}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="w2__pane"
      >
        <header className="w2__pane-head">
          <span className="w2__pane-icon"><active.Icon size={18} strokeWidth={2.2} /></span>
          <div>
            <span className="w2-eyebrow">Workspace · {active.key}</span>
            <h2 className="w2__pane-title">{active.name}</h2>
            <p className="w2__pane-sub">{active.desc}</p>
          </div>
        </header>

        {/* Content varies per section */}
        {active.key === 'profile' && <ProfileForm />}
        {active.key === 'team' && <TeamSection />}
        {active.key === 'plan' && <PlanSection />}
        {active.key === 'api' && <ApiSection />}
        {active.key === 'webhooks' && <WebhooksSection />}
        {active.key === 'security' && <SecuritySection />}
      </motion.section>
    </div>
  );
}

function ProfileForm() {
  return (
    <div className="w2__form">
      <Field label="Workspace name" value="Acme Co." />
      <Field label="Slug" value="acme-co" mono />
      <Field label="Brand color" value="#F26522" mono />
      <Field label="Default timezone" value="Asia/Kolkata" />
      <Field label="Locale" value="English (India)" />
      <footer className="w2__form-foot">
        <button type="button" className="w2-btn w2-btn--primary"><Save size={11} strokeWidth={2.4} />Save changes</button>
      </footer>
    </div>
  );
}

function TeamSection() {
  return (
    <ul className="w2__list">
      {TEAM.slice(0, 5).map((m) => (
        <li key={m.id} className="w2__list-row">
          <div className="w2__list-avatar" style={{ background: HUE_BG(m.hue) }}>{m.avatar}</div>
          <div className="w2__list-body">
            <span className="w2__list-name">{m.name}</span>
            <span className="w2__list-sub">{m.email}</span>
          </div>
          <span className="w2__list-tag">{m.role}</span>
          <span className="w2__list-time">{m.lastSeenRel}</span>
        </li>
      ))}
      <li className="w2__list-cta">
        <button type="button" className="w2-btn w2-btn--ghost"><Plus size={11} strokeWidth={2.4} />Invite member</button>
      </li>
    </ul>
  );
}

function PlanSection() {
  return (
    <div className="w2__plans">
      {PLAN_ROWS.map((p) => (
        <div key={p.name} className={`w2__plan ${p.current ? 'w2__plan--current' : ''}`}>
          <header className="w2__plan-head">
            {p.current && <span className="w2__plan-tag"><Crown size={10} strokeWidth={2.4} />CURRENT</span>}
            <span className="w2__plan-name">{p.name}</span>
            <span className="w2__plan-price">{p.price}</span>
          </header>
          <ul className="w2__plan-feats">
            <li><Users size={10} strokeWidth={2.4} /> {p.members} members</li>
            <li><Check size={10} strokeWidth={2.4} /> {p.mailboxes} mailboxes</li>
            <li><Key size={10} strokeWidth={2.4} /> {p.apiKeys} API keys</li>
          </ul>
          <button type="button" className={`w2-btn ${p.current ? 'w2-btn--ghost' : 'w2-btn--primary'} w2-btn--full`}>
            {p.current ? 'Manage' : `Switch to ${p.name}`}
          </button>
        </div>
      ))}
    </div>
  );
}

function ApiSection() {
  return (
    <div>
      <div className="w2__api-warn">
        <EyeOff size={11} strokeWidth={2.4} />
        Keys are shown once at creation. Store them somewhere safe — we hash them on our side.
      </div>
      <ul className="w2__list">
        {API_KEYS.map((k) => (
          <li key={k.id} className={`w2__list-row ${k.status === 'revoked' ? 'w2__list-row--dim' : ''}`}>
            <div className="w2__list-avatar w2__list-avatar--key"><Key size={13} strokeWidth={2.2} /></div>
            <div className="w2__list-body">
              <span className="w2__list-name">{k.name}</span>
              <span className="w2__list-sub w2__list-sub--mono">{k.prefix}</span>
            </div>
            <span className="w2__list-tag">{k.status}</span>
            <span className="w2__list-time">Used {k.lastUsedRel}</span>
            <button type="button" className="w2__list-icon-btn" title="Copy"><Copy size={11} strokeWidth={2.4} /></button>
            <button type="button" className="w2__list-icon-btn w2__list-icon-btn--danger" title="Revoke"><Trash2 size={11} strokeWidth={2.4} /></button>
          </li>
        ))}
      </ul>
      <button type="button" className="w2-btn w2-btn--primary"><Plus size={11} strokeWidth={2.4} />Create API key</button>
    </div>
  );
}

function WebhooksSection() {
  return (
    <ul className="w2__list">
      {WEBHOOKS.map((w) => (
        <li key={w.id} className="w2__list-row">
          <div className="w2__list-avatar w2__list-avatar--hook">⚡</div>
          <div className="w2__list-body">
            <span className="w2__list-name w2__list-name--mono">{w.url}</span>
            <span className="w2__list-sub">{w.events} events · {w.failures} failures · last delivery {w.lastDeliveryRel}</span>
          </div>
          <span className="w2__list-tag">{w.status}</span>
        </li>
      ))}
      <li className="w2__list-cta">
        <button type="button" className="w2-btn w2-btn--ghost"><Plus size={11} strokeWidth={2.4} />Add webhook</button>
      </li>
    </ul>
  );
}

function SecuritySection() {
  return (
    <div className="w2__sec">
      <Toggle label="Single sign-on (SSO)" sub="SAML 2.0 · enforce SSO for all members" on={true} />
      <Toggle label="Two-factor authentication" sub="Authenticator app required for admins" on={true} />
      <Toggle label="IP allow-list" sub="0 IPs configured" on={false} />
      <Toggle label="Session timeout" sub="Sign out idle members after 24h" on={true} />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="w2__field">
      <label className="w2__field-label">{label}</label>
      <span className={`w2__field-value ${mono ? 'w2__field-value--mono' : ''}`}>{value}</span>
    </div>
  );
}

function Toggle({ label, sub, on }: { label: string; sub: string; on: boolean }) {
  return (
    <div className="w2__toggle">
      <div>
        <span className="w2__toggle-lbl">{label}</span>
        <span className="w2__toggle-sub">{sub}</span>
      </div>
      <span className={`w2__toggle-pill ${on ? 'w2__toggle-pill--on' : ''}`}>
        <span className="w2__toggle-dot" />
      </span>
    </div>
  );
}
