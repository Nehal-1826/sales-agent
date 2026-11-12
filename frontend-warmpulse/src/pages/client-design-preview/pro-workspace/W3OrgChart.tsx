import { motion } from 'framer-motion';
import { Crown, GitBranch, Mail, Shield, ShieldCheck, User } from 'lucide-react';
import { TEAM, HUE_BG, type Role } from './demoWorkspace';
import { DEMO_MAILBOXES } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';

/**
 * W3 — Org Hierarchy. Visual org tree with workspace at root.
 */
const ROLE_ICON: Record<Role, typeof Crown> = {
  owner: Crown, admin: ShieldCheck, member: User, viewer: Shield,
};
const ROLE_TONE: Record<Role, string> = {
  owner: 'violet', admin: 'cyan', member: 'green', viewer: 'yellow',
};

export function W3OrgChart() {
  const owner = TEAM.find((t) => t.role === 'owner')!;
  const admins = TEAM.filter((t) => t.role === 'admin');
  const others = TEAM.filter((t) => t.role !== 'owner' && t.role !== 'admin');

  return (
    <div className="w3">
      <header className="w3__head">
        <span className="w3-eyebrow"><GitBranch size={11} strokeWidth={2.4} />Org hierarchy</span>
        <span className="w3__head-meta">{TEAM.length} members · {DEMO_MAILBOXES.length} mailboxes</span>
      </header>

      <div className="w3__tree">
        {/* Workspace root */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w3__root"
        >
          <span className="w3__root-eyebrow">WORKSPACE</span>
          <h3 className="w3__root-name">Acme Co.</h3>
          <span className="w3__root-sub">Pro · ₹5,000/mo · {DEMO_MAILBOXES.length}/5 mailboxes</span>
        </motion.div>

        {/* Connector down */}
        <span className="w3__connector w3__connector--vert" aria-hidden />

        {/* Owner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="w3__owner"
        >
          <PersonCard m={owner} large />
        </motion.div>

        {/* Connector */}
        <span className="w3__connector w3__connector--vert" aria-hidden />

        {/* Admins row */}
        <div className="w3__row w3__row--admins">
          {admins.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.15 + i * 0.05 }}
            >
              <PersonCard m={m} />
            </motion.div>
          ))}
        </div>

        {/* Connector */}
        <span className="w3__connector w3__connector--vert" aria-hidden />

        {/* Members row */}
        <div className="w3__row w3__row--members">
          {others.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.25 + i * 0.05 }}
            >
              <PersonCard m={m} />
            </motion.div>
          ))}
        </div>

        {/* Mailbox row at bottom */}
        <span className="w3__connector w3__connector--vert" aria-hidden />
        <div className="w3__mailboxes">
          <span className="w3__mailboxes-lbl">CONNECTED MAILBOXES</span>
          <div className="w3__mailboxes-row">
            {DEMO_MAILBOXES.map((mb) => (
              <div key={mb.id} className="w3__mb">
                <ProviderSwatch provider={mb.provider} size={26} />
                <span className="w3__mb-email">{mb.email}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonCard({ m, large }: { m: typeof TEAM[number]; large?: boolean }) {
  const Icon = ROLE_ICON[m.role];
  const tone = ROLE_TONE[m.role];
  return (
    <div className={`w3-card w3-card--${tone} ${large ? 'w3-card--large' : ''} w3-card--${m.status}`}>
      <div className={`w3-card__avatar ${large ? 'w3-card__avatar--lg' : ''}`} style={{ background: HUE_BG(m.hue) }}>
        {m.avatar}
      </div>
      <div className="w3-card__body">
        <span className="w3-card__name">{m.name}</span>
        <span className="w3-card__email">{m.email}</span>
        <span className={`w3-card__role w3-card__role--${tone}`}>
          <Icon size={9} strokeWidth={2.4} />
          {m.role}
        </span>
      </div>
      {m.mailboxAssigned && (
        <span className="w3-card__mb">
          <Mail size={9} strokeWidth={2.4} />
          {m.mailboxAssigned.split('@')[0]}
        </span>
      )}
    </div>
  );
}
