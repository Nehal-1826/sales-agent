/**
 * Demo data for Pro Settings picker.
 * Shared across all 6 variants — keep field names stable.
 */
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Bell,
  Database,
  Palette,
  Plug,
  Shield,
  User,
} from 'lucide-react';

export type CatKey =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'integrations'
  | 'appearance'
  | 'data';

export interface Category {
  key: CatKey;
  name: string;
  desc: string;
  Icon: LucideIcon;
  tone: 'violet' | 'cyan' | 'green' | 'yellow' | 'pink' | 'red';
  // How many "settings rows" this category has, plus an item status summary
  count: number;
  status: 'ok' | 'attention' | 'warning';
  statusLabel: string;
}

export const CATEGORIES: Category[] = [
  {
    key: 'profile',
    name: 'Workspace profile',
    desc: 'Name, slug, timezone, brand color, default sender',
    Icon: User,
    tone: 'violet',
    count: 6,
    status: 'ok',
    statusLabel: 'All set',
  },
  {
    key: 'security',
    name: 'Security & access',
    desc: '2FA, SSO, IP allow-list, active sessions',
    Icon: Shield,
    tone: 'cyan',
    count: 5,
    status: 'attention',
    statusLabel: '2FA recommended for 2 members',
  },
  {
    key: 'notifications',
    name: 'Notifications',
    desc: 'Email, in-app, weekly digest, mention alerts',
    Icon: Bell,
    tone: 'yellow',
    count: 8,
    status: 'ok',
    statusLabel: '5 channels active',
  },
  {
    key: 'integrations',
    name: 'Integrations',
    desc: 'Slack, Zapier, custom webhooks, calendar sync',
    Icon: Plug,
    tone: 'green',
    count: 6,
    status: 'ok',
    statusLabel: '3 connected',
  },
  {
    key: 'appearance',
    name: 'Appearance',
    desc: 'Theme, accent color, density, language',
    Icon: Palette,
    tone: 'pink',
    count: 4,
    status: 'ok',
    statusLabel: 'Dark + violet accent',
  },
  {
    key: 'data',
    name: 'Data & privacy',
    desc: 'Export, retention, delete workspace, GDPR',
    Icon: Database,
    tone: 'red',
    count: 5,
    status: 'warning',
    statusLabel: 'Danger zone',
  },
];

// ── PROFILE ───────────────────────────────────────────────────────
export const PROFILE = {
  workspaceName: 'Acme · WarmPulse',
  slug: 'acme',
  defaultSender: 'alex@acme.com',
  timezone: 'Asia/Kolkata · UTC+5:30',
  brandColor: '#F26522',
  defaultLanguage: 'English (India)',
  weekStart: 'Monday',
};

export const TIMEZONES = [
  'Asia/Kolkata · UTC+5:30',
  'Asia/Singapore · UTC+8:00',
  'Europe/London · UTC+0:00',
  'America/New_York · UTC−5:00',
  'America/Los_Angeles · UTC−8:00',
];

// ── SECURITY ──────────────────────────────────────────────────────
export interface SecurityItem {
  key: string;
  label: string;
  status: 'enabled' | 'disabled' | 'partial';
  detail: string;
  Icon: LucideIcon;
}

export const SECURITY_ITEMS: SecurityItem[] = [
  { key: '2fa',     label: 'Two-factor authentication', status: 'partial',  detail: '4 of 6 members enrolled', Icon: Shield },
  { key: 'sso',     label: 'Single sign-on (SAML)',     status: 'disabled', detail: 'Available on Agency tier', Icon: Shield },
  { key: 'ip',      label: 'IP allow-list',             status: 'enabled',  detail: '3 ranges whitelisted',     Icon: Shield },
  { key: 'session', label: 'Session timeout',           status: 'enabled',  detail: 'Auto sign-out after 30 days', Icon: Shield },
  { key: 'audit',   label: 'Audit log retention',       status: 'enabled',  detail: '90 days · Pro tier',      Icon: Shield },
];

export interface ActiveSession {
  id: string;
  device: string;
  os: string;
  city: string;
  ip: string;
  lastActiveRel: string;
  isCurrent: boolean;
}

