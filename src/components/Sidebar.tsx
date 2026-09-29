import { useEffect, useState } from 'react';
import { IconAgents, IconChat, IconCrm, IconDashboard, IconLoop, IconSettings } from './icons';
import { getCurrentUser } from '../lib/api';
import { StatusDot } from './ui';
import type { PageKey } from '../lib/types';

const NAV: { key: PageKey; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { key: 'pipeline', label: 'Pipeline', icon: IconLoop },
  { key: 'agents', label: 'Agents', icon: IconAgents },
  { key: 'crm', label: 'CRM', icon: IconCrm },
  { key: 'chat', label: 'Chat', icon: IconChat },
  { key: 'settings', label: 'Settings', icon: IconSettings },
];

export function Sidebar({
  page,
  onNavigate,
  open,
  onClose,
  live,
}: {
  page: PageKey;
  onNavigate: (p: PageKey) => void;
  open: boolean;
  onClose: () => void;
  live: boolean | null;
}) {
  const [user, setUser] = useState<{ name: string; role: string; mode: string } | null>(null);

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, [live]);

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-brand" onClick={() => onNavigate('dashboard')}>
        <span className="brand-mark" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="5" r="2.6" fill="currentColor" />
            <circle cx="5" cy="19" r="2.6" fill="#3a3f52" />
            <circle cx="19" cy="19" r="2.6" fill="#3a3f52" />
            <path d="M12 7.6v4.2M12 11.8l-7 7.2M12 11.8l7 7.2" stroke="#525a75" strokeWidth="1.4" />
          </svg>
        </span>
        <span className="brand-text">
          <strong>Agentic AI</strong>
          <small>Marketing &amp; Sales</small>
        </span>
      </div>

      <nav className="side-nav" aria-label="Main">
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
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

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
      </div>
    </aside>
  );
}
