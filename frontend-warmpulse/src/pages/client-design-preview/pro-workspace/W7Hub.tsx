import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  Calendar,
  CreditCard,
  Crown,
  Key,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  User,
  Users,
  Webhook,
} from 'lucide-react';
import {
  API_KEYS,
  AUDIT,
  HUE_BG,
  TEAM,
  WEBHOOKS,
  relTime,
  type Role,
} from './demoWorkspace';

/**
 * W7 — Workspace Hub. Fusion of W5 (bento overview) + W6 (member detail spine).
 *
 * Layout:
 *   1. Hero header           — workspace name, plan crown, usage chips
 *   2. Plan + Activity row   — wide Plan card (left) + recent Activity (right)
 *   3. Member workspace      — left member rail + right detail pane (W6 spine)
 *   4. Bento footer          — API keys / Webhooks / Billing cards (W5)
 */

const ROLE_ICON: Record<Role, typeof Crown> = {
  owner: Crown,
  admin: ShieldCheck,
  member: User,
  viewer: Shield,
};
const ROLE_TONE: Record<Role, string> = {
  owner: 'violet',
  admin: 'cyan',
  member: 'green',
  viewer: 'yellow',
};

export function W7Hub() {
  const [activeId, setActiveId] = useState(TEAM[0]!.id);
  const member = TEAM.find((t) => t.id === activeId) ?? TEAM[0]!;
  const memberEvents = AUDIT.filter((a) => a.actor === member.email);
  const RoleIcon = ROLE_ICON[member.role];
  const roleTone = ROLE_TONE[member.role];

  return (
    <div className="w7">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <header className="w7__hero">
        <div className="w7__hero-id">
          <span className="w7__hero-mark">A</span>
          <div className="w7__hero-text">
            <span className="w7__hero-eyebrow">
              <Crown size={11} strokeWidth={2.4} />
              Pro workspace
            </span>
            <h1 className="w7__hero-name">Acme · WarmPulse</h1>
            <span className="w7__hero-slug">acme.warmpulse.io</span>
          </div>
        </div>
        <div className="w7__hero-chips">
          <span className="w7__hero-chip">
            <Users size={11} strokeWidth={2.4} />
            {TEAM.length} members
          </span>
          <span className="w7__hero-chip">
            <Mail size={11} strokeWidth={2.4} />5 mailboxes
          </span>
          <span className="w7__hero-chip">
            <Key size={11} strokeWidth={2.4} />
            {API_KEYS.filter((k) => k.status === 'active').length} API keys
          </span>
          <span className="w7__hero-chip">
            <Webhook size={11} strokeWidth={2.4} />
            {WEBHOOKS.length} webhooks
          </span>
        </div>
      </header>

      {/* ── ROW 1: PLAN + ACTIVITY ───────────────────────────── */}
      <div className="w7__row w7__row--plan">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w7__plan"
        >
          <header className="w7__plan-head">
            <span className="w7__plan-eyebrow">Current plan</span>
            <span className="w7__plan-badge">
              <Crown size={11} strokeWidth={2.4} />
              Pro
            </span>
          </header>
          <div className="w7__plan-price">
            <span className="w7__plan-currency">₹</span>
            <span className="w7__plan-num">5,000</span>
            <span className="w7__plan-period">/ month</span>
          </div>
          <ul className="w7__plan-usage">
            <li>
              <span className="w7__plan-usage-lbl">Mailboxes</span>
              <span className="w7__plan-usage-bar">
                <span className="w7__plan-usage-fill" style={{ width: '100%' }} />
              </span>
              <span className="w7__plan-usage-val">5 / 5</span>
            </li>
            <li>
              <span className="w7__plan-usage-lbl">Team seats</span>
              <span className="w7__plan-usage-bar">
                <span className="w7__plan-usage-fill" style={{ width: '60%' }} />
              </span>
              <span className="w7__plan-usage-val">6 / 10</span>
            </li>
            <li>
              <span className="w7__plan-usage-lbl">API keys</span>
              <span className="w7__plan-usage-bar">
                <span className="w7__plan-usage-fill" style={{ width: '60%' }} />
              </span>
              <span className="w7__plan-usage-val">3 / 5</span>
            </li>
          </ul>
          <button type="button" className="w7__plan-cta">
            Manage plan
            <ArrowUpRight size={11} strokeWidth={2.4} />
          </button>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="w7__activity"
        >
          <header className="w7__activity-head">
            <span className="w7__activity-eyebrow">
              <Activity size={11} strokeWidth={2.4} />
              Workspace activity
            </span>
            <button type="button" className="w7__activity-link">
              View all <ArrowUpRight size={10} strokeWidth={2.4} />
            </button>
          </header>
          <ul className="w7__activity-list">
            {AUDIT.slice(0, 6).map((e) => {
              const who = TEAM.find((t) => t.email === e.actor);
              return (
                <li key={e.id} className="w7__activity-row">
                  <span className={`w7__activity-dot w7__activity-dot--${e.tone}`} />
                  <span className="w7__activity-actor">
                    {who ? (
                      <span
                        className="w7__activity-avatar"
                        style={{ background: HUE_BG(who.hue) }}
                      >
                        {who.avatar}
                      </span>
                    ) : (
                      <span className="w7__activity-avatar w7__activity-avatar--sys">SY</span>
                    )}
                    <span className="w7__activity-name">{who?.name ?? 'System'}</span>
                  </span>
                  <span className="w7__activity-text">
                    {e.action} <em>{e.target}</em>
                  </span>
                  <span className="w7__activity-time">{relTime(e.ts)}</span>
                </li>
              );
            })}
          </ul>
        </motion.section>
      </div>

      {/* ── ROW 2: MEMBER WORKSPACE ──────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
        className="w7__members"
      >
        {/* Left rail */}
        <aside className="w7__rail">
          <header className="w7__rail-head">
            <span className="w7__rail-title">
              <Users size={11} strokeWidth={2.4} />
              Team · {TEAM.length}
            </span>
            <button type="button" className="w7__rail-invite">
              <Plus size={11} strokeWidth={2.4} />
            </button>
          </header>
          <div className="w7__search">
            <Search size={11} strokeWidth={2.4} />
            <input placeholder="Search members…" disabled />
          </div>
          <ul className="w7__rail-list">
            {TEAM.map((m) => {
              const Icon = ROLE_ICON[m.role];
              const isActive = m.id === activeId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(m.id)}
                    className={`w7__rail-row ${isActive ? 'w7__rail-row--active' : ''}`}
                  >
                    <span className="w7__rail-avatar" style={{ background: HUE_BG(m.hue) }}>
                      {m.avatar}
                    </span>
                    <div className="w7__rail-text">
                      <span className="w7__rail-name">{m.name}</span>
                      <span className="w7__rail-sub">{m.email}</span>
                    </div>
                    <span className={`w7__rail-role w7__rail-role--${ROLE_TONE[m.role]}`}>
                      <Icon size={9} strokeWidth={2.4} />
                    </span>
                    <span
                      className={`w7__rail-status w7__rail-status--${m.status}`}
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Right detail pane */}
        <motion.section
          key={member.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="w7__pane"
        >
          <header className="w7__pane-hero">
            <span className="w7__pane-avatar" style={{ background: HUE_BG(member.hue) }}>
              {member.avatar}
            </span>
            <div className="w7__pane-id">
              <span className={`w7__pane-role w7__pane-role--${roleTone}`}>
                <RoleIcon size={11} strokeWidth={2.4} />
                {member.role}
              </span>
              <h2 className="w7__pane-name">{member.name}</h2>
              <span className="w7__pane-email">{member.email}</span>
            </div>
            <div className="w7__pane-actions">
              <button type="button" className="w7-btn w7-btn--ghost">Message</button>
              <button type="button" className="w7-btn w7-btn--ghost">Edit</button>
              <button type="button" className="w7__pane-more">
                <MoreHorizontal size={13} strokeWidth={2.4} />
              </button>
            </div>
          </header>

          <div className="w7__pane-stats">
            <div className="w7__pane-stat">
              <span className="w7__pane-stat-lbl">Status</span>
              <span className={`w7__pane-stat-val w7__pane-stat-val--${member.status}`}>
                {member.status}
              </span>
            </div>
            <div className="w7__pane-stat">
              <span className="w7__pane-stat-lbl">Last seen</span>
              <span className="w7__pane-stat-val">{member.lastSeenRel}</span>
            </div>
            <div className="w7__pane-stat">
              <span className="w7__pane-stat-lbl">Mailbox</span>
              <span className="w7__pane-stat-val">
                {member.mailboxAssigned ? member.mailboxAssigned.split('@')[0] : '—'}
              </span>
            </div>
            <div className="w7__pane-stat">
              <span className="w7__pane-stat-lbl">Joined</span>
              <span className="w7__pane-stat-val">14 days ago</span>
            </div>
          </div>

          <section className="w7__panel">
            <header className="w7__panel-head">
              <span className="w7__panel-title">
                <Key size={11} strokeWidth={2.4} /> Permissions
              </span>
              <button type="button" className="w7-btn w7-btn--ghost">Edit</button>
            </header>
            <div className="w7__perms">
              <Perm label="Manage mailboxes" on={['owner', 'admin'].includes(member.role)} />
              <Perm
                label="Generate reports"
                on={['owner', 'admin', 'member'].includes(member.role)}
              />
              <Perm label="Invite members" on={member.role === 'owner'} />
              <Perm label="Manage billing" on={member.role === 'owner'} />
              <Perm label="View workspace" on={true} />
              <Perm label="Manage API keys" on={['owner', 'admin'].includes(member.role)} />
            </div>
          </section>

          {member.mailboxAssigned && (
            <section className="w7__panel">
              <header className="w7__panel-head">
                <span className="w7__panel-title">
                  <Mail size={11} strokeWidth={2.4} /> Assigned mailbox
                </span>
              </header>
              <div className="w7__mb-card">
                <span className="w7__mb-avatar">
                  {member.mailboxAssigned.charAt(0).toUpperCase()}
                </span>
                <div className="w7__mb-text">
                  <span className="w7__mb-email">{member.mailboxAssigned}</span>
                  <span className="w7__mb-sub">Active · Day 12 · Warmth 87</span>
                </div>
                <button type="button" className="w7-btn w7-btn--ghost">
                  Open
                  <ArrowUpRight size={11} strokeWidth={2.4} />
                </button>
              </div>
            </section>
          )}

          <section className="w7__panel">
            <header className="w7__panel-head">
              <span className="w7__panel-title">
                <Calendar size={11} strokeWidth={2.4} /> Recent activity
              </span>
              <span className="w7__panel-meta">{memberEvents.length} events</span>
            </header>
            {memberEvents.length === 0 ? (
              <div className="w7__empty">No recent activity for this member.</div>
            ) : (
              <ul className="w7__events">
                {memberEvents.map((e) => (
                  <li key={e.id} className="w7__event">
                    <span className={`w7__event-dot w7__event-dot--${e.tone}`} />
                    <span className="w7__event-text">
                      {e.action} <strong>{e.target}</strong>
                    </span>
                    <span className="w7__event-time">{relTime(e.ts)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </motion.section>
      </motion.div>

      {/* ── ROW 3: BENTO FOOTER ──────────────────────────────── */}
      <div className="w7__bento">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          className="w7__card"
        >
          <header className="w7__card-head">
            <span className="w7__card-icon w7__card-icon--green">
              <Key size={13} strokeWidth={2.4} />
            </span>
            <div className="w7__card-id">
              <span className="w7__card-eyebrow">API keys</span>
              <span className="w7__card-meta">
                {API_KEYS.filter((k) => k.status === 'active').length} active ·{' '}
                {API_KEYS.length} total
              </span>
            </div>
            <button type="button" className="w7__card-add">
              <Plus size={11} strokeWidth={2.4} />
            </button>
          </header>
          <ul className="w7__card-list">
            {API_KEYS.filter((k) => k.status === 'active')
              .slice(0, 3)
              .map((k) => (
                <li key={k.id} className="w7__card-row">
                  <span className="w7__card-row-name">{k.name}</span>
                  <span className="w7__card-row-sub w7__mono">{k.prefix}</span>
                  <span className="w7__card-row-time">used {k.lastUsedRel}</span>
                </li>
              ))}
          </ul>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.2 }}
          className="w7__card"
        >
          <header className="w7__card-head">
            <span className="w7__card-icon w7__card-icon--yellow">
              <Webhook size={13} strokeWidth={2.4} />
            </span>
            <div className="w7__card-id">
              <span className="w7__card-eyebrow">Webhooks</span>
              <span className="w7__card-meta">{WEBHOOKS.length} active</span>
            </div>
            <button type="button" className="w7__card-add">
              <Plus size={11} strokeWidth={2.4} />
            </button>
          </header>
          <ul className="w7__card-list">
            {WEBHOOKS.map((w) => (
              <li key={w.id} className="w7__card-row">
                <span className="w7__card-row-name w7__mono">
                  {w.url.split('//')[1]?.split('/')[0]}
                </span>
                <span className="w7__card-row-sub">
                  {w.events} delivered · {w.failures} failed
                </span>
                <span className="w7__card-row-time">last {w.lastDeliveryRel}</span>
              </li>
            ))}
          </ul>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.25 }}
          className="w7__card"
        >
          <header className="w7__card-head">
            <span className="w7__card-icon w7__card-icon--pink">
              <CreditCard size={13} strokeWidth={2.4} />
            </span>
            <div className="w7__card-id">
              <span className="w7__card-eyebrow">Billing</span>
              <span className="w7__card-meta">Next charge in 31 days</span>
            </div>
          </header>
          <div className="w7__bill-amount">
            <span className="w7__bill-cur">₹</span>
            <span className="w7__bill-num">5,000</span>
            <span className="w7__bill-date">on 14 Jun 2026</span>
          </div>
          <ul className="w7__card-list">
            <li className="w7__card-row">
              <span className="w7__card-row-name">VISA · 4242</span>
              <span className="w7__card-row-sub">default</span>
              <span className="w7__card-row-time">exp 09/28</span>
            </li>
            <li className="w7__card-row">
              <span className="w7__card-row-name">UPI · alex@okhdfc</span>
              <span className="w7__card-row-sub">backup</span>
              <span className="w7__card-row-time">linked</span>
            </li>
          </ul>
        </motion.section>
      </div>
    </div>
  );
}

function Perm({ label, on }: { label: string; on: boolean }) {
  return (
    <div className={`w7__perm ${on ? 'w7__perm--on' : 'w7__perm--off'}`}>
      <span className="w7__perm-icon">{on ? '✓' : '—'}</span>
      <span>{label}</span>
    </div>
  );
}
