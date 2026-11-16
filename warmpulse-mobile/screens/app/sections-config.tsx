import { LayoutDashboard, Inbox, Activity as ActivityIcon, BarChart3, Wrench, FileText, Settings as SettingsIcon, CreditCard, Contact, Gauge, Users, Network, HeartPulse, LineChart, GitBranch, Sparkles, Flame, Package, Wallet, ScrollText, SlidersHorizontal, Bell, type LucideIcon } from 'lucide-react-native';
import { Dashboard } from './sections/Dashboard';
import { Notifications } from './sections/Notifications';
import { Mailboxes } from './sections/Mailboxes';
import { Activity } from './sections/Activity';
import { Stats } from './sections/Stats';
import { Tools } from './sections/Tools';
import { Reports } from './sections/Reports';
import { Settings } from './sections/Settings';
import { Billing } from './sections/Billing';
import { Leads } from './sections/Leads';
import { AdminOverview } from './sections/admin/AdminOverview';
import { AdminUsers } from './sections/admin/AdminUsers';
import { AdminPeers } from './sections/admin/AdminPeers';
import { AdminHealth } from './sections/admin/AdminHealth';
import { AdminAnalytics } from './sections/admin/AdminAnalytics';
import { AdminRouting } from './sections/admin/AdminRouting';
import { AdminLlm } from './sections/admin/AdminLlm';
import { AdminRetention } from './sections/admin/AdminRetention';
import { AdminLeads } from './sections/admin/AdminLeads';
import { AdminPlans } from './sections/admin/AdminPlans';
import { AdminAddons } from './sections/admin/AdminAddons';
import { AdminPayments } from './sections/admin/AdminPayments';
import { AdminReports } from './sections/admin/AdminReports';
import { AdminAudit } from './sections/admin/AdminAudit';
import { AdminSettings2 } from './sections/admin/AdminSettings2';

export type SectionKey =
  | 'dashboard' | 'mailboxes' | 'activity' | 'stats' | 'tools' | 'reports' | 'leads' | 'settings' | 'billing' | 'notifications'
  | 'admin-overview' | 'admin-analytics' | 'admin-users' | 'admin-peers' | 'admin-routing' | 'admin-llm'
  | 'admin-retention' | 'admin-leads' | 'admin-plans' | 'admin-addons' | 'admin-payments'
  | 'admin-reports' | 'admin-audit' | 'admin-health' | 'admin-settings';

export type SectionDef = {
  key: SectionKey;
  label: string;
  /** i18n key for the label (lib/i18n). Falls back to `label` when absent. */
  labelKey?: string;
  Icon: LucideIcon;
  Component: () => React.JSX.Element;
  /** Minimum plan tier to see this section (0=Starter,1=Pro,2=ProPlus,3=Agency). */
  minTier?: number;
};

export const SECTIONS: SectionDef[] = [
  { key: 'dashboard', label: 'Dashboard', labelKey: 'nav.dashboard', Icon: LayoutDashboard, Component: Dashboard },
  { key: 'mailboxes', label: 'Mailboxes', labelKey: 'nav.mailboxes', Icon: Inbox, Component: Mailboxes },
  { key: 'activity', label: 'Activity', labelKey: 'nav.activity', Icon: ActivityIcon, Component: Activity },
  { key: 'stats', label: 'Stats', labelKey: 'nav.stats', Icon: BarChart3, Component: Stats },
  { key: 'tools', label: 'Tools', labelKey: 'nav.tools', Icon: Wrench, Component: Tools },
  { key: 'reports', label: 'Reports', labelKey: 'nav.reports', Icon: FileText, Component: Reports },
  // Leads / CRM is a Pro Plus & Agency feature.
  { key: 'leads', label: 'Leads', labelKey: 'nav.leads', Icon: Contact, Component: Leads, minTier: 2 },
  { key: 'notifications', label: 'Notifications', labelKey: 'nav.notifications', Icon: Bell, Component: Notifications },
  { key: 'billing', label: 'Billing', labelKey: 'nav.billing', Icon: CreditCard, Component: Billing },
  { key: 'settings', label: 'Settings', labelKey: 'nav.settings', Icon: SettingsIcon, Component: Settings },
];

/** Platform admin sections — super_admin only, a distinct nav set. */
export const ADMIN_SECTIONS: SectionDef[] = [
  { key: 'admin-overview', label: 'Overview', Icon: Gauge, Component: AdminOverview },
  { key: 'notifications', label: 'Notifications', labelKey: 'nav.notifications', Icon: Bell, Component: Notifications },
  { key: 'admin-analytics', label: 'Platform Stats', Icon: LineChart, Component: AdminAnalytics },
  { key: 'admin-peers', label: 'Peer Inboxes', Icon: Network, Component: AdminPeers },
  { key: 'admin-routing', label: 'Account Routing', Icon: GitBranch, Component: AdminRouting },
  { key: 'admin-llm', label: 'AI Usage', Icon: Sparkles, Component: AdminLlm },
  { key: 'admin-users', label: 'Users', Icon: Users, Component: AdminUsers },
  { key: 'admin-retention', label: 'Retention', Icon: Flame, Component: AdminRetention },
  { key: 'admin-leads', label: 'Leads', Icon: Contact, Component: AdminLeads },
  { key: 'admin-plans', label: 'Plans & Pricing', Icon: CreditCard, Component: AdminPlans },
  { key: 'admin-addons', label: 'Add-ons', Icon: Package, Component: AdminAddons },
  { key: 'admin-payments', label: 'Payments', Icon: Wallet, Component: AdminPayments },
  { key: 'admin-reports', label: 'Reports', Icon: FileText, Component: AdminReports },
  { key: 'admin-audit', label: 'Activity Log', Icon: ScrollText, Component: AdminAudit },
  { key: 'admin-health', label: 'System Health', Icon: HeartPulse, Component: AdminHealth },
  { key: 'admin-settings', label: 'Platform Settings', Icon: SlidersHorizontal, Component: AdminSettings2 },
];

/**
 * Sections for the signed-in user. A super_admin gets the admin nav set;
 * everyone else gets the client sections filtered by plan tier.
 */
export function sectionsFor(tier: number, isAdmin: boolean): SectionDef[] {
  if (isAdmin) return ADMIN_SECTIONS;
  return SECTIONS.filter((s) => (s.minTier ?? 0) <= tier);
}
