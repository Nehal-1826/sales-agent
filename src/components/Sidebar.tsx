import { useEffect, useState } from 'react';
import { IconCrm, IconDashboard, IconHome, IconLoop, IconSettings } from './icons';
import { getCurrentUser } from '../lib/api';
import { StatusDot } from './ui';
import type { PageKey } from '../lib/types';

const NAV: { key: PageKey; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { key: 'leads', label: 'Report', icon: IconCrm },
  { key: 'pipeline', label: 'Pipeline', icon: IconLoop },
  { key: 'settings', label: 'Settings', icon: IconSettings },
];

export function Sidebar({
  page,
  onNavigate,
  open,
  onClose,
  live,
  onLogout,
  onHome,
  minimal = false,
}: {
  page: PageKey;
  onNavigate: (p: PageKey) => void;
  open: boolean;
  onClose: () => void;
  live: boolean | null;
  onLogout?: () => void;
  onHome?: () => void;
  minimal?: boolean;
}) {
  const [user, setUser] = useState<{ name: string; role: string; mode: string } | null>(null);

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, [live]);

  return (
    <aside className={`sidebar${open ? ' open' : ''}${minimal ? ' minimal' : ''}`}>
      <div className="sidebar-brand" onClick={() => onNavigate('dashboard')}>
        <img src="/shailog-mark.png" alt="Shailog" className="brand-logo" />
      </div>

      <nav className="side-nav" aria-label="Main">
        {onHome && (
          <button
            className="nav-item"
            onClick={() => {
              onHome();
              onClose();
            }}
          >
            <IconHome size={24} />
            <span className="nav-tip">Home</span>
          </button>
        )}
        {NAV.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`nav-item${page === key ? ' active' : ''}`}
            onClick={() => {
              onNavigate(key);
              onClose();
            }}
            aria-current={page === key ? 'page' : undefined}
          >
            <Icon size={24} />
            <span className="nav-tip">{label}</span>
          </button>
        ))}
      </nav>

      {!minimal && (
      <div className="sidebar-foot">
        <div className="sidebar-system">
          <StatusDot tone="success" pulse />
          <div>
            <strong>System running</strong>
            <small>{live === null ? 'Backend: checking…' : live ? 'Backend: live · Django' : 'Backend: not running'}</small>
          </div>
        </div>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden>
            {(user?.name ?? 'OP').slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{user?.name ?? 'Operator'}</strong>
            <small>
              {user ? `${user.role} · ${user.mode}` : 'Owner · mock session'}
            </small>
          </div>
        </div>
        {onLogout && (
          <button className="btn btn-ghost side-logout" onClick={onLogout}>
            ⎋ Sign out
          </button>
        )}
      </div>
      )}
    </aside>
  );
}
