import { useEffect, useState } from 'react';
import { getBackendHealth } from '../lib/api';
import { IconDatabase, IconPlug, IconUser } from './icons';

function IconJson({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 4c-2.5 0-2.5 4-2.5 6s0 6-2.5 6M8 4c2.5 0 2.5 4 2.5 6s0 6 2.5 6M16 4c-2.5 0-2.5 4-2.5 6s0 6-2.5 6" transform="translate(3.5 2)" />
      <path d="M18.5 3.5v4M21.5 5.5h-6" transform="translate(0 0)" />
    </svg>
  );
}

function IconLink({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 14a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" />
    </svg>
  );
}

const ICONS = {
  api: IconPlug,
  data: IconJson,
  database: IconDatabase,
  endpoints: IconLink,
  auth: IconUser,
} as const;

/**
 * Backend status — live when Django is running, placeholders otherwise.
 * Mirrors the Python architecture: Django · JSON · PostgreSQL · endpoints ·
 * CORS · users & roles.
 */
export function StatusStrip({ live }: { live: boolean | null }) {
  const [health, setHealth] = useState<{ database?: string; user?: { username: string; role: string } } | null>(null);

  useEffect(() => {
    if (live !== true) return;
    getBackendHealth().then((h) => {
      if (h.live) setHealth({ database: h.database, user: h.user });
    });
  }, [live]);

  const cells = live
    ? [
        { key: 'api', label: 'Backend API', ok: true, detail: 'Django — responding' },
        {
          key: 'data',
          label: 'JSON / Data schema',
          ok: true,
          detail: 'Live JSON from Django REST framework',
        },
        {
          key: 'database',
          label: 'Database',
          ok: health?.database === 'connected',
          detail: health?.database === 'connected' ? 'Connected — see DATABASE_URL' : 'Connection error',
        },
        {
          key: 'endpoints',
          label: 'API endpoints',
          ok: true,
          detail: 'Serving /leads · /potential · /replies · /agents · /chat · /settings',
        },
        {
          key: 'auth',
          label: 'Users / roles',
          ok: !!health?.user,
          detail: health?.user
            ? `Authenticated: ${health.user.username} (${health.user.role}) · roles: Owner / Admin / Member`
            : 'Token auth available · roles: Owner / Admin / Member',
        },
      ]
    : [
        { key: 'api', label: 'Backend API', ok: false, detail: 'Django — start with: cd backend && python manage.py runserver' },
        { key: 'data', label: 'JSON / Data schema', ok: false, detail: 'Mock JSON payloads — schema mapped for PostgreSQL' },
        { key: 'database', label: 'Database', ok: false, detail: 'PostgreSQL — configured via DATABASE_URL' },
        { key: 'endpoints', label: 'API endpoints', ok: false, detail: '/api/leads · /potential · /replies · /agents · /chat · /settings' },
        { key: 'auth', label: 'Users / roles', ok: false, detail: 'Mock session — roles: Owner, Admin, Member' },
      ];

  return (
    <div className="status-strip panel">
      <div className="panel-head">
        <span className="section-label">System — Python backend</span>
        <span className="panel-note">
          {live ? 'Django · DRF · JSON · PostgreSQL · CORS · users & roles — live' : 'Django / Flask / FastAPI · JSON schema · PostgreSQL / MongoDB · CORS · users & roles'}
        </span>
      </div>
      <div className="status-grid">
        {cells.map((cell) => {
          const Icon = ICONS[cell.key as keyof typeof ICONS];
          return (
            <div className="status-cell" key={cell.key}>
              <div className="status-cell-head">
                <Icon />
                <span className={`status-dot ${cell.ok ? 'dot-success' : 'dot-gray'}`} aria-hidden />
              </div>
              <strong>{cell.label}</strong>
              <small>{cell.detail}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
