import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';

const TABS: Array<{ to: string; label: string }> = [
  { to: '/app/tools/placement', label: 'Inbox Test' },
  { to: '/app/tools/spam', label: 'Spam Scanner' },
  { to: '/app/tools/templates', label: 'Template Designer' },
  { to: '/app/tools/preview', label: 'Warmup Preview' },
];

export function ToolsNav() {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Tools sub-navigation">
      {TABS.map((t) => {
        const active = pathname === t.to || pathname.startsWith(`${t.to}/`);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              'inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors',
              active
                ? 'border-accent bg-accent/10 text-accent font-semibold'
                : 'border-border-muted bg-surface text-text-dim hover:bg-surface-2 hover:text-text',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
