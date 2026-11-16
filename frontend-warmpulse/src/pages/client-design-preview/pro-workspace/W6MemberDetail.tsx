import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Crown, Key, Mail, MoreHorizontal, Search, Shield, ShieldCheck, User, Users } from 'lucide-react';
import { AUDIT, HUE_BG, TEAM, relTime, type Role } from './demoWorkspace';

/**
 * W6 — Split Member View. Left rail of members + right detail pane.
 */
const ROLE_ICON: Record<Role, typeof Crown> = { owner: Crown, admin: ShieldCheck, member: User, viewer: Shield };
const ROLE_TONE: Record<Role, string> = { owner: 'violet', admin: 'cyan', member: 'green', viewer: 'yellow' };

export function W6MemberDetail() {
  const [activeId, setActiveId] = useState(TEAM[0]!.id);
  const member = TEAM.find((t) => t.id === activeId) ?? TEAM[0]!;
  const memberEvents = AUDIT.filter((a) => a.actor === member.email);
  const RoleIcon = ROLE_ICON[member.role];
  const roleTone = ROLE_TONE[member.role];

  return (
    <div className="w6">
      <aside className="w6__rail">
        <header className="w6__rail-head">
          <span className="w6-eyebrow"><Users size={11} strokeWidth={2.4} />Team · {TEAM.length}</span>
        </header>
        <div className="w6__search">
          <Search size={11} strokeWidth={2.4} />
          <input placeholder="Search members…" disabled />
        </div>
        <ul className="w6__rail-list">
          {TEAM.map((m) => {
            const Icon = ROLE_ICON[m.role];
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(m.id)}
                  className={`w6__rail-row ${m.id === activeId ? 'w6__rail-row--active' : ''}`}
                >
                  <span className="w6__rail-avatar" style={{ background: HUE_BG(m.hue) }}>{m.avatar}</span>
                  <div className="w6__rail-text">
                    <span className="w6__rail-name">{m.name}</span>
                    <span className="w6__rail-sub">{m.email}</span>
                  </div>
                  <span className={`w6__rail-role w6__rail-role--${ROLE_TONE[m.role]}`}>
                    <Icon size={9} strokeWidth={2.4} />
                  </span>
                  <span className={`w6__rail-status w6__rail-status--${m.status}`} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <motion.section
        key={member.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="w6__pane"
      >
        {/* Hero */}
        <header className="w6__hero">
          <span className="w6__hero-avatar" style={{ background: HUE_BG(member.hue) }}>{member.avatar}</span>
          <div className="w6__hero-text">
            <span className={`w6__hero-role w6__hero-role--${roleTone}`}>
              <RoleIcon size={11} strokeWidth={2.4} />
              {member.role}
            </span>
            <h2 className="w6__hero-name">{member.name}</h2>
            <span className="w6__hero-email">{member.email}</span>
          </div>
          <button type="button" className="w6__hero-more"><MoreHorizontal size={13} strokeWidth={2.4} /></button>
        </header>

        {/* Stats */}
        <div className="w6__stats">
          <div className="w6__stat">
            <span className="w6__stat-lbl">Status</span>
            <span className={`w6__stat-val w6__stat-val--${member.status}`}>{member.status}</span>
          </div>
          <div className="w6__stat">
            <span className="w6__stat-lbl">Last seen</span>
            <span className="w6__stat-val">{member.lastSeenRel}</span>
          </div>
          <div className="w6__stat">
            <span className="w6__stat-lbl">Mailbox</span>
            <span className="w6__stat-val">{member.mailboxAssigned ? member.mailboxAssigned.split('@')[0] : '—'}</span>
          </div>
          <div className="w6__stat">
            <span className="w6__stat-lbl">Joined</span>
            <span className="w6__stat-val">14 days ago</span>
          </div>
        </div>

        {/* Permissions */}
        <section className="w6__panel">
          <header className="w6__panel-head">
            <span><Key size={11} strokeWidth={2.4} /> Permissions</span>
            <button type="button" className="w6-btn w6-btn--ghost">Edit</button>
          </header>
          <div className="w6__perms">
            <Perm label="Manage mailboxes" on={['owner', 'admin'].includes(member.role)} />
            <Perm label="Generate reports" on={['owner', 'admin', 'member'].includes(member.role)} />
            <Perm label="Invite members" on={member.role === 'owner'} />
            <Perm label="Manage billing" on={member.role === 'owner'} />
            <Perm label="View workspace" on={true} />
            <Perm label="Manage API keys" on={['owner', 'admin'].includes(member.role)} />
          </div>
        </section>

        {/* Mailbox assignment */}
        {member.mailboxAssigned && (
          <section className="w6__panel">
            <header className="w6__panel-head">
              <span><Mail size={11} strokeWidth={2.4} /> Assigned mailbox</span>
            </header>
            <div className="w6__mb-card">
              <span className="w6__mb-avatar">{member.mailboxAssigned.charAt(0).toUpperCase()}</span>
              <div className="w6__mb-text">
                <span className="w6__mb-email">{member.mailboxAssigned}</span>
                <span className="w6__mb-sub">Active · Day 12 · Warmth 87</span>
              </div>
              <button type="button" className="w6-btn w6-btn--ghost">Open</button>
            </div>
          </section>
        )}

        {/* Activity */}
        <section className="w6__panel">
          <header className="w6__panel-head">
            <span><Calendar size={11} strokeWidth={2.4} /> Recent activity</span>
            <span className="w6__panel-meta">{memberEvents.length} events</span>
          </header>
          {memberEvents.length === 0 ? (
            <div className="w6__empty">No recent activity for this member.</div>
          ) : (
            <ul className="w6__events">
              {memberEvents.map((e) => (
                <li key={e.id} className="w6__event">
                  <span className={`w6__event-dot w6__event-dot--${e.tone}`} />
                  <span className="w6__event-text">
                    {e.action} <strong>{e.target}</strong>
                  </span>
                  <span className="w6__event-time">{relTime(e.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </motion.section>
    </div>
  );
}

function Perm({ label, on }: { label: string; on: boolean }) {
  return (
    <div className={`w6__perm ${on ? 'w6__perm--on' : 'w6__perm--off'}`}>
      <span className="w6__perm-icon">{on ? '✓' : '—'}</span>
      <span>{label}</span>
    </div>
  );
}