export const SESSIONS: ActiveSession[] = [
  { id: 's1', device: 'MacBook Pro · Chrome 124',  os: 'macOS 14.5',   city: 'Bengaluru · IN',      ip: '49.205.x.x',   lastActiveRel: 'Active now', isCurrent: true },
  { id: 's2', device: 'iPhone 15 · Safari',         os: 'iOS 17.4',     city: 'Bengaluru · IN',      ip: '49.205.x.x',   lastActiveRel: '12m ago',     isCurrent: false },
  { id: 's3', device: 'Windows 11 · Edge',          os: 'Windows 11',   city: 'Mumbai · IN',          ip: '203.196.x.x',  lastActiveRel: '4h ago',      isCurrent: false },
  { id: 's4', device: 'iPad Pro · Safari',          os: 'iPadOS 17.4',  city: 'Goa · IN',             ip: '116.50.x.x',   lastActiveRel: '2d ago',      isCurrent: false },
];

// ── NOTIFICATIONS ─────────────────────────────────────────────────
export interface NotificationPref {
  key: string;
  label: string;
  desc: string;
  email: boolean;
  inApp: boolean;
  push: boolean;
}

export const NOTIFICATION_PREFS: NotificationPref[] = [
  { key: 'mailbox_paused',  label: 'Mailbox paused',           desc: 'When a mailbox is paused by you or by system due to issues',  email: true,  inApp: true,  push: true  },
  { key: 'bounce_spike',    label: 'Bounce spike detected',    desc: 'Real-time alert when bounce rate exceeds threshold',          email: true,  inApp: true,  push: true  },
  { key: 'peer_failed',     label: 'Peer inbox failures',      desc: 'Peer inbox failing repeatedly · auto-rotated',                email: false, inApp: true,  push: false },
  { key: 'weekly_digest',   label: 'Weekly reputation digest', desc: 'Every Monday at 9am · 7-day summary per mailbox',             email: true,  inApp: false, push: false },
  { key: 'invoice_paid',    label: 'Invoice paid',             desc: 'Receipt every month after successful payment',                email: true,  inApp: true,  push: false },
  { key: 'invoice_failed',  label: 'Payment failed',           desc: 'Immediate alert if payment method fails',                     email: true,  inApp: true,  push: true  },
  { key: 'member_invited',  label: 'Member invited / joined',  desc: 'When a workspace member is invited or accepts',               email: true,  inApp: true,  push: false },
  { key: 'product_updates', label: 'Product changelog',        desc: 'Monthly product updates · feature launches',                  email: false, inApp: true,  push: false },
];

// ── INTEGRATIONS ──────────────────────────────────────────────────
export interface Integration {
  key: string;
  name: string;
  desc: string;
  status: 'connected' | 'available' | 'beta';
  brand: 'slack' | 'zapier' | 'webhook' | 'calendar' | 'hubspot' | 'salesforce';
  meta?: string;
}

export const INTEGRATIONS: Integration[] = [
  { key: 'slack',      name: 'Slack',         desc: 'Post warmup digests + bounce alerts to channels',     status: 'connected', brand: 'slack',      meta: '#warmpulse-alerts · 2 channels' },
  { key: 'zapier',     name: 'Zapier',        desc: '5,000+ app automations via Zapier triggers',          status: 'connected', brand: 'zapier',     meta: '3 zaps active'                  },
  { key: 'webhook',    name: 'Custom webhooks', desc: 'POST every warmup event to your endpoint',          status: 'connected', brand: 'webhook',    meta: '2 endpoints · 824 events / mo'  },
  { key: 'calendar',   name: 'Calendar sync', desc: 'Block mailbox sends during meeting windows',          status: 'available', brand: 'calendar',   meta: 'Google · Outlook · iCal'        },
  { key: 'hubspot',    name: 'HubSpot',       desc: 'Pause warmup when contact replies in HubSpot CRM',    status: 'beta',      brand: 'hubspot',    meta: 'Beta · request access'          },
  { key: 'salesforce', name: 'Salesforce',    desc: 'Sync sender reputation back to lead score',           status: 'available', brand: 'salesforce', meta: 'Enterprise edition'             },
];

// ── APPEARANCE ────────────────────────────────────────────────────
export const THEMES = [
  { key: 'light',  label: 'Light',     swatch: '#f4f5f9' },
  { key: 'dark',   label: 'Dark',      swatch: '#161823' },
  { key: 'auto',   label: 'System',    swatch: 'linear-gradient(90deg, #f4f5f9 0%, #f4f5f9 50%, #161823 50%, #161823 100%)' },
] as const;

