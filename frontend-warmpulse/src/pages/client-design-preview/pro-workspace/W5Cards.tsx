import { motion } from 'framer-motion';
import { Activity, ArrowUpRight, CreditCard, Crown, Key, Plus, Users, Webhook } from 'lucide-react';
import { API_KEYS, AUDIT, HUE_BG, TEAM, WEBHOOKS, relTime } from './demoWorkspace';

/**
 * W5 — Overview Cards. Multi-card hub.
 */
export function W5Cards() {
  return (
    <div className="w5">
      <header className="w5__head">
        <span className="w5-eyebrow">Workspace overview</span>
        <h2 className="w5__head-title">Acme · WarmPulse Pro</h2>
        <p className="w5__head-sub">Members · plan · API keys · webhooks · audit · in one place.</p>
      </header>

      <div className="w5__grid">
        {/* Plan card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w5__card w5__card--plan"
        >
          <header className="w5__card-head">
            <span className="w5__card-icon"><Crown size={14} strokeWidth={2.4} /></span>
            <span className="w5__card-eyebrow">Current plan</span>
          </header>
          <span className="w5__plan-name">Pro</span>
          <div className="w5__plan-price"><span className="w5__plan-currency">₹</span><span className="w5__plan-num">5,000</span><span className="w5__plan-period">/ month</span></div>
          <ul className="w5__plan-feats">
            <li>5 mailboxes · 5 used</li>
            <li>10 team seats · 6 used</li>
            <li>5 API keys · 3 active</li>
            <li>White-label reports</li>
          </ul>
          <button type="button" className="w5__card-btn w5__card-btn--primary">
            Manage plan
            <ArrowUpRight size={11} strokeWidth={2.4} />
          </button>
        </motion.section>

        {/* Team card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="w5__card"
        >
          <header className="w5__card-head">
            <span className="w5__card-icon w5__card-icon--cyan"><Users size={14} strokeWidth={2.4} /></span>
            <span className="w5__card-eyebrow">Team · {TEAM.length} members</span>
          </header>
          <div className="w5__avatars">
            {TEAM.slice(0, 5).map((m) => (
              <span key={m.id} className="w5__avatar" style={{ background: HUE_BG(m.hue) }} title={m.name}>{m.avatar}</span>
            ))}
            {TEAM.length > 5 && <span className="w5__avatar w5__avatar--more">+{TEAM.length - 5}</span>}
          </div>
          <ul className="w5__list">
            {TEAM.slice(0, 3).map((m) => (
              <li key={m.id}>
                <span className="w5__list-name">{m.name}</span>
                <span className="w5__list-role">{m.role}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="w5__card-btn w5__card-btn--ghost">
            <Plus size={11} strokeWidth={2.4} />Invite member
          </button>
        </motion.section>

        {/* API keys card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="w5__card"
        >
          <header className="w5__card-head">
            <span className="w5__card-icon w5__card-icon--green"><Key size={14} strokeWidth={2.4} /></span>
            <span className="w5__card-eyebrow">API keys · {API_KEYS.filter((k) => k.status === 'active').length} active</span>
          </header>
          <ul className="w5__list">
            {API_KEYS.filter((k) => k.status === 'active').slice(0, 3).map((k) => (
              <li key={k.id}>
                <span className="w5__list-name">{k.name}</span>
                <span className="w5__list-sub w5__list-sub--mono">{k.prefix}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="w5__card-btn w5__card-btn--ghost">
            <Plus size={11} strokeWidth={2.4} />Create key
          </button>
        </motion.section>

        {/* Webhooks card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="w5__card"
        >
          <header className="w5__card-head">
            <span className="w5__card-icon w5__card-icon--yellow"><Webhook size={14} strokeWidth={2.4} /></span>
            <span className="w5__card-eyebrow">Webhooks · {WEBHOOKS.length} active</span>
          </header>
          <ul className="w5__list">
            {WEBHOOKS.map((w) => (
              <li key={w.id}>
                <span className="w5__list-name w5__list-name--mono">{w.url.split('//')[1]?.split('/')[0]}</span>
                <span className="w5__list-sub">{w.events} delivered · last {w.lastDeliveryRel}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="w5__card-btn w5__card-btn--ghost">
            <Plus size={11} strokeWidth={2.4} />Add webhook
          </button>
        </motion.section>

        {/* Billing card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="w5__card"
        >
          <header className="w5__card-head">
            <span className="w5__card-icon w5__card-icon--pink"><CreditCard size={14} strokeWidth={2.4} /></span>
            <span className="w5__card-eyebrow">Billing</span>
          </header>
          <span className="w5__bill-stat">Next charge</span>
          <span className="w5__bill-amount">₹5,000</span>
          <span className="w5__bill-date">on 14 June 2026</span>
          <ul className="w5__list">
            <li><span className="w5__list-name">VISA · 4242</span><span className="w5__list-role">default</span></li>
            <li><span className="w5__list-name">UPI · alex@okhdfc</span><span className="w5__list-role">backup</span></li>
          </ul>
          <button type="button" className="w5__card-btn w5__card-btn--ghost">
            Manage payment
            <ArrowUpRight size={11} strokeWidth={2.4} />
          </button>
        </motion.section>

        {/* Activity card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="w5__card w5__card--wide"
        >
          <header className="w5__card-head">
            <span className="w5__card-icon w5__card-icon--violet"><Activity size={14} strokeWidth={2.4} /></span>
            <span className="w5__card-eyebrow">Recent activity</span>
          </header>
          <ul className="w5__activity">
            {AUDIT.slice(0, 5).map((e) => {
              const member = TEAM.find((t) => t.email === e.actor);
              return (
                <li key={e.id}>
                  <span className={`w5__activity-dot w5__activity-dot--${e.tone}`} />
                  <span className="w5__activity-text">
                    <strong>{member?.name ?? 'System'}</strong> {e.action} <em>{e.target}</em>
                  </span>
                  <span className="w5__activity-time">{relTime(e.ts)}</span>
                </li>
              );
            })}
          </ul>
        </motion.section>
      </div>
    </div>
  );
}
