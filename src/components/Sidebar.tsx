import { useEffect, useState } from 'react';
import { IconBot, IconBuilding, IconHome, IconInbox, IconLogout, IconPulse, IconSettings } from './icons';
import type { IconProps } from './icons';
import { AutopilotPill } from './AutopilotPill';
import { getCurrentUser } from '../lib/api';
import type { CurrentUser } from '../lib/api';
import { navigate } from '../lib/router';
import { useWorkspaceStatus } from '../lib/status';
import type { PageKey } from '../lib/types';

const NAV: { key: PageKey; label: string; icon: (p: IconProps) => JSX.Element }[] = [
  { key: 'home', label: 'Home', icon: IconHome },
  { key: 'approvals', label: 'Approvals', icon: IconInbox },
  { key: 'leads', label: 'Leads', icon: IconBuilding },
  { key: 'activity', label: 'Activity', icon: IconPulse },
  { key: 'assistant', label: 'Assistant', icon: IconBot },
  { key: 'settings', label: 'Settings', icon: IconSettings },
];

export function Sidebar({
  page,
  open,
  onClose,
  demo,
  onSignOut,
}: {
  page: PageKey;
  open: boolean;
  onClose: () => void;
  demo: boolean;
  onSignOut: () => void;
}) {
  const { outreach } = useWorkspaceStatus();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const waiting = outreach?.drafts ?? 0;

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
      <button className="sidebar-brand" onClick={() => navigate('home')} aria-label="Shailog — go to Home">
        <img src="/logo.png" alt="" className="brand-logo" />
      </button>

      <nav className="side-nav">
        {NAV.filter(({ key }) => key !== 'settings' || user?.role === 'owner' || user?.role === 'admin').map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`nav-item${page === key ? ' active' : ''}`}
            onClick={() => navigate(key)}
            aria-current={page === key ? 'page' : undefined}
          >
            <Icon size={18} />
            <span>{label}</span>
            {key === 'approvals' && waiting > 0 && (
              <span className="nav-badge" aria-label={`${waiting} waiting`}>
                {waiting > 99 ? '99+' : waiting}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-status">
          <AutopilotPill demo={demo} compact />
        </div>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden>
            {(user?.name ?? '··').slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{user?.name ?? 'Signed in'}</strong>
            <small>{user ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : ''}</small>
          </div>
          <button className="icon-btn side-logout" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <IconLogout size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
