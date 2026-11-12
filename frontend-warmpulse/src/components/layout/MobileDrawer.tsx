import { NavLink } from 'react-router-dom';
import { Menu, Zap } from 'lucide-react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogTrigger,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { cn } from '@/lib/cn';
import type { NavItem } from './nav-config';

interface MobileDrawerProps {
  items: NavItem[];
  brandLabel: string;
}

/** Under 1024px the sidebar becomes a Radix-Dialog drawer. */
export function MobileDrawer({ items, brandLabel }: MobileDrawerProps) {
  return (
    <AppDialog>
      <AppDialogTrigger asChild>
        <button
          type="button"
          className="lg:hidden flex items-center justify-center h-10 w-10 rounded-lg border border-border-muted bg-surface text-text focus-ring"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
      </AppDialogTrigger>
      <AppDialogContent
        className="left-0 top-0 translate-x-0 translate-y-0 h-full w-[280px] max-w-[80vw] rounded-none rounded-r-xl"
        showClose
      >
        <AppDialogTitle className="sr-only">Main navigation</AppDialogTitle>
        <div className="flex items-center gap-2 pb-4 border-b border-border-muted">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
            <Zap className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">{brandLabel}</span>
        </div>
        <nav className="mt-3">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-accent/10 text-accent'
                          : 'text-text-dim hover:text-text hover:bg-surface-2',
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </AppDialogContent>
    </AppDialog>
  );
}
