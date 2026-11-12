import { motion } from 'framer-motion';
import { ChevronDown, Crown, Mail, MoreHorizontal, Plus, Search, Shield, ShieldCheck, User, Users } from 'lucide-react';
import { TEAM, HUE_BG, type Role } from './demoWorkspace';

/**
 * W1 — Team Roster. Notion-style team grid + invite CTA.
 */
const ROLE_META: Record<Role, { label: string; tone: string; Icon: typeof Crown }> = {
  owner:  { label: 'Owner',  tone: 'violet', Icon: Crown },
  admin:  { label: 'Admin',  tone: 'cyan',   Icon: ShieldCheck },
  member: { label: 'Member', tone: 'green',  Icon: User },
  viewer: { label: 'Viewer', tone: 'yellow', Icon: Shield },
};

export function W1Roster() {
  const counts = {
    owner: TEAM.filter((t) => t.role === 'owner').length,
    admin: TEAM.filter((t) => t.role === 'admin').length,
    member: TEAM.filter((t) => t.role === 'member').length,
    viewer: TEAM.filter((t) => t.role === 'viewer').length,
  };

  return (
    <div className="w1">
      {/* Header */}
      <header className="w1__head">
        <div>
          <span className="w1-eyebrow"><Users size={11} strokeWidth={2.4} />Team roster</span>
          <h2 className="w1__head-title">Acme · {TEAM.length} members</h2>
        </div>
        <div className="w1__head-actions">
          <div className="w1__search">
            <Search size={11} strokeWidth={2.4} />
            <input placeholder="Search members…" disabled />
          </div>
          <button type="button" className="w1-btn w1-btn--primary"><Plus size={11} strokeWidth={2.4} />Invite member</button>
        </div>
      </header>

      {/* Role pills */}
      <div className="w1__roles">
        {(Object.keys(ROLE_META) as Role[]).map((r) => {
          const m = ROLE_META[r];
          const Icon = m.Icon;
          return (
            <div key={r} className={`w1__role w1__role--${m.tone}`}>
              <span className={`w1__role-icon w1__role-icon--${m.tone}`}><Icon size={11} strokeWidth={2.4} /></span>
              <span className="w1__role-num">{counts[r]}</span>
              <span className="w1__role-lbl">{m.label}{counts[r] === 1 ? '' : 's'}</span>
            </div>
          );
        })}
      </div>

      {/* Member grid */}
      <div className="w1__grid">
        {TEAM.map((m, i) => {
          const role = ROLE_META[m.role];
          const RoleIcon = role.Icon;
          return (
            <motion.section
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className={`w1__card w1__card--${m.status}`}
            >
              <header className="w1__card-head">
                <div className="w1__card-avatar" style={{ background: HUE_BG(m.hue) }}>
                  {m.avatar}
                </div>
                <button type="button" className="w1__card-more"><MoreHorizontal size={13} strokeWidth={2.4} /></button>
              </header>
              <div className="w1__card-body">
                <h3 className="w1__card-name">{m.name}</h3>
                <span className="w1__card-email">{m.email}</span>
                <div className={`w1__card-role w1__card-role--${role.tone}`}>
                  <RoleIcon size={10} strokeWidth={2.4} />
                  {role.label}
                </div>
              </div>
              <footer className="w1__card-foot">
                {m.mailboxAssigned ? (
                  <span className="w1__card-mb">
                    <Mail size={9} strokeWidth={2.4} />
                    {m.mailboxAssigned}
                  </span>
                ) : (
                  <span className="w1__card-mb w1__card-mb--none">No mailbox</span>
                )}
                <span className={`w1__card-status w1__card-status--${m.status}`}>
                  <span className={`w1__card-dot w1__card-dot--${m.status}`} />
                  {m.lastSeenRel}
                </span>
              </footer>
            </motion.section>
          );
        })}

        {/* Invite slot */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: TEAM.length * 0.04 }}
          className="w1__invite"
        >
          <span className="w1__invite-icon"><Plus size={20} strokeWidth={2.2} /></span>
          <span className="w1__invite-title">Invite a member</span>
          <span className="w1__invite-sub">{TEAM.length}/10 seats · Pro plan</span>
          <button type="button" className="w1__invite-btn">
            Send invite
            <ChevronDown size={11} strokeWidth={2.4} style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </motion.section>
      </div>
    </div>
  );
}
