import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';
import { useUIStore } from '@/stores/ui';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger, TooltipProvider } from '@/components/ui/AppTooltip';
import type { NavItem } from './nav-config';

interface SidebarProps {
  items: NavItem[];
  brandLabel: string;
  brandHref: string;
}

/**
 * Fixed-left collapsible sidebar. Below 1024px it is replaced by a
 * Radix-Dialog drawer (see MobileDrawer.tsx). At all sizes the scrollbar
 * is hidden per the global rule.
 */
export function Sidebar({ items, brandLabel, brandHref }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'hidden lg:flex shrink-0 flex-col border-r border-border-muted bg-surface',
          'h-screen sticky top-0 transition-[width] duration-200 ease-out',
          sidebarCollapsed ? 'w-[72px]' : 'w-[240px]',
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-2 px-4 h-16 border-b border-border-muted">
          <NavLink
            to={brandHref}
            className="flex items-center gap-2 min-w-0 focus-ring rounded"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent shrink-0 border border-white/[0.06] shadow-glass">
              <Logo size={26} />
            </span>
            {!sidebarCollapsed && (
              <span className="truncate text-sm font-semibold">{brandLabel}</span>
            )}
          </NavLink>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 hide-scrollbar">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const link = (
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-ring',
                      isActive
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-dim hover:text-text hover:bg-surface-2',
                      sidebarCollapsed && 'justify-center px-0',
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );

              return (
                <li key={item.to}>
                  {sidebarCollapsed ? (
                    <AppTooltip>
                      <AppTooltipTrigger asChild>{link}</AppTooltipTrigger>
                      <AppTooltipContent side="right">{item.label}</AppTooltipContent>
                    </AppTooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            'mx-3 mb-3 flex items-center gap-2 rounded-lg border border-border-muted',
            'px-3 py-2 text-xs text-text-dim hover:text-text hover:bg-surface-2 focus-ring',
            sidebarCollapsed && 'justify-center',
          )}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </aside>
    </TooltipProvider>
  );
}