export const ACCENT_COLORS = [
  { key: 'violet',  hex: '#F26522', label: 'Violet (default)' },
  { key: 'blue',    hex: '#FF8A4B', label: 'Blue' },
  { key: 'green',   hex: '#3ddc97', label: 'Green' },
  { key: 'pink',    hex: '#F26522', label: 'Pink' },
  { key: 'amber',   hex: '#ffb454', label: 'Amber' },
];

export const DENSITIES = ['Compact', 'Comfortable', 'Spacious'] as const;
export const LANGUAGES = ['English (India)', 'English (US)', 'Hindi', 'Tamil', 'Bengali', 'Marathi'] as const;

// ── DATA & PRIVACY ────────────────────────────────────────────────
export interface DataAction {
  key: string;
  label: string;
  desc: string;
  tone: 'info' | 'warn' | 'danger';
  cta: string;
}

export const DATA_ACTIONS: DataAction[] = [
  { key: 'export',     label: 'Export workspace data',    desc: 'Full archive · all warmup logs, reports, audit trail (CSV + JSON)', tone: 'info',   cta: 'Request export' },
  { key: 'retention',  label: 'Log retention window',     desc: 'Currently 90 days · Pro tier · controls how long warmup_logs are kept', tone: 'info', cta: 'Change to 180 days' },
  { key: 'gdpr',       label: 'GDPR data request',       desc: 'Erase a specific user / contact from all warmup data',              tone: 'warn',   cta: 'Submit request' },
  { key: 'transfer',   label: 'Transfer workspace',      desc: 'Transfer ownership to another verified user',                       tone: 'warn',   cta: 'Start transfer' },
  { key: 'delete',     label: 'Delete workspace',        desc: 'Permanently delete this workspace and all data · cannot be undone',  tone: 'danger', cta: 'Delete workspace' },
];

export const DANGER_ICON = AlertTriangle;

// ── SEARCH HELPERS (for S3 command palette) ───────────────────────
export interface SearchableSetting {
  key: string;
  cat: CatKey;
  label: string;
  hint: string;
  shortcut?: string;
}

export const SEARCHABLE: SearchableSetting[] = [
  { key: 'name',      cat: 'profile',       label: 'Change workspace name',         hint: 'Update display name and slug',           shortcut: 'g p n' },
  { key: 'tz',        cat: 'profile',       label: 'Change timezone',               hint: 'All schedule windows use this zone',     shortcut: 'g p t' },
  { key: 'brand',     cat: 'profile',       label: 'Brand color',                   hint: 'Used for white-label reports',           shortcut: 'g p b' },
  { key: '2fa',       cat: 'security',      label: 'Enable two-factor auth',        hint: 'TOTP app required',                      shortcut: 'g s f' },
  { key: 'ip',        cat: 'security',      label: 'Manage IP allow-list',          hint: '3 ranges currently whitelisted'        },
  { key: 'sessions',  cat: 'security',      label: 'Sign out other sessions',       hint: '3 other devices currently signed in'   },
  { key: 'digest',    cat: 'notifications', label: 'Weekly digest email',           hint: 'Mondays at 9am · enabled'              },
  { key: 'bounce',    cat: 'notifications', label: 'Bounce-spike alerts',           hint: 'Real-time email + push'                },
  { key: 'slack',     cat: 'integrations',  label: 'Connect Slack',                 hint: 'Already connected · 2 channels'        },
  { key: 'webhook',   cat: 'integrations',  label: 'Add custom webhook',            hint: '2 endpoints active · 824 events / mo'  },
  { key: 'theme',     cat: 'appearance',    label: 'Switch theme',                  hint: 'Light / Dark / System',                shortcut: 'g a t' },
  { key: 'accent',    cat: 'appearance',    label: 'Change accent color',           hint: '5 presets · currently violet'          },
  { key: 'export',    cat: 'data',          label: 'Export workspace data',         hint: 'CSV + JSON archive · email when ready' },
  { key: 'delete',    cat: 'data',          label: 'Delete workspace',              hint: 'Danger · permanent · cannot be undone' },
];
