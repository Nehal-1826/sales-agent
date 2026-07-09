import {
  LayoutDashboard,
  Inbox,
  Activity,
  BarChart3,
  Wrench,
  FileText,
  Contact,
  Users,
  CreditCard,
  Settings,
  Network,
  GitBranch,
  LineChart,
  Sparkles,
  ScrollText,
  HeartPulse,
  Wallet,
  Package,
  Flame,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

/** Client sidebar — spec §5.1 order, plus the CRM add-on after Reports. */
export const CLIENT_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Mailboxes', to: '/app/mailboxes', icon: Inbox },
  { label: 'Email Activity', to: '/app/activity', icon: Activity },
  { label: 'Stats', to: '/app/analytics', icon: BarChart3 },
  { label: 'Tools', to: '/app/tools', icon: Wrench },
  { label: 'Reports', to: '/app/reports', icon: FileText },
  { label: 'Leads', to: '/app/crm', icon: Contact },
  { label: 'Workspace', to: '/app/workspace', icon: Users },
  { label: 'Billing', to: '/app/billing', icon: CreditCard },
  { label: 'Settings', to: '/app/settings', icon: Settings },
];

/** A cluster of admin nav items shown under one uppercase header. */
export interface NavGroup {
  group: string;
  items: NavItem[];
}

/** Admin navigation — 13 sections in 4 clusters (rebuild). */
export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Platform Stats', to: '/admin/platform-analytics', icon: LineChart },
      { label: 'System Status', to: '/admin/system-health', icon: HeartPulse },
    ],
  },
  {
    group: 'Email Network',
    items: [
      { label: 'Test Accounts', to: '/admin/peer-inboxes', icon: Network },
      { label: 'Account Routing', to: '/admin/pool-routing', icon: GitBranch },
      { label: 'AI Usage', to: '/admin/llm-usage', icon: Sparkles },
    ],
  },
  {
    group: 'Customers & money',
    items: [
      { label: 'Users', to: '/admin/users', icon: Users },
      { label: 'Retention', to: '/admin/revenge', icon: Flame },
      { label: 'Leads', to: '/admin/crm', icon: Contact },
      { label: 'Plans & Pricing', to: '/admin/plans', icon: CreditCard },
      { label: 'Add-ons', to: '/admin/addons', icon: Package },
      { label: 'Billing', to: '/admin/billing', icon: Wallet },
    ],
  },
  {
    group: 'Management',
    items: [
      { label: 'Reports', to: '/admin/reports', icon: FileText },
      { label: 'Activity Log', to: '/admin/audit-log', icon: ScrollText },
      { label: 'Settings', to: '/admin/settings', icon: Settings },
    ],
  },
];

/** Flat list (back-compat for any consumer that imports ADMIN_NAV). */
export const ADMIN_NAV: NavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
