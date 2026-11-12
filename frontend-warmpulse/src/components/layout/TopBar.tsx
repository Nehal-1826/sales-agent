import { Bell, ChevronDown, LogOut, User as UserIcon, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useNotificationsInbox } from '@/features/notifications/api';
import { MobileDrawer } from './MobileDrawer';
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownLabel,
  AppDropdownSeparator,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import { Button } from '@/components/ui/Button';
import { RefreshButton } from '@/components/ui/RefreshButton';
import type { NavItem } from './nav-config';

interface TopBarProps {
  navItems: NavItem[];
  brandLabel: string;
  showWorkspaceSwitcher?: boolean;
}

export function TopBar({ navItems, brandLabel, showWorkspaceSwitcher = true }: TopBarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'WP';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-muted bg-bg/80 px-4 backdrop-blur">
      <MobileDrawer items={navItems} brandLabel={brandLabel} />

      {showWorkspaceSwitcher ? (
        <button
          type="button"
          className="hidden sm:flex items-center gap-2 rounded-lg border border-border-muted bg-surface px-3 h-10 text-sm text-text hover:bg-surface-2 focus-ring"
        >
          <Building2 className="h-4 w-4 text-text-dim" />
          <span className="truncate max-w-[180px]">
            {user?.workspace_id ? 'My Workspace' : 'Default'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-text-dim" />
        </button>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <RefreshButton
          iconOnly
          size="icon"
          label="Refresh this page"
        />

        <NotificationsBell onClick={() => navigate('/app/notifications')} />

        <AppDropdown>
          <AppDropdownTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface px-2 h-10 focus-ring hover:bg-surface-2"
              aria-label="User menu"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-semibold">
                {initials}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-text-dim" />
            </button>
          </AppDropdownTrigger>
          <AppDropdownContent align="end" className="w-56">
            <AppDropdownLabel>
              {user?.email ?? 'Not signed in'}
            </AppDropdownLabel>
            <AppDropdownSeparator />
            <AppDropdownItem onSelect={() => navigate('/app/settings')}>
              <UserIcon className="h-4 w-4" />
              Profile & settings
            </AppDropdownItem>
            <AppDropdownSeparator />
            <AppDropdownItem danger onSelect={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sign out
            </AppDropdownItem>
          </AppDropdownContent>
        </AppDropdown>
      </div>
    </header>
  );
}


/**
 * Bell icon with an unread-count badge. Polls /workspace/notifications-inbox
 * every 60s to keep the badge fresh; the inbox page itself triggers a
 * cache invalidation on mark-read so the badge updates instantly there.
 */
function NotificationsBell({ onClick }: { onClick: () => void }) {
  const inbox = useNotificationsInbox({ pollMs: 60_000 });
  const unread = inbox.data?.unread ?? 0;
  const label = unread > 0 ? `Notifications (${unread} unread)` : 'Notifications';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      className="relative"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-bg"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Button>
  );
}
